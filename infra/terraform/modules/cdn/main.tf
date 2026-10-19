# CloudFront in front of everything.
#
#   /_next/static/*  -> S3 (hashed, immutable assets uploaded by CI; old
#                       versions are kept so rolling deploys never 404)
#   /admin*          -> ALB, never cached, all headers/cookies forwarded
#   /api/*           -> ALB, never cached
#   everything else  -> ALB, cached per the origin's Cache-Control
#                       (public pages send s-maxage=300, see next.config.ts)
#
# The ALB is internal and reached through a CloudFront VPC origin over HTTP
# inside AWS. Once a custom domain + ACM certificate exist, move to HTTPS by
# adding a *second* aws_cloudfront_vpc_origin (https-only, different name),
# pointing the distribution at it, then deleting this one in a later apply:
# a VPC origin cannot be edited while a distribution uses it.

data "aws_caller_identity" "current" {}

locals {
  # AWS managed policies (stable IDs).
  cache_policy_caching_optimized              = "658327ea-f89d-4fab-a63d-7e88639e58f6"
  cache_policy_caching_disabled               = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad"
  origin_request_policy_all_viewer            = "216adef6-5c7f-47e4-b989-5492eafa07d3"
  origin_request_policy_all_viewer_and_cf_hdr = "33f36d7e-f396-46d9-90e0-52428a34d9dc"
  use_custom_certificate                      = var.acm_certificate_arn != null
}

# ---- static assets bucket ------------------------------------------------

resource "aws_s3_bucket" "static" {
  bucket        = "${var.name}-static-${data.aws_caller_identity.current.account_id}"
  force_destroy = var.force_destroy
}

resource "aws_s3_bucket_ownership_controls" "static" {
  bucket = aws_s3_bucket.static.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_public_access_block" "static" {
  bucket                  = aws_s3_bucket.static.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "static" {
  bucket = aws_s3_bucket.static.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_cloudfront_origin_access_control" "static" {
  name                              = "${var.name}-static"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

data "aws_iam_policy_document" "static" {
  statement {
    sid       = "CloudFrontRead"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.static.arn}/*"]
    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.this.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "static" {
  bucket = aws_s3_bucket.static.id
  policy = data.aws_iam_policy_document.static.json
}

# ---- origin for the internal ALB ------------------------------------------

resource "aws_cloudfront_vpc_origin" "alb" {
  vpc_origin_endpoint_config {
    name                   = "${var.name}-alb"
    arn                    = var.alb_arn
    http_port              = 80
    https_port             = 443
    origin_protocol_policy = "http-only"

    origin_ssl_protocols {
      items    = ["TLSv1.2"]
      quantity = 1
    }
  }
}

# ---- cache / origin request policies for Next.js pages --------------------

# TTL comes from the origin's Cache-Control (min 0 so private/no-store is
# respected). Every query string is in the key because Next.js puts the RSC
# variant hash in ?_rsc=...; the rsc/prefetch headers are keyed too so an RSC
# request can never be served cached HTML (or the reverse).
resource "aws_cloudfront_cache_policy" "pages" {
  name        = "${var.name}-pages"
  min_ttl     = 0
  default_ttl = 0
  max_ttl     = 31536000

  parameters_in_cache_key_and_forwarded_to_origin {
    enable_accept_encoding_brotli = true
    enable_accept_encoding_gzip   = true

    cookies_config {
      cookie_behavior = "none"
    }
    headers_config {
      header_behavior = "whitelist"
      headers {
        items = ["rsc", "next-router-prefetch", "next-router-segment-prefetch"]
      }
    }
    query_strings_config {
      query_string_behavior = "all"
    }
  }
}

# Forwarded but not part of the cache key. Public pages never see cookies, so
# a page that accidentally read one could not leak a session into the cache.
resource "aws_cloudfront_origin_request_policy" "pages" {
  name = "${var.name}-pages"

  cookies_config {
    cookie_behavior = "none"
  }
  headers_config {
    header_behavior = "whitelist"
    headers {
      items = ["host", "next-router-state-tree", "next-url"]
    }
  }
  query_strings_config {
    query_string_behavior = "all"
  }
}

# ---- distribution ---------------------------------------------------------

resource "aws_cloudfront_distribution" "this" {
  enabled         = true
  comment         = var.name
  is_ipv6_enabled = true
  http_version    = "http2and3"
  price_class     = var.price_class
  aliases         = var.aliases
  web_acl_id      = var.enable_waf ? aws_wafv2_web_acl.this[0].arn : null

  origin {
    origin_id   = "alb"
    domain_name = var.alb_dns_name

    vpc_origin_config {
      vpc_origin_id            = aws_cloudfront_vpc_origin.alb.id
      origin_keepalive_timeout = 5
      origin_read_timeout      = 30
    }
  }

  origin {
    origin_id                = "static"
    domain_name              = aws_s3_bucket.static.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.static.id
  }

  default_cache_behavior {
    target_origin_id         = "alb"
    viewer_protocol_policy   = "redirect-to-https"
    allowed_methods          = ["GET", "HEAD", "OPTIONS"]
    cached_methods           = ["GET", "HEAD"]
    cache_policy_id          = aws_cloudfront_cache_policy.pages.id
    origin_request_policy_id = aws_cloudfront_origin_request_policy.pages.id
    compress                 = true
  }

  ordered_cache_behavior {
    path_pattern           = "/_next/static/*"
    target_origin_id       = "static"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    cache_policy_id        = local.cache_policy_caching_optimized
    compress               = true
  }

  # Admin pages and their Server Action POSTs. Host is forwarded so Next.js'
  # Origin-vs-Host CSRF check passes; CloudFront-Viewer-Address gives the app
  # the real client IP for login rate limiting.
  ordered_cache_behavior {
    path_pattern             = "/admin*"
    target_origin_id         = "alb"
    viewer_protocol_policy   = "redirect-to-https"
    allowed_methods          = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods           = ["GET", "HEAD"]
    cache_policy_id          = local.cache_policy_caching_disabled
    origin_request_policy_id = local.origin_request_policy_all_viewer_and_cf_hdr
    compress                 = true
  }

  ordered_cache_behavior {
    path_pattern             = "/api/*"
    target_origin_id         = "alb"
    viewer_protocol_policy   = "redirect-to-https"
    allowed_methods          = ["GET", "HEAD", "OPTIONS"]
    cached_methods           = ["GET", "HEAD"]
    cache_policy_id          = local.cache_policy_caching_disabled
    origin_request_policy_id = local.origin_request_policy_all_viewer
    compress                 = true
  }

  # Do not let a short origin outage stick in the edge cache.
  dynamic "custom_error_response" {
    for_each = [500, 502, 503, 504]
    content {
      error_code            = custom_error_response.value
      error_caching_min_ttl = 5
    }
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = local.use_custom_certificate ? null : true
    acm_certificate_arn            = local.use_custom_certificate ? var.acm_certificate_arn : null
    ssl_support_method             = local.use_custom_certificate ? "sni-only" : null
    minimum_protocol_version       = local.use_custom_certificate ? "TLSv1.2_2021" : "TLSv1"
  }
}

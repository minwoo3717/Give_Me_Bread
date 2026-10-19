output "distribution_id" {
  value = aws_cloudfront_distribution.this.id
}

output "distribution_arn" {
  value = aws_cloudfront_distribution.this.arn
}

output "domain_name" {
  value = aws_cloudfront_distribution.this.domain_name
}

output "static_bucket_name" {
  value = aws_s3_bucket.static.bucket
}

output "static_bucket_arn" {
  value = aws_s3_bucket.static.arn
}

output "web_acl_name" {
  value = var.enable_waf ? aws_wafv2_web_acl.this[0].name : null
}

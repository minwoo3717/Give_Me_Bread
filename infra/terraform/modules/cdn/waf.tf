# Edge firewall. Web ACLs for CloudFront must live in us-east-1; provider v6
# lets a single resource pick its region.
#
# Cost (pay-as-you-go): $5/ACL + $1/rule + $0.60 per 1M requests, ~$10-15/month
# at the target traffic. Set enable_waf = false to save it while practising.

locals {
  waf_rules = {
    ip_reputation = { priority = 0, group = "AWSManagedRulesAmazonIpReputationList" }
    common        = { priority = 1, group = "AWSManagedRulesCommonRuleSet" }
    # Includes protections for React Server Components / Next.js RCE classes.
    known_bad_inputs = { priority = 2, group = "AWSManagedRulesKnownBadInputsRuleSet" }
  }
}

resource "aws_wafv2_web_acl" "this" {
  count  = var.enable_waf ? 1 : 0
  region = "us-east-1"
  name   = "${var.name}-edge"
  scope  = "CLOUDFRONT"

  default_action {
    allow {}
  }

  dynamic "rule" {
    for_each = local.waf_rules
    content {
      name     = rule.value.group
      priority = rule.value.priority

      override_action {
        none {}
      }

      statement {
        managed_rule_group_statement {
          name        = rule.value.group
          vendor_name = "AWS"

          # A full recipe saved from the admin is ~15 KB of JSON, above the
          # Common Rule Set's 8 KB body limit. Count instead of block.
          dynamic "rule_action_override" {
            for_each = rule.value.group == "AWSManagedRulesCommonRuleSet" ? ["SizeRestrictions_BODY"] : []
            content {
              name = rule_action_override.value
              action_to_use {
                count {}
              }
            }
          }
        }
      }

      visibility_config {
        cloudwatch_metrics_enabled = true
        metric_name                = "${var.name}-${rule.key}"
        sampled_requests_enabled   = true
      }
    }
  }

  # Brute-force guard in front of the app's own DB-backed login throttle.
  # Counts every POST under /admin: a Server Action can be posted to any admin
  # path, so matching only /admin/login would be easy to sidestep. One real
  # admin never comes close to 30 saves in 5 minutes.
  rule {
    name     = "rate-limit-admin-posts"
    priority = 10

    action {
      block {}
    }

    statement {
      rate_based_statement {
        limit                 = 30
        evaluation_window_sec = 300
        aggregate_key_type    = "IP"

        scope_down_statement {
          and_statement {
            statement {
              byte_match_statement {
                search_string         = "POST"
                positional_constraint = "EXACTLY"
                field_to_match {
                  method {}
                }
                text_transformation {
                  priority = 0
                  type     = "NONE"
                }
              }
            }
            statement {
              byte_match_statement {
                search_string         = "/admin"
                positional_constraint = "STARTS_WITH"
                field_to_match {
                  uri_path {}
                }
                text_transformation {
                  priority = 0
                  type     = "NONE"
                }
              }
            }
          }
        }
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${var.name}-rate-admin-posts"
      sampled_requests_enabled   = true
    }
  }

  # Per-IP ceiling for page/API requests (static assets excluded). Generous
  # on purpose: a whole campus can share one NAT address.
  rule {
    name     = "rate-limit-pages"
    priority = 11

    action {
      block {}
    }

    statement {
      rate_based_statement {
        limit                 = var.waf_page_rate_limit
        evaluation_window_sec = 300
        aggregate_key_type    = "IP"

        scope_down_statement {
          not_statement {
            statement {
              byte_match_statement {
                search_string         = "/_next/static/"
                positional_constraint = "STARTS_WITH"
                field_to_match {
                  uri_path {}
                }
                text_transformation {
                  priority = 0
                  type     = "NONE"
                }
              }
            }
          }
        }
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${var.name}-rate-pages"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "${var.name}-edge"
    sampled_requests_enabled   = true
  }
}

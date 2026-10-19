variable "project" {
  type    = string
  default = "oven-note"
}

variable "environment" {
  type    = string
  default = "prod"
}

variable "region" {
  type    = string
  default = "ap-northeast-2"
}

variable "github_repository" {
  description = "GitHub repository allowed to deploy, as owner/repo."
  type        = string
}

variable "github_owner_id" {
  description = "Numeric GitHub owner (user/org) ID. Repos created after 2026-07-15 put it in the OIDC subject; pin it so a re-created repo with the same name cannot deploy. `gh api repos/OWNER/REPO --jq .owner.id`"
  type        = string
  default     = null
}

variable "github_repository_id" {
  description = "Numeric GitHub repository ID (`gh api repos/OWNER/REPO --jq .id`)."
  type        = string
  default     = null
}

variable "alarm_email" {
  description = "Receives CloudWatch alarms and budget alerts (confirm the SNS subscription email)."
  type        = string
}

variable "admin_email" {
  description = "Login email for the first admin account (created by the ops workflow)."
  type        = string
}

variable "monthly_budget_usd" {
  description = "Gross monthly spend (credits excluded) that triggers budget alerts. ~$100 at 30k page views/day, ~$200 at 100k."
  type        = number
  default     = 150
}

variable "cpu_architecture" {
  type    = string
  default = "ARM64"

  validation {
    condition     = contains(["ARM64", "X86_64"], var.cpu_architecture)
    error_message = "cpu_architecture must be ARM64 or X86_64."
  }
}

variable "web_cpu" {
  type    = number
  default = 512
}

variable "web_memory" {
  type    = number
  default = 1024
}

variable "web_min_tasks" {
  type    = number
  default = 2
}

variable "web_max_tasks" {
  type    = number
  default = 6
}

variable "db_instance_class" {
  type    = string
  default = "db.t4g.micro"
}

variable "db_multi_az" {
  description = "Standby replica in a second AZ (+~$22/month). Off for the MVP."
  type        = bool
  default     = false
}

variable "enable_waf" {
  description = "AWS WAF on CloudFront (~$10-15/month)."
  type        = bool
  default     = true
}

variable "waf_page_rate_limit" {
  description = "Max non-static requests per IP per 5 minutes before WAF blocks. Raise temporarily for load tests from one machine."
  type        = number
  default     = 3000
}

variable "deletion_protection" {
  description = "Protects RDS and the ALB from deletion and keeps destroy from emptying the static-asset bucket / ECR repo. Set false only to tear the stack down."
  type        = bool
  default     = true
}

variable "domain_aliases" {
  description = "Custom domains for CloudFront (later). Requires acm_certificate_arn."
  type        = list(string)
  default     = []
}

variable "acm_certificate_arn" {
  description = "us-east-1 ACM certificate for domain_aliases."
  type        = string
  default     = null
}

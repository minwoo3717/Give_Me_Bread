variable "name" {
  type = string
}

variable "ssm_prefix" {
  type = string
}

variable "image_tag" {
  description = "Initial value of the image-tag SSM parameter (before the first CI deploy). Later values come from CI."
  type        = string
  default     = "bootstrap"
}

variable "cpu_architecture" {
  description = "ARM64 (Graviton, ~20% cheaper) or X86_64. Must match the CI build platform."
  type        = string
  default     = "ARM64"
}

variable "web_cpu" {
  type    = number
  default = 512
}

variable "web_memory" {
  type    = number
  default = 1024
}

variable "min_tasks" {
  description = "Never below 2: one task per AZ."
  type        = number
  default     = 2
}

variable "max_tasks" {
  type    = number
  default = 6
}

variable "requests_per_task_per_minute" {
  type    = number
  default = 1200
}

variable "public_subnet_ids" {
  type = list(string)
}

variable "app_security_group_id" {
  type = string
}

variable "target_group_arn" {
  type = string
}

variable "target_group_arn_suffix" {
  type = string
}

variable "alb_arn_suffix" {
  type = string
}

variable "db_address" {
  type = string
}

variable "db_port" {
  type = number
}

variable "db_name" {
  type = string
}

variable "db_app_user" {
  type = string
}

variable "db_pool_max" {
  description = "Connections per web task. A rolling deploy can run 2 x max_tasks tasks, so 2 * max_tasks * this (+ ops) must stay below RDS max_connections (~80 on db.t4g.micro): 2 * 6 * 5 = 60."
  type        = number
  default     = 5
}

variable "db_app_password_parameter_arn" {
  type = string
}

variable "db_master_secret_arn" {
  type = string
}

variable "admin_email" {
  type = string
}

variable "cloudfront_distribution_id" {
  type = string
}

variable "cloudfront_distribution_arn" {
  type = string
}

variable "cloudfront_domain_name" {
  type = string
}

variable "site_url" {
  description = "Public origin. Defaults to https://<cloudfront domain>."
  type        = string
  default     = null
}

variable "log_retention_days" {
  type    = number
  default = 30
}

variable "force_delete_images" {
  description = "Let terraform destroy delete the ECR repository even when it holds images."
  type        = bool
  default     = false
}

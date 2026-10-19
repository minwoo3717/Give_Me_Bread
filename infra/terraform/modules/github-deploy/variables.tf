variable "name" {
  type = string
}

variable "github_repository" {
  description = "owner/repo"
  type        = string
}

variable "github_owner_id" {
  description = "Numeric owner ID for the immutable OIDC subject (optional)."
  type        = string
  default     = null
}

variable "github_repository_id" {
  description = "Numeric repository ID for the immutable OIDC subject (optional)."
  type        = string
  default     = null
}

variable "github_environment" {
  type    = string
  default = "production"
}

variable "ecr_repository_arn" {
  type = string
}

variable "cluster_name" {
  type = string
}

variable "cluster_arn" {
  type = string
}

variable "web_service_name" {
  type = string
}

variable "web_task_family" {
  type = string
}

variable "ops_task_family" {
  type = string
}

variable "passable_role_arns" {
  type = list(string)
}

variable "static_bucket_arn" {
  type = string
}

variable "cloudfront_distribution_arn" {
  type = string
}

variable "deploy_config_parameter_arn" {
  type = string
}

variable "ops_log_group" {
  type = string
}

variable "image_tag_parameter_arn" {
  type = string
}

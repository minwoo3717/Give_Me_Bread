variable "project" {
  description = "Prefix for resource names."
  type        = string
  default     = "oven-note"
}

variable "region" {
  description = "Region for the state bucket."
  type        = string
  default     = "ap-northeast-2"
}

variable "create_github_oidc_provider" {
  description = "Set to false if this AWS account already has the token.actions.githubusercontent.com provider."
  type        = bool
  default     = true
}

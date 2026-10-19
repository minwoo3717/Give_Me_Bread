variable "name" {
  type = string
}

variable "alb_arn" {
  type = string
}

variable "alb_dns_name" {
  type = string
}

variable "price_class" {
  description = "PriceClass_200 covers Korea/Japan/Asia at lower cost than PriceClass_All."
  type        = string
  default     = "PriceClass_200"
}

variable "enable_waf" {
  type    = bool
  default = true
}

variable "waf_page_rate_limit" {
  description = "Max non-static requests per IP per 5 minutes."
  type        = number
  default     = 3000
}

variable "aliases" {
  description = "Custom domain names (requires acm_certificate_arn). Empty = *.cloudfront.net only."
  type        = list(string)
  default     = []
}

variable "acm_certificate_arn" {
  description = "ACM certificate in us-east-1 covering var.aliases."
  type        = string
  default     = null
}

variable "force_destroy" {
  description = "Let terraform destroy delete the static-asset bucket even when it is not empty."
  type        = bool
  default     = false
}

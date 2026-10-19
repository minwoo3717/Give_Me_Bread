variable "name" {
  type = string
}

variable "ssm_prefix" {
  description = "SSM parameter path prefix, e.g. oven-note/prod"
  type        = string
}

variable "private_subnet_ids" {
  type = list(string)
}

variable "db_security_group_id" {
  type = string
}

variable "engine_major_version" {
  type    = string
  default = "18"
}

variable "instance_class" {
  type    = string
  default = "db.t4g.micro"
}

variable "database_name" {
  type    = string
  default = "bakery"
}

variable "allocated_storage_gb" {
  type    = number
  default = 20
}

variable "max_allocated_storage_gb" {
  description = "Storage autoscaling ceiling."
  type        = number
  default     = 100
}

variable "multi_az" {
  type    = bool
  default = false
}

variable "backup_retention_days" {
  type    = number
  default = 7
}

variable "deletion_protection" {
  type    = bool
  default = true
}

variable "log_retention_days" {
  type    = number
  default = 30
}

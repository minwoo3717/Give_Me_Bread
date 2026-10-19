variable "name" {
  type = string
}

variable "alarm_email" {
  type = string
}

variable "monthly_budget_usd" {
  type = number
}

variable "alb_arn_suffix" {
  type = string
}

variable "target_group_arn_suffix" {
  type = string
}

variable "cluster_name" {
  type = string
}

variable "service_name" {
  type = string
}

variable "service_arn" {
  type = string
}

variable "min_tasks" {
  type = number
}

variable "web_log_group" {
  type = string
}

variable "db_instance_id" {
  type = string
}

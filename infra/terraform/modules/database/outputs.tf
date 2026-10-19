output "address" {
  value = aws_db_instance.this.address
}

output "port" {
  value = aws_db_instance.this.port
}

output "database_name" {
  value = aws_db_instance.this.db_name
}

output "instance_id" {
  value = aws_db_instance.this.identifier
}

output "master_secret_arn" {
  description = "RDS-managed secret (JSON with username/password)."
  value       = aws_db_instance.this.master_user_secret[0].secret_arn
}

output "app_user" {
  value = "app_user"
}

output "app_password_parameter_arn" {
  value = aws_ssm_parameter.app_password.arn
}

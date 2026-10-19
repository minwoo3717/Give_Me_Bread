output "site_url" {
  value = module.service.site_url
}

output "github_deploy_role_arn" {
  description = "Set as the AWS_DEPLOY_ROLE_ARN variable of the GitHub 'production' environment."
  value       = module.github_deploy.role_arn
}

output "deploy_config_parameter" {
  value = aws_ssm_parameter.deploy_config.name
}

output "ecr_repository_url" {
  value = module.service.ecr_repository_url
}

output "cloudfront_distribution_id" {
  value = module.cdn.distribution_id
}

output "admin_initial_password_command" {
  description = "Prints the first admin password (change it after logging in)."
  value       = "aws ssm get-parameter --region ${var.region} --with-decryption --name ${module.service.admin_password_parameter_name} --query Parameter.Value --output text"
}

output "dashboard_url" {
  value = "https://${var.region}.console.aws.amazon.com/cloudwatch/home?region=${var.region}#dashboards/dashboard/${module.monitoring.dashboard_name}"
}

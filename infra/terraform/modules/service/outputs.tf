output "ecr_repository_url" {
  value = aws_ecr_repository.app.repository_url
}

output "ecr_repository_arn" {
  value = aws_ecr_repository.app.arn
}

output "cluster_name" {
  value = aws_ecs_cluster.this.name
}

output "cluster_arn" {
  value = aws_ecs_cluster.this.arn
}

output "web_service_name" {
  value = aws_ecs_service.web.name
}

output "web_task_family" {
  value = aws_ecs_task_definition.web.family
}

output "ops_task_family" {
  value = aws_ecs_task_definition.ops.family
}

output "web_log_group" {
  value = aws_cloudwatch_log_group.web.name
}

output "ops_log_group" {
  value = aws_cloudwatch_log_group.ops.name
}

output "passable_role_arns" {
  description = "Roles CI must be allowed to pass when registering task definitions."
  value = [
    aws_iam_role.web_execution.arn,
    aws_iam_role.web_task.arn,
    aws_iam_role.ops_execution.arn,
    aws_iam_role.ops_task.arn,
  ]
}

output "admin_password_parameter_name" {
  value = aws_ssm_parameter.admin_initial_password.name
}

output "admin_password_parameter_arn" {
  value = aws_ssm_parameter.admin_initial_password.arn
}

output "site_url" {
  value = local.site_url
}

output "web_service_arn" {
  value = aws_ecs_service.web.id
}

output "image_tag_parameter_name" {
  value = aws_ssm_parameter.image_tag.name
}

output "image_tag_parameter_arn" {
  value = aws_ssm_parameter.image_tag.arn
}

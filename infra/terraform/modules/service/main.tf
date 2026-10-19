# ECR + ECS Fargate.
#
#   web  service : Next.js server, behind the ALB, autoscaled 2..N tasks.
#   ops  task def: same image, run on demand for migrations / seed / admin
#                  bootstrap (CI and the "ops" GitHub workflow call RunTask).
#
# CI registers new task-definition revisions with the freshly built image and
# updates the service, so Terraform ignores the service's task_definition and
# desired_count. Env changes made here reach running tasks on the next Deploy.

data "aws_region" "current" {}

# Tag of the image currently deployed. CI updates the value after every
# successful deploy; Terraform only creates it. Task-definition revisions that
# Terraform registers (e.g. after an env change) therefore keep running the
# real image instead of the never-pushed "bootstrap" placeholder.
resource "aws_ssm_parameter" "image_tag" {
  name           = "/${var.ssm_prefix}/deploy/image-tag"
  description    = "Image tag of the current production deploy (written by GitHub Actions)"
  type           = "String"
  insecure_value = var.image_tag

  lifecycle {
    ignore_changes = [insecure_value]
  }
}

locals {
  region         = data.aws_region.current.region
  web_image      = "${aws_ecr_repository.app.repository_url}:${aws_ssm_parameter.image_tag.insecure_value}"
  site_url       = coalesce(var.site_url, "https://${var.cloudfront_domain_name}")
  health_command = "node -e \"fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))\""

  db_environment = [
    { name = "DB_HOST", value = var.db_address },
    { name = "DB_PORT", value = tostring(var.db_port) },
    { name = "DB_NAME", value = var.db_name },
    { name = "DB_SSL", value = "require" },
  ]
}

# ---- registry -----------------------------------------------------------

resource "aws_ecr_repository" "app" {
  name                 = var.name
  image_tag_mutability = "IMMUTABLE"
  force_delete         = var.force_delete_images

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "AES256"
  }
}

resource "aws_ecr_lifecycle_policy" "app" {
  repository = aws_ecr_repository.app.name
  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Drop untagged layers after a week"
        selection    = { tagStatus = "untagged", countType = "sinceImagePushed", countUnit = "days", countNumber = 7 }
        action       = { type = "expire" }
      },
      {
        rulePriority = 2
        description  = "Keep the last 30 images (enough to roll back)"
        selection    = { tagStatus = "any", countType = "imageCountMoreThan", countNumber = 30 }
        action       = { type = "expire" }
      },
    ]
  })
}

# ---- cluster and logs ---------------------------------------------------

resource "aws_ecs_cluster" "this" {
  name = var.name

  # Container Insights is billed per metric (~$50+/month here); the free
  # service-level CPU/memory metrics + ALB metrics are enough to start.
  setting {
    name  = "containerInsights"
    value = "disabled"
  }
}

resource "aws_cloudwatch_log_group" "web" {
  name              = "/ecs/${var.name}/web"
  retention_in_days = var.log_retention_days
}

resource "aws_cloudwatch_log_group" "ops" {
  name              = "/ecs/${var.name}/ops"
  retention_in_days = var.log_retention_days
}

# ---- secrets ------------------------------------------------------------

# Initial admin password, read by the create-admin ops task. Retrieve it with
#   aws ssm get-parameter --with-decryption --name /<prefix>/admin/initial-password
# then change it from /admin/account after the first login.
resource "random_password" "admin" {
  length  = 24
  special = false
}

resource "aws_ssm_parameter" "admin_initial_password" {
  name        = "/${var.ssm_prefix}/admin/initial-password"
  description = "Initial admin password used by the create-admin ops task"
  type        = "SecureString"
  value       = random_password.admin.result
}

# ---- task definitions -----------------------------------------------------

resource "aws_ecs_task_definition" "web" {
  family                   = "${var.name}-web"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.web_cpu
  memory                   = var.web_memory
  execution_role_arn       = aws_iam_role.web_execution.arn
  task_role_arn            = aws_iam_role.web_task.arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = var.cpu_architecture
  }

  container_definitions = jsonencode([
    {
      name         = "web"
      image        = local.web_image
      essential    = true
      portMappings = [{ containerPort = 3000, protocol = "tcp" }]
      environment = concat(local.db_environment, [
        { name = "DB_USER", value = var.db_app_user },
        { name = "DB_POOL_MAX", value = tostring(var.db_pool_max) },
        { name = "SITE_URL", value = local.site_url },
        { name = "CLOUDFRONT_DISTRIBUTION_ID", value = var.cloudfront_distribution_id },
      ])
      secrets = [
        { name = "DB_PASSWORD", valueFrom = var.db_app_password_parameter_arn },
      ]
      healthCheck = {
        command     = ["CMD-SHELL", local.health_command]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 20
      }
      # Next.js finishes in-flight requests on SIGTERM; give it time.
      stopTimeout = 30
      # Lets `aws ecs execute-command` work and reaps zombie processes.
      linuxParameters = { initProcessEnabled = true }
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.web.name
          "awslogs-region"        = local.region
          "awslogs-stream-prefix" = "web"
        }
      }
    }
  ])
}

resource "aws_ecs_task_definition" "ops" {
  family                   = "${var.name}-ops"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = aws_iam_role.ops_execution.arn
  task_role_arn            = aws_iam_role.ops_task.arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = var.cpu_architecture
  }

  container_definitions = jsonencode([
    {
      name      = "ops"
      image     = local.web_image
      essential = true
      command   = ["node", "scripts/migrate.cjs"]
      environment = concat(local.db_environment, [
        { name = "APP_DB_USER", value = var.db_app_user },
        { name = "ADMIN_EMAIL", value = var.admin_email },
      ])
      secrets = [
        { name = "DB_USER", valueFrom = "${var.db_master_secret_arn}:username::" },
        { name = "DB_PASSWORD", valueFrom = "${var.db_master_secret_arn}:password::" },
        { name = "APP_DB_PASSWORD", valueFrom = var.db_app_password_parameter_arn },
        { name = "ADMIN_PASSWORD", valueFrom = aws_ssm_parameter.admin_initial_password.arn },
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.ops.name
          "awslogs-region"        = local.region
          "awslogs-stream-prefix" = "ops"
        }
      }
    }
  ])
}

# ---- web service ----------------------------------------------------------

resource "aws_ecs_service" "web" {
  name             = "${var.name}-web"
  cluster          = aws_ecs_cluster.this.id
  task_definition  = aws_ecs_task_definition.web.arn
  desired_count    = var.min_tasks
  launch_type      = "FARGATE"
  platform_version = "LATEST"

  # Rolling deploy: start new tasks first (200%), never drop below desired
  # (100%), and roll back automatically if the new tasks keep failing.
  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200
  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }
  health_check_grace_period_seconds = 30

  enable_execute_command  = true
  enable_ecs_managed_tags = true
  propagate_tags          = "SERVICE"

  network_configuration {
    subnets          = var.public_subnet_ids
    security_groups  = [var.app_security_group_id]
    assign_public_ip = true
  }

  load_balancer {
    target_group_arn = var.target_group_arn
    container_name   = "web"
    container_port   = 3000
  }

  lifecycle {
    # CI owns the running revision; autoscaling owns the count.
    ignore_changes = [task_definition, desired_count]
  }
}

# ---- autoscaling ----------------------------------------------------------

resource "aws_appautoscaling_target" "web" {
  service_namespace  = "ecs"
  resource_id        = "service/${aws_ecs_cluster.this.name}/${aws_ecs_service.web.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  min_capacity       = var.min_tasks
  max_capacity       = var.max_tasks
}

resource "aws_appautoscaling_policy" "cpu" {
  name               = "${var.name}-web-cpu"
  service_namespace  = aws_appautoscaling_target.web.service_namespace
  resource_id        = aws_appautoscaling_target.web.resource_id
  scalable_dimension = aws_appautoscaling_target.web.scalable_dimension
  policy_type        = "TargetTrackingScaling"

  target_tracking_scaling_policy_configuration {
    target_value       = 60
    scale_out_cooldown = 60
    scale_in_cooldown  = 300
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
  }
}

resource "aws_appautoscaling_policy" "requests" {
  name               = "${var.name}-web-requests"
  service_namespace  = aws_appautoscaling_target.web.service_namespace
  resource_id        = aws_appautoscaling_target.web.resource_id
  scalable_dimension = aws_appautoscaling_target.web.scalable_dimension
  policy_type        = "TargetTrackingScaling"

  target_tracking_scaling_policy_configuration {
    # Requests per task per minute that reach the origin (CDN misses only).
    target_value       = var.requests_per_task_per_minute
    scale_out_cooldown = 60
    scale_in_cooldown  = 300
    predefined_metric_specification {
      predefined_metric_type = "ALBRequestCountPerTarget"
      resource_label         = "${var.alb_arn_suffix}/${var.target_group_arn_suffix}"
    }
  }
}

# Four roles, so each process only holds what it needs:
#   execution roles: used by the ECS agent to pull the image, ship logs and
#                    inject secrets at task start
#   task roles     : used by the code inside the container

data "aws_iam_policy_document" "ecs_tasks_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

# ECS Exec (aws ecs execute-command) for debugging a running task.
data "aws_iam_policy_document" "ecs_exec" {
  statement {
    actions = [
      "ssmmessages:CreateControlChannel",
      "ssmmessages:CreateDataChannel",
      "ssmmessages:OpenControlChannel",
      "ssmmessages:OpenDataChannel",
    ]
    resources = ["*"]
  }
}

# ---- web ------------------------------------------------------------------

resource "aws_iam_role" "web_execution" {
  name               = "${var.name}-web-execution"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_assume.json
}

resource "aws_iam_role_policy_attachment" "web_execution_managed" {
  role       = aws_iam_role.web_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

data "aws_iam_policy_document" "web_execution_secrets" {
  statement {
    actions   = ["ssm:GetParameters"]
    resources = [var.db_app_password_parameter_arn]
  }
}

resource "aws_iam_role_policy" "web_execution_secrets" {
  name   = "secrets"
  role   = aws_iam_role.web_execution.id
  policy = data.aws_iam_policy_document.web_execution_secrets.json
}

resource "aws_iam_role" "web_task" {
  name               = "${var.name}-web-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_assume.json
}

data "aws_iam_policy_document" "web_task" {
  source_policy_documents = [data.aws_iam_policy_document.ecs_exec.json]

  # Admin edits purge the CDN cache.
  statement {
    actions   = ["cloudfront:CreateInvalidation"]
    resources = [var.cloudfront_distribution_arn]
  }
}

resource "aws_iam_role_policy" "web_task" {
  name   = "app"
  role   = aws_iam_role.web_task.id
  policy = data.aws_iam_policy_document.web_task.json
}

# ---- ops ------------------------------------------------------------------

resource "aws_iam_role" "ops_execution" {
  name               = "${var.name}-ops-execution"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_assume.json
}

resource "aws_iam_role_policy_attachment" "ops_execution_managed" {
  role       = aws_iam_role.ops_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

data "aws_iam_policy_document" "ops_execution_secrets" {
  statement {
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [var.db_master_secret_arn]
  }
  statement {
    actions = ["ssm:GetParameters"]
    resources = [
      var.db_app_password_parameter_arn,
      aws_ssm_parameter.admin_initial_password.arn,
    ]
  }
}

resource "aws_iam_role_policy" "ops_execution_secrets" {
  name   = "secrets"
  role   = aws_iam_role.ops_execution.id
  policy = data.aws_iam_policy_document.ops_execution_secrets.json
}

resource "aws_iam_role" "ops_task" {
  name               = "${var.name}-ops-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_assume.json
}

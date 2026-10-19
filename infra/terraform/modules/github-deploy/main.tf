# IAM role assumed by GitHub Actions through OIDC: no long-lived AWS keys in
# GitHub. Only jobs running in the repository's "production" environment can
# assume it. In GitHub, restrict that environment to the main branch (and add
# required reviewers for a manual approval step); see docs/DEPLOY.md.

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

data "aws_iam_openid_connect_provider" "github" {
  url = "https://token.actions.githubusercontent.com"
}

locals {
  account_id = data.aws_caller_identity.current.account_id
  region     = data.aws_region.current.region
  owner      = split("/", var.github_repository)[0]
  repo       = split("/", var.github_repository)[1]
  pinned_ids = var.github_owner_id != null && var.github_repository_id != null

  # GitHub OIDC subject for jobs in the deployment environment. Repositories
  # created after 2026-07-15 use the immutable form with numeric IDs
  # (repo:OWNER@ID/REPO@ID:...). Pin the IDs when known; otherwise accept the
  # name-only form and the immutable form for this owner/repo name.
  oidc_subjects = local.pinned_ids ? [
    "repo:${local.owner}@${var.github_owner_id}/${local.repo}@${var.github_repository_id}:environment:${var.github_environment}",
    ] : [
    "repo:${var.github_repository}:environment:${var.github_environment}",
    "repo:${local.owner}@*/${local.repo}@*:environment:${var.github_environment}",
  ]
}

data "aws_iam_policy_document" "trust" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [data.aws_iam_openid_connect_provider.github.arn]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values   = local.oidc_subjects
    }
  }
}

resource "aws_iam_role" "deploy" {
  name                 = "${var.name}-github-deploy"
  assume_role_policy   = data.aws_iam_policy_document.trust.json
  max_session_duration = 3600
}

data "aws_iam_policy_document" "deploy" {
  statement {
    sid       = "EcrLogin"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }

  statement {
    sid = "EcrPushPull"
    actions = [
      "ecr:BatchCheckLayerAvailability",
      "ecr:BatchGetImage",
      "ecr:CompleteLayerUpload",
      "ecr:DescribeImages",
      "ecr:GetDownloadUrlForLayer",
      "ecr:InitiateLayerUpload",
      "ecr:PutImage",
      "ecr:UploadLayerPart",
    ]
    resources = [var.ecr_repository_arn]
  }

  # Register/Describe task definitions do not support resource-level scoping.
  statement {
    sid       = "TaskDefinitions"
    actions   = ["ecs:DescribeTaskDefinition", "ecs:RegisterTaskDefinition"]
    resources = ["*"]
  }

  statement {
    sid     = "TagOnCreate"
    actions = ["ecs:TagResource"]
    resources = [
      "arn:aws:ecs:${local.region}:${local.account_id}:task-definition/${var.web_task_family}:*",
      "arn:aws:ecs:${local.region}:${local.account_id}:task-definition/${var.ops_task_family}:*",
      "arn:aws:ecs:${local.region}:${local.account_id}:task/${var.cluster_name}/*",
    ]
    condition {
      test     = "StringEquals"
      variable = "ecs:CreateAction"
      values   = ["RegisterTaskDefinition", "RunTask"]
    }
  }

  statement {
    sid       = "DeployWebService"
    actions   = ["ecs:UpdateService", "ecs:DescribeServices"]
    resources = ["arn:aws:ecs:${local.region}:${local.account_id}:service/${var.cluster_name}/${var.web_service_name}"]
  }

  statement {
    sid       = "RunOpsTask"
    actions   = ["ecs:RunTask"]
    resources = ["arn:aws:ecs:${local.region}:${local.account_id}:task-definition/${var.ops_task_family}:*"]
    condition {
      test     = "ArnEquals"
      variable = "ecs:cluster"
      values   = [var.cluster_arn]
    }
  }

  statement {
    sid       = "WatchTasks"
    actions   = ["ecs:DescribeTasks"]
    resources = ["arn:aws:ecs:${local.region}:${local.account_id}:task/${var.cluster_name}/*"]
  }

  statement {
    sid       = "PassTaskRoles"
    actions   = ["iam:PassRole"]
    resources = var.passable_role_arns
    condition {
      test     = "StringEquals"
      variable = "iam:PassedToService"
      values   = ["ecs-tasks.amazonaws.com"]
    }
  }

  statement {
    sid       = "StaticAssetsList"
    actions   = ["s3:ListBucket"]
    resources = [var.static_bucket_arn]
  }

  statement {
    sid       = "StaticAssetsWrite"
    actions   = ["s3:PutObject", "s3:GetObject"]
    resources = ["${var.static_bucket_arn}/*"]
  }

  statement {
    sid       = "CdnInvalidate"
    actions   = ["cloudfront:CreateInvalidation", "cloudfront:GetInvalidation"]
    resources = [var.cloudfront_distribution_arn]
  }

  statement {
    sid       = "ReadDeployConfig"
    actions   = ["ssm:GetParameter"]
    resources = [var.deploy_config_parameter_arn, var.image_tag_parameter_arn]
  }

  statement {
    sid       = "RecordDeployedImage"
    actions   = ["ssm:PutParameter"]
    resources = [var.image_tag_parameter_arn]
  }

  statement {
    sid       = "ReadOpsLogs"
    actions   = ["logs:GetLogEvents", "logs:FilterLogEvents"]
    resources = ["arn:aws:logs:${local.region}:${local.account_id}:log-group:${var.ops_log_group}:*"]
  }
}

resource "aws_iam_role_policy" "deploy" {
  name   = "deploy"
  role   = aws_iam_role.deploy.id
  policy = data.aws_iam_policy_document.deploy.json
}

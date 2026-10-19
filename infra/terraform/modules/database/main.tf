# RDS for PostgreSQL 18 in private subnets.
#
# Two database identities:
#   - master user (bakery_admin): password generated and stored by RDS in
#     Secrets Manager (rotated every 7 days). Only the one-off "ops" task
#     (migrations, seeding, admin bootstrap) reads it, at task start, so
#     rotation never breaks a long-running process.
#   - app user (app_user): least-privilege DML role created by the migration
#     script. Its password is a Terraform-generated SSM SecureString that the
#     web tasks read.

resource "aws_db_subnet_group" "this" {
  name       = "${var.name}-db"
  subnet_ids = var.private_subnet_ids
}

resource "aws_db_parameter_group" "this" {
  name   = "${var.name}-pg${var.engine_major_version}"
  family = "postgres${var.engine_major_version}"

  parameter {
    name  = "rds.force_ssl"
    value = "1"
  }

  # Log statements slower than 1s to CloudWatch Logs.
  parameter {
    name  = "log_min_duration_statement"
    value = "1000"
  }

  lifecycle {
    create_before_destroy = true
  }
}

# RDS creates this log group on its own with no expiry; owning it here keeps
# retention bounded.
resource "aws_cloudwatch_log_group" "postgresql" {
  name              = "/aws/rds/instance/${var.name}-db/postgresql"
  retention_in_days = var.log_retention_days
}

resource "aws_db_instance" "this" {
  identifier     = "${var.name}-db"
  engine         = "postgres"
  engine_version = var.engine_major_version
  instance_class = var.instance_class

  db_name                     = var.database_name
  username                    = "bakery_admin"
  manage_master_user_password = true

  allocated_storage     = var.allocated_storage_gb
  max_allocated_storage = var.max_allocated_storage_gb
  storage_type          = "gp3"
  storage_encrypted     = true

  db_subnet_group_name   = aws_db_subnet_group.this.name
  vpc_security_group_ids = [var.db_security_group_id]
  parameter_group_name   = aws_db_parameter_group.this.name
  publicly_accessible    = false
  multi_az               = var.multi_az
  ca_cert_identifier     = "rds-ca-rsa2048-g1"

  # 03:00-03:30 KST backups, Monday 04:00 KST maintenance (times are UTC).
  backup_retention_period    = var.backup_retention_days
  backup_window              = "18:00-18:30"
  maintenance_window         = "sun:19:00-sun:19:30"
  auto_minor_version_upgrade = true
  copy_tags_to_snapshot      = true

  deletion_protection       = var.deletion_protection
  skip_final_snapshot       = false
  final_snapshot_identifier = "${var.name}-db-final"

  # Database Insights "standard" (7 days) is free; "advanced" is not.
  performance_insights_enabled          = true
  performance_insights_retention_period = 7
  database_insights_mode                = "standard"

  enabled_cloudwatch_logs_exports = ["postgresql"]

  depends_on = [aws_cloudwatch_log_group.postgresql]
}

resource "random_password" "app" {
  length  = 40
  special = false
}

resource "aws_ssm_parameter" "app_password" {
  name        = "/${var.ssm_prefix}/db/app-password"
  description = "Password of the least-privilege app_user database role"
  type        = "SecureString"
  value       = random_password.app.result
}

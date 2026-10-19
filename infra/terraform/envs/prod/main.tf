locals {
  name       = "${var.project}-${var.environment}"
  ssm_prefix = "${var.project}/${var.environment}"
}

module "network" {
  source = "../../modules/network"
  name   = local.name
}

module "database" {
  source               = "../../modules/database"
  name                 = local.name
  ssm_prefix           = local.ssm_prefix
  private_subnet_ids   = module.network.private_subnet_ids
  db_security_group_id = module.network.db_security_group_id
  instance_class       = var.db_instance_class
  multi_az             = var.db_multi_az
  deletion_protection  = var.deletion_protection
}

module "loadbalancer" {
  source                = "../../modules/loadbalancer"
  name                  = local.name
  vpc_id                = module.network.vpc_id
  private_subnet_ids    = module.network.private_subnet_ids
  alb_security_group_id = module.network.alb_security_group_id
  deletion_protection   = var.deletion_protection
}

module "cdn" {
  source              = "../../modules/cdn"
  name                = local.name
  alb_arn             = module.loadbalancer.alb_arn
  alb_dns_name        = module.loadbalancer.alb_dns_name
  enable_waf          = var.enable_waf
  aliases             = var.domain_aliases
  acm_certificate_arn = var.acm_certificate_arn
  waf_page_rate_limit = var.waf_page_rate_limit
  force_destroy       = !var.deletion_protection
}

module "service" {
  source                        = "../../modules/service"
  name                          = local.name
  ssm_prefix                    = local.ssm_prefix
  cpu_architecture              = var.cpu_architecture
  web_cpu                       = var.web_cpu
  web_memory                    = var.web_memory
  min_tasks                     = var.web_min_tasks
  max_tasks                     = var.web_max_tasks
  public_subnet_ids             = module.network.public_subnet_ids
  app_security_group_id         = module.network.app_security_group_id
  target_group_arn              = module.loadbalancer.target_group_arn
  target_group_arn_suffix       = module.loadbalancer.target_group_arn_suffix
  alb_arn_suffix                = module.loadbalancer.alb_arn_suffix
  db_address                    = module.database.address
  db_port                       = module.database.port
  db_name                       = module.database.database_name
  db_app_user                   = module.database.app_user
  db_app_password_parameter_arn = module.database.app_password_parameter_arn
  db_master_secret_arn          = module.database.master_secret_arn
  admin_email                   = var.admin_email
  cloudfront_distribution_id    = module.cdn.distribution_id
  cloudfront_distribution_arn   = module.cdn.distribution_arn
  cloudfront_domain_name        = module.cdn.domain_name
  site_url                      = length(var.domain_aliases) > 0 ? "https://${var.domain_aliases[0]}" : null
  force_delete_images           = !var.deletion_protection
}

module "monitoring" {
  source                  = "../../modules/monitoring"
  name                    = local.name
  alarm_email             = var.alarm_email
  monthly_budget_usd      = var.monthly_budget_usd
  alb_arn_suffix          = module.loadbalancer.alb_arn_suffix
  target_group_arn_suffix = module.loadbalancer.target_group_arn_suffix
  cluster_name            = module.service.cluster_name
  service_name            = module.service.web_service_name
  service_arn             = module.service.web_service_arn
  min_tasks               = var.web_min_tasks
  web_log_group           = module.service.web_log_group
  db_instance_id          = module.database.instance_id
}

# Everything the CI pipeline needs, in one parameter, so GitHub only has to
# know the deploy role ARN and this parameter's name.
resource "aws_ssm_parameter" "deploy_config" {
  name        = "/${local.ssm_prefix}/deploy-config"
  description = "Read by GitHub Actions (deploy.yml / ops.yml)"
  type        = "String"
  value = jsonencode({
    region            = var.region
    ecrRepository     = module.service.ecr_repository_url
    cluster           = module.service.cluster_name
    webService        = module.service.web_service_name
    webTaskFamily     = module.service.web_task_family
    opsTaskFamily     = module.service.ops_task_family
    opsLogGroup       = module.service.ops_log_group
    subnets           = module.network.public_subnet_ids
    securityGroups    = [module.network.app_security_group_id]
    staticBucket      = module.cdn.static_bucket_name
    distributionId    = module.cdn.distribution_id
    siteUrl           = module.service.site_url
    cpuArchitecture   = var.cpu_architecture
    imageTagParameter = module.service.image_tag_parameter_name
  })
}

module "github_deploy" {
  source                      = "../../modules/github-deploy"
  name                        = local.name
  github_repository           = var.github_repository
  github_owner_id             = var.github_owner_id
  github_repository_id        = var.github_repository_id
  ecr_repository_arn          = module.service.ecr_repository_arn
  cluster_name                = module.service.cluster_name
  cluster_arn                 = module.service.cluster_arn
  web_service_name            = module.service.web_service_name
  web_task_family             = module.service.web_task_family
  ops_task_family             = module.service.ops_task_family
  passable_role_arns          = module.service.passable_role_arns
  static_bucket_arn           = module.cdn.static_bucket_arn
  cloudfront_distribution_arn = module.cdn.distribution_arn
  deploy_config_parameter_arn = aws_ssm_parameter.deploy_config.arn
  ops_log_group               = module.service.ops_log_group
  image_tag_parameter_arn     = module.service.image_tag_parameter_arn
}

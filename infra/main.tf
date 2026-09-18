# ===========================================================================
# DeterminEat — root module wiring
# ===========================================================================

data "aws_availability_zones" "available" {
  state = "available"
}

locals {
  name_prefix = var.project_name

  # Container image: fall back to the ECR repo :latest until CI supplies a tag
  container_image = var.container_image != "" ? var.container_image : "${module.ecr.repository_url}:latest"

  # Cognito callback/sign-out URLs: always allow localhost dev; add the prod URL when set
  app_urls = compact([
    "http://localhost:5173",
    var.app_domain_url,
  ])
}

# --- Networking -------------------------------------------------------------

module "vpc" {
  source = "./modules/vpc"

  name_prefix          = local.name_prefix
  vpc_cidr             = var.vpc_cidr
  public_subnet_cidrs  = var.public_subnet_cidrs
  private_subnet_cidrs = var.private_subnet_cidrs
  availability_zones   = slice(data.aws_availability_zones.available.names, 0, 2)
}

# --- Container registry -----------------------------------------------------

module "ecr" {
  source      = "./modules/ecr"
  name_prefix = local.name_prefix
}

# --- Authentication ---------------------------------------------------------

module "cognito" {
  source = "./modules/cognito"

  name_prefix   = local.name_prefix
  callback_urls = local.app_urls
  logout_urls   = local.app_urls
}

# --- Load balancer ----------------------------------------------------------

module "alb" {
  source = "./modules/alb"

  name_prefix         = local.name_prefix
  vpc_id              = module.vpc.vpc_id
  public_subnet_ids   = module.vpc.public_subnet_ids
  container_port      = var.container_port
  acm_certificate_arn = var.acm_certificate_arn
}

# --- Compute (ECS Fargate) --------------------------------------------------
# The ECS module owns the tasks security group; Aurora references it for
# ingress, giving a clean one-way dependency (aurora depends on ecs output).

module "ecs" {
  source = "./modules/ecs"

  name_prefix        = local.name_prefix
  aws_region         = var.aws_region
  private_subnet_ids = module.vpc.private_subnet_ids

  container_image = local.container_image
  container_port  = var.container_port
  desired_count   = var.desired_count
  task_cpu        = var.task_cpu
  task_memory     = var.task_memory

  tasks_security_group_id = aws_security_group.tasks.id
  target_group_arn        = module.alb.target_group_arn
  database_url_secret_arn = module.aurora.database_url_secret_arn

  cognito_user_pool_id = module.cognito.user_pool_id
  cognito_client_id    = module.cognito.user_pool_client_id
}

# --- Database (Aurora Serverless v2) ----------------------------------------

module "aurora" {
  source = "./modules/aurora"

  name_prefix               = local.name_prefix
  vpc_id                    = module.vpc.vpc_id
  private_subnet_ids        = module.vpc.private_subnet_ids
  ingress_security_group_id = aws_security_group.tasks.id

  db_name               = var.db_name
  master_username       = var.db_master_username
  min_capacity          = var.aurora_min_capacity
  max_capacity          = var.aurora_max_capacity
  backup_retention_days = var.backup_retention_days
}

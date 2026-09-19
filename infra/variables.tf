variable "aws_region" {
  description = "AWS region to deploy into"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Environment name (used in tags and resource names)"
  type        = string
  default     = "prod"
}

variable "github_repository" {
  description = "GitHub repository (owner/repo) allowed to assume the CI/CD deploy role via OIDC"
  type        = string
  default     = ""
}

variable "alert_email" {
  description = "Email address subscribed to the CloudWatch alerts SNS topic. If empty, the topic is created without a subscription."
  type        = string
  default     = ""
}

variable "project_name" {
  description = "Base name used to prefix resources"
  type        = string
  default     = "determineat"
}

# --- Networking -------------------------------------------------------------

variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "public_subnet_cidrs" {
  description = "CIDR blocks for the public subnets (one per AZ)"
  type        = list(string)
  default     = ["10.0.1.0/24", "10.0.2.0/24"]
}

variable "private_subnet_cidrs" {
  description = "CIDR blocks for the private subnets (one per AZ)"
  type        = list(string)
  default     = ["10.0.3.0/24", "10.0.4.0/24"]
}

# --- Application / container ------------------------------------------------

variable "container_image" {
  description = "Full ECR image URI (with tag) for the app container. Defaults to the repo's :latest until CI supplies a SHA tag."
  type        = string
  default     = ""
}

variable "container_port" {
  description = "Port the app container listens on"
  type        = number
  default     = 3000
}

variable "desired_count" {
  description = "Number of Fargate tasks to run"
  type        = number
  default     = 1
}

variable "task_cpu" {
  description = "Fargate task CPU units (256 = 0.25 vCPU)"
  type        = number
  default     = 512
}

variable "task_memory" {
  description = "Fargate task memory in MiB"
  type        = number
  default     = 1024
}

# --- HTTPS / DNS ------------------------------------------------------------

variable "acm_certificate_arn" {
  description = "ARN of an ACM certificate for the ALB HTTPS listener. If empty, only an HTTP listener is created (not recommended for production)."
  type        = string
  default     = ""
}

variable "app_domain_url" {
  description = "Public URL of the app (e.g. https://determineat.example.com), used for Cognito callback/sign-out URLs. If empty, only localhost dev URLs are configured."
  type        = string
  default     = ""
}

# --- Database ---------------------------------------------------------------

variable "db_name" {
  description = "Name of the application database"
  type        = string
  default     = "determineat"
}

variable "db_master_username" {
  description = "Master username for the Aurora cluster"
  type        = string
  default     = "determineat_admin"
}

variable "aurora_min_capacity" {
  description = "Aurora Serverless v2 minimum ACU (can scale toward 0 when idle on supported versions)"
  type        = number
  default     = 0.5
}

variable "aurora_max_capacity" {
  description = "Aurora Serverless v2 maximum ACU"
  type        = number
  default     = 2
}

variable "backup_retention_days" {
  description = "Automated backup retention period in days"
  type        = number
  default     = 7
}

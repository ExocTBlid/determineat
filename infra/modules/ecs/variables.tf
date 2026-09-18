variable "name_prefix" {
  description = "Prefix for resource names"
  type        = string
}

variable "aws_region" {
  description = "AWS region (for CloudWatch log config)"
  type        = string
}

variable "private_subnet_ids" {
  description = "Private subnet IDs the Fargate tasks run in"
  type        = list(string)
}

variable "container_image" {
  description = "Full ECR image URI (with tag) to run"
  type        = string
}

variable "container_port" {
  description = "Port the container listens on"
  type        = number
}

variable "desired_count" {
  description = "Number of tasks to run"
  type        = number
}

variable "task_cpu" {
  description = "Task CPU units"
  type        = number
}

variable "task_memory" {
  description = "Task memory (MiB)"
  type        = number
}

variable "tasks_security_group_id" {
  description = "Security group ID for the Fargate tasks (created at root)"
  type        = string
}

variable "target_group_arn" {
  description = "ALB target group ARN to register tasks with"
  type        = string
}

variable "database_url_secret_arn" {
  description = "Secrets Manager ARN holding DATABASE_URL"
  type        = string
}

variable "cognito_user_pool_id" {
  description = "Cognito user pool ID (env for JWT verification)"
  type        = string
}

variable "cognito_client_id" {
  description = "Cognito app client ID (env for JWT verification)"
  type        = string
}

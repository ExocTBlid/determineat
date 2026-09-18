variable "name_prefix" {
  description = "Prefix for resource names"
  type        = string
}

variable "vpc_id" {
  description = "VPC ID"
  type        = string
}

variable "private_subnet_ids" {
  description = "Private subnet IDs for the DB subnet group"
  type        = list(string)
}

variable "ingress_security_group_id" {
  description = "Security group allowed to connect to the database (the ECS tasks SG)"
  type        = string
}

variable "db_name" {
  description = "Application database name"
  type        = string
}

variable "master_username" {
  description = "Master username"
  type        = string
}

variable "min_capacity" {
  description = "Serverless v2 minimum ACU"
  type        = number
}

variable "max_capacity" {
  description = "Serverless v2 maximum ACU"
  type        = number
}

variable "backup_retention_days" {
  description = "Automated backup retention in days"
  type        = number
}

variable "name_prefix" {
  description = "Prefix for resource names"
  type        = string
}

variable "vpc_id" {
  description = "VPC ID"
  type        = string
}

variable "public_subnet_ids" {
  description = "Public subnet IDs for the ALB"
  type        = list(string)
}

variable "container_port" {
  description = "Port the app container listens on (target group port)"
  type        = number
}

variable "acm_certificate_arn" {
  description = "ACM certificate ARN for HTTPS. If empty, only HTTP is served."
  type        = string
  default     = ""
}

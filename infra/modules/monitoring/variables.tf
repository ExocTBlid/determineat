variable "name_prefix" {
  description = "Prefix for resource names"
  type        = string
}

variable "log_group_name" {
  description = "CloudWatch log group the app writes to (for the ERROR metric filter)"
  type        = string
}

variable "alert_email" {
  description = "Email address to subscribe to the alerts SNS topic. If empty, no subscription is created (topic still exists)."
  type        = string
  default     = ""
}

variable "ecs_cluster_name" {
  description = "ECS cluster name (for CPU/memory alarms)"
  type        = string
}

variable "ecs_service_name" {
  description = "ECS service name (for CPU/memory alarms)"
  type        = string
}

variable "alb_arn_suffix" {
  description = "ALB ARN suffix (for the unhealthy-hosts alarm dimension)"
  type        = string
}

variable "target_group_arn_suffix" {
  description = "Target group ARN suffix (for the unhealthy-hosts alarm dimension)"
  type        = string
}

variable "error_alarm_threshold" {
  description = "Number of ERROR log events in the evaluation window that triggers the alarm"
  type        = number
  default     = 5
}

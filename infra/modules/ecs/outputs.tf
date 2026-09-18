output "cluster_name" {
  description = "ECS cluster name"
  value       = aws_ecs_cluster.this.name
}

output "service_name" {
  description = "ECS service name"
  value       = aws_ecs_service.this.name
}

output "log_group_name" {
  description = "CloudWatch log group for the app"
  value       = aws_cloudwatch_log_group.app.name
}

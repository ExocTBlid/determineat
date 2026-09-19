output "alerts_topic_arn" {
  description = "ARN of the SNS topic that receives alarm notifications"
  value       = aws_sns_topic.alerts.arn
}

output "error_metric_name" {
  description = "CloudWatch metric name counting application ERROR log events"
  value       = aws_cloudwatch_log_metric_filter.app_errors.metric_transformation[0].name
}

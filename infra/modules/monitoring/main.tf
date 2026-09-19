# ---------------------------------------------------------------------------
# Monitoring & alerting
#
#   - A metric filter counts ERROR-level log lines and exposes them as a metric
#   - An SNS topic (optionally email-subscribed) receives alarm notifications
#   - CloudWatch alarms fire on: application errors, high ECS CPU/memory, and
#     unhealthy ALB targets
#
# The CloudWatch log group and ECS Container Insights are created by the ecs
# module; this module consumes their names.
# ---------------------------------------------------------------------------

locals {
  metric_namespace = "DeterminEat"
}

# --- Alerts topic -----------------------------------------------------------

resource "aws_sns_topic" "alerts" {
  name = "${var.name_prefix}-alerts"
}

resource "aws_sns_topic_subscription" "email" {
  count     = var.alert_email != "" ? 1 : 0
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

# --- Application error metric filter ----------------------------------------
# Matches the structured logger's ERROR level (see backend/src/lib/logger.ts).

resource "aws_cloudwatch_log_metric_filter" "app_errors" {
  name           = "${var.name_prefix}-app-errors"
  log_group_name = var.log_group_name

  # JSON pattern: match log events whose `level` field equals "ERROR"
  pattern = "{ $.level = \"ERROR\" }"

  metric_transformation {
    name          = "AppErrorCount"
    namespace     = local.metric_namespace
    value         = "1"
    default_value = "0"
  }
}

# --- Alarms -----------------------------------------------------------------

resource "aws_cloudwatch_metric_alarm" "app_errors" {
  alarm_name          = "${var.name_prefix}-app-errors"
  alarm_description   = "Application logged ERROR events above threshold"
  namespace           = local.metric_namespace
  metric_name         = aws_cloudwatch_log_metric_filter.app_errors.metric_transformation[0].name
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = var.error_alarm_threshold
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]
}

resource "aws_cloudwatch_metric_alarm" "cpu_high" {
  alarm_name          = "${var.name_prefix}-ecs-cpu-high"
  alarm_description   = "ECS service CPU utilization is high"
  namespace           = "AWS/ECS"
  metric_name         = "CPUUtilization"
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 2
  threshold           = 85
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"

  dimensions = {
    ClusterName = var.ecs_cluster_name
    ServiceName = var.ecs_service_name
  }

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]
}

resource "aws_cloudwatch_metric_alarm" "memory_high" {
  alarm_name          = "${var.name_prefix}-ecs-memory-high"
  alarm_description   = "ECS service memory utilization is high"
  namespace           = "AWS/ECS"
  metric_name         = "MemoryUtilization"
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 2
  threshold           = 85
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"

  dimensions = {
    ClusterName = var.ecs_cluster_name
    ServiceName = var.ecs_service_name
  }

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]
}

resource "aws_cloudwatch_metric_alarm" "unhealthy_hosts" {
  alarm_name          = "${var.name_prefix}-unhealthy-hosts"
  alarm_description   = "One or more ALB targets are failing health checks"
  namespace           = "AWS/ApplicationELB"
  metric_name         = "UnHealthyHostCount"
  statistic           = "Maximum"
  period              = 60
  evaluation_periods  = 3
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"

  dimensions = {
    LoadBalancer = var.alb_arn_suffix
    TargetGroup  = var.target_group_arn_suffix
  }

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]
}

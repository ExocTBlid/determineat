output "alb_dns_name" {
  description = "Public DNS name of the ALB"
  value       = aws_lb.this.dns_name
}

output "alb_security_group_id" {
  description = "Security group ID of the ALB"
  value       = aws_security_group.alb.id
}

output "target_group_arn" {
  description = "ARN of the target group ECS registers tasks with"
  value       = aws_lb_target_group.this.arn
}

output "alb_arn_suffix" {
  description = "ALB ARN suffix (for CloudWatch metric dimensions)"
  value       = aws_lb.this.arn_suffix
}

output "target_group_arn_suffix" {
  description = "Target group ARN suffix (for CloudWatch metric dimensions)"
  value       = aws_lb_target_group.this.arn_suffix
}

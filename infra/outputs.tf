# ---------------------------------------------------------------------------
# Root outputs — the values you need to wire up the app and CI/CD.
# ---------------------------------------------------------------------------

output "alb_dns_name" {
  description = "Public DNS name of the load balancer (the app URL)"
  value       = module.alb.alb_dns_name
}

output "ecr_repository_url" {
  description = "ECR repository URL to push the app image to"
  value       = module.ecr.repository_url
}

output "cognito_user_pool_id" {
  description = "Cognito user pool ID (set as COGNITO_USER_POOL_ID / VITE_COGNITO_USER_POOL_ID)"
  value       = module.cognito.user_pool_id
}

output "cognito_client_id" {
  description = "Cognito app client ID (set as COGNITO_CLIENT_ID / VITE_COGNITO_CLIENT_ID)"
  value       = module.cognito.user_pool_client_id
}

output "ecs_cluster_name" {
  description = "ECS cluster name (for force-new-deployment)"
  value       = module.ecs.cluster_name
}

output "ecs_service_name" {
  description = "ECS service name (for force-new-deployment)"
  value       = module.ecs.service_name
}

output "cloudwatch_log_group" {
  description = "CloudWatch log group for app container logs"
  value       = module.ecs.log_group_name
}

output "aurora_endpoint" {
  description = "Aurora cluster writer endpoint"
  value       = module.aurora.cluster_endpoint
}

output "github_actions_role_arn" {
  description = "IAM role ARN for GitHub Actions to assume via OIDC (set as the AWS_ROLE_ARN repo variable). Null when github_repository is unset."
  value       = var.github_repository != "" ? module.github_oidc[0].deploy_role_arn : null
}

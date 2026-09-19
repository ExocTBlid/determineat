output "deploy_role_arn" {
  description = "ARN of the IAM role GitHub Actions assumes via OIDC (created by infra/bootstrap.py)"
  value       = data.aws_iam_role.deploy.arn
}

output "cluster_endpoint" {
  description = "Aurora cluster writer endpoint"
  value       = aws_rds_cluster.this.endpoint
}

output "database_url_secret_arn" {
  description = "ARN of the Secrets Manager secret holding DATABASE_URL"
  value       = aws_secretsmanager_secret.database_url.arn
}

output "db_security_group_id" {
  description = "Security group ID of the database"
  value       = aws_security_group.db.id
}

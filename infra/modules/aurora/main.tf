# ---------------------------------------------------------------------------
# Aurora Serverless v2 (PostgreSQL-compatible)
#
#   - Lives in private subnets via a dedicated DB subnet group
#   - Only reachable from the ECS tasks security group
#   - Automated backups with configurable retention
#   - Master password generated and stored in Secrets Manager alongside a
#     ready-to-use DATABASE_URL for the app
# ---------------------------------------------------------------------------

resource "random_password" "master" {
  length  = 32
  special = false # avoid URL-encoding headaches in the connection string
}

resource "aws_db_subnet_group" "this" {
  name       = "${var.name_prefix}-db-subnets"
  subnet_ids = var.private_subnet_ids
  tags       = { Name = "${var.name_prefix}-db-subnets" }
}

resource "aws_security_group" "db" {
  name        = "${var.name_prefix}-db-sg"
  description = "Aurora access from ECS tasks only"
  vpc_id      = var.vpc_id

  ingress {
    description     = "PostgreSQL from ECS tasks"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [var.ingress_security_group_id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.name_prefix}-db-sg" }
}

resource "aws_rds_cluster" "this" {
  cluster_identifier = "${var.name_prefix}-aurora"
  engine             = "aurora-postgresql"
  engine_mode        = "provisioned" # required for Serverless v2
  engine_version     = "15.4"

  database_name   = var.db_name
  master_username = var.master_username
  master_password = random_password.master.result

  db_subnet_group_name   = aws_db_subnet_group.this.name
  vpc_security_group_ids = [aws_security_group.db.id]

  backup_retention_period = var.backup_retention_days
  storage_encrypted       = true

  # Allow clean teardown in non-prod; take a final snapshot otherwise handled by AWS
  skip_final_snapshot       = true
  final_snapshot_identifier = null

  serverlessv2_scaling_configuration {
    min_capacity = var.min_capacity
    max_capacity = var.max_capacity
  }
}

resource "aws_rds_cluster_instance" "this" {
  identifier         = "${var.name_prefix}-aurora-1"
  cluster_identifier = aws_rds_cluster.this.id
  instance_class     = "db.serverless"
  engine             = aws_rds_cluster.this.engine
  engine_version     = aws_rds_cluster.this.engine_version
}

# --- Connection string secret ----------------------------------------------

resource "aws_secretsmanager_secret" "database_url" {
  name        = "${var.name_prefix}/database-url"
  description = "PostgreSQL connection string for the DeterminEat app"
}

resource "aws_secretsmanager_secret_version" "database_url" {
  secret_id = aws_secretsmanager_secret.database_url.id
  secret_string = format(
    "postgresql://%s:%s@%s:5432/%s",
    var.master_username,
    random_password.master.result,
    aws_rds_cluster.this.endpoint,
    var.db_name,
  )
}

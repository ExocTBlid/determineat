# ---------------------------------------------------------------------------
# ECS tasks security group — defined at the root to break the otherwise
# circular dependency between the ECS module (needs the DB secret from Aurora)
# and the Aurora module (needs this SG for its ingress rule).
#
# Ingress is added separately (from the ALB SG) so the SG itself has no
# dependency on the ALB module at creation time.
# ---------------------------------------------------------------------------

resource "aws_security_group" "tasks" {
  name        = "${local.name_prefix}-tasks-sg"
  description = "ECS tasks: ingress from ALB only"
  vpc_id      = module.vpc.vpc_id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${local.name_prefix}-tasks-sg" }
}

resource "aws_security_group_rule" "tasks_from_alb" {
  type                     = "ingress"
  description              = "App port from ALB"
  from_port                = var.container_port
  to_port                  = var.container_port
  protocol                 = "tcp"
  security_group_id        = aws_security_group.tasks.id
  source_security_group_id = module.alb.alb_security_group_id
}

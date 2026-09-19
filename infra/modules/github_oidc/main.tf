# ---------------------------------------------------------------------------
# GitHub Actions OIDC — reference only.
#
# The OIDC provider and the deploy IAM role are created by infra/bootstrap.py
# (they must exist before the OIDC-authenticated pipeline can run Terraform at
# all, so Terraform cannot own them without a chicken-and-egg problem).
#
# This module simply looks up the bootstrap-created role and exposes its ARN,
# so the rest of the config / outputs can reference it. Role *permissions* live
# in bootstrap.py, not here.
# ---------------------------------------------------------------------------

data "aws_iam_role" "deploy" {
  name = "${var.name_prefix}-github-deploy"
}

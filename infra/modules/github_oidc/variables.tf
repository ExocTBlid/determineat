variable "name_prefix" {
  description = "Prefix for resource names. The deploy role is expected to be named <name_prefix>-github-deploy (created by infra/bootstrap.py)."
  type        = string
}

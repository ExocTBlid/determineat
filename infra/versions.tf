terraform {
  # 1.10+ is required for native S3 state locking (use_lockfile), which
  # replaces the previous DynamoDB lock table.
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source = "hashicorp/aws"
      # 6.23+ is required to consume credentials from `aws login`
      # (~/.aws/login/cache). 5.x only understands env vars, shared
      # credentials files, SSO, and IMDS.
      version = "~> 6.23"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  # Remote state — the S3 bucket is created once by infra/bootstrap.py.
  # `use_lockfile` enables native S3 state locking (a .tflock object in the
  # bucket), so no DynamoDB table is needed. The bucket/region are supplied at
  # `terraform init` time via -backend-config, so they aren't hardcoded here.
  backend "s3" {
    key          = "determineat/terraform.tfstate"
    encrypt      = true
    use_lockfile = true
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "determineat"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

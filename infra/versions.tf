terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.60"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  # Remote state — the S3 bucket and DynamoDB lock table must be created once
  # (see README "First-Time Infrastructure Setup"). Values are supplied at
  # `terraform init` time via -backend-config, so they aren't hardcoded here.
  backend "s3" {
    key     = "determineat/terraform.tfstate"
    encrypt = true
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

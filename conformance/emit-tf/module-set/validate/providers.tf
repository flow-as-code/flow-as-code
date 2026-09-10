# TEST FIXTURE, not emitter output. The emitter never writes provider blocks,
# backend configuration, or credentials; this file supplies the minimum a
# `tofu validate` run needs, and no credentials are set because validate makes
# no API calls. awscc carries the module version and alias resources.

terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }

    awscc = {
      source  = "hashicorp/awscc"
      version = "~> 1.0"
    }
  }
}

provider "aws" {
  region = "us-east-1"
}

provider "awscc" {
  region = "us-east-1"
}

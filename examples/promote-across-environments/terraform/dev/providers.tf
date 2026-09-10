# Yours, not the emitter's. The emitter never writes provider blocks, backend
# configuration, or credentials; versions.tf.example lists what its output needs.

terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

provider "aws" {
  region = "us-east-1"
}

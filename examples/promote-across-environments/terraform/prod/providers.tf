# Yours, not the emitter's. A different account and a different region from dev;
# neither appears anywhere in the flow, because the flow refers to resources by
# name and this configuration is what knows where they live.

terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

provider "aws" {
  region = "us-west-2"
}

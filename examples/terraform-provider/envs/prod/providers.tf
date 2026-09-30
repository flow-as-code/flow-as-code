# Yours: provider configuration, credentials and backend belong to each
# environment's root module, never to the flows module. flowascode takes
# hashicorp/aws's configuration vocabulary, so one region and one set of
# credentials serve both.

terraform {
  required_version = ">= 1.8.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
    flowascode = {
      source  = "flow-as-code/flowascode"
      version = "~> 0.1"
    }
  }
}

provider "aws" {
  region = "us-west-2"
}

provider "flowascode" {
  region = "us-west-2"
}

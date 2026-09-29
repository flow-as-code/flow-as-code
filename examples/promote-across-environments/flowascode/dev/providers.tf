# Yours, not the emitter's. The emitter never writes provider blocks, backend
# configuration, or credentials; versions.tf.example lists what its output needs.
# The flowascode provider takes hashicorp/aws's configuration vocabulary, so the
# same region and credentials serve both.

terraform {
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
  region = "us-east-1"
}

provider "flowascode" {
  region = "us-east-1"
}

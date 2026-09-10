# TEST FIXTURE, not emitter output. The emitter never writes provider blocks,
# backend configuration, or credentials; this file supplies the minimum a
# `tofu validate` run needs, and no credentials are set because validate makes
# no API calls. awscc carries the module version and alias resources.
#
# The versions are exact rather than `~> 6.0` and `~> 1.0` ranges so that what
# this test resolves does not depend on when a third party published. Under a
# range, `tofu init` picked whatever the newest matching release was on the day
# the suite ran, so the shared provider cache went cold without warning every
# time either provider shipped. packages/tf/src/__fixtures__/tofu.ts records
# why a cold cache is worth avoiding. The ranges the emitter promises its users
# are a separate statement and live in versions.tf.example; these are test
# details, so bump them deliberately. The emit-tf cache key in
# .github/workflows/ci.yml names these versions, and a test in
# packages/tf/src/validate.test.ts holds the two in step.

terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "6.64.0"
    }

    awscc = {
      source  = "hashicorp/awscc"
      version = "1.101.0"
    }
  }
}

provider "aws" {
  region = "us-east-1"
}

provider "awscc" {
  region = "us-east-1"
}

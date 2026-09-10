# TEST FIXTURE, not emitter output. The emitter never writes provider blocks,
# backend configuration, or credentials; this file supplies the minimum a
# `tofu validate` run needs, and no credentials are set because validate makes
# no API calls.
#
# The version is exact rather than a `~> 6.0` range so that what this test
# resolves does not depend on when a third party published. Under a range,
# `tofu init` picked whatever the newest 6.x was on the day the suite ran, so
# the shared provider cache went cold without warning every time the aws
# provider shipped a release. packages/tf/src/__fixtures__/tofu.ts records why
# a cold cache is worth avoiding. The range the emitter promises its users is a
# separate statement and lives in versions.tf.example; this is a test detail,
# so bump it deliberately. The emit-tf cache key in .github/workflows/ci.yml
# names these versions, and a test in packages/tf/src/validate.test.ts holds
# the two in step.

terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "6.64.0"
    }
  }
}

provider "aws" {
  region = "us-east-1"
}

# TEST FIXTURE, not reader or emitter output. The minimum a `tofu validate`
# run needs: the providers at exact versions, so what the gated lane resolves
# does not depend on when a third party published. Bump deliberately; the
# emit-tf cache key in .github/workflows/ci.yml names these versions and
# packages/tf/src/validate.test.ts holds the two in step. No credentials are
# set because validate makes no API calls.

terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "6.64.0"
    }
    flowascode = {
      source  = "flow-as-code/flowascode"
      version = "0.1.1"
    }
  }
}

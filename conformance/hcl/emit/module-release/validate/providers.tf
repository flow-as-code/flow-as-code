# TEST FIXTURE, not reader or emitter output. The minimum a `tofu validate`
# run needs: the provider at an exact version, so what the gated lane resolves
# does not depend on when a third party published. Bump deliberately; the
# emit-tf cache key in .github/workflows/ci.yml names this version and
# packages/tf/src/validate.test.ts holds the two in step. No credentials are
# set because validate makes no API calls. Nothing is stubbed: the set binds
# no reference, and the alias resources point at the module the emitter
# writes itself.

terraform {
  required_providers {
    flowascode = {
      source  = "flow-as-code/flowascode"
      version = "0.1.1"
    }
  }
}

# An action type the tooling does not model yet still has a home: a generic
# block carries its Type and its Parameters as JSON, unchanged. Nothing about it
# is checked beyond what Connect checks, so prefer a typed block when one
# exists; the catalog lists which do. StartVoiceIdStream takes no parameters,
# so the block names only the type. Connect accepted it with a NextAction and
# the catch-all on a development instance (2026-10-05, the probe start-stream
# under conformance/flow-language/probes/).
resource "flowascode_contact_flow" "unmodeled_action" {
  instance_id = var.connect_instance_id
  name        = "unmodeled-action"
  type        = "CONTACT_FLOW"

  action {
    id   = "start-voice-id"
    next = "hang-up"
    generic {
      type = "StartVoiceIdStream"
    }
    error {
      type = "NoMatchingError"
      next = "hang-up"
    }
  }

  action {
    id = "hang-up"
    disconnect_participant {}
  }
}

# An action type the tooling does not model yet still has a home: a generic
# block carries its Type and its Parameters as JSON, unchanged. Nothing about it
# is checked beyond what Connect checks, so prefer a typed block when one
# exists; the catalog lists which do. Connect decides which error branches this
# action takes from its parameters: with ContinueFlowExecution "True" it takes
# these three, with "False" only the catch-all (sandbox, 2026-09-29).
resource "flowascode_contact_flow" "unmodeled_action" {
  instance_id = var.connect_instance_id
  name        = "unmodeled-action"
  type        = "CONTACT_FLOW"

  action {
    id   = "desk-phone"
    next = "hang-up"
    generic {
      type = "TransferParticipantToThirdParty"
      parameters = jsonencode({
        ContinueFlowExecution                = "True"
        ThirdPartyConnectionTimeLimitSeconds = "30"
        ThirdPartyPhoneNumber                = "+15555550100"
      })
    }
    error {
      type = "CallFailed"
      next = "hang-up"
    }
    error {
      type = "ConnectionTimeLimitExceeded"
      next = "hang-up"
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

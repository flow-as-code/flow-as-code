# An action the provider does not type yet still has a home: a generic block
# carries its Type and its Parameters as JSON, unchanged. Nothing about it is
# checked beyond what Connect checks, so prefer a typed block when one exists;
# the catalog lists which do. CreateTask has no typed block in the published
# provider, and its References map has no typed form in the TypeScript builder
# either. Connect accepted this action, the task's flow as a JSONPath and one
# URL reference, on a development instance (2026-11-25, the probe
# task-references-flow-jsonpath under conformance/flow-language/probes/42/).
resource "flowascode_contact_flow" "unmodeled_action" {
  instance_id = var.connect_instance_id
  name        = "unmodeled-action"
  type        = "CONTACT_FLOW"

  action {
    id   = "follow-up"
    next = "hang-up"
    generic {
      type = "CreateTask"
      parameters = jsonencode({
        ContactFlowId = "$.Attributes.taskFlowArn"
        Name          = "Order follow-up"
        References = {
          order = {
            Type  = "URL"
            Value = "https://example.com/orders/1"
          }
        }
      })
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

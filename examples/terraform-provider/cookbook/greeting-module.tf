# A flow module several flows share. Flows invoke it through an alias, so a
# change to the module reaches them only when the alias moves (see
# module-release.tf), not the moment the module's content changes.
resource "flowascode_contact_flow_module" "greeting" {
  instance_id = var.connect_instance_id
  name        = "greeting"

  action {
    id   = "greet"
    next = "done"
    message_participant {
      text = "Thanks for calling. Calls may be recorded for quality."
    }
    error {
      type = "NoMatchingError"
      next = "done"
    }
  }

  action {
    id = "done"
    end_flow_module_execution {}
  }
}

# TEST FIXTURE, not reader or emitter output. Declares what the case's refs
# bind, minimally, so `tofu validate` can resolve every address (task B03e).

variable "connect_instance_id" {
  type = string
}

resource "flowascode_contact_flow" "queue_experience" {
  instance_id = var.connect_instance_id
  name        = "queue-experience"
  type        = "CONTACT_FLOW"

  action {
    id = "bye"
    disconnect_participant {}
  }
}

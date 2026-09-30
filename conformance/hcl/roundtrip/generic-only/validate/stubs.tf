# TEST FIXTURE, not reader or emitter output. Declares what the case's refs
# bind, minimally, so `tofu validate` can resolve every address (task B03e).

variable "connect_instance_id" {
  type = string
}

resource "flowascode_contact_flow" "task_flow" {
  instance_id = var.connect_instance_id
  name        = "task-flow"
  type        = "CONTACT_FLOW"

  action {
    id = "bye"
    disconnect_participant {}
  }
}

resource "aws_connect_queue" "support" {
  instance_id           = var.connect_instance_id
  name                  = "support"
  hours_of_operation_id = "00000000-0000-0000-0000-000000000000"
}

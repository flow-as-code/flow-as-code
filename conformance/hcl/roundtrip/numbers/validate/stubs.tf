# TEST FIXTURE, not reader or emitter output. Declares what the case's refs
# bind, minimally, so `tofu validate` can resolve every address (task B03e).

variable "connect_instance_id" {
  type = string
}

resource "aws_connect_queue" "front_desk" {
  instance_id           = var.connect_instance_id
  name                  = "front-desk"
  hours_of_operation_id = "00000000-0000-0000-0000-000000000000"
}

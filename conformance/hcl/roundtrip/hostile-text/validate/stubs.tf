# TEST FIXTURE, not reader or emitter output. Declares what the case's refs
# bind, minimally, so `tofu validate` can resolve every address (task B03e).

variable "connect_instance_id" {
  type = string
}

resource "aws_connect_queue" "appointments" {
  instance_id           = var.connect_instance_id
  name                  = "appointments"
  hours_of_operation_id = "00000000-0000-0000-0000-000000000000"
}

# The case writes `instance_id` as this resource's id (case.json options).
resource "aws_connect_instance" "main" {
  identity_management_type = "CONNECT_MANAGED"
  inbound_calls_enabled    = true
  outbound_calls_enabled   = true
  instance_alias           = "hostile-text"
}

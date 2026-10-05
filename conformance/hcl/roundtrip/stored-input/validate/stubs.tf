# TEST FIXTURE, not reader or emitter output. Declares what the case's refs
# bind, minimally, so `tofu validate` can resolve every address (task B03e).

variable "connect_instance_id" {
  type = string
}

data "aws_connect_prompt" "callback_number" {
  instance_id = var.connect_instance_id
  name        = "callback-number"
}

# TEST FIXTURE, not reader or emitter output. Declares what the case's refs
# bind, minimally, so `tofu validate` can resolve every address (task B03e).

variable "connect_instance_id" {
  type = string
}

data "aws_connect_prompt" "greeting" {
  instance_id = var.connect_instance_id
  name        = "greeting"
}

variable "sales_bot_alias_arn" {
  type = string
}

data "flowascode_view" "form" {
  instance_id = var.connect_instance_id
  name        = "form"
}

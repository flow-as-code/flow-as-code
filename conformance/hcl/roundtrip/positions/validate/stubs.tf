# TEST FIXTURE, not reader or emitter output. Declares what the case's refs
# bind, minimally, so `tofu validate` can resolve every address (task B03e).

variable "connect_instance_id" {
  type = string
}

data "aws_connect_prompt" "welcome_prompt" {
  instance_id = var.connect_instance_id
  name        = "welcome-prompt"
}

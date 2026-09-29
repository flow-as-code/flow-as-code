# Prod does not own its supporting resources: a platform team creates the
# hours, the queue and the function (and associates the function with the
# instance) in their own configuration and publishes the ARNs as outputs. This
# root module reads them from that state and hands them to the same flows
# module dev uses. Nothing here, or in dev, is an ARN typed into a file.

variable "connect_instance_id" {
  type = string
}

data "terraform_remote_state" "platform" {
  backend = "local"

  config = {
    path = "../platform/terraform.tfstate"
  }
}

module "flows" {
  source = "../../flows"

  connect_instance_id    = var.connect_instance_id
  main_line_hours_arn    = data.terraform_remote_state.platform.outputs.main_line_hours_arn
  appointment_lookup_arn = data.terraform_remote_state.platform.outputs.appointment_lookup_arn
  appointments_queue_arn = data.terraform_remote_state.platform.outputs.appointments_queue_arn
}

output "appointment_line_document_sha256" {
  value = module.flows.appointment_line_document_sha256
}

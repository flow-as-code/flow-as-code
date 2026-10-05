# TEST FIXTURE, not reader or emitter output. Declares what the case's refs
# bind, minimally, so `tofu validate` can resolve every address (task B03e).

variable "connect_instance_id" {
  type = string
}

resource "flowascode_contact_flow_module" "satisfaction_question" {
  instance_id = var.connect_instance_id
  name        = "satisfaction-question"

  action {
    id = "done"
    end_flow_module_execution {}
  }
}

resource "flowascode_contact_flow_module_version" "satisfaction_question" {
  instance_id            = var.connect_instance_id
  contact_flow_module_id = flowascode_contact_flow_module.satisfaction_question.contact_flow_module_id
  content_hash           = flowascode_contact_flow_module.satisfaction_question.content_hash

  lifecycle {
    create_before_destroy = true
  }
}

resource "flowascode_contact_flow_module_alias" "satisfaction_question_prod" {
  instance_id                 = var.connect_instance_id
  contact_flow_module_id      = flowascode_contact_flow_module.satisfaction_question.contact_flow_module_id
  name                        = "prod"
  contact_flow_module_version = flowascode_contact_flow_module_version.satisfaction_question.version
}

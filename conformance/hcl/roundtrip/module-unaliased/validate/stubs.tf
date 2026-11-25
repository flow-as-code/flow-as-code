# TEST FIXTURE, not reader or emitter output. Declares what the case's refs
# bind, minimally, so `tofu validate` can resolve every address (task B03e).

variable "connect_instance_id" {
  type = string
}

resource "flowascode_contact_flow_module" "offer_callback" {
  instance_id = var.connect_instance_id
  name        = "offer-callback"

  action {
    id = "done"
    end_flow_module_execution {}
  }
}

resource "flowascode_contact_flow_module" "after_call_survey" {
  instance_id = var.connect_instance_id
  name        = "after-call-survey"

  action {
    id = "done"
    end_flow_module_execution {}
  }
}

resource "flowascode_contact_flow_module_version" "after_call_survey" {
  instance_id            = var.connect_instance_id
  contact_flow_module_id = flowascode_contact_flow_module.after_call_survey.contact_flow_module_id
  content_hash           = flowascode_contact_flow_module.after_call_survey.content_hash

  lifecycle {
    create_before_destroy = true
  }
}

resource "flowascode_contact_flow_module_alias" "after_call_survey_prod" {
  instance_id                 = var.connect_instance_id
  contact_flow_module_id      = flowascode_contact_flow_module.after_call_survey.contact_flow_module_id
  name                        = "prod"
  contact_flow_module_version = flowascode_contact_flow_module_version.after_call_survey.version
}

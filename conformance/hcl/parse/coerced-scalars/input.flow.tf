# Numbers and bools where the provider's attributes are strings: Terraform
# converts them, and so does the TypeScript reader.

resource "flowascode_contact_flow" "coerced_scalars" {
  instance_id = var.connect_instance_id
  name        = "coerced-scalars"
  type        = "CONTACT_FLOW"

  action {
    id   = "remember"
    next = "say"
    update_contact_attributes {
      attributes = {
        retries = 3
        ratio   = 0.5
        tier    = "gold"
        vip     = true
      }
    }
    error {
      type = "NoMatchingError"
      next = "bye"
    }
  }

  action {
    id   = "say"
    next = "bye"
    message_participant {
      text = 5
    }
    error {
      type = "NoMatchingError"
      next = "bye"
    }
  }

  action {
    id = "bye"
    disconnect_participant {}
  }
}

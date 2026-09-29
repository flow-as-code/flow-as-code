# Collect digits and keep them. With StoreInput "True", Connect stores the
# digits in $.StoredCustomerInput instead of branching on them: the action
# takes InputValidation, no conditions, and no NoMatchingCondition or
# InputTimeLimitExceeded branch (the conditional-shape lint rule holds all
# three).
resource "flowascode_contact_flow" "collect_input" {
  instance_id = var.connect_instance_id
  name        = "collect-input"
  type        = "CONTACT_FLOW"

  refs = {
    "queue:support" = aws_connect_queue.support.arn
  }

  action {
    id   = "ask-account"
    next = "keep-account"
    get_participant_input {
      text                     = "Please enter your eight digit account number."
      input_time_limit_seconds = 8
      store_input              = "True"
      input_validation = {
        custom_validation = {
          maximum_length = 8
        }
      }
    }
    error {
      type = "NoMatchingError"
      next = "to-support"
    }
  }

  action {
    id   = "keep-account"
    next = "to-support"
    update_contact_attributes {
      attributes = {
        accountNumber = "$.StoredCustomerInput"
      }
      target_contact = "Current"
    }
    error {
      type = "NoMatchingError"
      next = "to-support"
    }
  }

  action {
    id   = "to-support"
    next = "transfer"
    update_contact_target_queue {
      queue_id = "queue:support"
    }
    error {
      type = "NoMatchingError"
      next = "hang-up"
    }
  }

  action {
    id   = "transfer"
    next = "hang-up"
    transfer_contact_to_queue {}
    error {
      type = "QueueAtCapacity"
      next = "hang-up"
    }
    error {
      type = "NoMatchingError"
      next = "hang-up"
    }
  }

  action {
    id = "hang-up"
    disconnect_participant {}
  }
}

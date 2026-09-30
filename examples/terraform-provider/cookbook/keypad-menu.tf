# A keypad menu. With StoreInput "False", Connect branches on the key pressed,
# and requires the InputTimeLimitExceeded branch (no key pressed) and the
# NoMatchingCondition branch (a key no condition names). StoreInput must be
# written out: the service refuses the action without it. The conditional-shape
# lint rule holds all three.
resource "flowascode_contact_flow" "keypad_menu" {
  instance_id = var.connect_instance_id
  name        = "keypad-menu"
  type        = "CONTACT_FLOW"

  refs = {
    "queue:priority" = aws_connect_queue.priority.arn
    "queue:support"  = aws_connect_queue.support.arn
  }

  action {
    id   = "menu"
    next = "not-understood"
    get_participant_input {
      text                     = "For support, press 1. For an existing case, press 2."
      input_time_limit_seconds = 5
      store_input              = "False"
    }
    condition {
      operator = "Equals"
      operands = ["1"]
      next     = "to-support"
    }
    condition {
      operator = "Equals"
      operands = ["2"]
      next     = "to-priority"
    }
    error {
      type = "InputTimeLimitExceeded"
      next = "not-understood"
    }
    error {
      type = "NoMatchingCondition"
      next = "not-understood"
    }
    error {
      type = "NoMatchingError"
      next = "not-understood"
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
      next = "not-understood"
    }
  }

  action {
    id   = "to-priority"
    next = "transfer"
    update_contact_target_queue {
      queue_id = "queue:priority"
    }
    error {
      type = "NoMatchingError"
      next = "not-understood"
    }
  }

  action {
    id   = "transfer"
    next = "hang-up"
    transfer_contact_to_queue {}
    error {
      type = "QueueAtCapacity"
      next = "busy"
    }
    error {
      type = "NoMatchingError"
      next = "hang-up"
    }
  }

  action {
    id   = "busy"
    next = "hang-up"
    message_participant {
      text = "All of our agents are busy. Please call back later."
    }
    error {
      type = "NoMatchingError"
      next = "hang-up"
    }
  }

  action {
    id   = "not-understood"
    next = "hang-up"
    message_participant {
      text = "Sorry, we did not get that. Goodbye."
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

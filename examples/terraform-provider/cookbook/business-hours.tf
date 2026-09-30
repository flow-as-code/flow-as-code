# Route to a queue during business hours; otherwise say so and hang up.
resource "flowascode_contact_flow" "business_hours" {
  instance_id = var.connect_instance_id
  name        = "business-hours"
  type        = "CONTACT_FLOW"

  refs = {
    "hours:support" = aws_connect_hours_of_operation.support.arn
    "queue:support" = aws_connect_queue.support.arn
  }

  action {
    id   = "check-hours"
    next = "closed"
    check_hours_of_operation {
      hours_of_operation_id = "hours:support"
    }
    condition {
      operator = "Equals"
      operands = ["True"]
      next     = "set-queue"
    }
    condition {
      operator = "Equals"
      operands = ["False"]
      next     = "closed"
    }
    error {
      type = "NoMatchingError"
      next = "closed"
    }
  }

  action {
    id   = "set-queue"
    next = "transfer"
    update_contact_target_queue {
      queue_id = "queue:support"
    }
    error {
      type = "NoMatchingError"
      next = "closed"
    }
  }

  action {
    id   = "transfer"
    next = "closed"
    transfer_contact_to_queue {}
    error {
      type = "QueueAtCapacity"
      next = "closed"
    }
    error {
      type = "NoMatchingError"
      next = "closed"
    }
  }

  action {
    id   = "closed"
    next = "hang-up"
    message_participant {
      text = "We are closed. Our hours are nine to five, Monday to Friday."
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

# Offer a callback when the queue is full: the QueueAtCapacity branch sets the
# callback number to the number the caller dialed from and queues a callback.
resource "flowascode_contact_flow" "callback_when_busy" {
  instance_id = var.connect_instance_id
  name        = "callback-when-busy"
  type        = "CONTACT_FLOW"

  refs = {
    "queue:support" = aws_connect_queue.support.arn
  }

  action {
    id   = "set-queue"
    next = "transfer"
    update_contact_target_queue {
      queue_id = "queue:support"
    }
    error {
      type = "NoMatchingError"
      next = "sorry"
    }
  }

  action {
    id   = "transfer"
    next = "hang-up"
    transfer_contact_to_queue {}
    error {
      type = "QueueAtCapacity"
      next = "set-callback-number"
    }
    error {
      type = "NoMatchingError"
      next = "sorry"
    }
  }

  action {
    id   = "set-callback-number"
    next = "queue-callback"
    update_contact_callback_number {
      callback_number = "$.CustomerEndpoint.Address"
    }
    error {
      type = "InvalidCallbackNumber"
      next = "sorry"
    }
    error {
      type = "CallbackNumberNotDialable"
      next = "sorry"
    }
  }

  action {
    id   = "queue-callback"
    next = "confirm"
    create_callback_contact {
      queue_id                    = "queue:support"
      initial_call_delay_seconds  = 5
      maximum_connection_attempts = 3
      retry_delay_seconds         = 600
    }
    error {
      type = "NoMatchingError"
      next = "sorry"
    }
  }

  action {
    id   = "confirm"
    next = "hang-up"
    message_participant {
      text = "All of our agents are busy. We will call you back at this number."
    }
    error {
      type = "NoMatchingError"
      next = "hang-up"
    }
  }

  action {
    id   = "sorry"
    next = "hang-up"
    message_participant {
      text = "Sorry, we cannot take your call right now. Please try again later."
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

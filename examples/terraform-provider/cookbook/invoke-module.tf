# A flow that runs the shared greeting through its live alias, then continues.
resource "flowascode_contact_flow" "invoke_module" {
  instance_id = var.connect_instance_id
  name        = "invoke-module"
  type        = "CONTACT_FLOW"

  refs = {
    "module:greeting@live" = flowascode_contact_flow_module_alias.greeting_live.arn
    "queue:support"        = aws_connect_queue.support.arn
  }

  action {
    id   = "greeting"
    next = "set-queue"
    invoke_flow_module {
      flow_module_id = "module:greeting@live"
    }
    error {
      type = "NoMatchingError"
      next = "set-queue"
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

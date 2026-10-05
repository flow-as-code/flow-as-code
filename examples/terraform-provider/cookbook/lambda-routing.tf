# Look the caller up with a Lambda function, then route on what it returned.
# A STRING_MAP response lands in $.External, and Compare branches on one key.
resource "flowascode_contact_flow" "lambda_routing" {
  instance_id = var.connect_instance_id
  name        = "lambda-routing"
  type        = "CONTACT_FLOW"

  refs = {
    "lambda:customer-lookup" = aws_lambda_function.customer_lookup.arn
    "queue:priority"         = aws_connect_queue.priority.arn
    "queue:support"          = aws_connect_queue.support.arn
  }

  action {
    id   = "look-up"
    next = "check-tier"
    invoke_lambda_function {
      lambda_function_arn           = "lambda:customer-lookup"
      invocation_time_limit_seconds = 8
      invocation_type               = "SYNCHRONOUS"
      lambda_invocation_attributes = {
        phone = "$.CustomerEndpoint.Address"
      }
      response_validation = {
        response_type = "STRING_MAP"
      }
    }
    error {
      type = "NoMatchingError"
      next = "to-support"
    }
  }

  action {
    id   = "check-tier"
    next = "to-support"
    compare {
      comparison_value = "$.External.tier"
    }
    condition {
      operator = "Equals"
      operands = ["priority"]
      next     = "to-priority"
    }
    error {
      type = "NoMatchingCondition"
      next = "to-support"
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

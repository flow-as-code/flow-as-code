# Send a share of callers down a new path. DistributeByPercentage draws a
# number from 1 to 100; each condition takes the callers below its bound, in
# order, and NoMatchingCondition takes the rest. Here: 20% new, 80% current.
resource "flowascode_contact_flow" "percentage_split" {
  instance_id = var.connect_instance_id
  name        = "percentage-split"
  type        = "CONTACT_FLOW"

  action {
    id   = "split"
    next = "current-greeting"
    distribute_by_percentage {}
    condition {
      operator = "NumberLessThan"
      operands = ["21"]
      next     = "new-greeting"
    }
    error {
      type = "NoMatchingCondition"
      next = "current-greeting"
    }
  }

  action {
    id   = "new-greeting"
    next = "hang-up"
    message_participant {
      text = "Welcome. You are hearing our new greeting."
    }
    error {
      type = "NoMatchingError"
      next = "hang-up"
    }
  }

  action {
    id   = "current-greeting"
    next = "hang-up"
    message_participant {
      text = "Welcome."
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

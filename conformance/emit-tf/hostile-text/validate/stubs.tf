# TEST FIXTURE, not emitter output. This case sets instanceIdExpression, so the
# emitter writes no variables.tf and the instance address has to resolve here.

resource "aws_connect_instance" "main" {
  identity_management_type  = "CONNECT_MANAGED"
  inbound_calls_enabled     = true
  instance_alias            = "flow-as-code-fixture"
  outbound_calls_enabled    = false
}

resource "aws_connect_hours_of_operation" "main_line" {
  instance_id = aws_connect_instance.main.id
  name        = "main-line"
  time_zone   = "EST"

  config {
    day = "MONDAY"

    start_time {
      hours   = 8
      minutes = 0
    }

    end_time {
      hours   = 17
      minutes = 0
    }
  }
}

resource "aws_connect_queue" "appointments" {
  instance_id           = aws_connect_instance.main.id
  name                  = "appointments"
  hours_of_operation_id = aws_connect_hours_of_operation.main_line.hours_of_operation_id
}

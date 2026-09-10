# TEST FIXTURE, not emitter output. Declares the resources the address map
# points at, minimally, so the addresses in the emitted flow_refs.tf resolve.
# `var.connect_instance_id` comes from the emitted variables.tf.

resource "aws_connect_hours_of_operation" "main_line" {
  instance_id = var.connect_instance_id
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
  instance_id           = var.connect_instance_id
  name                  = "appointments"
  hours_of_operation_id = aws_connect_hours_of_operation.main_line.hours_of_operation_id
}

data "aws_lambda_function" "appointment_lookup" {
  function_name = "appointment-lookup"
}

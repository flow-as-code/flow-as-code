# TEST FIXTURE, not reader or emitter output. Declares what the case's refs
# bind, minimally, so `tofu validate` can resolve every address (task B03e).

variable "connect_instance_id" {
  type = string
}

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

data "aws_lambda_function" "appointment_lookup" {
  function_name = "appointment-lookup"
}

resource "aws_connect_queue" "appointments" {
  instance_id           = var.connect_instance_id
  name                  = "appointments"
  hours_of_operation_id = "00000000-0000-0000-0000-000000000000"
}

# The platform team's configuration for prod: it owns the hours, the queue and
# the function, and publishes their ARNs as outputs. envs/prod reads this
# state; in a real organization it is a separate repository and a remote
# backend, not a sibling directory with local state.

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

resource "aws_connect_queue" "appointments" {
  instance_id           = var.connect_instance_id
  name                  = "appointments"
  hours_of_operation_id = aws_connect_hours_of_operation.main_line.hours_of_operation_id
}

resource "aws_iam_role" "appointment_lookup" {
  name = "appointment-lookup"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Action    = "sts:AssumeRole"
      Principal = { Service = "lambda.amazonaws.com" }
    }]
  })
}

resource "aws_lambda_function" "appointment_lookup" {
  function_name = "appointment-lookup"
  role          = aws_iam_role.appointment_lookup.arn
  handler       = "index.handler"
  runtime       = "nodejs22.x"
  filename      = "appointment-lookup.zip"
}

# Connect invokes only the functions associated with the instance.
resource "aws_connect_lambda_function_association" "appointment_lookup" {
  instance_id  = var.connect_instance_id
  function_arn = aws_lambda_function.appointment_lookup.arn
}

output "main_line_hours_arn" {
  value = aws_connect_hours_of_operation.main_line.arn
}

output "appointment_lookup_arn" {
  value = aws_lambda_function.appointment_lookup.arn
}

output "appointments_queue_arn" {
  value = aws_connect_queue.appointments.arn
}

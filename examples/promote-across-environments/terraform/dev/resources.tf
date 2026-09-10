# Dev owns its supporting resources: this configuration creates them, so
# refs.dev.tfmap.json points at addresses in this same root module.
#
# `var.connect_instance_id` is declared by the emitted variables.tf. Supply it
# per environment at plan time (TF_VAR_connect_instance_id, a tfvars file your
# repo does not track, or -var), never as a checked-in default.

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

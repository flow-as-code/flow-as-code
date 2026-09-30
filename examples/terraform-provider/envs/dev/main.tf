# Dev owns its supporting resources, so this root module creates them and
# hands their ARNs to the flows module. The instance id is an input, supplied
# per environment at plan time (TF_VAR_connect_instance_id, an untracked tfvars
# file, or -var), never a checked-in default.

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

module "flows" {
  source = "../../flows"

  connect_instance_id    = var.connect_instance_id
  main_line_hours_arn    = aws_connect_hours_of_operation.main_line.arn
  appointment_lookup_arn = aws_lambda_function.appointment_lookup.arn
  appointments_queue_arn = aws_connect_queue.appointments.arn

  depends_on = [aws_connect_lambda_function_association.appointment_lookup]
}

output "appointment_line_document_sha256" {
  value = module.flows.appointment_line_document_sha256
}

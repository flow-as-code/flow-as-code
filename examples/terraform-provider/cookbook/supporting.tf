# What the recipes refer to. Each recipe is one flow, and every reference it
# makes is a key such as "queue:support", bound in the flow's refs map to an
# address below. Swap these for your own resources, or for data sources and
# remote state where another team owns them.

variable "connect_instance_id" {
  type = string
}

resource "aws_connect_hours_of_operation" "support" {
  instance_id = var.connect_instance_id
  name        = "support"
  time_zone   = "America/New_York"

  config {
    day = "MONDAY"

    start_time {
      hours   = 9
      minutes = 0
    }

    end_time {
      hours   = 17
      minutes = 0
    }
  }
}

resource "aws_connect_queue" "support" {
  instance_id           = var.connect_instance_id
  name                  = "support"
  hours_of_operation_id = aws_connect_hours_of_operation.support.hours_of_operation_id
}

resource "aws_connect_queue" "priority" {
  instance_id           = var.connect_instance_id
  name                  = "priority"
  hours_of_operation_id = aws_connect_hours_of_operation.support.hours_of_operation_id
}

resource "aws_iam_role" "customer_lookup" {
  name = "customer-lookup"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Action    = "sts:AssumeRole"
      Principal = { Service = "lambda.amazonaws.com" }
    }]
  })
}

resource "aws_lambda_function" "customer_lookup" {
  function_name = "customer-lookup"
  role          = aws_iam_role.customer_lookup.arn
  handler       = "index.handler"
  runtime       = "nodejs22.x"
  filename      = "customer-lookup.zip"
}

resource "aws_connect_lambda_function_association" "customer_lookup" {
  instance_id  = var.connect_instance_id
  function_arn = aws_lambda_function.customer_lookup.arn
}

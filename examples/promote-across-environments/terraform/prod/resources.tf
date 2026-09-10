# Prod does not own its supporting resources: a platform team creates the queue,
# the hours of operation, and the Lambda in their own configuration and publishes
# the ARNs as outputs. So refs.prod.tfmap.json points at addresses in their state
# rather than at resources here.
#
# The addresses are still addresses. Nothing in this example, in either
# environment, writes an ARN into a file: `emitTf` refuses a map value matching
# /arn:aws/i outright.

data "terraform_remote_state" "platform" {
  backend = "local"

  config = {
    path = "../platform/terraform.tfstate"
  }
}

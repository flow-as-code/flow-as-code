# The flows module's inputs: the instance, and one ARN per reference the
# flows make. Each environment's root module fills them from resources it
# manages or from state it reads. The flows never hold an ARN themselves.

variable "connect_instance_id" {
  description = "The Amazon Connect instance the flows are created in."
  type        = string
}

variable "main_line_hours_arn" {
  description = "Binds hours:main-line, the hours of operation the flow checks."
  type        = string
}

variable "appointment_lookup_arn" {
  description = "Binds lambda:appointment-lookup, the function the flow invokes."
  type        = string
}

variable "appointments_queue_arn" {
  description = "Binds queue:appointments, the queue the flow transfers to."
  type        = string
}

output "appointment_line_arn" {
  description = "The flow's ARN, for a phone number association or another flow's transfer."
  value       = flowascode_contact_flow.appointment_line.arn
}

# `flowdoc` is the flow as a FlowDoc, with its references still tokens, so it
# names no environment. Its hash is the same in every environment that applies
# the same commit, and comparing the two is how a pipeline can show that prod
# runs exactly what dev ran. `content_hash` would not do: it hashes the content
# Connect holds, in which each environment's ARNs are already filled in.
output "appointment_line_document_sha256" {
  description = "SHA-256 of the flow's FlowDoc: equal across environments running the same commit."
  value       = sha256(flowascode_contact_flow.appointment_line.flowdoc)
}

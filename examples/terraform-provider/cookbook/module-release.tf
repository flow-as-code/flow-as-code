# A version is a snapshot of the module's current content, replaced whenever
# that content changes. create_before_destroy makes the new version exist
# before the old one goes, and the alias moves to it in place in between:
# Connect refuses to delete a version an alias still points at.
resource "flowascode_contact_flow_module_version" "greeting" {
  instance_id            = var.connect_instance_id
  contact_flow_module_id = flowascode_contact_flow_module.greeting.contact_flow_module_id
  content_hash           = flowascode_contact_flow_module.greeting.content_hash
  description            = "Greeting as reviewed"

  lifecycle {
    create_before_destroy = true
  }
}

# The alias is what flows bind: its arn is the module ARN qualified by the
# alias id, the only form Connect runs as the alias.
resource "flowascode_contact_flow_module_alias" "greeting_live" {
  instance_id                 = var.connect_instance_id
  contact_flow_module_id      = flowascode_contact_flow_module.greeting.contact_flow_module_id
  name                        = "live"
  contact_flow_module_version = flowascode_contact_flow_module_version.greeting.version
  description                 = "The version callers hear"
}

# A module says which providers it needs and leaves configuring them to the
# root module that calls it, so each environment brings its own region and
# credentials.

terraform {
  required_providers {
    flowascode = {
      source  = "flow-as-code/flowascode"
      version = "~> 0.1"
    }
  }
}

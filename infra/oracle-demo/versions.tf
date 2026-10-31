terraform {
  required_version = ">= 1.6"

  required_providers {
    oci = {
      source  = "oracle/oci"
      version = "~> 9.11"
    }
  }
}

provider "oci" {
  region              = var.region
  config_file_profile = var.oci_profile
}

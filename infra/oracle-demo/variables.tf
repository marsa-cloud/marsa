variable "region" {
  type        = string
  description = "Home region of the tenancy, e.g. eu-frankfurt-1. Always Free A1 capacity only exists there."
}

variable "oci_profile" {
  type        = string
  default     = "DEFAULT"
  description = "Profile in ~/.oci/config to authenticate with."
}

variable "tenancy_ocid" {
  type = string
}

variable "compartment_ocid" {
  type        = string
  default     = null
  description = "Compartment to create everything in. Defaults to the tenancy root."
}

variable "availability_domain_index" {
  type        = number
  default     = 0
  description = "Try another AD when apply fails with 'Out of host capacity'."
}

variable "ocpus" {
  type    = number
  default = 2

  validation {
    condition     = var.ocpus >= 1 && var.ocpus <= 2
    error_message = "Always Free covers at most 2 A1 OCPUs per tenancy."
  }
}

variable "memory_in_gbs" {
  type    = number
  default = 4

  validation {
    condition     = var.memory_in_gbs >= 1 && var.memory_in_gbs <= 12
    error_message = "Always Free covers at most 12 GB of A1 memory per tenancy."
  }
}

variable "boot_volume_size_in_gbs" {
  type    = number
  default = 100

  validation {
    condition     = var.boot_volume_size_in_gbs >= 50 && var.boot_volume_size_in_gbs <= 200
    error_message = "Always Free covers 200 GB of block storage in total; OCI's minimum boot volume is 50 GB."
  }
}

variable "ubuntu_version" {
  type    = string
  default = "24.04"
}

variable "ssh_public_key" {
  type        = string
  description = "Public key for the default ubuntu user."
}

variable "ssh_allowed_cidr" {
  type        = string
  default     = "0.0.0.0/0"
  description = "Source range allowed to reach port 22. Must include GitHub-hosted runners if CD deploys over SSH."
}

variable "domain" {
  type        = string
  description = "Domain Marsa is served on, e.g. demo.marsa.cc."
}

variable "email" {
  type        = string
  description = "Let's Encrypt registration email."
}

variable "installer_ref" {
  type        = string
  default     = "main"
  description = "Git ref of marsa-cloud/marsa to fetch scripts/install.sh and scripts/cd-deploy.sh from."
}

variable "cd_deploy_public_key" {
  type        = string
  default     = ""
  description = "Public half of the CD_SSH_PRIVATE_KEY repo secret. Empty skips the forced-command deploy key (AgDR-0028)."
}

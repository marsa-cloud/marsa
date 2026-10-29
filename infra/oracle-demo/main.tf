locals {
  compartment_ocid = coalesce(var.compartment_ocid, var.tenancy_ocid)
  shape            = "VM.Standard.A1.Flex"
}

data "oci_identity_availability_domains" "this" {
  compartment_id = var.tenancy_ocid
}

data "oci_core_images" "ubuntu" {
  compartment_id           = local.compartment_ocid
  operating_system         = "Canonical Ubuntu"
  operating_system_version = var.ubuntu_version
  shape                    = local.shape
  state                    = "AVAILABLE"
  sort_by                  = "TIMECREATED"
  sort_order               = "DESC"
}

resource "oci_core_vcn" "this" {
  compartment_id = local.compartment_ocid
  display_name   = "marsa-demo"
  cidr_blocks    = ["10.0.0.0/16"]
  dns_label      = "marsademo"
}

resource "oci_core_internet_gateway" "this" {
  compartment_id = local.compartment_ocid
  vcn_id         = oci_core_vcn.this.id
  display_name   = "marsa-demo"
}

resource "oci_core_route_table" "this" {
  compartment_id = local.compartment_ocid
  vcn_id         = oci_core_vcn.this.id
  display_name   = "marsa-demo"

  route_rules {
    destination       = "0.0.0.0/0"
    destination_type  = "CIDR_BLOCK"
    network_entity_id = oci_core_internet_gateway.this.id
  }
}

resource "oci_core_security_list" "this" {
  compartment_id = local.compartment_ocid
  vcn_id         = oci_core_vcn.this.id
  display_name   = "marsa-demo"

  egress_security_rules {
    destination = "0.0.0.0/0"
    protocol    = "all"
  }

  ingress_security_rules {
    source   = var.ssh_allowed_cidr
    protocol = "6"
    tcp_options {
      min = 22
      max = 22
    }
  }

  dynamic "ingress_security_rules" {
    for_each = [80, 443]
    content {
      source   = "0.0.0.0/0"
      protocol = "6"
      tcp_options {
        min = ingress_security_rules.value
        max = ingress_security_rules.value
      }
    }
  }

  ingress_security_rules {
    source   = "0.0.0.0/0"
    protocol = "1"
    icmp_options {
      type = 3
      code = 4
    }
  }
}

resource "oci_core_subnet" "this" {
  compartment_id    = local.compartment_ocid
  vcn_id            = oci_core_vcn.this.id
  display_name      = "marsa-demo"
  cidr_block        = "10.0.0.0/24"
  dns_label         = "public"
  route_table_id    = oci_core_route_table.this.id
  security_list_ids = [oci_core_security_list.this.id]
}

resource "oci_core_instance" "marsa" {
  compartment_id      = local.compartment_ocid
  availability_domain = data.oci_identity_availability_domains.this.availability_domains[var.availability_domain_index].name
  display_name        = "marsa-demo"
  shape               = local.shape

  shape_config {
    ocpus         = var.ocpus
    memory_in_gbs = var.memory_in_gbs
  }

  source_details {
    source_type             = "image"
    source_id               = data.oci_core_images.ubuntu.images[0].id
    boot_volume_size_in_gbs = var.boot_volume_size_in_gbs
  }

  create_vnic_details {
    subnet_id        = oci_core_subnet.this.id
    assign_public_ip = true
    hostname_label   = "marsa"
  }

  metadata = {
    ssh_authorized_keys = var.ssh_public_key
    user_data = base64encode(templatefile("${path.module}/cloud-init.yaml.tftpl", {
      domain               = var.domain
      email                = var.email
      installer_ref        = var.installer_ref
      cd_deploy_public_key = var.cd_deploy_public_key
    }))
  }

  lifecycle {
    # A newer Ubuntu image or an edited cloud-init must not silently rebuild the demo.
    ignore_changes = [source_details[0].source_id, metadata]
  }
}

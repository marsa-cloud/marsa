output "public_ip" {
  value = oci_core_instance.marsa.public_ip
}

output "dns_records" {
  value = [
    "${var.domain}   A  ${oci_core_instance.marsa.public_ip}",
    "*.${var.domain} A  ${oci_core_instance.marsa.public_ip}",
  ]
}

output "install_command" {
  value = "ssh ubuntu@${oci_core_instance.marsa.public_ip} sudo marsa-install"
}

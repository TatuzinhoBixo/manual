resource "local_file" "ansible_inventory" {
  filename = "${path.module}/hosts.ini"
  content  = <<-EOT
[rke2_servers]
%{~ for name, vm in var.vms ~}
%{~ if vm.role == "server" ~}
${name} ansible_host=${split("/", vm.ip)[0]}
%{~ endif ~}
%{~ endfor ~}
[rke2_agents]
%{~ for name, vm in var.vms ~}
%{~ if vm.role == "agent" ~}
${name} ansible_host=${split("/", vm.ip)[0]}
%{~ endif ~}
%{~ endfor ~}
[all:vars]
ansible_user = ${var.vm_user}
ansible_ssh_private_key_file = ${var.ssh_private_key_path}
ansible_ssh_common_args = '-o StrictHostKeyChecking=no'
k8s_endpoint_ip = ${var.k8s_endpoint_ip}
rke2_version = ${var.rke2_version}
rke2_cni = ${var.rke2_cni}
metallb_pool_name = ${var.metallb_pool_name}
metallb_pool_name = ${var.metallb_pool_name}
metallb_ip_range = ${var.metallb_ip_range}
k8s_endpoint_dns = ${var.k8s_endpoint_dns}
EOT
}

resource "null_resource" "wait_for_ssh" {
  for_each   = var.vms
  depends_on = [proxmox_virtual_environment_vm.vms]

  triggers = {
    vm_id = proxmox_virtual_environment_vm.vms[each.key].id
    mac   = try(proxmox_virtual_environment_vm.vms[each.key].mac_addresses[1], "")
  }

  connection {
    type        = "ssh"
    host        = split("/", each.value.ip)[0]
    user        = var.vm_user
    private_key = file(var.ssh_private_key_path)
    timeout     = "10m"
  }

  provisioner "remote-exec" {
    inline = ["echo 'SSH pronto em ${each.key}'"]
  }
}

resource "null_resource" "hardening_provisioner" {
  depends_on = [null_resource.wait_for_ssh, local_file.ansible_inventory]

  triggers = {
    inventory = local_file.ansible_inventory.content
  }

  provisioner "local-exec" {
    command     = "ansible-playbook -i hosts.ini hardening.yml"
    working_dir = path.module
  }
}

resource "proxmox_virtual_environment_file" "cloud_config" {
  for_each     = var.vms
  content_type = "snippets"
  datastore_id = "local"
  node_name    = "tatuserv"

  source_raw {
    data = <<-EOF
hostname: ${each.key}
manage_etc_hosts: true
package_update: true
package_upgrade: true
users:
  - name: ${var.vm_user}
    ssh_authorized_keys:
      - ${var.ssh_public_key}
    sudo: ALL=(ALL) NOPASSWD:ALL
    shell: /bin/bash
EOF
    file_name = "cloud_config-${each.key}.yaml"
  }
}

resource "proxmox_virtual_environment_vm" "vms" {
  for_each  = var.vms
  name      = each.key
  node_name = "tatuserv"
  vm_id     = each.value.vm_id

  clone {
    vm_id = var.template_id
    full  = false
  }

  agent {
    enabled = true
  }

  cpu {
    cores = each.value.cores
    type  = "x86-64-v2-AES"
  }

  memory {
    dedicated = each.value.memory
  }

  disk {
    datastore_id = var.storage
    interface    = "virtio0"
    size         = each.value.disk_gb
    file_format  = "raw"
  }

  network_device {
    bridge = "vmbr0"
    model  = "virtio"
  }

  initialization {
    dns {
      servers = var.dns_servers
    }
    ip_config {
      ipv4 {
        address = each.value.ip
        gateway = var.gateway
      }
    }
    user_data_file_id = proxmox_virtual_environment_file.cloud_config[each.key].id
  }
}

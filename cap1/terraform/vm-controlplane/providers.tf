terraform {
  required_providers {
    proxmox = {
      source  = "bpg/proxmox"
      version = "0.46.0"
    }
    local = {
      source  = "hashicorp/local"
      version = "~> 2.0"
    }
  }
}

provider "proxmox" {
  endpoint = "https://192.168.1.229:8006" #IP do cluster
  username = var.proxmox_user #root@pam
  password = var.proxmox_password
  insecure = true # desativa o SSL self-signed
}

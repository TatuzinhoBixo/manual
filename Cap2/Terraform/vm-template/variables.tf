variable "proxmox_user" {
  description = "Usuário Proxmox"
  type    = string
  default = "root@pam"
}

variable "proxmox_password" {
  description = "Senha do proxmox"
  type      = string
  sensitive = true
}

variable "storage" {
  description = "Storage que a vm vai ser criada"
  type    = string
  default = "local"
}

variable "vm_ip" {
  description = "IP estático da vm"
  type = string
}

variable "gateway" {
  description = "Gate da rede"
  type    = string
  default = "192.168.1.1"
}

variable "dns_servers" {
  description = "Lista dos servidores dns"
  type = list(string)
  default = ["192.168.1.40", "192.168.1.1"]
}

variable "ssh_public_key" {
  description = "Chave ssh pública"
  type = string
}
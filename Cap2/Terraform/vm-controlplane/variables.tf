variable "proxmox_user" {
  type = string
  default = "root@pam"
}
variable "proxmox_password" {
  type = string
  sensitive = true
}
variable "storage"{
  type = string
  default = "local"
}
variable "template_id" {
  type = number
  default = 200
}
variable "gateway" {
  type = string
  default = "192.168.1.1"
}
variable "ssh_public_key" {
  type = string
}
variable "vm_user" {
  description = "Usuário criado nas VMs via cloud-init e usado pelo Ansible"
  type        = string
  default     = "devopstatu"
}
variable "dns_servers" {
  description = "IPs do DNS das VMS"
  type = list(string)
  default = ["192.168.1.40", "192.168.1.1"]
}
variable "template_vm_user" {
  description = "Usuário existente na VM template (201) para bootstrap inicial"
  type        = string
  default     = "tatu"
}
variable "template_vm_password" {
  description = "Senha do usuário da VM template (201)"
  type        = string
  sensitive   = true
}
variable "ssh_private_key_path" {
  description = "Caminho da chave SSH privada para acessar as VMs"
  type        = string
  default     = "/Users/tatuzinho/Documents/tatulab/iac-tatulab/controlplane-install/devopstatu"
}
variable "rke2_version" {
  description = "Versão do RKE2 a instalar (ex: latest ou v1.28.5+rke2r1)"
  type        = string
  default     = "latest"
}
variable "rke2_cni" {
  description = "Plugin CNI do Kubernetes"
  type        = string
  default     = "calico"
}
variable "k8s_endpoint_ip" {
  description = "IP do load balancer (HAProxy) para o API server"
  type        = string
  default     = "192.168.1.41"
}
variable "k8s_endpoint_dns" {
  description = "DNS do endpoint Kubernetes"
  type        = string
  default     = "kube.tatulab.com.br"
}
# Mapa de vms - estrutura principal
variable "vms" {
  description = "Mapa de VMs criadas"
  type = map(object({
  vm_id   = number # ID único do Proxmox
  ip      = string # Ip no formato x.x.x.x/x
  cores   = number # Número de CPUs
  memory  = number # RAM em MB
  disk_gb = number # Tamanho do disco
  role    = string # "server" (control plane) ou "agent" (worker)
  }))
}
variable "metallb_pool_name" {
  description = "Nome do IPAddressPool do MetalLB"
  type        = string
  default     = "pool-tatulab"
}
variable "metallb_ip_range" {
  description = "Faixa de IPs para o MetalLB atribuir a Services LoadBalancer"
  type        = string
  default     = "192.168.1.70-192.168.1.95"
}

# Fluxo do Terraform - vm-controlplane

## Visao Geral

Um unico `terraform apply` que cria 7 VMs a partir de um template Proxmox, aplica hardening CIS Level 1 e instala um cluster Kubernetes RKE2 com Calico e MetalLB.

## Arquitetura

```
Template VM 201 ("matrix")
  |
  |-- cloud-init (hostname, user devopstatu, qemu-guest-agent)
  |
  +-- Linked Clone (full = false)
       |
       +-- 3 Control Planes (301-303) -- 4 cores, 4GB RAM, 60GB disco
       |     192.168.1.42, .43, .44
       |
       +-- 4 Workers (304-307) -- 8 cores, 8GB RAM, 80GB disco
             192.168.1.45, .46, .47, .48
```

## Fluxo de Execucao

```
terraform apply
    |
    |  1. cloud_config (snippets)
    |     Cria 7 arquivos cloud-init no Proxmox (local:snippets/)
    |     - Define hostname
    |     - Cria usuario devopstatu com SSH key e sudo
    |     - Instala qemu-guest-agent
    |     - Roda package_update + package_upgrade
    |
    |  2. ansible_inventory (hosts.ini)
    |     Gera inventario Ansible com IPs e variaveis
    |
    |  3. vms (linked clones)
    |     Clona 7 VMs do template 201
    |     - Configura CPU, RAM, disco
    |     - Aplica cloud-init (IP estatico + user_data)
    |     - Aguarda qemu-guest-agent responder (~30s)
    |
    |  4. wait_for_ssh
    |     Valida SSH como devopstatu em todas as 7 VMs
    |
    |  5. hardening_provisioner
    |     |
    |     |-- ansible-playbook hardening.yml
    |     |   - Pacotes base (vim, chrony, htop, git, etc.)
    |     |   - Timezone America/Manaus
    |     |   - .vimrc personalizado
    |     |   - SSH hardening (CIS Level 1)
    |     |   - Lock usuario tatu
    |     |   - AllowUsers devopstatu
    |     |
    |     +-- ansible-playbook install-rke2-cluster.yml
    |         - Instala RKE2 nos 3 control planes
    |         - Configura kubectl
    |         - Instala RKE2 agent nos 4 workers
    |         - Instala MetalLB (192.168.1.70-95)
    |
    v
  Cluster Kubernetes pronto (7 nodes Ready)
```

## Dependencias entre Recursos

```
cloud_config ─────> vms ─────> wait_for_ssh ─────> hardening_provisioner
                                                          |
                                ansible_inventory ────────+
```

## Arquivos

| Arquivo | Funcao |
|---------|--------|
| `providers.tf` | Provider bpg/proxmox ~> 0.98.0 + conexao ao Proxmox |
| `variables.tf` | Todas as variaveis (vms, ssh, rke2, metallb) |
| `terraform.tfvars` | Valores (IPs, senha, specs das VMs) |
| `main.tf` | Recursos: cloud_config, vms, wait_for_ssh, inventory, hardening |
| `outputs.tf` | Output com IP e comando SSH de cada VM |
| `hardening.yml` | Ansible - CIS Level 1 hardening |
| `install-rke2-cluster.yml` | Ansible - RKE2 + Calico + MetalLB |
| `hosts.ini` | Gerado pelo Terraform - inventario Ansible |

## Pre-requisitos

1. **Template VM 201** no Proxmox com:
   - Ubuntu 24.04 instalado
   - cloud-init instalado (`apt install cloud-init`)
   - qemu-guest-agent instalado
   - `cloud-init clean` executado antes de converter em template
   - Netplan removido (`rm /etc/netplan/*.yaml`)
   - Convertido em template (`qm template 201`)

2. **Maquina local** (onde roda o terraform):
   - Terraform instalado
   - Ansible instalado
   - Chave SSH privada em `ssh_private_key_path`
   - Chave SSH publica em `ssh_public_key` (terraform.tfvars)

## Comando

```bash
cd cap1/terraform/vm-controlplane
terraform init
terraform apply -auto-approve
```

## Resultado

- 7 VMs rodando com IP estatico
- Usuario `devopstatu` com SSH key e sudo NOPASSWD
- CIS Level 1 hardening aplicado
- Cluster RKE2 com 3 control planes + 4 workers
- Calico CNI
- MetalLB com pool 192.168.1.70-95
- kubectl configurado nos control planes

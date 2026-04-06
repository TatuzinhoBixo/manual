# Guia para adaptação do ambiente - vm template

Este documento descreve todos os parâmetros e variáveis que precisam ser ajustados ao implantar este projeto em um ambiente diferente do original 

## 1. Visão geral do projeto - VM TEMPLATE

O `vm-template` provisiona via **Terraform** uma vm UBUNTU 24.4 no **Proxmox VE** utilizando o **Cloud-Init** para a configuração inicial do sistema operacional. A VM é criada com o iP estático, usuário do ssh pré configurado e o `qemu-gest-agetn` instalado.

**Stack Utilizadas**
- Terraform `1.5.7`
- Provider `bgp/proxmox` versão `0.46.0`
- Ubuntu 24.04 LTS

---

## Estrutura dos arquivos

```vm-template/
├── main.tf                         # Recursos principais: Cloud-Init + VM
├── providers.tf                    # Configuração do provider Proxmox
├── variables.tf                    # Declaração das variáveis
├── terraform.tfvars                # Valores das variáveis ( por ambiente )
├── terraform.tfstate               # Estado do Terraform ( não versionar)
├── terraform.tfstate.backup        # Backup do estado
├── devopstatu                      # Chave ssh privada ( não versionar )
├── adaptação-ambiente.md           # Este arquivo
```

---

## Variáveis que ``DEVEM`` ser alteradas por embiente

### 1. `providers.tf`  - Conexão com o Proxmox

```hcl
provider "proxmox" {
  endpoint = "https://192.168.1.229:8006" # Ip do servidor proxmox, alterar se necessário
  username = var.proxmox_user             # default: root@pam, alterar se necessário
  password = var.proxmox_password
  insecure = true                         # desativa a verificação do ssl
}
```

---

### 2. `terraform.tfvars` - Valores das Variáveis

Este é o arquivo principal a ser alterado em cada embiente, **Não comitar as credenciais reais em repositórios públicos.**

```hcl
proxmox_password =  "Arreto23"                        # senha do proxmox
vm_ip            =  "192.168.1.99                     # IP estático da VM
gateway          =  "192.168.1.1"                     # IP gateway
dns_servers      =  ["192.168.1.40, "192.168.1.1"]    # DNS
ssh_public_key   =  "ssh-rsa AAA..."                  # chave ssh
storage          =  "ssdhp"                           # storage do proxymax
```

> **Dica** Em vez de colocar a senha diretamente no `terraform.tfvars`, use variável de ambiente
> ```bash
> export TF_VAR_proxmox_password=<senha>
> ```
> Remova a linha `proxmox_password` do arquivo `.tfvars`.

---

### 3. `main.tf`- Configuração da VM

Os valores abaixo estão **hardcoded** no arquivo e precisam ser editados manualmente:

```hcl
resource "proxmox_virtual_environment_file" "cloud_config"{
  node_name = "tatuserv"    # nome do proxmox
  ...
}

resouce "proxmox_virtaul_environment_vm" "ubunut_vm" {
  name  = "ubuntu-terraform-ex01" # nome da vm
  node_name = "tatuserv"          # nome do prxomox
  vm_id = 200                     # id único da VM do proxmox
  ...
  disk {
    datastore_id    = var.storage
    file_id         = "local:iso/ubuntu-24.04-cloudimg-amd64.img"     # Imagem no Proxymox
    size            = 40                                              # tamanho do disco
  }
  netword_device {
    brigge = "vmbr0"                                                  # tipo da rede
  }
}
```

#### Recursso de hardware

```hcl
cpu {
  cores = 2
  type = "x86-64-v2-AES"
}
memory {
  dedicated = 2048 # em mb
}
```

---

### 4. `variables.tf" - valores padrão

Os `default` neste arquivo são os valores usados quando a variável **não** está definida no `terraform`, revise os padrões do novo ambiente:

```hcl
variable "proxmox_user" {
  default = "root@pam"                          # altere o nome do usuário proxmox
}
variable "storage" {
  default = "local"                             # altere para o storage padrão do novo ambiente
}
variable "gateway" {
  default = "192.168.1.1"                       # altere o gateway
}
variable "dns_servers" {
  default = ["192.168.1.40", "192.168.1.1"]     # altere o dns
}
```

---

### 5. cloud-init - usuário do sistema operacional

Definido inline em `main.tf`, no bloco `source_raw`:

```yaml
users:
  - default
  - name: tatu      # usuário criado na vm
    group:
      - sudo
    shell: /bin/bash
    ssh_authorized_keys
      - ${var.ssh_public_key}
```

---

## Pré-requisitos do ambiente de destino
| requisito | observação |
|---|---|
| **proxmox** | versão compatível com o provider `bgp/proxmox 0.46.0` |
  **imagem cloud**| a imagem `ubuntu-24.04-cloudimg-amd64.img` deve estar no datastore `local:iso"do proxmox, para baixar, `https://cloud-images.ubuntu.com/noble/current/noble-server-cloudimg-amd64.img` |
| **Storage** "snippets" habilitado | O datastore `local` deve ter o tipo `snippets` habilitado |
| **iP livre na rede** | O ip definido em `vm_ip` deve está disponível | 
| **Bridge de rede configurada** | A bridge `vmbr0` deve existir no proxmox | 
| **Terraform >= 1.5.7** | Instalar localmente na máquina |
| **Acesso https ao proxmox** | Porta `8006` acessível da máquina local ao servidor Proxmox |

---

## Usando a imagem do Cloud Image no Proxmox

Se a imagem ainda não estiver no Proxmox, há duas formas:

**Opção 1** - Upload manual
Faça na vm local
```bash
wget https://cloud-images.ubuntu.com/noble/current/noble-server-cloudimg-amd64.img
```

**Opção 2** - Via Terraform (arquvio `main.tf`):
Descomente o bloco `proxmox_virtual_environment_download_file` em `main.tf` e ajuste o `file_id` da VM para referenciar esse recurso.

---

## Checklist de atulização

- [ ] Atulizar `endpoint` em `providers.tf` com IP do novo Promox
- [ ] Verificar/Atualizar `insecure` em `providers.tf` (considere `false` com TLS válido)
- [ ] Atualizar `proxmox_password` em `terrraform.tfvars` (ou user variável de ambiente)
- [ ] Atualizar `vm_ip` com IP livre na zona da rede
- [ ] Atualizar `gateway` com o gateway da nova rede
- [ ] Atualizar `dns_servers` com os DNS da nova rede
- [ ] Atualizar `ssh_public_key` com a sua chave ssh
- [ ] Atualizar `storage` com o nome do datastore disponível no novo Proxmox
- [ ] Verificar/Atualizar `node_name` (`tatuserv`) em `main.tf`
- [ ] Verificar/Atualizar `vm_id` (`200`) - garantir que não está em uso no proxmox
- [ ] Verificar/Atualizar `bridge` (`vmbr0`) - confirmar o nome da rede
- [ ] Confirmar que a imagem `ubuntu-24.04-cloudimg-amd64.img` está no Proxmox
- [ ] Confirmar que o datastore `local` tem o tipo `snippets` habilitado
- [ ] **Não commitar `devopstatu` e `terraform.tfvars` com senhas reais em repositórios públicos

---

Resumo visual

```
┌─────────────────────────────────────────────────────────────┐
│                    Novo Ambiente                             │
│                                                             │
│   Sua máquina local                                         │
│   └── terraform apply                                       │
│       └── Conecta via HTTPS em: <endpoint>                  │
│           (providers.tf → https://<NOVO_IP_PROXMOX>:8006)   │
│                                                             │
│   Proxmox VE (<NOVO_IP_PROXMOX>)                            │
│   └── Nó: <node_name>                                       │
│       ├── Upload cloud-config.yaml → datastore local        │
│       └── Cria VM                                           │
│           ├── Nome: <name>  ID: <vm_id>                     │
│           ├── Disco: <storage> / 40GB                       │
│           ├── RAM: 2048 MB   CPU: 2 cores                   │
│           ├── Rede: bridge <bridge>                         │
│           └── Cloud-Init:                                   │
│               ├── IP: <vm_ip>                               │
│               ├── GW: <gateway>                             │
│               ├── DNS: <dns_servers>                        │
│               └── Usuário: tatu + chave SSH pública         │
└─────────────────────────────────────────────────────────────┘
```

## 2. Visão geral do projeto - Cluster Kubernets 

### Variáeis 
Terraform com ansible para construção de um cluster kubernets, essas variáveis servem para esse tarefa

```yaml
rke2_version = `latest` ou a versão por exemplo `v1.28.5+rke2r1`
rke2_cni = `calico`
rke2_endpoint_ip = `<IP>` Ip do cluster
rke2_endpoint_dns = `<dns.dominio.br>` dns do dominio
metall_pool_name = `<nome-pool>`
metallb_ip_range = `<ip-inicio>-<ip-final>`
```

---

### Sobre o mapa das vms:

Como se criar um conjunto de vms com suas configurações de hardware customizadas, nessa descrição temos uma vm que tem a função de server e outra de work

```hcl
vms = {
  "vm-controlplane" {
    vm_id = <id>
    ip = "<ip>"
    cores = <cores>
    memory = <mb>
    disk_gb = <gb>
    role = "server"
  }
  "vm-work" {
    vm_id = <id>
    ip = <ip>
    cores = <cores>
    memory = <mb>
    disk_gb = <gb>
    role = "agent"
  }
}
```

---

### Asssuntos sobre o `main.tf`
Nesse código agora está criando automaticamete um arquivo de inventário do ansible `hosts.ini` com essa estrutura:
┌──────────────────────────────────┐
│[rke2_servers]                    │
│master-01 ansible_host=10.0.0.1   │
│master-02 ansible_host=10.0.0.2   │
│                                  │
│[rke2_agents]                     │
│worker-01 ansible_host=10.0.0.10  │
└──────────────────────────────────┘
Outra sessão é a `[all:vars]`, onde informa ao Ansible como se conectar e quais configurações utilizar

---

### Clone full
Caso as novas vms sejam clones completos é necessário alterar o campo:

```hcl
clone {
  vm_id = var.template_id
  full  = true
}
```

Além dessa alteração, talvez a vm matriz não tenha instalado o cloud-init, para que isso ocorra adicione na vm
sudo apt update && sudo apt install cloud-init -y

---

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

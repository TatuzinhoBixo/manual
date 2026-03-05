# Guia para adaptação do ambiente - vm template

Este documento descreve todos os parâmetros e variáveis que precisam ser ajustados ao implantar este projeto em um ambiente diferente do original 

## Visão geral do projeto

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

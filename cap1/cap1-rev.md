# Terraform 

## FASE UM - Cloud-init

Manual para terraform, usando o proxymox, rede vmbr0 e ips 192.168.1.x, storage chamado local mas está configurável
Utilizando o provider chamado bpg/proxmox. Utilizando o Cloud-init

## Estrutura do projeto

-----------------------
Arquivos geralmente tem a extensão .tf, organizados em um diretório.

| Arquivo | Função |
| :--- | --- |
| **main.tf** | Recursos principais que será criado | 
| **variables.tf** | Declarações de variáveis do projeto |
| **terraform.tfvars** | Valores das variáveis (não versionar senha) |
| **outputs.tf**  | O que exibir após o apply (IP, IDS, etc) |
| **providers.tf** | Configuração do provider | 
| **terraform.tfstate** | Estado atual da infraestrutura (Nunca apagar) | 

## Ciclo de vida
\# 1. Inicializa o projeto, (baixa plugins/providers)

```bash
terraform init
```

\# 2. Mostra oque será feito
```bash

terraform plan
```

\# 3. Aplica as mudanças

```bash
terraform apply
```

\# 4. Destroy o que foi feito pelo Terraform

```bash
terraform destroy
```

### **Dica**

1. Sempre execular o terraform plam antes do apply
2. O sinal de + indica criação, - indica remoção

## Configuração inicial 

Antes de começar, configure o ambiente uma única vez que será aprovietada nos exemplos.

### Pré-requisitos

1. Terraform instalado
2. Acesso ssh ao Proxmox
3. Credenciais do Proxmox ou API Token

## Instalação do Terraform

```bash
wget -O- https://apt.releases.hashicorp.com/gpg | sudo gpg --dearmor -o /usr/share/keyrings/hashicorp-archive-keyring.gpg

echo 'deb [signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] https://apt.releases.hashicorp.com $(lsb_release -cs) main' | sudo tee /etc/apt/sources.list.d/hashicorp.list

sudo apt update && sudo apt install terraform -y

terraform version
```

#### Descobrindo o storage correto

Para descobri o nome do storage, antes de iniciar qualquer aplicação se deve executar

```bash
pvesm status
```
habilitar snippets no storage local do Proxmox. No SSH do Proxmox, rode:

```bash
pvesm set local --content backup,iso,vztmpl,snippets
```

No Terraform, você define o storage como variável facilitando a troca sem alterar o código principal
**variables.tf**

```yaml
variablle "storage" {
description = "Nome do storage no Proxmox"
type = string
default = "local"}
```

Para trocar o storage, basta alterar no **terraform.tfvars**:

```yaml
storage = "ssd-dados"
```

### Por que usar a variável para o storage?

Quando se tem muitos storages com caracteristicas diferentes, cada vm pode ter suas necessidades, de ser em disco ou ssh.
Usando a variável, você muda um único vallor no terraform tfvars e todos os recursos passam a usar esse storage. Sem essa variável, teria que alterar os recursos manualmente.

## Estrutura do projeto

| Arquivo | Função | 
| :-- | -- |
| providers.tf | Confiração do privider |
| variables.tf | Declaração de variáveis |
| terraform.tfvars | Valores das variáveis |
| main.tf | Recurso da VM
| outputs.tf | Exibir IP após a configuração

### O arquivo providers.tf (base das atividades)

Crie o arquivo e reutilize em todos os projetos:
**providers.tf**

```yaml
terraform {
  required_providers {
    proxmox = {
      source = "bpg/proxmox"
      version = "0.46.0"
    }
  }
}

provider "proxmox" {
  endpoint = "https://<IP>:8006" #IP do cluster
  username = var.proxmox_user #root@pam
  password = var.proxmox_password
  insecure = true # desativa o SSL self-signed
}
```

### **Recomendação: Nunca coloque senahs no .tf

Sempre use variáveis para as credenciais, o arquivo terraform.tfvars com as senahs devem está no .gitignore
Em produção, use variáveis de ambiente:

```bash
TF_VAR_proxmox_password=<SENHA>
```

> Ubuntu com Cloud-Init
Nessa atividade, é criada uma VM Ubuntu no Proxymox baixando uma imagem com o Cloud-Init, que se trata de um sistema de inicialização usando imgens da nuvem (Ubuntu, Debian entre outros)
Na primeira inicialização é executado as configurações de criação do usuário, injeta as chaves SSH, define o hostname, configura pacotes e rede.
A imagem do Ubuntu Clod é compacta e pronta para uso.
URL da imagem
> Após baixar a imagem, e se for executar novamente, alterar **resource "proxmox_virtual_environment_download_file"** para não fazer o downlaod novamente

```yaml
https://cloud-images.ubuntu.com/jammy/current/jammy-server-cloudimg-amd64.img
```

### Arquivo variables

**variables.tf**

```yaml
variable "proxmox_user" {
  description = "Usuário Proxmox"
  type = string
  default = "root@pam"
}

variable "proxmox_password" {
  description = "Senha do proxmox"
  type = string
  sensitive = true #Ocultar o valor nos logs
}
variable "storage" {
  description = "Storage onde a VM será criada"
  type = string
  default = "local"
}
variable "vm_ip" {
  description = "IP estático da vm"
  type = string
}
variable "gateway" {
  description = "Gateway da rede"
  type = string
  default = "<GATEWAY>"
}
variable "dns_servers"{
  description = "Lista dos servidores DNS"
  type = list(string)
  default = ["<DNS1>", "<DNS2>"]
}
variable "ssh_public_key" {
  description = "Chave ssh pública"
  type = string
}
```

### Arquivo terraform.tfvars

**terraform.tfvars**

```yaml
proxmox_password = "<SENHA>"
vm_ip = "<IP>/<MASK>"
gateway = "<GW>"
dns_servers = ["<DNS1>", "<DNS2>"]
ssh_public_key = "<SSH_KEY>"
#Para mudar o storage opcionais
storage = "<STORAGE>"
dns_servers = "["<DNS1>", "<DNS2>"]
gateway = "<GW>"
```

### Arquivo principal main.ft

**main.tf**

```yaml
# Faz o downlaod e envia para o proxmox, COMENTAR ESSE BLOCO resource TODO CASO JÁ TENHA BAIXADO A IMAGEM
resource "proxmox_virtual_environment_download_file" "ubuntu_cloud_image" {
  content_type = "iso"
  datastore_id = "local"
  node_name = "tatuserv"
  #URL da imagem Ubuntu 24
  url = "https://cloud-images.ubuntu.com/noble/current/noble-server-cloudimg-amd64.img"
  # Nome com que o arquivo ficará no Proxmox
  file_name = "ubuntu-24.04-cloudimg-amd64.img"
  # Não baixa se o arquivo já existir
  overwrite = true
}

# Cloud-Init - Instala o qemu-guest-agent e configura o usuário
resource "proxmox_virtual_environment_file" "cloud_config" {
  content_type = "snippets"
  datastore_id = "local"
  node_name    = "tatuserv"

  source_raw {
    data = <<-EOF
#cloud-config
users:
  - default
  - name: ubuntu
    groups:
      - sudo
    shell: /bin/bash
    ssh_authorized_keys:
      - ${var.ssh_public_key}
package_update: true
package_upgrade: true
packages:
  - qemu-guest-agent
runcmd:
  - systemctl enable qemu-guest-agent
  - systemctl start qemu-guest-agent
EOF

    file_name = "cloud-config.yaml"
  }
}

resource "proxmox_virtual_environment_vm" "ubuntu_vm"{
  name = "ubuntu-terraform-ex01"
  node_name = "tatuserv"
  vm_id = 200 # ID único da VM do proxmox
  agent {
    enabled = true
  }
  # Configuração de hardware
  cpu {
    cores = 2
    type = "x86-64-v2-AES"
  }
  memory {
    dedicated = 2048 #2GB de RAM
  }
  # Disco pricipal - Usa a imagem do Cloud-Init
  disk {
    datastore_id = var.storage
    file_id = proxmox_virtual_environment_download_file.ubuntu_cloud_image.id # baixa a imagem pela primera vez
   #file_id = "local:iso/ubuntu-24.04-cloudimg-amd64.img" #no caso de um projeto posterior e que se possa usar a mesma imagem já baixada
    interface = "virtio0"
    size = 20 #20 Gb
  }
  #Interface de rede
  network_device {
    bridge = "vmbr0"
    model = "virtio"
  }
  #Configuração do Cloud-Init
  initialization {
    user_data_file_id = proxmox_virtual_environment_file.cloud_config.id

    dns {
      servers = var.dns_servers
    }
    ip_config {
      ipv4 {
        address = var.vm_ip # ex: 192.168.1.230/24
        gateway = var.gateway
      }
    }
  }
  lifecycle {
    ignore_changes = [
      # ignora mudanças no network_device após a criação, evita a recriação desncesssária
    ]
  }
}
```

### Saídas outputs.tf

**outputs.tf**

```yaml
output "vm_id" {
  description = "ID da VM no Proxmox"
  value = proxmox_virtual_environment_vm.ubuntu_vm.vm_id
}
output "vm_ip" {
  description = "IP configurado na VM"
  value = var.vm_ip
}
output "ssh_command" {
  description = "Comando para acessar a VM via SSH"
  value = "ssh ubuntu@${split("/", var.vm_ip) [0] }"
}
```

Comando para saber o status 
Geral

```bash
terraform state list
```

De uma forma mais detalhada

```bash
terraform show
```

> Cuidado ao usar o terraform destroy, pois isso remove a imagem já baixada podendo influenciar em projetos posteriores.
Se quiser manter a imagem ao destruir, você pode remover ela do state antes:

```bash
terraform state rm proxmox_virtual_environment_download_file.ubuntu_cloud_image 
```

> Depois disso
> 
```bash
terraform destroy
```

apaga a VM e o cloud-config, mas não mexe na imagem.

## Fase 2 Template

Exercício 2 do terraform, onde se é usado um template

### O arquivo providers.tf (base das atividades)

Crie o arquivo e reutilize em todos os projetos:
**providers.tf**

```yaml
terraform {
  required_providers {
    proxmox = {
      source = "bpg/proxmox"
      version = "0.46.0"
    }
  }
}

provider "proxmox" {
  endpoint = "https://<IP>:8006" #IP do cluster
  username = var.proxmox_user #root@pam
  password = var.proxmox_password
  insecure = true # desativa o SSL self-signed
}
```

**variables.tf**

```yaml
variable "proxmox_user" {
  type = string
  default = "root@pam"
}
variable "proxmox_password" {
  type = string
  sensitive = true
}
variable "storage" {
  description = "Storage onde o clone será craido"
  type = string
  default = "local"
}
variable "template_id" {
  description = "ID da VM template no Proxymox"
  type = number
  default = <ID-VM-TEMPLATE>
}
variable "vm_id" {
  description = "ID da vm nova"
  type = number
  default = 201
}
variable "vm_name"{
  description = "Nome da VM"
  type = string
  default = "ubuntu-ex02"
}
variable "vm_ip" {
  description = "IP estático da vm EX: 192.168.1.230/24"
  type = string
}
variable "gateway" {
  type = string
  default = "192.168.1.1"
}
variable "ssh_public_key" {
  type = string
}
variable "dns_servers" {
  description = "IPs do DNS das VMS"
  type = list(string)
  default = ["<DNS1", "<DNS2>"]
}
```

> Para descobri o nome do storage, antes de iniciar qualquer aplicação se deve executar

```bash
pvesm status
```

**terraform.tfvars**

```yaml
#Obrigatória (sem o default no variables.tf)
proxmox_password = "<SENHA>"
vm_ip = "<IP>/<MASK>"
ssh_public_key = "<KEY>"

#Opcionais
template_id = <ID-VM-TEMPLATE>
vm_id = <ID>
vm_name = "<NOME>"
gateway = "<GW>"
storage = "<STORAGE>"
```

**main.tf**

```yaml
resource "proxmox_virtual_environment_vm" "ubuntu_clone" {
  name = var.vm_name
  node_name = "tatuserv"
  vm_id = var.vm_id

# Define a origem como clone template
clone {
  vm_id = var.template_id
  full = true #VM COMPLETA COM DISCO, false faz um link do disco
  }
  #Sobrescrete a configuração do template
  cpu {
    cores = <CORES>
    type = "x86-64-v2-AES"
  }
  memory {
    dedicated = <MB> #dão em MB o Ram
  }
  #Redimenciona o disco clonado
  disk {
    datastore_id = var.storage
    interface = "virtio0"
    size = <TAMANHO>
    file_format  = "raw"
  }
  network_device {
    bridge = "vmbr0"
    model = "virtio"
  }
# Cloud-Init sobrescreve as configurações do template
initialization {
  dns { 
      servers = var.dns_servers
  }
  ip_config {
    ipv4 {
      address = var.vm_ip
      gateway = var.gateway
    }
  }
user_account {
  username = "<USER>"
  keys = [var.ssh_public_key]
  }
}
}

Por fim 
**outputs.tf**
output "vm_id" {
  value = proxmox_virtual_environment_vm.ubuntu_clone.vm_id
}
output "ssh_command" {
  value = "ssh <USER>@${split("/", var.vm_ip)[0]}"
}
```

Este é o exercício mais avançado. Você definirá um mapa de VMs em
variável e o Terraform criará todas elas automaticamente, cada uma com
nome, IP e hardware específicos.

Sim, isso é possível --- e é exatamente o que diferencia IaC de criar
VMs manualmente.

# Fase 3 Multiplas VMs

Este é o exercício mais avançado. Você definirá um mapa de VMs em variável e o Terraform criará todas elas automaticamente, cada uma com nome, IP e hardware específicos.
Sim, isso é possível --- e é exatamente o que diferencia IaC de criar VMs manualmente.
O que vamos fazer:

| Instrução | Descrição |
| --- | --- |
| for_each | Como interar sobre um mapada de objetos |
| object type | Como definir variáveis com estrutura complexa |
| Output dinâmicos | Como exibir informações de múltiplos recursos criados |

**Conceito: for_each**
O for_each é equivalente a um loop. Em vez de copiar e colar o mesmo
resource N vezes, você define o resource uma vez e passa um mapa com as
variações:

```yaml
# Sem for_each (ruim --- repetitivo):

  resource \"proxmox_virtual_environment_vm\" \"vm_01\" { \... }

  resource \"proxmox_virtual_environment_vm\" \"vm_02\" { \... }

  resource \"proxmox_virtual_environment_vm\" \"vm_03\" { \... }

  \# Com for_each (correto --- uma única definição):

  resource \"proxmox_virtual_environment_vm\" \"vms\" {

  for_each = var.vms

  name = each.key \# chave do mapa (ex: \'vm-web\')

  vm_id = each.value.vm_id \# valor do mapa

  }
```

**Estrutura do Projeto**
providers.tf
variables.tf
terraform.tfvars
main.tf
output.tf
Vamos então para o conteúdo dos arquivos

**variables.tf**

```yaml
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
  default = <ID-VM-TEMPLATE>
}
variable "gateway" {
  type = string
  default = "<GW>"
}
variable "ssh_public_key" {
  type = string
}
variable "dns_servers" {
  description = "IPs do DNS das VMS"
  type = list(string)
  default = ["<DNS1", "<DNS2>"]
}
# Mapa de vms - estrutura principal
variable "vms" {
  description = "Mapa de VMs criadas"
  type = map(object({
  vm_id = <NUMERO> # ID único do Proxmox
  ip = string # Ip no formato x.x.x.x/x
  cores = <CORES> # Número de CPUs
  memory = <MB> # RAM em MB
  disk_gb = <GB> # Tamanho do disco
  }))
}
```

Arquivo terraform.tfvars, Aqui você define quantas VMs quiser, cada uma com configurações idenpedentes. Para adicionar ou remover VMs, basta editar o arquivo.
Para saber o ID do storage, no proxmox

```bash
pvesm status
```

**terraform.tfvars**

```yaml
#Obrigatórias (sem default no variables.tf)
proxmox_password = "<SENHA>"
ssh_public_key = "CHAVE"
#Opcionais (Já tem no default - so informe se for sobrescrever)
#gateway = <GW>
#template_id = <ID-VM-TEMPLATE>
#storage = "<STORAGE>"
vms = {
  "<PREFIXO>-<FUNCAO1>" = {
    vm_id = <ID-VM1>
    ip = "x.x.x.x/x"
    cores = <CORES>
    memory = <RAM> #Número de RAM em MB
    disk_gb = <GB> #Tamanho do disco
  }
  "<PREFIXO>-<FUNCAO2>" = {
    vm_id = <ID-VM2>
    ip = "x.x.x.x/x"
    cores = <CORES>
    memory = <RAM>
    disk_gb = <GB>
  }
}
```

Main - com multiplas VMs com for_each

**main.tf**

```yaml
resource "proxmox_virtual_environment_vm" "vms" {
# Itera sobre cada entrada do mapa var.vms
  for_each = var.vms
  # each.key = nome da VM <PREFIXO>-<NOME>
  # each.value = objeto com configurações
  name = each.key
  node_name = "tatuserv"
  vm_id = each.value.vm_id
  clone {
    vm_id = var.template_id
    full = true
  }
  cpu {
    cores = each.value.cores
    type = "x86-64-v2-AES"
  }
  memory {
    dedicated = each.value.memory
  }
  disk {
    datastore_id = var.storage
    interface = "virtio0"
    size = each.value.disk_gb
    file_format  = "raw"
  }
  network_device {
    bridge = "vmbr0"
    model = "virtio"
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
  user_account {
    username = "ubuntu"
    keys = [var.ssh_public_key]
  }
  }
}
```

Por fim o output

**outputs.tf**

```yaml
output "vms_info" {
  description = "Informações das VMS criadas"
  value = {
    for name, vm in proxmox_virtual_environment_vm.vms : name => {
      vm_id = vm.vm_id
      ip = vm.initialization[0].ip_config[0].ipv4[0].address
      ssh_command = "ssh <user>@${split("/",vm.initialization[0].ip_config[0].ipv4[0].address)[0]}"
      } 
    }
}
```

### Adicinando uma nova vm

Caso precise, para adicionar uma nova VM, basta adicionar uma entrada nova no terraform.tfvars e executar o **terraform apply** novamente, o Terraform só criará o que foi novo, as vms existentes não vão ser alteradas

### Removendo uma vm

Para remove uma mv criada, retire a entrada no arquivo **terrraform.tfvars** e execute o **terraform apply**. O Terraform mostrará no plan que uma vm vai ser destruida, confirme com "yes" que ela será excluída e removida. **O disco será removido, faça o backup**

## Comandos úteis

| Comandos | Função
| --- | --- | 
| teraform init | Incilializa o projeto e baixa os providers |
| terraform plan | Mostra oque será feito |
| terraform apply | Aplica as mudanças |
| terraform apply -auto-approve | Aplica sem pedir confirmação |
| terraform destroy | Remove toda a infraestrutura | 
| terraform output | Exibe o output do status atual |
| terraform show | Mostra o estado atual detalhado |
| terraform state list | Lista todos os recursos no estado |
terraform validate | Valida a sintaxe dos arquivos .tf |
| terramor fmt | Formata os arquivos .tf |
| terraform import |proxmox_virtual_environment_download_file.nome_do_resource "local:iso/nome-do-arquivo.iso" |
| Importa uma imagem que já foi baixada em outro projeto | **comando de import usando o ID no formato <node>/<datastore>/<content_type>/<filename>:** |
| 

**terraform import**

proxmox_virtual_environment_download_file.nome_do_resource "local:iso/nome-do-arquivo.iso"** |

Exemplo de importação de imagem

```bash
terraform import proxmox_virtual_environment_download_file.ubuntu_cloud_img \
  "tatuserv/local/iso/noble-server-cloudimg-amd64.img"
```

## Problemas e soluções

| Problema | Solução |
| --- | --- |
| 401 Unauthorized | Verifique proxmox_user e proxmox_password no tfvars |
| VM ID already existe | Altere o vm_id no tfvars para um ID não utilizado |
| storage not found | Execute pvesm status no Proxmox e ajuste a var storage |
| vm criada em IP | Verifique se o Cloud-Init está habilitado no template |
| terraform plan não muda nada | Estado não sincorinizado | 

## Recomendação

usar o .gitignore para os arquivos que tem senha *.tfvars

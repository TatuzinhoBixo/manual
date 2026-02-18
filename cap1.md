**TERRAFORM**

Apostila Prática para DevOps / SysAdmin

Proxmox VE 8.x • Cloud-Init • Infrastructure as Code

**Ambiente:**

Node: tatuserv

Storage: local (configurável)

Rede: vmbr0 • 192.168.1.x

tatulab.com.br • 2025

**Introdução**

Esta apostila é direcionada a profissionais de DevOps e SysAdmin que já
conhecem Linux, Kubernetes e ambientes de virtualização, mas ainda não
têm familiaridade com Infrastructure as Code (IaC).

Todos os exercícios são voltados para o Proxmox VE 8.x usando o provider
bpg/proxmox, que é o provider mais atualizado e compatível com o PVE 8.

**Provider: bpg/proxmox**

Existe mais de um provider Terraform para Proxmox. Esta apostila usa o
bpg/proxmox (github.com/bpg/terraform-provider-proxmox) pelas seguintes
razões:

• Suporte completo ao Proxmox VE 8.x

• Suporte nativo a Cloud-Init

• Desenvolvimento ativo com atualizações frequentes

• Documentação detalhada

**Estrutura de um projeto Terraform**

Todo projeto Terraform é composto por arquivos .tf organizados em um
diretório. Os arquivos mais comuns são:

  ----------------------------------- -----------------------------------
  **Arquivo**                         Propósito

  ----------------------------------- -----------------------------------

  ----------------------------------- -----------------------------------
  **main.tf**                         Recursos principais --- o que será
                                      criado

  ----------------------------------- -----------------------------------

  ----------------------------------- -----------------------------------
  **variables.tf**                    Declaração das variáveis usadas no
                                      projeto

  ----------------------------------- -----------------------------------

  ----------------------------------- -----------------------------------
  **terraform.tfvars**                Valores das variáveis (não
                                      versionar com senhas)

  ----------------------------------- -----------------------------------

  ----------------------------------- -----------------------------------
  **outputs.tf**                      O que exibir após o apply (IPs,
                                      IDs, etc.)

  ----------------------------------- -----------------------------------

  ----------------------------------- -----------------------------------
  **providers.tf**                    Configuração do provider (versão,
                                      autenticação)

  ----------------------------------- -----------------------------------

  ----------------------------------- -----------------------------------
  **terraform.tfstate**               Estado atual da infraestrutura ---
                                      NUNCA apagar

  ----------------------------------- -----------------------------------

**Ciclo de vida básico**

  -----------------------------------------------------------------------
  \# 1. Inicializa o projeto (baixa plugins/providers)

  terraform init

  \# 2. Mostra o que SERÁ feito, sem executar nada (dry-run)

  terraform plan

  \# 3. Aplica as mudanças

  terraform apply

  \# 4. Destroi tudo que foi criado pelo Terraform

  terraform destroy
  -----------------------------------------------------------------------

+-----------------------------------------------------------------------+
| **Dica: terraform plan é seu melhor amigo**                           |
|                                                                       |
| Sempre execute terraform plan antes do apply.                         |
|                                                                       |
| Ele mostra exatamente o que será criado, modificado ou destruído ---  |
| equivalente ao \--dry-run do kubectl.                                 |
|                                                                       |
| Um sinal de + no output indica criação, - indica remoção, \~ indica   |
| modificação.                                                          |
+-----------------------------------------------------------------------+

**Configuração Inicial**

Antes de qualquer exercício, configure o ambiente uma única vez. Esta
configuração será reaproveitada em todos os exercícios.

**Pré-requisitos**

• Terraform instalado (v1.5+ recomendado)

• Acesso SSH ao Proxmox (tatuserv)

• Credenciais do Proxmox (usuário/senha ou API Token)

**Instalação do Terraform**

  -----------------------------------------------------------------------
  \# Debian/Ubuntu

  wget -O- https://apt.releases.hashicorp.com/gpg \| sudo gpg \--dearmor
  \\

  -o /usr/share/keyrings/hashicorp-archive-keyring.gpg

  echo \'deb
  \[signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg\] \\

  https://apt.releases.hashicorp.com \$(lsb_release -cs) main\' \\

  \| sudo tee /etc/apt/sources.list.d/hashicorp.list

  sudo apt update && sudo apt install terraform -y

  \# Verificar instalação

  terraform version
  -----------------------------------------------------------------------

**Descobrindo o storage correto no Proxmox**

Seu Proxmox tem múltiplos storages. Antes de qualquer exercício,
identifique qual usar com o comando abaixo executado no próprio host
Proxmox:

  -----------------------------------------------------------------------
  \# Execute no tatuserv via SSH

  pvesm status

  \# Saída esperada (exemplo):

  \# Name Type Status Total Used Available

  \# local dir active 50000000 15000000 35000000

  \# local-lvm lvmthin active 200000000 80000000 120000000

  \# ssd-dados dir active 500000000 100000000 400000000
  -----------------------------------------------------------------------

Para identificar qual storage aceita imagens de VM (disk image), use:

  -----------------------------------------------------------------------
  \# Mostra apenas storages com suporte a images

  pvesm status \--content images

  \# Ou verifique via API Proxmox

  curl -sk -H \'Authorization: PVEAPIToken=\...\' \\

  https://192.168.1.X:8006/api2/json/nodes/tatuserv/storage \| \\

  python3 -m json.tool
  -----------------------------------------------------------------------

No Terraform, você define o storage como variável, facilitando a troca
sem alterar o código principal:

  -----------------------------------------------------------------------
  \# variables.tf

  variable \"storage\" {

  description = \"Nome do storage no Proxmox onde as VMs serão criadas\"

  type = string

  default = \"local\"

  }
  -----------------------------------------------------------------------

  -----------------------------------------------------------------------
  \# Para trocar o storage, basta alterar no terraform.tfvars:

  storage = \"ssd-dados\"

  \# Ou passar via linha de comando:

  terraform apply -var=\"storage=ssd-dados\"
  -----------------------------------------------------------------------

+-----------------------------------------------------------------------+
| **Por que usar variável para o storage?**                             |
|                                                                       |
| Seu ambiente tem 3 tipos de storage e você mencionou que pode trocar. |
|                                                                       |
| Com a variável, você muda um único valor no terraform.tfvars e todos  |
| os recursos passam a usar o novo storage.                             |
|                                                                       |
| Sem variável, você teria que alterar cada resource manualmente.       |
+-----------------------------------------------------------------------+

**Arquivo providers.tf (base para todos os exercícios)**

Crie este arquivo uma vez e reutilize em todos os projetos:

  -----------------------------------------------------------------------
  \# providers.tf

  terraform {

  required_providers {

  proxmox = {

  source = \"bpg/proxmox\"

  version = \"\>= 0.46.0\"

  }

  }

  }

  provider \"proxmox\" {

  endpoint = \"https://192.168.1.X:8006\" \# IP do tatuserv

  username = var.proxmox_user \# root@pam

  password = var.proxmox_password

  insecure = true \# Desativa verificação SSL self-signed

  }
  -----------------------------------------------------------------------

+-----------------------------------------------------------------------+
| **Segurança: nunca coloque senhas diretamente no .tf**                |
|                                                                       |
| Use sempre variáveis para credenciais.                                |
|                                                                       |
| O arquivo terraform.tfvars com senhas deve estar no .gitignore.       |
|                                                                       |
| Em produção, use variáveis de ambiente: export                        |
| TF_VAR_proxmox_password=\'senha\'                                     |
+-----------------------------------------------------------------------+

**Exercício 1 --- VM Ubuntu com Cloud-Init do Zero**

Neste exercício você criará uma VM Ubuntu no Proxmox baixando a imagem
Cloud-Init diretamente via Terraform, sem precisar criar nada
manualmente antes.

+-----------------------------------------------------------------------+
| **O que é Cloud-Init?**                                               |
|                                                                       |
| Cloud-Init é um sistema de inicialização usado em imagens de nuvem    |
| (Ubuntu, Debian, Rocky Linux, etc.).                                  |
|                                                                       |
| Na primeira inicialização da VM, ele executa configurações            |
| automaticamente: cria usuários, injeta chaves SSH, define hostname,   |
| configura rede, instala pacotes.                                      |
|                                                                       |
| A imagem .img do Ubuntu Cloud é compacta (\~600MB) e pronta para uso  |
| com Cloud-Init.                                                       |
|                                                                       |
| URL da imagem:                                                        |
| https://                                                              |
| cloud-images.ubuntu.com/noble/current/noble-server-cloudimg-amd64.img |
+-----------------------------------------------------------------------+

**Estrutura do Projeto**

  -----------------------------------------------------------------------
  exercicio-01/

  ├── providers.tf \# Configuração do provider (copiado do setup)

  ├── variables.tf \# Declaração das variáveis

  ├── terraform.tfvars \# Valores das variáveis (não versionar)

  ├── main.tf \# Recurso da VM

  └── outputs.tf \# Exibir IP após criação
  -----------------------------------------------------------------------

**variables.tf**

  -----------------------------------------------------------------------
  variable \"proxmox_user\" {

  description = \"Usuário do Proxmox\"

  type = string

  default = \"root@pam\"

  }

  variable \"proxmox_password\" {

  description = \"Senha do Proxmox\"

  type = string

  sensitive = true \# Oculta o valor nos logs

  }

  variable \"storage\" {

  description = \"Storage onde a VM será criada\"

  type = string

  default = \"local\"

  }

  variable \"vm_ip\" {

  description = \"IP estático da VM (ex: 192.168.1.50/24)\"

  type = string

  }

  variable \"gateway\" {

  description = \"Gateway da rede\"

  type = string

  default = \"192.168.1.1\"

  }

  variable \"dns_servers\" {

  description = \"Lista de servidores DNS\"

  type = list(string)

  default = \[\"1.1.1.1\", \"8.8.8.8\"\]

  }

  variable \"ssh_public_key\" {

  description = \"Conteúdo da chave SSH pública\"

  type = string

  }
  -----------------------------------------------------------------------

**terraform.tfvars**

Crie este arquivo com seus valores reais. Adicione-o ao .gitignore:

  -----------------------------------------------------------------------
  \# Obrigatórias (sem default no variables.tf)
  proxmox_password = \"sua-senha-aqui\"

  vm_ip            = \"192.168.1.50/24\"

  ssh_public_key   = \"ssh-ed25519 AAAA\... seu@email\"

  \# Opcionais (já têm default — só informe se quiser sobrescrever)
  \# gateway      = \"192.168.1.1\"
  \# dns_servers  = [\"1.1.1.1\", \"8.8.8.8\"]
  \# storage      = \"local\"
  -----------------------------------------------------------------------

Para obter sua chave pública SSH:

  -----------------------------------------------------------------------
  \# Se você já tem uma chave:

  cat \~/.ssh/id_ed25519.pub

  \# Se não tem, gere uma:

  ssh-keygen -t ed25519 -C \'tatulab\'

  cat \~/.ssh/id_ed25519.pub
  -----------------------------------------------------------------------

**main.tf**

Este é o arquivo principal. Ele baixa a imagem Cloud-Init e cria a VM:

  -----------------------------------------------------------------------------------
  \# main.tf

  \# Recurso 1: Faz o download da imagem Cloud-Init e envia ao Proxmox

  resource \"proxmox_virtual_environment_download_file\" \"ubuntu_cloud_image\" {

  content_type = \"iso\"

  datastore_id = var.storage

  node_name = \"tatuserv\"

  \# URL da imagem Ubuntu 24.04 LTS Cloud-Init

  url =
  \"https://cloud-images.ubuntu.com/noble/current/noble-server-cloudimg-amd64.img\"

  \# Nome com que o arquivo ficará no Proxmox

  file_name = \"ubuntu-24.04-cloudimg-amd64.img\"

  \# Não re-baixa se o arquivo já existir

  overwrite = false

  }

  \# Recurso 2: Cria a VM

  resource \"proxmox_virtual_environment_vm\" \"ubuntu_vm\" {

  name = \"ubuntu-terraform-ex01\"

  node_name = \"tatuserv\"

  vm_id = 200 \# ID único da VM no Proxmox

  \# Configuração de hardware

  cpu {

  cores = 2

  type = \"x86-64-v2-AES\"

  }

  memory {

  dedicated = 2048 \# 2GB de RAM

  }

  \# Disco principal --- usa a imagem Cloud-Init como base

  disk {

  datastore_id = var.storage

  file_id = proxmox_virtual_environment_download_file.ubuntu_cloud_image.id

  interface = \"virtio0\"

  size = 20 \# GB

  }

  \# Interface de rede

  network_device {

  bridge = \"vmbr0\"

  model = \"virtio\"

  }

  \# Configuração Cloud-Init

  initialization {

  dns_servers = var.dns_servers

  ip_config {

  ipv4 {

  address = var.vm_ip \# Ex: 192.168.1.50/24

  gateway = var.gateway

  }

  }

  \# Cria o usuário ubuntu com a chave SSH

  user_account {

  username = \"ubuntu\"

  keys = \[var.ssh_public_key\]

  }

  }

  \# Aguarda a VM inicializar antes de considerar concluído

  lifecycle {

  ignore_changes = \[

  \# Ignora mudanças no network_device após criação

  \# (evita recriação desnecessária)

  \]

  }

  }
  -----------------------------------------------------------------------------------

**outputs.tf**

  -----------------------------------------------------------------------
  \# outputs.tf

  output \"vm_id\" {

  description = \"ID da VM no Proxmox\"

  value = proxmox_virtual_environment_vm.ubuntu_vm.vm_id

  }

  output \"vm_ip\" {

  description = \"IP configurado na VM\"

  value = var.vm_ip

  }

  output \"ssh_command\" {

  description = \"Comando para acessar a VM via SSH\"

  value = \"ssh ubuntu@\${split(\"/\", var.vm_ip)\[0\]}\"

  }
  -----------------------------------------------------------------------

**Executando o Exercício 1**

  -----------------------------------------------------------------------
  cd exercicio-01/

  \# 1. Inicializa e baixa o provider bpg/proxmox

  terraform init

  \# 2. Veja o plano de execução

  terraform plan

  \# 3. Aplica (vai perguntar confirmação, digite \'yes\')

  terraform apply

  \# Após o apply, o output exibirá:

  \# vm_id = 200

  \# vm_ip = 192.168.1.50/24

  \# ssh_command = ssh ubuntu@192.168.1.50

  \# 4. Acesse a VM

  ssh ubuntu@192.168.1.50
  -----------------------------------------------------------------------

+-----------------------------------------------------------------------+
| **O que acontece nos bastidores**                                     |
|                                                                       |
| 1\. Terraform baixa a imagem Ubuntu Cloud-Init do site oficial e      |
| envia ao Proxmox.                                                     |
|                                                                       |
| 2\. Cria a VM com as configurações de hardware definidas.             |
|                                                                       |
| 3\. Injeta as configurações Cloud-Init (usuário, chave SSH, IP) via   |
| drive ISO.                                                            |
|                                                                       |
| 4\. Liga a VM --- na primeira inicialização, o Cloud-Init configura   |
| tudo automaticamente.                                                 |
|                                                                       |
| 5\. Em \~60 segundos, a VM está pronta e você consegue acessar via    |
| SSH sem senha.                                                        |
+-----------------------------------------------------------------------+

**Exercício 2 --- VM a partir de um Template Pré-Criado**

Na prática de produção, você não baixa a imagem toda vez. Você cria um
template uma única vez e clona a partir dele. Este é o fluxo mais comum
em ambientes reais.

+-----------------------------------------------------------------------+
| **Template vs Imagem direta --- qual a diferença?**                   |
|                                                                       |
| Imagem direta (Ex. 1): Terraform baixa a imagem e a usa como disco    |
| base. Mais simples, mas o download ocorre na primeira execução.       |
|                                                                       |
| Clone de template (Ex. 2): Você converte uma VM em template no        |
| Proxmox. O Terraform clona o template. É mais rápido e é o padrão em  |
| produção.                                                             |
|                                                                       |
| Com template, criar 10 VMs é tão rápido quanto criar 1 --- sem novo   |
| download.                                                             |
+-----------------------------------------------------------------------+

**Passo 1: Criar o Template no Proxmox (feito uma vez)**

Execute estes comandos diretamente no host tatuserv via SSH. Este
processo é feito uma única vez --- o template fica salvo para sempre:

  -------------------------------------------------------------------------------
  \# SSH no Proxmox

  ssh root@192.168.1.X

  \# Baixar a imagem Ubuntu 24.04 Cloud-Init

  wget
  https://cloud-images.ubuntu.com/noble/current/noble-server-cloudimg-amd64.img
  \\

  -O /var/lib/vz/template/iso/ubuntu-24.04-cloudimg.img

  \# Criar VM base com ID 9000 (convenção: templates acima de 9000)

  qm create 9000 \\

  \--name ubuntu-2404-template \\

  \--memory 2048 \\

  \--cores 2 \\

  \--net0 virtio,bridge=vmbr0

  \# Importar a imagem como disco da VM

  qm importdisk 9000 \\

  /var/lib/vz/template/iso/ubuntu-24.04-cloudimg.img \\

  local

  \# Configurar o disco importado como boot

  qm set 9000 \\

  \--scsihw virtio-scsi-pci \\

  \--virtio0 local:vm-9000-disk-0

  \# Adicionar drive Cloud-Init

  qm set 9000 \--ide2 local:cloudinit

  \# Definir ordem de boot

  qm set 9000 \--boot c \--bootdisk virtio0

  \# Habilitar agente QEMU (recomendado)

  qm set 9000 \--agent enabled=1

  \# Converter em template (ação irreversível --- cria cópia antes se quiser)

  qm template 9000

  \# Confirmar que o template foi criado

  qm list \| grep 9000
  -------------------------------------------------------------------------------

**Passo 2: Estrutura do Projeto Terraform**

  -----------------------------------------------------------------------
  exercicio-02/

  ├── providers.tf \# Mesmo do setup inicial

  ├── variables.tf

  ├── terraform.tfvars

  ├── main.tf \# Agora usa clone do template

  └── outputs.tf
  -----------------------------------------------------------------------

**variables.tf**

  -----------------------------------------------------------------------
  variable \"proxmox_user\" {

  type = string

  default = \"root@pam\"

  }

  variable \"proxmox_password\" {

  type = string

  sensitive = true

  }

  variable \"storage\" {

  description = \"Storage onde o clone será criado\"

  type = string

  default = \"local\"

  }

  variable \"template_id\" {

  description = \"ID da VM template no Proxmox\"

  type = number

  default = 9000

  }

  variable \"vm_id\" {

  description = \"ID da nova VM\"

  type = number

  default = 201

  }

  variable \"vm_name\" {

  description = \"Nome da VM\"

  type = string

  default = \"ubuntu-ex02\"

  }

  variable \"vm_ip\" {

  description = \"IP estático da VM (ex: 192.168.1.51/24)\"

  type = string

  }

  variable \"gateway\" {

  type = string

  default = \"192.168.1.1\"

  }

  variable \"ssh_public_key\" {

  type = string

  }
  -----------------------------------------------------------------------

**terraform.tfvars**

  -----------------------------------------------------------------------
  \# Obrigatórias (sem default no variables.tf)
  proxmox_password = \"sua-senha-aqui\"

  vm_ip            = \"192.168.1.51/24\"

  ssh_public_key   = \"ssh-ed25519 AAAA\... seu@email\"

  \# Opcionais (já têm default — só informe se quiser sobrescrever)
  \# template_id  = 9000
  \# vm_id        = 201
  \# vm_name      = \"ubuntu-ex02\"
  \# gateway      = \"192.168.1.1\"
  \# storage      = \"local\"
  -----------------------------------------------------------------------

**main.tf**

  -----------------------------------------------------------------------
  \# main.tf --- Clone de template

  resource \"proxmox_virtual_environment_vm\" \"ubuntu_clone\" {

  name = var.vm_name

  node_name = \"tatuserv\"

  vm_id = var.vm_id

  \# Define a origem como clone do template

  clone {

  vm_id = var.template_id

  full = true \# true = clone completo (cópia total do disco)

  \# false = linked clone (compartilha disco --- mais rápido)

  }

  \# Sobrescreve configurações do template

  cpu {

  cores = 2

  type = \"x86-64-v2-AES\"

  }

  memory {

  dedicated = 2048

  }

  \# Redimensiona o disco clonado

  disk {

  datastore_id = var.storage

  interface = \"virtio0\"

  size = 20

  }

  network_device {

  bridge = \"vmbr0\"

  model = \"virtio\"

  }

  \# Cloud-Init sobrescreve as configurações do template

  initialization {

  ip_config {

  ipv4 {

  address = var.vm_ip

  gateway = var.gateway

  }

  }

  user_account {

  username = \"ubuntu\"

  keys = \[var.ssh_public_key\]

  }

  }

  }
  -----------------------------------------------------------------------

**outputs.tf**

  -----------------------------------------------------------------------
  output \"vm_id\" {

  value = proxmox_virtual_environment_vm.ubuntu_clone.vm_id

  }

  output \"ssh_command\" {

  value = \"ssh ubuntu@\${split(\"/\", var.vm_ip)\[0\]}\"

  }
  -----------------------------------------------------------------------

**Executando o Exercício 2**

  -----------------------------------------------------------------------
  cd exercicio-02/

  terraform init

  terraform plan

  terraform apply
  -----------------------------------------------------------------------

+-----------------------------------------------------------------------+
| **Clone completo vs Linked Clone**                                    |
|                                                                       |
| full = true → Cria uma cópia independente do disco. Ocupa mais espaço |
| mas a VM é autônoma.                                                  |
|                                                                       |
| full = false → Linked clone: compartilha blocos com o template. Mais  |
| rápido e economiza espaço, mas depende do template existir.           |
|                                                                       |
| Para produção, use full = true. Para laboratório/teste, full = false  |
| é prático.                                                            |
+-----------------------------------------------------------------------+

**Exercício 3 --- Múltiplas VMs com Configuração Dinâmica**


+-----------------------------------------------------------------------+
| **O que você aprenderá neste exercício**                              |
|                                                                       |
| for_each --- como iterar sobre um mapa de objetos                     |
|                                                                       |
| object type --- como definir variáveis com estrutura complexa         |
|                                                                       |
| Outputs dinâmicos --- como exibir informações de múltiplos recursos   |
| criados                                                               |
|                                                                       |
| Como escalar de 1 para N VMs mudando apenas a variável                |
+-----------------------------------------------------------------------+

**Conceito: for_each**

O for_each é equivalente a um loop. Em vez de copiar e colar o mesmo
resource N vezes, você define o resource uma vez e passa um mapa com as
variações:

  -----------------------------------------------------------------------
  \# Sem for_each (ruim --- repetitivo):

  resource \"proxmox_virtual_environment_vm\" \"vm_01\" { \... }

  resource \"proxmox_virtual_environment_vm\" \"vm_02\" { \... }

  resource \"proxmox_virtual_environment_vm\" \"vm_03\" { \... }

  \# Com for_each (correto --- uma única definição):

  resource \"proxmox_virtual_environment_vm\" \"vms\" {

  for_each = var.vms

  name = each.key \# chave do mapa (ex: \'vm-web\')

  vm_id = each.value.vm_id \# valor do mapa

  }
  -----------------------------------------------------------------------

**Estrutura do Projeto**

  -----------------------------------------------------------------------
  exercicio-03/

  ├── providers.tf

  ├── variables.tf

  ├── terraform.tfvars \# Define a lista de VMs aqui

  ├── main.tf

  └── outputs.tf
  -----------------------------------------------------------------------

**variables.tf**

A variável vms é um mapa onde cada chave é o nome da VM e o valor é um
objeto com as configurações:

  -----------------------------------------------------------------------
  variable \"proxmox_user\" {

  type = string

  default = \"root@pam\"

  }

  variable \"proxmox_password\" {

  type = string

  sensitive = true

  }

  variable \"storage\" {

  type = string

  default = \"local\"

  }

  variable \"template_id\" {

  type = number

  default = 9000

  }

  variable \"gateway\" {

  type = string

  default = \"192.168.1.1\"

  }

  variable \"ssh_public_key\" {

  type = string

  }

  \# Mapa de VMs --- estrutura principal do exercício

  variable \"vms\" {

  description = \"Mapa de VMs a serem criadas\"

  type = map(object({

  vm_id = number \# ID único no Proxmox

  ip = string \# IP no formato CIDR (ex: 192.168.1.60/24)

  cores = number \# Número de CPUs virtuais

  memory = number \# RAM em MB

  disk_gb = number \# Tamanho do disco em GB

  }))

  }
  -----------------------------------------------------------------------

**terraform.tfvars**

Aqui você define quantas VMs quiser, cada uma com configurações
independentes. Para adicionar ou remover VMs, basta editar este arquivo:

  -----------------------------------------------------------------------
  \# Obrigatórias (sem default no variables.tf)
  proxmox_password = \"sua-senha-aqui\"

  ssh_public_key   = \"ssh-ed25519 AAAA\... seu@email\"

  \# Opcionais (já têm default — só informe se quiser sobrescrever)
  \# gateway      = \"192.168.1.1\"
  \# template_id  = 9000
  \# storage      = \"local\"

  vms = {

  \"vm-web\" = {

  vm_id = 210

  ip = \"192.168.1.60/24\"

  cores = 2

  memory = 2048

  disk_gb = 20

  }

  \"vm-db\" = {

  vm_id = 211

  ip = \"192.168.1.61/24\"

  cores = 4

  memory = 4096

  disk_gb = 50

  }

  \"vm-monitor\" = {

  vm_id = 212

  ip = \"192.168.1.62/24\"

  cores = 2

  memory = 3072

  disk_gb = 30

  }

  }
  -----------------------------------------------------------------------

**main.tf**

  -----------------------------------------------------------------------
  \# main.tf --- Múltiplas VMs com for_each

  resource \"proxmox_virtual_environment_vm\" \"vms\" {

  \# Itera sobre cada entrada do mapa var.vms

  for_each = var.vms

  \# each.key = nome da VM (ex: \"vm-web\")

  \# each.value = objeto com configurações

  name = each.key

  node_name = \"tatuserv\"

  vm_id = each.value.vm_id

  clone {

  vm_id = var.template_id

  full = true

  }

  cpu {

  cores = each.value.cores

  type = \"x86-64-v2-AES\"

  }

  memory {

  dedicated = each.value.memory

  }

  disk {

  datastore_id = var.storage

  interface = \"virtio0\"

  size = each.value.disk_gb

  }

  network_device {

  bridge = \"vmbr0\"

  model = \"virtio\"

  }

  initialization {

  ip_config {

  ipv4 {

  address = each.value.ip

  gateway = var.gateway

  }

  }

  user_account {

  username = \"ubuntu\"

  keys = \[var.ssh_public_key\]

  }

  }

  }
  -----------------------------------------------------------------------

**outputs.tf**

O output também usa for_each para exibir informações de todas as VMs
criadas:

  -----------------------------------------------------------------------
  \# outputs.tf

  output \"vms_info\" {

  description = \"Informações das VMs criadas\"

  value = {

  for name, vm in proxmox_virtual_environment_vm.vms : name =\> {

  vm_id = vm.vm_id

  ip = vm.initialization\[0\].ip_config\[0\].ipv4\[0\].address

  ssh_command = \"ssh ubuntu@\${split(\"/\",
  vm.initialization\[0\].ip_config\[0\].ipv4\[0\].address)\[0\]}\"

  }

  }

  }
  -----------------------------------------------------------------------

**Executando o Exercício 3**

  -----------------------------------------------------------------------
  cd exercicio-03/

  terraform init

  \# O plan mostrará 3 recursos a criar (um por VM)

  terraform plan

  terraform apply

  \# Output esperado:

  \# vms_info = {

  \# \"vm-db\" = {

  \# ip = \"192.168.1.61/24\"

  \# ssh_command = \"ssh ubuntu@192.168.1.61\"

  \# vm_id = 211

  \# }

  \# \"vm-monitor\" = {

  \# ip = \"192.168.1.62/24\"

  \# ssh_command = \"ssh ubuntu@192.168.1.62\"

  \# vm_id = 212

  \# }

  \# \"vm-web\" = {

  \# ip = \"192.168.1.60/24\"

  \# ssh_command = \"ssh ubuntu@192.168.1.60\"

  \# vm_id = 210

  \# }

  \# }
  -----------------------------------------------------------------------

**Adicionando uma nova VM**

Para adicionar uma quarta VM, basta adicionar uma entrada no
terraform.tfvars e executar apply novamente. O Terraform só criará o que
for novo --- as VMs existentes não serão tocadas:

  -----------------------------------------------------------------------
  \# Adicione no terraform.tfvars dentro do bloco vms = { \... }

  \"vm-backup\" = {

  vm_id = 213

  ip = \"192.168.1.63/24\"

  cores = 2

  memory = 2048

  disk_gb = 100

  }

  \# Execute:

  terraform plan \# Mostrará: +1 to add, 0 to change, 0 to destroy

  terraform apply
  -----------------------------------------------------------------------

+-----------------------------------------------------------------------+
| **Removendo uma VM**                                                  |
|                                                                       |
| Para remover a vm-backup: remova a entrada do terraform.tfvars e      |
| execute terraform apply.                                              |
|                                                                       |
| O Terraform mostrará no plan: 0 to add, 0 to change, 1 to destroy.    |
|                                                                       |
| Confirme com \'yes\' e a VM será desligada e removida do Proxmox.     |
|                                                                       |
| ATENÇÃO: O disco da VM também será removido. Faça backup antes se     |
| necessário.                                                           |
+-----------------------------------------------------------------------+

**Referência Rápida**

**Comandos mais usados**

  -----------------------------------------------------------------------
  terraform init \# Inicializa projeto e baixa providers

  terraform plan \# Dry-run --- mostra o que SERÁ feito

  terraform apply \# Aplica as mudanças

  terraform apply -auto-approve \# Aplica sem pedir confirmação

  terraform destroy \# Remove toda a infraestrutura

  terraform output \# Exibe os outputs do estado atual

  terraform show \# Mostra o estado atual detalhado

  terraform state list \# Lista todos os recursos no estado

  terraform validate \# Valida a sintaxe dos arquivos .tf

  terraform fmt \# Formata os arquivos .tf
  -----------------------------------------------------------------------

**Gerenciar o state**

  -----------------------------------------------------------------------
  \# Ver todos os recursos no state

  terraform state list

  \# Ver detalhes de um recurso específico

  terraform state show proxmox_virtual_environment_vm.vms\[\"vm-web\"\]

  \# Remover um recurso do state SEM destruir (cuidado!)

  terraform state rm proxmox_virtual_environment_vm.vms\[\"vm-web\"\]

  \# Importar um recurso existente para o state

  terraform import proxmox_virtual_environment_vm.minha_vm tatuserv/200
  -----------------------------------------------------------------------

**Problemas comuns e soluções**

  ----------------------------------- -----------------------------------
  **Problema**                        Solução

  ----------------------------------- -----------------------------------

  ----------------------------------- -----------------------------------
  **Error: 401 Unauthorized**         Verifique proxmox_user e
                                      proxmox_password no tfvars

  ----------------------------------- -----------------------------------

  ----------------------------------- -----------------------------------
  **Error: VM ID already exists**     Altere o vm_id no tfvars para um ID
                                      não utilizado

  ----------------------------------- -----------------------------------

  ----------------------------------- -----------------------------------
  **Error: storage not found**        Execute pvesm status no Proxmox e
                                      ajuste a var storage

  ----------------------------------- -----------------------------------

  ----------------------------------- -----------------------------------
  **VM criada mas sem IP**            Verifique se o Cloud-Init está
                                      habilitado no template

  ----------------------------------- -----------------------------------

  ----------------------------------- -----------------------------------
  **terraform plan não muda nada**    Estado já sincronizado ---
                                      infraestrutura está como o código
                                      descreve

  ----------------------------------- -----------------------------------

**.gitignore recomendado para projetos Terraform**

  -----------------------------------------------------------------------
  \# .gitignore

  \# Arquivo de variáveis com senhas --- NUNCA versionar

  \*.tfvars

  !exemplo.tfvars \# Exceto arquivos de exemplo sem senhas reais

  \# State local --- versionar apenas se não houver backend remoto

  \*.tfstate

  \*.tfstate.\*

  \*.tfstate.backup

  \# Diretório de providers baixados

  .terraform/

  \# Lock file --- PODE versionar (garante versões consistentes)

  \# .terraform.lock.hcl
  -----------------------------------------------------------------------
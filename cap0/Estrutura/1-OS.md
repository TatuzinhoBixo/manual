# Estrututura e configuração

## Sistema operaciona

Ubuntu 24

## Configuração adicional

## Customizacao do Sistema Operacional - Passo a Passo Manual

Este documento descreve como customizar o SO Ubuntu 22.04/24.04 manualmente,
reproduzindo o que e feito de forma automatizada pelo Terraform (cloud-init) e Ansible (hardening.yml).

> Todos os comandos assumem acesso root (`sudo su -` ou prefixo `sudo`).

---

## 1. Configuracao inicial da VM

### 1.1 Definir o hostname

```bash
hostnamectl set-hostname <nome-da-vm>
```

Adicionar a entrada no `/etc/hosts`:

```bash
echo "127.0.1.1 <nome-da-vm>" >> /etc/hosts
```

### 1.2 Criar usuario

```bash
adduser --disabled-password --gecos "" devopstatu
```

### 1.3 Configurar sudo sem senha

```bash
echo "devopstatu ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/devopstatu
chmod 440 /etc/sudoers.d/devopstatu
```

### 1.4 Travar senha do usuario (impedir login por senha)

```bash
passwd -l devopstatu
```

### 1.5 Configurar chave SSH do usuario

```bash
mkdir -p /home/devopstatu/.ssh
cat >> /home/devopstatu/.ssh/authorized_keys << 'EOF'
ssh-ed25519 AAAA... sua-chave-publica-aqui
EOF
chmod 700 /home/devopstatu/.ssh
chmod 600 /home/devopstatu/.ssh/authorized_keys
chown -R devopstatu:devopstatu /home/devopstatu/.ssh
```

### 1.6 Atualizar pacotes do sistema

```bash
apt update && apt upgrade -y
```

### 1.7 Instalar pacotes base

```bash
apt install -y vim chrony nfs-common htop git telnet btop net-tools bind9-dnsutils qemu-guest-agent
```

### 1.8 Habilitar QEMU Guest Agent

```bash
systemctl enable qemu-guest-agent
systemctl start qemu-guest-agent
```

---

## 2. Timezone e NTP

### 2.1 Configurar timezone

```bash
timedatectl set-timezone America/Manaus
```

### 2.2 Habilitar chrony (NTP)

```bash
systemctl enable chrony
systemctl start chrony
```

Verificar sincronizacao:

```bash
chronyc tracking
```

---

## 3. Configuracao do Vim

### 3.1 Criar diretorio de undo

```bash
mkdir -p /home/devopstatu/.vim/undodir
chown -R devopstatu:devopstatu /home/devopstatu/.vim
```

### 3.2 Criar o .vimrc

```bash
cat > /home/devopstatu/.vimrc << 'EOF'
" ============================================================
" .vimrc - SysAdmin / DevOps (Celito)
" ============================================================
set number
set relativenumber
set cursorline
set scrolloff=8
set colorcolumn=120
set signcolumn=yes
set termguicolors
set noswapfile
set nobackup
set undofile
set undodir=~/.vim/undodir
set hidden
set confirm
set autoread
set updatetime=300
set hlsearch
set incsearch
set ignorecase
set smartcase
set tabstop=2
set shiftwidth=2
set expandtab
set smartindent
set autoindent
filetype plugin indent on
autocmd FileType yaml setlocal ts=2 sw=2 expandtab
autocmd FileType yml  setlocal ts=2 sw=2 expandtab
set clipboard=unnamedplus
set laststatus=2
set showcmd
set wildmenu
set wildmode=longest:full,full
set splitbelow
set splitright
syntax on
set background=dark
let mapleader = " "
nnoremap <leader>/ :nohlsearch<CR>
nnoremap <C-h> <C-w>h
nnoremap <C-j> <C-w>j
nnoremap <C-k> <C-w>k
nnoremap <C-l> <C-w>l
nnoremap <leader>w :w<CR>
nnoremap <leader>q :q!<CR>
nnoremap <leader>r :source ~/.vimrc<CR>
set encoding=utf-8
set fileencoding=utf-8
EOF
chown devopstatu:devopstatu /home/devopstatu/.vimrc
```

---

## 4. SSH Hardening (CIS 5.2.x)

### 4.1 Editar /etc/ssh/sshd_config

Abrir o arquivo e garantir que os parametros abaixo estejam configurados:

```bash
vim /etc/ssh/sshd_config
```

```
PermitRootLogin no
PasswordAuthentication no
PermitEmptyPasswords no
X11Forwarding no
MaxAuthTries 4
ClientAliveInterval 300
ClientAliveCountMax 3
LoginGraceTime 60
AllowAgentForwarding no
AllowTcpForwarding no
Protocol 2
LogLevel VERBOSE
MaxSessions 4
UseDNS no
AllowUsers devopstatu
Banner /etc/issue.net
```

### 4.2 Restringir permissao do sshd_config

```bash
chmod 600 /etc/ssh/sshd_config
chown root:root /etc/ssh/sshd_config
```

### 4.3 Travar senha do usuario tatu (herdado do template)

```bash
passwd -l tatu
```

### 4.4 Reiniciar o SSH

```bash
systemctl restart ssh
```

---

## 5. Kernel e Sysctl (CIS 3.x + Kubernetes)

### 5.1 Carregar modulos do kernel

```bash
modprobe br_netfilter
modprobe overlay
```

### 5.2 Persistir modulos para sobreviver a reboot

```bash
echo "br_netfilter" > /etc/modules-load.d/br_netfilter.conf
echo "overlay" > /etc/modules-load.d/overlay.conf
```

### 5.3 Configurar parametros sysctl

Criar o arquivo `/etc/sysctl.d/99-cis-kubernetes.conf`:

```bash
cat > /etc/sysctl.d/99-cis-kubernetes.conf << 'EOF'
# Kubernetes
net.ipv4.ip_forward = 1
net.bridge.bridge-nf-call-iptables = 1
net.bridge.bridge-nf-call-ip6tables = 1

# CIS 3.2.1 - Desabilitar envio de redirects
net.ipv4.conf.all.send_redirects = 0
net.ipv4.conf.default.send_redirects = 0

# CIS 3.2.2 - Desabilitar source routing
net.ipv4.conf.all.accept_source_route = 0
net.ipv4.conf.default.accept_source_route = 0

# CIS 3.2.3 - Desabilitar ICMP redirects
net.ipv4.conf.all.accept_redirects = 0
net.ipv4.conf.default.accept_redirects = 0

# CIS 3.2.4 - Desabilitar secure redirects
net.ipv4.conf.all.secure_redirects = 0
net.ipv4.conf.default.secure_redirects = 0

# CIS 3.2.5 - Logar pacotes marcianos
net.ipv4.conf.all.log_martians = 1
net.ipv4.conf.default.log_martians = 1

# CIS 3.2.6 - Ignorar broadcast ICMP
net.ipv4.icmp_echo_ignore_broadcasts = 1

# CIS 3.2.7 - Ignorar respostas ICMP bogus
net.ipv4.icmp_ignore_bogus_error_responses = 1

# CIS 3.2.8 - Reverse path filtering
net.ipv4.conf.all.rp_filter = 1
net.ipv4.conf.default.rp_filter = 1

# CIS 3.2.9 - TCP SYN cookies
net.ipv4.tcp_syncookies = 1

# IPv6 hardening
net.ipv6.conf.all.accept_redirects = 0
net.ipv6.conf.default.accept_redirects = 0
net.ipv6.conf.all.accept_source_route = 0
net.ipv6.conf.default.accept_source_route = 0

# CIS 1.5.2 - ASLR
kernel.randomize_va_space = 2

# CIS 1.5.3 - Desabilitar SysRq
kernel.sysrq = 0

# CIS 1.5.4 - Desabilitar core dumps
fs.suid_dumpable = 0

# Kubernetes extras
vm.overcommit_memory = 1
vm.panic_on_oom = 0
fs.inotify.max_user_watches = 524288
fs.inotify.max_user_instances = 8192
EOF
```

### 5.4 Aplicar os parametros

```bash
sysctl --system
```

---

## 6. Desabilitar servicos desnecessarios (CIS 2.1.x / 2.2.x)

```bash
for svc in avahi-daemon cups isc-dhcp-server slapd nfs-server rpcbind rsync snmpd squid; do
  systemctl stop "$svc" 2>/dev/null
  systemctl disable "$svc" 2>/dev/null
done
```

---

## 7. Permissoes de arquivos criticos (CIS 6.1.x)

### 7.1 Arquivos de autenticacao

```bash
chmod 644 /etc/passwd
chmod 640 /etc/shadow
chmod 644 /etc/group
chmod 640 /etc/gshadow

chown root:root /etc/passwd /etc/group
chown root:shadow /etc/shadow /etc/gshadow

chmod 600 /etc/passwd- /etc/shadow- /etc/group- /etc/gshadow-
chown root:root /etc/passwd- /etc/shadow- /etc/group- /etc/gshadow-
```

### 7.2 Cron

```bash
chmod 700 /etc/crontab /etc/cron.hourly /etc/cron.daily /etc/cron.weekly /etc/cron.monthly /etc/cron.d
chown root:root /etc/crontab /etc/cron.hourly /etc/cron.daily /etc/cron.weekly /etc/cron.monthly /etc/cron.d
```

---

## 8. Auditd (CIS 4.1.x)

### 8.1 Instalar auditd

```bash
apt install -y auditd audispd-plugins
```

### 8.2 Criar regras de auditoria

```bash
cat > /etc/audit/rules.d/cis.rules << 'EOF'
# Monitorar alteracoes de data/hora (CIS 4.1.3)
-a always,exit -F arch=b64 -S adjtimex -S settimeofday -k time-change
-a always,exit -F arch=b32 -S adjtimex -S settimeofday -S stime -k time-change
-a always,exit -F arch=b64 -S clock_settime -k time-change
-w /etc/localtime -p wa -k time-change

# Monitorar usuarios e grupos (CIS 4.1.4)
-w /etc/group -p wa -k identity
-w /etc/passwd -p wa -k identity
-w /etc/gshadow -p wa -k identity
-w /etc/shadow -p wa -k identity
-w /etc/security/opasswd -p wa -k identity

# Monitorar rede (CIS 4.1.5)
-a always,exit -F arch=b64 -S sethostname -S setdomainname -k system-locale
-w /etc/issue -p wa -k system-locale
-w /etc/issue.net -p wa -k system-locale
-w /etc/hosts -p wa -k system-locale
-w /etc/network -p wa -k system-locale

# Monitorar logins (CIS 4.1.7)
-w /var/log/faillog -p wa -k logins
-w /var/log/lastlog -p wa -k logins
-w /var/log/tallylog -p wa -k logins

# Monitorar sessoes (CIS 4.1.8)
-w /var/run/utmp -p wa -k session
-w /var/log/wtmp -p wa -k session
-w /var/log/btmp -p wa -k session

# Monitorar sudo (CIS 4.1.13)
-w /etc/sudoers -p wa -k scope
-w /etc/sudoers.d/ -p wa -k scope

# Monitorar modulos do kernel (CIS 4.1.16)
-w /sbin/insmod -p x -k modules
-w /sbin/rmmod -p x -k modules
-w /sbin/modprobe -p x -k modules
-a always,exit -F arch=b64 -S init_module -S delete_module -k modules

# Tornar configuracao imutavel (deve ser a ultima regra)
-e 2
EOF
chmod 640 /etc/audit/rules.d/cis.rules
```

### 8.3 Habilitar e reiniciar auditd

```bash
systemctl enable auditd
service auditd restart
```

---

## 9. AppArmor (CIS 1.6.x)

### 9.1 Instalar AppArmor

```bash
apt install -y apparmor apparmor-utils
```

### 9.2 Habilitar e iniciar

```bash
systemctl enable apparmor
systemctl start apparmor
```

Verificar status:

```bash
aa-status
```

---

## 10. Fail2ban

### 10.1 Instalar fail2ban

```bash
apt install -y fail2ban
```

### 10.2 Configurar jail local

```bash
cat > /etc/fail2ban/jail.local << 'EOF'
[DEFAULT]
bantime  = 3600
findtime = 600
maxretry = 5
backend  = systemd

[sshd]
enabled = true
port    = ssh
filter  = sshd
maxretry = 3
EOF
```

### 10.3 Habilitar e iniciar

```bash
systemctl enable fail2ban
systemctl start fail2ban
```

Verificar status:

```bash
fail2ban-client status sshd
```

---

## 11. Banners de seguranca (CIS 1.7.x)

### 11.1 Configurar /etc/issue e /etc/issue.net

```bash
cat > /etc/issue << 'EOF'
********************************************************************
*  Acesso autorizado apenas. Todas as atividades sao monitoradas. *
*  Uso nao autorizado sera reportado e processado.                *
********************************************************************
EOF

cp /etc/issue /etc/issue.net
```

### 11.2 Configurar /etc/motd

```bash
cat > /etc/motd << 'EOF'
********************************************************************
*  tatulab - Ambiente monitorado                                  *
********************************************************************
EOF
```

---

## 12. Blacklist de modulos kernel (CIS 1.1.x / 3.4.x)

```bash
cat > /etc/modprobe.d/cis-blacklist.conf << 'EOF'
install cramfs /bin/true
blacklist cramfs
install freevxfs /bin/true
blacklist freevxfs
install hfs /bin/true
blacklist hfs
install hfsplus /bin/true
blacklist hfsplus
install jffs2 /bin/true
blacklist jffs2
install udf /bin/true
blacklist udf
install dccp /bin/true
blacklist dccp
install sctp /bin/true
blacklist sctp
install rds /bin/true
blacklist rds
install tipc /bin/true
blacklist tipc
install usb-storage /bin/true
blacklist usb-storage
EOF
```

---

## 13. Desabilitar core dumps (CIS 1.5.x)

### 13.1 Via limits

```bash
cat > /etc/security/limits.d/cis-hardening.conf << 'EOF'
# CIS 1.5.4 - Desabilitar core dumps
* hard core 0
EOF
```

### 13.2 Via sysctl (ja configurado no passo 5.3)

Verificar:

```bash
sysctl fs.suid_dumpable
# Saida esperada: fs.suid_dumpable = 0
```

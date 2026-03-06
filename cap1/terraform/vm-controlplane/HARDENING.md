# Hardening - tatulab

Documentacao dos controles de seguranca aplicados no cluster RKE2 do tatulab.
Baseado no **CIS Benchmark Level 1 para Ubuntu 22.04/24.04** com ajustes para Kubernetes.

O hardening e executado automaticamente pelo Terraform via `ansible-playbook -i hosts.ini hardening.yml` **antes** da instalacao do RKE2.

---

## Fluxo de execucao

```
Terraform apply
  |-> Cria VMs no Proxmox (cloud-init)
  |-> Aguarda SSH ficar disponivel
  |-> Executa hardening.yml        <-- hardening acontece aqui
  |-> Executa install-rke2-cluster.yml
```

---

## A) SSH Hardening (CIS 5.2.x)

| Configuracao               | Valor          | Referencia  |
|----------------------------|----------------|-------------|
| PermitRootLogin            | no             | CIS 5.2.8   |
| PasswordAuthentication     | no             | CIS 5.2.10  |
| PermitEmptyPasswords       | no             | CIS 5.2.11  |
| X11Forwarding              | no             | CIS 5.2.6   |
| MaxAuthTries               | 4              | CIS 5.2.7   |
| ClientAliveInterval        | 300            | CIS 5.2.16  |
| ClientAliveCountMax        | 3              | CIS 5.2.16  |
| LoginGraceTime             | 60             | CIS 5.2.17  |
| AllowAgentForwarding       | no             | CIS 5.2.5   |
| AllowTcpForwarding         | no             | CIS 5.2.4   |
| Protocol                   | 2              | CIS 5.2.1   |
| LogLevel                   | VERBOSE        | CIS 5.2.3   |
| MaxSessions                | 4              | CIS 5.2.22  |
| UseDNS                     | no             | -            |
| Banner                     | /etc/issue.net | CIS 5.2.18  |

- Permissao do `sshd_config` restrita a `0600 root:root`
- Acesso somente por chave SSH (cloud-init configura a chave publica)

---

## B) Kernel e sysctl (CIS 3.x + Kubernetes)

### Modulos carregados (necessarios para K8s)

| Modulo         | Motivo                                 |
|----------------|----------------------------------------|
| br_netfilter   | Bridge netfilter para iptables do K8s  |
| overlay        | Overlay filesystem para containers     |

Ambos persistidos em `/etc/modules-load.d/`.

### Parametros sysctl

Arquivo: `/etc/sysctl.d/99-cis-kubernetes.conf`

**Rede (CIS 3.2.x):**

| Parametro                                   | Valor | Referencia |
|---------------------------------------------|-------|------------|
| net.ipv4.ip_forward                         | 1     | K8s requer |
| net.bridge.bridge-nf-call-iptables          | 1     | K8s requer |
| net.bridge.bridge-nf-call-ip6tables         | 1     | K8s requer |
| net.ipv4.conf.all.send_redirects            | 0     | CIS 3.2.1  |
| net.ipv4.conf.default.send_redirects        | 0     | CIS 3.2.1  |
| net.ipv4.conf.all.accept_source_route       | 0     | CIS 3.2.2  |
| net.ipv4.conf.default.accept_source_route   | 0     | CIS 3.2.2  |
| net.ipv4.conf.all.accept_redirects          | 0     | CIS 3.2.3  |
| net.ipv4.conf.default.accept_redirects      | 0     | CIS 3.2.3  |
| net.ipv4.conf.all.secure_redirects          | 0     | CIS 3.2.4  |
| net.ipv4.conf.default.secure_redirects      | 0     | CIS 3.2.4  |
| net.ipv4.conf.all.log_martians              | 1     | CIS 3.2.5  |
| net.ipv4.conf.default.log_martians          | 1     | CIS 3.2.5  |
| net.ipv4.icmp_echo_ignore_broadcasts        | 1     | CIS 3.2.6  |
| net.ipv4.icmp_ignore_bogus_error_responses  | 1     | CIS 3.2.7  |
| net.ipv4.conf.all.rp_filter                 | 1     | CIS 3.2.8  |
| net.ipv4.conf.default.rp_filter             | 1     | CIS 3.2.8  |
| net.ipv4.tcp_syncookies                     | 1     | CIS 3.2.9  |
| net.ipv6.conf.all.accept_redirects          | 0     | CIS 3.2.3  |
| net.ipv6.conf.default.accept_redirects      | 0     | CIS 3.2.3  |
| net.ipv6.conf.all.accept_source_route       | 0     | CIS 3.2.2  |
| net.ipv6.conf.default.accept_source_route   | 0     | CIS 3.2.2  |

**Kernel hardening:**

| Parametro              | Valor | Referencia |
|------------------------|-------|------------|
| kernel.randomize_va_space | 2  | CIS 1.5.2 (ASLR completo) |
| kernel.sysrq           | 0     | CIS 1.5.3  |
| fs.suid_dumpable       | 0     | CIS 1.5.4  |

**Kubernetes extras:**

| Parametro                       | Valor  | Motivo                          |
|---------------------------------|--------|---------------------------------|
| vm.overcommit_memory            | 1      | Evita OOM killer em containers  |
| vm.panic_on_oom                 | 0      | Nao panic no OOM                |
| fs.inotify.max_user_watches     | 524288 | Suporte a muitos pods/watchers  |
| fs.inotify.max_user_instances   | 8192   | Suporte a muitas instancias     |

---

## C) Servicos desnecessarios desabilitados (CIS 2.1.x / 2.2.x)

Servicos parados e desabilitados:

| Servico          | Motivo                               |
|------------------|--------------------------------------|
| avahi-daemon     | mDNS desnecessario                   |
| cups             | Servidor de impressao                |
| isc-dhcp-server  | DHCP server (IPs sao estaticos)      |
| slapd            | LDAP server                          |
| nfs-server       | NFS nao utilizado                    |
| rpcbind          | RPC desnecessario                    |
| rsync            | Transferencia de arquivos            |
| snmpd            | Monitoramento SNMP                   |
| squid            | Proxy HTTP                           |

---

## D) Permissoes de arquivos criticos (CIS 6.1.x)

| Arquivo          | Permissao | Owner        |
|------------------|-----------|--------------|
| /etc/passwd      | 0644      | root:root    |
| /etc/shadow      | 0640      | root:shadow  |
| /etc/group       | 0644      | root:root    |
| /etc/gshadow     | 0640      | root:shadow  |
| /etc/passwd-     | 0600      | root:root    |
| /etc/shadow-     | 0600      | root:root    |
| /etc/group-      | 0600      | root:root    |
| /etc/gshadow-    | 0600      | root:root    |

**Cron** (`0700 root:root`):
- /etc/crontab
- /etc/cron.hourly
- /etc/cron.daily
- /etc/cron.weekly
- /etc/cron.monthly
- /etc/cron.d

---

## E) Auditoria (CIS 4.1.x)

Pacotes: `auditd`, `audispd-plugins`

Regras em `/etc/audit/rules.d/cis.rules`:

| Categoria                | Referencia | O que monitora                              |
|--------------------------|------------|---------------------------------------------|
| Alteracoes de data/hora  | CIS 4.1.3  | adjtimex, settimeofday, clock_settime, /etc/localtime |
| Usuarios e grupos        | CIS 4.1.4  | /etc/passwd, /etc/shadow, /etc/group, /etc/gshadow, /etc/security/opasswd |
| Configuracao de rede     | CIS 4.1.5  | sethostname, setdomainname, /etc/issue, /etc/hosts, /etc/network |
| Logins                   | CIS 4.1.7  | /var/log/faillog, /var/log/lastlog, /var/log/tallylog |
| Sessoes                  | CIS 4.1.8  | /var/run/utmp, /var/log/wtmp, /var/log/btmp |
| Sudo                     | CIS 4.1.13 | /etc/sudoers, /etc/sudoers.d/               |
| Modulos do kernel        | CIS 4.1.16 | insmod, rmmod, modprobe, init_module, delete_module |

A regra `-e 2` no final torna a configuracao de auditoria **imutavel** (requer reboot para alterar).

---

## F) AppArmor (CIS 1.6.x)

- Pacotes: `apparmor`, `apparmor-utils`
- Servico habilitado e ativo
- Provê MAC (Mandatory Access Control) para confinar processos

---

## G) Fail2ban

Protecao contra brute-force via rede.

| Parametro  | Valor   |
|------------|---------|
| bantime    | 3600s   |
| findtime   | 600s    |
| maxretry   | 5       |
| backend    | systemd |

**Jail SSH:**
- Habilitado com `maxretry = 3`
- Bloqueia IP por 1 hora apos 3 tentativas falhas em 10 minutos

---

## H) Banners de acesso (CIS 1.7.x)

Configurados em:
- `/etc/issue` — login local
- `/etc/issue.net` — login remoto (SSH)
- `/etc/motd` — mensagem pos-login

Conteudo: aviso de que o acesso e autorizado apenas para usuarios permitidos e que todas as atividades sao monitoradas.

---

## I) Blacklist de modulos de kernel (CIS 1.1.x / 3.4.x)

Arquivo: `/etc/modprobe.d/cis-blacklist.conf`

| Modulo      | Categoria                          |
|-------------|------------------------------------|
| cramfs      | Filesystem obsoleto (CIS 1.1.1.1)  |
| freevxfs    | Filesystem obsoleto (CIS 1.1.1.2)  |
| hfs         | Filesystem obsoleto (CIS 1.1.1.3)  |
| hfsplus     | Filesystem obsoleto (CIS 1.1.1.4)  |
| jffs2       | Filesystem obsoleto (CIS 1.1.1.5)  |
| udf         | Filesystem obsoleto (CIS 1.1.1.6)  |
| dccp        | Protocolo de rede (CIS 3.4.1)      |
| sctp        | Protocolo de rede (CIS 3.4.2)      |
| rds         | Protocolo de rede (CIS 3.4.3)      |
| tipc        | Protocolo de rede (CIS 3.4.4)      |
| usb-storage | Previne exfiltracao via USB         |

---

## J) Limites de recursos (CIS 1.5.x)

- Core dumps desabilitados via `/etc/security/limits.d/cis-hardening.conf` (`* hard core 0`)
- Core dumps desabilitados via sysctl (`fs.suid_dumpable = 0`)

---

## K) Cloud-init (Terraform)

Controles aplicados na criacao da VM:

| Controle                    | Detalhe                                     |
|-----------------------------|---------------------------------------------|
| Usuario dedicado            | `devopstatu` (nao usa root)                 |
| Autenticacao por chave SSH  | Chave publica injetada via cloud-init       |
| Sudo sem senha              | NOPASSWD para automacao (Ansible)           |
| IPs estaticos               | Definidos no terraform.tfvars               |
| DNS customizado             | 192.168.1.40 e 192.168.1.1                 |

---

## L) RKE2 (Kubernetes)

Controles aplicados na configuracao do cluster:

| Controle                  | Detalhe                                          |
|---------------------------|--------------------------------------------------|
| kubeconfig restrito       | `write-kubeconfig-mode: "0600"`                  |
| Ingress padrao removido   | `disable: rke2-ingress-nginx`                    |
| CNI padrao removido       | `disable: rke2-canal` (usa Calico)               |
| TLS SAN                   | Inclui IP e DNS do load balancer                 |
| Control plane taint       | `NoSchedule` impede pods de app nos masters      |
| HA via HAProxy            | API server acessado via load balancer externo     |
| Token unico por deploy    | Gerado dinamicamente a cada `terraform apply`    |

---

## Resumo por referencia CIS

| Secao CIS | Area                     | Status     |
|-----------|--------------------------|------------|
| 1.1.x     | Filesystems              | Aplicado   |
| 1.5.x     | Limites e ASLR           | Aplicado   |
| 1.6.x     | AppArmor                 | Aplicado   |
| 1.7.x     | Banners                  | Aplicado   |
| 2.1-2.2   | Servicos desnecessarios  | Aplicado   |
| 3.2.x     | Parametros de rede       | Aplicado   |
| 3.4.x     | Modulos de rede          | Aplicado   |
| 4.1.x     | Auditoria                | Aplicado   |
| 5.2.x     | SSH                      | Aplicado   |
| 6.1.x     | Permissoes de arquivos   | Aplicado   |

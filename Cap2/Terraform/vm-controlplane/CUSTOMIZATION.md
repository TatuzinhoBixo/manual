# Guia de Customização — Cluster RKE2 tatulab

Tudo que pode ser alterado para provisionar um novo cluster.
Editar **apenas** `terraform.tfvars` (exceto onde indicado).

---

## Variáveis Obrigatórias (sem default)

| Variável | Tipo | Descrição |
|----------|------|-----------|
| `proxmox_password` | string | Senha do Proxmox |
| `ssh_public_key` | string | Chave pública SSH injetada nas VMs via cloud-init |

---

## Variáveis com Default

Só precisa declarar no `terraform.tfvars` se quiser sobrescrever o default.

### Proxmox / Infra

| Variável | Default | Descrição |
|----------|---------|-----------|
| `proxmox_user` | `root@pam` | Usuário de autenticação no Proxmox |
| `storage` | `local` | Datastore do Proxmox para discos das VMs |
| `template_id` | `200` | ID da VM template usada para clone |
| `gateway` | `192.168.1.1` | Gateway de rede das VMs |
| `dns_servers` | `["192.168.1.40", "192.168.1.1"]` | Servidores DNS das VMs |

### Acesso SSH

| Variável | Default | Descrição |
|----------|---------|-----------|
| `vm_user` | `devopstatu` | Usuário criado via cloud-init (SSH + sudo + Ansible) |
| `ssh_private_key_path` | `.../controlplane-install/devopstatu` | Caminho local da chave privada SSH |

### Kubernetes / RKE2

| Variável | Default | Descrição |
|----------|---------|-----------|
| `rke2_version` | `latest` | Versão do RKE2 (ex: `v1.28.5+rke2r1`) |
| `rke2_cni` | `calico` | Plugin CNI do cluster |
| `k8s_endpoint_ip` | `192.168.1.41` | IP do HAProxy (load balancer do API server) |
| `k8s_endpoint_dns` | `kube.tatulab.com.br` | DNS do endpoint Kubernetes (incluído no tls-san) |

### MetalLB

| Variável | Default | Descrição |
|----------|---------|-----------|
| `metallb_pool_name` | `pool-tatulab` | Nome do IPAddressPool |
| `metallb_ip_range` | `192.168.1.70-192.168.1.95` | Faixa de IPs para Services do tipo LoadBalancer |

---

## Mapa de VMs — `vms`

Cada entrada no mapa cria uma VM no Proxmox. Adicione, remova ou altere livremente.

```hcl
vms = {
  # --- Control Planes (role = "server") ---
  "vm-control1" = {
    vm_id   = 301               # ID único no Proxmox
    ip      = "192.168.1.42/24" # IP fixo + CIDR
    cores   = 4                 # vCPUs
    memory  = 4096              # RAM em MB
    disk_gb = 60                # Disco em GB
    role    = "server"          # control plane
  }
  "vm-control2" = {
    vm_id   = 302
    ip      = "192.168.1.43/24"
    cores   = 4
    memory  = 4096
    disk_gb = 60
    role    = "server"
  }
  "vm-control3" = {
    vm_id   = 303
    ip      = "192.168.1.44/24"
    cores   = 4
    memory  = 4096
    disk_gb = 60
    role    = "server"
  }

  # --- Workers (role = "agent") ---
  "vm-work1" = {
    vm_id   = 304
    ip      = "192.168.1.45/24"
    cores   = 8
    memory  = 8192
    disk_gb = 80
    role    = "agent"           # worker node
  }
}
```

### Regras

| Campo | Regra |
|-------|-------|
| **Nome** (`vm-control1`) | Livre escolha, vira o hostname da VM |
| **vm_id** | Deve ser único no Proxmox |
| **ip** | Deve estar na mesma subnet do gateway, formato `x.x.x.x/24` |
| **role** | `server` = control plane, `agent` = worker |
| **Servers** | Quantidade ímpar (1, 3 ou 5) para quorum do etcd |
| **Workers** | Opcionais, pode ter 0 ou N |
| **Bootstrap** | O primeiro `server` no mapa é o bootstrap automático (gera token e inicia o cluster) |

---

## Infraestrutura Fixa

Estes valores estão hardcoded nos `.tf`. Para alterar, editar diretamente:

| Item | Valor Atual | Arquivo |
|------|-------------|---------|
| Endpoint Proxmox | `https://192.168.1.229:8006` | `providers.tf` |
| Node Proxmox | `tatuserv` | `main.tf` |
| Bridge de rede | `vmbr0` | `main.tf` |
| Tipo de CPU | `x86-64-v2-AES` | `main.tf` |

---

## Exemplo: Cluster Mínimo (1 server, 0 workers)

```hcl
proxmox_password = "SuaSenha"
ssh_public_key   = "ssh-rsa AAAA..."
storage          = "ssdhp"

vms = {
  "vm-master" = {
    vm_id   = 400
    ip      = "192.168.1.50/24"
    cores   = 4
    memory  = 4096
    disk_gb = 40
    role    = "server"
  }
}
```

## Exemplo: Cluster HA (3 servers + 2 workers)

```hcl
proxmox_password = "SuaSenha"
ssh_public_key   = "ssh-rsa AAAA..."
storage          = "ssdhp"
k8s_endpoint_ip  = "192.168.1.41"
metallb_ip_range = "192.168.1.100-192.168.1.120"

vms = {
  "cp1" = { vm_id = 401, ip = "192.168.1.51/24", cores = 4, memory = 4096, disk_gb = 60, role = "server" }
  "cp2" = { vm_id = 402, ip = "192.168.1.52/24", cores = 4, memory = 4096, disk_gb = 60, role = "server" }
  "cp3" = { vm_id = 403, ip = "192.168.1.53/24", cores = 4, memory = 4096, disk_gb = 60, role = "server" }
  "wk1" = { vm_id = 404, ip = "192.168.1.54/24", cores = 8, memory = 8192, disk_gb = 80, role = "agent" }
  "wk2" = { vm_id = 405, ip = "192.168.1.55/24", cores = 8, memory = 8192, disk_gb = 80, role = "agent" }
}
```

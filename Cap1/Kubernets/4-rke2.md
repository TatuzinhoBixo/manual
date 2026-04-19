# Instalação do Cluster RKE2

## Descrição

Este documento detalha o processo de instalação de um cluster Kubernetes RKE2 em VMs. O RKE2 é uma distribuição Kubernetes certificada pela CNCF, focada em segurança e conformidade.

## Pré-requisitos

- VMs provisionadas conforme especificado em `01 - pre-Requisitos/rke2.md`
- HAProxy configurado (ver `haproxy.md`)
- Registros DNS configurados (ver `dns.md`)
- Ferramentas instaladas nas VMs (ver `01 - pre-Requisitos/installLinux.md`)

## Variáveis de Configuração

| Variável            | Descrição                  | Exemplo                  |
| :------------------ | :------------------------- | :----------------------- |
| `<IP_HAPROXY>`      | IP do balanceador de carga | 192.168.1.41             |
| `<IP_CONTROLPLANE>` | IP real do control plane   | 192.168.1.42             |
| `<DNS_CLUSTER>`     | FQDN do cluster            | kube.exemplo.com.br      |
| `<VERSAO_RKE2>`     | Versão do RKE2             | v1.31.4+rke2r1           |
| `<TOKEN>`           | Token de join do cluster   | (gerado automaticamente) |

---

## Etapa 1: Verificar Versão Compatível

Antes de instalar, consulte a versão do Kubernetes compatível com o Rancher:

- [Matriz de compatibilidade Rancher/RKE2](https://www.suse.com/suse-rancher/support-matrix/all-supported-versions)

Para listar as versões disponíveis do RKE2:

```bash
curl -s https://api.github.com/repos/rancher/rke2/releases | grep 'tag_name' | cut -d\" -f4 | sort -V | grep -v 'rc'
```

> **Atenção com HAProxy**: Se estiver usando HAProxy, certifique-se de que apenas os nós ativos estejam configurados no backend. Nós registrados sem o serviço `rke2-server` rodando causarão problemas na instalação.

---

## Etapa 2: Instalação do Primeiro Control Plane

### 2.1 Criar estrutura de diretórios

```bash
mkdir -p /etc/rancher/rke2
```

### 2.2 Criar arquivo de configuração

```bash
touch /etc/rancher/rke2/config.yaml
```

### 2.3 Configurar o primeiro control plane

Edite o arquivo `/etc/rancher/rke2/config.yaml`:

```yaml
write-kubeconfig-mode: "0600"
cluster-init: true
cni: calico
disable:
  - rke2-ingress-nginx
  - rke2-canal
tls-san:
  - <IP_HAPROXY>
  - <DNS_CLUSTER>
```

| Parâmetro               | Descrição                                              |
| :---------------------- | :----------------------------------------------------- |
| `write-kubeconfig-mode` | Permissões do arquivo kubeconfig (0600 = apenas owner) |
| `cluster-init`          | Indica que este é o primeiro nó do cluster             |
| `cni`                   | Plugin de rede do cluster (Calico)                     |
| `disable`               | Componentes desabilitados (usaremos Ingress externo)   |
| `tls-san`               | IPs/DNS que serão incluídos no certificado TLS         |
| `node-external-ip`      | IP externo do nó para comunicação                      |

> **Importante**: O HAProxy e DNS devem estar configurados antes desta etapa. Se usar apenas um control plane, o IP/DNS do cluster pode ser o mesmo da VM.

### 2.4 Instalar o RKE2

```bash
curl -sfL https://get.rke2.io | INSTALL_RKE2_VERSION="<VERSAO_RKE2>" INSTALL_RKE2_TYPE="server" sh -
```

### 2.5 Iniciar o serviço

```bash
systemctl start rke2-server
systemctl enable rke2-server
```

### 2.6 Configurar kubectl

Configure o acesso ao cluster para gerenciamento:

```bash
mkdir -p ~/.kube
sudo cp /etc/rancher/rke2/rke2.yaml ~/.kube/config
sudo chown $(id -u):$(id -g) ~/.kube/config
```

### 2.7 Verificar instalação

```bash
kubectl get nodes
```

### 2.8 Configurar DNS externo no CoreDNS (opcional)

Para que os pods resolvam nomes externos, edite o ConfigMap do CoreDNS:

```bash
# Identificar o nome do ConfigMap
kubectl get configmap -n kube-system | grep coredns

# Editar o ConfigMap
kubectl edit configmap rke2-coredns-rke2-coredns -n kube-system
```

> **Após subir o primeiro control plane**: Remova ou comente a linha `cluster-init: true` do arquivo config.yaml antes de adicionar outros nós.

```bash
write-kubeconfig-mode: "0600"
server: https://<IP_HAPROXY>:9345
token: <TOKEN>
cni: calico
disable:
  - rke2-ingress-nginx
  - rke2-canal
tls-san:
  - <IP_HAPROXY>
  - <DNS>
```

---

## Etapa 3: Control Planes Adicionais

### 3.1 Obter token de join

No primeiro control plane, execute:

```bash
cat /var/lib/rancher/rke2/server/node-token
```

### 3.2 Configurar novo control plane

Crie a estrutura de diretórios:

```bash
mkdir -p /etc/rancher/rke2
touch /etc/rancher/rke2/config.yaml
```

Edite o arquivo `/etc/rancher/rke2/config.yaml`:

```yaml
server: https://<IP_HAPROXY>:9345
token: <TOKEN>
write-kubeconfig-mode: "0600"
cni: calico
disable:
  - rke2-ingress-nginx
  - rke2-canal
tls-san:
  - <IP_HAPROXY>
  - <DNS_CLUSTER>
node-external-ip: <IP_CONTROLPLANE>
```

### 3.3 Atualizar HAProxy

> **Importante**: Antes de iniciar o serviço, adicione o IP do novo control plane no backend do HAProxy. Sem isso, o nó não será reconhecido no cluster.

### 3.4 Instalar e iniciar

```bash
# Instalar RKE2
curl -sfL https://get.rke2.io | INSTALL_RKE2_VERSION="<VERSAO_RKE2>" INSTALL_RKE2_TYPE="server" sh -

# Iniciar serviço
systemctl start rke2-server
systemctl enable rke2-server
```

### 3.5 Monitorar instalação

Em outro terminal, acompanhe os logs:

```bash
journalctl -f -eu rke2-server
```

---

## Etapa 4: Configurar Taints nos Control Planes

Para garantir que os control planes não executem pods de aplicações, aplique taints:

### 4.1 Aplicar taint (recomendado para produção)

```bash
kubectl taint nodes -l 'node-role.kubernetes.io/control-plane' node-role.kubernetes.io/control-plane=:NoSchedule
```

### 4.2 Remover taint (se necessário)

```bash
kubectl taint nodes -l 'node-role.kubernetes.io/control-plane' node-role.kubernetes.io/control-plane:NoSchedule-
```

### 4.3 Remover pods existentes dos control planes

Se já existirem pods nos control planes:

```bash
# Drenar cada control plane
kubectl drain <NOME_CONTROLPLANE_1> --ignore-daemonsets --delete-emptydir-data
kubectl drain <NOME_CONTROLPLANE_2> --ignore-daemonsets --delete-emptydir-data
kubectl drain <NOME_CONTROLPLANE_3> --ignore-daemonsets --delete-emptydir-data

# Reabilitar para DaemonSets
kubectl uncordon <NOME_CONTROLPLANE_1> <NOME_CONTROLPLANE_2> <NOME_CONTROLPLANE_3>
```

### 4.4 Verificar taints

```bash
kubectl describe node <NOME_CONTROLPLANE> | grep Taint
```

---

## Etapa 5: Instalação dos Worker Nodes

### 5.1 Criar estrutura de diretórios

```bash
mkdir -p /etc/rancher/rke2
touch /etc/rancher/rke2/config.yaml
```

### 5.2 Configurar worker

Edite o arquivo `/etc/rancher/rke2/config.yaml`:

```yaml
server: https://<HAPROXY_IP>:9345
token: <mesmo token do control1>
```

### 5.3 Verificar versão do cluster

Em uma máquina com kubectl configurado, verifique a versão do cluster:

```bash
kubectl get nodes
```

Use a mesma versão RKE2 para os workers.

### 5.4 Instalar e iniciar

```bash
# Instalar RKE2 como agent
curl -sfL https://get.rke2.io | INSTALL_RKE2_VERSION="<VERSAO_RKE2>" INSTALL_RKE2_TYPE="agent" sh -

# Iniciar serviço
systemctl start rke2-agent
systemctl enable rke2-agent
```

### 5.5 Monitorar instalação

```bash
journalctl -f -eu rke2-agent
```

---

## Etapa 6: Configurar DNS no CoreDNS (Pós-instalação)

Para que os pods resolvam nomes de DNS externos, configure o forwarder no CoreDNS:

```bash
kubectl edit configmap rke2-coredns-rke2-coredns -n kube-system
```

Altere a linha `forward` para apontar para seu DNS:

```
forward . <IP_DNS_INTERNO>
```

---

## Troubleshooting

| Problema                  | Solução                                              |
| :------------------------ | :--------------------------------------------------- |
| Nó não aparece no cluster | Verificar se o HAProxy está configurado corretamente |
| Erro de certificado       | Verificar se `tls-san` inclui IP e DNS corretos      |
| Serviço não inicia        | Verificar logs com `journalctl -xeu rke2-server`     |
| Pods em Pending           | Verificar se há workers disponíveis e sem taints     |

## Referências

- [Documentação RKE2](https://docs.rke2.io/)
- [Matriz de compatibilidade Rancher](https://www.suse.com/suse-rancher/support-matrix/all-supported-versions)

# Instalação do HAProxy

## Descrição

HAProxy é o balanceador de carga utilizado para distribuir tráfego entre os control planes do cluster RKE2. Ele atua como ponto de entrada único para a API do Kubernetes.

## Pré-requisitos

- VM provisionada conforme `01 - pre-Requisitos/haproxy.md`
- Registro DNS do cluster apontando para o IP do HAProxy
- IPs dos control planes definidos

## Variáveis de Configuração

| Variável | Descrição | Exemplo |
|:---------|:----------|:--------|
| `<IP_CONTROLPLANE_1>` | IP do primeiro control plane | 192.168.1.42 |
| `<IP_CONTROLPLANE_2>` | IP do segundo control plane | 192.168.1.43 |
| `<IP_CONTROLPLANE_3>` | IP do terceiro control plane | 192.168.1.44 |
| `<REDE_PERMITIDA>` | Range de IPs permitidos no stats | 192.168.1.0/24 |
| `<USUARIO_STATS>` | Usuário para acessar estatísticas | admin |
| `<SENHA_STATS>` | Senha do usuário stats | (usar senha forte) |

---

## Etapa 1: Instalação

```bash
sudo apt install haproxy -y
```

Faça backup da configuração original:

```bash
sudo cp /etc/haproxy/haproxy.cfg /etc/haproxy/haproxy.cfg.bak
```

---

## Etapa 2: Configuração

Edite o arquivo `/etc/haproxy/haproxy.cfg`:

```bash
sudo vim /etc/haproxy/haproxy.cfg
```

### Configuração Completa

```haproxy
# ===========================================
# Autenticação para página de estatísticas
# ===========================================
userlist stats-auth
    group admin users admin
    user <USUARIO_STATS> insecure-password <SENHA_STATS>

# ===========================================
# Frontend: Página de Estatísticas (porta 8404)
# ===========================================
frontend stats
    bind *:8404
    stats enable
    stats uri /stats
    stats refresh 10s
    acl AUTH http_auth(stats-auth)
    acl AUTH_ADMIN http_auth_group(stats-auth) admin
    stats http-request auth unless AUTH
    stats admin if AUTH_ADMIN
    acl is_permit src <REDE_PERMITIDA>
    acl is_stats url_beg /stats
    http-request deny deny_status 403 if is_stats !is_permit

# ===========================================
# Frontend: API Kubernetes (porta 6443)
# ===========================================
frontend kubernetes_api
    bind *:6443
    mode tcp
    option tcplog
    default_backend k8s_control_planes

# ===========================================
# Backend: Control Planes - API (6443)
# ===========================================
backend k8s_control_planes
    mode tcp
    balance roundrobin
    option tcp-check
    server controlplane1 <IP_CONTROLPLANE_1>:6443 check fall 5 rise 2
    server controlplane2 <IP_CONTROLPLANE_2>:6443 check fall 5 rise 2
    server controlplane3 <IP_CONTROLPLANE_3>:6443 check fall 5 rise 2

# ===========================================
# Frontend: RKE2 Server (porta 9345)
# ===========================================
frontend rke2_server
    bind *:9345
    mode tcp
    option tcplog
    default_backend rke2_control_planes

# ===========================================
# Backend: Control Planes - RKE2 (9345)
# ===========================================
backend rke2_control_planes
    mode tcp
    balance roundrobin
    option tcp-check
    server controlplane1 <IP_CONTROLPLANE_1>:9345 check fall 5 rise 2
    server controlplane2 <IP_CONTROLPLANE_2>:9345 check fall 5 rise 2
    server controlplane3 <IP_CONTROLPLANE_3>:9345 check fall 5 rise 2
```

---

## Etapa 3: Validar e Iniciar

### Validar configuração

```bash
sudo haproxy -c -f /etc/haproxy/haproxy.cfg
```

### Reiniciar serviço

```bash
sudo systemctl restart haproxy
sudo systemctl enable haproxy
```

### Verificar status

```bash
sudo systemctl status haproxy
```

---

## Configuração Avançada: Múltiplos Clusters

Para balancear múltiplos clusters no mesmo HAProxy, adicione um segundo IP à interface de rede:

### Configurar IP adicional (Netplan)

Edite `/etc/netplan/00-installer-config.yaml`:

```yaml
network:
    ethernets:
        ens3:
            addresses:
                - <IP_HAPROXY_CLUSTER_1>/<MASCARA>
                - <IP_HAPROXY_CLUSTER_2>/<MASCARA>
            nameservers:
                addresses:
                    - <IP_DNS>
            routes:
                - to: default
                  via: <IP_GATEWAY>
    version: 2
```

Aplique as mudanças:

```bash
sudo netplan apply
```

### Ajustar HAProxy

Substitua `bind *:6443` por `bind <IP_CLUSTER_1>:6443` para cada cluster.

---

## Observações

> **Ordem de inicialização**: Durante a instalação do cluster, mantenha apenas um control plane ativo no backend. Adicione os demais após a inicialização completa.

> **Health checks**: Os parâmetros `fall 5 rise 2` significam:
> - `fall 5`: Marcar como down após 5 falhas consecutivas
> - `rise 2`: Marcar como up após 2 sucessos consecutivos

## Referências

- [Documentação HAProxy](https://www.haproxy.com/documentation/)
- [HAProxy Configuration Manual](https://www.haproxy.com/blog/the-four-essential-sections-of-an-haproxy-configuration/)
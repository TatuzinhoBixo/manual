# MetalLB - Load Balancer para Kubernetes Bare-Metal

## Descrição

MetalLB é uma implementação de Load Balancer para clusters Kubernetes em ambientes bare-metal (on-premises). Em provedores de nuvem, serviços do tipo `LoadBalancer` recebem IPs externos automaticamente. Em ambientes bare-metal, o MetalLB preenche essa lacuna, atribuindo IPs de um pool configurado aos serviços.

## Pré-requisitos

- Cluster Kubernetes funcional
- kubectl configurado e com acesso ao cluster
- Range de IPs disponíveis na rede (não utilizados por DHCP ou outros serviços)

## Variáveis de Configuração

| Variável | Descrição | Exemplo |
|:---------|:----------|:--------|
| `<IP_INICIO>` | Primeiro IP do pool | 192.168.1.100 |
| `<IP_FIM>` | Último IP do pool | 192.168.1.110 |
| `<NOME_POOL>` | Nome identificador do pool | first-pool |
| `<NOME_ADVERTISEMENT>` | Nome do L2Advertisement | l2-advertisement |

---

## Etapa 1: Instalar o MetalLB

```bash
kubectl apply -f https://raw.githubusercontent.com/metallb/metallb/v0.15.2/config/manifests/metallb-native.yaml
```

Aguarde os pods ficarem prontos:

```bash
kubectl get pods -n metallb-system
```

---

## Etapa 2: Configurar o Pool de IPs

Crie o manifesto `metallb-config.yaml`:

```yaml
apiVersion: metallb.io/v1beta1
kind: IPAddressPool
metadata:
  name: <NOME_POOL>
  namespace: metallb-system
spec:
  addresses:
    - <IP_INICIO>-<IP_FIM>
---
apiVersion: metallb.io/v1beta1
kind: L2Advertisement
metadata:
  name: <NOME_ADVERTISEMENT>
  namespace: metallb-system
spec:
  ipAddressPools:
    - <NOME_POOL>
```

Aplique o manifesto:

```bash
kubectl apply -f metallb-config.yaml
```

---

## Adicionar Novas Faixas de IP

Para adicionar uma nova faixa de IPs, edite o IPAddressPool existente ou crie um novo:

```yaml
apiVersion: metallb.io/v1beta1
kind: IPAddressPool
metadata:
  name: second-pool
  namespace: metallb-system
spec:
  addresses:
    - <NOVO_IP_INICIO>-<NOVO_IP_FIM>
```

Não esqueça de adicionar o novo pool ao L2Advertisement:

```yaml
spec:
  ipAddressPools:
    - first-pool
    - second-pool
```

---

## Comandos Úteis

```bash
# Listar pools de IPs configurados
kubectl get ipaddresspool -n metallb-system

# Ver detalhes de um pool
kubectl describe ipaddresspool <NOME_POOL> -n metallb-system

# Verificar serviços com IPs atribuídos
kubectl get svc -A | grep LoadBalancer

# Logs do MetalLB (speaker)
kubectl logs -n metallb-system -l app=metallb,component=speaker
```

---

## Modos de Operação

| Modo | Descrição | Uso |
|:-----|:----------|:----|
| Layer 2 (L2) | Usa ARP/NDP para anunciar IPs | Ambientes simples, mesma rede |
| BGP | Anuncia IPs via protocolo BGP | Ambientes com roteadores BGP |

> **Nota**: Esta documentação utiliza o modo Layer 2, mais comum em ambientes on-premises simples.

---

## Referências

- [Documentação Oficial MetalLB](https://metallb.universe.tf/)
- [Instalação MetalLB](https://metallb.universe.tf/installation/)
- [Configuração L2](https://metallb.universe.tf/configuration/_advanced_l2_configuration/)

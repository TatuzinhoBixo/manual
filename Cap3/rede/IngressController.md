# Ingress Controller NGINX

## Descrição

O Ingress Controller é o componente responsável por expor serviços HTTP/HTTPS do cluster Kubernetes para o mundo externo. Ele atua como um ponto de entrada único, roteando requisições para os serviços internos com base em regras definidas nos recursos Ingress.

Em ambientes on-premises (bare-metal), o Ingress Controller trabalha em conjunto com o MetalLB para receber um IP externo fixo.

## Pré-requisitos

- Cluster Kubernetes funcional
- Helm instalado e configurado
- kubectl com acesso ao cluster
- MetalLB instalado (para ambientes bare-metal)

## Variáveis de Configuração

| Variável | Descrição | Exemplo |
|:---------|:----------|:--------|
| `<NOME_INGRESS>` | Nome do release Helm | ingress-nginx |
| `<NAMESPACE>` | Namespace do ingress | ingress-nginx |
| `<INGRESS_CLASS>` | Nome da IngressClass | nginx |
| `<IP_LOADBALANCER>` | IP fixo do LoadBalancer | 192.168.1.50 |
| `<NUM_REPLICAS>` | Número de réplicas | 2 |

---

## Etapa 1: Adicionar Repositório Helm

```bash
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm repo update
```

---

## Etapa 2: Instalar Ingress Controller

### Instalação para Namespace Específico

Para um Ingress Controller que monitora apenas um namespace específico:

```bash
helm install <NOME_INGRESS> ingress-nginx/ingress-nginx \
  --namespace <NAMESPACE> \
  --create-namespace \
  --set controller.ingressClassResource.name=<INGRESS_CLASS> \
  --set controller.ingressClassResource.controllerValue="k8s.io/ingress-nginx" \
  --set controller.service.type=LoadBalancer \
  --set controller.service.loadBalancerIP=<IP_LOADBALANCER> \
  --set controller.replicaCount=<NUM_REPLICAS> \
  --set controller.extraArgs.watch-namespace=<NAMESPACE>
```

### Instalação Global (Default)

Para um Ingress Controller que monitora todos os namespaces:

```bash
helm install <NOME_INGRESS> ingress-nginx/ingress-nginx \
  --namespace <NAMESPACE> \
  --create-namespace \
  --set controller.ingressClassResource.name=<INGRESS_CLASS> \
  --set controller.ingressClassResource.controllerValue="k8s.io/ingress-nginx" \
  --set controller.service.type=LoadBalancer \
  --set controller.service.loadBalancerIP=<IP_LOADBALANCER> \
  --set controller.replicaCount=<NUM_REPLICAS>
```

> **Nota**: Omitir `--set controller.extraArgs.watch-namespace` faz o controller monitorar todos os namespaces.

---

## Etapa 3: Verificar Instalação

```bash
# Verificar pods do ingress
kubectl get pods -n <NAMESPACE>

# Verificar serviço e IP atribuído
kubectl get svc -n <NAMESPACE>

# Listar IngressClasses disponíveis
kubectl get ingressclass
```

---

## Alterar IP do LoadBalancer

Caso seja necessário trocar o IP após a instalação:

```bash
kubectl edit svc <NOME_INGRESS>-ingress-nginx-controller -n <NAMESPACE>
```

Altere o campo `spec.loadBalancerIP` para o novo IP desejado.

Ou via patch:

```bash
kubectl patch svc <NOME_INGRESS>-ingress-nginx-controller -n <NAMESPACE> \
  -p '{"spec":{"loadBalancerIP":"<NOVO_IP>"}}'
```

---

## Parâmetros Importantes

| Parâmetro | Descrição |
|:----------|:----------|
| `controller.hostNetwork=true` | Usa rede do host (útil em RKE2/K3s sem LoadBalancer) |
| `controller.service.type=LoadBalancer` | Expõe via IP externo (requer MetalLB em bare-metal) |
| `controller.service.type=NodePort` | Expõe via porta nos nós |
| `controller.extraArgs.watch-namespace` | Limita monitoramento a namespace específico |

---

## Comandos Úteis

```bash
# Logs do Ingress Controller
kubectl logs -n <NAMESPACE> -l app.kubernetes.io/name=ingress-nginx

# Verificar configuração NGINX gerada
kubectl exec -n <NAMESPACE> <POD_INGRESS> -- cat /etc/nginx/nginx.conf

# Listar todos os Ingress resources
kubectl get ingress -A
```

---

## Referências

- [Documentação Ingress NGINX](https://kubernetes.github.io/ingress-nginx/)
- [Helm Chart](https://artifacthub.io/packages/helm/ingress-nginx/ingress-nginx)
- [Guia de Instalação](https://kubernetes.github.io/ingress-nginx/deploy/)

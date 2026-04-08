# Traefik — Múltiplas Instâncias no Mesmo Cluster

## Descrição

Em alguns cenários é necessário rodar **mais de uma instância do Traefik** no mesmo cluster Kubernetes, cada uma com sua própria `IngressClass`, IP de LoadBalancer e escopo de namespaces. Isso evita que um único Traefik centralize o tráfego de toda a infraestrutura, permitindo isolamento entre ambientes ou equipes.

> **Pré-requisito:** Ter o tutorial base do Traefik como referência para conceitos gerais (entrypoints, IngressRoute, Middlewares, CRDs).

---

## Quando usar múltiplas instâncias?

| Situação                                   | Motivo                                     |
| :----------------------------------------- | :----------------------------------------- |
| Traefik já instalado em outro namespace    | Evitar conflito de IngressClass            |
| Isolamento de tráfego por equipe/projeto   | Cada instância cuida do seu namespace      |
| IPs de LoadBalancer diferentes por serviço | Ex: observability em IP separado do argocd |
| Políticas de segurança por namespace       | `allowCrossNamespace: false` por instância |

---

## Conceito: IngressClass

Cada instância do Traefik deve ter uma `IngressClass` com nome **único** no cluster. É através dela que os recursos `Ingress` e `IngressRoute` sabem qual controller deve processá-los.

```
IngressClass: traefik          → Traefik instalado no namespace argocd
IngressClass: traefik-observability  → Traefik instalado no namespace observability
```

Se duas instâncias compartilharem a mesma IngressClass, ambas tentarão processar as mesmas rotas, causando comportamento imprevisível.

---

## Pré-requisitos

- Cluster Kubernetes funcional
- Helm instalado e configurado
- `kubectl` com acesso ao cluster
- MetalLB instalado e configurado com range de IPs disponível
- Repositório Helm do Traefik adicionado:

```bash
helm repo add traefik https://traefik.github.io/charts
helm repo update
```

- Secret TLS disponível no namespace da nova instância:

```bash
kubectl get secret <NOME_SECRET_TLS> -n <NAMESPACE>
```

---

## Variáveis de Configuração

| Variável            | Descrição                              | Exemplo                |
| :------------------ | :------------------------------------- | :--------------------- |
| `<NOME_RELEASE>`    | Nome do release Helm                   | traefik-observability  |
| `<NAMESPACE>`       | Namespace desta instância              | observability          |
| `<INGRESS_CLASS>`   | Nome único da IngressClass             | traefik-observability  |
| `<IP_LOADBALANCER>` | IP fixo exclusivo desta instância      | 192.168.1.72           |
| `<NOME_SECRET_TLS>` | Nome do Secret com certificado TLS     | tls-tatulab            |
| `<DOMINIO>`         | Domínio a ser exposto                  | grafana.tatulab.com.br |
| `<NOME_SERVICO>`    | Nome do Service Kubernetes do backend  | meu-servico            |
| `<PORTA_SERVICO>`   | Porta do Service Kubernetes do backend | 80                     |

---

## Etapa 1: Verificar instâncias existentes

Antes de instalar, identifique as instâncias já existentes para evitar conflitos:

```bash
# Listar IngressClasses existentes
kubectl get ingressclass

# Listar releases Traefik instalados
helm list -A | grep traefik

# Listar Services do tipo LoadBalancer (verificar IPs em uso)
kubectl get svc -A | grep LoadBalancer
```

---

## Etapa 2: Criar arquivo values.yaml

```yaml
# traefik-<NAMESPACE>-values.yaml

# IngressClass exclusiva desta instância
ingressClass:
  enabled: true
  isDefaultClass: false
  name: <INGRESS_CLASS>

# Deployment
deployment:
  enabled: true
  replicas: <NUM_REPLICAS>

# Service LoadBalancer com IP exclusivo
service:
  enabled: true
  type: LoadBalancer
  loadBalancerIP: <IP_LOADBALANCER>

# Entrypoints
ports:
  web:
    port: 80
    exposedPort: 80
    expose:
      default: true
  websecure:
    port: 443
    exposedPort: 443
    expose:
      default: true

# Logs
logs:
  general:
    level: INFO
  access:
    enabled: true

# Dashboard desabilitado (recomendado para instâncias secundárias)
ingressRoute:
  dashboard:
    enabled: false

# Providers — restrito ao namespace desta instância
providers:
  kubernetesCRD:
    enabled: true
    allowCrossNamespace: false
    namespaces:
      - <NAMESPACE>
  kubernetesIngress:
    enabled: true
    namespaces:
      - <NAMESPACE>

# Resources
resources:
  requests:
    cpu: 100m
    memory: 128Mi
  limits:
    cpu: 500m
    memory: 512Mi
```

> **Nota — `allowCrossNamespace: false`:** Impede que esta instância processe `IngressRoutes` de outros namespaces. Recomendado para isolamento de tráfego.

> **Nota — `namespaces`:** Restringe o watch de recursos ao namespace declarado. Sem isso, o Traefik observa todos os namespaces do cluster mesmo com `allowCrossNamespace: false`.

---

## Etapa 3: Instalar a instância

```bash
helm install <NOME_RELEASE> traefik/traefik \
  -f traefik-<NAMESPACE>-values.yaml \
  -n <NAMESPACE>
```

---

## Etapa 4: Verificar instalação

```bash
# Verificar pod
kubectl get pods -n <NAMESPACE> | grep traefik

# Verificar Service e IP atribuído
kubectl get svc -n <NAMESPACE> | grep traefik

# Verificar IngressClass criada
kubectl get ingressclass <INGRESS_CLASS>
```

O campo `EXTERNAL-IP` do Service deve mostrar `<IP_LOADBALANCER>`.

---

## Etapa 5: Criar IngressRoute

```yaml
apiVersion: traefik.io/v1alpha1
kind: IngressRoute
metadata:
  name: <NOME_SERVICO>-ingressroute
  namespace: <NAMESPACE>
spec:
  entryPoints:
    - websecure
  routes:
    - match: Host(`<DOMINIO>`)
      kind: Rule
      services:
        - name: <NOME_SERVICO>
          port: <PORTA_SERVICO>
  tls:
    secretName: <NOME_SECRET_TLS>
```

```bash
kubectl apply -f <NOME_SERVICO>-ingressroute.yaml

# Verificar
kubectl get ingressroute -n <NAMESPACE>
kubectl describe ingressroute <NOME_SERVICO>-ingressroute -n <NAMESPACE>
```

---

## Etapa 6: Configurar DNS

Adicione o registro A no seu servidor DNS apontando para o IP desta instância:

```
<DOMINIO>  A  <IP_LOADBALANCER>
```

Para teste local via `/etc/hosts`:

```bash
echo "<IP_LOADBALANCER> <DOMINIO>" | sudo tee -a /etc/hosts
```

---

## Etapa 7: Validar acesso

```bash
# Verificar resolução DNS
nslookup <DOMINIO>

# Testar HTTP
curl -I http://<DOMINIO>

# Testar HTTPS
curl -k https://<DOMINIO>

# Testar com Host header direto no IP (sem DNS)
curl -H "Host: <DOMINIO>" -k https://<IP_LOADBALANCER>
```

---

## Visão geral: múltiplas instâncias no cluster

```
Cluster Kubernetes
│
├── namespace: argocd
│   ├── Traefik (release: traefik)
│   │   ├── IngressClass: traefik
│   │   ├── LoadBalancer IP: <IP_INSTANCIA_1>
│   │   └── Watch: namespace argocd
│   └── IngressRoute: argo.tatulab.com.br
│
├── namespace: observability
│   ├── Traefik (release: traefik-observability)
│   │   ├── IngressClass: traefik-observability
│   │   ├── LoadBalancer IP: <IP_INSTANCIA_2>
│   │   └── Watch: namespace observability
│   └── IngressRoute: grafana.tatulab.com.br
│
└── namespace: outro-projeto
    ├── Traefik (release: traefik-outro-projeto)
    │   ├── IngressClass: traefik-outro-projeto
    │   ├── LoadBalancer IP: <IP_INSTANCIA_3>
    │   └── Watch: namespace outro-projeto
    └── IngressRoute: app.tatulab.com.br
```

---

## Atualizar configuração

```bash
vim traefik-<NAMESPACE>-values.yaml

helm upgrade <NOME_RELEASE> traefik/traefik \
  -f traefik-<NAMESPACE>-values.yaml \
  -n <NAMESPACE>
```

---

## Desinstalar instância

```bash
# Remover IngressRoutes do namespace
kubectl delete ingressroute --all -n <NAMESPACE>

# Desinstalar release Helm
helm uninstall <NOME_RELEASE> -n <NAMESPACE>

# Remover IngressClass (se não for removida automaticamente)
kubectl delete ingressclass <INGRESS_CLASS>
```

> **Atenção:** A desinstalação do Traefik não remove os CRDs do cluster (como `IngressRoute`, `Middleware`, etc.) pois eles são compartilhados entre instâncias. Para removê-los, verifique antes se nenhuma outra instância os utiliza.

---

## ServiceMonitor — Métricas do Traefik no Prometheus

Caso o Prometheus Operator esteja instalado no cluster, crie um `ServiceMonitor` para coletar métricas desta instância:

```yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: <NOME_RELEASE>-metrics
  namespace: <NAMESPACE>
  labels:
    release: kube-prometheus-stack
spec:
  selector:
    matchLabels:
      app.kubernetes.io/name: traefik
  namespaceSelector:
    matchNames:
      - <NAMESPACE>
  endpoints:
    - port: metrics
      interval: 30s
```

```bash
kubectl apply -f traefik-servicemonitor.yaml
```

---

## Comandos Úteis

```bash
# Logs da instância
kubectl logs -n <NAMESPACE> -l app.kubernetes.io/name=traefik -f

# Logs filtrando erros
kubectl logs -n <NAMESPACE> -l app.kubernetes.io/name=traefik | grep -i error

# Listar todos os IngressRoutes do namespace
kubectl get ingressroute -n <NAMESPACE>

# Listar todas as IngressClasses do cluster
kubectl get ingressclass

# Listar todos os Services LoadBalancer do cluster (visão geral de IPs)
kubectl get svc -A | grep LoadBalancer

# Listar todos os releases Traefik instalados
helm list -A | grep traefik
```

---

## Troubleshooting

### IP não atribuído ao Service

```bash
kubectl describe svc <NOME_RELEASE> -n <NAMESPACE>
```

Verificar se o IP está dentro do range configurado no MetalLB e se não está em uso por outro Service.

### IngressRoute não processada

```bash
# Verificar se a IngressClass está correta no IngressRoute
kubectl get ingressroute <NOME> -n <NAMESPACE> -o yaml

# Verificar se o Traefik está observando o namespace correto
kubectl logs -n <NAMESPACE> -l app.kubernetes.io/name=traefik | grep -i namespace
```

### Duas instâncias processando a mesma rota

Verificar se há duplicidade de IngressClass:

```bash
kubectl get ingressclass
```

Cada instância deve ter um nome de IngressClass único. Verificar também se os `IngressRoutes` estão referenciando a IngressClass correta.

### Certificado TLS não encontrado

```bash
# Verificar se o Secret existe no namespace correto
kubectl get secret <NOME_SECRET_TLS> -n <NAMESPACE>

# Verificar conteúdo (deve ter tls.crt e tls.key)
kubectl describe secret <NOME_SECRET_TLS> -n <NAMESPACE>
```

> O Secret TLS deve estar **no mesmo namespace** do `IngressRoute` que o referencia.

---

## Referências

- [Traefik — Kubernetes CRD Provider](https://doc.traefik.io/traefik/providers/kubernetes-crd/)
- [Traefik — IngressClass](https://doc.traefik.io/traefik/providers/kubernetes-ingress/#ingressclass)
- [Traefik Helm Chart](https://github.com/traefik/traefik-helm-chart)
- [Tutorial base: Traefik Ingress Controller](./traefik-ingress-controller.md)

# Prometheus — Stack de Observabilidade Kubernetes

## Descrição Geral

O Prometheus é o sistema de coleta e armazenamento de métricas da stack de observabilidade. Ele realiza scrape automático de métricas do cluster Kubernetes (API server, nodes, pods, serviços), armazena os dados em disco com retenção configurável e serve como fonte de dados principal para o Grafana e base de alertas para o Alertmanager.

Nesta stack, o Prometheus é implantado como um `Deployment` com `strategy: Recreate`, armazenamento persistente via PVC, e exposto externamente via Istio Gateway com TLS.

---

## Tabela de Variáveis

| Variável                      | Descrição                                    | Exemplo                 |
| ----------------------------- | -------------------------------------------- | ----------------------- |
| `<NAMESPACE>`                 | Namespace de observabilidade                 | `observability`         |
| `<CLUSTER_NAME>`              | Label do cluster no Prometheus               | `production`            |
| `<ENVIRONMENT>`               | Label de ambiente                            | `production`            |
| `<STORAGE_CLASS>`             | StorageClass do namespace                    | `sc-observability`      |
| `<PROMETHEUS_STORAGE_SIZE>`   | Tamanho do PVC de dados                      | `150Gi`                 |
| `<PROMETHEUS_RETENTION_TIME>` | Retenção por tempo                           | `90d`                   |
| `<PROMETHEUS_RETENTION_SIZE>` | Retenção por tamanho                         | `140GB`                 |
| `<PROMETHEUS_MEMORY_REQUEST>` | Memory request                               | `2.5Gi`                 |
| `<PROMETHEUS_MEMORY_LIMIT>`   | Memory limit                                 | `5Gi`                   |
| `<PROMETHEUS_CPU_REQUEST>`    | CPU request                                  | `1200m`                 |
| `<PROMETHEUS_CPU_LIMIT>`      | CPU limit                                    | `2400m`                 |
| `<DOMAIN>`                    | Domínio base                                 | `example.com`           |
| `<TLS_SECRET_NAME>`           | Nome do secret TLS no namespace istio-system | `tls-example`           |
| `<ISTIO_GATEWAY_NAME>`        | Nome do Gateway Istio                        | `observability-gateway` |

---

## Pré-requisitos

- Namespace `<NAMESPACE>` criado no cluster
- StorageClass `<STORAGE_CLASS>` disponível no cluster (não será detalhada neste tutorial)
- Istio instalado e operacional no cluster
- Secret TLS `<TLS_SECRET_NAME>` criado no namespace `istio-system` com o certificado wildcard ou específico para `prometheus.<DOMAIN>` (não será detalhada neste tutorial)
- DNS apontando `prometheus.<DOMAIN>` para o IP do Istio IngressGateway
- Alertmanager implantado no mesmo namespace (ver tutorial: `alertmanager.md`)

---

## Prometheus Operator — Nota Importante

Esta stack utiliza o Prometheus instalado como **Deployment simples** (sem Operator). Porém, o recurso `ServiceMonitor` do istiod (usado para scrape das métricas do Istio) é um CRD do **Prometheus Operator** (`monitoring.coreos.com/v1`).

Para que o `ServiceMonitor` funcione, o Prometheus Operator deve estar instalado no cluster:

```bash
# Verificar se o Prometheus Operator está instalado
kubectl get crd servicemonitors.monitoring.coreos.com

# Instalar via Helm caso não esteja presente
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

# Instalar apenas os CRDs e o Operator (sem o stack completo)
helm install prometheus-operator prometheus-community/kube-prometheus-stack \
  --namespace <NAMESPACE> \
  --set prometheus.enabled=false \
  --set grafana.enabled=false \
  --set alertmanager.enabled=false \
  --set nodeExporter.enabled=false \
  --set kubeStateMetrics.enabled=false
```

### Abordagem com Prometheus Operator vs. Deployment simples

|                               | Deployment simples (esta stack)          | Com Prometheus Operator                        |
| ----------------------------- | ---------------------------------------- | ---------------------------------------------- |
| Configuração de scrape        | Manual via `prometheus.yml` no ConfigMap | Automática via `ServiceMonitor` e `PodMonitor` |
| `ServiceMonitor` istiod       | **Não funciona** sem o Operator          | Funciona nativamente                           |
| `istio-scrape-configs` Secret | Necessário para scrape manual do Envoy   | Substituído pelo `ServiceMonitor`              |
| Reload de config              | Via `POST /-/reload` ou restart          | Gerenciado automaticamente pelo Operator       |

### ServiceMonitor do istiod

Com o Prometheus Operator instalado, aplique o `ServiceMonitor` para coletar métricas do istiod:

```yaml
# istiod-servicemonitor.yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: istiod
  namespace: <NAMESPACE>
  labels:
    app: istiod
spec:
  selector:
    matchLabels:
      app: istiod
  namespaceSelector:
    matchNames:
      - istio-system
  endpoints:
    - port: http-monitoring
      interval: 15s
```

```bash
kubectl apply -f istiod-servicemonitor.yaml
```

> **Nota:** Sem o Prometheus Operator, o scrape das métricas do istiod deve ser feito via job manual no `prometheus.yml` apontando para `istiod.istio-system.svc.cluster.local:15014`.

---

## Etapas

### 1. Criar o ServiceAccount

```yaml
# serviceaccount.yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: prometheus
  namespace: <NAMESPACE>
  labels:
    app: prometheus
```

```bash
kubectl apply -f serviceaccount.yaml
```

---

### 2. Criar ClusterRole e ClusterRoleBinding

O Prometheus precisa de permissões de leitura em recursos do cluster para realizar service discovery.

```yaml
# rbac.yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: prometheus
  labels:
    app: prometheus
rules:
- apiGroups: [""]
  resources:
    - nodes
    - nodes/proxy
    - nodes/metrics
    - services
    - endpoints
    - pods
  verbs: ["get", "list", "watch"]
- apiGroups: [""]
  resources:
    - configmaps
  verbs: ["get"]
- apiGroups:
  - networking.k8s.io
  resources:
    - ingresses
  verbs: ["get", "list", "watch"]
- nonResourceURLs: ["/metrics", "/metrics/cadvisor"]
  verbs: ["get"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: prometheus
  labels:
    app: prometheus
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: prometheus
subjects:
- kind: ServiceAccount
  name: prometheus
  namespace: <NAMESPACE>
```

```bash
kubectl apply -f rbac.yaml
```

---

### 3. Criar o ConfigMap de configuração

O `prometheus.yml` define os jobs de scrape, intervalos globais e integração com o Alertmanager.

> **Nota:** O job `otel-spanmetrics` coleta métricas RED geradas pelo OTel Collector para o Jaeger SPM. Ver tutorial: `otel-collector.md`.

```yaml
# configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: prometheus-config
  namespace: <NAMESPACE>
  labels:
    app: prometheus
data:
  prometheus.yml: |
    global:
      scrape_interval: 15s
      evaluation_interval: 15s
      external_labels:
        cluster: '<CLUSTER_NAME>'
        environment: '<ENVIRONMENT>'

    alerting:
      alertmanagers:
      - static_configs:
        - targets:
          - alertmanager:9093

    scrape_configs:
    # Prometheus self-monitoring
    - job_name: 'prometheus'
      static_configs:
      - targets: ['localhost:9090']

    # Kubernetes API server
    - job_name: 'kubernetes-apiservers'
      kubernetes_sd_configs:
      - role: endpoints
      scheme: https
      tls_config:
        ca_file: /var/run/secrets/kubernetes.io/serviceaccount/ca.crt
      bearer_token_file: /var/run/secrets/kubernetes.io/serviceaccount/token
      relabel_configs:
      - source_labels: [__meta_kubernetes_namespace, __meta_kubernetes_service_name, __meta_kubernetes_endpoint_port_name]
        action: keep
        regex: default;kubernetes;https

    # Kubernetes nodes
    - job_name: 'kubernetes-nodes'
      kubernetes_sd_configs:
      - role: node
      scheme: https
      tls_config:
        ca_file: /var/run/secrets/kubernetes.io/serviceaccount/ca.crt
      bearer_token_file: /var/run/secrets/kubernetes.io/serviceaccount/token
      relabel_configs:
      - action: labelmap
        regex: __meta_kubernetes_node_label_(.+)

    # cAdvisor (métricas de containers via API do Kubernetes)
    - job_name: 'kubernetes-cadvisor'
      kubernetes_sd_configs:
      - role: node
      scheme: https
      tls_config:
        ca_file: /var/run/secrets/kubernetes.io/serviceaccount/ca.crt
      bearer_token_file: /var/run/secrets/kubernetes.io/serviceaccount/token
      relabel_configs:
      - action: labelmap
        regex: __meta_kubernetes_node_label_(.+)
      - target_label: __address__
        replacement: kubernetes.default.svc:443
      - source_labels: [__meta_kubernetes_node_name]
        regex: (.+)
        target_label: __metrics_path__
        replacement: /api/v1/nodes/${1}/proxy/metrics/cadvisor

    # Service endpoints com annotation prometheus.io/scrape: "true"
    - job_name: 'kubernetes-service-endpoints'
      kubernetes_sd_configs:
      - role: endpoints
      relabel_configs:
      - source_labels: [__meta_kubernetes_service_annotation_prometheus_io_scrape]
        action: keep
        regex: true
      - source_labels: [__meta_kubernetes_service_annotation_prometheus_io_scheme]
        action: replace
        target_label: __scheme__
        regex: (https?)
      - source_labels: [__meta_kubernetes_service_annotation_prometheus_io_path]
        action: replace
        target_label: __metrics_path__
        regex: (.+)
      - source_labels: [__address__, __meta_kubernetes_service_annotation_prometheus_io_port]
        action: replace
        target_label: __address__
        regex: ([^:]+)(?::\d+)?;(\d+)
        replacement: $1:$2
      - action: labelmap
        regex: __meta_kubernetes_service_label_(.+)
      - source_labels: [__meta_kubernetes_namespace]
        action: replace
        target_label: kubernetes_namespace
      - source_labels: [__meta_kubernetes_service_name]
        action: replace
        target_label: kubernetes_name

    # Pods com annotation prometheus.io/scrape: "true"
    - job_name: 'kubernetes-pods'
      kubernetes_sd_configs:
      - role: pod
      relabel_configs:
      - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_scrape]
        action: keep
        regex: true
      - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_path]
        action: replace
        target_label: __metrics_path__
        regex: (.+)
      - source_labels: [__address__, __meta_kubernetes_pod_annotation_prometheus_io_port]
        action: replace
        regex: ([^:]+)(?::\d+)?;(\d+)
        replacement: $1:$2
        target_label: __address__
      - action: labelmap
        regex: __meta_kubernetes_pod_label_(.+)
      - source_labels: [__meta_kubernetes_namespace]
        action: replace
        target_label: kubernetes_namespace
      - source_labels: [__meta_kubernetes_pod_name]
        action: replace
        target_label: kubernetes_pod_name

    # Node Exporter
    - job_name: 'node-exporter'
      kubernetes_sd_configs:
      - role: endpoints
      relabel_configs:
      - source_labels: [__meta_kubernetes_endpoints_name]
        regex: 'node-exporter'
        action: keep

    # Kube State Metrics
    - job_name: 'kube-state-metrics'
      static_configs:
      - targets: ['kube-state-metrics:8080']

    # Alertmanager
    - job_name: 'alertmanager'
      static_configs:
      - targets: ['alertmanager:9093']

    # Grafana
    - job_name: 'grafana'
      static_configs:
      - targets: ['grafana:3000']

    # OTel Collector SpanMetrics (métricas RED para Jaeger SPM)
    - job_name: 'otel-spanmetrics'
      scrape_interval: 15s
      static_configs:
      - targets: ['otel-collector:8889']
```

```bash
kubectl apply -f configmap.yaml
```

---

### 4. Criar o PersistentVolumeClaim

```yaml
# pvc.yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: prometheus-storage
  namespace: <NAMESPACE>
  labels:
    app: prometheus
spec:
  accessModes:
    - ReadWriteMany
  storageClassName: <STORAGE_CLASS>
  resources:
    requests:
      storage: <PROMETHEUS_STORAGE_SIZE>
```

```bash
kubectl apply -f pvc.yaml
```

---

### 5. Criar o Service

```yaml
# service.yaml
apiVersion: v1
kind: Service
metadata:
  name: prometheus
  namespace: <NAMESPACE>
  labels:
    app: prometheus
spec:
  type: ClusterIP
  ports:
    - name: web
      port: 9090
      targetPort: 9090
      protocol: TCP
  selector:
    app: prometheus
```

```bash
kubectl apply -f service.yaml
```

---

### 6. Criar o Deployment

> **Nota:** A imagem está fixada em `prom/prometheus:v2.55.1`. Verifique a versão mais recente em https://hub.docker.com/r/prom/prometheus/tags antes de implantar em produção.

```yaml
# deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: prometheus
  namespace: <NAMESPACE>
  labels:
    app: prometheus
spec:
  replicas: 1
  strategy:
    type: Recreate
  selector:
    matchLabels:
      app: prometheus
  template:
    metadata:
      labels:
        app: prometheus
    spec:
      serviceAccountName: prometheus
      securityContext:
        runAsNonRoot: true
        runAsUser: 65534
        fsGroup: 65534
      containers:
      - name: prometheus
        image: prom/prometheus:v2.55.1 # verifique a versão mais recente
        args:
          - '--config.file=/etc/prometheus/prometheus.yml'
          - '--storage.tsdb.path=/prometheus'
          - '--storage.tsdb.retention.time=<PROMETHEUS_RETENTION_TIME>'
          - '--storage.tsdb.retention.size=<PROMETHEUS_RETENTION_SIZE>'
          - '--web.console.libraries=/usr/share/prometheus/console_libraries'
          - '--web.console.templates=/usr/share/prometheus/consoles'
          - '--web.enable-lifecycle'
        ports:
          - name: web
            containerPort: 9090
            protocol: TCP
        resources:
          requests:
            memory: <PROMETHEUS_MEMORY_REQUEST>
            cpu: <PROMETHEUS_CPU_REQUEST>
          limits:
            memory: <PROMETHEUS_MEMORY_LIMIT>
            cpu: <PROMETHEUS_CPU_LIMIT>
        volumeMounts:
          - name: config
            mountPath: /etc/prometheus
          - name: storage
            mountPath: /prometheus
        livenessProbe:
          httpGet:
            path: /-/healthy
            port: 9090
          initialDelaySeconds: 30
          periodSeconds: 10
          timeoutSeconds: 5
        readinessProbe:
          httpGet:
            path: /-/ready
            port: 9090
          initialDelaySeconds: 5
          periodSeconds: 5
          timeoutSeconds: 5
      volumes:
        - name: config
          configMap:
            name: prometheus-config
        - name: storage
          persistentVolumeClaim:
            claimName: prometheus-storage
```

```bash
kubectl apply -f deployment.yaml
```

---

### 7. Criar o Istio Gateway e VirtualService

> **Pré-requisito:** O secret TLS `<TLS_SECRET_NAME>` deve existir no namespace `istio-system` antes de aplicar o Gateway.

```yaml
# istio.yaml
apiVersion: networking.istio.io/v1beta1
kind: Gateway
metadata:
  name: <ISTIO_GATEWAY_NAME>
  namespace: <NAMESPACE>
spec:
  selector:
    istio: ingressgateway
    app: observability-ingressgateway
  servers:
    - port:
        number: 443
        name: https-prometheus
        protocol: HTTPS
      tls:
        mode: SIMPLE
        credentialName: <TLS_SECRET_NAME>
      hosts:
        - prometheus.<DOMAIN>
---
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: prometheus
  namespace: <NAMESPACE>
spec:
  hosts:
    - prometheus.<DOMAIN>
  gateways:
    - <ISTIO_GATEWAY_NAME>
  http:
    - match:
      - uri:
          prefix: /
      route:
        - destination:
            host: prometheus
            port:
              number: 9090
```

```bash
kubectl apply -f istio.yaml
```

> **Nota:** O Gateway `<ISTIO_GATEWAY_NAME>` é compartilhado com os demais componentes da stack (Grafana, Alertmanager). Ao implantar os outros componentes, adicione as entradas de `servers` e `VirtualService` neste mesmo Gateway em vez de criar um novo.

---

## Tabela de Parâmetros Importantes

| Parâmetro                       | Localização                    | Descrição                                                                               |
| ------------------------------- | ------------------------------ | --------------------------------------------------------------------------------------- |
| `scrape_interval`               | `prometheus.yml` → `global`    | Intervalo padrão de coleta de métricas                                                  |
| `evaluation_interval`           | `prometheus.yml` → `global`    | Intervalo de avaliação de regras de alerta                                              |
| `external_labels`               | `prometheus.yml` → `global`    | Labels adicionados a todas as métricas (útil para federação e alertas)                  |
| `--storage.tsdb.retention.time` | Deployment → `args`            | Retenção por tempo. Após esse período, dados antigos são removidos                      |
| `--storage.tsdb.retention.size` | Deployment → `args`            | Retenção por tamanho. Deve ser ~95% do PVC para evitar disco cheio                      |
| `--web.enable-lifecycle`        | Deployment → `args`            | Habilita reload da config via `POST /-/reload` sem restart do pod                       |
| `runAsUser: 65534`              | Deployment → `securityContext` | Usuário `nobody`, padrão da imagem oficial do Prometheus                                |
| `strategy: Recreate`            | Deployment → `spec`            | Necessário pois o PVC usa `ReadWriteMany`; evita conflito de múltiplos writers no TSDB  |
| `prometheus.io/scrape: "true"`  | Annotation em Services/Pods    | Habilita scrape automático pelo job `kubernetes-service-endpoints` ou `kubernetes-pods` |
| `prometheus.io/port`            | Annotation em Services/Pods    | Define a porta de métricas quando diferente da porta padrão                             |
| `prometheus.io/path`            | Annotation em Services/Pods    | Define o path de métricas quando diferente de `/metrics`                                |

---

## Comandos Úteis

```bash
# Verificar status do pod
kubectl get pod -n <NAMESPACE> -l app=prometheus

# Ver logs do Prometheus
kubectl logs -n <NAMESPACE> -l app=prometheus --tail=100 -f

# Verificar configuração carregada (requer port-forward)
kubectl port-forward -n <NAMESPACE> svc/prometheus 9090:9090
# Acessar: http://localhost:9090/config

# Recarregar configuração sem restart (requer --web.enable-lifecycle)
kubectl port-forward -n <NAMESPACE> svc/prometheus 9090:9090
curl -X POST http://localhost:9090/-/reload

# Verificar targets de scrape
# Acessar: http://localhost:9090/targets

# Verificar status do PVC
kubectl get pvc -n <NAMESPACE> prometheus-storage

# Rollout restart (caso necessário)
kubectl rollout restart deployment/prometheus -n <NAMESPACE>

# Verificar uso real de disco no pod
kubectl exec -n <NAMESPACE> deploy/prometheus -- df -h /prometheus

# Verificar TSDB status
kubectl port-forward -n <NAMESPACE> svc/prometheus 9090:9090
# Acessar: http://localhost:9090/tsdb-status
```

---

## Troubleshooting

### Pod em CrashLoopBackOff

```bash
kubectl logs -n <NAMESPACE> -l app=prometheus --previous
```

Causas comuns:
- Permissão negada no volume → verificar `fsGroup: 65534` no `securityContext`
- ConfigMap com YAML inválido → validar indentação do `prometheus.yml`
- PVC não bound → verificar `kubectl get pvc -n <NAMESPACE>`

---

### Targets em estado `DOWN`

Acessar `http://localhost:9090/targets` via port-forward e verificar a mensagem de erro no target.

Causas comuns:
- `ClusterRole` sem permissão no recurso → verificar RBAC com `kubectl auth can-i list pods --as=system:serviceaccount:<NAMESPACE>:prometheus`
- Serviço sem annotation `prometheus.io/scrape: "true"` → adicionar a annotation no Service
- Pod em namespace diferente do esperado → verificar o campo `kubernetes_namespace` no relabel

---

### Disco cheio / retenção não funcionando

```bash
# Verificar uso atual
kubectl exec -n <NAMESPACE> deploy/prometheus -- df -h /prometheus

# Verificar parâmetros de retenção aplicados
kubectl get deployment prometheus -n <NAMESPACE> -o jsonpath='{.spec.template.spec.containers[0].args}'
```

> **Atenção:** `--storage.tsdb.retention.size` deve ser definido como ~95% da capacidade do PVC. Para um PVC de `150Gi`, use `140GB`.

---

### ConfigMap atualizado mas Prometheus não recarregou

```bash
# Opção 1: Reload via API (sem downtime)
kubectl port-forward -n <NAMESPACE> svc/prometheus 9090:9090
curl -X POST http://localhost:9090/-/reload

# Opção 2: Rollout restart
kubectl rollout restart deployment/prometheus -n <NAMESPACE>
```

---

### Erro de permissão no scrape do API server

Verificar se o `ClusterRoleBinding` foi aplicado corretamente:

```bash
kubectl get clusterrolebinding prometheus
kubectl describe clusterrolebinding prometheus
```

---

## Referências

- [Prometheus Documentation](https://prometheus.io/docs/)
- [Prometheus Configuration Reference](https://prometheus.io/docs/prometheus/latest/configuration/configuration/)
- [Prometheus Storage](https://prometheus.io/docs/prometheus/latest/storage/)
- [Kubernetes Service Discovery](https://prometheus.io/docs/prometheus/latest/configuration/configuration/#kubernetes_sd_config)
- [prom/prometheus Docker Hub](https://hub.docker.com/r/prom/prometheus/tags)

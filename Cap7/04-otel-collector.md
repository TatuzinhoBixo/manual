# OTel Collector — Stack de Observabilidade Kubernetes

## Descrição Geral

O OpenTelemetry Collector (OTel Collector) é o componente central de coleta e roteamento de telemetria da stack. Ele recebe traces das aplicações via protocolo OTLP (gRPC e HTTP), gera métricas RED (Rate, Errors, Duration) via conector `spanmetrics`, e encaminha os traces para o Jaeger.

As métricas RED geradas pelo `spanmetrics` são expostas em formato Prometheus na porta `8889` e coletadas pelo Prometheus via job `otel-spanmetrics` (ver tutorial: `01-kube-prometheus-stack.md`). Essas métricas alimentam o painel **Service Performance Monitoring (SPM)** do Jaeger.

O OTel Collector roda **sem sidecar Istio** (`sidecar.istio.io/inject: "false"`) para evitar que os próprios traces de telemetria do Collector entrem no pipeline.

### Fluxo de dados

```
Aplicações (OTel SDK)
      │  OTLP gRPC :4317 / HTTP :4318
      ▼
  OTel Collector
      ├── pipeline traces
      │     ├── connector: spanmetrics (gera métricas RED)
      │     └── exporter: otlp/jaeger → jaeger:4317
      └── pipeline metrics/spanmetrics
            └── exporter: prometheus → :8889
                    │
                    ▼
              Prometheus (job: otel-spanmetrics)
                    │
                    ▼
              Jaeger SPM (Monitor tab)
```

---

## Tabela de Variáveis

| Variável            | Descrição                           | Exemplo                                     |
| ------------------- | ----------------------------------- | ------------------------------------------- |
| `<NAMESPACE>`       | Namespace de observabilidade        | `observability`                             |
| `<JAEGER_ENDPOINT>` | FQDN do Jaeger para exportação OTLP | `jaeger.<NAMESPACE>.svc.cluster.local:4317` |

---

## Pré-requisitos

- Namespace `<NAMESPACE>` criado no cluster
- Istio instalado e operacional no cluster
- Jaeger implantado no mesmo namespace (ver tutorial: `03-jaeger.md`)
- Prometheus implantado com job `otel-spanmetrics` configurado (ver tutorial: `01-kube-prometheus-stack.md`)

---

## Etapas

### 1. Criar o ConfigMap de configuração

```yaml
# otel-collector-configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: otel-collector-config
  namespace: <NAMESPACE>
  labels:
    app: otel-collector
data:
  config.yaml: |
    receivers:
      otlp:
        protocols:
          grpc:
            endpoint: 0.0.0.0:4317
          http:
            endpoint: 0.0.0.0:4318

    connectors:
      spanmetrics:
        histogram:
          explicit:
            buckets: [2ms, 4ms, 6ms, 8ms, 10ms, 50ms, 100ms, 200ms, 400ms, 800ms, 1s, 1400ms, 2s, 5s, 10s, 15s]
        dimensions:
          - name: http.method
          - name: http.status_code
          - name: http.route
        dimensions_cache_size: 1000
        aggregation_temporality: AGGREGATION_TEMPORALITY_CUMULATIVE
        metrics_flush_interval: 15s
        metrics_expiration: 5m

    exporters:
      otlp/jaeger:
        endpoint: jaeger.<NAMESPACE>.svc.cluster.local:4317
        tls:
          insecure: true
      prometheus:
        endpoint: 0.0.0.0:8889
        metric_expiration: 5m

    extensions:
      health_check:
        endpoint: 0.0.0.0:13133

    service:
      extensions: [health_check]
      pipelines:
        traces:
          receivers: [otlp]
          exporters: [spanmetrics, otlp/jaeger]
        metrics/spanmetrics:
          receivers: [spanmetrics]
          exporters: [prometheus]
```

```bash
kubectl apply -f otel-collector-configmap.yaml
```

---

### 2. Criar o Service

```yaml
# otel-collector-service.yaml
apiVersion: v1
kind: Service
metadata:
  name: otel-collector
  namespace: <NAMESPACE>
  labels:
    app: otel-collector
spec:
  type: ClusterIP
  selector:
    app: otel-collector
  ports:
    - name: grpc-otlp
      port: 4317
      targetPort: 4317
      protocol: TCP
    - name: http-otlp
      port: 4318
      targetPort: 4318
      protocol: TCP
    - name: http-prometheus
      port: 8889
      targetPort: 8889
      protocol: TCP
```

```bash
kubectl apply -f otel-collector-service.yaml
```

---

### 3. Criar o DestinationRule (Istio)

O OTel Collector roda sem sidecar Istio. O DestinationRule desabilita mTLS para comunicação interna.

```yaml
# otel-collector-destinationrule.yaml
apiVersion: networking.istio.io/v1
kind: DestinationRule
metadata:
  name: otel-collector
  namespace: <NAMESPACE>
spec:
  host: otel-collector.<NAMESPACE>.svc.cluster.local
  trafficPolicy:
    tls:
      mode: DISABLE
```

```bash
kubectl apply -f otel-collector-destinationrule.yaml
```

---

### 4. Criar o Deployment

> **Nota:** Imagem fixada em `otel/opentelemetry-collector-contrib:0.146.0`. Verifique a versão mais recente em https://hub.docker.com/r/otel/opentelemetry-collector-contrib/tags antes de implantar em produção.

```yaml
# otel-collector-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: otel-collector
  namespace: <NAMESPACE>
  labels:
    app: otel-collector
spec:
  replicas: 1
  selector:
    matchLabels:
      app: otel-collector
  template:
    metadata:
      labels:
        app: otel-collector
        sidecar.istio.io/inject: "false"
    spec:
      containers:
        - name: otel-collector
          image: otel/opentelemetry-collector-contrib:0.150.1 # verifique a versão mais recente
          args:
            - --config=/etc/otelcol/config.yaml
          ports:
            - containerPort: 4317
              name: otlp-grpc
              protocol: TCP
            - containerPort: 4318
              name: otlp-http
              protocol: TCP
            - containerPort: 8889
              name: prometheus
              protocol: TCP
            - containerPort: 13133
              name: health
              protocol: TCP
          resources:
            requests:
              cpu: 100m
              memory: 256Mi
            limits:
              cpu: 500m
              memory: 512Mi
          readinessProbe:
            httpGet:
              path: /
              port: 13133
            initialDelaySeconds: 5
            periodSeconds: 10
          livenessProbe:
            httpGet:
              path: /
              port: 13133
            initialDelaySeconds: 10
            periodSeconds: 30
          volumeMounts:
            - name: config
              mountPath: /etc/otelcol
              readOnly: true
      volumes:
        - name: config
          configMap:
            name: otel-collector-config
```

```bash
kubectl apply -f otel-collector-deployment.yaml
```

---

### 5. Configurar instrumentação nas aplicações

Para que as aplicações enviem traces ao OTel Collector, configure o endpoint OTLP no SDK:

```bash
# Endpoint gRPC (recomendado)
OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector.<NAMESPACE>.svc.cluster.local:4317

# Endpoint HTTP
OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector.<NAMESPACE>.svc.cluster.local:4318
```

> **Nota:** Se a aplicação roda com sidecar Istio e o OTel Collector não tem sidecar, o DestinationRule com `tls: DISABLE` é obrigatório para que a comunicação funcione.

---

## Tabela de Parâmetros Importantes

| Parâmetro                            | Localização                         | Descrição                                                                             |
| ------------------------------------ | ----------------------------------- | ------------------------------------------------------------------------------------- |
| `spanmetrics.histogram.buckets`      | ConfigMap → `connectors`            | Buckets de latência para histograma. Ajustar conforme SLOs da aplicação               |
| `spanmetrics.dimensions`             | ConfigMap → `connectors`            | Atributos de span adicionados como labels nas métricas geradas                        |
| `spanmetrics.metrics_flush_interval` | ConfigMap → `connectors`            | Intervalo de flush das métricas. Deve corresponder ao `scrape_interval` do Prometheus |
| `spanmetrics.metrics_expiration`     | ConfigMap → `connectors`            | Tempo para expirar métricas de spans não vistos                                       |
| `aggregation_temporality`            | ConfigMap → `connectors`            | `CUMULATIVE` é obrigatório para Prometheus (counters monotônicos)                     |
| `prometheus.metric_expiration`       | ConfigMap → `exporters`             | Tempo para remover métricas não atualizadas do endpoint Prometheus                    |
| `tls.insecure: true`                 | ConfigMap → `exporters.otlp/jaeger` | Desabilita TLS para comunicação interna com Jaeger                                    |
| `sidecar.istio.io/inject: "false"`   | Deployment → labels                 | Evita que o próprio Collector gere traces de si mesmo no pipeline                     |
| `DestinationRule tls: DISABLE`       | Istio                               | Permite que pods com sidecar Istio se comuniquem com o Collector sem mTLS             |

---

## Comandos Úteis

```bash
# Status do pod
kubectl get pod -n <NAMESPACE> -l app=otel-collector

# Logs
kubectl logs -n <NAMESPACE> -l app=otel-collector --tail=100 -f

# Health check
kubectl port-forward -n <NAMESPACE> svc/otel-collector 13133:13133
curl http://localhost:13133

# Verificar métricas RED expostas (spanmetrics)
kubectl port-forward -n <NAMESPACE> svc/otel-collector 8889:8889
curl http://localhost:8889/metrics | grep traces_span_metrics | head -20

# Verificar se o Prometheus coleta as métricas
kubectl port-forward -n <NAMESPACE> svc/prometheus 9090:9090
# Acessar: http://localhost:9090/targets → job "otel-spanmetrics"

# Enviar trace de teste via OTLP HTTP (requer otel-cli instalado)
# https://github.com/equinix-labs/otel-cli
otel-cli exec \
  --endpoint http://localhost:4318 \
  --service meu-servico \
  --name "operacao-teste" \
  -- echo "trace enviado"

# Rollout restart após mudança de ConfigMap
kubectl rollout restart deployment/otel-collector -n <NAMESPACE>
```

---

## Troubleshooting

### OTel Collector não recebe traces das aplicações

Verificar se o DestinationRule está aplicado:

```bash
kubectl get destinationrule otel-collector -n <NAMESPACE>
```

Verificar se a aplicação está enviando para o endpoint correto:

```bash
kubectl logs -n <NAMESPACE> -l app=otel-collector | grep -i "receiver\|otlp\|error"
```

---

### Métricas SPM não aparecem no Prometheus

Verificar se o endpoint Prometheus do Collector responde:

```bash
kubectl port-forward -n <NAMESPACE> svc/otel-collector 8889:8889
curl http://localhost:8889/metrics | grep traces_span_metrics
```

Se não houver métricas, verificar se o pipeline `metrics/spanmetrics` está ativo:

```bash
kubectl logs -n <NAMESPACE> -l app=otel-collector | grep -i "spanmetrics\|pipeline"
```

---

### Jaeger não recebe traces do Collector

Verificar logs do exporter `otlp/jaeger`:

```bash
kubectl logs -n <NAMESPACE> -l app=otel-collector | grep -i "jaeger\|otlp/jaeger\|export"
```

Verificar conectividade com o Jaeger:

```bash
kubectl exec -n <NAMESPACE> deploy/otel-collector -- \
  wget -qO- http://jaeger.<NAMESPACE>.svc.cluster.local:13133/status
```

---

### Métricas com namespace incorreto no Jaeger SPM

O `metric_namespace` no ConfigMap do Jaeger e o prefixo das métricas geradas pelo Collector devem ser compatíveis. As métricas geradas pelo `spanmetrics` têm o prefixo `traces_span_metrics` por padrão. Verificar no Prometheus:

```bash
kubectl port-forward -n <NAMESPACE> svc/prometheus 9090:9090
# Query: {__name__=~"traces_span_metrics.*"}
```

---

## Referências

- [OpenTelemetry Collector Documentation](https://opentelemetry.io/docs/collector/)
- [OTel Collector Contrib — spanmetrics connector](https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/connector/spanmetricsconnector)
- [OTel Collector Contrib — Prometheus exporter](https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/exporter/prometheusexporter)
- [Jaeger SPM with OTel Collector](https://www.jaegertracing.io/docs/latest/spm/)
- [otel/opentelemetry-collector-contrib Docker Hub](https://hub.docker.com/r/otel/opentelemetry-collector-contrib/tags)

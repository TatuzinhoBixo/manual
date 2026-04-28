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

### 5. Criar o ServiceMonitor para coletar as métricas SPM

O OTel Collector usa o **spanmetrics connector** para gerar métricas RED (`traces_span_metrics_*`) a partir dos spans recebidos, e expõe essas métricas via porta `8889` (`http-prometheus`). Sem um `ServiceMonitor`, o Prometheus **não scrapeia** essa porta e:

- A aba **Monitor (SPM)** do Jaeger fica vazia (Jaeger lê `traces_span_metrics.*` do Prometheus)
- Métricas existem no Collector mas não chegam ao Prometheus

```yaml
# otel-collector-servicemonitor.yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: otel-collector
  namespace: <NAMESPACE>
  labels:
    app: otel-collector
spec:
  selector:
    matchLabels:
      app: otel-collector          # deve casar com os labels do Service criado no passo 2
  namespaceSelector:
    matchNames:
      - <NAMESPACE>
  endpoints:
    - port: http-prometheus        # nome da porta 8889 no Service (não usar número)
      path: /metrics
      interval: 15s                # alinhe com spanmetrics.metrics_flush_interval do ConfigMap
```

```bash
kubectl apply -f otel-collector-servicemonitor.yaml
```

> **Atenção ao label do Prometheus Operator:** se o seu Prometheus tem `serviceMonitorSelector` filtrado (ex: `release: kube-prometheus-stack`), adicione esse label em `metadata.labels` do ServiceMonitor. Para confirmar:
>
> ```bash
> kubectl -n <NAMESPACE> get prometheus -o jsonpath='{.items[0].spec.serviceMonitorSelector}'; echo
> ```
>
> Se retornar `{}`, qualquer label serve.

#### Validação

```bash
# 1. Target do Prometheus deve aparecer como "up"
kubectl run -n <NAMESPACE> --rm -i --restart=Never q --image=curlimages/curl --command -- \
  curl -s 'http://<PROMETHEUS_SVC>.<NAMESPACE>.svc.cluster.local:9090/api/v1/targets?scrapePool=serviceMonitor%2F<NAMESPACE>%2Fotel-collector%2F0' \
  | grep -oE '"health":"[^"]*"' | head -1

# 2. Métricas devem aparecer no Prometheus (esperado: count > 0)
kubectl run -n <NAMESPACE> --rm -i --restart=Never q --image=curlimages/curl --command -- \
  curl -s --data-urlencode 'query=count({__name__=~"traces_span_metrics.*"})' \
  'http://<PROMETHEUS_SVC>.<NAMESPACE>.svc.cluster.local:9090/api/v1/query'
```

Quando o `count` retornar > 0, abra o Jaeger UI → aba **Monitor** → escolha um serviço → janela "Last 1 hour" → os gráficos de Latency / Error rate / Request rate devem popular.

---

### 6. Configurar instrumentação nas aplicações

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

Sintoma: aba **Monitor** do Jaeger vazia, ou query `count({__name__=~"traces_span_metrics.*"})` no Prometheus retorna `[]`.

**Diagnóstico em 3 etapas** (o problema pode estar em qualquer uma):

#### 1. Métricas existem no Collector?

```bash
kubectl run -n <NAMESPACE> --rm -i --restart=Never q --image=curlimages/curl --command -- \
  curl -s http://otel-collector.<NAMESPACE>.svc.cluster.local:8889/metrics | grep -c '^traces_span_metrics'
```

Se retornar `0`:
- Nenhum trace está chegando ao Collector → revisar pipeline de tracing (Telemetry no Istio, ver `Cap7/06-istio-meshconfig.md` e `Cap7/03-jaeger.md`)
- Pipeline `metrics/spanmetrics` não está ativo no ConfigMap → conferir com:
  ```bash
  kubectl logs -n <NAMESPACE> -l app=otel-collector | grep -i "spanmetrics\|pipeline"
  ```

Se retornar > 0, ir para o passo 2.

#### 2. Prometheus tem `ServiceMonitor` para o Collector?

```bash
kubectl get servicemonitor -A | grep otel
```

Se não retornar nada, **falta o ServiceMonitor** — criar conforme passo 5 deste documento.

#### 3. Target está `up` no Prometheus?

```bash
kubectl run -n <NAMESPACE> --rm -i --restart=Never q --image=curlimages/curl --command -- \
  curl -s 'http://<PROMETHEUS_SVC>.<NAMESPACE>.svc.cluster.local:9090/api/v1/targets?scrapePool=serviceMonitor%2F<NAMESPACE>%2Fotel-collector%2F0' \
  | grep -oE '"health":"[^"]*"|"lastError":"[^"]{0,100}'
```

Se aparecer `health:"down"` com erro de conexão/404 → conferir nome da porta no ServiceMonitor (deve ser `http-prometheus`, não número 8889).
Se aparecer `health:"up"` mas mesmo assim não há métricas no Prometheus → aguardar 30s (próximo ciclo de scrape) e re-executar a query.

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

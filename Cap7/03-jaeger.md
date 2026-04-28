# Jaeger — Stack de Observabilidade Kubernetes

## 🧭 Onde este tutorial entra na stack

O Jaeger sozinho **não funciona** — ele é só o backend que armazena/visualiza traces. Pra a UI mostrar serviços além do próprio `jaeger`, é preciso completar o pipeline em **outros 2 tutoriais** depois deste:

```
[03-jaeger.md]  ← VOCÊ ESTÁ AQUI (backend de traces + UI)
       │
       │  precisa ser alimentado por
       ▼
[04-otel-collector.md]  ← recebe spans das apps e encaminha pro Jaeger
       │
       │  precisa ser alimentado por
       ▼
[06-istio-meshconfig.md]  ← faz os sidecars Istio gerarem e enviarem spans
                              + ajusta PILOT_TRACE_SAMPLING (ver Cap1/Kubernets/8-istio.md)
```

**Ordem recomendada de execução:** `03` (este) → `04` → `05` → `06`. Só depois do `06` aplicado é que a UI do Jaeger lista serviços de aplicações reais.

> **Se ao final você só ver o serviço `jaeger` no dropdown da UI**, vá direto para a seção **"Jaeger só mostra o serviço `jaeger` no dropdown"** no Troubleshooting deste arquivo — é o sintoma mais comum quando o pipeline a montante não está configurado.

---

## Descrição Geral

O Jaeger é o sistema de rastreamento distribuído (distributed tracing) da stack de observabilidade. Esta implantação usa o **Jaeger v2**, baseado no OpenTelemetry Collector, com backend de armazenamento no **Elasticsearch**.

Os traces chegam ao Jaeger via **OTel Collector** (ver tutorial: `04-otel-collector.md`), que recebe spans das aplicações e os encaminha para o Jaeger via OTLP gRPC. O Jaeger também aceita traces diretamente via OTLP e Zipkin.

O acesso externo à UI é protegido pelo **EnvoyFilter de Basic Auth** (ver tutorial: `05-kiali.md`, Parte 2).

### Fluxo de traces

```
Aplicações (instrumentadas com OTel SDK)
      │  OTLP gRPC/HTTP
      ▼
  OTel Collector (ver tutorial: 04-otel-collector.md)
      │  OTLP gRPC → jaeger:4317
      ▼
  Jaeger v2 (Deployment)
      │  escreve spans
      ▼
  Elasticsearch (StatefulSet, 3 nós)
      │
  Jaeger UI ← lê spans para visualização
      ▲
  Kiali (integração de traces)
```

---

## Tabela de Variáveis

| Variável              | Descrição                                      | Exemplo                                                |
| --------------------- | ---------------------------------------------- | ------------------------------------------------------ |
| `<NAMESPACE>`         | Namespace de observabilidade                   | `observability`                                        |
| `<STORAGE_CLASS>`     | StorageClass do namespace                      | `sc-observability`                                     |
| `<ES_STORAGE_SIZE>`   | Tamanho do PVC por nó Elasticsearch            | `100Gi`                                                |
| `<ES_HEAP_SIZE>`      | Heap da JVM do Elasticsearch                   | `2g`                                                   |
| `<ES_MEMORY_REQUEST>` | Memory request por pod                         | `3Gi`                                                  |
| `<ES_MEMORY_LIMIT>`   | Memory limit por pod                           | `4Gi`                                                  |
| `<DOMAIN>`            | Domínio base                                   | `example.com`                                          |
| `<TLS_SECRET_NAME>`   | Nome do secret TLS no namespace `istio-system` | `tls-example`                                          |
| `<PROMETHEUS_URL>`    | URL interna do Prometheus                      | `http://prometheus.<NAMESPACE>.svc.cluster.local:9090` |

---

## Pré-requisitos

- Namespace `<NAMESPACE>` criado no cluster
- StorageClass `<STORAGE_CLASS>` disponível no cluster
- Istio instalado e operacional no cluster
- Secret TLS `<TLS_SECRET_NAME>` criado no namespace `istio-system`
- DNS apontando `jaeger.<DOMAIN>` para o IP do Istio IngressGateway
- Prometheus implantado no mesmo namespace (ver tutorial: `01-kube-prometheus-stack.md`)
- OTel Collector implantado no mesmo namespace (ver tutorial: `04-otel-collector.md`)
- EnvoyFilter Basic Auth aplicado no IngressGateway (ver tutorial: `05-kiali.md`, Parte 2)
- Nodes do cluster com `vm.max_map_count=262144` — o initContainer do Elasticsearch ajusta isso via `sysctl`, mas requer `privileged: true`

---

## Etapas

### Parte 1 — Elasticsearch

O Elasticsearch deve ser implantado **antes** do Jaeger. O Jaeger não inicializa sem conectividade com o backend de storage.

#### 1.1 Criar o ServiceAccount

```yaml
# elasticsearch-serviceaccount.yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: elasticsearch
  namespace: <NAMESPACE>
  labels:
    app: elasticsearch
```

```bash
kubectl apply -f elasticsearch-serviceaccount.yaml
```

---

#### 1.2 Criar o ConfigMap

```yaml
# elasticsearch-configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: elasticsearch-config
  namespace: <NAMESPACE>
  labels:
    app: elasticsearch
data:
  elasticsearch.yml: |
    cluster.name: elasticsearch-jaeger
    network.host: 0.0.0.0
    discovery.seed_hosts:
      - elasticsearch-0.elasticsearch.<NAMESPACE>.svc.cluster.local
      - elasticsearch-1.elasticsearch.<NAMESPACE>.svc.cluster.local
      - elasticsearch-2.elasticsearch.<NAMESPACE>.svc.cluster.local
    cluster.initial_master_nodes:
      - elasticsearch-0
      - elasticsearch-1
      - elasticsearch-2
    bootstrap.memory_lock: false
    # Segurança desabilitada — acesso restrito ao cluster interno
    xpack.security.enabled: false
    xpack.security.enrollment.enabled: false
    xpack.security.http.ssl.enabled: false
    xpack.security.transport.ssl.enabled: false
    xpack.monitoring.collection.enabled: true
```

```bash
kubectl apply -f elasticsearch-configmap.yaml
```

---

#### 1.3 Criar os Services

```yaml
# elasticsearch-services.yaml
# Service headless para discovery interno entre nós
apiVersion: v1
kind: Service
metadata:
  name: elasticsearch
  namespace: <NAMESPACE>
  labels:
    app: elasticsearch
spec:
  type: ClusterIP
  clusterIP: None
  publishNotReadyAddresses: true
  selector:
    app: elasticsearch
  ports:
    - name: http
      port: 9200
      targetPort: 9200
      protocol: TCP
    - name: transport
      port: 9300
      targetPort: 9300
      protocol: TCP
---
# Service ClusterIP para acesso pelo Jaeger
apiVersion: v1
kind: Service
metadata:
  name: elasticsearch-http
  namespace: <NAMESPACE>
  labels:
    app: elasticsearch
spec:
  type: ClusterIP
  selector:
    app: elasticsearch
  ports:
    - name: http
      port: 9200
      targetPort: 9200
      protocol: TCP
```

```bash
kubectl apply -f elasticsearch-services.yaml
```

---

#### 1.4 Criar o StatefulSet

> **Nota:** Imagem fixada em `docker.elastic.co/elasticsearch/elasticsearch:8.15.0`. Verifique a versão mais recente em https://www.elastic.co/downloads/elasticsearch antes de implantar em produção.
>
> **Atenção:** Os initContainers requerem `privileged: true` para ajustar parâmetros do kernel (`vm.max_map_count` e `ulimit`). Isso é padrão e necessário para o Elasticsearch funcionar corretamente.

```yaml
# elasticsearch-statefulset.yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: elasticsearch
  namespace: <NAMESPACE>
  labels:
    app: elasticsearch
spec:
  serviceName: elasticsearch
  replicas: 3
  selector:
    matchLabels:
      app: elasticsearch
  template:
    metadata:
      labels:
        app: elasticsearch
    spec:
      serviceAccountName: elasticsearch
      initContainers:
        - name: increase-vm-max-map
          image: busybox:1.36
          command: ["sysctl", "-w", "vm.max_map_count=262144"]
          securityContext:
            privileged: true
        - name: increase-fd-ulimit
          image: busybox:1.36
          command: ["sh", "-c", "ulimit -n 65536"]
          securityContext:
            privileged: true
      containers:
        - name: elasticsearch
          image: docker.elastic.co/elasticsearch/elasticsearch:<VERSAO> # verifique a versão mais recente
          ports:
            - name: http
              containerPort: 9200
              protocol: TCP
            - name: transport
              containerPort: 9300
              protocol: TCP
          env:
            - name: node.name
              valueFrom:
                fieldRef:
                  fieldPath: metadata.name
            - name: ES_JAVA_OPTS
              value: "-Xms1g -Xmx1g"
          resources:
            requests:
              memory: 2Gi
              cpu: 1000m
            limits:
              memory: 2Gi
              cpu: 2000m
          volumeMounts:
            - name: data
              mountPath: /usr/share/elasticsearch/data
            - name: config
              mountPath: /usr/share/elasticsearch/config/elasticsearch.yml
              subPath: elasticsearch.yml
          readinessProbe:
            httpGet:
              path: /_cluster/health?local=true
              port: 9200
            initialDelaySeconds: 30
            periodSeconds: 10
            timeoutSeconds: 5
          livenessProbe:
            httpGet:
              path: /_cluster/health?local=true
              port: 9200
            initialDelaySeconds: 90
            periodSeconds: 30
            timeoutSeconds: 10
      volumes:
        - name: config
          configMap:
            name: elasticsearch-config
  volumeClaimTemplates:
    - metadata:
        name: data
        labels:
          app: elasticsearch
      spec:
        accessModes:
          - ReadWriteOnce
        storageClassName: <STORAGE_CLASS>
        resources:
          requests:
            storage: <ES_STORAGE_SIZE>
```

```bash
kubectl apply -f elasticsearch-statefulset.yaml

# Aguardar o cluster formar quorum (pode levar 2-3 minutos)
kubectl rollout status statefulset/elasticsearch -n <NAMESPACE>

# Verificar saúde do cluster
kubectl port-forward -n <NAMESPACE> svc/elasticsearch-http 9200:9200
curl http://localhost:9200/_cluster/health?pretty
```

O status esperado é `green` ou `yellow` (yellow é normal com 1 réplica de shard).

---

### Parte 2 — Jaeger

#### 2.1 Criar o ConfigMap

```yaml
# jaeger-configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: jaeger-config
  namespace: <NAMESPACE>
  labels:
    app: jaeger
data:
  config.yaml: |
    # Jaeger v2 — baseado no OpenTelemetry Collector
    extensions:
      healthcheckv2:
        use_v2: true
        http:
          endpoint: 0.0.0.0:13133
      jaeger_storage:
        backends:
          es_main:
            elasticsearch:
              server_urls:
                - http://elasticsearch.<NAMESPACE>.svc.cluster.local:9200
              indices:
                spans:
                  date_layout: "2006-01-02"
                  shards: 1
                  replicas: 0
                services:
                  date_layout: "2006-01-02"
                  shards: 1
                  replicas: 0
                dependencies:
                  date_layout: "2006-01-02"
                  shards: 1
                  replicas: 0
                sampling:
                  date_layout: "2006-01-02"
                  shards: 1
                  replicas: 0
        metric_backends:
          prom:
            prometheus:
              endpoint: <PROMETHEUS_URL> ou http://prometheus-operated.<NAMESPACE>.svc.cluster.local:9090
              # normalize_calls: true → adiciona _total ao nome dos counters
              # normalize_duration: true → adiciona _milliseconds ao nome de latência
              # Necessário pois o OTel Collector exporta com esses sufixos normalizados
              metric_namespace: traces_span_metrics
              latency_unit: ms
              normalize_calls: true
              normalize_duration: true
      jaeger_query:
        storage:
          traces: es_main
          metrics: prom
        ui:
          config_file: /etc/jaeger/ui-config.json
    receivers:
      otlp:
        protocols:
          grpc:
            endpoint: 0.0.0.0:4317
          http:
            endpoint: 0.0.0.0:4318
      zipkin:
        endpoint: 0.0.0.0:9411
    processors:
      batch:
    exporters:
      jaeger_storage_exporter:
        trace_storage: es_main
    service:
      extensions: [healthcheckv2, jaeger_storage, jaeger_query]
      pipelines:
        traces:
          receivers: [otlp, zipkin]
          processors: [batch]
          exporters: [jaeger_storage_exporter]
      telemetry:
        metrics:
          level: detailed
          readers:
            - pull:
                exporter:
                  prometheus:
                    host: 0.0.0.0
                    port: 8888
        logs:
          level: info
  ui-config.json: |
    {
      "monitor": {
        "menuEnabled": true
      },
      "dependencies": {
        "menuEnabled": true
      }
    }
```

```bash
kubectl apply -f jaeger-configmap.yaml
```

---

#### 2.2 Criar o Service

```yaml
# jaeger-service.yaml
apiVersion: v1
kind: Service
metadata:
  name: jaeger
  namespace: <NAMESPACE>
  labels:
    app: jaeger
spec:
  type: ClusterIP
  selector:
    app: jaeger
  ports:
    - name: query
      port: 16686
      targetPort: 16686
      protocol: TCP
    - name: grpc-otlp
      port: 4317
      targetPort: 4317
      protocol: TCP
    - name: http-otlp
      port: 4318
      targetPort: 4318
      protocol: TCP
    - name: http-zipkin
      port: 9411
      targetPort: 9411
      protocol: TCP
```

```bash
kubectl apply -f jaeger-service.yaml
```

---

#### 2.3 Criar o Deployment

> **Nota:** Imagem fixada em `jaegertracing/jaeger:2.14.1`. Verifique a versão mais recente em https://hub.docker.com/r/jaegertracing/jaeger/tags antes de implantar em produção.
>
> **Importante:** Após alterações no ConfigMap `jaeger-config`, é necessário reiniciar o pod (`kubectl rollout restart deploy/jaeger`), pois o Jaeger v2 lê a configuração apenas na inicialização.

```yaml
# jaeger-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: jaeger
  namespace: <NAMESPACE>
  labels:
    app: jaeger
    app.kubernetes.io/name: jaeger
    app.kubernetes.io/component: all-in-one
spec:
  replicas: 1
  selector:
    matchLabels:
      app: jaeger
  template:
    metadata:
      labels:
        app: jaeger
        sidecar.istio.io/inject: "true"
      annotations:
        # Exclui portas de receiver do sidecar para evitar loop de traces
        traffic.sidecar.istio.io/excludeInboundPorts: "9411,4317,4318"
    spec:
      containers:
        - name: jaeger
          image: jaegertracing/jaeger:2.14.1 # verifique a versão mais recente
          args:
            - --config
            - /etc/jaeger/config.yaml
          ports:
            - containerPort: 16686
              name: query
            - containerPort: 4317
              name: otlp-grpc
            - containerPort: 4318
              name: otlp-http
            - containerPort: 9411
              name: zipkin
            - containerPort: 13133
              name: health
            - containerPort: 8888
              name: metrics
          resources:
            requests:
              cpu: 100m
              memory: 256Mi
            limits:
              cpu: 500m
              memory: 512Mi
          readinessProbe:
            httpGet:
              path: /status
              port: 13133
            initialDelaySeconds: 10
            periodSeconds: 10
          livenessProbe:
            httpGet:
              path: /status
              port: 13133
            initialDelaySeconds: 15
            periodSeconds: 30
          volumeMounts:
            - name: config
              mountPath: /etc/jaeger
              readOnly: true
      volumes:
        - name: config
          configMap:
            name: jaeger-config
```

```bash
kubectl apply -f jaeger-deployment.yaml
```

---

#### 2.4 Criar o Istio Gateway e VirtualService

```yaml
# jaeger-istio.yaml
apiVersion: networking.istio.io/v1
kind: Gateway
metadata:
  name: jaeger-gateway
  namespace: <NAMESPACE>
spec:
  selector:
    app: observability-ingressgateway
    istio: ingressgateway
  servers:
    - hosts:
        - jaeger.<DOMAIN>
      port:
        name: http
        number: 80
        protocol: HTTP
      tls:
        httpsRedirect: true
    - hosts:
        - jaeger.<DOMAIN>
      port:
        name: https
        number: 443
        protocol: HTTPS
      tls:
        credentialName: <TLS_SECRET_NAME>
        mode: SIMPLE
---
apiVersion: networking.istio.io/v1
kind: VirtualService
metadata:
  name: jaeger-ui
  namespace: <NAMESPACE>
spec:
  gateways:
    - jaeger-gateway
  hosts:
    - jaeger.<DOMAIN>
  http:
    - match:
        - uri:
            prefix: /
      route:
        - destination:
            host: jaeger.<NAMESPACE>.svc.cluster.local
            port:
              number: 16686
```

```bash
kubectl apply -f jaeger-istio.yaml
```

---

## Tabela de Parâmetros Importantes

| Parâmetro                                      | Localização                    | Descrição                                                                                   |
| ---------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------- |
| `cluster.initial_master_nodes`                 | `elasticsearch-config`         | Lista os pods master iniciais. Deve incluir todos os nós do StatefulSet                     |
| `ES_JAVA_OPTS`                                 | Elasticsearch Deployment → env | Heap da JVM. Recomendado: 50% da memória disponível, máximo 26g                             |
| `xpack.security.enabled: false`                | `elasticsearch-config`         | Segurança desabilitada — acesso restrito ao cluster interno via NetworkPolicy se necessário |
| `replicas: 0` (índices)                        | `jaeger-config` → `indices`    | Com 3 nós ES, manter replicas=0 evita shards não alocados em cluster pequeno                |
| `normalize_calls: true`                        | `jaeger-config` → `prometheus` | Adiciona sufixo `_total` ao nome de counters do OTel Collector                              |
| `normalize_duration: true`                     | `jaeger-config` → `prometheus` | Adiciona sufixo `_milliseconds` às métricas de latência                                     |
| `metric_namespace`                             | `jaeger-config` → `prometheus` | Prefixo das métricas SPM. Deve corresponder ao configurado no OTel Collector                |
| `excludeInboundPorts`                          | Jaeger Deployment → annotation | Exclui portas de receiver do sidecar Istio para evitar loop de traces                       |
| `traffic.sidecar.istio.io/excludeInboundPorts` | Jaeger Deployment → annotation | Portas `9411,4317,4318` excluídas do intercept do Envoy sidecar                             |

---

## Comandos Úteis

```bash
# Status dos pods
kubectl get pods -n <NAMESPACE> -l app=jaeger
kubectl get pods -n <NAMESPACE> -l app=elasticsearch

# Logs do Jaeger
kubectl logs -n <NAMESPACE> -l app=jaeger --tail=100 -f

# Logs do Elasticsearch (por pod)
kubectl logs -n <NAMESPACE> elasticsearch-0 --tail=100 -f

# Saúde do cluster Elasticsearch
kubectl port-forward -n <NAMESPACE> svc/elasticsearch-http 9200:9200
curl http://localhost:9200/_cluster/health?pretty
curl http://localhost:9200/_cat/nodes?v
curl http://localhost:9200/_cat/indices?v

# Health do Jaeger
kubectl port-forward -n <NAMESPACE> svc/jaeger 13133:13133
curl http://localhost:13133/status

# UI do Jaeger via port-forward
kubectl port-forward -n <NAMESPACE> svc/jaeger 16686:16686
# Acessar: http://localhost:16686

# Verificar métricas SPM expostas pelo Jaeger
kubectl port-forward -n <NAMESPACE> svc/jaeger 8888:8888
curl http://localhost:8888/metrics | grep traces_span_metrics

# Rollout restart após mudança de ConfigMap
kubectl rollout restart deployment/jaeger -n <NAMESPACE>

# PVCs do Elasticsearch
kubectl get pvc -n <NAMESPACE> -l app=elasticsearch
```

---

## Troubleshooting

### Elasticsearch em CrashLoopBackOff

```bash
kubectl logs -n <NAMESPACE> elasticsearch-0 --previous
```

Causas comuns:
- `vm.max_map_count` insuficiente → verificar se initContainer rodou com sucesso: `kubectl describe pod elasticsearch-0 -n <NAMESPACE>`
- Heap muito grande para o node → ajustar `ES_JAVA_OPTS` para 50% da memória do node
- PVC não bound → `kubectl get pvc -n <NAMESPACE> -l app=elasticsearch`

---

### Elasticsearch cluster status `red`

```bash
kubectl port-forward -n <NAMESPACE> svc/elasticsearch-http 9200:9200
curl http://localhost:9200/_cluster/health?pretty
curl http://localhost:9200/_cat/shards?v | grep UNASSIGNED
```

Causas comuns: nem todos os 3 pods estão `Running`, shards não alocados por falta de nós.

---

### Jaeger não conecta ao Elasticsearch

```bash
kubectl logs -n <NAMESPACE> -l app=jaeger | grep -i "elasticsearch\|es_main\|connect"
```

Verificar se o Service `elasticsearch-http` resolve:

```bash
kubectl exec -n <NAMESPACE> deploy/jaeger -- curl -s http://elasticsearch.<NAMESPACE>.svc.cluster.local:9200/_cluster/health
```

---

### Jaeger não exibe métricas SPM (Monitor tab vazia)

Verificar se o Prometheus contém métricas com prefixo `traces_span_metrics`:

```bash
kubectl port-forward -n <NAMESPACE> svc/prometheus 9090:9090
# Acessar: http://localhost:9090/graph
# Query: {__name__=~"traces_span_metrics.*"}
```

Se não houver dados, verificar se o OTel Collector está enviando métricas (ver tutorial: `04-otel-collector.md`).

---

### ConfigMap atualizado mas Jaeger não reflete a mudança

O Jaeger v2 lê a configuração apenas na inicialização. Após qualquer alteração no ConfigMap, é obrigatório reiniciar:

```bash
kubectl rollout restart deployment/jaeger -n <NAMESPACE>
```

---

### Loop de traces do próprio Jaeger

Se o Jaeger começar a enviar seus próprios traces para si mesmo, verificar se a annotation `traffic.sidecar.istio.io/excludeInboundPorts: "9411,4317,4318"` está aplicada no pod:

```bash
kubectl get pod -n <NAMESPACE> -l app=jaeger -o jsonpath='{.items[0].metadata.annotations}'
```

---

### Jaeger só mostra o serviço `jaeger` no dropdown "Service" (UI vazia)

Sintoma: o Jaeger sobe normalmente, mas no dropdown **Service** da tela "Search" só aparece o próprio `jaeger` (nenhum dos seus apps com sidecar). Significa que **nenhum trace de aplicação está chegando** ao Jaeger.

Esse é um problema do **pipeline de tracing antes do Jaeger** (App → sidecar → OTel Collector → Jaeger). O Jaeger está OK; o problema é que ninguém está mandando span para ele.

Diagnóstico em **três pontos**, na ordem em que costumam falhar:

#### 1. MeshConfig com placeholders literais (`<OTEL_SERVICE>`, `<OTEL_PORT>`)

```bash
kubectl -n istio-system get cm istio -o jsonpath='{.data.mesh}' | grep -A3 "otel-tracing"
```

Esperado:

```yaml
- name: otel-tracing
  opentelemetry:
    service: otel-collector.<NAMESPACE>.svc.cluster.local
    port: 4317
```

Se aparecer `service: <OTEL_SERVICE>` ou `port: <OTEL_PORT>` literais → o tutorial `06-istio-meshconfig.md` foi aplicado sem substituir os placeholders. Editar o ConfigMap (ver `Cap7/06-istio-meshconfig.md`, passo 2) e em seguida:

```bash
kubectl -n istio-system rollout restart deploy istiod
```

#### 2. Falta o recurso `Telemetry` para tracing

```bash
kubectl get telemetry -A
```

Para o tracing funcionar, é preciso pelo menos **um** `Telemetry` com `spec.tracing` (não confundir com `spec.metrics`). O recurso é criado em `Cap7/06-istio-meshconfig.md`, passo 4.

> **Nota:** o `Telemetry` chamado `enable-prometheus-stats` (criado em `Cap7/05-kiali.md`, Apêndice A.1) é apenas para **métricas Prometheus** — ele **não** habilita tracing. São dois recursos distintos que coexistem no cluster.

> **⚠️ Em Istio instalado via Helm `minimal`:** se houver `Telemetry` apenas em `istio-system` e mesmo assim os spans não chegarem (sintoma: `kubectl -n monitor exec deploy/jaeger -c jaeger -- wget -qO- http://localhost:8888/metrics | grep otelcol_receiver_accepted_spans_total` não incrementa após gerar tráfego), **crie também um `Telemetry` no namespace do app**. Ver detalhes em `Cap7/06-istio-meshconfig.md`, passo 4.

#### 3. `PILOT_TRACE_SAMPLING=1` (default do chart Istio) limitando o sampling a 1%

Sintoma típico: nos sidecars, o `random_sampling` aparece como `1` em vez do valor configurado no `Telemetry`.

```bash
# Ver o valor efetivo no istiod
kubectl -n istio-system get deploy istiod -o jsonpath='{.spec.template.spec.containers[0].env[?(@.name=="PILOT_TRACE_SAMPLING")].value}'; echo

# Ver o sampling efetivo num sidecar
WP_POD=$(kubectl -n <APP_NS> get pod -l app=<APP_LABEL> -o jsonpath='{.items[0].metadata.name}')
kubectl -n <APP_NS> exec $WP_POD -c istio-proxy -- pilot-agent request GET 'config_dump' \
  | grep -A3 '"random_sampling"' | head -5
```

Se o valor for `1` mesmo com `Telemetry` configurando `randomSamplingPercentage: 100`, é o env do istiod sobrepondo. Para resolver, ver `Cap1/Kubernets/8-istio.md`, seção B.5 (bloco `pilot.traceSampling`).

#### Validação fim a fim

Após aplicar as três correções acima e reiniciar os apps com sidecar (`kubectl -n <APP_NS> rollout restart deploy <APP_DEPLOY>`), gerar tráfego e validar:

```bash
# Gerar tráfego
kubectl run -n <APP_NS> --rm -i --restart=Never gen --image=curlimages/curl --command -- \
  sh -c 'for i in $(seq 1 50); do curl -s -o /dev/null http://<APP_SVC>.<APP_NS>.svc.cluster.local; done'

# Listar serviços conhecidos pelo Jaeger
kubectl run -n <NAMESPACE> --rm -i --restart=Never q --image=curlimages/curl --command -- \
  curl -s 'http://jaeger.<NAMESPACE>.svc.cluster.local:16686/api/services'
```

A resposta deve trazer mais de `["jaeger"]` — algo como `["jaeger", "<app>.<ns>", "<gateway>.<ns>", ...]`.

---

### Aba "System Architecture" do Jaeger vazia (DAG não gerado)

Sintoma: a aba **System Architecture** mostra "No data available" mesmo com traces fluindo normalmente nas outras abas (Search, Monitor).

Causa: o DAG de dependências entre serviços **não é calculado em tempo real** pelo Jaeger. Ele lê o índice `jaeger-dependencies-*` do Elasticsearch, que precisa ser populado periodicamente por um job batch externo (`jaegertracing/spark-dependencies` ou variantes).

#### ⚠️ Limitação conhecida com Elasticsearch 8.x / 9.x

A imagem oficial **`jaegertracing/spark-dependencies`** usa o cliente `elasticsearch-hadoop`, que oficialmente suporta apenas Elasticsearch até **7.x**. Em ES 8+ ou 9+, o job falha logo no início com:

```
EsHadoopIllegalArgumentException: Unsupported/Unknown Elasticsearch version [9.x.x].
Highest supported version is [7.x]. You may need to upgrade ES-Hadoop.
```

Como esta stack usa Elasticsearch 9.x (definido em `Parte 1 — Elasticsearch`), o job spark-dependencies **não funciona**, e atualmente não há imagem oficial atualizada do projeto Jaeger compatível com ES 8/9.

#### Status e workaround recomendado

**Atualmente não há solução oficial.** Acompanhamento do upstream: <https://github.com/jaegertracing/spark-dependencies/issues>

**Workaround recomendado: usar o Kiali Traffic Graph.** Para fins operacionais (visualizar quem chama quem, taxa de requests, taxa de erro), o **Traffic Graph do Kiali** entrega informação equivalente — e funciona em tempo real, sem depender de job batch:

| Recurso                             | Jaeger System Architecture                 | Kiali Traffic Graph                              |
| ----------------------------------- | ------------------------------------------ | ------------------------------------------------ |
| Fonte                               | Índice `jaeger-dependencies-*` (batch)     | `istio_requests_total` no Prometheus (live)      |
| Janela                              | Histórica (calculada periodicamente)       | Últimos N minutos/horas                          |
| Métricas RED                        | Não                                        | Sim (Rate, Errors, Duration)                     |
| Funciona com ES 9.x                 | ❌ (limitação descrita acima)              | ✅                                                |

**Configuração do Kiali Traffic Graph:** ver `Cap7/05-kiali.md`, Apêndice A (Telemetry de métricas + PodMonitor envoy-stats).

#### Alternativas (não recomendadas neste manual)

- **Build customizado** do `spark-dependencies` com cliente ES atualizado — alto custo de manutenção
- **Subir ES 7.x paralelo** apenas para o índice de dependências — Frankenstein operacional
- **Migrar backend de traces para Cassandra** — esforço grande, perde benefícios do ES (aggregations, kibana)

A recomendação é manter o foco no Kiali Traffic Graph e considerar o System Architecture do Jaeger como uma feature futura, dependente de release upstream do `spark-dependencies` com suporte a ES 8+.

---

## Referências

- [Jaeger v2 Documentation](https://www.jaegertracing.io/docs/latest/)
- [Jaeger v2 Configuration](https://www.jaegertracing.io/docs/latest/configuration/)
- [Jaeger SPM (Service Performance Monitoring)](https://www.jaegertracing.io/docs/latest/spm/)
- [Elasticsearch Reference](https://www.elastic.co/guide/en/elasticsearch/reference/current/index.html)
- [jaegertracing/jaeger Docker Hub](https://hub.docker.com/r/jaegertracing/jaeger/tags)
- [Elasticsearch Docker Hub](https://www.elastic.co/guide/en/elasticsearch/reference/current/docker.html)

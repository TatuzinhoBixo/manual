# Guia de Implantação — Stack de Observabilidade Kubernetes

## Visão Geral

Este guia define a ordem correta de implantação da stack de observabilidade. A ordem importa: existem dependências entre componentes e implantar fora de sequência pode causar falhas de inicialização.

A **abordagem oficial desta stack é via Helm** (`kube-prometheus-stack`). O Prometheus, Alertmanager, Grafana, Node Exporter e Kube State Metrics são instalados num único chart, gerenciado pelo Prometheus Operator.

> **Arquivos `*_LEGADO.md`** nesta pasta correspondem à antiga abordagem manual (Deployment/StatefulSet puros, sem Operator). **Não usar em produção** — mantidos apenas como referência histórica.

### Componentes da stack

```
┌─────────────────────────────────────────────────────────┐
│                  INFRAESTRUTURA BASE                     │
│  Namespace · StorageClass · Secret TLS · Istio · DNS    │
└─────────────────────────┬───────────────────────────────┘
                          │
                          ▼
          ┌─────────────────────────────────┐
          │   kube-prometheus-stack (Helm)  │
          │   Prometheus · Alertmanager     │
          │   Grafana · Node Exporter · KSM │
          └────┬──────────────────────┬─────┘
               │                      │
         ┌─────┴─────┐          ┌─────┴─────┐
         │   Loki    │          │   Kiali   │
         │  Promtail │          │           │
         └───────────┘          └─────┬─────┘
                                      │
         ┌────────────────────────────┤
         │                            │
   ┌─────┴─────┐                ┌─────┴──────┐
   │Elasticsea.│                │  OTel      │
   └─────┬─────┘                │ Collector  │
         │                      └─────┬──────┘
   ┌─────┴──────┐                     │
   │   Jaeger   │◄────────────────────┘
   └─────┬──────┘
         │
   ┌─────┴──────┐
   │Istio Mesh  │
   │Config      │
   └────────────┘
```

---

## Pré-requisitos obrigatórios

Antes de iniciar, confirme que os itens abaixo existem no cluster:

```bash
# 1. Namespace
kubectl get namespace <NAMESPACE>

# 2. StorageClass
kubectl get storageclass <STORAGE_CLASS>

# 3. Secret TLS no istio-system
kubectl get secret <TLS_SECRET_NAME> -n istio-system

# 4. Istio IngressGateway rodando
kubectl get pods -n istio-system -l app=istio-ingressgateway

# 5. Helm instalado
helm version

# 6. DNS — confirmar resolução dos domínios
# grafana.<DOMAIN>, prometheus.<DOMAIN>, alertmanager.<DOMAIN>
# loki.<DOMAIN>, kiali.<DOMAIN>, jaeger.<DOMAIN>
```

---

## Ordem de implantação

### Fase 1 — Stack de métricas, alertas e visualização

Instala **Prometheus + Alertmanager + Grafana + Node Exporter + Kube State Metrics + Prometheus Operator** num único chart Helm.

| Tutorial                        | Componentes instalados                                                        |
| ------------------------------- | ----------------------------------------------------------------------------- |
| `01-kube-prometheus-stack.md`   | Prometheus, Alertmanager, Grafana, Node Exporter, KSM, Operator, CRDs, Istio Gateway/VS |

```bash
# Verificar Fase 1 completa
kubectl get pods -n <NAMESPACE> -l app.kubernetes.io/part-of=kube-prometheus-stack
kubectl get servicemonitors.monitoring.coreos.com -A
kubectl get prometheusrules.monitoring.coreos.com -A
```

---

### Fase 2 — Logs

Depende do Grafana (Fase 1) para datasource do Loki.

| Tutorial              | Componentes                                                                 |
| --------------------- | --------------------------------------------------------------------------- |
| `02-loki.md` — Parte 1 | Secret MinIO, PVC, Service, DestinationRule, Deployment MinIO, Job buckets  |
| `02-loki.md` — Parte 2 | ConfigMap Loki, Services, DestinationRules, Deployments/StatefulSets, Istio |
| `02-loki.md` — Parte 3 | ServiceAccount Promtail, RBAC, ConfigMap, DaemonSet                         |

```bash
# Verificar Fase 2 completa
kubectl get pods -n <NAMESPACE> -l app=minio
kubectl get pods -n <NAMESPACE> -l app=loki
kubectl get pods -n <NAMESPACE> -l app=promtail

# Health do Loki
kubectl port-forward -n <NAMESPACE> svc/loki-read 3100:3100
curl http://localhost:3100/ready
curl http://localhost:3100/ring
```

---

### Fase 3 — Traces (storage)

O Elasticsearch deve estar saudável antes do Jaeger.

| Tutorial                 | Componentes                                                    |
| ------------------------ | -------------------------------------------------------------- |
| `03-jaeger.md` — Parte 1 | ServiceAccount, ConfigMap, Services Elasticsearch, StatefulSet |

```bash
# Verificar Fase 3 completa
kubectl rollout status statefulset/elasticsearch -n <NAMESPACE>

kubectl port-forward -n <NAMESPACE> svc/elasticsearch-http 9200:9200
curl http://localhost:9200/_cluster/health?pretty
# "status": "green" ou "yellow" — ambos válidos para prosseguir
```

---

### Fase 4 — Traces (Jaeger + OTel Collector)

Depende do Elasticsearch (Fase 3) e da Fase 1 (Prometheus).

| Tutorial                   | Componentes                                      |
| -------------------------- | ------------------------------------------------ |
| `03-jaeger.md` — Parte 2   | ConfigMap, Service, Deployment, Istio Gateway/VS |
| `04-otel-collector.md`     | ConfigMap, Service, DestinationRule, Deployment  |

```bash
# Verificar Fase 4 completa
kubectl get pods -n <NAMESPACE> -l app=jaeger
kubectl get pods -n <NAMESPACE> -l app=otel-collector

# Health do Jaeger
kubectl port-forward -n <NAMESPACE> svc/jaeger 13133:13133
curl http://localhost:13133/status

# Health do OTel Collector
kubectl port-forward -n <NAMESPACE> svc/otel-collector 13133:13133
curl http://localhost:13133
```

---

### Fase 5 — Service Mesh (Kiali)

Depende de Prometheus, Grafana e Jaeger.

| Tutorial                | Componentes                                                                    |
| ----------------------- | ------------------------------------------------------------------------------ |
| `05-kiali.md` — Parte 1 | ServiceAccount, RBAC, Secret, ConfigMap, Service, Deployment, Istio Gateway/VS |
| `05-kiali.md` — Parte 2 | EnvoyFilter Basic Auth (protege kiali e jaeger)                                |

```bash
# Verificar Fase 5 completa
kubectl get pods -n <NAMESPACE> -l app=kiali
kubectl get envoyfilter basic-auth -n <NAMESPACE>

# Testar Basic Auth
curl -I https://kiali.<DOMAIN>        # deve retornar 401
curl -I https://jaeger.<DOMAIN>       # deve retornar 401
```

---

### Fase 6 — Istio Tracing

Aplicar por último, após o OTel Collector estar operacional.

| Tutorial                     | Componentes                                    |
| ---------------------------- | ---------------------------------------------- |
| `06-istio-meshconfig.md`     | Edição do ConfigMap `istio` no `istio-system`  |
| `06-istio-meshconfig.md`     | Restart do istiod                              |
| `06-istio-meshconfig.md`     | Recurso `Telemetry` no namespace `<NAMESPACE>` |

```bash
# Verificar Fase 6 completa
kubectl get configmap istio -n istio-system -o jsonpath='{.data.mesh}' | grep otel-tracing
kubectl get telemetry -n <NAMESPACE>
kubectl rollout status deployment/istiod -n istio-system
```

---

## Resumo da ordem completa

```
Fase 1  →  kube-prometheus-stack (Helm)
Fase 2  →  minio → loki → promtail
Fase 3  →  elasticsearch
Fase 4  →  jaeger + otel-collector
Fase 5  →  kiali + envoyfilter
Fase 6  →  istio meshconfig + telemetry
```

---

## Verificação final da stack

Após todas as fases, confirmar que todos os pods estão `Running`:

```bash
kubectl get pods -n <NAMESPACE>
```

Acessar as UIs:

| Componente   | URL                                           |
| ------------ | --------------------------------------------- |
| Grafana      | `https://grafana.<DOMAIN>`                    |
| Prometheus   | `https://prometheus.<DOMAIN>`                 |
| Alertmanager | `https://alertmanager.<DOMAIN>`               |
| Loki         | `https://loki.<DOMAIN>`                       |
| Jaeger       | `https://jaeger.<DOMAIN>` (requer Basic Auth) |
| Kiali        | `https://kiali.<DOMAIN>` (requer Basic Auth)  |

---

## Dependências entre tutoriais

```
01-kube-prometheus-stack.md
  └── 02-loki.md               (datasource Loki no Grafana)
  └── 03-jaeger.md             (métricas SPM via Prometheus)
  └── 04-otel-collector.md     (ServiceMonitor para job otel-spanmetrics)
  └── 05-kiali.md              (métricas de malha + dashboards Istio)

02-loki.md
  └── minio (interno)          (object storage dos chunks)

03-jaeger.md
  └── elasticsearch (interno)  (backend de traces)
  └── 04-otel-collector.md     (recebe traces e encaminha ao Jaeger)

05-kiali.md
  └── 01-kube-prometheus-stack (Prometheus + Grafana)
  └── 03-jaeger.md             (traces)

06-istio-meshconfig.md
  └── 04-otel-collector.md     (provider otel-tracing)
```

---

## ⚠️ Pegadinhas comuns (leia antes de começar)

Bugs/desencontros que costumam acontecer ao seguir os tutoriais pela primeira vez. Cada um tem um link pro arquivo onde está o detalhe e o fix.

### 1. Placeholders literais não substituídos

Vários YAMLs têm `<NAMESPACE>`, `<DOMAIN>`, `<OTEL_SERVICE>`, `<PROMETHEUS_URL>` etc. **Substituir antes de aplicar** — alguns desses placeholders, se aplicados literais, fazem o componente subir aparentemente OK mas sem funcionar.

Verificação rápida ao final de cada tutorial:

```bash
# Procurar qualquer ocorrência de "<...>" literal nos manifestos aplicados
kubectl -n <NAMESPACE> get cm,svc,virtualservice,destinationrule -o yaml | grep -E '<[A-Z_]+>'
kubectl -n istio-system get cm istio -o jsonpath='{.data.mesh}' | grep -E '<[A-Z_]+>'
```

Não deve retornar nada.

### 2. Kiali Traffic Graph vazio

Sintoma: Kiali abre, namespaces aparecem, mas o **Traffic Graph** mostra "no graph available".

Causa: Prometheus não está coletando `istio_requests_total` dos sidecars Envoy. Solução: criar `Telemetry` (métricas) + `PodMonitor envoy-stats-monitor` + `ServiceMonitor istiod-monitor`.

📍 Ver **`05-kiali.md` → Apêndice A** (instruções completas + comandos de validação).

### 3. Jaeger só mostra o serviço `jaeger`

Sintoma: dropdown "Service" do Jaeger só lista o próprio `jaeger`. Nenhum app aparece.

Causas (pode ser uma ou várias em sequência):
1. Placeholders `<OTEL_SERVICE>` / `<OTEL_PORT>` no MeshConfig do Istio (`06-istio-meshconfig.md`, passo 2)
2. Falta o recurso `Telemetry` com `spec.tracing` (`06-istio-meshconfig.md`, passo 4)
3. `PILOT_TRACE_SAMPLING=1` no istiod sobrepondo o `Telemetry` (`Cap1/Kubernets/8-istio.md`, seção B.5)
4. **Istio Helm `minimal`**: `Telemetry` em `istio-system` sozinho não destrava o provider OTel — criar também no namespace do app (`06-istio-meshconfig.md`, passo 4, observação destacada)

📍 Ver **`03-jaeger.md` → Troubleshooting → "Jaeger só mostra o serviço `jaeger`"** (diagnóstico passo a passo).

### 4. Aba Monitor (SPM) do Jaeger vazia

Sintoma: aba **Monitor** do Jaeger não popula gráficos de Latency/Errors/Rate.

Causa: falta `ServiceMonitor` para o OTel Collector — sem ele, o Prometheus não scrapeia as `traces_span_metrics_*` da porta 8889 do Collector.

📍 Ver **`04-otel-collector.md` → passo 5** (ServiceMonitor) e **Troubleshooting → "Métricas SPM não aparecem no Prometheus"**.

### 5. Kiali UI fica em loading eterno após login

Sintoma: login passa, mas a UI nunca carrega completamente.

Causa: faltam permissões `gatewayclasses` / `backendtlspolicies` no `ClusterRole` do Kiali. Sem elas, o cache entra em loop "Shutting down cache" e a API trava.

📍 Ver **`05-kiali.md` → Troubleshooting → "UI fica em loading eterno após login"**.

### 6. Kiali em CrashLoopBackOff por causa do `signing-key`

Sintoma: pod do Kiali não sobe, log mostra `invalid configuration: signing key for sessions must be 16, 24 or 32 bytes length`.

Causa: `signing-key` no Secret está com tamanho diferente de 16/24/32 chars (ex: `openssl rand -base64 32` produz **44** chars, que é inválido).

📍 Ver **`05-kiali.md` → seção 1.2** (use `openssl rand -hex 16` que dá 32 chars).

### 7. Aba "System Architecture" do Jaeger vazia (limitação conhecida)

Sintoma: aba **System Architecture** do Jaeger mostra "No data available" mesmo com tracing funcionando nas outras abas.

Causa: o DAG depende de um job batch (`spark-dependencies`) que **não tem imagem oficial compatível com ES 8.x/9.x**. Como esta stack usa ES 9.x, a feature não está disponível.

**Workaround:** usar o **Kiali Traffic Graph** (`Cap7/05-kiali.md`) — entrega informação equivalente em tempo real, sem depender de job batch.

📍 Detalhes em **`03-jaeger.md` → Troubleshooting → "Aba System Architecture do Jaeger vazia"**.

---

### 8. Validação fim a fim do pipeline de tracing

Após aplicar `06-istio-meshconfig.md` e reiniciar os apps com sidecar, validar:

```bash
# 1. Sidecar de um app está com sampling correto (não 1)
APP_POD=$(kubectl -n <APP_NS> get pod -l app=<APP> -o jsonpath='{.items[0].metadata.name}')
kubectl -n <APP_NS> exec $APP_POD -c istio-proxy -- pilot-agent request GET 'config_dump' \
  | grep -A2 '"random_sampling"' | head -5

# 2. Jaeger conhece serviços além de "jaeger"
kubectl -n <NAMESPACE> exec deploy/jaeger -c jaeger -- \
  curl -s http://localhost:16686/api/services

# 3. SPM no Prometheus (count > 0)
kubectl -n <NAMESPACE> exec sts/prometheus-prometheus -c prometheus -- \
  wget -qO- 'http://localhost:9090/api/v1/query?query=count({__name__=~"traces_span_metrics.*"})'
```

---

## Arquivos legados (`*_LEGADO.md`)

Estes arquivos documentam a antiga abordagem manual (Deployment puro, sem Operator). Foram substituídos pelo `01-kube-prometheus-stack.md`. **Não usar em produção.**

- `promethues_LEGADO.md`
- `grafana_LEGADO.md`
- `alertmanagement_LEGADO.md`
- `node-exporter_LEGADO.md`
- `kube-state-metrics_LEGADO.md`

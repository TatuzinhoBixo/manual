# Guia de Implantação — Stack de Observabilidade Kubernetes

## Visão Geral

Este guia define a ordem correta de implantação de todos os componentes da stack de observabilidade. A ordem é importante pois existem dependências entre os componentes — implantar fora de sequência pode causar falhas de inicialização.

### Componentes da stack

```
┌─────────────────────────────────────────────────────────┐
│                  INFRAESTRUTURA BASE                     │
│  Namespace · StorageClass · Secret TLS · Istio · DNS    │
└─────────────────────────┬───────────────────────────────┘
                          │
          ┌───────────────┼───────────────┐
          ▼               ▼               ▼
    ┌──────────┐   ┌────────────┐   ┌──────────┐
    │  MinIO   │   │ Prometheus │   │  Kiali   │
    └────┬─────┘   └─────┬──────┘   └────┬─────┘
         │               │               │
    ┌────┴─────┐   ┌─────┴──────┐        │
    │   Loki   │   │  Grafana   │        │
    │ Promtail │   │Alertmanager│        │
    └──────────┘   │Node Export.│        │
                   │KSM         │        │
                   └─────┬──────┘        │
                         │               │
                   ┌─────┴──────┐        │
                   │Elasticsearch│       │
                   └─────┬──────┘        │
                         │               │
                   ┌─────┴──────┐        │
                   │   Jaeger   ├────────┘
                   └─────┬──────┘
                         │
                   ┌─────┴──────┐
                   │OTel Collect│
                   └─────┬──────┘
                         │
                   ┌─────┴──────┐
                   │Istio Mesh  │
                   │Config      │
                   └────────────┘
```

---

## Pré-requisitos obrigatórios

Antes de iniciar qualquer implantação, confirme que os itens abaixo existem no cluster:

```bash
# 1. Namespace
kubectl get namespace <NAMESPACE>

# 2. StorageClass
kubectl get storageclass <STORAGE_CLASS>

# 3. Secret TLS no istio-system
kubectl get secret <TLS_SECRET_NAME> -n istio-system

# 4. Istio IngressGateway rodando
kubectl get pods -n istio-system -l app=istio-ingressgateway

# 5. DNS — confirmar resolução dos domínios
# grafana.<DOMAIN>, prometheus.<DOMAIN>, alertmanager.<DOMAIN>
# loki.<DOMAIN>, kiali.<DOMAIN>, jaeger.<DOMAIN>
```

---

## Ordem de implantação

### Fase 1 — Métricas base

Estes componentes não têm dependências entre si e podem ser implantados em paralelo.

| Ordem | Tutorial                | Componentes                                                                 |
| ----- | ----------------------- | --------------------------------------------------------------------------- |
| 1.1   | `prometheus.md`         | ServiceAccount, RBAC, ConfigMap, PVC, Service, Deployment, Istio Gateway/VS |
| 1.2   | `node-exporter.md`      | ServiceAccount, Service, DaemonSet                                          |
| 1.3   | `kube-state-metrics.md` | ServiceAccount, RBAC, Service, Deployment                                   |

```bash
# Verificar Fase 1 completa
kubectl get pods -n <NAMESPACE> -l app=prometheus
kubectl get pods -n <NAMESPACE> -l app=node-exporter
kubectl get pods -n <NAMESPACE> -l app=kube-state-metrics
```

---

### Fase 2 — Visualização e alertas

Depende do Prometheus (Fase 1) estar operacional.

| Ordem | Tutorial          | Componentes                                                                          |
| ----- | ----------------- | ------------------------------------------------------------------------------------ |
| 2.1   | `alertmanager.md` | ServiceAccount, ConfigMap, Service, StatefulSet, VirtualService                      |
| 2.2   | `grafana.md`      | ServiceAccount, RBAC, Secret, ConfigMaps, PVC, Service, Deployment, Istio Gateway/VS |

```bash
# Verificar Fase 2 completa
kubectl get pods -n <NAMESPACE> -l app=alertmanager
kubectl get pods -n <NAMESPACE> -l app=grafana

# Confirmar que o Prometheus enxerga o Alertmanager
kubectl port-forward -n <NAMESPACE> svc/prometheus 9090:9090
# Acessar: http://localhost:9090/status → seção Alertmanagers
```

---

### Fase 3 — Logs

Depende do Grafana (Fase 2) para o datasource do Loki.

| Ordem | Tutorial                        | Componentes                                                                 |
| ----- | ------------------------------- | --------------------------------------------------------------------------- |
| 3.1   | `loki.md` — Parte 1             | Secret MinIO, PVC, Service, DestinationRule, Deployment MinIO               |
| 3.2   | `loki.md` — Parte 1 (etapa 1.6) | Aguardar MinIO pronto                                                       |
| 3.3   | `loki.md` — Parte 1 (etapa 1.7) | Job de criação de buckets                                                   |
| 3.4   | `loki.md` — Parte 2             | ConfigMap Loki, Services, DestinationRules, Deployments/StatefulSets, Istio |
| 3.5   | `loki.md` — Parte 3             | ServiceAccount Promtail, RBAC, ConfigMap, DaemonSet                         |

```bash
# Verificar Fase 3 completa
kubectl get pods -n <NAMESPACE> -l app=minio
kubectl get pods -n <NAMESPACE> -l app=loki
kubectl get pods -n <NAMESPACE> -l app=promtail

# Confirmar ring do Loki
kubectl port-forward -n <NAMESPACE> svc/loki-read 3100:3100
curl http://localhost:3100/ready
curl http://localhost:3100/ring
```

---

### Fase 4 — Traces (storage)

O Elasticsearch deve estar saudável antes de implantar o Jaeger.

| Ordem | Tutorial              | Componentes                                                    |
| ----- | --------------------- | -------------------------------------------------------------- |
| 4.1   | `jaeger.md` — Parte 1 | ServiceAccount, ConfigMap, Services Elasticsearch, StatefulSet |
| 4.2   | Aguardar              | Elasticsearch cluster status `green` ou `yellow`               |

```bash
# Verificar Fase 4 completa
kubectl rollout status statefulset/elasticsearch -n <NAMESPACE>

kubectl port-forward -n <NAMESPACE> svc/elasticsearch-http 9200:9200
curl http://localhost:9200/_cluster/health?pretty
# "status": "green" ou "yellow" — ambos são válidos para prosseguir
```

---

### Fase 5 — Traces (Jaeger e OTel Collector)

Depende do Elasticsearch (Fase 4) e do Prometheus (Fase 1).

| Ordem | Tutorial              | Componentes                                      |
| ----- | --------------------- | ------------------------------------------------ |
| 5.1   | `jaeger.md` — Parte 2 | ConfigMap, Service, Deployment, Istio Gateway/VS |
| 5.2   | `otel-collector.md`   | ConfigMap, Service, DestinationRule, Deployment  |

```bash
# Verificar Fase 5 completa
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

### Fase 6 — Service Mesh (Kiali)

Depende de Prometheus, Grafana e Jaeger estarem operacionais.

| Ordem | Tutorial             | Componentes                                                                    |
| ----- | -------------------- | ------------------------------------------------------------------------------ |
| 6.1   | `kiali.md` — Parte 1 | ServiceAccount, RBAC, Secret, ConfigMap, Service, Deployment, Istio Gateway/VS |
| 6.2   | `kiali.md` — Parte 2 | EnvoyFilter Basic Auth (protege kiali e jaeger)                                |

```bash
# Verificar Fase 6 completa
kubectl get pods -n <NAMESPACE> -l app=kiali
kubectl get envoyfilter basic-auth -n <NAMESPACE>

# Testar Basic Auth
curl -I https://kiali.<DOMAIN>        # deve retornar 401
curl -I https://jaeger.<DOMAIN>       # deve retornar 401
```

---

### Fase 7 — Istio Tracing

Deve ser aplicado por último, após o OTel Collector estar operacional.

| Ordem | Tutorial              | Componentes                                    |
| ----- | --------------------- | ---------------------------------------------- |
| 7.1   | `istio-meshconfig.md` | Edição do ConfigMap `istio` no `istio-system`  |
| 7.2   | `istio-meshconfig.md` | Restart do istiod                              |
| 7.3   | `istio-meshconfig.md` | Recurso `Telemetry` no namespace `<NAMESPACE>` |

```bash
# Verificar Fase 7 completa
kubectl get configmap istio -n istio-system -o jsonpath='{.data.mesh}' | grep otel-tracing
kubectl get telemetry -n <NAMESPACE>
kubectl rollout status deployment/istiod -n istio-system
```

---

## Resumo da ordem completa

```
Fase 1  →  prometheus + node-exporter + kube-state-metrics
Fase 2  →  alertmanager + grafana
Fase 3  →  minio → (buckets) → loki → promtail
Fase 4  →  elasticsearch → (cluster healthy)
Fase 5  →  jaeger + otel-collector
Fase 6  →  kiali + envoyfilter
Fase 7  →  istio meshconfig + telemetry
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
prometheus.md
  └── alertmanager.md        (Prometheus aponta para alertmanager:9093)
  └── grafana.md             (datasource Prometheus)
  └── kube-state-metrics.md  (job static_configs no prometheus.yml)
  └── node-exporter.md       (job service discovery no prometheus.yml)
  └── otel-collector.md      (job otel-spanmetrics no prometheus.yml)
  └── jaeger.md              (metric_backend prometheus no jaeger-config)

loki.md
  └── grafana.md             (datasource Loki)
  └── minio (interno)        (object storage dos chunks)

jaeger.md
  └── elasticsearch (interno) (backend de traces)
  └── prometheus.md           (métricas SPM)
  └── otel-collector.md       (recebe traces e encaminha ao Jaeger)

kiali.md
  └── prometheus.md           (métricas de malha)
  └── grafana.md              (dashboards Istio)
  └── jaeger.md               (traces)

istio-meshconfig.md
  └── otel-collector.md       (provider otel-tracing)
```

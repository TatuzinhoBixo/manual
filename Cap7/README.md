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

## Arquivos legados (`*_LEGADO.md`)

Estes arquivos documentam a antiga abordagem manual (Deployment puro, sem Operator). Foram substituídos pelo `01-kube-prometheus-stack.md`. **Não usar em produção.**

- `promethues_LEGADO.md`
- `grafana_LEGADO.md`
- `alertmanagement_LEGADO.md`
- `node-exporter_LEGADO.md`
- `kube-state-metrics_LEGADO.md`

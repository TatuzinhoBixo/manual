# Istio MeshConfig — Stack de Observabilidade Kubernetes

## Descrição Geral

Este tutorial descreve a configuração do **MeshConfig** do Istio e do recurso **Telemetry** para habilitar o rastreamento distribuído via OTel Collector na stack de observabilidade.

O Istio é instalado via **Helm** (versão 1.29.1). A configuração de tracing é gerenciada pelo ConfigMap `istio` no namespace `istio-system`, que define o provider `otel-tracing` apontando para o OTel Collector. O recurso `Telemetry` no namespace `observability` ativa o sampling de traces para os workloads daquele namespace.

### Fluxo de configuração

```
ConfigMap istio (istio-system)
  └── extensionProviders
        └── otel-tracing → otel-collector.<NAMESPACE>:4317
              │
              ▼
        Telemetry (observability)
          └── randomSamplingPercentage: 100
                │
                ▼
          Sidecars Istio enviam traces
                │
                ▼
          OTel Collector → Jaeger → Elasticsearch
```

---

## Tabela de Variáveis

| Variável                | Descrição                        | Exemplo                                          |
| ----------------------- | -------------------------------- | ------------------------------------------------ |
| `<NAMESPACE>`           | Namespace de observabilidade     | `observability`                                  |
| `<OTEL_SERVICE>`        | FQDN do OTel Collector           | `otel-collector.observability.svc.cluster.local` |
| `<OTEL_PORT>`           | Porta gRPC do OTel Collector     | `4317`                                           |
| `<SAMPLING_PERCENTAGE>` | Percentual de sampling de traces | `100`                                            |

---

## Pré-requisitos

- Istio instalado via Helm (versão 1.29+) no cluster
- OTel Collector implantado e operacional (ver tutorial: `otel-collector.md`)
- Jaeger implantado e operacional (ver tutorial: `jaeger.md`)
- `kubectl` com acesso ao namespace `istio-system`

---

## Etapas

### 1. Verificar a configuração atual do MeshConfig

```bash
kubectl get configmap istio -n istio-system -o jsonpath='{.data.mesh}' | grep -A10 extensionProviders
```

Se o provider `otel-tracing` já aparecer na saída, o MeshConfig está configurado. Prosseguir para o passo 3.

---

### 2. Adicionar o provider `otel-tracing` ao MeshConfig

> **Atenção:** O ConfigMap `istio` no namespace `istio-system` é gerenciado pelo Helm. Edições manuais são sobrescritas em upgrades do Istio. Para persistir a configuração, utilize `helm upgrade` com `--set` ou um arquivo `values.yaml`.

#### Opção A — Edição direta (operacional imediato)

```bash
kubectl edit configmap istio -n istio-system
```

Localizar a seção `mesh:` e adicionar o bloco `extensionProviders` caso não exista:

```yaml
data:
  mesh: |
    accessLogFile: /dev/stdout
    defaultConfig:
      discoveryAddress: istiod.istio-system.svc:15012
    defaultProviders:
      metrics:
      - prometheus
    enablePrometheusMerge: true
    enableTracing: true
    extensionProviders:
    - name: otel-tracing
      opentelemetry:
        service: <OTEL_SERVICE>
        port: <OTEL_PORT>
    rootNamespace: istio-system
    trustDomain: cluster.local
```

Salvar e fechar o editor. A alteração é aplicada imediatamente pelo istiod.

#### Opção B — Patch via kubectl (recomendado para automação)

```bash
kubectl patch configmap istio -n istio-system --type merge -p '{
  "data": {
    "mesh": "accessLogFile: /dev/stdout\ndefaultConfig:\n  discoveryAddress: istiod.istio-system.svc:15012\ndefaultProviders:\n  metrics:\n  - prometheus\nenablePrometheusMerge: true\nenableTracing: true\nextensionProviders:\n- name: otel-tracing\n  opentelemetry:\n    service: <OTEL_SERVICE>\n    port: <OTEL_PORT>\nrootNamespace: istio-system\ntrustDomain: cluster.local\n"
  }
}'
```

> **Nota:** O patch via `--type merge` substitui o campo `mesh` inteiro. Certifique-se de incluir todas as configurações existentes antes de aplicar.

---

### 3. Reiniciar o istiod para propagar a configuração

```bash
kubectl rollout restart deployment/istiod -n istio-system
kubectl rollout status deployment/istiod -n istio-system
```

---

### 4. Aplicar o recurso Telemetry

O recurso `Telemetry` no namespace `<NAMESPACE>` ativa o sampling de traces para todos os workloads daquele namespace usando o provider `otel-tracing`.

```yaml
# telemetry-tracing.yaml
apiVersion: telemetry.istio.io/v1
kind: Telemetry
metadata:
  name: tracing
  namespace: <NAMESPACE>
spec:
  tracing:
    - randomSamplingPercentage: <SAMPLING_PERCENTAGE>
      providers:
        - name: otel-tracing
```

```bash
kubectl apply -f telemetry-tracing.yaml
```

> **Nota sobre sampling:** `randomSamplingPercentage: 100` captura 100% dos traces — adequado para ambientes de desenvolvimento/homologação. Em produção com alto volume de requisições, considere reduzir para `10` ou `1` para evitar overhead nos sidecars e volume excessivo no Jaeger/Elasticsearch.

---

### 5. Verificar propagação nos sidecars

Após reiniciar o istiod, os sidecars recebem a nova configuração automaticamente. Para forçar a atualização em pods específicos:

```bash
# Reiniciar um deployment específico para forçar reload do sidecar
kubectl rollout restart deployment/<NOME_DO_DEPLOYMENT> -n <NAMESPACE>

# Verificar configuração do sidecar (bootstrap config)
istioctl proxy-config bootstrap <POD_NAME> -n <NAMESPACE> | grep -A5 tracing
```

---

## Tabela de Parâmetros Importantes

| Parâmetro                                    | Localização                | Descrição                                                             |
| -------------------------------------------- | -------------------------- | --------------------------------------------------------------------- |
| `extensionProviders[].name`                  | ConfigMap `istio` → `mesh` | Nome do provider referenciado pelo recurso `Telemetry`                |
| `extensionProviders[].opentelemetry.service` | ConfigMap `istio` → `mesh` | FQDN do OTel Collector dentro do cluster                              |
| `extensionProviders[].opentelemetry.port`    | ConfigMap `istio` → `mesh` | Porta gRPC OTLP do OTel Collector (padrão: 4317)                      |
| `enableTracing: true`                        | ConfigMap `istio` → `mesh` | Habilita tracing globalmente no mesh                                  |
| `randomSamplingPercentage`                   | Recurso `Telemetry`        | Percentual de requisições amostradas. 100 = todas, 1 = 1%             |
| `providers[].name`                           | Recurso `Telemetry`        | Deve corresponder exatamente ao nome definido em `extensionProviders` |

---

## Comandos Úteis

```bash
# Verificar configuração atual do MeshConfig
kubectl get configmap istio -n istio-system -o jsonpath='{.data.mesh}'

# Verificar extensionProviders configurados
kubectl get configmap istio -n istio-system -o jsonpath='{.data.mesh}' | grep -A5 extensionProviders

# Verificar recursos Telemetry aplicados
kubectl get telemetry -A

# Verificar configuração de tracing em um sidecar
istioctl proxy-config bootstrap <POD_NAME> -n <NAMESPACE> | grep -A10 tracing

# Verificar se o istiod propagou a configuração
kubectl logs -n istio-system -l app=istiod --tail=50 | grep -i "otel\|tracing\|extension"

# Versão do Istio instalada
kubectl get configmap istio -n istio-system -o jsonpath='{.metadata.labels.app\.kubernetes\.io/version}'
```

---

## Troubleshooting

### Traces não aparecem no Jaeger

Verificar em ordem:

1. Provider configurado no MeshConfig:
```bash
kubectl get configmap istio -n istio-system -o jsonpath='{.data.mesh}' | grep otel-tracing
```

2. Recurso Telemetry aplicado no namespace correto:
```bash
kubectl get telemetry -n <NAMESPACE>
```

3. OTel Collector recebendo spans:
```bash
kubectl logs -n <NAMESPACE> -l app=otel-collector | grep -i "traces\|spans\|received"
```

4. Sidecar do pod enviando traces (verificar bootstrap config):
```bash
istioctl proxy-config bootstrap <POD_NAME> -n <NAMESPACE> | grep -A5 opentelemetry
```

---

### Istiod não propagou o novo provider

```bash
kubectl rollout restart deployment/istiod -n istio-system
```

Verificar nos logs se o novo provider foi carregado:

```bash
kubectl logs -n istio-system -l app=istiod | grep -i "extensionProvider\|otel-tracing"
```

---

### ConfigMap editado manualmente sobrescrito após upgrade do Helm

Para persistir a configuração via Helm, adicionar ao `values.yaml` do istiod:

```yaml
meshConfig:
  enableTracing: true
  extensionProviders:
    - name: otel-tracing
      opentelemetry:
        service: otel-collector.<NAMESPACE>.svc.cluster.local
        port: 4317
```

E aplicar:

```bash
helm upgrade istiod istio/istiod \
  -n istio-system \
  -f values.yaml
```

---

## Referências

- [Istio Distributed Tracing](https://istio.io/latest/docs/tasks/observability/distributed-tracing/)
- [Istio Telemetry API](https://istio.io/latest/docs/reference/config/telemetry/)
- [Istio MeshConfig Reference](https://istio.io/latest/docs/reference/config/istio.mesh.v1alpha1/)
- [Istio OpenTelemetry Provider](https://istio.io/latest/docs/tasks/observability/distributed-tracing/opentelemetry/)
- [Istio Helm Chart values](https://artifacthub.io/packages/helm/istio-official/istiod)

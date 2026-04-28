# Istio MeshConfig — Stack de Observabilidade Kubernetes

## 🧭 Onde este tutorial entra na stack

Este é o **último passo** que faz os traces começarem a fluir das aplicações até o Jaeger. Sem ele, o Jaeger fica vazio (só com o serviço `jaeger` no dropdown).

```
[03-jaeger.md]   →  [04-otel-collector.md]  →  [05-kiali.md]  →  [06] ← VOCÊ ESTÁ AQUI
backend/UI          recebe spans das apps     UI de mesh         conecta os sidecars
                    e encaminha pro Jaeger                       Istio ao OTel Collector
```

### Checklist antes de começar

Confirme que os tutoriais anteriores estão aplicados:

| Item                                                                         | Como verificar                                                            |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Jaeger rodando e UI acessível                                                | `kubectl -n <NAMESPACE> get deploy jaeger` → 1/1                          |
| OTel Collector rodando                                                       | `kubectl -n <NAMESPACE> get deploy otel-collector` → 1/1                  |
| Service `otel-collector` no ns `<NAMESPACE>` (porta 4317)                    | `kubectl -n <NAMESPACE> get svc otel-collector`                           |
| ServiceMonitor do OTel Collector criado (para a aba Monitor do Jaeger)        | `kubectl get servicemonitor -A \| grep otel`                              |

### Os 3 passos críticos deste tutorial

Em ordem, e **todos os 3 são obrigatórios** para o tracing funcionar:

1. **MeshConfig** — adicionar `extensionProvider: otel-tracing` apontando para o OTel Collector (passos 1-3 deste arquivo) — **substitua os placeholders `<OTEL_SERVICE>` e `<OTEL_PORT>` pelos valores reais**
2. **Telemetry** — criar recurso `Telemetry` que usa o provider acima (passo 4)
3. **`PILOT_TRACE_SAMPLING`** — verificar/ajustar o sampling global no istiod (ver caveat no passo 4 e detalhes em `Cap1/Kubernets/8-istio.md`, seção B.5). **Sem isso, mesmo com tudo configurado, o sidecar amostra apenas 1% dos requests.**

> **Atalho de validação ao final:** `kubectl -n <NAMESPACE> exec deploy/jaeger -c jaeger -- curl -s http://localhost:16686/api/services` deve listar mais que `["jaeger"]`.

---

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
- OTel Collector implantado e operacional (ver tutorial: `04-otel-collector.md`)
- Jaeger implantado e operacional (ver tutorial: `03-jaeger.md`)
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

> **⚠️ Não confundir com o `Telemetry` de métricas Prometheus.** O recurso `Telemetry` do Istio cobre **três tipos de sinais distintos** (`metrics`, `tracing`, `accessLogging`). Este passo configura **apenas tracing**.
>
> | Tipo de telemetria | Onde está documentado                  | Campo no spec        | Amostragem?                       |
> | ------------------ | -------------------------------------- | -------------------- | --------------------------------- |
> | **Métricas** (Prometheus / Kiali Graph) | `Cap7/05-kiali.md` (Apêndice A) | `spec.metrics`       | Não — sempre 100%                |
> | **Traces** (Jaeger via OTel)            | **Este passo**                  | `spec.tracing`       | Sim — `randomSamplingPercentage` |
> | **Access logs**                          | (não usado neste manual)        | `spec.accessLogging` | Não                              |
>
> Os recursos `Telemetry` para métricas e tracing **coexistem no cluster**: aplique ambos (com nomes diferentes — ex: `enable-prometheus-stats` para métricas e `tracing` para traces). Eles não substituem um ao outro.
>
> **Escopo via namespace:** o ns onde o `Telemetry` é criado define o alcance:
> - `namespace: istio-system` → vale para **todo o mesh**
> - `namespace: <ns-específico>` → vale **apenas para aquele ns**
> - Pode-se criar múltiplos `Telemetry` (um por ns) com taxas de sampling diferentes (ex: produção 1%, homologação 100%)
>
> **⚠️ Observação importante para Istio instalado via Helm `minimal`** (caso deste manual): apenas o `Telemetry` em `istio-system` (rootNamespace) **pode não bastar** para que os sidecars peguem o provider de tracing. Sintoma: depois de aplicar o `Telemetry` mesh-wide e reiniciar os apps, os sidecars mostram `random_sampling: 100` mas **não enviam spans** ao OTel Collector (o trace é amostrado mas descartado por falta de provider configurado no listener). Quando isso acontecer, criar **um `Telemetry` adicional no namespace de cada app** com a mesma config destrava o pipeline. Em perfis completos (`default`/`demo`) o rootNamespace funciona sozinho.
>
> **Recomendação prática:** crie sempre o `Telemetry` no(s) namespace(s) dos seus apps em vez de depender só do mesh-wide. Mesmo se mesh-wide funcionar na sua versão de Istio, o per-namespace é mais explícito e portável.

```yaml
# telemetry-tracing.yaml
apiVersion: telemetry.istio.io/v1
kind: Telemetry
metadata:
  name: tracing
  namespace: <NAMESPACE>           # escopo de aplicação (ver nota acima)
spec:
  tracing:
    - randomSamplingPercentage: <SAMPLING_PERCENTAGE>   # 0-100; só afeta traces, não métricas
      providers:
        - name: otel-tracing
```

```bash
kubectl apply -f telemetry-tracing.yaml
```

#### Cookbook — sampling diferente por namespace

Cenário comum: `PILOT_TRACE_SAMPLING=100` global (para dev/homolog) mas você quer **reduzir** o sampling em um ns específico (ex: produção). Crie um `Telemetry` **dentro do ns alvo** com a taxa desejada:

```yaml
# telemetry-producao.yaml
apiVersion: telemetry.istio.io/v1
kind: Telemetry
metadata:
  name: tracing
  namespace: producao             # ← escopo: só este ns
spec:
  tracing:
    - randomSamplingPercentage: 10   # 10% nos workloads do ns "producao"
      providers:
        - name: otel-tracing
```

```bash
kubectl apply -f telemetry-producao.yaml
kubectl -n producao rollout restart deploy <APP_DEPLOY>   # rebootstrap do sidecar
```

Resultado: `producao` em 10%, demais namespaces continuam em 100% (herdado do global).

Para refinar ainda mais (apenas um workload específico do ns), use `selector` no `Telemetry`:

```yaml
spec:
  selector:
    matchLabels:
      app: api-pagamentos          # só pods com esse label
  tracing:
    - randomSamplingPercentage: 50
      providers:
        - name: otel-tracing
```

Quanto mais específico o `Telemetry`, mais alta a prioridade na hierarquia.

> **Nota sobre sampling:** `randomSamplingPercentage: 100` captura 100% dos traces — adequado para ambientes de desenvolvimento/homologação. Em produção com alto volume de requisições, considere reduzir para `10` ou `1` para evitar overhead nos sidecars e volume excessivo no Jaeger/Elasticsearch. **Importante:** isso **não afeta** as métricas `istio_*` (RED) que o Kiali usa — métricas são sempre 100%.

> **⚠️ Caveat importante — `PILOT_TRACE_SAMPLING` no istiod sobrepõe o `Telemetry`.** O chart oficial do Istio define a env `PILOT_TRACE_SAMPLING=1` (1%) no Deployment do istiod por padrão. Em algumas versões do Istio (observado em 1.29), esse valor é injetado no bootstrap dos sidecars **antes** do `randomSamplingPercentage` do `Telemetry`, fazendo com que mesmo um `Telemetry` com `randomSamplingPercentage: 100` resulte em sidecar com `random_sampling: 1`. Sintoma: o Jaeger mostra apenas o serviço `jaeger` no dropdown "Service" (ver troubleshooting em `Cap7/03-jaeger.md`).
>
> **Para diagnosticar:**
>
> ```bash
> # Valor efetivo no istiod
> kubectl -n istio-system get deploy istiod -o jsonpath='{.spec.template.spec.containers[0].env[?(@.name=="PILOT_TRACE_SAMPLING")].value}'; echo
>
> # Valor efetivo num sidecar
> APP_POD=$(kubectl -n <APP_NS> get pod -l app=<APP> -o jsonpath='{.items[0].metadata.name}')
> kubectl -n <APP_NS> exec $APP_POD -c istio-proxy -- pilot-agent request GET 'config_dump' \
>   | grep -A3 '"random_sampling"' | head -5
> ```
>
> **Para corrigir** (ver `Cap1/Kubernets/8-istio.md`, seção B.5 para detalhes):
>
> ```bash
> # Persistente (helm):
> helm upgrade istiod istio/istiod -n istio-system \
>   --reuse-values --set pilot.traceSampling=100
>
> # Efêmero (kubectl):
> kubectl -n istio-system set env deploy/istiod PILOT_TRACE_SAMPLING=100
>
> # Em ambos, reiniciar os apps:
> kubectl -n <APP_NS> rollout restart deploy <APP_DEPLOY>
> ```
>
> **Estratégia recomendada para produção:** manter `PILOT_TRACE_SAMPLING=1` (default global baixo) e usar `Telemetry` em namespaces específicos onde se quer mais sampling. A hierarquia de prioridade é:
>
> ```
> [1] PILOT_TRACE_SAMPLING (global istiod)
>     ↓ sobreposto por (em versões onde o override funciona)
> [2] Telemetry no rootNamespace (istio-system) — mesh-wide
>     ↓ sobreposto por
> [3] Telemetry num namespace específico
>     ↓ sobreposto por
> [4] Telemetry com selector de workload
> ```

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

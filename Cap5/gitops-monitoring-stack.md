# GitOps da Stack de Monitoramento — Migrando o Cap7 para ArgoCD

## 🧭 Sobre este documento

Este guia descreve **como migrar a stack de observabilidade do Cap7 para um repositório Git gerenciado pelo ArgoCD**. Ele **não substitui** os tutoriais do Cap7 — é um caminho alternativo (e complementar) para quem prefere GitOps em vez de `kubectl apply` direto.

> **Quando seguir este guia:** depois que você já entendeu cada componente (Cap7) e quer levar tudo para produção via Git/ArgoCD.
>
> **Quando ficar no Cap7 sozinho:** ambiente de aprendizado, lab rápido, ou quando o Git/ArgoCD ainda não está pronto.

### Pré-requisitos

- Stack do Cap7 já entendida (idealmente já rodando manualmente)
- ArgoCD instalado (ver `Cap5/argocd.md`)
- GitLab acessível pelo ArgoCD (ver `Cap5/gitlabArgocd.md`)
- Sealed Secrets controller instalado (ver `Cap5/sealed-secrets.md`)
- IngressGateway do namespace de monitoramento gerenciado em repo separado (ex: `gw-monitor`)

### O que NÃO está no escopo deste repo

| Recurso | Onde fica | Motivo |
|---|---|---|
| `Gateway monitoring-gateway` (Istio) | repo `gw-monitor` | já é gerenciado lá |
| `VirtualService` (grafana, prometheus, alertmanager, loki, jaeger, kiali) | repo `gw-monitor` | idem |
| IngressGateway `monitor-ingressgateway` (Deployment + RBAC + Service) | repo `gw-monitor` | idem |
| `Deployment` das aplicações (wordpress, etc) | repo da app | responsabilidade de outro time |

---

## Estrutura do repositório

```
monitor-stack/
├── README.md
├── bootstrap/
│   ├── root-app.yaml                         # Application app-of-apps
│   └── projects.yaml                         # AppProject ArgoCD (opcional)
│
├── values/                                   # values.yaml para Helm Apps
│   ├── kube-prometheus-stack.yaml
│   ├── istio-base.yaml
│   ├── istiod.yaml                           # contém pilot.traceSampling=100
│   ├── istio-cni.yaml
│   ├── loki.yaml                             # se usar via Helm
│   └── sealed-secrets.yaml                   # se preferir mover o controller pra GitOps também
│
└── apps/
    ├── infra/                                # sync-wave -10  (CRDs e control plane)
    │   ├── istio-base.yaml                   # Helm Application
    │   ├── istiod.yaml                       # Helm Application
    │   └── istio-cni.yaml                    # Helm Application
    │
    ├── platform/                             # sync-wave 0   (operadores)
    │   └── kube-prometheus-stack.yaml        # Helm Application
    │
    ├── observability/                        # sync-wave 10  (backends de observação)
    │   ├── elasticsearch/
    │   │   ├── kustomization.yaml
    │   │   ├── serviceaccount.yaml
    │   │   ├── configmap.yaml
    │   │   ├── service-headless.yaml
    │   │   ├── service-http.yaml
    │   │   └── statefulset.yaml
    │   │
    │   ├── minio/
    │   │   ├── kustomization.yaml
    │   │   ├── credentials-sealed.yaml       # ⚡ SealedSecret (cifrado)
    │   │   ├── pvc.yaml
    │   │   ├── service.yaml
    │   │   ├── destinationrule.yaml
    │   │   ├── deployment.yaml
    │   │   └── job-create-buckets.yaml
    │   │
    │   ├── loki/
    │   │   ├── kustomization.yaml
    │   │   ├── configmap.yaml
    │   │   ├── service.yaml
    │   │   ├── destinationrules.yaml
    │   │   └── deployment.yaml
    │   │
    │   ├── promtail/
    │   │   ├── kustomization.yaml
    │   │   ├── serviceaccount.yaml
    │   │   ├── rbac.yaml
    │   │   ├── configmap.yaml
    │   │   └── daemonset.yaml
    │   │
    │   ├── jaeger/
    │   │   ├── kustomization.yaml
    │   │   ├── configmap.yaml
    │   │   ├── service.yaml
    │   │   └── deployment.yaml
    │   │
    │   ├── otel-collector/
    │   │   ├── kustomization.yaml
    │   │   ├── configmap.yaml
    │   │   ├── service.yaml
    │   │   ├── destinationrule.yaml
    │   │   ├── deployment.yaml
    │   │   └── servicemonitor-spm.yaml       # ⚡ NÃO esquecer (gera SPM no Jaeger)
    │   │
    │   └── kiali/
    │       ├── kustomization.yaml
    │       ├── rbac.yaml                     # ⚡ inclui gatewayclasses + backendtlspolicies
    │       ├── signing-key-sealed.yaml       # ⚡ SealedSecret
    │       ├── config-sealed.yaml            # ⚡ SealedSecret (substitui o ConfigMap antigo)
    │       ├── service.yaml
    │       └── deployment.yaml               # ⚡ volume aponta para Secret, não ConfigMap
    │
    ├── istio-config/                         # sync-wave 15  (configuração de mesh)
    │   ├── kustomization.yaml
    │   ├── meshconfig-extension-providers.yaml   # patch ou Application sobre cm istio
    │   ├── envoyfilter-basic-auth-sealed.yaml    # ⚡ SealedSecret (header Basic Auth)
    │   ├── envoyfilter-basic-auth.yaml            # filtro Lua que lê o Secret
    │   ├── podmonitor-envoy-stats.yaml            # ⚡ coleta istio_requests_total
    │   └── servicemonitor-istiod.yaml             # métricas do control plane
    │
    ├── tls/                                  # sync-wave -5   (certificados TLS)
    │   └── tls-tatulab-sealed.yaml           # ⚡ SealedSecret (cert + chave)
    │
    └── tracing/                              # sync-wave 20  (Telemetry)
        ├── kustomization.yaml
        ├── telemetry-prometheus-stats.yaml   # métricas (em istio-system)
        ├── telemetry-mesh-wide-tracing.yaml  # traces mesh-wide (istio-system)
        └── per-namespace/
            ├── README.md                     # cookbook para adicionar novo ns
            ├── telemetry-wordpress.yaml      # Telemetry/wordpress/tracing
            └── telemetry-<outro-ns>.yaml
```

---

## Ordem de aplicação (sync waves)

| Wave | Pasta | Recursos |
|---|---|---|
| **`-10`** | `apps/infra/` | `istio-base`, `istiod`, `istio-cni` (CRDs Istio + control plane) |
| **`-5`** | `apps/tls/` | TLS Secrets necessários antes do Gateway aceitar conexões HTTPS |
| **`0`** | `apps/platform/` | `kube-prometheus-stack` (Operator + CRDs ServiceMonitor/PodMonitor) |
| **`10`** | `apps/observability/` | Elasticsearch, MinIO, Loki, Promtail, Jaeger, OTel Collector, Kiali |
| **`15`** | `apps/istio-config/` | MeshConfig extensionProviders, EnvoyFilter Basic Auth, Pod/ServiceMonitor Istio |
| **`20`** | `apps/tracing/` | Telemetry resources (mesh-wide e per-namespace) |

Anotação no `Application` do ArgoCD:

```yaml
metadata:
  annotations:
    argocd.argoproj.io/sync-wave: "10"
```

---

## Refactors em relação ao Cap7

A estrutura GitOps tem algumas diferenças em relação ao "kubectl apply direto" do Cap7. Cada uma é necessária pra evitar **drift** (estado divergente entre cluster e Git) e pra esconder credenciais.

### 1. Senha do Grafana fora do ConfigMap do Kiali

**No Cap7** (seção 1.3 do `Cap7/05-kiali.md`): a senha do Grafana fica em texto puro no ConfigMap `kiali`.

**Em GitOps:** o ConfigMap inteiro vira um **Secret** (que aceita o mesmo `config.yaml` em `data` ou `stringData`). O Secret é selado com `kubeseal`. O Deployment monta o Secret em vez do ConfigMap.

**Mudança no Deployment** (`apps/observability/kiali/deployment.yaml`):

```yaml
# Antes (Cap7):
volumes:
- name: kiali-config
  configMap:
    name: kiali

# Depois (GitOps):
volumes:
- name: kiali-config
  secret:
    secretName: kiali-config        # SealedSecret com config.yaml dentro
    defaultMode: 0440
```

O `volumeMount` em `/kiali-configuration` continua igual — o Kiali não enxerga diferença.

### 2. `PILOT_TRACE_SAMPLING` persistido no values do Helm

**No Cap7** (`Cap1/Kubernets/8-istio.md`): você pode setar via `kubectl -n istio-system set env deploy/istiod PILOT_TRACE_SAMPLING=100` — funciona, mas é **efêmero** (volta ao default no próximo `helm upgrade`).

**Em GitOps:** o valor fica em `values/istiod.yaml`:

```yaml
# values/istiod.yaml
pilot:
  cni:
    enabled: true
  traceSampling: 100              # ← persistente
```

O `Application` ArgoCD do istiod aponta para este values:

```yaml
# apps/infra/istiod.yaml (Application do ArgoCD)
spec:
  source:
    chart: istiod
    repoURL: https://istio-release.storage.googleapis.com/charts
    targetRevision: 1.29.2
    helm:
      valueFiles:
        - $values/values/istiod.yaml
```

### 3. ClusterRole do Kiali com `gatewayclasses`

**No Cap7** (`Cap7/05-kiali.md` seção 1.1): a versão correta do ClusterRole **já inclui** `gatewayclasses` e `backendtlspolicies` (foi adicionado em revisão posterior do manual). Em clusters pré-existentes, foi aplicado via patch:

```bash
kubectl patch clusterrole kiali --type=json -p '[{"op":"add", ...]'
```

**Em GitOps:** garantir que o `apps/observability/kiali/rbac.yaml` no Git **já contém** essas regras. Sem isso, o ArgoCD vai sobrescrever o patch e o Kiali volta a travar em loading.

### 4. EnvoyFilter Basic Auth com header em SealedSecret

**No Cap7:** o header `Basic <base64>` fica hardcoded no manifesto do EnvoyFilter.

**Em GitOps:** o header vai pra um Secret (selado), e o EnvoyFilter referencia via `valueFrom` dentro de uma `EnvoyFilter` patch que injeta a config.

(Padrão é mais elaborado — documentado em detalhe na pasta `apps/istio-config/` do repo final.)

### 5. Telemetry sempre per-namespace, não só mesh-wide

**No Cap7** (`Cap7/06-istio-meshconfig.md`): originalmente sugeria criar `Telemetry` apenas em `istio-system` (mesh-wide). Em revisão posterior, descobrimos que **em Istio Helm minimal, o mesh-wide pode não bastar** — precisa criar Telemetry **também no namespace de cada app**.

**Em GitOps:** a pasta `apps/tracing/per-namespace/` mantém um arquivo por namespace, deixando explícito quem está habilitado. Quando um novo namespace entra no mesh:

1. Time da app cria o ns com `istio-injection=enabled`
2. PR no `monitor-stack` adicionando `apps/tracing/per-namespace/telemetry-<ns>.yaml`
3. ArgoCD aplica automaticamente

### 6. Secrets nunca em texto puro

Todo secret (signing-key, MinIO credentials, TLS, header Basic Auth, Grafana admin password) vira `SealedSecret`. Ver `Cap5/sealed-secrets.md` para o workflow completo.

---

## Bootstrap do repo

### 1. Criar o repo no GitLab

```
https://gitlab.tatulab.com.br/tatu/monitor-stack
```

### 2. Estrutura inicial localmente

```bash
git clone git@gitlab.tatulab.com.br:tatu/monitor-stack.git
cd monitor-stack
mkdir -p bootstrap values apps/{infra,platform,observability,istio-config,tls,tracing/per-namespace}
mkdir -p apps/observability/{elasticsearch,minio,loki,promtail,jaeger,otel-collector,kiali}
```

### 3. Conectar o repo ao ArgoCD

Se ainda não está conectado (já tem alguns repos do GitLab configurados):

```bash
kubectl apply -n argocd -f - <<EOF
apiVersion: v1
kind: Secret
metadata:
  name: repo-monitor-stack
  namespace: argocd
  labels:
    argocd.argoproj.io/secret-type: repository
stringData:
  type: git
  url: https://gitlab.tatulab.com.br/tatu/monitor-stack.git
  username: <USUARIO_GITLAB>
  password: <TOKEN_DEPLOY_GITLAB>
EOF
```

### 4. Aplicar o `root-app.yaml` (app-of-apps)

```yaml
# bootstrap/root-app.yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: monitor-stack-root
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://gitlab.tatulab.com.br/tatu/monitor-stack.git
    targetRevision: main
    path: apps
    directory:
      recurse: true
  destination:
    server: https://kubernetes.default.svc
    namespace: argocd
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    syncOptions:
      - CreateNamespace=true
      - ServerSideApply=true
```

```bash
kubectl apply -f bootstrap/root-app.yaml
```

A partir daqui o ArgoCD descobre todas as `Application` filhas dentro de `apps/` e aplica em ordem de sync wave.

---

## Migração do cluster atual (sem downtime)

Como você já tem a stack rodando do Cap7, a migração é incremental:

### Fase A — Não destrutiva (pode ser feita com cluster vivo)

1. **Bootstrap do repo** (passos acima)
2. **Importar manifestos atuais** com `kubectl get -o yaml`, limpar metadata transitória, commitar
3. **Aplicar Sealed Secrets controller via Helm** se ainda não foi
4. **Selar todos os secrets** existentes (ver `Cap5/sealed-secrets.md`)
5. **Criar `Application`s** no ArgoCD apontando pra cada pasta — começar com `syncPolicy.automated: false` pra revisar diff antes
6. **`argocd app diff`** pra cada Application — confirmar que não há drift inesperado

### Fase B — Cutover (com automated sync)

7. Habilitar `automated.selfHeal: true` em cada Application uma a uma
8. Validar que cada componente continua saudável após o sync
9. Apagar artefatos manuais antigos (ex: ConfigMap `kiali` antigo após Secret `kiali-config` estar funcionando)

### Fase C — Pós-migração

10. Documentar este repo no README do GitLab
11. Adicionar branch protection (`main` requer PR)
12. CI no GitLab pra validar manifestos (`kubeval`, `kustomize build`, etc) antes do merge

---

## Drift conhecido entre cluster atual e Git

Itens que provavelmente foram alterados manualmente durante o debug e precisam estar refletidos no Git para evitar `OutOfSync`:

| Recurso | Mudança manual | Onde refletir no Git |
|---|---|---|
| `deploy/istiod` env `PILOT_TRACE_SAMPLING=100` | `kubectl set env` | `values/istiod.yaml` → `pilot.traceSampling: 100` |
| `clusterrole/kiali` | `kubectl patch` adicionando `gatewayclasses`, `backendtlspolicies` | `apps/observability/kiali/rbac.yaml` |
| `cm/kiali` | `kubectl edit` para corrigir nomes de Service e remover `in_cluster_url` deprecado | `apps/observability/kiali/config-sealed.yaml` (Secret) |
| `cm/istio` (istio-system) | `kubectl edit` substituindo `<OTEL_SERVICE>` e `<OTEL_PORT>` | `apps/istio-config/meshconfig-extension-providers.yaml` |
| `Telemetry/wordpress/tracing` | aplicado fora do Cap7 | `apps/tracing/per-namespace/telemetry-wordpress.yaml` |

Conferir cada item antes do primeiro sync com `automated`.

---

## Referências

- [ArgoCD — App-of-Apps Pattern](https://argo-cd.readthedocs.io/en/stable/operator-manual/cluster-bootstrapping/)
- [ArgoCD — Sync Waves](https://argo-cd.readthedocs.io/en/stable/user-guide/sync-waves/)
- [Sealed Secrets](Cap5/sealed-secrets.md)
- [ArgoCD instalação](Cap5/argocd.md)
- [GitLab + ArgoCD](Cap5/gitlabArgocd.md)
- [Cap7 — Stack original](../Cap7/README.md)

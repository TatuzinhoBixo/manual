# Kiali — Stack de Observabilidade Kubernetes

## 🧭 Onde este tutorial entra na stack

O Kiali tem **três funcionalidades principais** que dependem de fontes de dados diferentes. Saber quem alimenta o quê evita travar nos próximos passos:

| Aba do Kiali              | Fonte dos dados                                  | Pré-requisito                                                                  |
| ------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------ |
| **Overview / Mesh / Apps** | API do Kubernetes                                | Sidecars injetados nos namespaces alvos (`istio-injection=enabled`)            |
| **Traffic Graph**         | Métricas `istio_requests_total` no Prometheus    | Telemetry de **métricas** + PodMonitor (este tutorial — **Apêndice A**)        |
| **Traces (integração)**   | Jaeger UI (`internal_url` no ConfigMap)          | Pipeline de tracing completo (`Cap7/06-istio-meshconfig.md` + `04-otel-collector.md`) |

```
                    ┌─────────────────────────────────────────────┐
                    │        Kiali UI (este tutorial)             │
                    └────────┬───────────┬─────────────────┬──────┘
                             │           │                 │
                       Mesh/Apps    Traffic Graph         Traces
                             │           │                 │
                             ▼           ▼                 ▼
                       Kubernetes  Prometheus          Jaeger UI
                          API     (istio_requests_total)   ▲
                                          ▲                │
                              ┌───────────┘                │
                              │                            │
                       PodMonitor envoy-stats        Pipeline tracing
                       (Apêndice A deste arquivo)    (Cap7/04 + 06)
```

**Ordem recomendada:** `01` → `02` → `03` → `04` → `05` (este) → `06`. Quando este tutorial terminar, o Kiali estará rodando — mas as abas Traffic Graph e Traces só populam depois que `06-istio-meshconfig.md` for aplicado.

---

## Descrição Geral

O Kiali é o console de observabilidade do Istio service mesh. Ele fornece visualização do tráfego entre serviços, topologia de malha, validação de configurações Istio e integração com Grafana, Prometheus e Jaeger.

Nesta stack, o Kiali é protegido por autenticação via token e, adicionalmente, por um **EnvoyFilter de Basic Auth** aplicado no IngressGateway, que restringe o acesso externo a `kiali.<DOMAIN>` e `jaeger.<DOMAIN>` sem autenticação prévia.

### Integrações

| Serviço    | URL interna                                            | Finalidade          |
| ---------- | ------------------------------------------------------ | ------------------- |
| Prometheus | `http://prometheus.<NAMESPACE>.svc.cluster.local:9090` | Métricas de malha   |
| Grafana    | `http://grafana.<NAMESPACE>.svc.cluster.local:3000`    | Dashboards Istio    |
| Jaeger     | `http://jaeger.<NAMESPACE>.svc.cluster.local:16686`    | Traces distribuídos |

---

## Tabela de Variáveis

| Variável                   | Descrição                                         | Exemplo                  |
| -------------------------- | ------------------------------------------------- | ------------------------ |
| `<NAMESPACE>`              | Namespace de observabilidade                      | `observability`          |
| `<DOMAIN>`                 | Domínio base                                      | `example.com`            |
| `<TLS_SECRET_NAME>`        | Nome do secret TLS no namespace `istio-system`    | `tls-example`            |
| `<KIALI_SIGNING_KEY>`      | Chave de assinatura de tokens JWT (mín. 16 chars) | —                        |
| `<GRAFANA_ADMIN_PASSWORD>` | Senha do admin do Grafana                         | —                        |
| `<BASIC_AUTH_B64>`         | Credencial Basic Auth em base64 (`usuario:senha`) | —                        |
| `<BASIC_AUTH_HEADER>`      | Valor completo do header Authorization            | `Basic <BASIC_AUTH_B64>` |

---

## Pré-requisitos

- Namespace `<NAMESPACE>` criado no cluster
- Istio instalado (versão 1.29+) com sidecar injection habilitado no namespace
- Secret TLS `<TLS_SECRET_NAME>` criado no namespace `istio-system`
- DNS apontando `kiali.<DOMAIN>` para o IP do Istio IngressGateway
- Prometheus, Grafana e Jaeger implantados no mesmo namespace (ver tutoriais respectivos)
- **Métricas `istio_*` sendo geradas e coletadas** (ver Apêndice A no fim deste documento). Sem isso, a tela "Traffic Graph" do Kiali fica vazia mesmo com o serviço subindo. Requer:
  - Recurso `Telemetry` no `istio-system` (faz os sidecars exportarem stats Prometheus)
  - `PodMonitor` para os sidecars Envoy (porta 15090)
  - `ServiceMonitor` para o `istiod`

---

## Etapas

### Parte 1 — Kiali

#### 1.1 Criar o ServiceAccount e RBAC

```yaml
# kiali-rbac.yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: kiali
  namespace: <NAMESPACE>
  labels:
    app: kiali
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: kiali
  labels:
    app: kiali
rules:
  - apiGroups: [""]
    resources:
      - configmaps
      - endpoints
      - pods
      - pods/log
      - pods/proxy
      - namespaces
      - nodes
      - replicationcontrollers
      - services
    verbs: ["get", "list", "watch"]
  - apiGroups: [""]
    resources:
      - pods/portforward
    verbs: ["create", "get"]
  - apiGroups: ["apps"]
    resources:
      - deployments
      - daemonsets
      - replicasets
      - statefulsets
    verbs: ["get", "list", "watch"]
  - apiGroups: ["batch"]
    resources:
      - jobs
      - cronjobs
    verbs: ["get", "list", "watch"]
  - apiGroups: ["networking.istio.io", "security.istio.io", "telemetry.istio.io", "extensions.istio.io"]
    resources: ["*"]
    verbs: ["get", "list", "watch", "create", "delete", "patch"]
  - apiGroups: ["authentication.istio.io", "config.istio.io"]
    resources: ["*"]
    verbs: ["get", "list", "watch"]
  - apiGroups: ["networking.k8s.io"]
    resources: ["ingresses"]
    verbs: ["get", "list", "watch"]
  - apiGroups: ["autoscaling"]
    resources: ["horizontalpodautoscalers"]
    verbs: ["get", "list", "watch"]
  - apiGroups: ["gateway.networking.k8s.io"]
    resources:
      - gateways
      - gatewayclasses        # IMPORTANTE: sem isso, o Kiali entra em loop "Shutting down cache" e a UI fica em loading eterno
      - httproutes
      - grpcroutes
      - referencegrants
      - backendtlspolicies
    verbs: ["get", "list", "watch"]
  - apiGroups: ["admissionregistration.k8s.io"]
    resources:
      - mutatingwebhookconfigurations   # opcional — silencia o warning "Unable to list webhooks" nos logs
    verbs: ["get", "list", "watch"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: kiali
  labels:
    app: kiali
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: kiali
subjects:
  - kind: ServiceAccount
    name: kiali
    namespace: <NAMESPACE>
```

```bash
kubectl apply -f kiali-rbac.yaml
```

---

#### 1.2 Criar o Secret da chave de assinatura

> **⚠️ Atenção ao tamanho da chave:** o Kiali exige que a `signing-key` tenha **exatamente 16, 24 ou 32 caracteres** (ele lê o valor literal, não o conteúdo decodificado). Se usar `openssl rand -base64 32` o resultado tem 44 caracteres e o pod entra em **CrashLoopBackOff** com `invalid configuration: signing key for sessions must be 16, 24 or 32 bytes length`.
>
> **Recomendado:** `openssl rand -hex 16` → gera 32 caracteres hexadecimais (válido).

```bash
# Gerar a chave (32 caracteres hex)
openssl rand -hex 16
# exemplo: d936b7e4574ea4e93d1bb14a3f06e122
```

> **Recomendação para produção:** utilize Sealed Secrets para não versionar a chave em texto no Git.
>
> ```bash
> kubectl create secret generic kiali-signing-key \
>   --from-literal=signing-key='<KIALI_SIGNING_KEY>' \
>   --namespace <NAMESPACE> \
>   --dry-run=client -o yaml | \
>   kubeseal --format yaml > kiali-signing-key-sealed.yaml
>
> kubectl apply -f kiali-signing-key-sealed.yaml
> ```

```yaml
# kiali-secret.yaml
apiVersion: v1
kind: Secret
metadata:
  name: kiali-signing-key
  namespace: <NAMESPACE>
  labels:
    app: kiali
type: Opaque
stringData:
  signing-key: "<KIALI_SIGNING_KEY>" # 16, 24 ou 32 caracteres exatos — ex: d936b7e4574ea4e93d1bb14a3f06e122
```

> **Importante:** o valor da `signing_key` no ConfigMap (seção 1.3) **deve ser idêntico** ao `signing-key` deste Secret. Se houver divergência, o login retorna erro de sessão. Pra verificar:
>
> ```bash
> kubectl -n <NAMESPACE> get cm kiali -o jsonpath='{.data.config\.yaml}' | grep signing_key
> kubectl -n <NAMESPACE> get secret kiali-signing-key -o jsonpath='{.data.signing-key}' | base64 -d; echo
> ```

```bash
kubectl apply -f kiali-secret.yaml
```

---

#### 1.3 Criar o ConfigMap de configuração

> **Nota:** O `signing_key` no ConfigMap deve ser o mesmo valor definido no Secret e na env `LOGIN_TOKEN_SIGNING_KEY` do Deployment.

```yaml
# kiali-configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: kiali
  namespace: <NAMESPACE>
  labels:
    app: kiali
data:
  config.yaml: |
    auth:
      strategy: token
    login_token:
      signing_key: "<KIALI_SIGNING_KEY>"
    deployment:
      accessible_namespaces:
        - "**"
    external_services:
      prometheus:
        url: http://prometheus.<NAMESPACE>.svc.cluster.local:9090
      grafana:
        enabled: true
        auth:
          type: basic
          username: admin
          password: "<GRAFANA_ADMIN_PASSWORD>"
        internal_url: http://grafana.<NAMESPACE>.svc.cluster.local:3000
        in_cluster_url: http://grafana.<NAMESPACE>.svc.cluster.local:3000
        url: https://grafana.<DOMAIN>
        dashboards:
          - name: "Istio Service Dashboard"
            variables:
              namespace: "var-namespace"
              service: "var-service"
          - name: "Istio Workload Dashboard"
            variables:
              namespace: "var-namespace"
              workload: "var-workload"
          - name: "Istio Mesh Dashboard"
          - name: "Istio Performance Dashboard"
      tracing:
        enabled: true
        internal_url: http://jaeger.<NAMESPACE>.svc.cluster.local:16686
        in_cluster_url: http://jaeger.<NAMESPACE>.svc.cluster.local:16686
        use_grpc: false
      istio:
        component_status:
          enabled: true
          components:
            - app_label: istiod
              is_core: true
              namespace: istio-system
        config_map_name: istio
        root_namespace: istio-system
    istio_namespace: istio-system
    server:
      port: 20001
      web_root: /kiali
```

```bash
kubectl apply -f kiali-configmap.yaml
```

---

#### 1.4 Criar o Service

```yaml
# kiali-service.yaml
apiVersion: v1
kind: Service
metadata:
  name: kiali
  namespace: <NAMESPACE>
  labels:
    app: kiali
spec:
  type: ClusterIP
  selector:
    app: kiali
  ports:
    - name: http
      port: 20001
      targetPort: 20001
      protocol: TCP
    - name: metrics
      port: 9090
      targetPort: 9090
      protocol: TCP
```

```bash
kubectl apply -f kiali-service.yaml
```

---

#### 1.5 Criar o Deployment

> **Nota:** Imagem fixada em `quay.io/kiali/kiali:v2.2`. Verifique a versão mais recente em https://quay.io/repository/kiali/kiali?tab=tags antes de implantar em produção.

```yaml
# kiali-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: kiali
  namespace: <NAMESPACE>
  labels:
    app: kiali
    app.kubernetes.io/name: kiali
spec:
  replicas: 1
  selector:
    matchLabels:
      app: kiali
  template:
    metadata:
      labels:
        app: kiali
        sidecar.istio.io/inject: "true"
      annotations:
        prometheus.io/scrape: "true"
        prometheus.io/port: "9090"
    spec:
      serviceAccountName: kiali
      containers:
        - name: kiali
          image: quay.io/kiali/kiali:v2.2 # verifique a versão mais recente
          command:
            - "/opt/kiali/kiali"
            - "-config"
            - "/kiali-configuration/config.yaml"
          ports:
            - containerPort: 20001
              name: http
            - containerPort: 9090
              name: metrics
          env:
            - name: LOGIN_TOKEN_SIGNING_KEY
              valueFrom:
                secretKeyRef:
                  name: kiali-signing-key
                  key: signing-key
          resources:
            requests:
              cpu: 100m
              memory: 128Mi
            limits:
              cpu: 500m
              memory: 512Mi
          readinessProbe:
            httpGet:
              path: /kiali/healthz
              port: 20001
              scheme: HTTP
            initialDelaySeconds: 10
            periodSeconds: 10
          livenessProbe:
            httpGet:
              path: /kiali/healthz
              port: 20001
              scheme: HTTP
            initialDelaySeconds: 15
            periodSeconds: 30
          volumeMounts:
            - name: kiali-config
              mountPath: /kiali-configuration
      volumes:
        - name: kiali-config
          configMap:
            name: kiali
```

```bash
kubectl apply -f kiali-deployment.yaml
```

---

#### 1.6 Criar o Istio Gateway e VirtualService

```yaml
# kiali-istio.yaml
apiVersion: networking.istio.io/v1
kind: Gateway
metadata:
  name: kiali-gateway
  namespace: <NAMESPACE>
spec:
  selector:
    app: observability-ingressgateway
    istio: ingressgateway
  servers:
    - hosts:
        - kiali.<DOMAIN>
      port:
        name: http
        number: 80
        protocol: HTTP
      tls:
        httpsRedirect: true
    - hosts:
        - kiali.<DOMAIN>
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
  name: kiali-ui
  namespace: <NAMESPACE>
spec:
  gateways:
    - kiali-gateway
  hosts:
    - kiali.<DOMAIN>
  http:
    - match:
        - uri:
            prefix: /
      route:
        - destination:
            host: kiali.<NAMESPACE>.svc.cluster.local
            port:
              number: 20001
```

```bash
kubectl apply -f kiali-istio.yaml
```

---

### Parte 2 — EnvoyFilter Basic Auth

O EnvoyFilter aplica autenticação HTTP Basic diretamente no IngressGateway do Istio via filtro Lua. Ele protege `kiali.<DOMAIN>` e `jaeger.<DOMAIN>` contra acesso não autenticado, sem depender de um componente externo de autenticação.

> **Atenção:** O filtro aplica a todos os hosts que passam pelo IngressGateway com label `app: observability-ingressgateway`. Outros hosts não são afetados.

#### 2.1 Gerar as credenciais

```bash
# Gerar o valor base64 no formato usuario:senha
echo -n 'admin:SuaSenhaAqui' | base64
# Exemplo de saída: YWRtaW46U3VhU2VuaGFBcXVp

# O valor completo do header será: Basic YWRtaW46U3VhU2VuaGFBcXVp
```

> **Importante:** Substitua `<BASIC_AUTH_B64>` pelo valor gerado acima e `<BASIC_AUTH_HEADER>` pelo valor completo `Basic <BASIC_AUTH_B64>`.

---

#### 2.2 Criar o EnvoyFilter

```yaml
# envoyfilter-basic-auth.yaml
apiVersion: networking.istio.io/v1alpha3
kind: EnvoyFilter
metadata:
  name: basic-auth
  namespace: <NAMESPACE>
spec:
  workloadSelector:
    labels:
      app: observability-ingressgateway
  configPatches:
    - applyTo: HTTP_FILTER
      match:
        context: GATEWAY
        listener:
          filterChain:
            filter:
              name: envoy.filters.network.http_connection_manager
              subFilter:
                name: envoy.filters.http.router
      patch:
        operation: INSERT_BEFORE
        value:
          name: envoy.lua.basic_auth
          typed_config:
            "@type": type.googleapis.com/envoy.extensions.filters.http.lua.v3.Lua
            inline_code: |
              function envoy_on_request(request_handle)
                local host = request_handle:headers():get(":authority")
                if host == nil then
                  return
                end
                -- Remove porta do host se presente
                local hostname = host:match("^([^:]+)")
                -- Aplica autenticação apenas para kiali e jaeger
                if hostname ~= "kiali.<DOMAIN>" and hostname ~= "jaeger.<DOMAIN>" then
                  return
                end
                local auth = request_handle:headers():get("authorization")
                if auth == nil then
                  request_handle:respond(
                    {[":status"] = "401", ["www-authenticate"] = "Basic realm=\"Restricted\""},
                    "Unauthorized\n"
                  )
                  return
                end
                -- Valor esperado: Basic <BASIC_AUTH_B64>
                if auth ~= "<BASIC_AUTH_HEADER>" then
                  request_handle:respond(
                    {[":status"] = "401", ["www-authenticate"] = "Basic realm=\"Restricted\""},
                    "Unauthorized\n"
                  )
                  return
                end
              end
```

```bash
kubectl apply -f envoyfilter-basic-auth.yaml
```

---

#### 2.3 Verificar aplicação do filtro

```bash
# Verificar se o EnvoyFilter foi criado
kubectl get envoyfilter basic-auth -n <NAMESPACE>

# Testar acesso sem credenciais (deve retornar 401)
curl -I https://kiali.<DOMAIN>

# Testar acesso com credenciais corretas (deve retornar 200)
curl -I -u admin:SuaSenhaAqui https://kiali.<DOMAIN>
```

---

## Tabela de Parâmetros Importantes

| Parâmetro                         | Localização                 | Descrição                                                                               |
| --------------------------------- | --------------------------- | --------------------------------------------------------------------------------------- |
| `auth.strategy`                   | `kiali` ConfigMap           | Modo de autenticação. `token` exige login via token gerado pelo Kiali                   |
| `login_token.signing_key`         | `kiali` ConfigMap           | Chave de assinatura JWT. Deve ter mínimo 16 caracteres                                  |
| `LOGIN_TOKEN_SIGNING_KEY`         | Deployment → env            | Deve ser idêntico ao `signing_key` do ConfigMap. Injetado via Secret                    |
| `accessible_namespaces: ["**"]`   | `kiali` ConfigMap           | Permite ao Kiali visualizar todos os namespaces do cluster                              |
| `use_grpc: false`                 | `external_services.tracing` | Desabilita gRPC para Jaeger; usa HTTP na porta 16686                                    |
| `sidecar.istio.io/inject: "true"` | Deployment Kiali            | Kiali roda com sidecar Istio para participar da malha                                   |
| `workloadSelector`                | EnvoyFilter                 | Aplica o filtro somente ao IngressGateway com label `app: observability-ingressgateway` |
| `INSERT_BEFORE`                   | EnvoyFilter → patch         | Insere o filtro Lua antes do router, garantindo execução antes do roteamento            |

---

## Comandos Úteis

```bash
# Status do pod
kubectl get pod -n <NAMESPACE> -l app=kiali

# Logs do Kiali
kubectl logs -n <NAMESPACE> -l app=kiali --tail=100 -f

# Verificar configuração carregada
kubectl port-forward -n <NAMESPACE> svc/kiali 20001:20001
# Acessar: http://localhost:20001/kiali

# Gerar token de acesso para login
kubectl create token kiali -n <NAMESPACE>

# Verificar EnvoyFilter aplicado
kubectl get envoyfilter -n <NAMESPACE>
kubectl describe envoyfilter basic-auth -n <NAMESPACE>

# Testar Basic Auth
curl -I https://kiali.<DOMAIN>                        # deve retornar 401
curl -I -u admin:SuaSenha https://kiali.<DOMAIN>      # deve retornar 200/302

# Rollout restart
kubectl rollout restart deployment/kiali -n <NAMESPACE>
```

---

## Troubleshooting

### Kiali não conecta ao Prometheus

```bash
kubectl logs -n <NAMESPACE> -l app=kiali | grep -i prometheus
```

Verificar se o Service `prometheus` está acessível:

```bash
kubectl exec -n <NAMESPACE> deploy/kiali -- curl -s http://prometheus.<NAMESPACE>.svc.cluster.local:9090/-/ready
```

---

### Kiali não exibe traces do Jaeger

Verificar se `use_grpc: false` está no ConfigMap e se o Jaeger responde na porta 16686:

```bash
kubectl exec -n <NAMESPACE> deploy/kiali -- curl -s http://jaeger.<NAMESPACE>.svc.cluster.local:16686/api/services
```

---

### Login com token retorna erro

Verificar se o `signing_key` no ConfigMap e o valor da env `LOGIN_TOKEN_SIGNING_KEY` são idênticos:

```bash
kubectl get configmap kiali -n <NAMESPACE> -o jsonpath='{.data.config\.yaml}' | grep signing_key
kubectl get secret kiali-signing-key -n <NAMESPACE> -o jsonpath='{.data.signing-key}' | base64 -d
```

---

### EnvoyFilter retorna 401 mesmo com credenciais corretas

O valor `<BASIC_AUTH_HEADER>` deve ser exatamente `Basic ` seguido do base64 de `usuario:senha` sem quebra de linha:

```bash
# Verificar o valor gerado
echo -n 'admin:SuaSenha' | base64

# O header correto é: Basic <valor_acima>
# Sem espaços extras, sem quebra de linha
```

---

### Grafana dashboards não aparecem no Kiali

Verificar se os nomes dos dashboards no ConfigMap correspondem exatamente aos dashboards instalados no Grafana. Os dashboards Istio padrão são importados via ID no Grafana (ver tutorial: `01-kube-prometheus-stack.md`).

---

### Traffic Graph vazio ("There is currently no graph available...")

Sintoma: Kiali está rodando, namespaces aparecem, mas o **Traffic Graph** mostra "no graph available for the selected namespaces" mesmo com tráfego no cluster.

Causa: as métricas `istio_requests_total` não existem no Prometheus. Diagnóstico em 3 passos:

```bash
# 1. A métrica existe no Prometheus?
kubectl run -n <NAMESPACE> --rm -i --restart=Never q --image=curlimages/curl --command -- \
  curl -s 'http://<PROMETHEUS_SVC>.<NAMESPACE>.svc.cluster.local:9090/api/v1/query?query=count(istio_requests_total)'
# Esperado: {"value":[..., "<numero>"]}  — se vier "result":[] está vazio

# 2. O sidecar de algum app injetado está produzindo a métrica?
POD_IP=$(kubectl -n <APP_NS> get pod <APP_POD> -o jsonpath='{.status.podIP}')
kubectl run -n <APP_NS> --rm -i --restart=Never probe --image=curlimages/curl --command -- \
  curl -s http://$POD_IP:15090/stats/prometheus | grep -c '^istio_'
# Se retornar 0 → o sidecar não tem o filtro de stats (falta o recurso Telemetry)
# Se retornar > 0 mas Prometheus não vê → falta o PodMonitor

# 3. Os jobs do Prometheus incluem envoy-stats?
kubectl run -n <NAMESPACE> --rm -i --restart=Never q --image=curlimages/curl --command -- \
  curl -s 'http://<PROMETHEUS_SVC>.<NAMESPACE>.svc.cluster.local:9090/api/v1/targets?state=active' \
  | grep -oE '"job":"[^"]*"' | sort -u | grep -iE 'envoy|istio'
```

Soluções:

- **Sidecar não produz `istio_*`** → aplicar o recurso `Telemetry` (ver Apêndice A.1)
- **Prometheus não scrapeia sidecar** → aplicar o `PodMonitor envoy-stats-monitor` (ver Apêndice A.2)
- **Targets do envoy aparecem mas estão `down` com `404 Not Found`** → o relabel está usando porta errada (ex: 15021); o PodMonitor precisa **forçar** porta `15090` (ver Apêndice A.2)

---

### UI fica em loading eterno após login

Sintoma: o login passa, mas a UI nunca carrega completamente (spinner infinito).

Diagnóstico — checar os logs do pod do Kiali:

```bash
kubectl -n <NAMESPACE> logs deploy/kiali -c kiali --tail=50 | grep -iE "forbidden|shutting"
```

Se aparecer mensagem do tipo:

```
A namespace appears to have been deleted or Kiali is forbidden from seeing it
[err=failed to list *v1.GatewayClass: gatewayclasses.gateway.networking.k8s.io is forbidden]
... Shutting down cache.
```

→ falta a permissão `gatewayclasses` (e/ou `backendtlspolicies`) no `ClusterRole` do Kiali. Toda vez que ele tenta atualizar o cache e bate no 403, ele desliga o cache inteiro e a UI fica em loading.

**Fix:** adicionar os recursos faltantes no ClusterRole (já incluído na seção 1.1 deste tutorial). Para clusters existentes, patch direto:

```bash
kubectl patch clusterrole kiali --type=json \
  -p='[{"op":"add","path":"/rules/-","value":{"apiGroups":["gateway.networking.k8s.io"],"resources":["gatewayclasses","backendtlspolicies"],"verbs":["get","list","watch"]}}]'

kubectl -n <NAMESPACE> rollout restart deploy kiali
```

---

## Apêndice A — Habilitar coleta de métricas Istio para o Kiali

O Traffic Graph e os indicadores RED (Rate, Errors, Duration) do Kiali dependem inteiramente da métrica `istio_requests_total` no Prometheus. Em uma instalação limpa de Istio (perfil `minimal` ou `default` sem o addon `prometheus`), essa métrica **não é gerada nem coletada automaticamente**. São necessárias três peças:

| Componente                          | Papel                                                                                  |
| ----------------------------------- | -------------------------------------------------------------------------------------- |
| `Telemetry` (Istio)                 | Faz cada **sidecar Envoy gerar** as métricas `istio_*` em `:15090/stats/prometheus`     |
| `PodMonitor envoy-stats-monitor`    | Faz o **Prometheus coletar** essas métricas dos sidecars em todos os namespaces         |
| `ServiceMonitor istiod-monitor`     | Faz o Prometheus coletar métricas do **control plane (istiod)** — opcional mas recomendado |

### A.1 Habilitar geração de métricas nos sidecars (Telemetry)

> **⚠️ Não confundir com o `Telemetry` de tracing.** O recurso `Telemetry` da API do Istio cobre **três coisas distintas** (`metrics`, `tracing`, `accessLogging`), e cada bloco é configurado separadamente. Neste apêndice tratamos apenas de **métricas Prometheus** (RED — Rate/Errors/Duration — usadas pelo Kiali Graph).
>
> | Tipo de telemetria | Onde está documentado                       | Campo no spec        | Amostragem? |
> | ------------------ | ------------------------------------------- | -------------------- | ----------- |
> | **Métricas** (Prometheus / Kiali Graph) | **Este apêndice** — `Cap7/05-kiali.md`   | `spec.metrics`       | Não — 100% sempre |
> | **Traces** (Jaeger via OTel)            | `Cap7/06-istio-meshconfig.md`            | `spec.tracing`       | Sim — `randomSamplingPercentage` |
> | **Access logs**                          | (não usado neste manual)                 | `spec.accessLogging` | Não         |
>
> Os dois recursos `Telemetry` (este e o de tracing) **coexistem no cluster** — não substituem um ao outro. Você pode aplicar ambos com nomes diferentes (ex: `enable-prometheus-stats` para métricas e `tracing` para traces) no mesmo ou em namespaces distintos.

```yaml
# istio-telemetry-prometheus.yaml
apiVersion: telemetry.istio.io/v1
kind: Telemetry
metadata:
  name: enable-prometheus-stats
  namespace: istio-system          # istio-system = vale pra todo o mesh; troque por um ns específico para escopo restrito
spec:
  metrics:
    - providers:
        - name: prometheus
```

```bash
kubectl apply -f istio-telemetry-prometheus.yaml

# Sidecars já injetados precisam de restart para recarregar a config:
kubectl -n <APP_NAMESPACE> rollout restart deploy <APP_DEPLOY>
```

> Validação: `kubectl exec` em um pod com sidecar e checar `curl -s localhost:15090/stats/prometheus | grep -c '^istio_'`. Deve retornar > 0 após o restart.

### A.2 PodMonitor para os sidecars Envoy

> **Atenção:** este `PodMonitor` força o `__address__` dos targets para a porta **15090** (porta de stats do Envoy). Sem isso, o relabel padrão pode cair na porta **15021** (health check do Envoy) e todos os scrapes retornam **404 Not Found**.

```yaml
# istio-podmonitor.yaml
apiVersion: monitoring.coreos.com/v1
kind: PodMonitor
metadata:
  name: envoy-stats-monitor
  namespace: <NAMESPACE>
spec:
  selector:
    matchExpressions:
      - { key: istio-prometheus-ignore, operator: DoesNotExist }
  namespaceSelector:
    any: true
  jobLabel: envoy-stats
  podMetricsEndpoints:
    - path: /stats/prometheus
      interval: 15s
      relabelings:
        - action: keep
          sourceLabels: [__meta_kubernetes_pod_container_name]
          regex: "istio-proxy"
        # FORÇA a porta 15090 (porta de stats do Envoy)
        - action: replace
          sourceLabels: [__meta_kubernetes_pod_ip]
          regex: (.+)
          replacement: $1:15090
          targetLabel: __address__
        - action: labeldrop
          regex: "__meta_kubernetes_pod_label_(.+)"
        - sourceLabels: [__meta_kubernetes_namespace]
          action: replace
          targetLabel: namespace
        - sourceLabels: [__meta_kubernetes_pod_name]
          action: replace
          targetLabel: pod_name
```

> Pods de **IngressGateway** (sem app) podem aparecer como `down` neste PodMonitor. Não impacta o graph dos apps; é cosmético. Para ocultá-los, adicionar a label `istio-prometheus-ignore: "true"` nos pods do gateway.

### A.3 ServiceMonitor para o istiod

```yaml
# istiod-servicemonitor.yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: istiod-monitor
  namespace: <NAMESPACE>
spec:
  jobLabel: istio
  namespaceSelector:
    matchNames: [istio-system]
  selector:
    matchLabels:
      istio: pilot
  endpoints:
    - port: http-monitoring
      interval: 15s
```

### A.4 Aplicar e validar

```bash
kubectl apply -f istio-telemetry-prometheus.yaml
kubectl apply -f istio-podmonitor.yaml
kubectl apply -f istiod-servicemonitor.yaml

# Restart dos pods com sidecar para pegar o novo Telemetry config
kubectl -n <APP_NAMESPACE> rollout restart deploy <APP_DEPLOY>

# Gerar tráfego
kubectl run -n <APP_NAMESPACE> --rm -i --restart=Never gen --image=curlimages/curl --command -- \
  sh -c 'for i in $(seq 1 100); do curl -s -o /dev/null http://<APP_SVC>.<APP_NAMESPACE>.svc.cluster.local; done'

# Validar (esperar ~30s para um ciclo de scrape)
kubectl run -n <NAMESPACE> --rm -i --restart=Never q --image=curlimages/curl --command -- \
  curl -s 'http://<PROMETHEUS_SVC>.<NAMESPACE>.svc.cluster.local:9090/api/v1/query?query=count(istio_requests_total)'
```

Quando o `count` retornar um número > 0, o Traffic Graph do Kiali popula automaticamente em até 1 minuto.

> **Sobre os labels do Prometheus Operator:** se o seu Prometheus tiver `serviceMonitorSelector` ou `podMonitorSelector` filtrados (ex: `release: kube-prometheus-stack`), adicione o mesmo label nos `metadata.labels` dos manifestos acima. Para verificar:
>
> ```bash
> kubectl -n <NAMESPACE> get prometheus -o jsonpath='{.items[0].spec.serviceMonitorSelector}'; echo
> kubectl -n <NAMESPACE> get prometheus -o jsonpath='{.items[0].spec.podMonitorSelector}'; echo
> ```
>
> Se retornar `{}`, qualquer label serve.

---

## Referências

- [Kiali Documentation](https://kiali.io/docs/)
- [Kiali Configuration Reference](https://kiali.io/docs/configuration/kialis.kiali.io/)
- [Istio EnvoyFilter](https://istio.io/latest/docs/reference/config/networking/envoy-filter/)
- [Envoy Lua HTTP Filter](https://www.envoyproxy.io/docs/envoy/latest/configuration/http/http_filters/lua_filter)
- [quay.io/kiali/kiali tags](https://quay.io/repository/kiali/kiali?tab=tags)



eyJhbGciOiJSUzI1NiIsImtpZCI6InFwbmhvRlVZYlV0WElrSW1GVEg0eUZXcnhPV0pZOGtkN1hEUFpocGplZzAifQ.eyJhdWQiOlsiaHR0cHM6Ly9rdWJlcm5ldGVzLmRlZmF1bHQuc3ZjLmNsdXN0ZXIubG9jYWwiLCJya2UyIl0sImV4cCI6MTc3NzA2NjI2MSwiaWF0IjoxNzc3MDYyNjYxLCJpc3MiOiJodHRwczovL2t1YmVybmV0ZXMuZGVmYXVsdC5zdmMuY2x1c3Rlci5sb2NhbCIsImp0aSI6ImRjZjFlNjJhLTRmNTktNDg5Mi05ZmUwLWU2YmM0MGJhMjczYyIsImt1YmVybmV0ZXMuaW8iOnsibmFtZXNwYWNlIjoibW9uaXRvciIsInNlcnZpY2VhY2NvdW50Ijp7Im5hbWUiOiJraWFsaSIsInVpZCI6ImQ3NTVhYWNlLTBmYmMtNDM3OC04MDVjLWRmYzdjMTUyODU0NSJ9fSwibmJmIjoxNzc3MDYyNjYxLCJzdWIiOiJzeXN0ZW06c2VydmljZWFjY291bnQ6bW9uaXRvcjpraWFsaSJ9.KSnZjZyg9uXwFS7JYnCNQMCPqX319ZiZ3DC4wIbIz8HsVcH-19uW7amPkekSMJCrKTIqBvgl96MegWEgK790wjxXKy8qvKbR_wLcDDcXmIVdvQ3KR7edv1Bakvro1O_GyMWSohhbLYfTVsyophYwRKxRQtHoI5YgHq0tVUyAc13jlpl3t7KQSlolzkSnWUeDSs43J5mlz4eaqH6wFsOHOxtA9dBSpmVbOmoLj45h6L0nfXKcSz8ky7qFu4osbG1jMVNSwfW81x1uAy2p45Fl_bhg-oufu7dxFYP83YRn_2pP2Hgy3itOSL3_D2Q4IP45pupia2pWNoeXWZsHwAWEKg

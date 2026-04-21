# Kiali — Stack de Observabilidade Kubernetes

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
      - httproutes
      - grpcroutes
      - referencegrants
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

> **Recomendação para produção:** Utilize Sealed Secrets para não versionar a chave em texto no repositório Git.
>
> ```bash
> # Gerar uma chave segura
> openssl rand -base64 32
>
> # Selar com Sealed Secrets
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
  signing-key: "<KIALI_SIGNING_KEY>" # mínimo 16 caracteres
```

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

## Referências

- [Kiali Documentation](https://kiali.io/docs/)
- [Kiali Configuration Reference](https://kiali.io/docs/configuration/kialis.kiali.io/)
- [Istio EnvoyFilter](https://istio.io/latest/docs/reference/config/networking/envoy-filter/)
- [Envoy Lua HTTP Filter](https://www.envoyproxy.io/docs/envoy/latest/configuration/http/http_filters/lua_filter)
- [quay.io/kiali/kiali tags](https://quay.io/repository/kiali/kiali?tab=tags)

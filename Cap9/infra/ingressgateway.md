# Istio IngressGateway Dedicado por Namespace

## Descrição

Por padrão, o Istio instala um IngressGateway único no namespace `istio-system` que gerencia o tráfego de entrada de todo o cluster. Em alguns cenários é necessário um IngressGateway **dedicado por namespace**, isolando o tráfego de entrada de um projeto específico com IP próprio, RBAC próprio e sem dependência do gateway global.

> **Pré-requisito:** Istio instalado no cluster com o `istiod` rodando no namespace `istio-system`.

---

## Quando usar um IngressGateway dedicado?

| Situação                                    | Motivo                                               |
| :------------------------------------------ | :--------------------------------------------------- |
| Isolamento de tráfego por projeto/namespace | Cada namespace gerencia seu próprio ponto de entrada |
| IP de LoadBalancer exclusivo por namespace  | Facilita regras de firewall e DNS por projeto        |
| Políticas de segurança independentes        | RBAC e certificados separados por namespace          |
| Evitar dependência do gateway global        | Falha no gateway de um namespace não afeta outros    |

---

## Componentes do manifesto

| Recurso          | Descrição                                             |
| :--------------- | :---------------------------------------------------- |
| `ServiceAccount` | Identidade do pod do IngressGateway no cluster        |
| `Role`           | Permissão de leitura de Secrets no namespace          |
| `RoleBinding`    | Liga a Role ao ServiceAccount                         |
| `Deployment`     | Pod do IngressGateway rodando o `istio-proxy` (Envoy) |
| `Service`        | Expõe o IngressGateway via LoadBalancer com IP fixo   |

---

## Portas

| Porta (Service) | Porta (Container) | Nome        | Descrição             |
| :-------------- | :---------------- | :---------- | :-------------------- |
| `15021`         | `15021`           | status-port | Health check do Istio |
| `80`            | `8080`            | http2       | Tráfego HTTP          |
| `443`           | `8443`            | https       | Tráfego HTTPS         |

---

## Pré-requisitos

- Cluster Kubernetes funcional
- Istio instalado (`istiod` rodando em `istio-system`)
- `kubectl` com acesso ao cluster
- MetalLB instalado e configurado com o IP `<IP>` disponível no range
- Namespace `<NAMESPACE>` criado:

```bash
kubectl create namespace <NAMESPACE>
```

- ConfigMap `istio-ca-root-cert` presente no namespace (propagado automaticamente pelo Istio):

```bash
kubectl get configmap istio-ca-root-cert -n <NAMESPACE>
```

---

## Variáveis de Configuração

| Variável            | Descrição                              | Exemplo            |
| :------------------ | :------------------------------------- | :----------------- |
| `<NAMESPACE>`       | Namespace dedicado do projeto          | financas           |
| `<IP>`              | IP fixo do LoadBalancer (MetalLB)      | 192.168.1.71       |
| `<DOMINIO>`         | Domínio da aplicação                   | app.tatulab.com.br |
| `<NOME_SECRET_TLS>` | Nome do Secret com certificado TLS     | tls-tatulab        |
| `<NOME_SERVICO>`    | Nome do Service Kubernetes do backend  | meu-servico        |
| `<PORTA_SERVICO>`   | Porta do Service Kubernetes do backend | 8080               |
| `<VERSAO_ISTIO>`    | Versão da imagem do istio-proxy        | 1.28.3             |

---

## Etapa 1: Aplicar o manifesto do IngressGateway

```yaml
# ingressgateway-<NAMESPACE>.yaml

# ServiceAccount
apiVersion: v1
kind: ServiceAccount
metadata:
  name: <NAMESPACE>-ingressgateway
  namespace: <NAMESPACE>
  labels:
    app: <NAMESPACE>-ingressgateway
    istio: ingressgateway
---
# Role — permissão de leitura de Secrets no namespace
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: <NAMESPACE>-ingressgateway
  namespace: <NAMESPACE>
rules:
- apiGroups: [""]
  resources: ["secrets"]
  verbs: ["get", "list", "watch"]
---
# RoleBinding — liga a Role ao ServiceAccount
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: <NAMESPACE>-ingressgateway
  namespace: <NAMESPACE>
subjects:
- kind: ServiceAccount
  name: <NAMESPACE>-ingressgateway
  namespace: <NAMESPACE>
roleRef:
  kind: Role
  name: <NAMESPACE>-ingressgateway
  apiGroup: rbac.authorization.k8s.io
---
# Deployment do IngressGateway
apiVersion: apps/v1
kind: Deployment
metadata:
  name: <NAMESPACE>-ingressgateway
  namespace: <NAMESPACE>
  labels:
    app: <NAMESPACE>-ingressgateway
    istio: ingressgateway
    version: v1
spec:
  replicas: 2
  selector:
    matchLabels:
      app: <NAMESPACE>-ingressgateway
      istio: ingressgateway
  template:
    metadata:
      labels:
        app: <NAMESPACE>-ingressgateway
        istio: ingressgateway
        version: v1
      annotations:
        # Não injeta sidecar no próprio gateway
        sidecar.istio.io/inject: "false"
    spec:
      serviceAccountName: <NAMESPACE>-ingressgateway
      containers:
      - name: istio-proxy
        image: docker.io/istio/proxyv2:<VERSAO_ISTIO>
        ports:
        - containerPort: 15021
          protocol: TCP
        - containerPort: 8080
          protocol: TCP
        - containerPort: 8443
          protocol: TCP
        args:
        - proxy
        - router
        - --domain
        - $(POD_NAMESPACE).svc.cluster.local
        - --proxyLogLevel=warning
        - --proxyComponentLogLevel=misc:error
        - --log_output_level=default:info
        env:
        - name: JWT_POLICY
          value: third-party-jwt
        - name: PILOT_CERT_PROVIDER
          value: istiod
        - name: CA_ADDR
          value: istiod.istio-system.svc:15012
        - name: NODE_NAME
          valueFrom:
            fieldRef:
              apiVersion: v1
              fieldPath: spec.nodeName
        - name: POD_NAME
          valueFrom:
            fieldRef:
              apiVersion: v1
              fieldPath: metadata.name
        - name: POD_NAMESPACE
          valueFrom:
            fieldRef:
              apiVersion: v1
              fieldPath: metadata.namespace
        - name: INSTANCE_IP
          valueFrom:
            fieldRef:
              apiVersion: v1
              fieldPath: status.podIP
        - name: HOST_IP
          valueFrom:
            fieldRef:
              apiVersion: v1
              fieldPath: status.hostIP
        - name: SERVICE_ACCOUNT
          valueFrom:
            fieldRef:
              fieldPath: spec.serviceAccountName
        - name: ISTIO_META_WORKLOAD_NAME
          value: <NAMESPACE>-ingressgateway
        - name: ISTIO_META_OWNER
          value: kubernetes://apis/apps/v1/namespaces/<NAMESPACE>/deployments/<NAMESPACE>-ingressgateway
        - name: ISTIO_META_MESH_ID
          value: cluster.local
        - name: TRUST_DOMAIN
          value: cluster.local
        - name: ISTIO_META_UNPRIVILEGED_POD
          value: "true"
        - name: ISTIO_META_CLUSTER_ID
          value: Kubernetes
        volumeMounts:
        - name: workload-socket
          mountPath: /var/run/secrets/workload-spiffe-uds
        - name: credential-socket
          mountPath: /var/run/secrets/credential-uds
        - name: workload-certs
          mountPath: /var/run/secrets/workload-spiffe-credentials
        - name: istio-envoy
          mountPath: /etc/istio/proxy
        - name: config-volume
          mountPath: /etc/istio/config
        - name: istiod-ca-cert
          mountPath: /var/run/secrets/istio
          readOnly: true
        - name: istio-token
          mountPath: /var/run/secrets/tokens
          readOnly: true
        resources:
          requests:
            memory: "128Mi"
            cpu: "100m"
          limits:
            memory: "512Mi"
            cpu: "1000m"
      volumes:
      - name: workload-socket
        emptyDir: {}
      - name: credential-socket
        emptyDir: {}
      - name: workload-certs
        emptyDir: {}
      - name: istiod-ca-cert
        configMap:
          name: istio-ca-root-cert
      - name: istio-token
        projected:
          sources:
          - serviceAccountToken:
              path: istio-token
              expirationSeconds: 43200
              audience: istio-ca
      - name: istio-envoy
        emptyDir: {}
      - name: config-volume
        configMap:
          name: istio
          optional: true
---
# Service LoadBalancer com IP fixo
apiVersion: v1
kind: Service
metadata:
  name: <NAMESPACE>-ingressgateway
  namespace: <NAMESPACE>
  labels:
    app: <NAMESPACE>-ingressgateway
    istio: <NAMESPACE>-ingressgateway
spec:
  type: LoadBalancer
  loadBalancerIP: <IP>
  externalTrafficPolicy: Local
  selector:
    app: <NAMESPACE>-ingressgateway
    istio: ingressgateway
  ports:
  - port: 15021
    targetPort: 15021
    name: status-port
    protocol: TCP
  - port: 80
    targetPort: 8080
    name: http2
    protocol: TCP
  - port: 443
    targetPort: 8443
    name: https
    protocol: TCP
```

```bash
kubectl apply -f ingressgateway-<NAMESPACE>.yaml
```

---

## Etapa 2: Verificar instalação

```bash
# Verificar pods
kubectl get pods -n <NAMESPACE> -l app=<NAMESPACE>-ingressgateway

# Verificar Service e IP atribuído
kubectl get svc <NAMESPACE>-ingressgateway -n <NAMESPACE>

# Verificar ServiceAccount e RBAC
kubectl get serviceaccount <NAMESPACE>-ingressgateway -n <NAMESPACE>
kubectl get rolebinding <NAMESPACE>-ingressgateway -n <NAMESPACE>

# Verificar se o configmap istio-ca-root-cert foi propagado
kubectl get configmap istio-ca-root-cert -n <NAMESPACE>
```

O campo `EXTERNAL-IP` do Service deve mostrar `<IP>`.

---

## Etapa 3: Criar Gateway e VirtualService

Após o IngressGateway estar rodando, é necessário criar os recursos Istio que definem as regras de roteamento.

### Gateway

O `Gateway` define em qual porta e protocolo o IngressGateway aceita tráfego.

```yaml
apiVersion: networking.istio.io/v1beta1
kind: Gateway
metadata:
  name: <NAMESPACE>-gateway
  namespace: <NAMESPACE>
spec:
  selector:
    # Aponta para o IngressGateway dedicado deste namespace
    app: <NAMESPACE>-ingressgateway
  servers:
  - port:
      number: 443
      name: https
      protocol: HTTPS
    hosts:
    - <DOMINIO>
    tls:
      mode: SIMPLE
      credentialName: <NOME_SECRET_TLS>
  - port:
      number: 80
      name: http
      protocol: HTTP
    hosts:
    - <DOMINIO>
    tls:
      httpsRedirect: true   # Redireciona HTTP → HTTPS automaticamente
```

### VirtualService

O `VirtualService` define as regras de roteamento para os serviços internos do namespace.

```yaml
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: <NAMESPACE>-vs
  namespace: <NAMESPACE>
spec:
  hosts:
  - <DOMINIO>
  gateways:
  - <NAMESPACE>-gateway
  http:
  - match:
    - uri:
        prefix: /
    route:
    - destination:
        host: <NOME_SERVICO>
        port:
          number: <PORTA_SERVICO>
```

```bash
kubectl apply -f gateway-<NAMESPACE>.yaml
kubectl apply -f virtualservice-<NAMESPACE>.yaml
```

---

## Etapa 4: Configurar DNS

Adicione o registro A no seu servidor DNS apontando o domínio para o IP do IngressGateway:

```
<DOMINIO>  A  <IP>
```

Para teste local via `/etc/hosts`:

```bash
echo "<IP> <DOMINIO>" | sudo tee -a /etc/hosts
```

---

## Etapa 5: Validar acesso

```bash
# Testar HTTP (deve redirecionar para HTTPS se httpsRedirect: true)
curl -I http://<DOMINIO>

# Testar HTTPS
curl -k https://<DOMINIO>

# Testar com Host header direto no IP (sem DNS)
curl -H "Host: <DOMINIO>" -k https://<IP>
```

---

## Fluxo de tráfego

```
Cliente (navegador)
    ↓
DNS: <DOMINIO> → <IP>
    ↓
Service LoadBalancer (<NAMESPACE>-ingressgateway)
    ↓
Pod IngressGateway (istio-proxy / Envoy)
    ↓
Gateway (porta 443, host <DOMINIO>)
    ↓
VirtualService (roteamento por URI/host)
    ↓
Service: <NOME_SERVICO>:<PORTA_SERVICO>
    ↓
Pod da aplicação
```

---

## Visão geral: múltiplos IngressGateways no cluster

```
Cluster Kubernetes
│
├── namespace: istio-system
│   └── IngressGateway global (istio-ingressgateway)
│       └── IP: <IP_GLOBAL>
│
├── namespace: <NAMESPACE_A>
│   └── IngressGateway dedicado (<NAMESPACE_A>-ingressgateway)
│       └── IP: <IP_A>
│
└── namespace: <NAMESPACE_B>
    └── IngressGateway dedicado (<NAMESPACE_B>-ingressgateway)
        └── IP: <IP_B>
```

> Cada IngressGateway é selecionado pelo seu `Gateway` resource via `spec.selector.app`.

---

## Atualizar configuração

```bash
# Editar o manifesto
vim ingressgateway-<NAMESPACE>.yaml

# Reaplicar
kubectl apply -f ingressgateway-<NAMESPACE>.yaml

# Reiniciar os pods do gateway (se necessário)
kubectl rollout restart deployment/<NAMESPACE>-ingressgateway -n <NAMESPACE>
```

---

## Alterar IP do LoadBalancer

```bash
kubectl patch svc <NAMESPACE>-ingressgateway -n <NAMESPACE> \
  -p '{"spec":{"loadBalancerIP":"<NOVO_IP>"}}'
```

---

## Comandos Úteis

```bash
# Logs do IngressGateway
kubectl logs -n <NAMESPACE> -l app=<NAMESPACE>-ingressgateway -f

# Logs filtrando erros
kubectl logs -n <NAMESPACE> -l app=<NAMESPACE>-ingressgateway | grep -i error

# Listar Gateways do namespace
kubectl get gateway -n <NAMESPACE>

# Listar VirtualServices do namespace
kubectl get virtualservice -n <NAMESPACE>

# Verificar configuração do Envoy no pod do gateway
kubectl exec -n <NAMESPACE> \
  $(kubectl get pod -n <NAMESPACE> -l app=<NAMESPACE>-ingressgateway -o jsonpath='{.items[0].metadata.name}') \
  -- pilot-agent request GET config_dump | head -100

# Verificar status do istiod
kubectl get pods -n istio-system -l app=istiod
```

---

## Troubleshooting

### IP não atribuído ao Service

```bash
kubectl describe svc <NAMESPACE>-ingressgateway -n <NAMESPACE>
```

Verificar se o IP está dentro do range do MetalLB e se não está em uso por outro Service:

```bash
kubectl get svc -A | grep LoadBalancer
```

### Pod do IngressGateway em CrashLoopBackOff

**Causa comum:** ConfigMap `istio-ca-root-cert` não propagado para o namespace.

```bash
# Verificar se o ConfigMap existe
kubectl get configmap istio-ca-root-cert -n <NAMESPACE>

# Verificar logs do pod
kubectl logs -n <NAMESPACE> -l app=<NAMESPACE>-ingressgateway
```

Se o ConfigMap não existir, o Istio propaga automaticamente — aguardar alguns segundos após criar o namespace. Se não propagar:

```bash
# Copiar manualmente do istio-system
kubectl get configmap istio-ca-root-cert -n istio-system -o yaml \
  | sed "s/namespace: istio-system/namespace: <NAMESPACE>/" \
  | kubectl apply -f -
```

### Gateway não roteando para o VirtualService

```bash
# Verificar se o selector do Gateway aponta para o IngressGateway correto
kubectl get gateway <NAMESPACE>-gateway -n <NAMESPACE> -o yaml | grep selector -A3

# Deve conter:
# selector:
#   app: <NAMESPACE>-ingressgateway
```

### 404 ao acessar o domínio

```bash
# Verificar se o VirtualService está correto
kubectl get virtualservice <NAMESPACE>-vs -n <NAMESPACE> -o yaml

# Verificar se o Service do backend existe
kubectl get svc <NOME_SERVICO> -n <NAMESPACE>
```

---

## Referências

- [Istio — IngressGateway](https://istio.io/latest/docs/tasks/traffic-management/ingress/ingress-control/)
- [Istio — Gateway resource](https://istio.io/latest/docs/reference/config/networking/gateway/)
- [Istio — VirtualService](https://istio.io/latest/docs/reference/config/networking/virtual-service/)
- [Istio — Multiple Gateways](https://istio.io/latest/docs/setup/additional-setup/gateway/)

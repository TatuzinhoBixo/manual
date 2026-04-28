# Instalação do Istio no RKE2

## Descrição

O Istio é uma service mesh open-source que adiciona uma camada de infraestrutura ao cluster Kubernetes para gerenciar a comunicação entre serviços. Ele fornece funcionalidades como gerenciamento de tráfego, segurança (mTLS), observabilidade e controle de políticas sem necessidade de alterar o código das aplicações.

### Principais Funcionalidades

- **Gerenciamento de tráfego**: Roteamento inteligente, canary deployments, circuit breaking
- **Segurança**: mTLS automático entre serviços, políticas de autorização
- **Observabilidade**: Métricas, traces distribuídos e logs de acesso
- **Gateway**: Ingress/Egress gateway para controle de tráfego externo
- **Injeção de sidecar**: Proxy Envoy injetado automaticamente nos pods

## Pré-requisitos

- Cluster RKE2 instalado e funcional (ver `4-rke2.md`)
- kubectl configurado com acesso ao cluster (ver `5-kubectl.md`)
- Helm instalado (ver `6-helm.md`)
- Mínimo de 4 GB de RAM disponível nos workers para os componentes do Istio

## Variáveis de Configuração

| Variável              | Descrição                          | Exemplo          |
| :-------------------- | :--------------------------------- | :--------------- |
| `<VERSAO_ISTIO>`      | Versão do Istio                    | 1.28.3           |
| `<NAMESPACE_APP>`     | Namespace da aplicação             | minha-app        |
| `<NOME_APP>`          | Nome da aplicação (prefixo)        | minha-app        |
| `<GATEWAY_IP>`        | IP fixo do LoadBalancer do Gateway | 192.168.1.100    |
| `<DOMINIO>`           | Domínio da aplicação               | app.exemplo.com  |
| `<NOME_SERVICE>`      | Nome do Service da aplicação       | app-service      |
| `<PORTA_SERVICE>`     | Porta do Service da aplicação      | 80               |

---

## Etapa 1: Instalar o istioctl

O `istioctl` é a CLI oficial do Istio para instalação e gerenciamento.

### 1.1 Verificar versões disponíveis

Antes de instalar, consulte as versões disponíveis do Istio para escolher a mais adequada.

```bash
# Listar as últimas versões estáveis (releases) no GitHub
curl -s https://api.github.com/repos/istio/istio/releases | grep tag_name | head -n 10

# Ou apenas a versão estável mais recente
curl -s https://api.github.com/repos/istio/istio/releases/latest | grep tag_name
```

> **Dica**: Consulte também a [página oficial de releases](https://github.com/istio/istio/releases) para ver changelogs e compatibilidade com versões do Kubernetes. Evite versões com sufixos como `-alpha`, `-beta` ou `-rc` em produção.

### 1.2 Download e instalação

```bash
# Baixar a versão desejada
curl -L https://istio.io/downloadIstio | ISTIO_VERSION=<VERSAO_ISTIO> sh -

# Acessar o diretório
cd istio-<VERSAO_ISTIO>

# Copiar binário para o PATH
sudo cp bin/istioctl /usr/local/bin/

# Voltar ao diretório anterior
cd ..
```

### 1.3 Verificar instalação

```bash
istioctl version
```

---

## Etapa 2: Pré-validação do Cluster

Antes de instalar, verifique se o cluster atende aos requisitos:

```bash
istioctl x precheck
```

> **Importante**: Corrija todos os erros reportados antes de prosseguir. Warnings podem ser avaliados caso a caso.

---

## Etapa 3: Escolha do Perfil de Instalação

O Istio oferece diferentes perfis. A escolha define **o que é instalado no cluster**.

### 3.1 Perfis disponíveis

| Perfil    | Componentes                              | Uso recomendado                         |
| :-------- | :--------------------------------------- | :-------------------------------------- |
| `minimal` | Apenas istiod                            | **Produção** (gateway dedicado por namespace) |
| `default` | istiod + ingress gateway compartilhado   | Ambientes simples / única aplicação     |
| `demo`    | istiod + ingress/egress gateway + extras | Testes e aprendizado                    |
| `empty`   | Nenhum componente                        | Instalação 100% customizada             |

### 3.2 `minimal` vs `default` — quando usar cada um

**Perfil `default`:** istiod + **um único Ingress Gateway compartilhado** no `istio-system`.

```
istio-system/
  ├── istiod
  └── istio-ingressgateway   ← todas as apps passam por aqui
                               (1 IP, 1 LoadBalancer, RBAC compartilhado)
app-a/  →  usa o gateway do istio-system
app-b/  →  usa o gateway do istio-system
```

**Perfil `minimal`:** apenas istiod. Cada aplicação tem **seu próprio Ingress Gateway** no seu namespace (Etapa 7).

```
istio-system/
  └── istiod                 ← apenas o control plane

app-a/
  ├── app-a-ingressgateway   (IP próprio: 192.168.1.100)
  └── deployments da app-a
app-b/
  ├── app-b-ingressgateway   (IP próprio: 192.168.1.101)
  └── deployments da app-b
```

### 3.3 Comparação para decidir

| Aspecto              | `default` (gateway compartilhado)     | `minimal` (gateway por namespace)                 |
| :------------------- | :------------------------------------ | :------------------------------------------------ |
| IP público           | 1 IP para todas as apps               | 1 IP por app                                      |
| Falhas               | Gateway caído derruba todas as apps   | Falha isolada por aplicação                       |
| RBAC / Secrets TLS   | Tudo centralizado em `istio-system`   | Cada namespace gerencia seus próprios certificados |
| Escalabilidade       | Escala o gateway global               | Escala cada gateway conforme a carga da app       |
| Complexidade         | Mais simples (1 único gateway)        | Mais recursos, mas maior isolamento               |
| Indicado para        | Lab, dev, aplicação única             | Produção, multi-tenant, várias apps               |

> **Regra prática**: se você tem **mais de uma aplicação** e precisa de isolamento (segurança, IPs dedicados, times diferentes), escolha `minimal`. Para **uma única app** ou ambientes de teste, `default` é mais simples.

---

## Etapa 4: Instalação do Istio

Existem dois métodos de instalação. **Escolha apenas um** — não execute os dois.

- **Método A — via `istioctl`**: mais simples, indicado para a maioria dos casos.
- **Método B — via Helm**: maior controle e melhor para GitOps (ArgoCD, Flux).

---

### Método A: Instalação via istioctl (recomendado)

> **Sobre os CRDs**: O `istioctl install` **instala automaticamente os CRDs** (Gateway, VirtualService, DestinationRule, PeerAuthentication etc.) junto com o control plane. Não há passo separado para CRDs — isso é uma diferença em relação ao Helm, onde os CRDs são instalados via chart `istio/base`.

#### A.1 Instalação com perfil minimal (produção)

Instala apenas o istiod (+ CRDs). Os gateways serão criados por namespace na Etapa 7.

```bash
istioctl install --set profile=minimal -y
```

#### A.2 Instalação com perfil default (ambientes simples)

Se você preferir um gateway compartilhado em `istio-system`:

```bash
istioctl install --set profile=default -y
```

> **Nota**: Se usar `default`, **pule a Etapa 7** (deploy de gateway por namespace) — você já terá um gateway compartilhado pronto em `istio-system`.

#### A.3 Instalação customizada (opcional)

Para personalizar recursos, CNI ou configurações de mesh, crie um arquivo `istio-operator.yaml`:

```yaml
apiVersion: install.istio.io/v1alpha1
kind: IstioOperator
metadata:
  name: istio-config
spec:
  profile: minimal
  meshConfig:
    accessLogFile: /dev/stdout
    enableTracing: true
    defaultConfig:
      holdApplicationUntilProxyStarts: true
  components:
    pilot:
      k8s:
        resources:
          requests:
            cpu: 200m
            memory: 256Mi
          limits:
            cpu: 500m
            memory: 512Mi
  values:
    cni:
      enabled: true
      chained: true
    global:
      proxy:
        resources:
          requests:
            cpu: 50m
            memory: 64Mi
          limits:
            cpu: 200m
            memory: 256Mi
```

Aplicar:

```bash
istioctl install -f istio-operator.yaml -y
```

> **Nota sobre CNI**: Habilitar o Istio CNI plugin (`cni.enabled: true`) é recomendado em clusters RKE2 pois elimina a necessidade do init container com privilégios elevados, mais compatível com as políticas de segurança do RKE2.

---

### Método B: Instalação via Helm

Execute os passos B.1 a B.5 **em ordem** — cada chart depende do anterior.

#### B.1 Adicionar repositório do Istio

```bash
helm repo add istio https://istio-release.storage.googleapis.com/charts
helm repo update
```

#### B.2 Criar namespace

```bash
kubectl create namespace istio-system
```

#### B.3 Instalar componentes base (CRDs)

O chart `istio/base` é responsável por instalar os **CRDs** (Gateway, VirtualService, DestinationRule, PeerAuthentication etc.) e recursos comuns da mesh. **Este passo é obrigatório no Helm** e precisa ser executado **antes** do istiod.

```bash
helm install istio-base istio/base \
  -n istio-system \
  --set defaultRevision=default
```

> **Por que no Helm e não no istioctl?** O Helm trata cada componente como um chart independente, então os CRDs vivem num chart separado (`istio/base`). Já o `istioctl install` empacota tudo num único comando — CRDs, istiod e webhooks — por isso você não vê esse passo no Método A.

#### B.4 Instalar o Istio CNI (recomendado para RKE2)

```bash
helm install istio-cni istio/cni \
  -n istio-system \
  --set cni.cniBinDir=/opt/cni/bin \
  --set cni.cniConfDir=/etc/cni/net.d
```

> **RKE2**: Os caminhos padrão do CNI no RKE2 são `/opt/cni/bin` para binários e `/etc/cni/net.d` para configurações. Verifique se correspondem ao seu ambiente.

#### B.5 Instalar o istiod (control plane)

```bash
helm install istiod istio/istiod \
  -n istio-system \
  --set pilot.cni.enabled=true \
  --set pilot.traceSampling=100        # opcional: ver bloco abaixo
```

> **⚠️ Sobre `pilot.traceSampling`** — define o percentual **global** de amostragem de traces do mesh (env `PILOT_TRACE_SAMPLING` no istiod). O default do chart é **`1` (1%)**, valor adequado para produção mas que faz a maioria dos traces nunca chegar ao Jaeger em ambientes de aprendizado.
>
> | Cenário                    | Valor recomendado | Observação                                                                              |
> | -------------------------- | ----------------- | --------------------------------------------------------------------------------------- |
> | Dev / homologação / aprendizado | `100`         | Captura todos os traces — recomendado neste manual                                       |
> | Produção (volume alto)     | `1` (default)     | Só 1% dos requests viram trace — reduz overhead e custo de armazenamento                  |
> | Produção mista             | Manter default `1` | Sobrepor por namespace via `Telemetry` (ver `Cap7/06-istio-meshconfig.md`, passo 4)      |
>
> **Para alterar depois da instalação** (sem reinstalar):
>
> ```bash
> # Forma persistente (sobrevive a helm upgrade):
> helm upgrade istiod istio/istiod -n istio-system \
>   --reuse-values --set pilot.traceSampling=100
>
> # Forma efêmera (volta para o default no próximo helm upgrade):
> kubectl -n istio-system set env deploy/istiod PILOT_TRACE_SAMPLING=100
>
> # Em ambos os casos, reiniciar os pods com sidecar para o novo bootstrap:
> kubectl -n <APP_NS> rollout restart deploy <APP_DEPLOY>
> ```
>
> **Como verificar o valor efetivo**:
>
> ```bash
> kubectl -n istio-system get deploy istiod -o jsonpath='{.spec.template.spec.containers[0].env[?(@.name=="PILOT_TRACE_SAMPLING")].value}'; echo
> ```

#### B.6 Verificar instalação via Helm

```bash
helm list -n istio-system
```

> **Nota**: Via Helm, o Ingress Gateway **não** é instalado por padrão. Ele será deployado manualmente por namespace na Etapa 7 (equivalente ao perfil `minimal`).

---

## Etapa 5: Verificação da Instalação

### 4.1 Verificar pods do Istio

```bash
kubectl get pods -n istio-system
```

Saída esperada (todos os pods devem estar `Running`):

```
NAME                                    READY   STATUS    RESTARTS   AGE
istiod-xxxxxxxxxx-xxxxx                 1/1     Running   0          2m
```

### 4.2 Verificar services

```bash
kubectl get svc -n istio-system
```

### 4.3 Validação completa

> **Nota:** O comando `istioctl verify-install` foi **removido a partir do Istio 1.20**. Utilize os comandos abaixo para validar a instalação.

Verificar a análise da instalação (detecta problemas de configuração):

```bash
istioctl analyze -A
```

**Como interpretar a saída:**

- `Info [IST0102]` — namespaces sem `istio-injection`. É **esperado** em namespaces de infraestrutura (`kube-system`, `calico-system`, `metallb-system`, `tigera-operator`, etc.). **Não habilite injection nesses namespaces**, pois pode quebrar a rede do cluster.
- `Info [IST0118]` — portas de services que não seguem a convenção de nomes do Istio (`http-`, `tcp-`, `grpc-`). Pode ser ignorado para services de infra que não passam pela mesh.
- `Error` ou `Warning` — indicam problemas reais que precisam ser resolvidos antes de prosseguir.

Verificar a versão do control plane e dos proxies:

```bash
istioctl version
```

### 4.4 Verificar estado da mesh

```bash
istioctl proxy-status
```

> **Observação:** `istioctl proxy-status` só retornará proxies após você habilitar a injeção de sidecar em algum namespace (Etapa 6). Se ainda não houver workloads com sidecar, a saída virá vazia — isso é esperado.

---

## Etapa 6: Configurar Injeção Automática de Sidecar

O Istio injeta automaticamente o proxy Envoy nos pods de namespaces marcados com o label `istio-injection=enabled`.

### 5.1 Habilitar injeção em um namespace

```bash
kubectl label namespace <NAMESPACE_APP> istio-injection=enabled
```

### 5.2 Verificar namespaces com injeção habilitada

```bash
kubectl get namespace -L istio-injection
```

### 5.3 Reiniciar pods existentes

Pods criados antes da habilitação da injeção precisam ser reiniciados:

```bash
kubectl rollout restart deployment -n <NAMESPACE_APP>
```

### 5.4 Verificar sidecar injetado

Após o restart, os pods devem mostrar 2/2 containers (aplicação + envoy):

```bash
kubectl get pods -n <NAMESPACE_APP>
```

---

## Etapa 7: Deploy do Ingress Gateway por Namespace

Em produção, cada aplicação deve ter seu próprio Ingress Gateway isolado no namespace da aplicação. Isso garante isolamento de tráfego, RBAC dedicado e IP exclusivo por aplicação.

### 6.1 Criar o namespace da aplicação

```bash
kubectl create namespace <NAMESPACE_APP>
kubectl label namespace <NAMESPACE_APP> istio-injection=enabled
```

### 6.2 Criar manifesto do Ingress Gateway

Crie o arquivo `<NOME_APP>-ingressgateway.yaml` com todos os recursos necessários:

```yaml
# ServiceAccount
apiVersion: v1
kind: ServiceAccount
metadata:
  name: <NOME_APP>-ingressgateway
  namespace: <NAMESPACE_APP>
  labels:
    app: <NOME_APP>-ingressgateway
    istio: ingressgateway
---
# Role - permissão para ler Secrets (necessário para TLS no Gateway)
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  namespace: <NAMESPACE_APP>
  name: <NOME_APP>-ingressgateway
rules:
- apiGroups: [""]
  resources: ["secrets"]
  verbs: ["get", "list", "watch"]
---
# RoleBinding
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: <NOME_APP>-ingressgateway
  namespace: <NAMESPACE_APP>
subjects:
- kind: ServiceAccount
  name: <NOME_APP>-ingressgateway
  namespace: <NAMESPACE_APP>
roleRef:
  kind: Role
  name: <NOME_APP>-ingressgateway
  apiGroup: rbac.authorization.k8s.io
---
# Deployment do Ingress Gateway
apiVersion: apps/v1
kind: Deployment
metadata:
  name: <NOME_APP>-ingressgateway
  namespace: <NAMESPACE_APP>
  labels:
    app: <NOME_APP>-ingressgateway
    istio: ingressgateway
    version: v1
spec:
  replicas: 2
  selector:
    matchLabels:
      app: <NOME_APP>-ingressgateway
      istio: ingressgateway
  template:
    metadata:
      labels:
        app: <NOME_APP>-ingressgateway
        istio: ingressgateway
        version: v1
      annotations:
        sidecar.istio.io/inject: "false"
    spec:
      serviceAccountName: <NOME_APP>-ingressgateway
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
          value: <NOME_APP>-ingressgateway
        - name: ISTIO_META_OWNER
          value: kubernetes://apis/apps/v1/namespaces/<NAMESPACE_APP>/deployments/<NOME_APP>-ingressgateway
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
# Service do Ingress Gateway
apiVersion: v1
kind: Service
metadata:
  name: <NOME_APP>-ingressgateway
  namespace: <NAMESPACE_APP>
  labels:
    app: <NOME_APP>-ingressgateway
    istio: <NOME_APP>-ingressgateway
spec:
  type: LoadBalancer
  loadBalancerIP: <GATEWAY_IP>
  externalTrafficPolicy: Local
  selector:
    app: <NOME_APP>-ingressgateway
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

| Parâmetro                       | Descrição                                                           |
| :------------------------------ | :------------------------------------------------------------------ |
| `sidecar.istio.io/inject: "false"` | O gateway já é um proxy Envoy, não precisa de sidecar              |
| `replicas: 2`                   | Alta disponibilidade do gateway                                     |
| `loadBalancerIP`                | IP fixo atribuído pelo MetalLB ou balanceador externo               |
| `externalTrafficPolicy: Local`  | Preserva o IP de origem do cliente                                  |
| Role com acesso a `secrets`     | Necessário para o gateway ler certificados TLS do namespace         |

### 6.3 Aplicar o manifesto

```bash
kubectl apply -f <NOME_APP>-ingressgateway.yaml
```

### 6.4 Verificar o deploy

```bash
kubectl get pods -n <NAMESPACE_APP> -l app=<NOME_APP>-ingressgateway
kubectl get svc -n <NAMESPACE_APP> -l app=<NOME_APP>-ingressgateway
```

> **Importante**: A versão da imagem `istio/proxyv2:<VERSAO_ISTIO>` deve ser compatível com a versão do istiod instalado. Verifique com `istioctl version`.

---

## Etapa 8: Configurar Gateway e Roteamento

O recurso **Gateway** (CRD do Istio) define como o tráfego externo entra na mesh. O TLS é configurado aqui, e o Secret TLS fica no **mesmo namespace** do Ingress Gateway.

### 7.1 Gateway HTTP (sem TLS)

```yaml
apiVersion: networking.istio.io/v1
kind: Gateway
metadata:
  name: <NOME_APP>-gateway
  namespace: <NAMESPACE_APP>
spec:
  selector:
    istio: ingressgateway
  servers:
    - port:
        number: 80
        name: http
        protocol: HTTP
      hosts:
        - <DOMINIO>
```

### 7.2 Gateway com TLS (produção)

Criar o Secret TLS no namespace da aplicação:

```bash
kubectl create secret tls <NOME_APP>-tls-secret \
  --cert=<CAMINHO_CERT> \
  --key=<CAMINHO_KEY> \
  -n <NAMESPACE_APP>
```

Gateway com HTTPS e redirect HTTP -> HTTPS:

```yaml
apiVersion: networking.istio.io/v1
kind: Gateway
metadata:
  name: <NOME_APP>-gateway
  namespace: <NAMESPACE_APP>
spec:
  selector:
    istio: ingressgateway
  servers:
    - port:
        number: 443
        name: https
        protocol: HTTPS
      tls:
        mode: SIMPLE
        credentialName: <NOME_APP>-tls-secret
      hosts:
        - <DOMINIO>
    - port:
        number: 80
        name: http
        protocol: HTTP
      hosts:
        - <DOMINIO>
      tls:
        httpsRedirect: true
```

> **Nota**: O `credentialName` aponta para o Secret TLS que está no **mesmo namespace** do Ingress Gateway. A Role criada na Etapa 7 garante que o gateway tenha permissão para ler esse Secret.

### 7.3 Criar VirtualService

O VirtualService define as regras de roteamento do tráfego para os Services da aplicação:

```yaml
apiVersion: networking.istio.io/v1
kind: VirtualService
metadata:
  name: <NOME_APP>-virtualservice
  namespace: <NAMESPACE_APP>
spec:
  hosts:
    - <DOMINIO>
  gateways:
    - <NOME_APP>-gateway
  http:
    - route:
        - destination:
            host: <NOME_SERVICE>
            port:
              number: <PORTA_SERVICE>
```

### 7.4 Aplicar os recursos

```bash
kubectl apply -f gateway.yaml
kubectl apply -f virtualservice.yaml
```

### 7.5 Verificar configuração

```bash
# Verificar Gateway
kubectl get gateway -n <NAMESPACE_APP>

# Verificar VirtualService
kubectl get virtualservice -n <NAMESPACE_APP>

# Verificar se o proxy recebeu a configuração
istioctl proxy-status
```

---

## Etapa 9: Habilitar mTLS (Recomendado)

> **Nota**: O mTLS é entre serviços dentro da mesh (comunicação pod-a-pod). É independente do TLS configurado no Gateway (que é para tráfego externo).

O mTLS garante que toda comunicação entre serviços na mesh seja criptografada.

### 8.1 Habilitar mTLS strict para toda a mesh

```yaml
apiVersion: security.istio.io/v1
kind: PeerAuthentication
metadata:
  name: default
  namespace: istio-system
spec:
  mtls:
    mode: STRICT
```

```bash
kubectl apply -f peer-authentication.yaml
```

### 8.2 Verificar status do mTLS

```bash
istioctl x describe pod <NOME_POD> -n <NAMESPACE_APP>
```

---

## Etapa 10: Observabilidade (Opcional)

O Istio integra-se com ferramentas de observabilidade. Instale os addons desejados:

### 9.1 Instalar addons

```bash
# Dentro do diretório do Istio baixado na Etapa 1
kubectl apply -f samples/addons/prometheus.yaml
kubectl apply -f samples/addons/grafana.yaml
kubectl apply -f samples/addons/jaeger.yaml
kubectl apply -f samples/addons/kiali.yaml
```

### 9.2 Acessar dashboards

```bash
# Kiali (dashboard principal da mesh)
istioctl dashboard kiali

# Grafana (métricas)
istioctl dashboard grafana

# Jaeger (tracing)
istioctl dashboard jaeger
```

> **Nota**: Os comandos acima abrem port-forwards locais. Para acesso permanente em produção, configure Ingress ou VirtualService para cada dashboard.

---

## Comandos Úteis

```bash
# Verificar configuração de um pod
istioctl proxy-config cluster <NOME_POD> -n <NAMESPACE_APP>

# Analisar configuração da mesh
istioctl analyze -n <NAMESPACE_APP>

# Ver logs do proxy Envoy
kubectl logs <NOME_POD> -c istio-proxy -n <NAMESPACE_APP>

# Ver métricas do proxy
istioctl dashboard envoy <NOME_POD> -n <NAMESPACE_APP>

# Listar todos os VirtualServices
kubectl get virtualservices -A

# Listar todos os Gateways
kubectl get gateways -A

# Listar DestinationRules
kubectl get destinationrules -A
```

---

## Desinstalação

### Via istioctl

```bash
# Remover instalação
istioctl uninstall --purge -y

# Remover namespace
kubectl delete namespace istio-system
```

### Via Helm

```bash
helm uninstall istio-ingress -n istio-ingress
helm uninstall istiod -n istio-system
helm uninstall istio-cni -n istio-system
helm uninstall istio-base -n istio-system

kubectl delete namespace istio-system
kubectl delete namespace istio-ingress
```

### Remover labels de injeção

```bash
kubectl label namespace <NAMESPACE_APP> istio-injection-
```

---

## Troubleshooting

| Problema                              | Solução                                                                     |
| :------------------------------------ | :-------------------------------------------------------------------------- |
| Sidecar não injetado                  | Verificar label `istio-injection=enabled` no namespace                      |
| Gateway com EXTERNAL-IP `<pending>`   | Configurar MetalLB ou usar NodePort em ambientes on-premises                |
| Pods em CrashLoopBackOff com sidecar  | Verificar logs: `kubectl logs <pod> -c istio-proxy -n <ns>`                |
| mTLS quebrando comunicação            | Verificar PeerAuthentication e DestinationRules com `istioctl analyze`      |
| Erro de CNI no RKE2                   | Verificar caminhos do CNI: `/opt/cni/bin` e `/etc/cni/net.d`               |
| istiod não inicia                     | Verificar recursos disponíveis e logs: `kubectl logs -l app=istiod -n istio-system` |
| Proxy não sincroniza                  | Executar `istioctl proxy-status` e verificar versão do proxy vs control plane |

---

## Referências

- [Documentação oficial do Istio](https://istio.io/latest/docs/)
- [Guia de instalação do Istio](https://istio.io/latest/docs/setup/install/)
- [Instalação via Helm](https://istio.io/latest/docs/setup/install/helm/)
- [Istio no RKE2](https://istio.io/latest/docs/setup/platform-setup/)
- [Conceitos de Traffic Management](https://istio.io/latest/docs/concepts/traffic-management/)
- [Segurança no Istio](https://istio.io/latest/docs/concepts/security/)

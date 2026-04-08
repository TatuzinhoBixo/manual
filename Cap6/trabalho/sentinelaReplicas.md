### Sentinela 
Manifests para Istio (HTTP)
Aplique estes YAMLs (Service/Deployment/VS/Gateway). Eles substituem o AJP:8009 por HTTP:8080 e mantêm as rotas/redirects que você tinha no Apache.

```yaml
---
apiVersion: networking.istio.io/v1
kind: Gateway
metadata:
  name: sisp-gateway
  namespace: sisp
spec:
  selector:
    istio: ingressgateway
  servers:
    - port:
        number: 80
        name: http
        protocol: HTTP
      hosts:
        - "sentinela.sisp.am.gov.br"
---
apiVersion: v1
kind: Service
metadata:
  name: sentinela-sisp-svc
  namespace: sisp
spec:
  selector:
    app: sentinela-sisp-servicos
  ports:
    - name: http               # importante: nome "http"
      protocol: TCP
      port: 8080               # porta do Service
      targetPort: 8080         # porta HTTP do container
  type: ClusterIP
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: sentinela-sisp-servicos
  namespace: sisp
spec:
  replicas: 2
  revisionHistoryLimit: 5
  selector:
    matchLabels:
      app: sentinela-sisp-servicos
  template:
    metadata:
      labels:
        app: sentinela-sisp-servicos
        version: v1
      annotations:
        sidecar.istio.io/inject: "true"
    spec:
      containers:
        - name: sentinela-sisp-servicos
          image: registry3.prodam.am.gov.br/prd/sentinela-sisp:1.5.0
          ports:
            - containerPort: 8080
              name: http
      imagePullSecrets:
        - name: registry-secret3
---
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: sisp-vs
  namespace: sisp
spec:
  hosts:
    - sentinela.sisp.am.gov.br
  gateways:
    - sisp-gateway
  http:
    # redireciona "/" para "/sentinela/"
    - match:
        - uri:
            exact: /
      redirect:
        uri: /sentinela/
    # serviços (mesmas paths do Apache)
    - match:
        - uri:
            prefix: /sentinela/
        - uri:
            prefix: /sentinela_servicos
        - uri:
            prefix: /sentinela_carga_usuario
      route:
        - destination:
            host: sentinela-sisp-svc.sisp.svc.cluster.local
            port:
              number: 8080
```


Gateway
```yaml
apiVersion: networking.istio.io/v1
kind: Gateway
metadata:
  name: sisp-gateway
  namespace: sisp
spec:
  selector:
    istio: ingressgateway   # mesmo rótulo do seu ingress gateway
  servers:
    # Porta 80: redireciona tudo para HTTPS
    - port:
        number: 80
        name: http
        protocol: HTTP
      hosts:
        - "sentinela.sisp.am.gov.br"
      tls:
        httpsRedirect: true  # 301 -> https

    # Porta 443: serve HTTPS com o secret TLS
    - port:
        number: 443
        name: https
        protocol: HTTPS
      hosts:
        - "sentinela.sisp.am.gov.br"
      tls:
        mode: SIMPLE
        credentialName: tls-sisp   # <-- nome do Secret no namespace do ingressgateway (geralmente istio-system)
```



VirtualService
```yaml
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: sisp-vs
  namespace: sisp
spec:
  hosts:
    - sentinela.sisp.am.gov.br
  gateways:
    - sisp-gateway
  http:
    # "/" -> "/sentinela/"
    - match:
        - uri:
            exact: /
      redirect:
        uri: /sentinela/

    # "/sentinela" -> "/sentinela/"
    - match:
        - uri:
            exact: /sentinela
      redirect:
        uri: /sentinela/

    # POST /sentinela/ -> /sentinela/login.do
    - match:
        - uri:
            exact: /sentinela/
          method:
            exact: POST
      rewrite:
        uri: /sentinela/login.do
      headers:
        request:
          add:
            X-Forwarded-Proto: "https"
            X-Forwarded-Port: "443"
            X-Forwarded-Host: "sentinela.sisp.am.gov.br"
      route:
        - destination:
            host: sentinela-sisp-svc.sisp.svc.cluster.local
            port:
              number: 8080

    # Demais paths da aplicação
    - match:
        - uri:
            prefix: /sentinela/
        - uri:
            prefix: /sentinela_servicos
        - uri:
            prefix: /sentinela_carga_usuario
      headers:
        request:
          add:
            X-Forwarded-Proto: "https"
            X-Forwarded-Port: "443"
            X-Forwarded-Host: "sentinela.sisp.am.gov.br"
      route:
        - destination:
            host: sentinela-sisp-svc.sisp.svc.cluster.local
            port:
              number: 8080
```


Regra de destino do fixo

```yaml
apiVersion: networking.istio.io/v1beta1
kind: DestinationRule
metadata:
  name: sentinela-sisp-dr
  namespace: sisp
spec:
  host: sentinela-sisp-svc.sisp.svc.cluster.local
  trafficPolicy:
    loadBalancer:
      consistentHash:
        httpCookie:
          name: istio-session      # cookie gerado pelo Envoy
          ttl: 0s                  # cookie de sessão (expira ao fechar o browser)
    connectionPool:
      http:
        maxRequestsPerConnection: 100
        http2MaxRequests: 1000
    outlierDetection:
      consecutive5xxErrors: 5
      interval: 5s
      baseEjectionTime: 30s
```

Descrição da regra
sso diz ao Istio/Envoy:
Crie um cookie chamado istio-session na resposta HTTP.
O valor desse cookie será usado para calcular o hash de afinidade.
Enquanto o navegador enviar o mesmo cookie, todas as requisições irão sempre para o mesmo pod (a mesma instância JBoss).
ttl: 0s = cookie de sessão (só vale até fechar o navegador).
🤔 Por que isso resolve seu problema?
O JBoss (principalmente os mais antigos) mantém o estado do usuário na sessão (ex.: JSESSIONID).
Se a requisição vai parar em outro pod sem replicação de sessão, o usuário “perde” a sessão → volta para tela de login.
Antes, no Apache mod_jk, você tinha sticky session automático (ex.: JSESSIONID=xxxx.node1).
No Istio, sem sticky, o default é round-robin → cada clique pode cair em pods diferentes → comportamento que você viu.
Com o DestinationRule sticky por cookie:
Depois do login, o Envoy injeta Set-Cookie: istio-session=...
O navegador passa a sempre mandar esse cookie,
O Istio garante que o tráfego do usuário vai sempre para o mesmo pod, mantendo a sessão viva.
# Ingress Controller Traefik

## Descrição

O Traefik é um Ingress Controller moderno para Kubernetes que atua como proxy reverso e load balancer. Diferente do NGINX, o Traefik possui **descoberta automática de serviços** (via providers), painel web nativo, suporte a middlewares e CRDs próprios (`IngressRoute`, `Middleware`, `TLSOption`, etc.).

Em ambientes on-premises (bare-metal), o Traefik trabalha em conjunto com o MetalLB para receber um IP externo fixo, da mesma forma que o NGINX Ingress Controller.

---

## Comparativo rápido: Traefik vs NGINX Ingress

| Característica           | Traefik                            | NGINX Ingress              |
| :----------------------- | :--------------------------------- | :------------------------- |
| Descoberta de serviços   | Automática (dynamic config)        | Manual (Ingress resources) |
| Painel web nativo        | Sim (porta 8080)                   | Não                        |
| CRDs próprios            | `IngressRoute`, `Middleware`, etc. | Não                        |
| Recurso `Ingress` padrão | Suportado                          | Suportado                  |
| Suporte a TCP/UDP        | Nativo                             | Limitado                   |
| Renovação TLS automática | Let's Encrypt nativo               | Requer cert-manager        |

---

## Componentes e CRDs do Traefik

### Entrypoints
Portas de entrada do Traefik. Definidos na instalação via Helm.

| Entrypoint padrão | Porta | Descrição              |
| :---------------- | :---- | :--------------------- |
| `web`             | 80    | HTTP                   |
| `websecure`       | 443   | HTTPS                  |
| `traefik`         | 8080  | Painel web (dashboard) |

### CRDs (Custom Resource Definitions)

| CRD                | Descrição                                                                       |
| :----------------- | :------------------------------------------------------------------------------ |
| `IngressRoute`     | Substituto ao recurso `Ingress` padrão, com mais recursos                       |
| `IngressRouteTCP`  | Roteamento de tráfego TCP                                                       |
| `IngressRouteUDP`  | Roteamento de tráfego UDP                                                       |
| `Middleware`       | Transformações aplicadas às requisições (autenticação, redirect, headers, etc.) |
| `TLSOption`        | Configurações TLS (versão mínima, ciphers)                                      |
| `TLSStore`         | Certificado TLS padrão do cluster                                               |
| `TraefikService`   | Load balancing avançado entre serviços (canary, mirror, weighted)               |
| `ServersTransport` | Configuração de transporte para comunicação backend                             |

---

## Variáveis de Configuração

| Variável            | Descrição                              | Exemplo            |
| :------------------ | :------------------------------------- | :----------------- |
| `<NOME_RELEASE>`    | Nome do release Helm                   | traefik            |
| `<NAMESPACE>`       | Namespace do Traefik                   | traefik            |
| `<INGRESS_CLASS>`   | Nome da IngressClass                   | traefik            |
| `<IP_LOADBALANCER>` | IP fixo do LoadBalancer (MetalLB)      | 192.168.1.70       |
| `<NUM_REPLICAS>`    | Número de réplicas                     | 2                  |
| `<DOMINIO>`         | Domínio da aplicação                   | app.tatulab.com.br |
| `<NOME_SECRET_TLS>` | Nome do Secret com certificado TLS     | tls-tatulab        |
| `<NOME_SERVICO>`    | Nome do Service Kubernetes do backend  | meu-servico        |
| `<PORTA_SERVICO>`   | Porta do Service Kubernetes do backend | 80                 |

---

## Etapa 1: Adicionar Repositório Helm

```bash
helm repo add traefik https://traefik.github.io/charts
helm repo update
```

---

## Etapa 2: Instalar o Traefik

### Instalação Global (Default)

Para um Traefik que monitora todos os namespaces:

```bash
helm install <NOME_RELEASE> traefik/traefik \
  --namespace <NAMESPACE> \
  --create-namespace \
  --set deployment.replicas=<NUM_REPLICAS> \
  --set service.type=LoadBalancer \
  --set service.loadBalancerIP=<IP_LOADBALANCER> \
  --set ingressClass.enabled=true \
  --set ingressClass.isDefaultClass=false \
  --set ingressRoute.dashboard.enabled=true
```

> **Nota**: `ingressClass.isDefaultClass=false` é recomendado quando há múltiplos Ingress Controllers no cluster. Defina `true` apenas se o Traefik for o único ou o padrão.

### Instalação para Namespace Específico

Para um Traefik que monitora apenas um namespace específico, adicione a flag de restrição via providers:

```bash
helm upgrade traefik-<NAMESPACE> traefik/traefik \
  --namespace <NAMESPACE> \
  --set deployment.replicas=<NUM_REPLICAS> \
  --set service.type=LoadBalancer \
  --set service.loadBalancerIP=<IP>> \
  --set ingressClass.enabled=true \
  --set ingressClass.isDefaultClass=false \
  --set "providers.kubernetesCRD.namespaces={<NAMESPACE>}" \
  --set "providers.kubernetesIngress.namespaces={<NAMESPACE>}" \
  --set "service.annotations.metallb\.universe\.tf/loadBalancerIPs=<IP>"
```

---

## Etapa 3: Verificar Instalação

```bash
# Verificar pods do Traefik
kubectl get pods -n <NAMESPACE>

# Verificar serviço e IP atribuído pelo MetalLB
kubectl get svc -n <NAMESPACE>

# Listar IngressClasses disponíveis
kubectl get ingressclass

# Listar CRDs instalados pelo Traefik
kubectl get crd | grep traefik
```

---

## Etapa 4: Expor uma Aplicação

A exposição é feita pelo CRD `IngressRoute` do Traefik, que casa um host (`Host(...)`) e um entrypoint (`web`/`websecure`) com um Service Kubernetes, opcionalmente passando por `Middleware`s.

Os manifestos completos estão na **Etapa 5**, já combinados com cada middleware (`kubectl apply -f` único). Se não precisar de middleware, basta usar a mesma estrutura sem o campo `middlewares`.

> Para portabilidade entre Ingress Controllers (NGINX, ALB, etc.), veja a alternativa com `Ingress` padrão no fim deste documento.

---

## Etapa 5: Middlewares

Transformam requisições antes de chegar ao backend. Cada exemplo abaixo é um manifesto único (`kubectl apply -f`) com o `Middleware` e a `IngressRoute` que o referencia.

### Redirect HTTP → HTTPS

O redirect tem que ser aplicado na `IngressRoute` que escuta no entrypoint `web` (porta 80). A `IngressRoute` que serve o tráfego real fica em `websecure` (porta 443) **sem** o middleware. Os três recursos vão num único arquivo:

```yaml
apiVersion: traefik.io/v1alpha1
kind: Middleware
metadata:
  name: redirect-https
  namespace: <NAMESPACE>
spec:
  redirectScheme:
    scheme: https
    permanent: true
---
# Captura HTTP (porta 80) e redireciona para HTTPS
apiVersion: traefik.io/v1alpha1
kind: IngressRoute
metadata:
  name: <NOME_SERVICO>-http
  namespace: <NAMESPACE>
spec:
  entryPoints:
    - web
  routes:
    - kind: Rule
      match: Host(`<DOMINIO>`)
      middlewares:
        - name: redirect-https
      services:
        - name: <NOME_SERVICO>
          port: <PORTA_SERVICO>
---
# Serve a aplicação em HTTPS (porta 443)
apiVersion: traefik.io/v1alpha1
kind: IngressRoute
metadata:
  name: <NOME_SERVICO>
  namespace: <NAMESPACE>
spec:
  entryPoints:
    - websecure
  routes:
    - kind: Rule
      match: Host(`<DOMINIO>`)
      services:
        - name: <NOME_SERVICO>
          port: <PORTA_SERVICO>
  tls:
    secretName: <NOME_SECRET_TLS>
```

### Basic Auth

```bash
htpasswd -nb usuario senha | openssl base64
```

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: basic-auth-secret
  namespace: <NAMESPACE>
type: Opaque
data:
  users: <HASH_BASE64>
---
apiVersion: traefik.io/v1alpha1
kind: Middleware
metadata:
  name: basic-auth
  namespace: <NAMESPACE>
spec:
  basicAuth:
    secret: basic-auth-secret
---
apiVersion: traefik.io/v1alpha1
kind: IngressRoute
metadata:
  name: <NOME_SERVICO>
  namespace: <NAMESPACE>
spec:
  entryPoints:
    - websecure
  routes:
    - kind: Rule
      match: Host(`<DOMINIO>`)
      middlewares:
        - name: basic-auth
      services:
        - name: <NOME_SERVICO>
          port: <PORTA_SERVICO>
  tls:
    secretName: <NOME_SECRET_TLS>
```

### Strip Prefix (útil para subpaths)

```yaml
apiVersion: traefik.io/v1alpha1
kind: Middleware
metadata:
  name: strip-prefix
  namespace: <NAMESPACE>
spec:
  stripPrefix:
    prefixes:
      - /api
```

---

## Alterar IP do LoadBalancer

Caso seja necessário trocar o IP após a instalação:

```bash
kubectl edit svc <NOME_RELEASE> -n <NAMESPACE>
```

Altere o campo `spec.loadBalancerIP` para o novo IP desejado.

Ou via patch:

```bash
kubectl patch svc <NOME_RELEASE> -n <NAMESPACE> \
  -p '{"spec":{"loadBalancerIP":"<NOVO_IP>"}}'
```

---

## Parâmetros Helm Importantes

| Parâmetro                                | Descrição                                                    |
| :--------------------------------------- | :----------------------------------------------------------- |
| `deployment.replicas`                    | Número de réplicas do Traefik                                |
| `service.type=LoadBalancer`              | Expõe via IP externo (requer MetalLB em bare-metal)          |
| `service.type=NodePort`                  | Expõe via porta nos nós                                      |
| `service.loadBalancerIP`                 | IP fixo solicitado ao MetalLB                                |
| `ingressClass.enabled=true`              | Cria o recurso `IngressClass` no cluster                     |
| `ingressClass.isDefaultClass`            | Define se é o Ingress Controller padrão do cluster           |
| `ingressRoute.dashboard.enabled`         | Habilita o painel web interno do Traefik                     |
| `providers.kubernetesCRD.namespaces`     | Restringe o watch de IngressRoutes a namespaces específicos  |
| `providers.kubernetesIngress.namespaces` | Restringe o watch de Ingress padrão a namespaces específicos |
| `logs.general.level`                     | Nível de log: `DEBUG`, `INFO`, `WARN`, `ERROR`               |

---

## Comandos Úteis

```bash
# Logs do Traefik
kubectl logs -n <NAMESPACE> -l app.kubernetes.io/name=traefik

# Acompanhar logs em tempo real
kubectl logs -n <NAMESPACE> -l app.kubernetes.io/name=traefik -f

# Listar todos os IngressRoutes no cluster
kubectl get ingressroute -A

# Listar todos os Middlewares no cluster
kubectl get middleware -A

# Listar todos os Ingress resources (padrão k8s)
kubectl get ingress -A

# Acessar o dashboard do Traefik via port-forward
kubectl port-forward -n <NAMESPACE> svc/<NOME_RELEASE> 8080:8080
# Acesse: http://localhost:8080/dashboard/
```

---

## Alternativa: Ingress padrão do Kubernetes

Use quando precisar do mesmo manifesto rodando em outros Ingress Controllers (NGINX, ALB, etc.). Não suporta `Middleware` diretamente — para usar middlewares Traefik num `Ingress` padrão é preciso a annotation `traefik.ingress.kubernetes.io/router.middlewares: <NAMESPACE>-<NOME>@kubernetescrd`.

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: <NOME_SERVICO>
  namespace: <NAMESPACE>
  annotations:
    kubernetes.io/ingress.class: <INGRESS_CLASS>
spec:
  tls:
    - hosts: [<DOMINIO>]
      secretName: <NOME_SECRET_TLS>
  rules:
    - host: <DOMINIO>
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: <NOME_SERVICO>
                port:
                  number: <PORTA_SERVICO>
```

---

## Referências

- [Documentação oficial do Traefik](https://doc.traefik.io/traefik/)
- [Helm Chart — Traefik](https://artifacthub.io/packages/helm/traefik/traefik)
- [CRD IngressRoute](https://doc.traefik.io/traefik/routing/providers/kubernetes-crd/)
- [Middlewares](https://doc.traefik.io/traefik/middlewares/overview/)
- [Guia de instalação Kubernetes](https://doc.traefik.io/traefik/getting-started/install-traefik/#use-the-helm-chart)

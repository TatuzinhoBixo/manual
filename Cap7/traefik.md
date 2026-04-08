# Instalação do Traefik para Namespace Observability

## Informações da Instalação

**Data:** 28/01/2026  
**Cluster:** Kubernetes RKE2 - Homelab tatulab.com.br  
**Namespace:** observability  
**Chart:** traefik/traefik  
**IP Fixo:** 192.168.1.72  
**IngressClass:** traefik-observability

---

## Objetivo

Instalar um Traefik **exclusivo** para o namespace `observability` para expor apenas o Grafana.

---

## Por que IngressClass diferente?

**Problema:** Já existe um Traefik instalado no namespace `argocd` com IngressClass `traefik`.

**Solução:** Criar IngressClass com nome `traefik-observability` para evitar conflito.

---

## Pré-requisitos

### 1. Repositório Helm
```bash
helm repo add traefik https://traefik.github.io/charts
helm repo update
```

### 2. Verificar namespace
```bash
kubectl get namespace observability
```

### 3. Verificar Secret TLS
```bash
kubectl get secret tls-tatulab -n observability
```

---

## Configuração (values.yaml)

### Arquivo: traefik-values.yaml
```yaml
# Nome da IngressClass diferente
ingressClass:
  enabled: true
  isDefaultClass: false
  name: traefik-observability

# Deployment
deployment:
  enabled: true
  kind: DaemonSet
  replicas: 1

# Service
service:
  enabled: true
  type: LoadBalancer
  loadBalancerIP: 192.168.1.72
  annotations: {}

# Ports
ports:
  web:
    port: 80
    exposedPort: 80
    expose:
      default: true
  websecure:
    port: 443
    exposedPort: 443
    expose:
      default: true

# Logs
logs:
  general:
    level: INFO
  access:
    enabled: true

# IngressRoute CRD
ingressRoute:
  dashboard:
    enabled: false

# Providers
providers:
  kubernetesCRD:
    enabled: true
    allowCrossNamespace: false
  kubernetesIngress:
    enabled: true
    allowExternalNameServices: true

# Resources
resources:
  requests:
    cpu: 100m
    memory: 128Mi
  limits:
    cpu: 500m
    memory: 512Mi
```

---

## Decisões de Configuração

### 1. IngressClass
```yaml
ingressClass:
  enabled: true
  isDefaultClass: false
  name: traefik-observability
```
- **Nome:** `traefik-observability` (diferente do Traefik do ArgoCD)
- **Default:** `false` (não é IngressClass padrão do cluster)

### 2. Deployment
```yaml
deployment:
  kind: DaemonSet
  replicas: 1
```
- **Tipo:** DaemonSet (1 pod por node selecionado)
- **Motivo:** Garantir que o Traefik rode em node específico se necessário

### 3. Service LoadBalancer
```yaml
service:
  type: LoadBalancer
  loadBalancerIP: 192.168.1.72
```
- **IP Fixo:** 192.168.1.72
- **Motivo:** IP fixo para DNS apontar para grafana.tatulab.com.br

### 4. Ports
- **Web:** Porta 80 (HTTP)
- **Websecure:** Porta 443 (HTTPS)

### 5. Providers
```yaml
providers:
  kubernetesCRD:
    enabled: true
    allowCrossNamespace: false
```
- **kubernetesCRD:** Habilita IngressRoute (Traefik CRD)
- **allowCrossNamespace:** `false` (apenas namespace observability)
- **kubernetesIngress:** Suporta Ingress padrão também

### 6. Dashboard
```yaml
ingressRoute:
  dashboard:
    enabled: false
```
- **Motivo:** Dashboard do Traefik desabilitado (não necessário)

---

## Comandos de Instalação

### 1. Criar arquivo de configuração
```bash
cat > traefik-values.yaml << 'YAML'
# Cole o conteúdo do values.yaml aqui
YAML
```

### 2. Instalar via Helm
```bash
helm install traefik traefik/traefik \
  -f traefik-values.yaml \
  -n observability
```

### 3. Verificar instalação
```bash
kubectl get pods -n observability | grep traefik
kubectl get svc traefik -n observability
kubectl get ingressclass traefik-observability
```

### 4. Verificar IP atribuído
```bash
kubectl get svc traefik -n observability -o wide
```

Deve mostrar: `EXTERNAL-IP: 192.168.1.72`

---

## IngressRoute para Grafana

### Arquivo: grafana-ingressroute.yaml
```yaml
apiVersion: traefik.io/v1alpha1
kind: IngressRoute
metadata:
  name: grafana-ingressroute
  namespace: observability
spec:
  entryPoints:
    - websecure
  routes:
    - match: Host(`grafana.tatulab.com.br`)
      kind: Rule
      services:
        - name: kube-prometheus-stack-grafana
          port: 80
  tls:
    secretName: tls-tatulab
```

### Aplicar IngressRoute
```bash
kubectl apply -f grafana-ingressroute.yaml
```

### Verificar IngressRoute
```bash
kubectl get ingressroute -n observability
kubectl describe ingressroute grafana-ingressroute -n observability
```

---

## Configuração DNS

### Adicionar entrada no DNS ou /etc/hosts

**DNS (recomendado para produção):**
```
grafana.tatulab.com.br  A  192.168.1.72
```

**Ou /etc/hosts (teste local):**
```bash
echo "192.168.1.72 grafana.tatulab.com.br" | sudo tee -a /etc/hosts
```

---

## Testes de Acesso

### 1. Testar resolução DNS
```bash
nslookup grafana.tatulab.com.br
# ou
ping grafana.tatulab.com.br
```

### 2. Testar HTTP (deve redirecionar para HTTPS)
```bash
curl -I http://grafana.tatulab.com.br
```

### 3. Testar HTTPS
```bash
curl -k https://grafana.tatulab.com.br
```

### 4. Acessar via navegador
```
https://grafana.tatulab.com.br
```

**Credenciais:**
- **User:** admin
- **Password:** SuaSenhaAqui123!

---

## Verificar Logs do Traefik

### Logs do pod
```bash
kubectl logs -n observability -l app.kubernetes.io/name=traefik --tail=100 -f
```

### Verificar rotas carregadas
```bash
kubectl logs -n observability -l app.kubernetes.io/name=traefik | grep grafana.tatulab.com.br
```

---

## Atualização de Configuração

Caso precise alterar alguma configuração:
```bash
# Editar traefik-values.yaml
vim traefik-values.yaml

# Aplicar mudanças
helm upgrade traefik traefik/traefik \
  -f traefik-values.yaml \
  -n observability
```

---

## Desinstalação

### Remover IngressRoute
```bash
kubectl delete -f grafana-ingressroute.yaml
```

### Desinstalar Traefik
```bash
helm uninstall traefik -n observability
```

### Remover IngressClass (se necessário)
```bash
kubectl delete ingressclass traefik-observability
```

---

## Troubleshooting

### Problema: IP não foi atribuído ao Service

**Verificar:**
```bash
kubectl describe svc traefik -n observability
```

**Possível causa:** MetalLB ou LoadBalancer não configurado.

**Solução:** Verificar se o IP 192.168.1.72 está no range do LoadBalancer.

---

### Problema: IngressRoute não funciona

**Verificar se o IngressRoute foi criado:**
```bash
kubectl get ingressroute -n observability
```

**Verificar logs do Traefik:**
```bash
kubectl logs -n observability -l app.kubernetes.io/name=traefik | grep ERROR
```

**Verificar se o Service do Grafana existe:**
```bash
kubectl get svc kube-prometheus-stack-grafana -n observability
```

---

### Problema: Certificado SSL não funciona

**Verificar se o Secret TLS existe:**
```bash
kubectl get secret tls-tatulab -n observability
```

**Verificar conteúdo do Secret:**
```bash
kubectl describe secret tls-tatulab -n observability
```

**Deve conter:**
- `tls.crt`
- `tls.key`

---

### Problema: 404 Not Found

**Verificar se o match está correto:**
```bash
kubectl get ingressroute grafana-ingressroute -n observability -o yaml
```

**Verificar se o hostname bate:**
```bash
curl -H "Host: grafana.tatulab.com.br" -k https://192.168.1.72
```

---

## Estrutura de Arquivos
```
~/manifestos/obs/
├── kube-prometheus-stack-values.yaml
├── traefik-values.yaml
├── grafana-ingressroute.yaml
├── prometheus-operator-installation.md
└── traefik-observability-installation.md
```

---

## Componentes Instalados

| Componente | Descrição |
|------------|-----------|
| **Traefik** | Reverse proxy e load balancer |
| **IngressClass** | traefik-observability |
| **Service LoadBalancer** | IP fixo 192.168.1.72 |
| **IngressRoute** | Rota para grafana.tatulab.com.br |

---

## Fluxo de Tráfego
```
Cliente (navegador)
    ↓
DNS: grafana.tatulab.com.br → 192.168.1.72
    ↓
Traefik Service (LoadBalancer)
    ↓
Traefik Pod (observability namespace)
    ↓
IngressRoute: Host(`grafana.tatulab.com.br`)
    ↓
Service: kube-prometheus-stack-grafana:80
    ↓
Grafana Pod
```

---

## Segurança

### TLS/SSL
- **Certificado:** Secret `tls-tatulab` no namespace observability
- **Protocolo:** HTTPS (porta 443)
- **HTTP:** Porta 80 exposta (pode configurar redirect se necessário)

### Considerações
1. **Certificado válido:** Usar Let's Encrypt ou certificado interno
2. **Autenticação:** Grafana tem autenticação própria (admin/senha)
3. **Firewall:** Restringir acesso ao IP 192.168.1.72 se necessário

---

## Monitoramento do Traefik

### Métricas do Traefik
O Traefik expõe métricas Prometheus na porta 9100 (por padrão).

**ServiceMonitor para Prometheus (opcional):**
```yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: traefik-metrics
  namespace: observability
spec:
  selector:
    matchLabels:
      app.kubernetes.io/name: traefik
  endpoints:
  - port: metrics
    interval: 30s
```

---

## Referências

- [Traefik Documentation](https://doc.traefik.io/traefik/)
- [Traefik Helm Chart](https://github.com/traefik/traefik-helm-chart)
- [Traefik IngressRoute](https://doc.traefik.io/traefik/routing/providers/kubernetes-crd/)
- [Traefik Kubernetes CRD](https://doc.traefik.io/traefik/providers/kubernetes-crd/)

---

## Notas Importantes

1. **IngressClass separada:** Evita conflito com Traefik do ArgoCD
2. **Namespace isolado:** `allowCrossNamespace: false` mantém segurança
3. **IP fixo:** Facilita configuração de DNS
4. **TLS obrigatório:** Apenas entryPoint `websecure` configurado
5. **Dashboard desabilitado:** Reduz superfície de ataque

---

**Documentação criada em:** 28/01/2026  
**Última atualização:** 28/01/2026

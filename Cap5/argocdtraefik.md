# Guia de Instalação: Traefik + ArgoCD com TLS

## Pré-requisitos

- Cluster Kubernetes (RKE2/K8s)
- MetalLB instalado e configurado
- Certificado TLS disponível
- Helm 3 instalado

---

## 1. Adicionar Repositórios Helm

```bash
helm repo add traefik https://traefik.github.io/charts
helm repo add argo https://argoproj.github.io/argo-helm
helm repo update
```

---

## 2. Criar Namespace (se não existir)

```bash
kubectl create namespace argocd
```

---

## 3. Criar Secret TLS

```bash
kubectl create secret tls tls-tatulab \
  --cert=/caminho/do/certificado.crt \
  --key=/caminho/da/chave.key \
  -n argocd
```

**Verificar:**

```bash
kubectl get secret -n argocd tls-tatulab
```

---

## 4. Instalar Traefik com LoadBalancer

```bash
helm install traefik traefik/traefik \
  --namespace argocd \
  --set service.type=LoadBalancer \
  --set service.loadBalancerIP=192.168.1.70 \
  --set deployment.replicas=2 \
  --set ingressClass.enabled=true \
  --set ingressClass.isDefaultClass=false
```

**Verificar instalação:**

```bash
kubectl get pods -n argocd | grep traefik
kubectl get svc -n argocd traefik
```

**O LoadBalancer deve mostrar o EXTERNAL-IP: 192.168.1.70**

---

## 5. Verificar CRDs do Traefik

```bash
kubectl get crd | grep traefik
```

Deve listar vários CRDs incluindo `ingressroutes.traefik.io`

---

## 6. Instalar ArgoCD via Helm

```bash
helm install argocd argo/argo-cd --namespace argocd
```

**Aguardar pods subirem:**

```bash
kubectl get pods -n argocd
```

Todos os pods devem estar com status `Running`

---

## 7. Configurar ArgoCD para Modo Insecure

O ArgoCD precisa rodar em modo insecure para que o Traefik termine o TLS:

```bash
kubectl patch configmap argocd-cmd-params-cm -n argocd \
  --type merge \
  -p '{"data":{"server.insecure":"true"}}'
```

**Reiniciar o ArgoCD Server:**

```bash
kubectl rollout restart deployment argocd-server -n argocd
```

**Aguardar rollout:**

```bash
kubectl rollout status deployment argocd-server -n argocd
```

---

## 8. Criar IngressRoute do Traefik

```bash
kubectl apply -f - <<EOF
apiVersion: traefik.io/v1alpha1
kind: IngressRoute
metadata:
  name: argocd-server
  namespace: argocd
spec:
  entryPoints:
    - websecure
  routes:
    - kind: Rule
      match: Host(\`argocd.tatulab.com.br\`)
      services:
        - name: argocd-server
          port: 80
  tls:
    secretName: tls-tatulab
EOF
```

**Verificar IngressRoute:**

```bash
kubectl get ingressroute -n argocd
```

---

## 9. Obter Senha Inicial do ArgoCD

```bash
kubectl -n argocd get secret argocd-initial-admin-secret \
  -o jsonpath="{.data.password}" | base64 -d
```

**Credenciais de acesso:**

- **URL:** https://argo.tatulab.com.br
- **Usuário:** admin
- **Senha:** (resultado do comando acima)

---

## 10. Acessar o ArgoCD

Abra o navegador e acesse: **https://argo.tatulab.com.br**

---

## Verificações e Troubleshooting

### Verificar se o Traefik está recebendo tráfego

```bash
kubectl logs -n argocd -l app.kubernetes.io/name=traefik --tail=50
```

### Verificar logs do ArgoCD Server

```bash
kubectl logs -n argocd -l app.kubernetes.io/name=argocd-server --tail=50
```

### Verificar Services

```bash
kubectl get svc -n argocd
```

### Testar conectividade DNS

```bash
ping argo.tatulab.com.br
curl -I https://argo.tatulab.com.br
```

### Verificar configuração do MetalLB

```bash
kubectl get ipaddresspool -A
```

O IP 192.168.1.70 deve estar no range configurado.

---

## Arquitetura da Solução

```bash
Internet/Browser
    ↓
https://argo.tatulab.com.br (192.168.1.70)
    ↓
[Traefik LoadBalancer] (porta 443 - TLS)
    ↓
[IngressRoute] (termina TLS, roteia para ArgoCD)
    ↓
[ArgoCD Service] (porta 80 - HTTP interno)
    ↓
[ArgoCD Pods] (modo insecure)
```

---

## Pontos Importantes

1. **Traefik termina o TLS** (porta 443 externa com certificado tls-tatulab)
2. **ArgoCD roda em modo insecure** (porta 80 interna, sem TLS)
3. **MetalLB** atribui o IP 192.168.1.70 ao LoadBalancer do Traefik
4. **IngressRoute** faz o roteamento baseado no hostname
5. **DNS** deve apontar argo.tatulab.com.br para 192.168.1.70

---

## Comandos Úteis

### Desinstalar (se necessário)

```bash
helm uninstall argocd -n argocd
helm uninstall traefik -n argocd
kubectl delete ingressroute argocd-server -n argocd
```

### Escalar réplicas do Traefik

```bash
kubectl scale deployment traefik -n argocd --replicas=3
```

### Ver todos os recursos no namespace

```bash
kubectl get all -n argocd
```

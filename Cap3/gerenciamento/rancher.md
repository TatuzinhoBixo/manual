# Instalação do Rancher

## Descrição

Rancher é uma plataforma de gerenciamento de clusters Kubernetes. Permite gerenciar múltiplos clusters através de uma interface web unificada.

## Pré-requisitos

- Cluster RKE2 instalado
- Helm e kubectl configurados
- Certificado SSL criado como Secret (ver `secrets.md`)

## Variáveis de Configuração

| Variável | Descrição | Exemplo |
|:---------|:----------|:--------|
| `<DOMINIO_RANCHER>` | FQDN do Rancher | rancher.exemplo.com.br |
| `<SENHA_BOOTSTRAP>` | Senha inicial do admin | (usar senha forte) |
| `<NOME_SECRET_TLS>` | Nome do secret com certificado | tls-rancher |

---

## Etapa 1: Adicionar repositórios Helm

```bash
helm repo add rancher-stable https://releases.rancher.com/server-charts/stable
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm repo update
```

---

## Etapa 2: Instalar Ingress Controller

```bash
helm upgrade --install ingress-nginx ingress-nginx/ingress-nginx \
  --namespace ingress-nginx --create-namespace \
  --set controller.hostNetwork=true
```

> **hostNetwork=true**: Necessário em ambientes bare-metal com RKE2/K3s.

Verificar instalação:

```bash
kubectl get pods -n ingress-nginx
```

---

## Etapa 3: Instalar Rancher

```bash
helm upgrade --install rancher rancher-stable/rancher \
  --namespace cattle-system --create-namespace \
  --set hostname=<DOMINIO_RANCHER> \
  --set replicas=1 \
  --set bootstrapPassword=<SENHA_BOOTSTRAP> \
  --set ingress.tls.source=secret \
  --set ingress.tls.secretName=<NOME_SECRET_TLS> \
  --set ingress.ingressClassName=nginx
```

---

## Importação de Clusters Externos

Se houver problemas de certificado ao importar clusters, desabilite a verificação estrita:

### Opção 1: Via ConfigMap

```bash
kubectl create configmap cattle-config -n cattle-system --from-literal=STRICT_VERIFY="false"
```

### Opção 2: Editando Deployment

```bash
kubectl edit deployment cattle-cluster-agent -n cattle-system
```

Altere:

```yaml
- name: STRICT_VERIFY
  value: "false"
```

---

## Referências

- [Documentação Rancher](https://ranchermanager.docs.rancher.com/)
- [Instalação Rancher](https://ranchermanager.docs.rancher.com/getting-started/installation-and-upgrade)


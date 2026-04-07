# WordPress no Kubernetes com Istio

## Descrição

Este guia documenta a implantação do WordPress no Kubernetes utilizando Istio como service mesh para gerenciamento de tráfego e TLS. A aplicação utiliza volumes persistentes para armazenamento e se conecta a um banco de dados MariaDB externo.

## Arquitetura

```
Internet → Istio Gateway → VirtualService → WordPress Service → WordPress Pod
                                                    ↓
                                            MariaDB (externo)
```

## Pré-requisitos

- Cluster Kubernetes funcional
- Istio instalado e configurado
- MetalLB configurado (para ambientes bare-metal)
- StorageClass disponível para persistência
- Banco de dados MariaDB acessível
- Secret TLS criado para o domínio

## Variáveis de Configuração

| Variável | Descrição | Exemplo |
|:---------|:----------|:--------|
| `<NAMESPACE>` | Namespace da aplicação | wordpress |
| `<DB_HOST>` | Endereço do banco de dados | 192.168.1.51 |
| `<DB_NAME>` | Nome do banco de dados | wordpress |
| `<DB_USER>` | Usuário do banco de dados | wpuser |
| `<DB_PASSWORD>` | Senha do banco (base64) | (senha em base64) |
| `<STORAGECLASS>` | StorageClass para volumes | nfs-storage |
| `<DOMINIO>` | Domínio do WordPress | wordpress.exemplo.com.br |
| `<IP_INGRESS_GATEWAY>` | IP do Istio Ingress Gateway | 192.168.1.75 |
| `<NOME_SECRET_TLS>` | Nome do secret TLS | tls-certificado |
| `<VERSAO_ISTIO>` | Versão do Istio instalado | 1.27.0 |

---

## Arquivos de Manifesto

| Arquivo | Descrição |
|:--------|:----------|
| `wordpress-config-secret.yaml` | ConfigMap e Secret com configurações do banco |
| `wordpress-storage.yaml` | PVCs para arquivos do WordPress |
| `wordpress-deployment.yaml` | Deployment e Service do WordPress |
| `istio-gateway-wordpress.yaml` | Ingress Gateway dedicado e Gateway Istio |
| `wordpress-vs.yaml` | VirtualService para roteamento |

---

## Etapa 1: Criar Namespace

```bash
kubectl create namespace <NAMESPACE>
kubectl label namespace <NAMESPACE> istio-injection=enabled
```

---

## Etapa 2: Configurar Banco de Dados

### Gerar senha em Base64

```bash
echo -n '<DB_PASSWORD>' | base64
```

### Aplicar ConfigMap e Secret

Edite `wordpress-config-secret.yaml` com suas variáveis e aplique:

```bash
kubectl apply -f wordpress-config-secret.yaml
```

---

## Etapa 3: Criar Volumes Persistentes

Edite `wordpress-storage.yaml` com o StorageClass apropriado e aplique:

```bash
kubectl apply -f wordpress-storage.yaml
```

Verificar PVCs:

```bash
kubectl get pvc -n <NAMESPACE>
```

---

## Etapa 4: Implantar WordPress

```bash
kubectl apply -f wordpress-deployment.yaml
```

Verificar deployment:

```bash
kubectl get pods -n <NAMESPACE>
kubectl get svc -n <NAMESPACE>
```

---

## Etapa 5: Configurar Istio Gateway

### Copiar ConfigMap do Istio (necessário para o gateway customizado)

```bash
kubectl get configmap istio-ca-root-cert -n istio-system -o yaml | \
  sed 's/namespace: istio-system/namespace: <NAMESPACE>/' | \
  kubectl apply -f -
```

### Aplicar Gateway

Edite `istio-gateway-wordpress.yaml` com suas variáveis e aplique:

```bash
kubectl apply -f istio-gateway-wordpress.yaml
```

---

## Etapa 6: Configurar Roteamento

Edite `wordpress-vs.yaml` com seu domínio e aplique:

```bash
kubectl apply -f wordpress-vs.yaml
```

---

## Verificação Final

```bash
# Verificar pods
kubectl get pods -n <NAMESPACE>

# Verificar serviços
kubectl get svc -n <NAMESPACE>

# Verificar gateway
kubectl get gateway -n <NAMESPACE>

# Verificar virtual service
kubectl get virtualservice -n <NAMESPACE>

# Testar acesso (após configurar DNS)
curl -I https://<DOMINIO>
```

---

## Volumes Persistentes

| Volume | Caminho | Descrição |
|:-------|:--------|:----------|
| `wordpress-core` | `/var/www/html` | Arquivos core do WordPress |
| `wordpress-content` | `/var/www/html/wp-content` | Uploads, temas e plugins |

---

## Instalação Alternativa (Bare-Metal/VM)

Para instalação direta em servidor (sem Kubernetes), consulte o arquivo `wordpress-OS`.

---

## Troubleshooting

### Pod não inicia

```bash
# Ver eventos
kubectl describe pod -n <NAMESPACE> -l app=wordpress

# Ver logs
kubectl logs -n <NAMESPACE> -l app=wordpress
```

### Erro de conexão com banco

```bash
# Verificar secret
kubectl get secret wordpress-secret -n <NAMESPACE> -o yaml

# Testar conectividade
kubectl exec -it <POD_NAME> -n <NAMESPACE> -- mysql -h <DB_HOST> -u <DB_USER> -p
```

### Gateway não recebe IP

```bash
# Verificar MetalLB
kubectl get ipaddresspool -n metallb-system

# Verificar serviço do gateway
kubectl get svc -n <NAMESPACE> -l istio=ingressgateway
```

---

## Referências

- [WordPress Docker Image](https://hub.docker.com/_/wordpress)
- [Istio Gateway](https://istio.io/latest/docs/tasks/traffic-management/ingress/ingress-control/)
- [Kubernetes Persistent Volumes](https://kubernetes.io/docs/concepts/storage/persistent-volumes/)

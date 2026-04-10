# Longhorn - Storage Distribuído para Kubernetes

## Descrição

Longhorn é uma solução de armazenamento distribuído e altamente disponível para Kubernetes. Ele cria volumes persistentes replicados entre os nós do cluster, oferecendo resiliência e recuperação automática em caso de falha de nós ou discos.

## Características

- **Replicação**: Dados replicados entre múltiplos nós
- **Snapshots e Backups**: Suporte nativo a snapshots e backup para S3/NFS
- **UI Web**: Interface gráfica para gerenciamento
- **Disaster Recovery**: Volumes podem ser restaurados em outro cluster

## Pré-requisitos

- Cluster Kubernetes funcional
- Helm instalado e configurado
- Pacote `open-iscsi` instalado em todos os nós
- Disco ou partição dedicada (recomendado)

## Variáveis de Configuração

| Variável | Descrição | Exemplo |
|:---------|:----------|:--------|
| `<NAMESPACE>` | Namespace do Longhorn | longhorn-system |
| `<STORAGECLASS_NAME>` | Nome do StorageClass | longhorn |
| `<CAMINHO_DISCO>` | Caminho do disco no nó | /var/lib/longhorn |

---

## Etapa 1: Preparar os Nós

Instale o `open-iscsi` em **todos os nós** que serão usados para armazenamento:

```bash
# Debian/Ubuntu
sudo apt-get update
sudo apt-get install -y open-iscsi
sudo systemctl enable iscsid
sudo systemctl start iscsid
```

```bash
# RHEL/CentOS
sudo yum install -y iscsi-initiator-utils
sudo systemctl enable iscsid
sudo systemctl start iscsid
```

> **Recomendado**: Criar uma partição LVM dedicada para o Longhorn, evitando competição por espaço com o sistema operacional.

---

## Etapa 2: Adicionar Repositório Helm

```bash
helm repo add longhorn https://charts.longhorn.io
helm repo update
```

---

## Etapa 3: Instalar o Longhorn

### Instalação Básica

```bash
kubectl create namespace <NAMESPACE>

helm install longhorn longhorn/longhorn \
  --namespace <NAMESPACE>
```

### Instalação com Configurações Customizadas

```bash
helm install longhorn longhorn/longhorn \
  --namespace <NAMESPACE> \
  --set defaultSettings.defaultDataPath=<CAMINHO_DISCO> \
  --set defaultSettings.defaultReplicaCount=3 \
  --set persistence.defaultClassReplicaCount=3
```

---

## Etapa 4: Verificar Instalação

```bash
# Verificar pods do Longhorn
kubectl -n <NAMESPACE> get pods

# Verificar StorageClass criado
kubectl get storageclass

# Verificar status dos nós de armazenamento
kubectl -n <NAMESPACE> get nodes.longhorn.io
```

---

## Acessar Interface Web

O Longhorn possui uma UI web para gerenciamento. Para expô-la:

### Via Port-Forward (Desenvolvimento)

```bash
kubectl -n <NAMESPACE> port-forward svc/longhorn-frontend 8080:80
```

Acesse: `http://localhost:8080`

### Via Ingress (Produção)

Crie um Ingress para expor a UI:

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: longhorn-ingress
  namespace: <NAMESPACE>
spec:
  ingressClassName: <INGRESS_CLASS>
  rules:
  - host: longhorn.<DOMINIO>
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: longhorn-frontend
            port:
              number: 80
```

---

## Configurar como StorageClass Padrão

Para definir o Longhorn como StorageClass padrão:

```bash
# Remover default de outros StorageClass
kubectl patch storageclass <OUTRO_SC> -p '{"metadata": {"annotations":{"storageclass.kubernetes.io/is-default-class":"false"}}}'

# Definir Longhorn como default
kubectl patch storageclass longhorn -p '{"metadata": {"annotations":{"storageclass.kubernetes.io/is-default-class":"true"}}}'
```

---

## Comandos Úteis

```bash
# Listar volumes Longhorn
kubectl -n <NAMESPACE> get volumes.longhorn.io

# Ver réplicas de um volume
kubectl -n <NAMESPACE> get replicas.longhorn.io

# Verificar uso de disco nos nós
kubectl -n <NAMESPACE> get nodes.longhorn.io -o wide

# Logs do Longhorn Manager
kubectl -n <NAMESPACE> logs -l app=longhorn-manager
```

---

## Referências

- [Documentação Oficial Longhorn](https://longhorn.io/docs/)
- [Instalação via Helm](https://longhorn.io/docs/latest/deploy/install/install-with-helm/)
- [Requisitos de Sistema](https://longhorn.io/docs/latest/deploy/install/#installation-requirements)

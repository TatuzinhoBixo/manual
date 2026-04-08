# RabbitMQ no Kubernetes

## Descrição

O RabbitMQ é um message broker open source que implementa o protocolo AMQP. É utilizado para comunicação assíncrona entre serviços, desacoplando produtores e consumidores de mensagens.

Este tutorial cobre duas abordagens de instalação:
- **Helm (Bitnami)** — recomendado para ambiente de desenvolvimento/homelab, instalação rápida
- **Manifesto manual** — recomendado para produção, com maior controle sobre configuração, storage e réplicas

---

## Portas

| Porta   | Protocolo           | Descrição                                              |
| :------ | :------------------ | :----------------------------------------------------- |
| `5672`  | AMQP                | Conexão das aplicações (producers/consumers)           |
| `15672` | HTTP                | Painel web de administração (Management UI)            |
| `25672` | Erlang Distribution | Comunicação entre nós do cluster (RabbitMQ clustering) |
| `4369`  | EPMD                | Erlang Port Mapper Daemon — descoberta de nós          |

---

## Pré-requisitos

- Cluster Kubernetes funcional
- `kubectl` com acesso ao cluster
- Helm instalado (para instalação via Helm)
- StorageClass disponível no cluster (`<STORAGE_CLASS>`)
- Diretório NFS criado com permissões corretas (para instalação via manifesto com NFS)

---

## Variáveis de Configuração

| Variável          | Descrição                                  | Exemplo        |
| :---------------- | :----------------------------------------- | :------------- |
| `<NAMESPACE>`     | Namespace do RabbitMQ                      | rabbitmq       |
| `<RABBITMQ_USER>` | Usuário padrão                             | admin          |
| `<RABBITMQ_PASS>` | Senha padrão                               | admin123       |
| `<ERLANG_COOKIE>` | Cookie compartilhado entre nós do cluster  | mysecretcookie |
| `<STORAGE_CLASS>` | Nome do StorageClass disponível no cluster | sc-nfs         |
| `<STORAGE_SIZE>`  | Tamanho do volume de dados                 | 5Gi            |
| `<NUM_REPLICAS>`  | Número de réplicas (cluster RabbitMQ)      | 3              |
| `<NFS_PATH>`      | Caminho no servidor NFS                    | /nfs/rabbitmq  |

---

## Opção 1: Instalação via Helm (Bitnami)

Indicada para homelab e ambientes de desenvolvimento. A Bitnami já configura automaticamente o StatefulSet, Services, Secrets e PVCs.

### Etapa 1: Adicionar repositório

```bash
helm repo add bitnami https://charts.bitnami.com/bitnami
helm repo update
```

### Etapa 2: Instalar

```bash
helm install rabbitmq bitnami/rabbitmq \
  --namespace <NAMESPACE> \
  --create-namespace \
  --set auth.username=<RABBITMQ_USER> \
  --set auth.password=<RABBITMQ_PASS> \
  --set auth.erlangCookie=<ERLANG_COOKIE> \
  --set replicaCount=<NUM_REPLICAS> \
  --set persistence.storageClass=<STORAGE_CLASS> \
  --set persistence.size=<STORAGE_SIZE>
```

> **Nota**: Se não informar `auth.username` e `auth.password`, o Helm gera credenciais aleatórias automaticamente. Recupere com os comandos abaixo.

### Etapa 3: Recuperar credenciais geradas automaticamente

```bash
# Usuário
kubectl get secret rabbitmq -n <NAMESPACE> \
  -o jsonpath="{.data.rabbitmq-username}" | base64 -d

# Senha
kubectl get secret rabbitmq -n <NAMESPACE> \
  -o jsonpath="{.data.rabbitmq-password}" | base64 -d
```

### Etapa 4: Verificar instalação

```bash
kubectl get pods -n <NAMESPACE>
kubectl get svc -n <NAMESPACE>
kubectl get pvc -n <NAMESPACE>
```

---

## Opção 2: Instalação via Manifesto Manual

Indicada para produção. Oferece controle total sobre configuração, storage, réplicas e segurança.

### Replica única (Deployment)

Indicada para ambientes com um único nó de RabbitMQ, sem necessidade de clustering.

#### Preparar diretório NFS

Execute no servidor NFS:

```bash
mkdir -p <NFS_PATH>
chown -R 999:999 <NFS_PATH>
```

> O UID/GID `999` é o usuário padrão do container `rabbitmq` na imagem oficial.

#### Aplicar manifesto

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: <NAMESPACE>
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: rabbitmq-pvc
  namespace: <NAMESPACE>
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: <STORAGE_SIZE>
  storageClassName: <STORAGE_CLASS>
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: rabbitmq
  namespace: <NAMESPACE>
spec:
  replicas: 1
  selector:
    matchLabels:
      app: rabbitmq
  template:
    metadata:
      labels:
        app: rabbitmq
    spec:
      securityContext:
        fsGroup: 999
      containers:
        - name: rabbitmq
          image: rabbitmq:3.12-management
          ports:
            - containerPort: 5672   # AMQP
            - containerPort: 15672  # Management UI
          env:
            - name: RABBITMQ_DEFAULT_USER
              value: <RABBITMQ_USER>
            - name: RABBITMQ_DEFAULT_PASS
              value: <RABBITMQ_PASS>
            - name: RABBITMQ_ERLANG_COOKIE
              value: <ERLANG_COOKIE>
          securityContext:
            runAsUser: 999
            runAsGroup: 999
          volumeMounts:
            - name: rabbitmq-storage
              mountPath: /var/lib/rabbitmq
              subPath: rabbitmq
      volumes:
        - name: rabbitmq-storage
          persistentVolumeClaim:
            claimName: rabbitmq-pvc
---
apiVersion: v1
kind: Service
metadata:
  name: rabbitmq
  namespace: <NAMESPACE>
spec:
  selector:
    app: rabbitmq
  ports:
    - name: amqp
      port: 5672
      targetPort: 5672
    - name: management
      port: 15672
      targetPort: 15672
  type: ClusterIP
```

---

### Múltiplas réplicas (StatefulSet + Clustering)

Indicada para produção com alta disponibilidade. Utiliza StatefulSet para garantir identidade estável dos pods e um **Headless Service** para comunicação entre nós do cluster RabbitMQ.

> **Por que StatefulSet e não Deployment?**
> O RabbitMQ em cluster precisa que cada nó tenha um nome DNS estável e previsível (`rabbitmq-0`, `rabbitmq-1`, `rabbitmq-2`). O StatefulSet garante isso. Com Deployment, os pods recebem nomes aleatórios, o que impede o clustering via Erlang.

#### Preparar diretório NFS

```bash
mkdir -p <NFS_PATH>
chown -R 999:999 <NFS_PATH>
```

#### Aplicar manifesto

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: <NAMESPACE>
---
# Headless Service — necessário para o clustering entre nós
apiVersion: v1
kind: Service
metadata:
  name: rabbitmq-headless
  namespace: <NAMESPACE>
spec:
  clusterIP: None
  selector:
    app: rabbitmq
  ports:
    - name: amqp
      port: 5672
    - name: management
      port: 15672
    - name: clustering
      port: 25672
    - name: epmd
      port: 4369
---
# Service ClusterIP — acesso das aplicações ao RabbitMQ
apiVersion: v1
kind: Service
metadata:
  name: rabbitmq
  namespace: <NAMESPACE>
spec:
  selector:
    app: rabbitmq
  ports:
    - name: amqp
      port: 5672
      targetPort: 5672
    - name: management
      port: 15672
      targetPort: 15672
  type: ClusterIP
---
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: rabbitmq
  namespace: <NAMESPACE>
spec:
  serviceName: rabbitmq-headless
  replicas: <NUM_REPLICAS>
  selector:
    matchLabels:
      app: rabbitmq
  template:
    metadata:
      labels:
        app: rabbitmq
    spec:
      securityContext:
        fsGroup: 999
      containers:
        - name: rabbitmq
          image: rabbitmq:3.12-management
          ports:
            - containerPort: 5672
            - containerPort: 15672
            - containerPort: 25672
            - containerPort: 4369
          env:
            - name: RABBITMQ_DEFAULT_USER
              value: <RABBITMQ_USER>
            - name: RABBITMQ_DEFAULT_PASS
              value: <RABBITMQ_PASS>
            - name: RABBITMQ_ERLANG_COOKIE
              value: <ERLANG_COOKIE>
            - name: K8S_SERVICE_NAME
              value: rabbitmq-headless
            - name: RABBITMQ_USE_LONGNAME
              value: "true"
            - name: RABBITMQ_NODENAME
              valueFrom:
                fieldRef:
                  fieldPath: metadata.name
          securityContext:
            runAsUser: 999
            runAsGroup: 999
          volumeMounts:
            - name: rabbitmq-data
              mountPath: /var/lib/rabbitmq
  volumeClaimTemplates:
    - metadata:
        name: rabbitmq-data
      spec:
        accessModes:
          - ReadWriteOnce
        resources:
          requests:
            storage: <STORAGE_SIZE>
        storageClassName: <STORAGE_CLASS>
```

> **Nota**: O `volumeClaimTemplates` cria um PVC individual por réplica automaticamente (`rabbitmq-data-rabbitmq-0`, `rabbitmq-data-rabbitmq-1`, etc.). Diferente do Deployment onde todos os pods compartilhariam o mesmo PVC.

---

## Conexão das Aplicações

### Formato geral

```
amqp://<RABBITMQ_USER>:<RABBITMQ_PASS>@<HOST>:<PORTA>/<VHOST>
```

O `<VHOST>` padrão é `/`.

### Dentro do mesmo namespace

```bash
RABBITMQ_HOST=rabbitmq
RABBITMQ_PORT=5672
RABBITMQ_USER=<RABBITMQ_USER>
RABBITMQ_PASS=<RABBITMQ_PASS>
```

### De outro namespace

```bash
RABBITMQ_HOST=rabbitmq.<NAMESPACE>.svc.cluster.local
RABBITMQ_PORT=5672
RABBITMQ_USER=<RABBITMQ_USER>
RABBITMQ_PASS=<RABBITMQ_PASS>
```

---

## Acessar o Painel Web (Management UI)

```bash
kubectl port-forward svc/rabbitmq 15672:15672 -n <NAMESPACE>
```

Acesse: [http://localhost:15672](http://localhost:15672)

---

## Comandos Úteis

```bash
# Verificar pods
kubectl get pods -n <NAMESPACE>

# Verificar serviços
kubectl get svc -n <NAMESPACE>

# Logs do RabbitMQ
kubectl logs -n <NAMESPACE> -l app=rabbitmq

# Acompanhar logs em tempo real
kubectl logs -n <NAMESPACE> -l app=rabbitmq -f

# Abrir shell no pod
kubectl exec -it rabbitmq-0 -n <NAMESPACE> -- bash

# Listar filas via CLI dentro do pod
kubectl exec -it rabbitmq-0 -n <NAMESPACE> -- \
  rabbitmqctl list_queues

# Status do cluster (StatefulSet)
kubectl exec -it rabbitmq-0 -n <NAMESPACE> -- \
  rabbitmqctl cluster_status

# Verificar usuários
kubectl exec -it rabbitmq-0 -n <NAMESPACE> -- \
  rabbitmqctl list_users
```

---

## Referências

- [Documentação oficial RabbitMQ](https://www.rabbitmq.com/documentation.html)
- [RabbitMQ no Kubernetes — guia oficial](https://www.rabbitmq.com/kubernetes/operator/operator-overview.html)
- [Helm Chart Bitnami RabbitMQ](https://artifacthub.io/packages/helm/bitnami/rabbitmq)
- [Imagem oficial Docker Hub](https://hub.docker.com/_/rabbitmq)

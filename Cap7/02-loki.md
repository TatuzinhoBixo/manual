# Loki — Stack de Observabilidade Kubernetes

## Descrição Geral

O Loki é o sistema de agregação e consulta de logs da stack de observabilidade. Esta implantação segue a arquitetura **Simple Scalable** com três componentes independentes:

- **loki-write** — recebe logs via push (Promtail)
- **loki-backend** — executa compactação, retenção e gerenciamento de índices
- **loki-read** — responde queries (Grafana, LogQL)

O armazenamento de chunks e índices é feito no **MinIO**, que atua como object storage compatível com S3 dentro do cluster. O **Promtail** é implantado como DaemonSet para coletar logs de todos os pods do cluster.

O Grafana consome logs via datasource apontando para `loki-read` (ver tutorial: `01-kube-prometheus-stack.md`).

### Fluxo de dados

```
Pods do cluster
      │
      ▼
  Promtail (DaemonSet — 1 pod por node)
      │  HTTP push /loki/api/v1/push
      ▼
  loki-write (StatefulSet, 2 réplicas)
      │  chunks + índices
      ▼
    MinIO (Deployment — object storage S3)
      ▲
  loki-backend (StatefulSet, 2 réplicas)
    compactor / index-gateway / ruler
      │
  loki-read (Deployment, 2 réplicas)
      ▲
    Grafana (queries LogQL)
```

---

## Tabela de Variáveis

| Variável                      | Descrição                                      | Exemplo            |
| ----------------------------- | ---------------------------------------------- | ------------------ |
| `<NAMESPACE>`                 | Namespace de observabilidade                   | `monitor`          |
| `<STORAGE_CLASS>`             | StorageClass do namespace                      | `sc-monitor`       |
| `<MINIO_STORAGE_SIZE>`        | Tamanho do PVC do MinIO                        | `200Gi`            |
| `<LOKI_WRITE_STORAGE_SIZE>`   | Tamanho do PVC por pod loki-write              | `10Gi`             |
| `<LOKI_BACKEND_STORAGE_SIZE>` | Tamanho do PVC por pod loki-backend            | `10Gi`             |
| `<LOKI_RETENTION_PERIOD>`     | Retenção de logs                               | `720h`             |
| `<MINIO_ROOT_USER_B64>`       | Usuário root do MinIO em base64                | `bWluaW9hZG1pbg==` |
| `<MINIO_ROOT_PASSWORD_B64>`   | Senha root do MinIO em base64                  | —                  |
| `<DOMAIN>`                    | Domínio base                                   | `example.com`      |
| `<TLS_SECRET_NAME>`           | Nome do secret TLS no namespace `istio-system` | `tls-example`      |

---

## Pré-requisitos

- Namespace `<NAMESPACE>` criado no cluster
- StorageClass `<STORAGE_CLASS>` disponível no cluster (não será detalhada neste tutorial)
- Istio instalado e operacional no cluster
- Secret TLS `<TLS_SECRET_NAME>` criado no namespace `istio-system` (não será detalhado neste tutorial)
- DNS apontando `loki.<DOMAIN>` para o IP do Istio IngressGateway
- Grafana implantado no mesmo namespace (ver tutorial: `01-kube-prometheus-stack.md`)

---

## Etapas

### Parte 1 — MinIO

O MinIO deve ser implantado **antes** do Loki. Os componentes Loki dependem dos buckets `loki-data` e `loki-ruler` para inicializar.

Escolha entre **duas topologias**:

| Opção | Réplicas | Quando usar |
| :-- | :-- | :-- |
| **A — Standalone** | 1 | Lab, ambientes single-node, volume baixo de logs. Sem HA. |
| **B — Distribuído** | **4** (mínimo) | Produção, HA real com erasure coding. Tolera 1 drive offline. |

> **Por que 4 e não 3?** MinIO distribuído exige `drives >= 4` para erasure coding. Com menos, o servidor recusa iniciar. Outros números válidos: 6, 8, 16. Este tutorial cobre a configuração de 4 pods.

Os passos **1.1 (Secret)**, **1.3 (Service)**, **1.4 (DestinationRule)** e **1.6 (Buckets)** são **comuns às duas opções**. O que muda é o passo **1.2 (PVC/headless)** e o **1.5 (Deployment vs StatefulSet)**.

#### 1.1 Criar o Secret de credenciais

> **Recomendação para produção:** Utilize Sealed Secrets para não versionar credenciais em texto no repositório Git.
>
> ```bash
> # Gerar valores base64
> echo -n 'seu-usuario' | base64
> echo -n 'sua-senha'   | base64
>
> # Alternativa com Sealed Secrets
> kubectl create secret generic minio-credentials \
>   --from-literal=root-user='<MINIO_USER>' \
>   --from-literal=root-password='<MINIO_PASSWORD>' \
>   --namespace <NAMESPACE> \
>   --dry-run=client -o yaml | \
>   kubeseal --format yaml > minio-credentials-sealed.yaml
>
> kubectl apply -f minio-credentials-sealed.yaml
> ```

```yaml
# minio-secret.yaml
apiVersion: v1
kind: Secret
metadata:
  name: minio-credentials
  namespace: <NAMESPACE>
  labels:
    app: minio
type: Opaque
data:
  root-user: <MINIO_ROOT_USER_B64>         # echo -n 'usuario' | base64
  root-password: <MINIO_ROOT_PASSWORD_B64> # echo -n 'senha' | base64
```

```bash
kubectl apply -f minio-secret.yaml
```

---

#### 1.2 Criar o armazenamento do MinIO

**🅐 Opção A — Standalone (PVC único)**

```yaml
# minio-pvc.yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: minio-storage
  namespace: <NAMESPACE>
  labels:
    app: minio
spec:
  accessModes:
    - ReadWriteOnce
  storageClassName: <STORAGE_CLASS>   # ex: sc-monitor
  resources:
    requests:
      storage: <MINIO_STORAGE_SIZE>   # ex: 200Gi
```

```bash
kubectl apply -f minio-pvc.yaml
```

**🅑 Opção B — Distribuído (Service headless)**

Na Opção B não criamos PVC manualmente — o StatefulSet (passo 1.5B) usa `volumeClaimTemplates` que gera 1 PVC por pod automaticamente. O que criamos aqui é o **Service headless** necessário para os pods se descobrirem por DNS (`minio-0.minio-headless...`, `minio-1...`, etc.):

```yaml
# minio-headless-service.yaml
apiVersion: v1
kind: Service
metadata:
  name: minio-headless
  namespace: <NAMESPACE>
  labels:
    app: minio
spec:
  type: ClusterIP
  clusterIP: None              # headless
  publishNotReadyAddresses: true
  selector:
    app: minio
  ports:
    - name: http-api
      port: 9000
      targetPort: 9000
```

```bash
kubectl apply -f minio-headless-service.yaml
```

---

#### 1.3 Criar o Service do MinIO

```yaml
# minio-service.yaml
apiVersion: v1
kind: Service
metadata:
  name: minio
  namespace: <NAMESPACE>
  labels:
    app: minio
spec:
  type: ClusterIP
  selector:
    app: minio
  ports:
    - name: http-api
      port: 9000
      targetPort: 9000
      protocol: TCP
    - name: http-console
      port: 9001
      targetPort: 9001
      protocol: TCP
```

```bash
kubectl apply -f minio-service.yaml
```

---

#### 1.4 Criar o DestinationRule do MinIO

O MinIO roda com `sidecar.istio.io/inject: "false"`. O DestinationRule desabilita mTLS para comunicação interna.

```yaml
# minio-destinationrule.yaml
apiVersion: networking.istio.io/v1
kind: DestinationRule
metadata:
  name: minio
  namespace: <NAMESPACE>
spec:
  host: minio.<NAMESPACE>.svc.cluster.local
  trafficPolicy:
    tls:
      mode: DISABLE
```

```bash
kubectl apply -f minio-destinationrule.yaml
```

---

#### 1.5 Criar o workload do MinIO

> **Nota — imagem:** antes de aplicar, confirme a tag mais recente em https://hub.docker.com/r/minio/minio/tags. Os exemplos abaixo usam `<MINIO_IMAGE>` como placeholder; substitua por uma tag `RELEASE.YYYY-MM-DDTHH-MM-SSZ` recente (`# ex: minio/minio:RELEASE.2026-02-15T00-00-00Z`).

**🅐 Opção A — Standalone (Deployment, 1 réplica)**

```yaml
# minio-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: minio
  namespace: <NAMESPACE>
  labels:
    app: minio
spec:
  replicas: 1
  strategy:
    type: Recreate
  selector:
    matchLabels:
      app: minio
  template:
    metadata:
      labels:
        app: minio
        sidecar.istio.io/inject: "false"
    spec:
      containers:
        - name: minio
          image: <MINIO_IMAGE>   # ex: minio/minio:RELEASE.2026-02-15T00-00-00Z
          args:
            - server
            - /data
            - --console-address
            - ":9001"
          ports:
            - containerPort: 9000
              name: http-api
            - containerPort: 9001
              name: http-console
          env:
            - name: MINIO_ROOT_USER
              valueFrom:
                secretKeyRef:
                  name: minio-credentials
                  key: root-user
            - name: MINIO_ROOT_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: minio-credentials
                  key: root-password
          resources:
            requests:
              cpu: 250m
              memory: 512Mi
            limits:
              cpu: 1000m
              memory: 1Gi
          volumeMounts:
            - name: data
              mountPath: /data
          readinessProbe:
            httpGet:
              path: /minio/health/ready
              port: 9000
            initialDelaySeconds: 10
            periodSeconds: 10
          livenessProbe:
            httpGet:
              path: /minio/health/live
              port: 9000
            initialDelaySeconds: 30
            periodSeconds: 30
      volumes:
        - name: data
          persistentVolumeClaim:
            claimName: minio-storage
```

```bash
kubectl apply -f minio-deployment.yaml
kubectl rollout status deployment/minio -n <NAMESPACE>
```

**🅑 Opção B — Distribuído (StatefulSet, 4 réplicas)**

Diferenças principais em relação à Opção A:

- **StatefulSet** no lugar de Deployment (pods com identidade estável: `minio-0`, `minio-1`, `minio-2`, `minio-3`)
- **`volumeClaimTemplates`** — cada pod recebe seu próprio PVC de `<MINIO_STORAGE_SIZE>`
- **`serviceName: minio-headless`** — usa o Service headless criado em 1.2B
- **args do MinIO** — listam explicitamente os 4 pods, ativando o modo distribuído com erasure coding
- **Anti-affinity** — opcional mas recomendado: espalhar pods por nodes diferentes

```yaml
# minio-statefulset.yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: minio
  namespace: <NAMESPACE>
  labels:
    app: minio
spec:
  serviceName: minio-headless
  replicas: 4
  podManagementPolicy: Parallel   # pods sobem em paralelo — necessário pro cluster formar
  selector:
    matchLabels:
      app: minio
  template:
    metadata:
      labels:
        app: minio
        sidecar.istio.io/inject: "false"
    spec:
      affinity:
        podAntiAffinity:
          preferredDuringSchedulingIgnoredDuringExecution:
            - weight: 100
              podAffinityTerm:
                labelSelector:
                  matchLabels:
                    app: minio
                topologyKey: kubernetes.io/hostname
      containers:
        - name: minio
          image: <MINIO_IMAGE>   # ex: minio/minio:RELEASE.2026-02-15T00-00-00Z
          args:
            - server
            - --console-address
            - ":9001"
            - http://minio-{0...3}.minio-headless.<NAMESPACE>.svc.cluster.local/data
          ports:
            - containerPort: 9000
              name: http-api
            - containerPort: 9001
              name: http-console
          env:
            - name: MINIO_ROOT_USER
              valueFrom:
                secretKeyRef:
                  name: minio-credentials
                  key: root-user
            - name: MINIO_ROOT_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: minio-credentials
                  key: root-password
          resources:
            requests:
              cpu: 250m
              memory: 512Mi
            limits:
              cpu: 1000m
              memory: 1Gi
          volumeMounts:
            - name: data
              mountPath: /data
          readinessProbe:
            httpGet:
              path: /minio/health/ready
              port: 9000
            initialDelaySeconds: 15
            periodSeconds: 10
          livenessProbe:
            httpGet:
              path: /minio/health/live
              port: 9000
            initialDelaySeconds: 60
            periodSeconds: 30
  volumeClaimTemplates:
    - metadata:
        name: data
        labels:
          app: minio
      spec:
        accessModes:
          - ReadWriteOnce
        storageClassName: <STORAGE_CLASS>   # ex: sc-monitor
        resources:
          requests:
            storage: <MINIO_STORAGE_SIZE>   # ex: 200Gi (por pod — total = 4×)
```

```bash
kubectl apply -f minio-statefulset.yaml
kubectl rollout status statefulset/minio -n <NAMESPACE>

# Verificar que os 4 pods subiram
kubectl get pods -n <NAMESPACE> -l app=minio -o wide

# Verificar logs — deve mostrar "MinIO Object Storage Server" e "Status: 4 Online, 0 Offline"
kubectl logs -n <NAMESPACE> minio-0 | grep -iE "online|offline|erasure"
```

> **Capacidade útil:** com 4 pods e erasure coding padrão (EC:2), a capacidade útil é ~**50%** do total. Com `<MINIO_STORAGE_SIZE>=200Gi` × 4 pods = 800Gi provisionado, ~400Gi utilizável.

---

#### 1.6 Criar os buckets via Job

> **Nota:** Imagem fixada em `minio/mc:RELEASE.2025-07-21T05-28-08Z`. Verifique a versão mais recente em https://hub.docker.com/r/minio/mc/tags.

```yaml
# minio-create-buckets.yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: minio-create-buckets
  namespace: <NAMESPACE>
  labels:
    app: minio
spec:
  backoffLimit: 10
  template:
    metadata:
      labels:
        app: minio-create-buckets
        sidecar.istio.io/inject: "false"
    spec:
      restartPolicy: OnFailure
      containers:
        - name: mc
          image: minio/mc:RELEASE.2025-07-21T05-28-08Z # verifique a versão mais recente
          command:
            - /bin/sh
            - -c
            - |
              until mc alias set myminio http://minio:9000 $MINIO_ROOT_USER $MINIO_ROOT_PASSWORD; do
                echo "Waiting for MinIO..."
                sleep 5
              done
              mc mb --ignore-existing myminio/loki-data
              mc mb --ignore-existing myminio/loki-ruler
              echo "Buckets created successfully"
          env:
            - name: MINIO_ROOT_USER
              valueFrom:
                secretKeyRef:
                  name: minio-credentials
                  key: root-user
            - name: MINIO_ROOT_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: minio-credentials
                  key: root-password
```

```bash
kubectl apply -f minio-create-buckets.yaml

# Aguardar conclusão
kubectl wait --for=condition=complete job/minio-create-buckets -n <NAMESPACE> --timeout=120s
```

---

### Parte 2 — Loki

#### 2.1 Criar o ConfigMap de configuração

```yaml
# loki-configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: loki-config
  namespace: <NAMESPACE>
  labels:
    app: loki
data:
  config.yaml: |
    auth_enabled: false
    server:
      http_listen_port: 3100
      grpc_listen_port: 9095
      log_level: info
    common:
      path_prefix: /loki
      replication_factor: 2
      compactor_grpc_address: dns:///loki-backend-headless.<NAMESPACE>.svc.cluster.local:9095
      ring:
        kvstore:
          store: memberlist
      storage:
        s3:
          endpoint: minio.<NAMESPACE>.svc.cluster.local:9000
          bucketnames: loki-data
          access_key_id: ${MINIO_ROOT_USER}
          secret_access_key: ${MINIO_ROOT_PASSWORD}
          insecure: true
          s3forcepathstyle: true
    memberlist:
      join_members:
        - loki-memberlist.<NAMESPACE>.svc.cluster.local:7946
    schema_config:
      configs:
        - from: "2024-01-01"
          store: tsdb
          object_store: s3
          schema: v13
          index:
            prefix: loki_index_
            period: 24h
    ingester:
      chunk_encoding: snappy
    limits_config:
      retention_period: <LOKI_RETENTION_PERIOD>
      max_query_series: 100000
      ingestion_burst_size_mb: 16
      ingestion_rate_mb: 8
      per_stream_rate_limit: 5MB
      per_stream_rate_limit_burst: 15MB
    compactor:
      working_directory: /loki/compactor
      compaction_interval: 10m
      retention_enabled: true
      delete_request_store: s3
      compactor_ring:
        kvstore:
          store: memberlist
    query_range:
      parallelise_shardable_queries: true
    frontend:
      max_outstanding_per_tenant: 4096
      compress_responses: true
```

```bash
kubectl apply -f loki-configmap.yaml
```

---

#### 2.2 Criar os Services

```yaml
# loki-services.yaml
apiVersion: v1
kind: Service
metadata:
  name: loki-memberlist
  namespace: <NAMESPACE>
  labels:
    app: loki
spec:
  type: ClusterIP
  clusterIP: None
  publishNotReadyAddresses: true
  selector:
    app: loki
  ports:
    - name: tcp-memberlist
      port: 7946
      targetPort: 7946
      protocol: TCP
---
apiVersion: v1
kind: Service
metadata:
  name: loki-read
  namespace: <NAMESPACE>
  labels:
    app: loki
    component: read
spec:
  type: ClusterIP
  selector:
    app: loki
    component: read
  ports:
    - name: http-loki
      port: 3100
      targetPort: 3100
    - name: grpc-loki
      port: 9095
      targetPort: 9095
---
apiVersion: v1
kind: Service
metadata:
  name: loki-write
  namespace: <NAMESPACE>
  labels:
    app: loki
    component: write
spec:
  type: ClusterIP
  selector:
    app: loki
    component: write
  ports:
    - name: http-loki
      port: 3100
      targetPort: 3100
    - name: grpc-loki
      port: 9095
      targetPort: 9095
---
apiVersion: v1
kind: Service
metadata:
  name: loki-write-headless
  namespace: <NAMESPACE>
  labels:
    app: loki
    component: write
spec:
  type: ClusterIP
  clusterIP: None
  selector:
    app: loki
    component: write
  ports:
    - name: http-loki
      port: 3100
      targetPort: 3100
    - name: grpc-loki
      port: 9095
      targetPort: 9095
---
apiVersion: v1
kind: Service
metadata:
  name: loki-backend
  namespace: <NAMESPACE>
  labels:
    app: loki
    component: backend
spec:
  type: ClusterIP
  selector:
    app: loki
    component: backend
  ports:
    - name: http-loki
      port: 3100
      targetPort: 3100
    - name: grpc-loki
      port: 9095
      targetPort: 9095
---
apiVersion: v1
kind: Service
metadata:
  name: loki-backend-headless
  namespace: <NAMESPACE>
  labels:
    app: loki
    component: backend
spec:
  type: ClusterIP
  clusterIP: None
  selector:
    app: loki
    component: backend
  ports:
    - name: http-loki
      port: 3100
      targetPort: 3100
    - name: grpc-loki
      port: 9095
      targetPort: 9095
```

```bash
kubectl apply -f loki-services.yaml
```

---

#### 2.3 Criar os DestinationRules

Todos os componentes Loki rodam com `sidecar.istio.io/inject: "false"`.

```yaml
# loki-destinationrules.yaml
apiVersion: networking.istio.io/v1
kind: DestinationRule
metadata:
  name: loki-read
  namespace: <NAMESPACE>
spec:
  host: loki-read.<NAMESPACE>.svc.cluster.local
  trafficPolicy:
    tls:
      mode: DISABLE
---
apiVersion: networking.istio.io/v1
kind: DestinationRule
metadata:
  name: loki-write
  namespace: <NAMESPACE>
spec:
  host: loki-write.<NAMESPACE>.svc.cluster.local
  trafficPolicy:
    tls:
      mode: DISABLE
---
apiVersion: networking.istio.io/v1
kind: DestinationRule
metadata:
  name: loki-backend
  namespace: <NAMESPACE>
spec:
  host: loki-backend.<NAMESPACE>.svc.cluster.local
  trafficPolicy:
    tls:
      mode: DISABLE
```

```bash
kubectl apply -f loki-destinationrules.yaml
```

---

#### 2.4 Criar o Deployment loki-read

> **Nota:** Imagem fixada em `grafana/loki:3.3.2`. Verifique a versão mais recente em https://hub.docker.com/r/grafana/loki/tags.

```yaml
# loki-read-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: loki-read
  namespace: <NAMESPACE>
  labels:
    app: loki
    component: read
spec:
  replicas: 2
  selector:
    matchLabels:
      app: loki
      component: read
  template:
    metadata:
      labels:
        app: loki
        component: read
        sidecar.istio.io/inject: "false"
    spec:
      containers:
        - name: loki
          image: grafana/loki:3.3.2 # verifique a versão mais recente
          args:
            - -config.file=/etc/loki/config.yaml
            - -target=read
            - -config.expand-env=true
          ports:
            - containerPort: 3100
              name: http-loki
            - containerPort: 9095
              name: grpc-loki
            - containerPort: 7946
              name: tcp-memberlist
          env:
            - name: MINIO_ROOT_USER
              valueFrom:
                secretKeyRef:
                  name: minio-credentials
                  key: root-user
            - name: MINIO_ROOT_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: minio-credentials
                  key: root-password
          resources:
            requests:
              cpu: 250m
              memory: 512Mi
            limits:
              cpu: 1000m
              memory: 1Gi
          readinessProbe:
            httpGet:
              path: /ready
              port: 3100
            initialDelaySeconds: 15
            periodSeconds: 10
          livenessProbe:
            httpGet:
              path: /ready
              port: 3100
            initialDelaySeconds: 30
            periodSeconds: 30
          volumeMounts:
            - name: config
              mountPath: /etc/loki
              readOnly: true
      volumes:
        - name: config
          configMap:
            name: loki-config
```

```bash
kubectl apply -f loki-read-deployment.yaml
```

---

#### 2.5 Criar o StatefulSet loki-write

```yaml
# loki-write-statefulset.yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: loki-write
  namespace: <NAMESPACE>
  labels:
    app: loki
    component: write
spec:
  serviceName: loki-write-headless
  replicas: 2
  selector:
    matchLabels:
      app: loki
      component: write
  template:
    metadata:
      labels:
        app: loki
        component: write
        sidecar.istio.io/inject: "false"
    spec:
      containers:
        - name: loki
          image: grafana/loki:3.3.2 # verifique a versão mais recente
          args:
            - -config.file=/etc/loki/config.yaml
            - -target=write
            - -config.expand-env=true
          ports:
            - containerPort: 3100
              name: http-loki
            - containerPort: 9095
              name: grpc-loki
            - containerPort: 7946
              name: tcp-memberlist
          env:
            - name: MINIO_ROOT_USER
              valueFrom:
                secretKeyRef:
                  name: minio-credentials
                  key: root-user
            - name: MINIO_ROOT_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: minio-credentials
                  key: root-password
          resources:
            requests:
              cpu: 250m
              memory: 512Mi
            limits:
              cpu: 1000m
              memory: 1Gi
          readinessProbe:
            httpGet:
              path: /ready
              port: 3100
            initialDelaySeconds: 15
            periodSeconds: 10
          livenessProbe:
            httpGet:
              path: /ready
              port: 3100
            initialDelaySeconds: 30
            periodSeconds: 30
          volumeMounts:
            - name: config
              mountPath: /etc/loki
              readOnly: true
            - name: data
              mountPath: /loki
      volumes:
        - name: config
          configMap:
            name: loki-config
  volumeClaimTemplates:
    - metadata:
        name: data
        labels:
          app: loki
          component: write
      spec:
        accessModes:
          - ReadWriteOnce
        storageClassName: <STORAGE_CLASS>
        resources:
          requests:
            storage: <LOKI_WRITE_STORAGE_SIZE>
```

```bash
kubectl apply -f loki-write-statefulset.yaml
```

---

#### 2.6 Criar o StatefulSet loki-backend

```yaml
# loki-backend-statefulset.yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: loki-backend
  namespace: <NAMESPACE>
  labels:
    app: loki
    component: backend
spec:
  serviceName: loki-backend-headless
  replicas: 2
  selector:
    matchLabels:
      app: loki
      component: backend
  template:
    metadata:
      labels:
        app: loki
        component: backend
        sidecar.istio.io/inject: "false"
    spec:
      containers:
        - name: loki
          image: grafana/loki:3.3.2 # verifique a versão mais recente
          args:
            - -config.file=/etc/loki/config.yaml
            - -target=backend
            - -config.expand-env=true
          ports:
            - containerPort: 3100
              name: http-loki
            - containerPort: 9095
              name: grpc-loki
            - containerPort: 7946
              name: tcp-memberlist
          env:
            - name: MINIO_ROOT_USER
              valueFrom:
                secretKeyRef:
                  name: minio-credentials
                  key: root-user
            - name: MINIO_ROOT_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: minio-credentials
                  key: root-password
          resources:
            requests:
              cpu: 250m
              memory: 512Mi
            limits:
              cpu: 1000m
              memory: 1Gi
          readinessProbe:
            httpGet:
              path: /ready
              port: 3100
            initialDelaySeconds: 15
            periodSeconds: 10
          livenessProbe:
            httpGet:
              path: /ready
              port: 3100
            initialDelaySeconds: 30
            periodSeconds: 30
          volumeMounts:
            - name: config
              mountPath: /etc/loki
              readOnly: true
            - name: data
              mountPath: /loki
      volumes:
        - name: config
          configMap:
            name: loki-config
  volumeClaimTemplates:
    - metadata:
        name: data
        labels:
          app: loki
          component: backend
      spec:
        accessModes:
          - ReadWriteOnce
        storageClassName: <STORAGE_CLASS>
        resources:
          requests:
            storage: <LOKI_BACKEND_STORAGE_SIZE>
```

```bash
kubectl apply -f loki-backend-statefulset.yaml
```

---

#### 2.7 Criar o Istio Gateway e VirtualService

```yaml
# loki-istio.yaml
apiVersion: networking.istio.io/v1
kind: Gateway
metadata:
  name: loki-gateway
  namespace: <NAMESPACE>
spec:
  selector:
    app: monitor-ingressgateway    # ex: monitor-ingressgateway (IngressGateway dedicado)
    istio: ingressgateway
  servers:
    - hosts:
        - loki.<DOMAIN>
      port:
        name: http
        number: 80
        protocol: HTTP
      tls:
        httpsRedirect: true
    - hosts:
        - loki.<DOMAIN>
      port:
        name: https
        number: 443
        protocol: HTTPS
      tls:
        credentialName: <TLS_SECRET_NAME>
        mode: SIMPLE
---
apiVersion: networking.istio.io/v1
kind: VirtualService
metadata:
  name: loki
  namespace: <NAMESPACE>
spec:
  gateways:
    - loki-gateway
  hosts:
    - loki.<DOMAIN>
  http:
    - match:
        - uri:
            prefix: /
      route:
        - destination:
            host: loki-read.<NAMESPACE>.svc.cluster.local
            port:
              number: 3100
```

```bash
kubectl apply -f loki-istio.yaml
```

---

### Parte 3 — Promtail

#### 3.1 Criar o ServiceAccount e RBAC

```yaml
# promtail-rbac.yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: promtail
  namespace: <NAMESPACE>
  labels:
    app: promtail
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: promtail
  labels:
    app: promtail
rules:
  - apiGroups: [""]
    resources:
      - nodes
      - nodes/proxy
      - services
      - endpoints
      - pods
    verbs: ["get", "watch", "list"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: promtail
  labels:
    app: promtail
subjects:
  - kind: ServiceAccount
    name: promtail
    namespace: <NAMESPACE>
roleRef:
  kind: ClusterRole
  name: promtail
  apiGroup: rbac.authorization.k8s.io
```

```bash
kubectl apply -f promtail-rbac.yaml
```

---

#### 3.2 Criar o ConfigMap do Promtail

```yaml
# promtail-configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: promtail-config
  namespace: <NAMESPACE>
  labels:
    app: promtail
data:
  config.yaml: |
    server:
      http_listen_port: 3101
      grpc_listen_port: 0
      log_level: info
    positions:
      filename: /run/promtail/positions.yaml
    clients:
      - url: http://loki-write.<NAMESPACE>.svc.cluster.local:3100/loki/api/v1/push
    scrape_configs:
      - job_name: kubernetes-pods
        kubernetes_sd_configs:
          - role: pod
        relabel_configs:
          - source_labels: [__meta_kubernetes_pod_controller_name]
            regex: ([0-9a-z-.]+?)(-[0-9a-f]{8,10})?
            action: replace
            target_label: __tmp_controller_name
          - source_labels:
              - __meta_kubernetes_pod_label_app_kubernetes_io_name
              - __meta_kubernetes_pod_label_app
              - __tmp_controller_name
              - __meta_kubernetes_pod_name
            regex: ^;*([^;]+)(;.*)?$
            action: replace
            target_label: app
          - source_labels:
              - __meta_kubernetes_pod_label_app_kubernetes_io_instance
              - __meta_kubernetes_pod_label_instance
            regex: ^;*([^;]+)(;.*)?$
            action: replace
            target_label: instance
          - source_labels:
              - __meta_kubernetes_pod_label_app_kubernetes_io_component
              - __meta_kubernetes_pod_label_component
            regex: ^;*([^;]+)(;.*)?$
            action: replace
            target_label: component
          - action: replace
            source_labels: [__meta_kubernetes_pod_node_name]
            target_label: node_name
          - action: replace
            source_labels: [__meta_kubernetes_namespace]
            target_label: namespace
          - action: replace
            source_labels: [__meta_kubernetes_pod_name]
            target_label: pod
          - action: replace
            source_labels: [__meta_kubernetes_pod_container_name]
            target_label: container
          - action: replace
            replacement: /var/log/pods/*$1/*.log
            separator: /
            source_labels:
              - __meta_kubernetes_pod_uid
              - __meta_kubernetes_pod_container_name
            target_label: __path__
```

```bash
kubectl apply -f promtail-configmap.yaml
```

---

#### 3.3 Criar o DaemonSet do Promtail

> **Nota:** Imagem fixada em `grafana/promtail:3.3.2`. Verifique a versão mais recente em https://hub.docker.com/r/grafana/promtail/tags.

```yaml
# promtail-daemonset.yaml
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: promtail
  namespace: <NAMESPACE>
  labels:
    app: promtail
spec:
  selector:
    matchLabels:
      app: promtail
  template:
    metadata:
      labels:
        app: promtail
        sidecar.istio.io/inject: "false"
    spec:
      serviceAccountName: promtail
      containers:
        - name: promtail
          image: grafana/promtail:3.3.2 # verifique a versão mais recente
          args:
            - -config.file=/etc/promtail/config.yaml
          ports:
            - containerPort: 3101
              name: http-metrics
          env:
            - name: HOSTNAME
              valueFrom:
                fieldRef:
                  fieldPath: spec.nodeName
          resources:
            requests:
              cpu: 50m
              memory: 64Mi
            limits:
              cpu: 200m
              memory: 256Mi
          readinessProbe:
            httpGet:
              path: /ready
              port: 3101
            initialDelaySeconds: 10
            periodSeconds: 10
          volumeMounts:
            - name: config
              mountPath: /etc/promtail
              readOnly: true
            - name: run
              mountPath: /run/promtail
            - name: pods
              mountPath: /var/log/pods
              readOnly: true
      tolerations:
        - effect: NoSchedule
          operator: Exists
        - effect: NoExecute
          operator: Exists
      volumes:
        - name: config
          configMap:
            name: promtail-config
        - name: run
          hostPath:
            path: /run/promtail
        - name: pods
          hostPath:
            path: /var/log/pods
```

```bash
kubectl apply -f promtail-daemonset.yaml
```

---

## Tabela de Parâmetros Importantes

| Parâmetro                          | Localização                         | Descrição                                                            |
| ---------------------------------- | ----------------------------------- | -------------------------------------------------------------------- |
| `replication_factor`               | `loki-config` → `common`            | Fator de replicação dos chunks. Deve ser ≤ réplicas do `loki-write`  |
| `retention_period`                 | `loki-config` → `limits_config`     | Período de retenção. Requer `retention_enabled: true` no compactor   |
| `retention_enabled`                | `loki-config` → `compactor`         | Habilita remoção de chunks expirados                                 |
| `ingestion_rate_mb`                | `loki-config` → `limits_config`     | Taxa de ingestão por stream em MB/s                                  |
| `s3forcepathstyle`                 | `loki-config` → `common.storage.s3` | Obrigatório para MinIO (não usa virtual-hosted style)                |
| `insecure: true`                   | `loki-config` → `common.storage.s3` | Desabilita TLS na conexão com MinIO interno                          |
| `-config.expand-env=true`          | args dos componentes Loki           | Permite uso de `${VAR}` no config para injetar credenciais do Secret |
| `sidecar.istio.io/inject: "false"` | Todos os componentes Loki/MinIO     | Desabilita sidecar Istio — requer DestinationRule com `tls: DISABLE` |
| `publishNotReadyAddresses: true`   | Service `loki-memberlist`           | Pods em inicialização já participam do ring memberlist               |
| `tolerations`                      | Promtail DaemonSet                  | Garante coleta de logs em nodes com taints                           |

---

## Comandos Úteis

```bash
# Status geral
kubectl get pods -n <NAMESPACE> -l app=loki
kubectl get pods -n <NAMESPACE> -l app=minio
kubectl get pods -n <NAMESPACE> -l app=promtail

# Logs por componente
kubectl logs -n <NAMESPACE> -l app=loki,component=write   --tail=100 -f
kubectl logs -n <NAMESPACE> -l app=loki,component=read    --tail=100 -f
kubectl logs -n <NAMESPACE> -l app=loki,component=backend --tail=100 -f
kubectl logs -n <NAMESPACE> -l app=promtail               --tail=100 -f

# Health e ring via port-forward
kubectl port-forward -n <NAMESPACE> svc/loki-read 3100:3100
curl http://localhost:3100/ready
curl http://localhost:3100/ring

# Targets do Promtail
kubectl port-forward -n <NAMESPACE> daemonset/promtail 3101:3101
curl http://localhost:3101/targets

# Console MinIO
kubectl port-forward -n <NAMESPACE> svc/minio 9001:9001
# Acessar: http://localhost:9001

# PVCs
kubectl get pvc -n <NAMESPACE> -l app=loki
kubectl get pvc -n <NAMESPACE> -l app=minio

# Recriar Job de buckets
kubectl delete job minio-create-buckets -n <NAMESPACE>
kubectl apply -f minio-create-buckets.yaml

# Rollout restart
kubectl rollout restart deployment/loki-read        -n <NAMESPACE>
kubectl rollout restart statefulset/loki-write      -n <NAMESPACE>
kubectl rollout restart statefulset/loki-backend    -n <NAMESPACE>
```

---

## Troubleshooting

### Pods do Loki em CrashLoopBackOff

```bash
kubectl logs -n <NAMESPACE> -l app=loki,component=write --previous
```

Causas comuns: MinIO não acessível, buckets não criados, Secret ausente, DestinationRule ausente (Istio bloqueia plain HTTP).

---

### Ring memberlist não forma quorum

```bash
kubectl port-forward -n <NAMESPACE> svc/loki-read 3100:3100
curl http://localhost:3100/ring
```

O ring precisa de quorum entre `write` e `backend`. Verificar se todos os pods estão `Running`:

```bash
kubectl get pods -n <NAMESPACE> -l app=loki -o wide
```

---

### Promtail não envia logs

```bash
kubectl port-forward -n <NAMESPACE> daemonset/promtail 3101:3101
curl http://localhost:3101/targets
```

Causas comuns: `loki-write` não ready, DestinationRule ausente para `loki-write`, ClusterRole sem permissão.

---

### Erro de conexão com MinIO

```bash
kubectl logs -n <NAMESPACE> -l app=loki,component=write | grep -i "s3\|minio\|bucket"
```

Verificar: `insecure: true`, `s3forcepathstyle: true`, DestinationRule aplicado, bucket `loki-data` existente.

---

### Retenção não remove logs antigos

```bash
kubectl port-forward -n <NAMESPACE> svc/loki-backend 3100:3100
curl http://localhost:3100/compactor/ring
```

Verificar se `retention_enabled: true` está no ConfigMap e se o compactor está no ring.

---

## Referências

- [Loki Documentation](https://grafana.com/docs/loki/latest/)
- [Loki Simple Scalable Architecture](https://grafana.com/docs/loki/latest/get-started/deployment-modes/#simple-scalable)
- [Loki Storage Configuration (S3)](https://grafana.com/docs/loki/latest/configure/#storage_config)
- [Promtail Documentation](https://grafana.com/docs/loki/latest/send-data/promtail/)
- [MinIO Docker Hub](https://hub.docker.com/r/minio/minio/tags)
- [grafana/loki Docker Hub](https://hub.docker.com/r/grafana/loki/tags)
- [grafana/promtail Docker Hub](https://hub.docker.com/r/grafana/promtail/tags)

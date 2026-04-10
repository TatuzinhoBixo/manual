# Backup e Restore com Velero + MinIO no Kubernetes

Solução completa de backup e restore para clusters Kubernetes usando [Velero](https://velero.io/) com [MinIO](https://min.io/) como backend S3 on-premises. Inclui dashboard web (Velero UI) e agendamentos automáticos com retenção configurável.

## Tabela de Variáveis

| Variável                  | Descrição                                     | Exemplo                                    |
| ------------------------- | --------------------------------------------- | ------------------------------------------ |
| `<NAMESPACE>`             | Namespace dedicado ao backup                  | `bkp`                                      |
| `<DOMINIO>`               | Domínio base do cluster                       | `tatulab.com.br`                           |
| `<STORAGE_CLASS>`         | StorageClass para o PVC do MinIO              | `sc-bkp`                                   |
| `<MINIO_ACCESS_KEY>`      | Usuário root do MinIO                         | `minioadmin`                               |
| `<MINIO_SECRET_KEY>`      | Senha root do MinIO                           | (senha segura)                             |
| `<MINIO_STORAGE_SIZE>`    | Tamanho do volume de dados do MinIO           | `100Gi`                                    |
| `<BUCKET_NAME>`           | Nome do bucket S3 para backups                | `velero`                                   |
| `<VELERO_VERSION>`        | Versão do Velero                              | `v1.18.0`                                  |
| `<VELERO_PLUGIN_VERSION>` | Versão do plugin AWS/S3                       | `v1.14.0`                                  |
| `<MINIO_IMAGE_TAG>`       | Tag da imagem do MinIO server                 | `RELEASE.2025-09-07T16-13-09Z`             |
| `<MC_IMAGE_TAG>`          | Tag da imagem do MinIO Client (mc)            | `RELEASE.2025-08-13T08-35-41Z`             |
| `<VELERO_UI_VERSION>`     | Versão do Velero UI                           | `0.10.1`                                   |
| `<TLS_SECRET_NAME>`       | Nome do Secret com certificado TLS            | `tls-tatulab`                              |
| `<REPO_URL>`              | URL do repositório Git                        | `https://gitlab.exemplo.com/grupo/bkp.git` |
| `<NAMESPACES_BACKUP>`     | Lista de namespaces incluídos no backup       | `argocd, wordpress, mariadb`               |
| `<GATEWAY_SELECTOR>`      | Label selector do Istio IngressGateway        | `app: bkp-ingressgateway`                  |
| `<FS_BACKUP_TIMEOUT>`     | Timeout para backup de volumes via filesystem | `4h`                                       |

## Arquitetura

```
┌───────────────────────────────────────────────────────────┐
│                   Namespace: <NAMESPACE>                  │
│                                                           │
│  ┌──────────┐    S3 API     ┌───────────────────────┐    │
│  │  Velero   │─────────────►│  MinIO                │    │
│  │  Server   │              │  PVC (<STORAGE_CLASS>) │    │
│  └──────────┘              └───────────────────────┘    │
│       │                                                   │
│  ┌──────────┐         ┌──────────────┐                   │
│  │  Node    │         │  Velero UI   │                   │
│  │  Agent   │         │  (Dashboard) │                   │
│  │ DaemonSet│         └──────────────┘                   │
│  └──────────┘              │                              │
│                     Istio Gateway                         │
│                   velero.<DOMINIO>                        │
└───────────────────────────────────────────────────────────┘
```

## Componentes

| Componente                | Tipo          | Descrição                                           |
| ------------------------- | ------------- | --------------------------------------------------- |
| **Velero Server**         | Deployment    | Controller principal de backup/restore              |
| **Node Agent**            | DaemonSet     | Agente Kopia para backup filesystem de PVs          |
| **MinIO**                 | Deployment    | Object storage S3-compatible para armazenar backups |
| **MinIO Init Job**        | Job           | Cria o bucket inicial no MinIO                      |
| **velero-plugin-for-aws** | InitContainer | Plugin S3 para comunicação com MinIO                |
| **Velero UI**             | Deployment    | Dashboard web para gerenciar backups/restores       |
| **Resource Policy**       | ConfigMap     | Política para ignorar volumes efêmeros              |

## Pré-requisitos

1. Cluster Kubernetes (RKE2/K8s) operacional
2. `kubectl` configurado com acesso ao cluster
3. Namespace `<NAMESPACE>` criado
4. StorageClass `<STORAGE_CLASS>` disponível (ex.: NFS provisioner)
5. Istio instalado (para exposição do Velero UI via Gateway)
6. Certificado TLS configurado como Secret `<TLS_SECRET_NAME>` (para HTTPS)
7. ArgoCD configurado (se deploy via GitOps)

---

## Etapa 1 — MinIO (Object Storage)

O MinIO atua como backend S3 on-premises para armazenar os backups do Velero.

### 1.1. Secret de Credenciais do MinIO

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: minio-credentials
  namespace: <NAMESPACE>
  labels:
    app: minio
type: Opaque
stringData:
  accessKey: <MINIO_ACCESS_KEY>
  secretKey: <MINIO_SECRET_KEY>
```

> **Atenção:** Em produção, use credenciais fortes e considere usar um gerenciador de secrets (Vault, Sealed Secrets, etc.).

### 1.2. PersistentVolumeClaim

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: minio-data
  namespace: <NAMESPACE>
  labels:
    app: minio
spec:
  accessModes:
    - ReadWriteOnce
  storageClassName: <STORAGE_CLASS>
  resources:
    requests:
      storage: <MINIO_STORAGE_SIZE>
```

### 1.3. Deployment do MinIO

```yaml
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
    spec:
      containers:
        - name: minio
          image: minio/minio:<MINIO_IMAGE_TAG>
          args:
            - server
            - /data
            - --console-address
            - ":9001"
          env:
            - name: MINIO_ROOT_USER
              valueFrom:
                secretKeyRef:
                  name: minio-credentials
                  key: accessKey
            - name: MINIO_ROOT_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: minio-credentials
                  key: secretKey
          ports:
            - containerPort: 9000
              name: api
            - containerPort: 9001
              name: console
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
            periodSeconds: 20
          resources:
            requests:
              cpu: 100m
              memory: 256Mi
            limits:
              cpu: 500m
              memory: 512Mi
      volumes:
        - name: data
          persistentVolumeClaim:
            claimName: minio-data
```

### 1.4. Service do MinIO

```yaml
apiVersion: v1
kind: Service
metadata:
  name: minio
  namespace: <NAMESPACE>
  labels:
    app: minio
spec:
  type: ClusterIP
  ports:
    - name: api
      port: 9000
      targetPort: 9000
    - name: console
      port: 9001
      targetPort: 9001
  selector:
    app: minio
```

### 1.5. Job de Criação do Bucket

Cria automaticamente o bucket `<BUCKET_NAME>` no MinIO após o deploy.

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: minio-create-bucket
  namespace: <NAMESPACE>
  labels:
    app: minio
spec:
  backoffLimit: 6
  template:
    metadata:
      labels:
        app: minio-init
    spec:
      restartPolicy: OnFailure
      containers:
        - name: mc
          image: minio/mc:<MC_IMAGE_TAG>
          command:
            - /bin/sh
            - -c
            - |
              until mc alias set minio http://minio.<NAMESPACE>.svc:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD"; do
                echo "Waiting for MinIO..."
                sleep 5
              done
              mc mb --ignore-existing minio/<BUCKET_NAME>
              echo "Bucket '<BUCKET_NAME>' ready."
          env:
            - name: MINIO_ROOT_USER
              valueFrom:
                secretKeyRef:
                  name: minio-credentials
                  key: accessKey
            - name: MINIO_ROOT_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: minio-credentials
                  key: secretKey
```

---

## Etapa 2 — Velero (Backup & Restore)

### 2.1. ServiceAccount e RBAC

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: velero
  namespace: <NAMESPACE>
  labels:
    app: velero
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: velero
  labels:
    app: velero
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: cluster-admin
subjects:
  - kind: ServiceAccount
    name: velero
    namespace: <NAMESPACE>
```

> **Nota:** Em produção, considere criar um ClusterRole customizado com permissões mínimas em vez de `cluster-admin`.

### 2.2. Secret de Credenciais S3 (Velero → MinIO)

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: velero-credentials
  namespace: <NAMESPACE>
  labels:
    app: velero
type: Opaque
stringData:
  cloud: |
    [default]
    aws_access_key_id=<MINIO_ACCESS_KEY>
    aws_secret_access_key=<MINIO_SECRET_KEY>
```

### 2.3. Deployment do Velero Server

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: velero
  namespace: <NAMESPACE>
  labels:
    app: velero
spec:
  replicas: 1
  selector:
    matchLabels:
      app: velero
  template:
    metadata:
      labels:
        app: velero
    spec:
      serviceAccountName: velero
      initContainers:
        - name: velero-plugin-for-aws
          image: velero/velero-plugin-for-aws:<VELERO_PLUGIN_VERSION>
          volumeMounts:
            - mountPath: /target
              name: plugins
      containers:
        - name: velero
          image: velero/velero:<VELERO_VERSION>
          command:
            - /velero
          args:
            - server
            - --fs-backup-timeout=<FS_BACKUP_TIMEOUT>
          env:
            - name: VELERO_NAMESPACE
              valueFrom:
                fieldRef:
                  fieldPath: metadata.namespace
            - name: LD_LIBRARY_PATH
              value: /plugins
            - name: AWS_SHARED_CREDENTIALS_FILE
              value: /credentials/cloud
          volumeMounts:
            - name: plugins
              mountPath: /plugins
            - name: cloud-credentials
              mountPath: /credentials
            - name: scratch
              mountPath: /scratch
          resources:
            requests:
              cpu: 200m
              memory: 256Mi
            limits:
              cpu: "1"
              memory: 512Mi
      volumes:
        - name: plugins
          emptyDir: {}
        - name: cloud-credentials
          secret:
            secretName: velero-credentials
        - name: scratch
          emptyDir: {}
```

### 2.4. Node Agent (DaemonSet)

O Node Agent roda em cada nó e realiza backups filesystem de PersistentVolumes usando Kopia.

```yaml
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: node-agent
  namespace: <NAMESPACE>
  labels:
    name: node-agent
spec:
  selector:
    matchLabels:
      name: node-agent
  template:
    metadata:
      annotations:
        sidecar.istio.io/inject: "false"
      labels:
        name: node-agent
    spec:
      serviceAccountName: velero
      securityContext:
        runAsUser: 0
      containers:
        - name: node-agent
          image: velero/velero:<VELERO_VERSION>
          command:
            - /velero
          args:
            - node-agent
            - server
          env:
            - name: VELERO_NAMESPACE
              valueFrom:
                fieldRef:
                  fieldPath: metadata.namespace
            - name: NODE_NAME
              valueFrom:
                fieldRef:
                  fieldPath: spec.nodeName
            - name: VELERO_SCRATCH_DIR
              value: /scratch
            - name: AWS_SHARED_CREDENTIALS_FILE
              value: /credentials/cloud
          volumeMounts:
            - name: cloud-credentials
              mountPath: /credentials
            - name: host-pods
              mountPath: /host_pods
              mountPropagation: HostToContainer
            - name: scratch
              mountPath: /scratch
          resources:
            requests:
              cpu: 100m
              memory: 256Mi
            limits:
              cpu: "1"
              memory: 1Gi
      volumes:
        - name: cloud-credentials
          secret:
            secretName: velero-credentials
        - name: host-pods
          hostPath:
            path: /var/lib/kubelet/pods
        - name: scratch
          emptyDir: {}
```

> **Nota:** A annotation `sidecar.istio.io/inject: "false"` desabilita o sidecar do Istio no Node Agent, pois ele precisa de acesso direto ao filesystem dos nós.

### 2.5. BackupStorageLocation (BSL)

Configura o MinIO como destino de armazenamento dos backups.

```yaml
apiVersion: velero.io/v1
kind: BackupStorageLocation
metadata:
  name: default
  namespace: <NAMESPACE>
  labels:
    app: velero
  annotations:
    argocd.argoproj.io/sync-wave: "2"
spec:
  provider: aws
  default: true
  objectStorage:
    bucket: <BUCKET_NAME>
  config:
    region: minio
    s3ForcePathStyle: "true"
    s3Url: http://minio.<NAMESPACE>.svc.cluster.local:9000
```

### 2.6. Resource Policy (Volumes Efêmeros)

Ignora volumes que não precisam de backup (emptyDir, configMap, secret, projected, downwardAPI).

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: backup-resource-policy
  namespace: <NAMESPACE>
  labels:
    app: velero
  annotations:
    argocd.argoproj.io/sync-wave: "1"
data:
  policies.yaml: |
    version: v1
    volumePolicies:
    - conditions:
        volumeTypes:
        - emptyDir
        - configMap
        - secret
        - projected
        - downwardAPI
      action:
        type: skip
```

---

## Etapa 3 — Schedules de Backup

### 3.1. Backup Diário

```yaml
apiVersion: velero.io/v1
kind: Schedule
metadata:
  name: daily-full
  namespace: <NAMESPACE>
  labels:
    app: velero
  annotations:
    argocd.argoproj.io/sync-wave: "2"
spec:
  schedule: "0 2 * * *"
  useOwnerReferencesInBackup: false
  template:
    ttl: 168h
    storageLocation: default
    includedNamespaces:
      - <NAMESPACES_BACKUP>
    snapshotVolumes: false
    defaultVolumesToFsBackup: true
    resourcePolicy:
      kind: configmap
      name: backup-resource-policy
```

### 3.2. Backup Semanal

```yaml
apiVersion: velero.io/v1
kind: Schedule
metadata:
  name: weekly-full
  namespace: <NAMESPACE>
  labels:
    app: velero
  annotations:
    argocd.argoproj.io/sync-wave: "2"
spec:
  schedule: "0 3 * * 0"
  useOwnerReferencesInBackup: false
  template:
    ttl: 720h
    storageLocation: default
    includedNamespaces:
      - <NAMESPACES_BACKUP>
    snapshotVolumes: false
    defaultVolumesToFsBackup: true
    resourcePolicy:
      kind: configmap
      name: backup-resource-policy
```

### Resumo dos Schedules

| Schedule      | Cron        | Horário       | Retenção       | Escopo                |
| ------------- | ----------- | ------------- | -------------- | --------------------- |
| `daily-full`  | `0 2 * * *` | 02:00 diário  | 7 dias (168h)  | `<NAMESPACES_BACKUP>` |
| `weekly-full` | `0 3 * * 0` | 03:00 domingo | 30 dias (720h) | `<NAMESPACES_BACKUP>` |

---

## Etapa 4 — Velero UI (Dashboard Web)

Dashboard web para visualizar e gerenciar backups/restores via navegador.

### 4.1. ServiceAccount e RBAC

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: velero-ui
  namespace: <NAMESPACE>
  labels:
    app: velero-ui
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: velero-ui
  labels:
    app: velero-ui
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: cluster-admin
subjects:
  - kind: ServiceAccount
    name: velero-ui
    namespace: <NAMESPACE>
```

### 4.2. Deployment do Velero UI

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: velero-ui
  namespace: <NAMESPACE>
  labels:
    app: velero-ui
spec:
  replicas: 1
  selector:
    matchLabels:
      app: velero-ui
  template:
    metadata:
      labels:
        app: velero-ui
    spec:
      serviceAccountName: velero-ui
      containers:
        - name: velero-ui
          image: otwld/velero-ui:<VELERO_UI_VERSION>
          ports:
            - containerPort: 3000
              name: http
          env:
            - name: VELERO_NAMESPACE
              value: <NAMESPACE>
            - name: NODE_ENV
              value: production
          resources:
            requests:
              cpu: 50m
              memory: 128Mi
            limits:
              cpu: 200m
              memory: 256Mi
          readinessProbe:
            httpGet:
              path: /
              port: 3000
            initialDelaySeconds: 10
            periodSeconds: 10
          livenessProbe:
            httpGet:
              path: /
              port: 3000
            initialDelaySeconds: 15
            periodSeconds: 20
```

### 4.3. Service

```yaml
apiVersion: v1
kind: Service
metadata:
  name: velero-ui
  namespace: <NAMESPACE>
  labels:
    app: velero-ui
spec:
  type: ClusterIP
  ports:
    - name: http
      port: 80
      targetPort: 3000
  selector:
    app: velero-ui
```

### 4.4. Istio Gateway + VirtualService

Expõe o Velero UI via HTTPS com Istio.

```yaml
apiVersion: networking.istio.io/v1beta1
kind: Gateway
metadata:
  name: bkp-gateway
  namespace: <NAMESPACE>
spec:
  selector:
    <GATEWAY_SELECTOR>
  servers:
    - hosts:
        - velero.<DOMINIO>
      port:
        name: https-velero
        number: 443
        protocol: HTTPS
      tls:
        credentialName: <TLS_SECRET_NAME>
        mode: SIMPLE
---
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: velero-ui
  namespace: <NAMESPACE>
spec:
  hosts:
    - velero.<DOMINIO>
  gateways:
    - bkp-gateway
  http:
    - route:
        - destination:
            host: velero-ui.<NAMESPACE>.svc.cluster.local
            port:
              number: 80
```

---

## Etapa 5 — Deploy via Kustomize / ArgoCD

### 5.1. Kustomization

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
namespace: <NAMESPACE>

resources:
  # Velero CRDs
  - velero/crds/velero.io_backups.yaml
  - velero/crds/velero.io_backupstoragelocations.yaml
  - velero/crds/velero.io_backuprepositories.yaml
  - velero/crds/velero.io_deletebackuprequests.yaml
  - velero/crds/velero.io_downloadrequests.yaml
  - velero/crds/velero.io_podvolumebackups.yaml
  - velero/crds/velero.io_podvolumerestores.yaml
  - velero/crds/velero.io_restores.yaml
  - velero/crds/velero.io_schedules.yaml
  - velero/crds/velero.io_serverstatusrequests.yaml
  - velero/crds/velero.io_volumesnapshotlocations.yaml
  - velero/crds/velero.io_datadownloads.yaml
  - velero/crds/velero.io_datauploads.yaml
  # MinIO - Object Storage
  - minio/credentials.yaml
  - minio/pvc.yaml
  - minio/deployment.yaml
  - minio/service.yaml
  - minio/init-job.yaml
  # Velero - Backup & Restore
  - velero/serviceaccount.yaml
  - velero/clusterrolebinding.yaml
  - velero/credentials.yaml
  - velero/deployment.yaml
  - velero/node-agent.yaml
  - velero/bsl.yaml
  - velero/resource-policy.yaml
  - velero/schedule-daily.yaml
  - velero/schedule-weekly.yaml
  # Velero UI - Dashboard Web
  - velero-ui/serviceaccount.yaml
  - velero-ui/clusterrolebinding.yaml
  - velero-ui/deployment.yaml
  - velero-ui/service.yaml
  - velero-ui/gateway.yaml
  - velero-ui/virtualservice.yaml
```

### 5.2. Application no ArgoCD

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: velero-bkp
  namespace: argocd
spec:
  project: default
  source:
    repoURL: <REPO_URL>
    targetRevision: main
    path: .
  destination:
    server: https://kubernetes.default.svc
    namespace: <NAMESPACE>
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    syncOptions:
      - CreateNamespace=false
      - ServerSideApply=true
```

---

## Tabela de Parâmetros Importantes

| Parâmetro                           | Arquivo                | Descrição                                       | Valor Padrão      |
| ----------------------------------- | ---------------------- | ----------------------------------------------- | ----------------- |
| `strategy.type: Recreate`           | minio/deployment.yaml  | Evita conflitos no volume do MinIO              | `Recreate`        |
| `s3ForcePathStyle`                  | velero/bsl.yaml        | Obrigatório para MinIO (path-style S3)          | `true`            |
| `defaultVolumesToFsBackup`          | velero/schedule-*.yaml | Faz backup filesystem de todos os PVs           | `true`            |
| `snapshotVolumes`                   | velero/schedule-*.yaml | Desabilita snapshots CSI (usa fs-backup)        | `false`           |
| `useOwnerReferencesInBackup`        | velero/schedule-*.yaml | Evita deleção em cascata de backups             | `false`           |
| `--fs-backup-timeout`               | velero/deployment.yaml | Timeout para backup de volumes grandes          | `4h`              |
| `sidecar.istio.io/inject: "false"`  | velero/node-agent.yaml | Desabilita Istio no DaemonSet                   | `false`           |
| `mountPropagation: HostToContainer` | velero/node-agent.yaml | Permite acesso aos volumes dos pods nos nós     | `HostToContainer` |
| `runAsUser: 0`                      | velero/node-agent.yaml | Node Agent precisa de root para acessar volumes | `0`               |
| `backoffLimit: 6`                   | minio/init-job.yaml    | Tentativas do Job de criação do bucket          | `6`               |
| `tls.mode: SIMPLE`                  | velero-ui/gateway.yaml | Terminação TLS no Gateway Istio                 | `SIMPLE`          |

---

## Comandos Úteis

### Backups

```bash
# Listar todos os backups
kubectl get backups -n <NAMESPACE>

# Detalhes de um backup
kubectl exec -n <NAMESPACE> deploy/velero -- velero backup describe <NOME_BACKUP>

# Logs de um backup
kubectl exec -n <NAMESPACE> deploy/velero -- velero backup logs <NOME_BACKUP>

# Backup manual de namespaces específicos
kubectl exec -n <NAMESPACE> deploy/velero -- velero backup create manual-$(date +%Y%m%d) \
  --include-namespaces <NS1>,<NS2> \
  --default-volumes-to-fs-backup

# Backup manual de um único namespace
kubectl exec -n <NAMESPACE> deploy/velero -- velero backup create <NOME_BACKUP> \
  --include-namespaces <NS_ALVO> \
  --default-volumes-to-fs-backup
```

### Restores

```bash
# Restore completo de um backup
kubectl exec -n <NAMESPACE> deploy/velero -- velero restore create \
  --from-backup <NOME_BACKUP>

# Restore de namespaces específicos de um backup
kubectl exec -n <NAMESPACE> deploy/velero -- velero restore create \
  --from-backup <NOME_BACKUP> \
  --include-namespaces <NS_ALVO>

# Listar restores
kubectl get restores -n <NAMESPACE>

# Status de um restore
kubectl exec -n <NAMESPACE> deploy/velero -- velero restore describe <NOME_RESTORE>
```

### Schedules

```bash
# Listar schedules
kubectl get schedules -n <NAMESPACE>

# Pausar um schedule
kubectl exec -n <NAMESPACE> deploy/velero -- velero schedule pause <NOME_SCHEDULE>

# Retomar um schedule
kubectl exec -n <NAMESPACE> deploy/velero -- velero schedule unpause <NOME_SCHEDULE>

# Trigger manual de um schedule
kubectl exec -n <NAMESPACE> deploy/velero -- velero backup create \
  --from-schedule <NOME_SCHEDULE>
```

### MinIO

```bash
# Verificar saúde do MinIO
kubectl exec -n <NAMESPACE> deploy/minio -- curl -s http://localhost:9000/minio/health/ready

# Listar conteúdo do bucket
kubectl exec -n <NAMESPACE> deploy/minio -- mc alias set local http://localhost:9000 <MINIO_ACCESS_KEY> <MINIO_SECRET_KEY>
kubectl exec -n <NAMESPACE> deploy/minio -- mc ls local/<BUCKET_NAME>

# Verificar uso de disco
kubectl exec -n <NAMESPACE> deploy/minio -- mc admin info local
```

### Status Geral

```bash
# Status do Velero server
kubectl exec -n <NAMESPACE> deploy/velero -- velero version

# Status do BSL (deve estar Available)
kubectl get backupstoragelocation -n <NAMESPACE>

# Status dos pods
kubectl get pods -n <NAMESPACE>

# Logs do Velero
kubectl logs -n <NAMESPACE> deploy/velero -f

# Logs do Node Agent (em um nó específico)
kubectl logs -n <NAMESPACE> -l name=node-agent --all-containers
```

---

## Troubleshooting

### BSL mostra status "Unavailable"

**Sintoma:** `kubectl get bsl -n <NAMESPACE>` mostra `Phase: Unavailable`.

**Causas possíveis:**
1. MinIO não está rodando ou não está pronto
2. Credenciais incorretas no Secret `velero-credentials`
3. Bucket não existe no MinIO

**Resolução:**
```bash
# Verificar se MinIO está rodando
kubectl get pods -n <NAMESPACE> -l app=minio

# Verificar se o bucket existe
kubectl logs -n <NAMESPACE> job/minio-create-bucket

# Verificar logs do Velero para erros S3
kubectl logs -n <NAMESPACE> deploy/velero | grep -i "error\|fail"

# Recriar o Job de bucket (se necessário)
kubectl delete job minio-create-bucket -n <NAMESPACE>
# Reaplicar o manifesto do Job
```

### Backup fica em status "InProgress" por muito tempo

**Sintoma:** Backup não completa e permanece `InProgress`.

**Causas possíveis:**
1. Node Agent não está rodando em todos os nós
2. Volume muito grande excedendo o timeout
3. PV inacessível ou com problemas de I/O

**Resolução:**
```bash
# Verificar se Node Agent está em todos os nós
kubectl get ds node-agent -n <NAMESPACE>

# Verificar logs do Node Agent
kubectl logs -n <NAMESPACE> -l name=node-agent --tail=50

# Verificar PodVolumeBackups pendentes
kubectl get podvolumebackups -n <NAMESPACE> | grep InProgress

# Aumentar timeout se necessário (no deployment do Velero)
# args: --fs-backup-timeout=8h
```

### Node Agent com CrashLoopBackOff

**Sintoma:** Pods do Node Agent reiniciam constantemente.

**Causas possíveis:**
1. Credenciais S3 inválidas
2. Path `/var/lib/kubelet/pods` não acessível
3. Sidecar do Istio interferindo

**Resolução:**
```bash
# Verificar logs
kubectl logs -n <NAMESPACE> -l name=node-agent --previous

# Verificar se annotation Istio está aplicada
kubectl get ds node-agent -n <NAMESPACE> -o jsonpath='{.spec.template.metadata.annotations}'

# Confirmar que o Secret existe
kubectl get secret velero-credentials -n <NAMESPACE>
```

### Velero UI não acessível

**Sintoma:** `velero.<DOMINIO>` retorna erro 502/503 ou não carrega.

**Causas possíveis:**
1. Pod do Velero UI não está pronto
2. Gateway ou VirtualService mal configurados
3. Certificado TLS inválido ou expirado

**Resolução:**
```bash
# Verificar pod
kubectl get pods -n <NAMESPACE> -l app=velero-ui

# Verificar se o Service resolve
kubectl exec -n <NAMESPACE> deploy/velero-ui -- wget -qO- http://localhost:3000/ | head -5

# Verificar Gateway e VirtualService
kubectl get gateway,virtualservice -n <NAMESPACE>

# Verificar certificado TLS
kubectl get secret <TLS_SECRET_NAME> -n istio-system -o jsonpath='{.data.tls\.crt}' | base64 -d | openssl x509 -noout -dates
```

### Restore falha com "already exists"

**Sintoma:** Restore reporta erros de recursos que já existem.

**Resolução:**
```bash
# Restore com política de update (sobrescreve existentes)
kubectl exec -n <NAMESPACE> deploy/velero -- velero restore create \
  --from-backup <NOME_BACKUP> \
  --existing-resource-policy update

# Ou deletar os recursos antes do restore
kubectl delete namespace <NS_ALVO>
# Aguardar deleção completa, depois:
kubectl exec -n <NAMESPACE> deploy/velero -- velero restore create \
  --from-backup <NOME_BACKUP> \
  --include-namespaces <NS_ALVO>
```

---

## Estrutura do Repositório

```
.
├── kustomization.yaml                     # Orquestrador Kustomize
├── README.md                              # Este tutorial
├── minio/
│   ├── credentials.yaml                   # Secret com credenciais MinIO
│   ├── pvc.yaml                           # PVC para dados do MinIO
│   ├── deployment.yaml                    # MinIO server
│   ├── service.yaml                       # Service ClusterIP (9000/9001)
│   └── init-job.yaml                      # Job para criar bucket
├── velero/
│   ├── crds/                              # CRDs do Velero v1.18
│   │   ├── velero.io_backups.yaml
│   │   ├── velero.io_restores.yaml
│   │   ├── velero.io_schedules.yaml
│   │   └── ...                            # (13 CRDs no total)
│   ├── serviceaccount.yaml                # ServiceAccount do Velero
│   ├── clusterrolebinding.yaml            # RBAC cluster-admin
│   ├── credentials.yaml                   # Secret S3 (Velero → MinIO)
│   ├── deployment.yaml                    # Velero server + plugin AWS
│   ├── node-agent.yaml                    # DaemonSet para fs-backup
│   ├── bsl.yaml                           # BackupStorageLocation
│   ├── resource-policy.yaml               # Política para ignorar volumes efêmeros
│   ├── schedule-daily.yaml                # Backup diário às 02:00
│   └── schedule-weekly.yaml               # Backup semanal domingo 03:00
└── velero-ui/
    ├── serviceaccount.yaml                # ServiceAccount do UI
    ├── clusterrolebinding.yaml            # RBAC cluster-admin
    ├── deployment.yaml                    # Velero UI (porta 3000)
    ├── service.yaml                       # Service ClusterIP (80→3000)
    ├── gateway.yaml                       # Istio Gateway HTTPS
    └── virtualservice.yaml                # Istio VirtualService
```

---

## Referências

- [Velero Documentation](https://velero.io/docs/)
- [Velero v1.18 Release Notes](https://github.com/vmware-tanzu/velero/releases/tag/v1.18.0)
- [Velero Plugin for AWS](https://github.com/vmware-tanzu/velero-plugin-for-aws)
- [MinIO Documentation](https://min.io/docs/minio/kubernetes/upstream/)
- [Velero UI (otwld)](https://github.com/otwld/velero-ui)
- [Velero Resource Policies](https://velero.io/docs/main/resource-filtering/)
- [Velero File System Backup](https://velero.io/docs/main/file-system-backup/)
- [Istio Gateway Configuration](https://istio.io/latest/docs/reference/config/networking/gateway/)

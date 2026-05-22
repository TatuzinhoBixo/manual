# Manual de Instalação — SonarQube Community no Kubernetes (RKE2)

## Sumário

1. [Pré-requisitos](#1-pré-requisitos)
2. [Preparação dos Nodes](#2-preparação-dos-nodes)
3. [Instalação dos CRDs do Traefik](#3-instalação-dos-crds-do-traefik)
4. [Criação do Namespace](#4-criação-do-namespace)
5. [Persistent Volume Claims](#5-persistent-volume-claims)
6. [Secret do PostgreSQL](#6-secret-do-postgresql)
7. [Deploy do PostgreSQL](#7-deploy-do-postgresql)
8. [Deploy do SonarQube](#8-deploy-do-sonarqube)
9. [Service do SonarQube](#9-service-do-sonarqube)
10. [Traefik (Ingress Controller dedicado)](#10-traefik-ingress-controller-dedicado)
11. [IngressRoute (Rota TLS)](#11-ingressroute-rota-tls)
12. [Validação da Instalação](#12-validação-da-instalação)
13. [Primeiro Acesso](#13-primeiro-acesso)
14. [Troubleshooting](#14-troubleshooting)

---

## 1. Pré-requisitos

- Cluster Kubernetes RKE2 funcional
- MetalLB instalado e configurado com pool de IPs disponíveis
- StorageClass configurado (neste manual: `sc-sonar`)
- Secret TLS com certificado wildcard ou específico para o domínio (neste manual: `tls-prodam`)
- Acesso `kubectl` com permissões de administrador
- DNS apontando para o IP do LoadBalancer (neste manual: `sonar.prodam.am.gov.br` → `10.199.0.32`)
- Disco disponível de pelo menos 120Gi no storage backend

### Parâmetros que devem ser ajustados por ambiente

| Parâmetro        | Valor usado neste manual  | Descrição                           |
| ---------------- | ------------------------- | ----------------------------------- |
| Namespace        | `sonar`                   | Namespace dedicado para o SonarQube |
| IP MetalLB       | `10.199.0.32`             | IP fixo entregue pelo MetalLB       |
| DNS              | `sonar.prodam.am.gov.br`  | FQDN de acesso ao SonarQube         |
| Secret TLS       | `tls-prodam`              | Nome do secret kubernetes.io/tls    |
| StorageClass     | `sc-sonar`                | StorageClass para os PVCs           |
| Senha PostgreSQL | `TROCAR_POR_SENHA_SEGURA` | Senha do banco de dados             |

---

## 2. Preparação dos Nodes

O SonarQube utiliza Elasticsearch embutido, que exige o parâmetro `vm.max_map_count` com valor mínimo de 524288. Execute em **todos os nodes** onde o SonarQube possa ser agendado:

```bash
# Aplicar imediatamente
sudo sysctl -w vm.max_map_count=524288

# Persistir para sobreviver a reboots
echo "vm.max_map_count=524288" | sudo tee /etc/sysctl.d/99-sonarqube.conf
sudo sysctl --system
```

Verificar:

```bash
sysctl vm.max_map_count
# Saída esperada: vm.max_map_count = 524288
```

---

## 3. Instalação dos CRDs do Traefik

O Traefik utiliza Custom Resource Definitions (IngressRoute, Middleware, etc.) que precisam ser instalados no cluster antes de qualquer manifesto que os referencie.

```bash
# Instalar CRDs do Traefik v3.1
kubectl apply -f https://raw.githubusercontent.com/traefik/traefik/v3.1/docs/content/reference/dynamic-configuration/kubernetes-crd-definition-v1.yml

# Instalar RBAC oficial do Traefik v3.1
kubectl apply -f https://raw.githubusercontent.com/traefik/traefik/v3.1/docs/content/reference/dynamic-configuration/kubernetes-crd-rbac.yml
```

Verificar:

```bash
kubectl get crd | grep traefik
```

---

## 4. Criação do Namespace

Arquivo: `01-namespace.yaml`

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: sonar
```

Aplicar:

```bash
kubectl apply -f 01-namespace.yaml
```

---

## 5. Persistent Volume Claims

### 5.1. PVC do PostgreSQL

Arquivo: `02-pvc-postgres.yaml`

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: pvc-sonar-postgres
  namespace: sonar
spec:
  accessModes:
    - ReadWriteOnce
  storageClassName: sc-sonar
  resources:
    requests:
      storage: 20Gi
```

### 5.2. PVC do SonarQube

Arquivo: `03-pvc-sonarqube.yaml`

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: pvc-sonar-data
  namespace: sonar
spec:
  accessModes:
    - ReadWriteOnce
  storageClassName: sc-sonar
  resources:
    requests:
      storage: 100Gi
```

Aplicar:

```bash
kubectl apply -f 02-pvc-postgres.yaml
kubectl apply -f 03-pvc-sonarqube.yaml
```

> **Nota:** A distribuição é 20Gi para o PostgreSQL e 100Gi para o SonarQube (dados, Elasticsearch embutido e logs), totalizando 120Gi.

---

## 6. Secret do PostgreSQL

Arquivo: `04-secret-postgres.yaml`

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: sonar-postgres-secret
  namespace: sonar
type: Opaque
stringData:
  POSTGRES_USER: sonar
  POSTGRES_PASSWORD: TROCAR_POR_SENHA_SEGURA
  POSTGRES_DB: sonarqube
```

> **Importante:** Substitua `TROCAR_POR_SENHA_SEGURA` por uma senha real antes de aplicar. O campo `stringData` aceita texto puro — o Kubernetes converte automaticamente para base64.

Aplicar:

```bash
kubectl apply -f 04-secret-postgres.yaml
```

---

## 7. Deploy do PostgreSQL

Arquivo: `05-deployment-postgres.yaml`

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: sonar-postgres
  namespace: sonar
  labels:
    app: sonar-postgres
spec:
  replicas: 1
  selector:
    matchLabels:
      app: sonar-postgres
  strategy:
    type: Recreate
  template:
    metadata:
      labels:
        app: sonar-postgres
    spec:
      containers:
        - name: postgres
          image: postgres:15-alpine
          ports:
            - containerPort: 5432
          envFrom:
            - secretRef:
                name: sonar-postgres-secret
          volumeMounts:
            - name: postgres-data
              mountPath: /var/lib/postgresql/data
              subPath: pgdata
          resources:
            requests:
              cpu: 250m
              memory: 512Mi
            limits:
              cpu: "1"
              memory: 1Gi
          readinessProbe:
            exec:
              command:
                - pg_isready
                - -U
                - sonar
            initialDelaySeconds: 10
            periodSeconds: 10
          livenessProbe:
            exec:
              command:
                - pg_isready
                - -U
                - sonar
            initialDelaySeconds: 30
            periodSeconds: 20
      volumes:
        - name: postgres-data
          persistentVolumeClaim:
            claimName: pvc-sonar-postgres
---
apiVersion: v1
kind: Service
metadata:
  name: sonar-postgres
  namespace: sonar
spec:
  selector:
    app: sonar-postgres
  ports:
    - port: 5432
      targetPort: 5432
  type: ClusterIP
```

Aplicar e aguardar:

```bash
kubectl apply -f 05-deployment-postgres.yaml
kubectl wait --for=condition=ready pod -l app=sonar-postgres -n sonar --timeout=120s
```

---

## 8. Deploy do SonarQube

Arquivo: `06-deployment-sonarqube.yaml`

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: sonarqube
  namespace: sonar
  labels:
    app: sonarqube
spec:
  replicas: 1
  selector:
    matchLabels:
      app: sonarqube
  strategy:
    type: Recreate
  template:
    metadata:
      labels:
        app: sonarqube
    spec:
      initContainers:
        - name: init-sysctl
          image: busybox:1.36
          command:
            - sh
            - -c
            - |
              sysctl -w vm.max_map_count=524288
              sysctl -w fs.file-max=131072
          securityContext:
            privileged: true
            runAsUser: 0
        - name: init-volume-permission
          image: busybox:1.36
          command:
            - sh
            - -c
            - |
              chown -R 1000:0 /opt/sonarqube/data
              chown -R 1000:0 /opt/sonarqube/extensions
              chown -R 1000:0 /opt/sonarqube/logs
          volumeMounts:
            - name: sonar-data
              mountPath: /opt/sonarqube/data
              subPath: data
            - name: sonar-data
              mountPath: /opt/sonarqube/extensions
              subPath: extensions
            - name: sonar-data
              mountPath: /opt/sonarqube/logs
              subPath: logs
          securityContext:
            runAsUser: 0
      containers:
        - name: sonarqube
          image: sonarqube:community
          ports:
            - containerPort: 9000
          env:
            - name: SONAR_JDBC_USERNAME
              valueFrom:
                secretKeyRef:
                  name: sonar-postgres-secret
                  key: POSTGRES_USER
            - name: SONAR_JDBC_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: sonar-postgres-secret
                  key: POSTGRES_PASSWORD
            - name: SONAR_JDBC_URL
              value: jdbc:postgresql://sonar-postgres:5432/sonarqube
            - name: SONAR_WEB_CONTEXT
              value: /
            - name: SONAR_SEARCH_JAVAOPTS
              value: "-Xmx512m -Xms512m"
            - name: SONAR_WEB_JAVAOPTS
              value: "-Xmx512m -Xms128m"
            - name: SONAR_CE_JAVAOPTS
              value: "-Xmx512m -Xms128m"
          volumeMounts:
            - name: sonar-data
              mountPath: /opt/sonarqube/data
              subPath: data
            - name: sonar-data
              mountPath: /opt/sonarqube/extensions
              subPath: extensions
            - name: sonar-data
              mountPath: /opt/sonarqube/logs
              subPath: logs
          resources:
            requests:
              cpu: 500m
              memory: 2Gi
            limits:
              cpu: "2"
              memory: 4Gi
          readinessProbe:
            httpGet:
              path: /api/system/status
              port: 9000
            initialDelaySeconds: 90
            periodSeconds: 15
            timeoutSeconds: 5
            failureThreshold: 10
          livenessProbe:
            httpGet:
              path: /api/system/status
              port: 9000
            initialDelaySeconds: 120
            periodSeconds: 30
            timeoutSeconds: 5
            failureThreshold: 6
          startupProbe:
            httpGet:
              path: /api/system/status
              port: 9000
            initialDelaySeconds: 60
            periodSeconds: 10
            failureThreshold: 24
      volumes:
        - name: sonar-data
          persistentVolumeClaim:
            claimName: pvc-sonar-data
```

> **Importante:** O SonarQube Community Edition suporta apenas **1 réplica**. Múltiplas réplicas requerem a Data Center Edition (paga).

> **Nota sobre o initContainer `init-sysctl`:** Ele configura o `vm.max_map_count` dentro do pod. Se o cluster tiver políticas de segurança que bloqueiam containers privilegiados, será necessário configurar o sysctl diretamente nos nodes (seção 2).

Aplicar:

```bash
kubectl apply -f 06-deployment-sonarqube.yaml
```

---

## 9. Service do SonarQube

Arquivo: `07-service-sonarqube.yaml`

```yaml
apiVersion: v1
kind: Service
metadata:
  name: sonarqube
  namespace: sonar
spec:
  selector:
    app: sonarqube
  ports:
    - name: http
      port: 9000
      targetPort: 9000
      protocol: TCP
  type: ClusterIP
```

> **Nota:** O Service do SonarQube é ClusterIP. Quem expõe externamente é o Traefik via LoadBalancer.

Aplicar:

```bash
kubectl apply -f 07-service-sonarqube.yaml
```

---

## 10. Traefik (Ingress Controller dedicado)

Nesta instalação, o Traefik é dedicado ao namespace `sonar` — ele não atende outros namespaces. Cada ambiente pode ter seu próprio Traefik isolado.

### 10.1. ServiceAccount

Arquivo: `08-traefik-serviceaccount.yaml`

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: traefik
  namespace: sonar
```

### 10.2. ClusterRoleBinding

O ClusterRole já foi criado no passo 3 (RBAC oficial do Traefik). Aqui criamos apenas o binding para o ServiceAccount do namespace `sonar`.

Arquivo: `09-traefik-rbac.yaml`

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: traefik-sonar
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: traefik-ingress-controller
subjects:
  - kind: ServiceAccount
    name: traefik
    namespace: sonar
```

> **Importante:** O nome do ClusterRole `traefik-ingress-controller` vem do RBAC oficial aplicado no passo 3. Se estiver instalando em outro cluster, certifique-se de que o passo 3 foi executado.

### 10.3. Deployment

Arquivo: `10-traefik-deployment.yaml`

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: traefik
  namespace: sonar
  labels:
    app: traefik
spec:
  replicas: 1
  selector:
    matchLabels:
      app: traefik
  template:
    metadata:
      labels:
        app: traefik
    spec:
      serviceAccountName: traefik
      containers:
        - name: traefik
          image: traefik:v3.1
          args:
            - "--providers.kubernetescrd"
            - "--providers.kubernetescrd.namespaces=sonar"
            - "--entrypoints.websecure.address=:443"
            - "--entrypoints.websecure.http.tls"
            - "--log.level=INFO"
          ports:
            - name: websecure
              containerPort: 443
          resources:
            requests:
              cpu: 100m
              memory: 128Mi
            limits:
              cpu: 500m
              memory: 256Mi
          readinessProbe:
            tcpSocket:
              port: 443
            initialDelaySeconds: 10
            periodSeconds: 10
          livenessProbe:
            tcpSocket:
              port: 443
            initialDelaySeconds: 15
            periodSeconds: 20
```

> **Nota sobre `--providers.kubernetescrd.namespaces=sonar`:** Isso restringe o Traefik a observar apenas o namespace `sonar`. Se quiser que atenda múltiplos namespaces, adicione-os separados por vírgula.

> **Nota sobre `--entrypoints.websecure.http.tls`:** Essa flag é obrigatória para que o Traefik use o certificado TLS definido no IngressRoute em vez do certificado self-signed padrão.

### 10.4. Service (LoadBalancer via MetalLB)

Arquivo: `11-traefik-service.yaml`

```yaml
apiVersion: v1
kind: Service
metadata:
  name: traefik
  namespace: sonar
  annotations:
    metallb.universe.tf/loadBalancerIPs: "10.199.0.32"
spec:
  selector:
    app: traefik
  ports:
    - name: websecure
      port: 443
      targetPort: 443
      protocol: TCP
  type: LoadBalancer
```

Aplicar na ordem:

```bash
kubectl apply -f 08-traefik-serviceaccount.yaml
kubectl apply -f 09-traefik-rbac.yaml
kubectl apply -f 10-traefik-deployment.yaml
kubectl apply -f 11-traefik-service.yaml
```

---

## 11. IngressRoute (Rota TLS)

Arquivo: `12-ingressroute-sonarqube.yaml`

```yaml
apiVersion: traefik.io/v1alpha1
kind: IngressRoute
metadata:
  name: sonarqube-ingress
  namespace: sonar
spec:
  entryPoints:
    - websecure
  routes:
    - match: Host(`sonar.prodam.am.gov.br`)
      kind: Rule
      services:
        - name: sonarqube
          port: 9000
  tls:
    secretName: tls-prodam
```

> **Pré-requisito:** O secret TLS deve existir no namespace `sonar`. Se o certificado está em outro namespace, copie-o:
>
> ```bash
> kubectl get secret tls-prodam -n NAMESPACE_ORIGEM -o yaml | \
>   sed 's/namespace: .*/namespace: sonar/' | \
>   kubectl apply -f -
> ```

Aplicar:

```bash
kubectl apply -f 12-ingressroute-sonarqube.yaml
```

---

## 12. Validação da Instalação

### 12.1. Verificar todos os pods

```bash
kubectl get pods -n sonar
```

Saída esperada (todos com STATUS `Running` e READY `1/1`):

```
NAME                              READY   STATUS    AGE
sonar-postgres-xxxxx              1/1     Running   ...
sonarqube-xxxxx                   1/1     Running   ...
traefik-xxxxx                     1/1     Running   ...
```

### 12.2. Verificar o Service LoadBalancer

```bash
kubectl get svc traefik -n sonar
```

O `EXTERNAL-IP` deve mostrar o IP configurado no MetalLB (ex: `10.199.0.32`).

### 12.3. Verificar o certificado TLS

```bash
openssl s_client -connect sonar.prodam.am.gov.br:443 -servername sonar.prodam.am.gov.br < /dev/null 2>/dev/null | openssl x509 -noout -subject -issuer
```

O certificado retornado **não** deve ser "TRAEFIK DEFAULT CERT". Deve mostrar o subject do seu certificado.

### 12.4. Verificar logs do Traefik (sem erros de RBAC)

```bash
kubectl logs deployment/traefik -n sonar
```

Não deve haver mensagens de `forbidden`.

### 12.5. Acessar via navegador

Acesse `https://sonar.prodam.am.gov.br` — a tela de login do SonarQube deve aparecer.

---

## 13. Primeiro Acesso

- Login padrão: `admin` / `admin`
- O SonarQube solicitará a troca da senha no primeiro acesso
- Após o login, configure os projetos e tokens de acesso para integração com pipelines CI/CD

---

## 14. Troubleshooting

### SonarQube em CrashLoopBackOff

Verificar logs:

```bash
kubectl logs deployment/sonarqube -n sonar -f
```

Causas comuns:
- **"vm.max_map_count too low"**: Execute o sysctl no node (seção 2)
- **"upgrade from is too old"**: O banco possui dados de uma versão incompatível. Apague os PVCs e recrie (perda de dados):

```bash
kubectl scale deployment sonarqube -n sonar --replicas=0
kubectl scale deployment sonar-postgres -n sonar --replicas=0
kubectl delete pvc pvc-sonar-postgres pvc-sonar-data -n sonar
kubectl apply -f 02-pvc-postgres.yaml
kubectl apply -f 03-pvc-sonarqube.yaml
kubectl scale deployment sonar-postgres -n sonar --replicas=1
kubectl wait --for=condition=ready pod -l app=sonar-postgres -n sonar --timeout=120s
kubectl scale deployment sonarqube -n sonar --replicas=1
```

### Traefik usando certificado default (TRAEFIK DEFAULT CERT)

- Verificar se o secret TLS existe no namespace `sonar`: `kubectl get secret tls-prodam -n sonar`
- Verificar se a flag `--entrypoints.websecure.http.tls` está nos args do deployment do Traefik
- Verificar logs do Traefik por erros de `forbidden` (RBAC incompleto)

### Erro de YAML com caracteres especiais (M-BM-)

Se os arquivos foram copiados do navegador, podem conter caracteres non-breaking space (UTF-8 `0xC2 0xA0`). Corrija com:

```bash
sed -i 's/\xc2\xa0/ /g' *.yaml
```

### ErrImagePull / ImagePullBackOff

Os nodes precisam de acesso ao Docker Hub (`registry-1.docker.io`). Teste a conectividade:

```bash
curl -I https://registry-1.docker.io/v2/
```

Se não houver acesso, considere usar um registry mirror privado e alterar as imagens nos manifests.

---

## Ordem Completa de Aplicação (Resumo)

```bash
# 1. Preparar nodes (executar em cada node)
sudo sysctl -w vm.max_map_count=524288
echo "vm.max_map_count=524288" | sudo tee /etc/sysctl.d/99-sonarqube.conf

# 2. CRDs e RBAC do Traefik
kubectl apply -f https://raw.githubusercontent.com/traefik/traefik/v3.1/docs/content/reference/dynamic-configuration/kubernetes-crd-definition-v1.yml
kubectl apply -f https://raw.githubusercontent.com/traefik/traefik/v3.1/docs/content/reference/dynamic-configuration/kubernetes-crd-rbac.yml

# 3. Manifestos na ordem
kubectl apply -f 01-namespace.yaml
kubectl apply -f 02-pvc-postgres.yaml
kubectl apply -f 03-pvc-sonarqube.yaml
kubectl apply -f 04-secret-postgres.yaml
kubectl apply -f 05-deployment-postgres.yaml

# Aguardar PostgreSQL ficar pronto
kubectl wait --for=condition=ready pod -l app=sonar-postgres -n sonar --timeout=120s

kubectl apply -f 06-deployment-sonarqube.yaml
kubectl apply -f 07-service-sonarqube.yaml
kubectl apply -f 08-traefik-serviceaccount.yaml
kubectl apply -f 09-traefik-rbac.yaml
kubectl apply -f 10-traefik-deployment.yaml
kubectl apply -f 11-traefik-service.yaml
kubectl apply -f 12-ingressroute-sonarqube.yaml

# 4. Validar
kubectl get pods -n sonar
```

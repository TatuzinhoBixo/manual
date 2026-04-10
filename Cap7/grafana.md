# Grafana — Stack de Observabilidade Kubernetes

## Descrição Geral

O Grafana é a plataforma de visualização da stack de observabilidade. Ele consome métricas do Prometheus e logs do Loki, e se integra ao Kiali para exibição de dashboards Istio.

Esta implantação usa um **sidecar** (`kiwigrid/k8s-sidecar`) para descoberta automática de dashboards via ConfigMaps com o label `grafana_dashboard: "1"`, eliminando a necessidade de reiniciar o pod ao adicionar novos dashboards.

Os datasources (Prometheus e Loki) são provisionados automaticamente via ConfigMap na inicialização.

---

## Tabela de Variáveis

| Variável                       | Descrição                                      | Exemplo                 |
| ------------------------------ | ---------------------------------------------- | ----------------------- |
| `<NAMESPACE>`                  | Namespace de observabilidade                   | `observability`         |
| `<STORAGE_CLASS>`              | StorageClass do namespace                      | `sc-observability`      |
| `<GRAFANA_STORAGE_SIZE>`       | Tamanho do PVC do Grafana                      | `10Gi`                  |
| `<GRAFANA_ADMIN_USER_B64>`     | Usuário admin em base64                        | `YWRtaW4=`              |
| `<GRAFANA_ADMIN_PASSWORD_B64>` | Senha admin em base64                          | —                       |
| `<DOMAIN>`                     | Domínio base                                   | `example.com`           |
| `<TLS_SECRET_NAME>`            | Nome do secret TLS no namespace `istio-system` | `tls-example`           |
| `<ISTIO_GATEWAY_NAME>`         | Nome do Gateway Istio compartilhado            | `observability-gateway` |

---

## Pré-requisitos

- Namespace `<NAMESPACE>` criado no cluster
- StorageClass `<STORAGE_CLASS>` disponível no cluster
- Istio instalado e operacional no cluster
- Secret TLS `<TLS_SECRET_NAME>` criado no namespace `istio-system`
- DNS apontando `grafana.<DOMAIN>` para o IP do Istio IngressGateway
- Prometheus implantado no mesmo namespace (ver tutorial: `prometheus.md`)
- Loki implantado no mesmo namespace (ver tutorial: `loki.md`)

---

## Etapas

### 1. Criar o ServiceAccount e RBAC

O sidecar `k8s-sidecar` precisa de permissão para listar ConfigMaps no namespace.

```yaml
# grafana-rbac.yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: grafana
  namespace: <NAMESPACE>
  labels:
    app: grafana
---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: grafana-sidecar
  namespace: <NAMESPACE>
  labels:
    app: grafana
rules:
- apiGroups: [""]
  resources:
    - configmaps
  verbs: ["get", "list", "watch"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: grafana-sidecar
  namespace: <NAMESPACE>
  labels:
    app: grafana
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: Role
  name: grafana-sidecar
subjects:
- kind: ServiceAccount
  name: grafana
  namespace: <NAMESPACE>
```

```bash
kubectl apply -f grafana-rbac.yaml
```

---

### 2. Criar o Secret de credenciais

> **Recomendação para produção:** Utilize Sealed Secrets para não versionar credenciais em texto no repositório Git.
>
> ```bash
> # Gerar valores base64
> echo -n 'admin'       | base64
> echo -n 'sua-senha'   | base64
>
> # Alternativa com Sealed Secrets
> kubectl create secret generic grafana-admin-credentials \
>   --from-literal=admin-user='admin' \
>   --from-literal=admin-password='<SENHA>' \
>   --namespace <NAMESPACE> \
>   --dry-run=client -o yaml | \
>   kubeseal --format yaml > grafana-credentials-sealed.yaml
>
> kubectl apply -f grafana-credentials-sealed.yaml
> ```

```yaml
# grafana-secret.yaml
apiVersion: v1
kind: Secret
metadata:
  name: grafana-admin-credentials
  namespace: <NAMESPACE>
  labels:
    app: grafana
type: Opaque
data:
  admin-user: <GRAFANA_ADMIN_USER_B64>         # echo -n 'admin' | base64
  admin-password: <GRAFANA_ADMIN_PASSWORD_B64> # echo -n 'senha' | base64
```

```bash
kubectl apply -f grafana-secret.yaml
```

---

### 3. Criar os ConfigMaps de provisionamento

#### 3.1 Datasources

```yaml
# grafana-datasources-configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: grafana-datasources
  namespace: <NAMESPACE>
  labels:
    app: grafana
data:
  datasources.yaml: |
    apiVersion: 1
    datasources:
    - name: Prometheus
      type: prometheus
      access: proxy
      url: http://prometheus.<NAMESPACE>.svc.cluster.local:9090
      isDefault: true
      editable: true
      jsonData:
        timeInterval: 15s
    - name: Loki
      type: loki
      access: proxy
      url: http://loki-read.<NAMESPACE>.svc.cluster.local:3100
      editable: true
      jsonData:
        maxLines: 1000
```

```bash
kubectl apply -f grafana-datasources-configmap.yaml
```

---

#### 3.2 Dashboard provider

```yaml
# grafana-dashboard-provider-configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: grafana-dashboard-provider
  namespace: <NAMESPACE>
data:
  dashboards.yaml: |
    apiVersion: 1
    providers:
    - name: default
      orgId: 1
      folder: ''
      type: file
      disableDeletion: false
      editable: true
      options:
        path: /var/lib/grafana/dashboards
        foldersFromFilesStructure: false
```

```bash
kubectl apply -f grafana-dashboard-provider-configmap.yaml
```

---

### 4. Criar o PVC

```yaml
# grafana-pvc.yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: grafana-storage
  namespace: <NAMESPACE>
  labels:
    app: grafana
spec:
  accessModes:
    - ReadWriteOnce
  storageClassName: <STORAGE_CLASS>
  resources:
    requests:
      storage: <GRAFANA_STORAGE_SIZE>
```

```bash
kubectl apply -f grafana-pvc.yaml
```

---

### 5. Criar o Service

```yaml
# grafana-service.yaml
apiVersion: v1
kind: Service
metadata:
  name: grafana
  namespace: <NAMESPACE>
  labels:
    app: grafana
spec:
  type: ClusterIP
  selector:
    app: grafana
  ports:
    - name: http
      port: 3000
      targetPort: 3000
      protocol: TCP
```

```bash
kubectl apply -f grafana-service.yaml
```

---

### 6. Criar o Deployment

> **Notas sobre imagens:**
> - `grafana/grafana:11.4.0` — verifique a versão mais recente em https://hub.docker.com/r/grafana/grafana/tags
> - `kiwigrid/k8s-sidecar:1.28.0` — verifique a versão mais recente em https://hub.docker.com/r/kiwigrid/k8s-sidecar/tags

```yaml
# grafana-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: grafana
  namespace: <NAMESPACE>
  labels:
    app: grafana
spec:
  replicas: 1
  selector:
    matchLabels:
      app: grafana
  template:
    metadata:
      labels:
        app: grafana
    spec:
      serviceAccountName: grafana
      securityContext:
        runAsNonRoot: true
        runAsUser: 472
        runAsGroup: 472
        fsGroup: 472
      containers:
        # Sidecar: descobre dashboards via ConfigMaps com label grafana_dashboard: "1"
        - name: grafana-sc-dashboard
          image: kiwigrid/k8s-sidecar:1.28.0 # verifique a versão mais recente
          env:
            - name: LABEL
              value: grafana_dashboard
            - name: LABEL_VALUE
              value: "1"
            - name: FOLDER
              value: /var/lib/grafana/dashboards
            - name: NAMESPACE
              value: <NAMESPACE>
            - name: RESOURCE
              value: configmap
          resources:
            requests:
              memory: 64Mi
              cpu: 50m
            limits:
              memory: 128Mi
              cpu: 100m
          volumeMounts:
            - name: dashboards
              mountPath: /var/lib/grafana/dashboards
        # Container principal do Grafana
        - name: grafana
          image: grafana/grafana:11.4.0 # verifique a versão mais recente
          ports:
            - name: http
              containerPort: 3000
              protocol: TCP
          env:
            - name: GF_SECURITY_ADMIN_USER
              valueFrom:
                secretKeyRef:
                  name: grafana-admin-credentials
                  key: admin-user
            - name: GF_SECURITY_ADMIN_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: grafana-admin-credentials
                  key: admin-password
            - name: GF_PATHS_PROVISIONING
              value: /etc/grafana/provisioning
            - name: GF_SERVER_ROOT_URL
              value: https://grafana.<DOMAIN>
            - name: GF_AUTH_BASIC_ENABLED
              value: "true"
            - name: GF_INSTALL_PLUGINS
              value: ''
          resources:
            requests:
              memory: 256Mi
              cpu: 100m
            limits:
              memory: 512Mi
              cpu: 200m
          volumeMounts:
            - name: storage
              mountPath: /var/lib/grafana
            - name: datasources
              mountPath: /etc/grafana/provisioning/datasources
            - name: dashboard-provider
              mountPath: /etc/grafana/provisioning/dashboards
            - name: dashboards
              mountPath: /var/lib/grafana/dashboards
          livenessProbe:
            httpGet:
              path: /api/health
              port: 3000
            initialDelaySeconds: 30
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /api/health
              port: 3000
            initialDelaySeconds: 5
            periodSeconds: 5
      volumes:
        - name: storage
          persistentVolumeClaim:
            claimName: grafana-storage
        - name: datasources
          configMap:
            name: grafana-datasources
        - name: dashboard-provider
          configMap:
            name: grafana-dashboard-provider
        - name: dashboards
          emptyDir: {}
```

```bash
kubectl apply -f grafana-deployment.yaml
```

---

### 7. Criar o Istio Gateway e VirtualService

> **Nota:** O Gateway `<ISTIO_GATEWAY_NAME>` é compartilhado com Prometheus e Alertmanager. Adicione o host `grafana.<DOMAIN>` ao Gateway existente ou crie um novo exclusivo para o Grafana.

```yaml
# grafana-istio.yaml
apiVersion: networking.istio.io/v1beta1
kind: Gateway
metadata:
  name: <ISTIO_GATEWAY_NAME>
  namespace: <NAMESPACE>
spec:
  selector:
    istio: ingressgateway
    app: observability-ingressgateway
  servers:
    - port:
        number: 443
        name: https-grafana
        protocol: HTTPS
      tls:
        mode: SIMPLE
        credentialName: <TLS_SECRET_NAME>
      hosts:
        - grafana.<DOMAIN>
    # Adicionar entradas para prometheus e alertmanager no mesmo Gateway
    - port:
        number: 443
        name: https-prometheus
        protocol: HTTPS
      tls:
        mode: SIMPLE
        credentialName: <TLS_SECRET_NAME>
      hosts:
        - prometheus.<DOMAIN>
    - port:
        number: 443
        name: https-alertmanager
        protocol: HTTPS
      tls:
        mode: SIMPLE
        credentialName: <TLS_SECRET_NAME>
      hosts:
        - alertmanager.<DOMAIN>
---
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: grafana
  namespace: <NAMESPACE>
spec:
  hosts:
    - grafana.<DOMAIN>
  gateways:
    - <ISTIO_GATEWAY_NAME>
  http:
    - match:
        - uri:
            prefix: /
      route:
        - destination:
            host: grafana
            port:
              number: 3000
```

```bash
kubectl apply -f grafana-istio.yaml
```

---

### 8. Adicionar dashboards via ConfigMap

Para adicionar um dashboard ao Grafana sem reiniciar o pod, crie um ConfigMap com o label `grafana_dashboard: "1"` no namespace `<NAMESPACE>`. O sidecar detecta automaticamente.

```yaml
# exemplo-dashboard-configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: dashboard-kubernetes-cluster
  namespace: <NAMESPACE>
  labels:
    grafana_dashboard: "1"
data:
  kubernetes-cluster.json: |
    { ... conteúdo JSON do dashboard ... }
```

> **Dica:** Dashboards Istio padrão podem ser importados pelo ID no Grafana: Istio Mesh Dashboard (7639), Istio Service Dashboard (7636), Istio Workload Dashboard (7630), Istio Performance Dashboard (11829).

---

## Tabela de Parâmetros Importantes

| Parâmetro                  | Localização                  | Descrição                                                                      |
| -------------------------- | ---------------------------- | ------------------------------------------------------------------------------ |
| `GF_SERVER_ROOT_URL`       | Deployment → env             | URL pública do Grafana. Necessário para links corretos em alertas e embeddings |
| `GF_AUTH_BASIC_ENABLED`    | Deployment → env             | Habilita autenticação básica (usuário/senha)                                   |
| `GF_INSTALL_PLUGINS`       | Deployment → env             | Plugins a instalar na inicialização. Separar por vírgula                       |
| `runAsUser: 472`           | Deployment → securityContext | UID padrão do Grafana na imagem oficial                                        |
| `fsGroup: 472`             | Deployment → securityContext | Garante que o PVC seja acessível pelo usuário 472                              |
| `LABEL: grafana_dashboard` | Sidecar → env                | Label que o sidecar usa para descobrir ConfigMaps de dashboards                |
| `NAMESPACE`                | Sidecar → env                | Limita a descoberta de ConfigMaps ao namespace especificado                    |
| `timeInterval: 15s`        | Datasource Prometheus        | Deve corresponder ao `scrape_interval` do Prometheus                           |
| `maxLines: 1000`           | Datasource Loki              | Limite de linhas por query LogQL                                               |

---

## Comandos Úteis

```bash
# Status do pod
kubectl get pod -n <NAMESPACE> -l app=grafana

# Logs do Grafana
kubectl logs -n <NAMESPACE> -l app=grafana -c grafana --tail=100 -f

# Logs do sidecar de dashboards
kubectl logs -n <NAMESPACE> -l app=grafana -c grafana-sc-dashboard --tail=50 -f

# Acesso via port-forward
kubectl port-forward -n <NAMESPACE> svc/grafana 3000:3000
# Acessar: http://localhost:3000

# Verificar datasources provisionados via API
kubectl port-forward -n <NAMESPACE> svc/grafana 3000:3000
curl -u admin:<SENHA> http://localhost:3000/api/datasources

# Verificar dashboards provisionados
curl -u admin:<SENHA> http://localhost:3000/api/search

# Rollout restart
kubectl rollout restart deployment/grafana -n <NAMESPACE>

# Verificar PVC
kubectl get pvc grafana-storage -n <NAMESPACE>
```

---

## Troubleshooting

### Grafana não carrega datasource do Prometheus

```bash
kubectl logs -n <NAMESPACE> -l app=grafana -c grafana | grep -i "prometheus\|datasource"
```

Verificar conectividade:

```bash
kubectl exec -n <NAMESPACE> deploy/grafana -c grafana -- \
  wget -qO- http://prometheus.<NAMESPACE>.svc.cluster.local:9090/-/ready
```

---

### Dashboards não aparecem após criação do ConfigMap

Verificar logs do sidecar:

```bash
kubectl logs -n <NAMESPACE> -l app=grafana -c grafana-sc-dashboard | grep -i "dashboard\|configmap"
```

Confirmar que o ConfigMap tem o label correto:

```bash
kubectl get configmap -n <NAMESPACE> -l grafana_dashboard=1
```

---

### Erro de permissão no PVC

```bash
kubectl describe pod -n <NAMESPACE> -l app=grafana | grep -A5 Warning
```

Causas comuns: `fsGroup: 472` não configurado ou StorageClass sem suporte a mudança de ownership.

---

### GF_SERVER_ROOT_URL incorreto

Se os links de alerta ou embeddings do Grafana apontarem para URL errada, verificar a variável de ambiente:

```bash
kubectl exec -n <NAMESPACE> deploy/grafana -c grafana -- \
  env | grep GF_SERVER_ROOT_URL
```

---

## Referências

- [Grafana Documentation](https://grafana.com/docs/grafana/latest/)
- [Grafana Provisioning](https://grafana.com/docs/grafana/latest/administration/provisioning/)
- [k8s-sidecar GitHub](https://github.com/kiwigrid/k8s-sidecar)
- [grafana/grafana Docker Hub](https://hub.docker.com/r/grafana/grafana/tags)
- [kiwigrid/k8s-sidecar Docker Hub](https://hub.docker.com/r/kiwigrid/k8s-sidecar/tags)
- [Istio Grafana Dashboards](https://grafana.com/grafana/dashboards/?search=istio)

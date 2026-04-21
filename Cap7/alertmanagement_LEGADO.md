# Alertmanager — Stack de Observabilidade Kubernetes

## Descrição Geral

O Alertmanager gerencia os alertas disparados pelo Prometheus. Ele recebe alertas, aplica agrupamento, inibição e silenciamento, e os encaminha para receivers configurados (email, Microsoft Teams, Slack, entre outros).

Esta implantação usa um **StatefulSet com 2 réplicas** em modo cluster (HA), onde as instâncias se comunicam via gossip protocol na porta 9094 para sincronizar o estado de silenciamentos e inibições.

---

## Tabela de Variáveis

| Variável                      | Descrição                                      | Exemplo                 |
| ----------------------------- | ---------------------------------------------- | ----------------------- |
| `<NAMESPACE>`                 | Namespace de observabilidade                   | `observability`         |
| `<STORAGE_CLASS>`             | StorageClass do namespace                      | `sc-observability`      |
| `<ALERTMANAGER_STORAGE_SIZE>` | Tamanho do PVC por réplica                     | `10Gi`                  |
| `<DOMAIN>`                    | Domínio base                                   | `example.com`           |
| `<TLS_SECRET_NAME>`           | Nome do secret TLS no namespace `istio-system` | `tls-example`           |
| `<ISTIO_GATEWAY_NAME>`        | Nome do Gateway Istio compartilhado            | `observability-gateway` |
| `<SMTP_SMARTHOST>`            | Host SMTP para envio de email                  | `smtp.example.com:587`  |
| `<SMTP_FROM>`                 | Endereço de origem dos emails                  | `alertas@example.com`   |
| `<SMTP_AUTH_USER>`            | Usuário SMTP                                   | —                       |
| `<SMTP_AUTH_PASSWORD>`        | Senha SMTP                                     | —                       |
| `<EMAIL_RECEIVER>`            | Endereço de destino dos alertas                | `equipe@example.com`    |
| `<TEAMS_WEBHOOK_URL>`         | Webhook URL do Microsoft Teams                 | —                       |

---

## Pré-requisitos

- Namespace `<NAMESPACE>` criado no cluster
- StorageClass `<STORAGE_CLASS>` disponível no cluster
- Istio instalado e operacional no cluster
- Secret TLS `<TLS_SECRET_NAME>` criado no namespace `istio-system`
- DNS apontando `alertmanager.<DOMAIN>` para o IP do Istio IngressGateway
- Prometheus implantado e apontando para `alertmanager:9093` (ver tutorial: `prometheus.md`)

---

## Etapas

### 1. Criar o ServiceAccount

```yaml
# alertmanager-serviceaccount.yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: alertmanager
  namespace: <NAMESPACE>
  labels:
    app: alertmanager
```

```bash
kubectl apply -f alertmanager-serviceaccount.yaml
```

---

### 2. Criar o ConfigMap de configuração

A configuração abaixo inclui exemplos comentados de receivers para **email** e **Microsoft Teams**. Ative e ajuste conforme necessário.

```yaml
# alertmanager-configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: alertmanager-config
  namespace: <NAMESPACE>
  labels:
    app: alertmanager
data:
  alertmanager.yml: |
    global:
      resolve_timeout: 5m
      # Configurações globais de SMTP (descomente para usar email)
      # smtp_smarthost: '<SMTP_SMARTHOST>'
      # smtp_from: '<SMTP_FROM>'
      # smtp_auth_username: '<SMTP_AUTH_USER>'
      # smtp_auth_password: '<SMTP_AUTH_PASSWORD>'
      # smtp_require_tls: true

    route:
      group_by: ['alertname', 'cluster', 'namespace']
      group_wait: 10s
      group_interval: 10s
      repeat_interval: 12h
      receiver: 'null'
      # Para rotear alertas críticos para um receiver específico:
      # routes:
      #   - match:
      #       severity: critical
      #     receiver: email-critico
      #   - match:
      #       severity: warning
      #     receiver: teams-avisos

    receivers:
    - name: 'null'

    # Exemplo de receiver por email
    # - name: 'email-critico'
    #   email_configs:
    #   - to: '<EMAIL_RECEIVER>'
    #     send_resolved: true
    #     headers:
    #       Subject: '[{{ .Status | toUpper }}] {{ .GroupLabels.alertname }} - {{ .GroupLabels.namespace }}'
    #     html: |
    #       <h2>{{ .Status | toUpper }}: {{ .GroupLabels.alertname }}</h2>
    #       {{ range .Alerts }}
    #       <p><b>Namespace:</b> {{ .Labels.namespace }}<br>
    #       <b>Descrição:</b> {{ .Annotations.description }}<br>
    #       <b>Início:</b> {{ .StartsAt }}</p>
    #       {{ end }}

    # Exemplo de receiver por Microsoft Teams (via webhook)
    # Requer o conector "Incoming Webhook" configurado no canal Teams
    # - name: 'teams-avisos'
    #   webhook_configs:
    #   - url: '<TEAMS_WEBHOOK_URL>'
    #     send_resolved: true
    #     http_config:
    #       tls_config:
    #         insecure_skip_verify: false
    #     # O Teams espera payload JSON no formato de MessageCard
    #     # Para formatação avançada, use um webhook intermediário como
    #     # prometheus-msteams: https://github.com/prometheus-msteams/prometheus-msteams

    # Exemplo de receiver por Slack
    # - name: 'slack-alertas'
    #   slack_configs:
    #   - api_url: 'https://hooks.slack.com/services/YOUR/WEBHOOK/URL'
    #     channel: '#alertas'
    #     send_resolved: true
    #     title: '[{{ .Status | toUpper }}] {{ .GroupLabels.alertname }}'
    #     text: |
    #       {{ range .Alerts }}
    #       *Namespace:* {{ .Labels.namespace }}
    #       *Descrição:* {{ .Annotations.description }}
    #       {{ end }}
```

```bash
kubectl apply -f alertmanager-configmap.yaml
```

---

### 3. Criar o Service

O Service usa `clusterIP: None` (headless) para que as réplicas do StatefulSet se descubram via DNS e formem o cluster de gossip.

```yaml
# alertmanager-service.yaml
apiVersion: v1
kind: Service
metadata:
  name: alertmanager
  namespace: <NAMESPACE>
  labels:
    app: alertmanager
spec:
  type: ClusterIP
  clusterIP: None
  selector:
    app: alertmanager
  ports:
    - name: web
      port: 9093
      targetPort: 9093
      protocol: TCP
    - name: cluster
      port: 9094
      targetPort: 9094
      protocol: TCP
```

```bash
kubectl apply -f alertmanager-service.yaml
```

---

### 4. Criar o StatefulSet

> **Nota:** Imagem fixada em `prom/alertmanager:v0.27.0`. Verifique a versão mais recente em https://hub.docker.com/r/prom/alertmanager/tags antes de implantar em produção.

```yaml
# alertmanager-statefulset.yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: alertmanager
  namespace: <NAMESPACE>
  labels:
    app: alertmanager
spec:
  serviceName: alertmanager
  replicas: 2
  selector:
    matchLabels:
      app: alertmanager
  template:
    metadata:
      labels:
        app: alertmanager
    spec:
      serviceAccountName: alertmanager
      securityContext:
        runAsNonRoot: true
        runAsUser: 65534
        fsGroup: 65534
      affinity:
        podAntiAffinity:
          preferredDuringSchedulingIgnoredDuringExecution:
            - weight: 100
              podAffinityTerm:
                labelSelector:
                  matchExpressions:
                    - key: app
                      operator: In
                      values:
                        - alertmanager
                topologyKey: kubernetes.io/hostname
      containers:
        - name: alertmanager
          image: prom/alertmanager:v0.27.0 # verifique a versão mais recente
          args:
            - '--config.file=/etc/alertmanager/alertmanager.yml'
            - '--storage.path=/alertmanager'
            - '--cluster.listen-address=0.0.0.0:9094'
            - '--cluster.peer=alertmanager-0.alertmanager.<NAMESPACE>.svc.cluster.local:9094'
            - '--cluster.peer=alertmanager-1.alertmanager.<NAMESPACE>.svc.cluster.local:9094'
          ports:
            - name: web
              containerPort: 9093
              protocol: TCP
            - name: cluster
              containerPort: 9094
              protocol: TCP
          resources:
            requests:
              memory: 128Mi
              cpu: 100m
            limits:
              memory: 256Mi
              cpu: 200m
          volumeMounts:
            - name: config
              mountPath: /etc/alertmanager
            - name: storage
              mountPath: /alertmanager
          livenessProbe:
            httpGet:
              path: /-/healthy
              port: 9093
            initialDelaySeconds: 30
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /-/ready
              port: 9093
            initialDelaySeconds: 5
            periodSeconds: 5
      volumes:
        - name: config
          configMap:
            name: alertmanager-config
  volumeClaimTemplates:
    - metadata:
        name: storage
      spec:
        accessModes:
          - ReadWriteOnce
        storageClassName: <STORAGE_CLASS>
        resources:
          requests:
            storage: <ALERTMANAGER_STORAGE_SIZE>
```

```bash
kubectl apply -f alertmanager-statefulset.yaml
```

---

### 5. Criar o Istio VirtualService

> **Nota:** O Gateway `<ISTIO_GATEWAY_NAME>` é compartilhado com Grafana e Prometheus. Adicione o host `alertmanager.<DOMAIN>` ao Gateway existente.

```yaml
# alertmanager-istio.yaml
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: alertmanager
  namespace: <NAMESPACE>
spec:
  hosts:
    - alertmanager.<DOMAIN>
  gateways:
    - <ISTIO_GATEWAY_NAME>
  http:
    - match:
        - uri:
            prefix: /
      route:
        - destination:
            host: alertmanager
            port:
              number: 9093
```

```bash
kubectl apply -f alertmanager-istio.yaml
```

> **Lembrete:** Adicionar o host `alertmanager.<DOMAIN>` ao Gateway `<ISTIO_GATEWAY_NAME>` (ver tutorial: `grafana.md`, Passo 7).

---

## Tabela de Parâmetros Importantes

| Parâmetro          | Localização                   | Descrição                                                                       |
| ------------------ | ----------------------------- | ------------------------------------------------------------------------------- |
| `group_by`         | `alertmanager.yml` → `route`  | Labels usados para agrupar alertas. Evita flood de notificações                 |
| `group_wait`       | `alertmanager.yml` → `route`  | Tempo de espera antes de enviar o primeiro alerta do grupo                      |
| `group_interval`   | `alertmanager.yml` → `route`  | Intervalo mínimo entre notificações do mesmo grupo                              |
| `repeat_interval`  | `alertmanager.yml` → `route`  | Intervalo para reenvio de alertas já notificados mas ainda ativos               |
| `resolve_timeout`  | `alertmanager.yml` → `global` | Tempo para considerar um alerta resolvido após não receber mais disparos        |
| `--cluster.peer`   | StatefulSet → args            | FQDN de cada réplica para formação do cluster HA. Deve listar todas as réplicas |
| `clusterIP: None`  | Service                       | Headless — permite resolução DNS por pod para gossip protocol                   |
| `podAntiAffinity`  | StatefulSet → affinity        | Garante que as réplicas fiquem em nodes diferentes para HA real                 |
| `runAsUser: 65534` | StatefulSet → securityContext | Usuário `nobody` — padrão da imagem oficial                                     |

---

## Comandos Úteis

```bash
# Status dos pods
kubectl get pods -n <NAMESPACE> -l app=alertmanager

# Logs
kubectl logs -n <NAMESPACE> alertmanager-0 --tail=100 -f
kubectl logs -n <NAMESPACE> alertmanager-1 --tail=100 -f

# Acessar UI via port-forward
kubectl port-forward -n <NAMESPACE> svc/alertmanager 9093:9093
# Acessar: http://localhost:9093

# Verificar status do cluster HA
kubectl port-forward -n <NAMESPACE> svc/alertmanager 9093:9093
curl http://localhost:9093/api/v2/status | python3 -m json.tool

# Verificar alertas ativos
curl http://localhost:9093/api/v2/alerts

# Recarregar configuração sem restart
curl -X POST http://localhost:9093/-/reload

# Verificar PVCs
kubectl get pvc -n <NAMESPACE> -l app=alertmanager

# Rollout restart
kubectl rollout restart statefulset/alertmanager -n <NAMESPACE>
```

---

## Troubleshooting

### Pods não formam cluster HA

```bash
kubectl logs -n <NAMESPACE> alertmanager-0 | grep -i "cluster\|peer\|gossip"
```

Verificar se os FQDN dos peers estão corretos:

```bash
# Testar resolução DNS de dentro do pod
kubectl exec -n <NAMESPACE> alertmanager-0 -- \
  nslookup alertmanager-0.alertmanager.<NAMESPACE>.svc.cluster.local
```

---

### ConfigMap atualizado mas Alertmanager não recarregou

```bash
# Reload via API (sem downtime)
kubectl port-forward -n <NAMESPACE> svc/alertmanager 9093:9093
curl -X POST http://localhost:9093/-/reload

# Alternativa: rollout restart
kubectl rollout restart statefulset/alertmanager -n <NAMESPACE>
```

---

### Alertas não chegam no receiver configurado

Verificar em ordem:

1. Prometheus está enviando alertas para o Alertmanager:
```bash
kubectl port-forward -n <NAMESPACE> svc/prometheus 9090:9090
# Acessar: http://localhost:9090/alerts
```

2. Alertmanager recebe os alertas:
```bash
kubectl port-forward -n <NAMESPACE> svc/alertmanager 9093:9093
curl http://localhost:9093/api/v2/alerts
```

3. Configuração do receiver está correta:
```bash
curl http://localhost:9093/api/v2/status | python3 -m json.tool | grep -A5 receivers
```

---

### Microsoft Teams não recebe alertas (webhook)

O Alertmanager envia payload no formato Prometheus webhook, mas o Teams espera o formato MessageCard. Para compatibilidade, use o adaptador `prometheus-msteams`:

- [prometheus-msteams GitHub](https://github.com/prometheus-msteams/prometheus-msteams)

O adaptador recebe o payload do Alertmanager, converte para MessageCard e encaminha ao webhook do Teams.

---

## Referências

- [Alertmanager Documentation](https://prometheus.io/docs/alerting/latest/alertmanager/)
- [Alertmanager Configuration Reference](https://prometheus.io/docs/alerting/latest/configuration/)
- [Alertmanager HA](https://prometheus.io/docs/alerting/latest/alertmanager/#high-availability)
- [prometheus-msteams (Teams adapter)](https://github.com/prometheus-msteams/prometheus-msteams)
- [prom/alertmanager Docker Hub](https://hub.docker.com/r/prom/alertmanager/tags)

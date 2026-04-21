# Prometheus Operator (kube-prometheus-stack)

## Descrição

O `kube-prometheus-stack` é um Helm Chart que instala uma stack completa de observabilidade para Kubernetes, gerenciada pelo **Prometheus Operator**. Ele utiliza CRDs para configuração declarativa de scraping, alertas e regras, eliminando a necessidade de editar ConfigMaps manualmente.

---

## Componentes Instalados

| Componente              | Tipo        | Descrição                                      |
| :---------------------- | :---------- | :--------------------------------------------- |
| **Prometheus**          | StatefulSet | Servidor de coleta e armazenamento de métricas |
| **Alertmanager**        | StatefulSet | Gerenciamento e roteamento de alertas          |
| **Grafana**             | Deployment  | Visualização de métricas via dashboards        |
| **Node Exporter**       | DaemonSet   | Coleta métricas de hardware dos nodes          |
| **Kube State Metrics**  | Deployment  | Métricas de objetos do cluster Kubernetes      |
| **Prometheus Operator** | Deployment  | Gerencia os CRDs e reconcilia configurações    |

---

## CRDs do Prometheus Operator

| CRD                  | Descrição                                       |
| :------------------- | :---------------------------------------------- |
| `Prometheus`         | Define instâncias do Prometheus                 |
| `Alertmanager`       | Define instâncias do Alertmanager               |
| `ServiceMonitor`     | Define targets de scraping baseados em Services |
| `PodMonitor`         | Define targets de scraping baseados em Pods     |
| `PrometheusRule`     | Define regras de alertas e recording rules      |
| `AlertmanagerConfig` | Define configurações de receivers por namespace |

---

## Comparativo: kube-prometheus-stack vs Prometheus puro

| Aspecto     | Prometheus puro          | kube-prometheus-stack                           |
| :---------- | :----------------------- | :---------------------------------------------- |
| Componentes | Só Prometheus            | Prometheus + Grafana + Alertmanager + Exporters |
| Discovery   | Manual (ConfigMap)       | Automático (ServiceMonitor/PodMonitor)          |
| Alertas     | ConfigMap inline         | `PrometheusRule` CRD                            |
| Réplicas    | Deployment simples       | StatefulSet gerenciado                          |
| HA          | Réplicas independentes   | Suporte Thanos nativo                           |
| Manutenção  | `helm upgrade` para tudo | CRDs + `helm upgrade`                           |

---

## Portas

| Componente         | Porta  | Descrição                     |
| :----------------- | :----- | :---------------------------- |
| Prometheus         | `9090` | Interface web e API           |
| Grafana            | `3000` | Interface web                 |
| Alertmanager       | `9093` | Interface web e API           |
| Node Exporter      | `9100` | Endpoint de métricas          |
| Kube State Metrics | `8080` | Endpoint de métricas          |
| Blackbox Exporter  | `9115` | Endpoint de métricas e probes |

---

## Pré-requisitos

- Cluster Kubernetes funcional
- Helm instalado e configurado
- `kubectl` com acesso ao cluster
- StorageClass disponível no cluster (`<STORAGE_CLASS>`)

---

## Variáveis de Configuração

| Variável                      | Descrição                              | Exemplo        |
| :---------------------------- | :------------------------------------- | :------------- |
| `<NAMESPACE>`                 | Namespace da stack                     | observability  |
| `<STORAGE_CLASS>`             | StorageClass disponível no cluster     | sc-nfs         |
| `<GRAFANA_PASS>`              | Senha do admin do Grafana              | SenhaForte123! |
| `<RETENTION_TIME>`            | Tempo de retenção das métricas         | 90d            |
| `<RETENTION_SIZE>`            | Tamanho máximo de retenção por réplica | 140GB          |
| `<STORAGE_PROMETHEUS>`        | Tamanho do PVC do Prometheus           | 150Gi          |
| `<STORAGE_ALERTMANAGER>`      | Tamanho do PVC do Alertmanager         | 10Gi           |
| `<STORAGE_GRAFANA>`           | Tamanho do PVC do Grafana              | 10Gi           |
| `<NUM_REPLICAS_PROMETHEUS>`   | Réplicas do Prometheus                 | 2              |
| `<NUM_REPLICAS_ALERTMANAGER>` | Réplicas do Alertmanager               | 2              |
| `<DOMAIN>`                    | Domínio base das UIs                   | tatulab.com.br |
| `<TLS_SECRET_NAME>`           | Secret TLS no namespace da stack       | tls-tatulab    |
| `<INGRESSGATEWAY_NAME>`       | Nome do ingressgateway do namespace    | monitoring-ingressgateway |

---

## Etapa 1: Adicionar Repositório Helm

```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update
```

---

## Etapa 2: Criar Namespace

```bash
kubectl create namespace <NAMESPACE>
```

---

## Etapa 3: Criar arquivo values.yaml

```yaml
# kube-prometheus-stack-values.yaml

fullnameOverride: prometheus

# ============================================================
# Prometheus
# ============================================================
prometheus:
  prometheusSpec:
    replicas: <NUM_REPLICAS_PROMETHEUS>        # ex: 1
    retention: <RETENTION_TIME>                # ex: 90d
    retentionSize: "<RETENTION_SIZE>"          # ex: "140GB"

    resources:
      requests:
        memory: 2Gi
        cpu: 500m
      limits:
        memory: 4Gi
        cpu: 2000m

    storageSpec:
      volumeClaimTemplate:
        spec:
          storageClassName: <STORAGE_CLASS>    # ex: sc-nfs
          accessModes: ["ReadWriteOnce"]
          resources:
            requests:
              storage: <STORAGE_PROMETHEUS>    # ex: 150Gi

    # Distribui réplicas em nodes diferentes (soft constraint)
    affinity:
      podAntiAffinity:
        preferredDuringSchedulingIgnoredDuringExecution:
          - weight: 100
            podAffinityTerm:
              labelSelector:
                matchExpressions:
                  - key: app.kubernetes.io/name
                    operator: In
                    values:
                      - prometheus
              topologyKey: kubernetes.io/hostname

    # Permite descoberta de ServiceMonitors em qualquer namespace
    serviceMonitorSelectorNilUsesHelmValues: false
    podMonitorSelectorNilUsesHelmValues: false
    ruleSelectorNilUsesHelmValues: false

# ============================================================
# Alertmanager
# ============================================================
alertmanager:
  enabled: true
  alertmanagerSpec:
    replicas: <NUM_REPLICAS_ALERTMANAGER>      # ex: 1
    storage:
      volumeClaimTemplate:
        spec:
          storageClassName: <STORAGE_CLASS>    # ex: sc-nfs
          accessModes: ["ReadWriteOnce"]
          resources:
            requests:
              storage: <STORAGE_ALERTMANAGER>  # ex: 10Gi

# ============================================================
# Grafana
# ============================================================
grafana:
  enabled: true
  adminPassword: "<GRAFANA_PASS>"              # ex: "SenhaForte123!"

  persistence:
    enabled: true
    storageClassName: <STORAGE_CLASS>          # ex: sc-nfs
    size: <STORAGE_GRAFANA>                    # ex: 10Gi

  # Desabilitar init container (evita ImagePullBackOff do busybox)
  initChownData:
    enabled: false

  securityContext:
    runAsUser: 472
    runAsGroup: 472
    fsGroup: 472

# ============================================================
# Exporters
# ============================================================
nodeExporter:
  enabled: true

kubeStateMetrics:
  enabled: true

prometheusOperator:
  enabled: true
```

> **Nota — Grafana initChownData:** O init container `busybox` pode causar `ImagePullBackOff` em ambientes com restrição de acesso ao Docker Hub. Desabilitá-lo e usar `fsGroup: 472` resolve o problema — o Kubernetes ajusta as permissões do volume automaticamente via `fsGroup`.

---

## Etapa 4: Instalar via Helm

```bash
helm install kube-prometheus-stack prometheus-community/kube-prometheus-stack \
  -f kube-prometheus-stack-values.yaml \
  -n <NAMESPACE>
```

---

## Etapa 5: Verificar Instalação

```bash
# Pods
kubectl get pods -n <NAMESPACE>

# PVCs
kubectl get pvc -n <NAMESPACE>

# CRDs instanciados
kubectl get prometheus -n <NAMESPACE>
kubectl get alertmanager -n <NAMESPACE>
kubectl get servicemonitor -n <NAMESPACE>
```

---

## Etapa 6: Atualizar Configuração

```bash
# Editar o values.yaml
vim kube-prometheus-stack-values.yaml

# Aplicar mudanças
helm upgrade kube-prometheus-stack prometheus-community/kube-prometheus-stack \
  -f kube-prometheus-stack-values.yaml \
  -n <NAMESPACE>
```

---

## Etapa 7: Exposição externa via Istio (perfil minimal)

No perfil `minimal` do Istio não existe um `istio-ingressgateway` compartilhado. O namespace da stack precisa do próprio ingressgateway + `Gateway` + `VirtualService` para expor Grafana, Prometheus e Alertmanager via `https://*.<DOMAIN>`.

### 7.1 Criar o ingressgateway do namespace

Seguir o template completo de `<NOME_APP>-ingressgateway.yaml` descrito em **`Cap1/Kubernets/8-istio.md`** (seção a partir da linha 385), substituindo:

- `<NOME_APP>` → `<INGRESSGATEWAY_NAME>`        # ex: monitoring
- `<NAMESPACE_APP>` → `<NAMESPACE>`              # ex: monitoring

Aplicar no cluster:

```bash
kubectl apply -f <INGRESSGATEWAY_NAME>.yaml
kubectl get pods -n <NAMESPACE> -l app=<INGRESSGATEWAY_NAME>
kubectl get svc  -n <NAMESPACE> -l app=<INGRESSGATEWAY_NAME>
```

### 7.2 Criar o Secret TLS no namespace da stack

O secret TLS deve existir no **mesmo namespace** do ingressgateway (não em `istio-system`, pois cada gateway do perfil minimal carrega seu próprio TLS).

```bash
kubectl create secret tls <TLS_SECRET_NAME> \
  --cert=/caminho/fullchain.pem \
  --key=/caminho/privkey.pem \
  -n <NAMESPACE>
```

### 7.3 Criar Gateway + VirtualServices

```yaml
# monitoring-istio.yaml
apiVersion: networking.istio.io/v1beta1
kind: Gateway
metadata:
  name: monitoring-gateway
  namespace: <NAMESPACE>                       # ex: monitoring
spec:
  selector:
    app: <INGRESSGATEWAY_NAME>                 # ex: monitoring-ingressgateway
    istio: ingressgateway
  servers:
    - port:
        number: 443
        name: https
        protocol: HTTPS
      tls:
        mode: SIMPLE
        credentialName: <TLS_SECRET_NAME>      # ex: tls-tatulab
      hosts:
        - grafana.<DOMAIN>                     # ex: grafana.tatulab.com.br
        - prometheus.<DOMAIN>
        - alertmanager.<DOMAIN>
---
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: grafana-vs
  namespace: <NAMESPACE>
spec:
  hosts:
    - grafana.<DOMAIN>
  gateways:
    - monitoring-gateway
  http:
    - route:
        - destination:
            host: kube-prometheus-stack-grafana
            port:
              number: 80
---
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: prometheus-vs
  namespace: <NAMESPACE>
spec:
  hosts:
    - prometheus.<DOMAIN>
  gateways:
    - monitoring-gateway
  http:
    - route:
        - destination:
            host: prometheus-prometheus
            port:
              number: 9090
---
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: alertmanager-vs
  namespace: <NAMESPACE>
spec:
  hosts:
    - alertmanager.<DOMAIN>
  gateways:
    - monitoring-gateway
  http:
    - route:
        - destination:
            host: prometheus-alertmanager
            port:
              number: 9093
```

```bash
kubectl apply -f monitoring-istio.yaml
```

### 7.4 DNS

Apontar os três hostnames para o IP do Service do ingressgateway do namespace:

```bash
# Descobrir o IP externo do gateway (MetalLB)
kubectl get svc -n <NAMESPACE> <INGRESSGATEWAY_NAME>
```

Criar registros A (ou CNAME) para:

- `grafana.<DOMAIN>`
- `prometheus.<DOMAIN>`
- `alertmanager.<DOMAIN>`

### 7.5 Validar

```bash
curl -I https://grafana.<DOMAIN>         # deve retornar 302 / 200
curl -I https://prometheus.<DOMAIN>
curl -I https://alertmanager.<DOMAIN>
```

> **Nota:** os nomes dos Services acima são os gerados pelo chart `kube-prometheus-stack` quando a release se chama `kube-prometheus-stack` e `fullnameOverride: prometheus` está no values.yaml. **Sempre confirme** com `kubectl get svc -n <NAMESPACE>` antes de aplicar os VirtualServices — os nomes mudam se você usar outra release name ou outro `fullnameOverride`.

---

## Acessos via Port-forward

```bash
# Prometheus
kubectl port-forward svc/prometheus-prometheus 9090:9090 -n <NAMESPACE>
# Acesse: http://localhost:9090

# Grafana
kubectl port-forward svc/prometheus-grafana 3000:80 -n <NAMESPACE>
# Acesse: http://localhost:3000

# Alertmanager
kubectl port-forward svc/prometheus-alertmanager 9093:9093 -n <NAMESPACE>
# Acesse: http://localhost:9093
```

---

## Blackbox Exporter

O Blackbox Exporter realiza probes externos — verifica disponibilidade HTTP/HTTPS, validade de certificados SSL e latência de endpoints.

### Instalar via Helm

```bash
helm install blackbox-exporter prometheus-community/prometheus-blackbox-exporter \
  --namespace <NAMESPACE> \
  --set serviceMonitor.enabled=true
```

### ServiceMonitor — Monitoramento de Sites e SSL

```yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: blackbox-sites
  namespace: <NAMESPACE>
  labels:
    release: kube-prometheus-stack
spec:
  selector:
    matchLabels:
      app.kubernetes.io/name: prometheus-blackbox-exporter
  endpoints:
    - port: http
      path: /probe
      params:
        module: [http_2xx]
      relabelings:
        - sourceLabels: [__address__]
          targetLabel: __param_target
        - sourceLabels: [__param_target]
          targetLabel: instance
        - targetLabel: __address__
          replacement: blackbox-exporter-prometheus-blackbox-exporter:9115
      metricRelabelings: []
---
# ConfigMap com os targets a monitorar
apiVersion: v1
kind: ConfigMap
metadata:
  name: blackbox-targets
  namespace: <NAMESPACE>
data:
  targets: |
    - https://gitlab.tatulab.com.br
    - https://argo.tatulab.com.br
    - https://grafana.tatulab.com.br
```

### PrometheusRule — Alertas de SSL e Disponibilidade

```yaml
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: blackbox-alerts
  namespace: <NAMESPACE>
  labels:
    release: kube-prometheus-stack
spec:
  groups:
    - name: blackbox.ssl
      rules:
        # Certificado expira em menos de 14 dias
        - alert: SSLCertificateExpiringSoon
          expr: |
            probe_ssl_earliest_cert_expiry - time() < 14 * 24 * 3600
          for: 1h
          labels:
            severity: warning
          annotations:
            summary: "Certificado SSL expirando em breve"
            description: "O certificado de {{ $labels.instance }} expira em menos de 14 dias."

        # Certificado expira em menos de 7 dias
        - alert: SSLCertificateExpiringCritical
          expr: |
            probe_ssl_earliest_cert_expiry - time() < 7 * 24 * 3600
          for: 1h
          labels:
            severity: critical
          annotations:
            summary: "Certificado SSL expirando criticamente"
            description: "O certificado de {{ $labels.instance }} expira em menos de 7 dias."

        # Certificado já expirado
        - alert: SSLCertificateExpired
          expr: |
            probe_ssl_earliest_cert_expiry - time() <= 0
          for: 0m
          labels:
            severity: critical
          annotations:
            summary: "Certificado SSL expirado"
            description: "O certificado de {{ $labels.instance }} está expirado."

    - name: blackbox.availability
      rules:
        # Site indisponível
        - alert: SiteDown
          expr: probe_success == 0
          for: 2m
          labels:
            severity: critical
          annotations:
            summary: "Site indisponível"
            description: "O endpoint {{ $labels.instance }} está inacessível há mais de 2 minutos."

        # Latência alta
        - alert: SiteHighLatency
          expr: probe_duration_seconds > 2
          for: 5m
          labels:
            severity: warning
          annotations:
            summary: "Latência alta detectada"
            description: "O endpoint {{ $labels.instance }} está respondendo em mais de 2 segundos."
```

---

## Alertmanager

### Configuração via Secret

O Alertmanager é configurado através de um Secret no Kubernetes.

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: alertmanager-prometheus-alertmanager
  namespace: <NAMESPACE>
type: Opaque
stringData:
  alertmanager.yaml: |
    global:
      resolve_timeout: 5m

    route:
      group_by: ['alertname', 'severity']
      group_wait: 30s
      group_interval: 5m
      repeat_interval: 4h
      receiver: 'default'
      routes:
        - matchers:
            - severity = "critical"
          receiver: 'critical-receiver'
          continue: true
        - matchers:
            - severity = "warning"
          receiver: 'warning-receiver'

    receivers:
      - name: 'default'
        email_configs:
          - to: '<EMAIL_DESTINO>'
            from: '<EMAIL_REMETENTE>'
            smarthost: '<SMTP_HOST>:<SMTP_PORT>'
            auth_username: '<SMTP_USER>'
            auth_password: '<SMTP_PASS>'
            require_tls: true

      - name: 'critical-receiver'
        email_configs:
          - to: '<EMAIL_DESTINO>'
            from: '<EMAIL_REMETENTE>'
            smarthost: '<SMTP_HOST>:<SMTP_PORT>'
            auth_username: '<SMTP_USER>'
            auth_password: '<SMTP_PASS>'
            require_tls: true
        msteams_configs:
          - webhook_url: '<TEAMS_WEBHOOK_URL>'
            title: '🔴 CRITICAL: {{ .GroupLabels.alertname }}'
            text: |
              {{ range .Alerts }}
              **Alerta:** {{ .Annotations.summary }}
              **Descrição:** {{ .Annotations.description }}
              **Severidade:** {{ .Labels.severity }}
              {{ end }}

      - name: 'warning-receiver'
        email_configs:
          - to: '<EMAIL_DESTINO>'
            from: '<EMAIL_REMETENTE>'
            smarthost: '<SMTP_HOST>:<SMTP_PORT>'
            auth_username: '<SMTP_USER>'
            auth_password: '<SMTP_PASS>'
            require_tls: true
        msteams_configs:
          - webhook_url: '<TEAMS_WEBHOOK_URL>'
            title: '⚠️ WARNING: {{ .GroupLabels.alertname }}'
            text: |
              {{ range .Alerts }}
              **Alerta:** {{ .Annotations.summary }}
              **Descrição:** {{ .Annotations.description }}
              **Severidade:** {{ .Labels.severity }}
              {{ end }}

    inhibit_rules:
      - source_matchers:
          - severity = "critical"
        target_matchers:
          - severity = "warning"
        equal: ['alertname', 'instance']
```

> **Nota — Teams Webhook:** Obtenha a URL em: Teams → Canal → `...` → Conectores → Incoming Webhook.

> **Nota — inhibit_rules:** Quando um alerta `critical` está ativo para a mesma instância, os alertas `warning` equivalentes são suprimidos para evitar notificações duplicadas.

### Aplicar configuração

```bash
kubectl apply -f alertmanager-config.yaml
kubectl rollout restart statefulset/prometheus-alertmanager -n <NAMESPACE>
```

### Testar envio de alerta

```bash
# Disparar alerta de teste via API do Alertmanager
kubectl port-forward svc/prometheus-alertmanager 9093:9093 -n <NAMESPACE> &

curl -X POST http://localhost:9093/api/v2/alerts \
  -H 'Content-Type: application/json' \
  -d '[{
    "labels": {
      "alertname": "TesteAlerta",
      "severity": "warning",
      "instance": "teste"
    },
    "annotations": {
      "summary": "Alerta de teste",
      "description": "Verificando se o receiver está funcionando."
    }
  }]'
```

---

## PrometheusRules — Alertas de Hardware e Kubernetes

### Alertas de Hardware das VMs

```yaml
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: hardware-alerts
  namespace: <NAMESPACE>
  labels:
    release: kube-prometheus-stack
spec:
  groups:
    - name: hardware.cpu
      rules:
        - alert: HighCPUUsage
          expr: |
            100 - (avg by(instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100) > 85
          for: 10m
          labels:
            severity: warning
          annotations:
            summary: "CPU elevada em {{ $labels.instance }}"
            description: "Uso de CPU acima de 85% por mais de 10 minutos. Valor atual: {{ $value | printf \"%.1f\" }}%"

        - alert: CriticalCPUUsage
          expr: |
            100 - (avg by(instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100) > 95
          for: 5m
          labels:
            severity: critical
          annotations:
            summary: "CPU crítica em {{ $labels.instance }}"
            description: "Uso de CPU acima de 95% por mais de 5 minutos. Valor atual: {{ $value | printf \"%.1f\" }}%"

    - name: hardware.memory
      rules:
        - alert: HighMemoryUsage
          expr: |
            (1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100 > 85
          for: 10m
          labels:
            severity: warning
          annotations:
            summary: "Memória elevada em {{ $labels.instance }}"
            description: "Uso de memória acima de 85% por mais de 10 minutos. Valor atual: {{ $value | printf \"%.1f\" }}%"

        - alert: CriticalMemoryUsage
          expr: |
            (1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100 > 95
          for: 5m
          labels:
            severity: critical
          annotations:
            summary: "Memória crítica em {{ $labels.instance }}"
            description: "Uso de memória acima de 95% por mais de 5 minutos. Valor atual: {{ $value | printf \"%.1f\" }}%"

    - name: hardware.disk
      rules:
        - alert: HighDiskUsage
          expr: |
            (1 - (node_filesystem_avail_bytes{fstype!~"tmpfs|overlay"} / node_filesystem_size_bytes{fstype!~"tmpfs|overlay"})) * 100 > 80
          for: 10m
          labels:
            severity: warning
          annotations:
            summary: "Disco elevado em {{ $labels.instance }}"
            description: "Uso do disco {{ $labels.mountpoint }} acima de 80%. Valor atual: {{ $value | printf \"%.1f\" }}%"

        - alert: CriticalDiskUsage
          expr: |
            (1 - (node_filesystem_avail_bytes{fstype!~"tmpfs|overlay"} / node_filesystem_size_bytes{fstype!~"tmpfs|overlay"})) * 100 > 90
          for: 5m
          labels:
            severity: critical
          annotations:
            summary: "Disco crítico em {{ $labels.instance }}"
            description: "Uso do disco {{ $labels.mountpoint }} acima de 90%. Valor atual: {{ $value | printf \"%.1f\" }}%"

        - alert: DiskWillFillIn24h
          expr: |
            predict_linear(node_filesystem_avail_bytes{fstype!~"tmpfs|overlay"}[6h], 24 * 3600) < 0
          for: 1h
          labels:
            severity: warning
          annotations:
            summary: "Disco vai encher em 24h em {{ $labels.instance }}"
            description: "Projeção indica que o disco {{ $labels.mountpoint }} ficará cheio em menos de 24 horas."

    - name: hardware.network
      rules:
        - alert: NodeNetworkUnreachable
          expr: |
            kube_node_status_condition{condition="NetworkUnavailable",status="true"} == 1
          for: 2m
          labels:
            severity: critical
          annotations:
            summary: "Node sem rede: {{ $labels.node }}"
            description: "O node {{ $labels.node }} está com rede indisponível."
```

### Alertas de Kubernetes

```yaml
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: kubernetes-alerts
  namespace: <NAMESPACE>
  labels:
    release: kube-prometheus-stack
spec:
  groups:
    - name: kubernetes.pods
      rules:
        - alert: PodCrashLooping
          expr: |
            rate(kube_pod_container_status_restarts_total[15m]) * 60 * 15 > 5
          for: 5m
          labels:
            severity: critical
          annotations:
            summary: "Pod em CrashLoopBackOff: {{ $labels.pod }}"
            description: "O pod {{ $labels.pod }} no namespace {{ $labels.namespace }} reiniciou mais de 5 vezes nos últimos 15 minutos."

        - alert: PodNotReady
          expr: |
            kube_pod_status_ready{condition="false"} == 1
          for: 10m
          labels:
            severity: warning
          annotations:
            summary: "Pod não está pronto: {{ $labels.pod }}"
            description: "O pod {{ $labels.pod }} no namespace {{ $labels.namespace }} não está em estado Ready há mais de 10 minutos."

        - alert: PodOOMKilled
          expr: |
            kube_pod_container_status_last_terminated_reason{reason="OOMKilled"} == 1
          for: 0m
          labels:
            severity: critical
          annotations:
            summary: "Pod morto por OOM: {{ $labels.pod }}"
            description: "O container {{ $labels.container }} do pod {{ $labels.pod }} foi encerrado por falta de memória (OOMKilled)."

    - name: kubernetes.nodes
      rules:
        - alert: NodeNotReady
          expr: |
            kube_node_status_condition{condition="Ready",status="true"} == 0
          for: 5m
          labels:
            severity: critical
          annotations:
            summary: "Node não está Ready: {{ $labels.node }}"
            description: "O node {{ $labels.node }} não está em estado Ready há mais de 5 minutos."

        - alert: NodeHighPodCount
          expr: |
            kubelet_running_pods / kube_node_status_allocatable{resource="pods"} * 100 > 90
          for: 10m
          labels:
            severity: warning
          annotations:
            summary: "Node com muitos pods: {{ $labels.node }}"
            description: "O node {{ $labels.node }} está com mais de 90% da capacidade de pods utilizada."

    - name: kubernetes.deployments
      rules:
        - alert: DeploymentReplicasMismatch
          expr: |
            kube_deployment_spec_replicas != kube_deployment_status_available_replicas
          for: 10m
          labels:
            severity: warning
          annotations:
            summary: "Réplicas divergentes: {{ $labels.deployment }}"
            description: "O deployment {{ $labels.deployment }} no namespace {{ $labels.namespace }} tem réplicas divergentes entre spec e status."

    - name: kubernetes.pvc
      rules:
        - alert: PVCPending
          expr: |
            kube_persistentvolumeclaim_status_phase{phase="Pending"} == 1
          for: 10m
          labels:
            severity: warning
          annotations:
            summary: "PVC em Pending: {{ $labels.persistentvolumeclaim }}"
            description: "O PVC {{ $labels.persistentvolumeclaim }} no namespace {{ $labels.namespace }} está em Pending há mais de 10 minutos."
```

---

## Dashboards Grafana

Importe os dashboards pelo ID em: **Grafana → Dashboards → Import → ID**.

### Monitoramento de VMs e Hardware (Node Exporter)

| ID      | Nome                          | Descrição                                                      |
| :------ | :---------------------------- | :------------------------------------------------------------- |
| `1860`  | Node Exporter Full            | Dashboard completo de hardware: CPU, RAM, disco, rede por node |
| `405`   | Node Exporter Server Metrics  | Métricas resumidas por servidor                                |
| `11074` | Node Exporter for Prometheus  | Visão geral de todos os nodes do cluster                       |
| `15172` | Node Exporter Full (revisado) | Versão atualizada do 1860 com mais detalhes                    |

### Monitoramento de Kubernetes

| ID      | Nome                            | Descrição                              |
| :------ | :------------------------------ | :------------------------------------- |
| `315`   | Kubernetes cluster monitoring   | Overview geral do cluster              |
| `6417`  | Kubernetes Cluster (Prometheus) | Pods, deployments, namespaces          |
| `13332` | Kubernetes Nodes                | Status e recursos por node             |
| `15760` | Kubernetes Views - Global       | Visão global do cluster com namespaces |
| `15757` | Kubernetes Views - Pods         | Detalhe de pods por namespace          |
| `15758` | Kubernetes Views - Namespaces   | Consumo por namespace                  |

### Monitoramento de SSL (Blackbox Exporter)

| ID      | Nome                   | Descrição                                            |
| :------ | :--------------------- | :--------------------------------------------------- |
| `7587`  | Blackbox Exporter      | Disponibilidade, latência e status SSL dos endpoints |
| `13659` | SSL Certificate Expiry | Painel focado em expiração de certificados           |

### Outros

| ID      | Nome                     | Descrição                               |
| :------ | :----------------------- | :-------------------------------------- |
| `3662`  | Prometheus 2.0 Overview  | Métricas internas do próprio Prometheus |
| `9614`  | NGINX Ingress Controller | Métricas do NGINX Ingress               |
| `17501` | Traefik                  | Métricas do Traefik                     |

---

## Comandos Úteis

```bash
# Listar todos os ServiceMonitors
kubectl get servicemonitor -A

# Listar todos os PrometheusRules
kubectl get prometheusrule -A

# Logs do Prometheus
kubectl logs -n <NAMESPACE> prometheus-prometheus-0 -c prometheus

# Logs do Grafana
kubectl logs -n <NAMESPACE> deployment/prometheus-grafana -c grafana

# Logs do Alertmanager
kubectl logs -n <NAMESPACE> alertmanager-prometheus-alertmanager-0

# Verificar configuração interna do Prometheus
kubectl exec -n <NAMESPACE> prometheus-prometheus-0 -c prometheus -- \
  cat /etc/prometheus/prometheus.yml

# Verificar configuração interna do Alertmanager
kubectl exec -n <NAMESPACE> alertmanager-prometheus-alertmanager-0 -- \
  cat /etc/alertmanager/alertmanager.yaml

# Reiniciar stack completa
kubectl rollout restart statefulset/prometheus-prometheus -n <NAMESPACE>
kubectl rollout restart statefulset/prometheus-alertmanager -n <NAMESPACE>
kubectl rollout restart deployment/prometheus-grafana -n <NAMESPACE>
```

---

## Troubleshooting

### Grafana — ImagePullBackOff no init container

**Sintoma:** Pod do Grafana fica em `Init:ImagePullBackOff` tentando baixar `busybox`.

**Solução:** Desabilitar o init container no `values.yaml`:
```yaml
grafana:
  initChownData:
    enabled: false
  securityContext:
    fsGroup: 472
```

### ServiceMonitor não sendo descoberto

**Sintoma:** Targets não aparecem no Prometheus mesmo com ServiceMonitor criado.

**Verificação:**
```bash
# Confirmar que o label release está correto no ServiceMonitor
kubectl get servicemonitor <NOME> -n <NAMESPACE> -o yaml | grep labels -A5
```

O label `release: kube-prometheus-stack` (ou o nome do seu release Helm) deve estar presente no ServiceMonitor.

### Alertmanager não envia notificações

**Verificação:**
```bash
# Verificar se o Secret está correto
kubectl get secret alertmanager-prometheus-alertmanager -n <NAMESPACE> -o yaml

# Verificar logs do Alertmanager
kubectl logs -n <NAMESPACE> alertmanager-prometheus-alertmanager-0

# Verificar alertas ativos via API
kubectl port-forward svc/prometheus-alertmanager 9093:9093 -n <NAMESPACE> &
curl http://localhost:9093/api/v2/alerts
```

### PVC em Pending

**Sintoma:** PVCs do Prometheus/Grafana ficam em `Pending`.

**Verificação:**
```bash
kubectl describe pvc -n <NAMESPACE>
kubectl get storageclass
```

Confirmar que o `storageClassName` no `values.yaml` corresponde ao StorageClass disponível no cluster.

---

## Referências

- [Prometheus Operator](https://prometheus-operator.dev/)
- [kube-prometheus-stack Chart](https://github.com/prometheus-community/helm-charts/tree/main/charts/kube-prometheus-stack)
- [Blackbox Exporter](https://github.com/prometheus/blackbox_exporter)
- [Alertmanager — Microsoft Teams](https://prometheus.io/docs/alerting/latest/configuration/#msteams_config)
- [Grafana Dashboards](https://grafana.com/grafana/dashboards/)
- [PromQL Reference](https://prometheus.io/docs/prometheus/latest/querying/basics/)

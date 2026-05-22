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

| Variável                      | Descrição                              | Exemplo                   |
| :---------------------------- | :------------------------------------- | :------------------------ |
| `<NAMESPACE>`                 | Namespace da stack                     | observability             |
| `<STORAGE_CLASS>`             | StorageClass disponível no cluster     | sc-nfs                    |
| `<GRAFANA_PASS>`              | Senha do admin do Grafana              | SenhaForte123!            |
| `<RETENTION_TIME>`            | Tempo de retenção das métricas         | 90d                       |
| `<RETENTION_SIZE>`            | Tamanho máximo de retenção por réplica | 140GB                     |
| `<STORAGE_PROMETHEUS>`        | Tamanho do PVC do Prometheus           | 150Gi                     |
| `<STORAGE_ALERTMANAGER>`      | Tamanho do PVC do Alertmanager         | 10Gi                      |
| `<STORAGE_GRAFANA>`           | Tamanho do PVC do Grafana              | 10Gi                      |
| `<NUM_REPLICAS_PROMETHEUS>`   | Réplicas do Prometheus                 | 2                         |
| `<NUM_REPLICAS_ALERTMANAGER>` | Réplicas do Alertmanager               | 2                         |
| `<DOMAIN>`                    | Domínio base das UIs                   | tatulab.com.br            |
| `<TLS_SECRET_NAME>`           | Secret TLS no namespace da stack       | tls-tatulab               |
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
Recuperar a senha

```bash
kubectl get secret grafana -n monitoramento -o jsonpath="{.data.admin-password}" | base64 --decode
```

---


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

### Probe — Monitoramento de Sites e SSL

O recurso `Probe` (CRD do Prometheus Operator) é a forma idiomática de declarar targets para o Blackbox Exporter. Os endereços são listados diretamente em `spec.targets.staticConfig.static`.

```yaml
apiVersion: monitoring.coreos.com/v1
kind: Probe
metadata:
  name: blackbox-sites
  namespace: <NAMESPACE>
  labels:
    release: kube-prometheus-stack
spec:
  jobName: blackbox-http
  interval: 60s
  module: http_2xx
  prober:
    url: blackbox-exporter-prometheus-blackbox-exporter:9115
    scheme: http
    path: /probe
  targets:
    staticConfig:
      static:
        - https://gitlab.tatulab.com.br   # ex: https://meu-site.exemplo.com
        - https://argo.tatulab.com.br
        - https://grafana.tatulab.com.br
      labels:
        env: prod
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

### Aplicar os manifestos

Salve os YAMLs acima (ex: `blackbox-probe.yaml` e `blackbox-alerts.yaml`) e aplique:

```bash
kubectl apply -f blackbox-probe.yaml
kubectl apply -f blackbox-alerts.yaml
```

### Validar

```bash
# Recursos criados
kubectl get probe,prometheusrule -n <NAMESPACE>

# Descobrir o nome do service do Prometheus (varia pelo release name do Helm)
kubectl get svc -n <NAMESPACE> | grep -i prometheus
# Comum: "prometheus-prometheus", "kube-prometheus-stack-prometheus", "prometheus-operated"

# Port-forward (ajuste o nome conforme resultado acima)
kubectl -n <NAMESPACE> port-forward svc/<SERVICE_PROMETHEUS> 9090:9090
# Acesse: http://localhost:9090/targets
```

Na UI do Prometheus, em **Status → Targets**, deve aparecer o job `blackbox-http` com um target por site listado. Em **Alerts**, as regras `SSLCertificate*`, `SiteDown` e `SiteHighLatency` devem estar em estado `Inactive` (ou `Firing`, se houver problema).

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

> **Nota — SMTP:** Use **`smtp.<provedor>`** (envio), não `imap.<provedor>` (leitura). Prefira **porta 587 com STARTTLS** (`require_tls: true`). A porta 465 (TLS implícito / SMTPS) historicamente dá problema com o Alertmanager — o cliente tenta STARTTLS e o servidor derruba a conexão com `connection reset by peer`.

> **Nota — Segurança:** `auth_password` em texto plano no YAML é aceitável apenas para testes locais. Em produção, mantenha a senha em Secret separado e referencie com `auth_password_file`, ou use SealedSecrets / external-secrets / SOPS. **Nunca versione** este YAML no git com senha em claro.

### Aplicar configuração

```bash
kubectl apply -f alertmanager-config.yaml
kubectl rollout restart statefulset/alertmanager-prometheus-alertmanager -n <NAMESPACE>
kubectl rollout status statefulset/alertmanager-prometheus-alertmanager -n <NAMESPACE>
```

Confirme que a config carregou sem erro:

```bash
kubectl logs -n <NAMESPACE> statefulset/alertmanager-prometheus-alertmanager --tail=20
# Procure por: "Completed loading of configuration file"
```

### Testar envio de alerta

```bash
# 1. Garante que não há port-forward antigo e sobe um novo
pkill -f "port-forward.*9093" 2>/dev/null
kubectl port-forward -n <NAMESPACE> svc/prometheus-alertmanager 9093:9093 >/dev/null 2>&1 &
sleep 3   # <-- essencial: o curl imediato falha porque o forward ainda não subiu

# 2. Dispara alerta de teste via API
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
    },
    "startsAt": "'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'"
  }]'

# 3. Verifica que o alerta entrou
curl -s http://localhost:9093/api/v2/alerts | jq '.[] | {alertname: .labels.alertname, state: .status.state}'
```

### Troubleshooting de envio SMTP

Se o email não chegar, inspecione os logs do Alertmanager filtrando por eventos de notificação:

```bash
kubectl logs -n <NAMESPACE> statefulset/alertmanager-prometheus-alertmanager --since=10m \
  | grep -iE "notify|smtp|email"
```

Erros comuns e causas:

| Mensagem no log                                                                | Causa provável                                                                |
| :----------------------------------------------------------------------------- | :---------------------------------------------------------------------------- |
| `create SMTP client: EOF`                                                      | Host errado (ex: `imap.*` em vez de `smtp.*`) — servidor não fala SMTP        |
| `establish TLS connection to server: ... :465: read: connection reset by peer` | Porta 465 (TLS implícito) incompatível com STARTTLS do Alertmanager — use 587 |
| `authentication failed`                                                        | Usuário/senha incorretos ou bloqueados pelo provedor                          |
| `x509: certificate signed by unknown authority`                                | Servidor com certificado self-signed — ajuste `tls_config`                    |
| Nenhum log de `notify` após alerta ativo                                       | `receiver` não bate com rota — confira os `matchers` em `route.routes`        |

Sucesso esperado nos logs: `msg="Notify success"`.

---

## O que o stack monitora por padrão

Ao instalar o kube-prometheus-stack, ~130 regras de alerta são criadas automaticamente. Com a config de rotas "tudo vai pra email" das seções anteriores, **qualquer uma delas gera notificação**. Categorizado por impacto:

### 🔴 Infra crítica — acorda de madrugada

| Categoria           | Alertas-chave                                                                                     |
| :------------------ | :------------------------------------------------------------------------------------------------ |
| API Kubernetes fora | `KubeAPIDown`, `KubeControllerManagerDown`, `KubeSchedulerDown`, `KubeProxyDown`                  |
| etcd em perigo      | `etcdMembersDown`, `etcdInsufficientMembers`, `etcdNoLeader`, `etcdDatabaseQuotaLowSpace`         |
| Node caído          | `KubeNodeNotReady`, `KubeNodeUnreachable`, `KubeletDown`                                          |
| Disco enchendo      | `NodeFilesystemAlmostOutOfSpace`, `KubePersistentVolumeFillingUp`, `NodeFilesystemFilesFillingUp` |

### 🟠 Problemas reais — podem esperar horas

| Categoria             | Alertas-chave                                                                                |
| :-------------------- | :------------------------------------------------------------------------------------------- |
| Workloads degradados  | `KubePodCrashLooping`, `KubePodNotReady`, `KubeDeploymentReplicasMismatch`, `KubeJobFailed`  |
| Node pressionado      | `NodeCPUHighUsage`, `NodeMemoryHighUtilization`, `CPUThrottlingHigh`, `NodeSystemSaturation` |
| Certificados internos | `KubeClientCertificateExpiration`, `KubeletClientCertificateExpiration`                      |
| Sites (Blackbox)      | `SiteDown`, `SiteHighLatency`, `SSLCertificateExpired`, `SSLCertificateExpiringSoon`         |

### 🟡 Configuração / capacidade — aviso

| Categoria          | Alertas-chave                                                                         |
| :----------------- | :------------------------------------------------------------------------------------ |
| Overcommit & quota | `KubeCPUOvercommit`, `KubeMemoryOvercommit`, `KubeQuotaAlmostFull`, `KubeHpaMaxedOut` |
| Rollouts travados  | `KubeDeploymentRolloutStuck`, `KubeStatefulSetUpdateNotRolledOut`                     |
| Clock / rede       | `NodeClockNotSynchronising`, `NodeNetworkInterfaceFlapping`                           |

### 🟢 Saúde do próprio stack (meta-alertas)

`Prometheus*`, `Alertmanager*`, `KubeStateMetrics*`, `PrometheusOperator*` — disparam só se o stack de observabilidade tiver problema interno.

### ⚪ Casos especiais

- **`Watchdog`** — **sempre ativo por design**. É um "Dead Man's Switch": sua ausência indica que o pipeline de alertas quebrou. **Não serve como alerta para email** (viraria 288 notificações/dia). O uso correto é enviá-lo a um serviço externo tipo [healthchecks.io](https://healthchecks.io/) ou [Dead Man's Snitch](https://deadmanssnitch.com/), que avisa quando o heartbeat **para**. Em ambiente de lab, o aceitável é silenciá-lo no email.
- **`InfoInhibitor`** — regra auxiliar que suprime alertas de severidade `info`. Não gera notificação própria.

### Listar as regras ativas no seu cluster

```bash
kubectl get prometheusrule -A -o jsonpath='{range .items[*].spec.groups[*].rules[*]}{.alert}{"\n"}{end}' | grep -v '^$' | sort -u
```

---

## Reduzindo o ruído — roteamento seletivo

A config de rotas mostrada antes manda **tudo pra email**. Em produção isso vira spam. Abaixo um exemplo de rota mais silenciosa:

- `critical` → email (acorda alguém)
- `warning` → Teams (canal dedicado, sem email)
- `info` / `Watchdog` → descartado (receiver nulo)

```yaml
route:
  group_by: ['alertname', 'severity']
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 12h          # ex: repetição menos agressiva
  receiver: 'null'              # default: descarta o que não bate em nenhuma rota
  routes:
    # 1. Silencia o Watchdog explicitamente (ele é tratado por heartbeat externo)
    - matchers:
        - alertname = "Watchdog"
      receiver: 'null'

    # 2. Critical → email
    - matchers:
        - severity = "critical"
      receiver: 'critical-email'
      continue: false

    # 3. Warning → Teams (sem email)
    - matchers:
        - severity = "warning"
      receiver: 'warning-teams'
      continue: false

receivers:
  - name: 'null'                # receiver vazio = descarta
  - name: 'critical-email'
    email_configs:
      - to: '<EMAIL_DESTINO>'
        from: '<EMAIL_REMETENTE>'
        smarthost: 'smtp.<PROVEDOR>:587'
        auth_username: '<SMTP_USER>'
        auth_password_file: '/etc/alertmanager/secrets/smtp-password'
        require_tls: true
  - name: 'warning-teams'
    msteams_configs:
      - webhook_url: '<TEAMS_WEBHOOK_URL>'
        title: '⚠️ WARNING: {{ .GroupLabels.alertname }}'

inhibit_rules:
  - source_matchers:
      - severity = "critical"
    target_matchers:
      - severity = "warning"
    equal: ['alertname', 'instance']
```

> **Dica:** suba o `repeat_interval` gradualmente. Comece em `4h`, observe quais alertas repetem demais, e só então aumente para `12h` / `24h` em warnings.

---

## Alertmanager vs. Grafana Alerting

O roteamento/notificação de alertas pode ser feito por **dois motores distintos**: o **Alertmanager** (parte do stack Prometheus) ou o **Grafana Alerting** (sistema próprio do Grafana, ex-"Unified Alerting"). Ambos coexistem no kube-prometheus-stack e escolher um não é decisão técnica trivial.

### Comparativo

| Aspecto                   | Alertmanager                        | Grafana Alerting                               |
| :------------------------ | :---------------------------------- | :--------------------------------------------- |
| Onde moram as regras      | `PrometheusRule` (YAML / GitOps)    | UI do Grafana ou arquivos de provisioning      |
| Quem avalia as expressões | Prometheus                          | Grafana                                        |
| Quem roteia/notifica      | Alertmanager (`route`, `receivers`) | Contact Points + Notification Policies         |
| Datasources suportados    | Apenas Prometheus                   | Prometheus, Loki, Tempo, Mimir, InfluxDB, etc. |
| GitOps / versionamento    | ✅ Nativo (CRDs do Operator)         | ⚠️ Requer provisioning YAML + ConfigMaps        |
| Disponibilidade           | Independente do Grafana             | Depende do Grafana rodando                     |
| Curva de aprendizado      | Média (YAML + PromQL)               | Baixa (UI)                                     |

### Cenário A — Só Alertmanager (recomendado para GitOps)

É o cenário documentado nas seções anteriores. Regras como código via `PrometheusRule`, notificação via Alertmanager. Grafana fica apenas como camada de **visualização**.

```
PrometheusRule ──► Prometheus ──► Alertmanager ──► Email / Teams
```

**Quando usar:** infra gerenciada por GitOps, equipe acostumada com YAML, alertas só sobre métricas Prometheus.

### Cenário B — Só Grafana Alerting

Desabilita-se o Alertmanager e as regras passam a ser criadas no Grafana (UI → **Alerting → Alert rules**). Notificações configuradas em **Contact Points** e roteadas por **Notification Policies**.

```
Grafana (avalia query) ──► Grafana Alerting ──► Email / Teams
```

Para desabilitar o Alertmanager do stack:

```yaml
# values.yaml do kube-prometheus-stack
alertmanager:
  enabled: false
```

**Quando usar:** equipe prefere UI, necessidade de alertar sobre Loki/Tempo além de Prometheus, pouco uso de GitOps.

### Cenário C — Híbrido (Grafana + Alertmanager externo)

Regras criadas no Grafana, mas a notificação sai pelo Alertmanager do stack (reaproveita os `receivers` de email/Teams já configurados). O Alertmanager é registrado no Grafana como **External Alertmanager**.

```
Grafana (avalia) ──► Alertmanager externo ──► Email / Teams
```

Configuração no Grafana: **Administration → General → Alerting → External Alertmanagers** → apontar para `http://kube-prometheus-stack-alertmanager.<NAMESPACE>.svc:9093`.

**Quando usar:** quer flexibilidade do Grafana pra criar regras multi-datasource, mas já tem receivers maduros no Alertmanager e não quer duplicá-los.

### Resumo de decisão

- **Começando do zero e usando GitOps?** → Cenário A.
- **Precisa alertar sobre logs (Loki) ou traces (Tempo)?** → Cenário B ou C.
- **Já tem Alertmanager bem configurado mas quer criar regras mais rápido pela UI?** → Cenário C.

> **Importante:** os três cenários são mutuamente exclusivos no nível da *regra* — uma mesma regra vive em um lugar só. Mas é possível ter **regras antigas no Alertmanager** e **regras novas no Grafana Alerting** convivendo (o que leva ao Cenário C na prática).

---

## PrometheusRules — Alertas complementares

> **Atenção — evite duplicar alertas:** o kube-prometheus-stack já instala ~130 regras por padrão cobrindo CPU, memória, disco, nodes, pods e deployments (ver seção [O que o stack monitora por padrão](#o-que-o-stack-monitora-por-padrão)). Criar alertas adicionais para os **mesmos sintomas** (ex: um `HighCPUUsage` próprio ao lado do `NodeCPUHighUsage` built-in) gera **notificações duplicadas**, pois o Alertmanager agrupa por `alertname` — nomes diferentes contam como eventos diferentes.
>
> Esta seção traz apenas alertas que **não estão cobertos** (ou estão cobertos de forma incompleta) pelas regras padrão.

### O que vamos adicionar — e por quê

| Alerta              | Lacuna que preenche                                                                                              |
| :------------------ | :--------------------------------------------------------------------------------------------------------------- |
| `PodOOMKilled`      | Built-ins não alertam especificamente quando um container é morto por OOM. Útil pra capacity planning de limits. |
| `DiskWillFillIn24h` | Forecasting com `predict_linear` — antecipa enchimento antes do `NodeFilesystemSpaceFillingUp` atual.            |
| `PVCPending`        | Nenhum built-in cobre PVC preso em `Pending` (problema comum de storage class / provisioner).                    |
| `ManyPodsOnNode`    | O built-in `KubeletTooManyPods` só dispara em ≥95% — este pega gargalo mais cedo (>85%).                         |

### Manifesto

```yaml
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: custom-alerts
  namespace: <NAMESPACE>
  labels:
    release: kube-prometheus-stack
spec:
  groups:
    - name: custom.workloads
      rules:
        - alert: PodOOMKilled
          expr: |
            kube_pod_container_status_last_terminated_reason{reason="OOMKilled"} == 1
          for: 0m
          labels:
            severity: critical
          annotations:
            summary: "Pod morto por OOM: {{ $labels.pod }}"
            description: "O container {{ $labels.container }} do pod {{ $labels.pod }} (ns {{ $labels.namespace }}) foi encerrado por falta de memória (OOMKilled)."

        - alert: PVCPending
          expr: |
            kube_persistentvolumeclaim_status_phase{phase="Pending"} == 1
          for: 10m
          labels:
            severity: warning
          annotations:
            summary: "PVC em Pending: {{ $labels.persistentvolumeclaim }}"
            description: "O PVC {{ $labels.persistentvolumeclaim }} no namespace {{ $labels.namespace }} está em Pending há mais de 10 minutos. Verifique StorageClass e provisioner."

    - name: custom.capacity
      rules:
        - alert: DiskWillFillIn24h
          expr: |
            predict_linear(node_filesystem_avail_bytes{fstype!~"tmpfs|overlay"}[6h], 24 * 3600) < 0
          for: 1h
          labels:
            severity: warning
          annotations:
            summary: "Disco vai encher em 24h em {{ $labels.instance }}"
            description: "Projeção linear indica que {{ $labels.mountpoint }} ficará cheio em menos de 24 horas."

        - alert: ManyPodsOnNode
          expr: |
            kubelet_running_pods / kube_node_status_allocatable{resource="pods"} * 100 > 85
          for: 10m
          labels:
            severity: warning
          annotations:
            summary: "Node com muitos pods: {{ $labels.node }}"
            description: "O node {{ $labels.node }} está com mais de 85% da capacidade de pods utilizada (valor atual: {{ $value | printf \"%.0f\" }}%)."
```

### Aplicar

```bash
kubectl apply -f custom-alerts.yaml
```

### Validar

```bash
# Regra criada
kubectl get prometheusrule -n <NAMESPACE> custom-alerts

# Prometheus reconheceu as novas regras
curl -s http://localhost:9090/api/v1/rules | jq '.data.groups[] | select(.name | startswith("custom.")) | {name: .name, rules: [.rules[].name]}'
```

As regras devem aparecer em **Prometheus UI → Status → Rules** em `custom.workloads` e `custom.capacity`.

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
kubectl logs -n <NAMESPACE> deployment/kube-prometheus-stack-grafana -c grafana

# Logs do Alertmanager
kubectl logs -n <NAMESPACE> alertmanager-prometheus-alertmanager-0

# Verificar configuração interna do Prometheus
kubectl exec -n <NAMESPACE> prometheus-prometheus-prometheus-0 -c prometheus -- \
  cat /etc/prometheus/prometheus.yml

# Verificar configuração interna do Alertmanager
kubectl exec -n <NAMESPACE> alertmanager-prometheus-alertmanager-0 -- \
  cat /etc/alertmanager/alertmanager.yaml

# Reiniciar stack completa
kubectl rollout restart statefulset/prometheus-prometheus-prometheus -n <NAMESPACE>
kubectl rollout restart statefulset/alertmanager-prometheus-alertmanager -n <NAMESPACE>
kubectl rollout restart deployment/kube-prometheus-stack-grafana -n <NAMESPACE>
```

> **Nota:** os nomes acima seguem o padrão `<release-helm>-<componente>`. Confirme com `kubectl get pods,svc -n <NAMESPACE>` se seu release Helm usa prefixo diferente.

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

Ver também a tabela de erros SMTP na seção [Troubleshooting de envio SMTP](#troubleshooting-de-envio-smtp).

**Verificação:**
```bash
# Verificar se o Secret foi aplicado
kubectl get secret alertmanager-prometheus-alertmanager -n <NAMESPACE>

# Verificar se a config carregou sem erro
kubectl logs -n <NAMESPACE> alertmanager-prometheus-alertmanager-0 | grep -iE "loading|error"

# Ver alertas ativos e para qual receiver foram roteados
kubectl port-forward -n <NAMESPACE> svc/prometheus-alertmanager 9093:9093 >/dev/null 2>&1 &
sleep 3
curl -s http://localhost:9093/api/v2/alerts | jq '.[] | {alertname: .labels.alertname, severity: .labels.severity, receivers: [.receivers[].name]}'

# Filtrar logs por tentativas de notificação
kubectl logs -n <NAMESPACE> alertmanager-prometheus-alertmanager-0 --since=10m | grep -iE "notify|smtp|email"
```

Sinais de sucesso nos logs: `msg="Notify success"`. Alerta rota para receiver `null` (config de ruído): notificação **não é enviada** por design.

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
- [healthchecks.io](https://healthchecks.io/) — serviço externo pra consumir o `Watchdog` (Dead Man's Switch)

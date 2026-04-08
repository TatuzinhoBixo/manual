# Instalação do Prometheus Operator (kube-prometheus-stack)

## Informações da Instalação

**Data:** 28/01/2026  
**Cluster:** Kubernetes RKE2 - Homelab tatulab.com.br  
**Namespace:** observability  
**Chart:** prometheus-community/kube-prometheus-stack  
**StorageClass:** sc-observability (NFS Subdir External Provisioner)

---

## Componentes Instalados

| Componente | Réplicas | Descrição |
|------------|----------|-----------|
| **Prometheus** | 2 | Servidor de métricas com HA |
| **Alertmanager** | 2 | Gerenciador de alertas |
| **Grafana** | 1 | Dashboard de visualização |
| **Node Exporter** | DaemonSet | Coleta métricas dos nodes |
| **Kube State Metrics** | 1 | Métricas do cluster K8s |
| **Prometheus Operator** | 1 | Gerenciador de CRDs |

---

## Pré-requisitos

### 1. Repositório Helm
```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update
```

### 2. Verificar repositórios
```bash
helm repo list
```

### 3. Criar namespace
```bash
kubectl create namespace observability
```

### 4. Criar StorageClass
**Nota:** O StorageClass `sc-observability` já estava criado com NFS Subdir External Provisioner.

---

## Configuração (values.yaml)

### Arquivo: kube-prometheus-stack-values.yaml
```yaml
# Configurações globais
fullnameOverride: prometheus

# Prometheus
prometheus:
  prometheusSpec:
    replicas: 2
    retention: 90d
    retentionSize: "140GB"
    
    # Resources
    resources:
      requests:
        memory: 2.5Gi
        cpu: 1200m
      limits:
        memory: 5Gi
        cpu: 2400m
    
    # Storage
    storageSpec:
      volumeClaimTemplate:
        spec:
          storageClassName: sc-observability
          accessModes: ["ReadWriteOnce"]
          resources:
            requests:
              storage: 150Gi
    
    # Anti-affinity
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
    
    # Service Monitors
    serviceMonitorSelectorNilUsesHelmValues: false
    podMonitorSelectorNilUsesHelmValues: false
    ruleSelectorNilUsesHelmValues: false

# Alertmanager
alertmanager:
  enabled: true
  alertmanagerSpec:
    replicas: 2
    storage:
      volumeClaimTemplate:
        spec:
          storageClassName: sc-observability
          accessModes: ["ReadWriteOnce"]
          resources:
            requests:
              storage: 10Gi

# Grafana
grafana:
  enabled: true
  adminPassword: "SuaSenhaAqui123!"
  persistence:
    enabled: true
    storageClassName: sc-observability
    size: 10Gi
  
  # Desabilitar init container problemático
  initChownData:
    enabled: false
  
  # Ajustar permissões
  securityContext:
    runAsUser: 472
    runAsGroup: 472
    fsGroup: 472

# Node Exporter
nodeExporter:
  enabled: true

# Kube State Metrics
kubeStateMetrics:
  enabled: true

# Prometheus Operator
prometheusOperator:
  enabled: true
```

---

## Decisões de Configuração

### 1. Réplicas do Prometheus (2)
- **Motivo:** Alta disponibilidade
- **Observação:** Cada réplica coleta métricas independentemente (não há federação automática)
- **Limitação:** ReadWriteOnce + 2 réplicas = cada pod tem seu próprio PV

### 2. Retenção de Dados
- **Tempo:** 90 dias
- **Tamanho:** 140GB por réplica
- **Storage total:** 150GB por PV (150GB x 2 réplicas = 300GB)

### 3. Resources
- **Requests:** 2.5Gi RAM / 1200m CPU
- **Limits:** 5Gi RAM / 2400m CPU
- **Motivo:** Ambiente de produção com múltiplas métricas

### 4. Anti-affinity
- **Tipo:** preferredDuringSchedulingIgnoredDuringExecution
- **Motivo:** Distribui réplicas em nodes diferentes (soft constraint)

### 5. Service Monitors
```yaml
serviceMonitorSelectorNilUsesHelmValues: false
podMonitorSelectorNilUsesHelmValues: false
ruleSelectorNilUsesHelmValues: false
```
- **Motivo:** Permite descoberta automática de ServiceMonitors em qualquer namespace (não apenas os criados pelo Helm)

### 6. Grafana - Init Container Desabilitado
```yaml
initChownData:
  enabled: false
securityContext:
  fsGroup: 472
```
- **Problema original:** Init container `busybox:1.31.1` dava timeout ao baixar imagem
- **Solução:** Desabilitar init container e usar `fsGroup` para ajustar permissões automaticamente via Kubernetes
- **Impacto:** Nenhum, o `fsGroup` faz o mesmo trabalho que o init container

---

## Comandos de Instalação

### Criar arquivo de configuração
```bash
cat > kube-prometheus-stack-values.yaml << 'YAML'
# Cole o conteúdo do values.yaml aqui
YAML
```

### Instalar via Helm
```bash
helm install kube-prometheus-stack prometheus-community/kube-prometheus-stack \
  -f kube-prometheus-stack-values.yaml \
  -n observability
```

### Verificar instalação
```bash
kubectl get pods -n observability
kubectl get pvc -n observability
kubectl get prometheus -n observability
kubectl get alertmanager -n observability
kubectl get servicemonitor -n observability
```

---

## Atualização de Configuração

Caso precise alterar alguma configuração:
```bash
# Editar kube-prometheus-stack-values.yaml
vim kube-prometheus-stack-values.yaml

# Aplicar mudanças
helm upgrade kube-prometheus-stack prometheus-community/kube-prometheus-stack \
  -f kube-prometheus-stack-values.yaml \
  -n observability
```

---

## Acessos (Port-forward)

### Prometheus
```bash
kubectl port-forward svc/kube-prometheus-stack-prometheus 9090:9090 -n observability
```
Acesso: http://localhost:9090

### Grafana
```bash
kubectl port-forward svc/kube-prometheus-stack-grafana 3000:80 -n observability
```
Acesso: http://localhost:3000
- **User:** admin
- **Password:** SuaSenhaAqui123!

### Alertmanager
```bash
kubectl port-forward svc/kube-prometheus-stack-alertmanager 9093:9093 -n observability
```
Acesso: http://localhost:9093

---

## Próximos Passos

### 1. Monitoramento de Sites (Blackbox Exporter)
- Instalar Blackbox Exporter
- Criar ServiceMonitor para scraping
- Criar PrometheusRule para alertas de SSL

### 2. Configurar Alertmanager
- Adicionar receivers (email, Slack, webhook)
- Configurar rotas de notificação

### 3. Dashboards Grafana
- Importar dashboards da comunidade
- Criar dashboards customizados

---

## Troubleshooting

### Pod com ImagePullBackOff
**Sintoma:** Init container do Grafana não baixa imagem busybox

**Solução aplicada:**
- Desabilitar `initChownData`
- Usar `fsGroup: 472` para ajustar permissões automaticamente

### Verificar logs do Prometheus
```bash
kubectl logs -n observability prometheus-prometheus-prometheus-0 -c prometheus
```

### Verificar logs do Grafana
```bash
kubectl logs -n observability deployment/kube-prometheus-stack-grafana -c grafana
```

### Verificar configuração do Prometheus
```bash
kubectl exec -n observability prometheus-prometheus-prometheus-0 -c prometheus -- cat /etc/prometheus/prometheus.yml
```

---

## CRDs Utilizados

O Prometheus Operator utiliza Custom Resource Definitions (CRDs) para configuração:

| CRD | Descrição |
|-----|-----------|
| **Prometheus** | Define instâncias do Prometheus |
| **Alertmanager** | Define instâncias do Alertmanager |
| **ServiceMonitor** | Define targets de scraping baseados em Services |
| **PodMonitor** | Define targets de scraping baseados em Pods |
| **PrometheusRule** | Define regras de alertas e recording rules |

### Exemplo: Listar CRDs
```bash
kubectl get prometheus -n observability
kubectl get servicemonitor -n observability
kubectl get prometheusrule -n observability
```

---

## Diferenças vs Helm Chart Prometheus Puro

| Aspecto | Helm Chart Puro | Prometheus Operator |
|---------|-----------------|---------------------|
| **Instalação** | prometheus-community/prometheus | prometheus-community/kube-prometheus-stack |
| **Componentes** | Só Prometheus | Prometheus + Grafana + Alertmanager + Exporters |
| **Discovery** | Manual (configmap) | Automático (ServiceMonitor/PodMonitor) |
| **Alertas** | ConfigMap inline | PrometheusRule CRD |
| **Réplicas** | Deployment simples | StatefulSet gerenciado |
| **HA** | Réplicas independentes | Suporte Thanos nativo |
| **Manutenção** | `helm upgrade` para tudo | CRDs + `helm upgrade` |

---

## Referências

- [Prometheus Operator Documentation](https://prometheus-operator.dev/)
- [kube-prometheus-stack Chart](https://github.com/prometheus-community/helm-charts/tree/main/charts/kube-prometheus-stack)
- [Prometheus Documentation](https://prometheus.io/docs/)
- [Grafana Documentation](https://grafana.com/docs/)

---

## Notas Importantes

1. **Senha do Grafana:** Alterar a senha padrão em produção
2. **Backup:** Configurar backup dos PVCs do Prometheus e Grafana
3. **Ingress:** Para acesso externo, criar Ingress com autenticação
4. **Thanos:** Para HA real do Prometheus, avaliar integração com Thanos
5. **Alertmanager:** Configurar receivers antes de criar alertas

---

**Documentação criada em:** 28/01/2026  
**Última atualização:** 28/01/2026
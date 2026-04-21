# Node Exporter — Stack de Observabilidade Kubernetes

## Descrição Geral

O Node Exporter é o agente de coleta de métricas de infraestrutura dos nodes do cluster Kubernetes. Ele expõe métricas do sistema operacional como CPU, memória, disco, rede e filesystem, que são coletadas pelo Prometheus via service discovery automático.

É implantado como **DaemonSet**, garantindo que um pod rode em cada node do cluster, incluindo nodes com taints (control-plane, infra). Utiliza `hostNetwork: true` e `hostPID: true` para acesso direto ao sistema do host.

---

## Tabela de Variáveis

| Variável      | Descrição                    | Exemplo         |
| ------------- | ---------------------------- | --------------- |
| `<NAMESPACE>` | Namespace de observabilidade | `observability` |

---

## Pré-requisitos

- Namespace `<NAMESPACE>` criado no cluster
- Prometheus implantado no mesmo namespace (ver tutorial: `prometheus.md`)

---

## Etapas

### 1. Criar o ServiceAccount

```yaml
# node-exporter-serviceaccount.yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: node-exporter
  namespace: <NAMESPACE>
  labels:
    app: node-exporter
```

```bash
kubectl apply -f node-exporter-serviceaccount.yaml
```

---

### 2. Criar o Service

O Service é do tipo `ClusterIP: None` (headless) para que o Prometheus descubra os endpoints individuais de cada node via service discovery.

```yaml
# node-exporter-service.yaml
apiVersion: v1
kind: Service
metadata:
  name: node-exporter
  namespace: <NAMESPACE>
  labels:
    app: node-exporter
spec:
  type: ClusterIP
  clusterIP: None
  ports:
    - name: metrics
      port: 9100
      targetPort: 9100
      protocol: TCP
  selector:
    app: node-exporter
```

```bash
kubectl apply -f node-exporter-service.yaml
```

---

### 3. Criar o DaemonSet

> **Nota:** Imagem fixada em `prom/node-exporter:v1.8.2`. Verifique a versão mais recente em https://hub.docker.com/r/prom/node-exporter/tags antes de implantar em produção.

```yaml
# node-exporter-daemonset.yaml
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: node-exporter
  namespace: <NAMESPACE>
  labels:
    app: node-exporter
spec:
  selector:
    matchLabels:
      app: node-exporter
  updateStrategy:
    type: RollingUpdate
  template:
    metadata:
      labels:
        app: node-exporter
    spec:
      serviceAccountName: node-exporter
      hostNetwork: true
      hostPID: true
      securityContext:
        runAsNonRoot: true
        runAsUser: 65534
      containers:
        - name: node-exporter
          image: prom/node-exporter:v1.8.2 # verifique a versão mais recente
          args:
            - '--path.procfs=/host/proc'
            - '--path.sysfs=/host/sys'
            - '--path.rootfs=/host/root'
            - '--collector.filesystem.mount-points-exclude=^/(dev|proc|sys|var/lib/docker/.+|var/lib/kubelet/.+)($|/)'
            - '--collector.filesystem.fs-types-exclude=^(autofs|binfmt_misc|bpf|cgroup2?|configfs|debugfs|devpts|devtmpfs|fusectl|hugetlbfs|iso9660|mqueue|nsfs|overlay|proc|procfs|pstore|rpc_pipefs|securityfs|selinuxfs|squashfs|sysfs|tracefs)$'
          ports:
            - name: metrics
              containerPort: 9100
              protocol: TCP
          resources:
            requests:
              memory: 64Mi
              cpu: 50m
            limits:
              memory: 128Mi
              cpu: 100m
          volumeMounts:
            - name: proc
              mountPath: /host/proc
              readOnly: true
            - name: sys
              mountPath: /host/sys
              readOnly: true
            - name: root
              mountPath: /host/root
              mountPropagation: HostToContainer
              readOnly: true
          livenessProbe:
            httpGet:
              path: /
              port: 9100
            initialDelaySeconds: 30
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /
              port: 9100
            initialDelaySeconds: 5
            periodSeconds: 5
      tolerations:
        - effect: NoSchedule
          operator: Exists
      volumes:
        - name: proc
          hostPath:
            path: /proc
        - name: sys
          hostPath:
            path: /sys
        - name: root
          hostPath:
            path: /
```

```bash
kubectl apply -f node-exporter-daemonset.yaml
```

---

### 4. Verificar implantação

```bash
# Verificar se um pod foi criado por node
kubectl get pods -n <NAMESPACE> -l app=node-exporter -o wide

# O número de pods deve ser igual ao número de nodes
kubectl get nodes --no-headers | wc -l
kubectl get pods -n <NAMESPACE> -l app=node-exporter --no-headers | wc -l
```

---

## Tabela de Parâmetros Importantes

| Parâmetro                                     | Localização                    | Descrição                                                                   |
| --------------------------------------------- | ------------------------------ | --------------------------------------------------------------------------- |
| `hostNetwork: true`                           | DaemonSet → spec               | Pod usa a rede do host — necessário para métricas de interface de rede      |
| `hostPID: true`                               | DaemonSet → spec               | Pod acessa o namespace PID do host — necessário para métricas de processos  |
| `runAsUser: 65534`                            | DaemonSet → securityContext    | Usuário `nobody` — não precisa de root para ler `/proc` e `/sys`            |
| `--path.procfs`                               | DaemonSet → args               | Aponta para `/proc` do host montado em `/host/proc`                         |
| `--path.sysfs`                                | DaemonSet → args               | Aponta para `/sys` do host montado em `/host/sys`                           |
| `--path.rootfs`                               | DaemonSet → args               | Aponta para `/` do host montado em `/host/root`                             |
| `--collector.filesystem.mount-points-exclude` | DaemonSet → args               | Exclui filesystems irrelevantes (docker, kubelet, devtmpfs etc.)            |
| `mountPropagation: HostToContainer`           | DaemonSet → volumeMount `root` | Propaga mounts do host para o container — necessário para métricas de disco |
| `clusterIP: None`                             | Service                        | Headless — Prometheus descobre cada endpoint individualmente                |
| `tolerations: NoSchedule`                     | DaemonSet                      | Garante pod em todos os nodes, incluindo control-plane e nodes com taints   |

---

## Comandos Úteis

```bash
# Status dos pods por node
kubectl get pods -n <NAMESPACE> -l app=node-exporter -o wide

# Logs de um pod específico
kubectl logs -n <NAMESPACE> <POD_NAME> --tail=50

# Verificar métricas expostas via port-forward (em qualquer pod)
kubectl port-forward -n <NAMESPACE> <POD_NAME> 9100:9100
curl http://localhost:9100/metrics | head -50

# Verificar se o Prometheus está coletando node-exporter
kubectl port-forward -n <NAMESPACE> svc/prometheus 9090:9090
# Acessar: http://localhost:9090/targets → procurar job "node-exporter"

# Consulta de exemplo no Prometheus (uso de CPU por node)
# rate(node_cpu_seconds_total{mode="idle"}[5m])
```

---

## Troubleshooting

### Pods não criados em alguns nodes

```bash
kubectl describe daemonset node-exporter -n <NAMESPACE>
kubectl get events -n <NAMESPACE> --field-selector reason=FailedScheduling
```

Causas comuns: taint sem toleration correspondente. Verificar taints dos nodes:

```bash
kubectl get nodes -o custom-columns=NAME:.metadata.name,TAINTS:.spec.taints
```

---

### Métricas não aparecem no Prometheus

Verificar se o job `node-exporter` está configurado no Prometheus com service discovery por endpoints:

```bash
kubectl port-forward -n <NAMESPACE> svc/prometheus 9090:9090
# Acessar: http://localhost:9090/targets → job "node-exporter"
```

O Prometheus usa o nome do endpoint `node-exporter` para descobrir os pods. Verificar se o Service está com o nome correto:

```bash
kubectl get svc node-exporter -n <NAMESPACE>
```

---

### Erro de permissão ao ler `/proc` ou `/sys`

Verificar se o `securityContext` está correto e se o node tem restrições de PSP/PSA:

```bash
kubectl describe pod <POD_NAME> -n <NAMESPACE> | grep -A5 securityContext
```

---

## Referências

- [Node Exporter Documentation](https://prometheus.io/docs/guides/node-exporter/)
- [Node Exporter GitHub](https://github.com/prometheus/node_exporter)
- [prom/node-exporter Docker Hub](https://hub.docker.com/r/prom/node-exporter/tags)

## Correção de Pods com Status Evicted

Este documento contém comandos para identificar e remover pods com status `Evicted` do cluster. Pods evicted geralmente indicam problemas de recursos no nó (memória ou disco insuficiente).

### Remover Pods Evicted de um Namespace Específico

```bash
kubectl get pods -n <namespace> | grep Evicted | awk '{print $1}' | \
xargs -r kubectl delete pod -n <namespace>
```

### Remover Todos os Pods Evicted do Cluster

```bash
kubectl get pods --all-namespaces | grep Evicted | awk '{print $1, $2}' | \
while read namespace pod; do
  kubectl delete pod $pod -n $namespace
done
```

### Diagnóstico da Causa

O status `Evicted` geralmente ocorre por falta de memória RAM ou disco no nó. Para investigar:

```bash
kubectl describe node <nome-do-node>
```

Verifique as seções:
- **Conditions**: Procure por `MemoryPressure`, `DiskPressure` ou `PIDPressure`
- **Allocated resources**: Compare com a capacidade total do nó
- **Events**: Mensagens recentes sobre problemas de recursos

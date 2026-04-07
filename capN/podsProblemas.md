## Remoção de Pods com Problemas

Este documento contém comandos para identificar e remover pods que não estão em estado `Running` ou que não têm todos os containers prontos. Útil para forçar a recriação de pods problemáticos.

### Quando Usar

- Pods travados em estados como `CrashLoopBackOff`, `Error`, `Pending`
- Containers que não conseguem iniciar (ready 0/1, 1/2, etc.)
- Limpeza após atualizações ou rollbacks problemáticos

### Remover Pods Problemáticos de Todo o Cluster

Remove pods que não estão `Running` ou que têm containers não prontos em todos os namespaces:

```bash
kubectl get pods -A --no-headers | awk '{
  ns=$1; pod=$2; ready=$3; status=$4;
  split(ready,a,"/");
  if (status!="Running" || a[1]<a[2]) print ns, pod
}' | while read ns pod; do
  kubectl delete pod "$pod" -n "$ns"
done
```

### Remover Pods Problemáticos de um Namespace Específico

```bash
kubectl get pods -n <namespace> --no-headers | awk '{
  pod=$1; ready=$2; status=$3;
  split(ready,a,"/");
  if (status!="Running" || a[1]<a[2]) print pod
}' | while read pod; do
  kubectl delete pod -n <namespace> "$pod"
done
```

### Verificar Antes de Deletar

Para apenas listar os pods problemáticos sem deletá-los:

```bash
kubectl get pods -A | awk 'NR>1 {
  split($3,a,"/");
  if ($4!="Running" || a[1]<a[2]) print $1, $2, $3, $4
}'
```

> **Nota**: Pods gerenciados por Deployments, StatefulSets ou DaemonSets serão recriados automaticamente após a deleção.

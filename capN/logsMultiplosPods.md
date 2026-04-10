### Pegar os logs de multiplos pods

Primeiramente é necessário que exista um label já configurado no conjunto de pods. Para saber os labels existentes.
```bash
kubectl get po -n <namespace> --show-labels
```

Caso não exista labels, incluir via comando
```
kubectl label deployment <deployment> -n <namespace> app.kubernetes.io/part-of=<label>
```

Dar um restart no deployment
```
kubectl rollout restart deployment -n <namespace> <deployment>
```

E por fim, buscar os logs
kubectl logs -f -n <namespace> -l app.kubernetes.io/part-of=<label> --all-containers
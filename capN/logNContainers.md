### Comando para saber o log onde o pod carrega vários containers

#### Descoberta do nome do container
```bash
kubectl get pod <NOME_DO_POD> -n <NAMESPACE> -o jsonpath='{.spec.containers[*].name}'
```

#### Visualizar o log do container
```bash
kubectl logs -f <NOME_DO_POD> -n <NAMESPACE> -c <NOME_DO_CONTAINER>
```
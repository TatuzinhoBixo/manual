### Como remover o NS

#### Verificar recursos pendentes
```bash
kubectl get all -n <namespace>
kubectl get pvc -n <namespace>
kubectl get secrets -n <namespace>
kubectl get configmaps -n <namespace>
```

#### Força a exclusão de recursos ainda existentes
Para pods
```bash
kubectl delete pods --all -n sites-hom --force --grace-period=0
```
#### Para PVCs (se houver)
```bash
kubectl delete pvc --all -n sites-hom --force
```
#### Para outros recursos
```bash
kubectl delete all --all -n sites-hom --force --grace-period=0
```

#### Remover o finalizers do ns
```bash
kubectl get namespace sites-hom -o json > sites-hom-backup.json
kubectl get namespace sites-hom -o json | jq '.spec.finalizers = []' | kubectl replace --raw "/api/v1/namespaces/sites-hom/finalize" -f -
```

#### Método via API
```bash
kubectl patch namespace sites-hom -p '{"spec":{"finalizers":[]}}' --type=merge
```

#### Última opção
```bash
kubectl delete namespace sites-hom --force --grace-period=0
```
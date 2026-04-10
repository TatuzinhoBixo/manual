### Cadastrar labels nos works, de preferencia, marcar como finalidade e a função

```bash
kubectl label nodes work1-hom finalidade=<nome-finalidade>
```

### Mostrar as labels cadastradas
```bash
kubectl get nodes --show-labels | awk 'NR==1{print $1"\tLABELS_PERSONALIZADOS";next}{node=$1; labels=$NF; gsub(/kubernetes\.io\/[^,]*|beta\.kubernetes\.io\/[^,]*|node-role\.kubernetes\.io\/[^,]*|node\.kubernetes\.io\/[^,]*|,+/, "", labels); gsub(/^[[:space:]]*,/, "", labels); gsub(/,[[:space:]]*$/, "", labels); print node"\t"labels}'
```
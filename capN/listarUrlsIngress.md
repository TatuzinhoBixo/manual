## Listar URLs de Ingress

Comandos para extrair todas as URLs configuradas nos Ingress do cluster. Útil para auditorias, documentação ou verificação de configurações de DNS.

### Listar Todas as URLs do Cluster

Extrai todas as URLs únicas de todos os Ingress em todos os namespaces:

```bash
kubectl get ingress -A | awk 'NR>1 {print $4}' | tr ',' '\n' | sort -u
```

### Listar URLs de um Namespace Específico

```bash
kubectl get ingress -n <namespace> | awk 'NR>1 {print $3}' | tr ',' '\n' | sort -u
```

### Listar com Mais Detalhes

Para ver o namespace, nome do ingress e hosts:

```bash
kubectl get ingress -A -o custom-columns=NAMESPACE:.metadata.namespace,NAME:.metadata.name,HOSTS:.spec.rules[*].host
```

### Exportar para Arquivo

```bash
kubectl get ingress -A | awk 'NR>1 {print $4}' | tr ',' '\n' | sort -u > urls-cluster.txt
```

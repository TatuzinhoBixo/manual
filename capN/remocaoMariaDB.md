## Remoção Completa do MariaDB Operator

Este procedimento remove completamente o MariaDB Operator e seus recursos associados do cluster Kubernetes. Use quando precisar fazer uma reinstalação limpa ou remover completamente a stack de banco de dados.

### Pré-requisitos

- Acesso ao cluster com `kubectl` configurado
- Helm instalado
- Permissões de administrador no cluster

### Procedimento de Remoção

#### 1. Remover o Operator e CRDs via Helm
```bash
helm uninstall mariadb-operator -n mariadb-operator-system --ignore-not-found=true
helm uninstall mariadb-operator-crds -n mariadb-operator-system --ignore-not-found=true
```

#### 2. Remover os Namespaces
```bash
kubectl delete ns <namespace-aplicacao> <namespace-mariadb-cluster> mariadb-operator-system --ignore-not-found=true
```

> **Nota**: Substitua `<namespace-aplicacao>` e `<namespace-mariadb-cluster>` pelos namespaces utilizados na sua instalação.

### Verificar Remoção

```bash
kubectl get ns | grep -E "mariadb|<namespace-aplicacao>"
helm list -A | grep mariadb
```

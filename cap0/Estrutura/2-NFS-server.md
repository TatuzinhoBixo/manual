# NFS Storage Provisioner para Kubernetes

## Descrição

O NFS Storage Provisioner permite que pods compartilhem o mesmo sistema de arquivos via rede, funcionando como um disco compartilhado montado em cada pod. Utiliza o provisionador `nfs-subdir-external-provisioner` para criar volumes dinâmicos automaticamente.

## Características

- **Compartilhamento**: Múltiplos pods podem acessar o mesmo volume simultaneamente (ReadWriteMany)
- **Provisionamento Dinâmico**: PVCs são criados automaticamente pelo provisioner
- **Simplicidade**: Não requer configuração complexa nos nós

## Pré-requisitos

- Servidor NFS configurado e acessível pelo cluster
- Helm instalado e configurado
- kubectl com acesso ao cluster
- Permissões de rede entre cluster e servidor NFS

## Variáveis de Configuração

| Variável | Descrição | Exemplo |
|:---------|:----------|:--------|
| `<NOME_RELEASE>` | Nome do release Helm | nfs-provisioner |
| `<NAMESPACE>` | Namespace do provisioner | storage |
| `<IP_NFS>` | IP do servidor NFS | 192.168.1.10 |
| `<CAMINHO_NFS>` | Caminho exportado no NFS | /nfs/kubernetes |
| `<STORAGECLASS_NAME>` | Nome do StorageClass | nfs-storage |

---

## Etapa 1: Adicionar Repositório Helm

```bash
helm repo add nfs-subdir-external-provisioner https://kubernetes-sigs.github.io/nfs-subdir-external-provisioner/
helm repo update
```

---

## Etapa 2: Instalar o Provisioner

### Instalação como StorageClass Padrão

Para que todos os pods utilizem este provisioner por padrão:

```bash
helm install <NOME_RELEASE> nfs-subdir-external-provisioner/nfs-subdir-external-provisioner \
  --namespace <NAMESPACE> \
  --create-namespace \
  --set nfs.server=<IP_NFS> \
  --set nfs.path=<CAMINHO_NFS> \
  --set storageClass.name=<STORAGECLASS_NAME> \
  --set storageClass.defaultClass=true \
  --set storageClass.reclaimPolicy=Retain
```

### Instalação como StorageClass Não-Padrão

Para adicionar múltiplos storages no cluster:

```bash
helm install <NOME_RELEASE> nfs-subdir-external-provisioner/nfs-subdir-external-provisioner \
  --namespace <NAMESPACE> \
  --create-namespace \
  --set nfs.server=<IP_NFS> \
  --set nfs.path=<CAMINHO_NFS> \
  --set storageClass.name=<STORAGECLASS_NAME> \
  --set storageClass.defaultClass=false \
  --set storageClass.reclaimPolicy=Retain
```

---

## Etapa 3: Verificar Instalação

```bash
# Verificar pod do provisioner
kubectl get pods -n <NAMESPACE>

# Verificar StorageClass criado
kubectl get storageclass

# Descrever StorageClass
kubectl describe storageclass <STORAGECLASS_NAME>
```

---

## Provisionamento de Volumes

### Provisionamento Dinâmico (Recomendado)

O provisioner cria o PV automaticamente quando um PVC é criado:

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: <NOME_PVC>
  namespace: <NAMESPACE_APP>
spec:
  accessModes:
    - ReadWriteMany
  resources:
    requests:
      storage: 5Gi
  storageClassName: <STORAGECLASS_NAME>
```

### Provisionamento Estático

Para usar um PV previamente definido:

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: <NOME_PVC>
  namespace: <NAMESPACE_APP>
spec:
  accessModes:
    - ReadWriteMany
  resources:
    requests:
      storage: 5Gi
  volumeName: <NOME_PV>
  storageClassName: ""  # Vazio para PV estático
```

---

## Políticas de Retenção

| Política | Comportamento |
|:---------|:--------------|
| `Retain` | PV mantido após exclusão do PVC (dados preservados) |
| `Delete` | PV excluído junto com o PVC |
| `Recycle` | Dados apagados, PV reutilizado (deprecado) |

> **Recomendação**: Use `Retain` em produção para evitar perda acidental de dados.

---

## Modos de Acesso

| Modo | Descrição |
|:-----|:----------|
| `ReadWriteOnce` (RWO) | Um único nó pode montar como leitura/escrita |
| `ReadOnlyMany` (ROX) | Múltiplos nós podem montar como somente leitura |
| `ReadWriteMany` (RWX) | Múltiplos nós podem montar como leitura/escrita |

> NFS suporta todos os modos de acesso, sendo ideal para `ReadWriteMany`.

---

## Considerações

### Performance
- NFS pode ser um gargalo em ambientes de alta carga
- Considere a latência de rede entre cluster e servidor NFS

### Segurança
- Configure permissões adequadas no servidor NFS
- Limite acesso por IP no `/etc/exports`

### Casos de Uso Ideais
- CMS (WordPress, Drupal)
- Servidores de arquivos
- Aplicações que necessitam sincronização de dados entre pods

---

## Comandos Úteis

```bash
# Listar PVCs
kubectl get pvc -A

# Listar PVs
kubectl get pv

# Ver detalhes de um PVC
kubectl describe pvc <NOME_PVC> -n <NAMESPACE>

# Logs do provisioner
kubectl logs -n <NAMESPACE> -l app=nfs-subdir-external-provisioner
```

---

## Referências

- [NFS Subdir External Provisioner](https://github.com/kubernetes-sigs/nfs-subdir-external-provisioner)
- [Kubernetes Persistent Volumes](https://kubernetes.io/docs/concepts/storage/persistent-volumes/)
- [Storage Classes](https://kubernetes.io/docs/concepts/storage/storage-classes/)

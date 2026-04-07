# Como Corrigir ConfigMap com Formato \n

## Problema

Quando você abre um ConfigMap com `kubectl edit`, o conteúdo aparece com `\n` em vez de quebras de linha normais:

```yaml
data:
  policy.csv: "linha 1\nlinha 2\nlinha 3\n"
```

Em vez de:

```yaml
data:
  policy.csv: |
    linha 1
    linha 2
    linha 3
```

## Causa

O problema ocorre quando há **espaços em branco no final das linhas** (trailing whitespace) no ConfigMap. O Kubernetes detecta isso e converte automaticamente o formato de pipe `|` para string com `\n` escapado.

## Solução Rápida (Recomendada)

### Comandos diretos - copie e cole

```bash
# 1. Definir variáveis
CONFIGMAP_NAME="<nome-do-configmap>"
NAMESPACE="<namespace>"

# 2. Backup do original
kubectl get configmap $CONFIGMAP_NAME -n $NAMESPACE -o yaml > /tmp/backup-$CONFIGMAP_NAME.yaml

# 3. Extrair YAML atual
kubectl get configmap $CONFIGMAP_NAME -n $NAMESPACE -o yaml > /tmp/original.yaml

# 4. Processar e limpar trailing whitespace de todos os campos
python3 -c "
import yaml
import sys

with open('/tmp/original.yaml', 'r') as f:
    cm = yaml.safe_load(f)

# Limpar trailing whitespace de todos os campos em data
if 'data' in cm:
    for key in cm['data']:
        if isinstance(cm['data'][key], str):
            lines = cm['data'][key].split('\n')
            cm['data'][key] = '\n'.join([line.rstrip() for line in lines])

# Remover campos desnecessários
if 'metadata' in cm:
    cm['metadata'].pop('creationTimestamp', None)
    cm['metadata'].pop('resourceVersion', None)
    cm['metadata'].pop('uid', None)
    if 'annotations' in cm['metadata']:
        cm['metadata']['annotations'].pop('kubectl.kubernetes.io/last-applied-configuration', None)

with open('/tmp/corrigido.yaml', 'w') as f:
    yaml.dump(cm, f, default_flow_style=False, allow_unicode=True)
"

# 5. Aplicar
kubectl apply -f /tmp/corrigido.yaml

# 6. Verificar
kubectl edit configmap $CONFIGMAP_NAME -n $NAMESPACE
```

**Substitua apenas:**
- `<nome-do-configmap>` → nome do seu ConfigMap
- `<namespace>` → namespace onde está o ConfigMap

---

## Solução Alternativa (Sem Python)

Se não tiver Python disponível, use este método manual:

```bash
# 1. Definir variáveis
CONFIGMAP_NAME="<nome-do-configmap>"
NAMESPACE="<namespace>"

# 2. Backup
kubectl get configmap $CONFIGMAP_NAME -n $NAMESPACE -o yaml > /tmp/backup-$CONFIGMAP_NAME.yaml

# 3. Deletar o ConfigMap
kubectl delete configmap $CONFIGMAP_NAME -n $NAMESPACE

# 4. Recriar a partir do backup (limpa automaticamente)
cat /tmp/backup-$CONFIGMAP_NAME.yaml | \
  sed '/creationTimestamp:/d' | \
  sed '/resourceVersion:/d' | \
  sed '/uid:/d' | \
  sed '/last-applied-configuration/d' | \
  kubectl apply -f -

# 5. Verificar
kubectl edit configmap $CONFIGMAP_NAME -n $NAMESPACE
```

## Prevenção

Para evitar esse problema no futuro:

1. **Nunca deixe espaços em branco no final das linhas** ao editar ConfigMaps
2. Configure seu editor para remover trailing whitespace automaticamente:
   - Vim: adicione no `~/.vimrc`: `autocmd BufWritePre * :%s/\s\+$//e`
   - VS Code: `"files.trimTrailingWhitespace": true`

## Reiniciar Pods (Se Necessário)

Se o ConfigMap for usado por algum deployment/statefulset/daemonset:

```bash
# Para Deployment
kubectl rollout restart deployment <nome-do-deployment> -n $NAMESPACE

# Para StatefulSet
kubectl rollout restart statefulset <nome-do-statefulset> -n $NAMESPACE

# Para DaemonSet
kubectl rollout restart daemonset <nome-do-daemonset> -n $NAMESPACE
```

---

## Notas

- Este problema é comportamento normal do Kubernetes ao detectar trailing whitespace
- Não é um bug, é uma feature de segurança/validação
- O ConfigMap funciona normalmente mesmo com `\n`, mas fica difícil de editar
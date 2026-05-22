# Criação de Usuário Local no ArgoCD

## Pré-requisitos

- Acesso ao cluster Kubernetes com permissão para editar ConfigMaps e Secrets no namespace `argocd`
- `kubectl` configurado
- `python3` com o módulo `bcrypt` instalado

### Instalar dependências (se necessário)

```bash
sudo apt-get install -y python3-pip python3-bcrypt
```

---

## Etapa 1 — Adicionar o usuário no `argocd-cm`

```bash
kubectl patch configmap argocd-cm -n argocd --type merge \
  -p '{"data":{"accounts.<USUARIO>":"login"}}'
```

> Substitua `<USUARIO>` pelo nome do novo usuário.

---

## Etapa 2 — Adicionar a política RBAC no `argocd-rbac-cm`

```bash
kubectl get configmap argocd-rbac-cm -n argocd -o json | \
  python3 -c "
import sys, json

cm = json.load(sys.stdin)
adicionar = '''
p, role:<USUARIO>, applications, get, <PROJETO>/*, allow
p, role:<USUARIO>, logs, get, <PROJETO>/*, allow
p, role:<USUARIO>, applications, restart, <PROJETO>/*, allow
p, role:<USUARIO>, applications, sync, <PROJETO>/*, allow
p, role:<USUARIO>, repositories, get, *, allow
p, role:<USUARIO>, clusters, get, *, allow
p, role:<USUARIO>, exec, create, <PROJETO>/*, allow
p, role:<USUARIO>, applications, *, <PROJETO>/*, allow
g, <USUARIO>, role:<USUARIO>
'''
cm['data']['policy.csv'] += adicionar
print(json.dumps(cm))
" | kubectl apply -f -
```

> Substitua `<USUARIO>` pelo nome do usuário e `<PROJETO>` pelo nome do projeto ArgoCD ao qual ele terá acesso.

---

## Etapa 3 — Definir a senha do usuário

### 3.1 Gerar o hash bcrypt da senha

```bash
SENHA_HASH=$(python3 -c "import bcrypt; print(bcrypt.hashpw(b'<SENHA>', bcrypt.gensalt(10)).decode())") && \
echo "Hash gerado: $SENHA_HASH"
```

> Substitua `<SENHA>` pela senha desejada. Confirme que o hash foi gerado antes de continuar.

### 3.2 Aplicar o hash no secret do ArgoCD

```bash
kubectl patch secret argocd-secret -n argocd \
  --type merge \
  -p "{\"stringData\":{\"accounts.<USUARIO>.password\":\"$SENHA_HASH\",\"accounts.<USUARIO>.passwordMtime\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}}"
```

---

## Etapa 4 — Reiniciar o argocd-server

```bash
kubectl rollout restart deployment argocd-server -n argocd && \
kubectl rollout status deployment argocd-server -n argocd
```

---

## Verificação

Para confirmar que a senha foi armazenada corretamente:

```bash
kubectl get secret argocd-secret -n argocd -o jsonpath='{.data}' | python3 -c "
import sys, json, base64
data = json.load(sys.stdin)
for k, v in data.items():
    if '<USUARIO>' in k:
        print(f'{k}: {base64.b64decode(v).decode()}')
"
```

---

## Observações

- O ArgoCD utiliza hash `bcrypt` para armazenar senhas de usuários locais.
- O campo `passwordMtime` registra a data de criação/alteração da senha.
- Permissões com wildcard `applications, *, <PROJETO>/*, allow` incluem ações como restart, scale, pause e resume.
- Alterações via UI do ArgoCD (ex: Scale) **não escrevem no Git** — o manifesto do repositório permanece inalterado. O cluster ficará com status **OutOfSync** até a próxima sincronização, que sobrescreve com o valor do Git.
- O `policy.default: role:""` garante que usuários sem role atribuída não têm acesso a nada.

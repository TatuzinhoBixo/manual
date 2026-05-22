# Criação de Usuário Local no ArgoCD — Cluster de Produção

## Diferenças em relação ao cluster de Homologação

|                     | Homologação     | Produção        |
| ------------------- | --------------- | --------------- |
| Senha armazenada em | `argocd-secret` | `argocd-secret` |
| Hash bcrypt         | `$2b$`          | `$2y$`          |
| Usuário criado em   | `argocd-cm`     | `argocd-cm`     |
| Senha criada em     | `argocd-secret` | `argocd-secret` |

> ⚠️ **Importante:** A senha deve sempre ser gravada no `argocd-secret` com hash `$2y$`. Gravar no `argocd-cm` ou usar hash `$2b$` impede o login.

---

## Pré-requisitos

- Acesso ao cluster Kubernetes com permissão para editar ConfigMaps e Secrets no namespace `argocd`
- `kubectl` configurado apontando para o cluster de produção
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

> Substitua `<USUARIO>` pelo nome do novo usuário. **Não inclua a senha aqui.**

---

## Etapa 2 — Adicionar a política RBAC no `argocd-rbac-cm`

```bash
kubectl get configmap argocd-rbac-cm -n argocd -o json | \
  python3 -c "
import sys, json

cm = json.load(sys.stdin)
adicionar = '''
# Política específica para projeto <PROJETO>
p, role:<PROJETO>, applications, logs, <PROJETO>/*, allow
p, role:<PROJETO>, applications, restart, <PROJETO>/*, allow
p, role:<PROJETO>, applications, sync, <PROJETO>/*, allow
p, role:<PROJETO>, repositories, get, *, allow
p, role:<PROJETO>, clusters, get, *, allow
p, role:<PROJETO>, exec, create, <PROJETO>/*, allow
p, role:<PROJETO>, applications, *, <PROJETO>/*, allow

g, <USUARIO>, role:<PROJETO>
'''
cm['data']['policy.csv'] += adicionar
print(json.dumps(cm))
" | kubectl apply -f -
```

> Substitua `<USUARIO>` pelo nome do usuário e `<PROJETO>` pelo nome do projeto ArgoCD.

---

## Etapa 3 — Gerar o hash da senha e aplicar no `argocd-secret`

### 3.1 Gerar o hash `$2y$`

```bash
SENHA_HASH=$(python3 -c "import bcrypt; h = bcrypt.hashpw(b'<SENHA>', bcrypt.gensalt(5)); print(h.decode().replace('\$2b\$','\$2y\$'))") && \
echo "Hash gerado: $SENHA_HASH"
```

> Confirme que o hash foi gerado e começa com `$2y$` antes de continuar.

### 3.2 Aplicar no `argocd-secret`

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

### Confirmar usuário no `argocd-cm`

```bash
kubectl get configmap argocd-cm -n argocd -o yaml | grep -A 2 '<USUARIO>'
```

### Confirmar senha no `argocd-secret`

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

- O hash `$2y$` é o formato PHP-compatible do bcrypt, requerido pelo ArgoCD nesse cluster.
- O `python3-bcrypt` gera `$2b$` por padrão — a substituição via `.replace()` é necessária.
- Permissões com wildcard `applications, *, <PROJETO>/*, allow` incluem ações como restart, scale, pause e resume.
- Alterações via UI do ArgoCD (ex: Scale) **não escrevem no Git** — o manifesto do repositório permanece inalterado. O cluster ficará com status **OutOfSync** até a próxima sincronização.
- O `policy.default: role:""` garante que usuários sem role atribuída não têm acesso a nada.

# Argo CD - GitOps Continuous Delivery

## Descrição

Argo CD é uma ferramenta de entrega contínua (CD) baseada no modelo GitOps para Kubernetes. Ele monitora repositórios Git e sincroniza automaticamente o estado do cluster com os manifestos declarados no repositório.

## Fluxo de Deploy

1. Desenvolvedor faz commit e push das alterações no código
2. Pipeline CI (GitLab CI, GitHub Actions, etc.) constrói a imagem e envia para o registry
3. Pipeline CI atualiza a versão da imagem no repositório de manifestos
4. Argo CD detecta a alteração e sincroniza o cluster

## Pré-requisitos

- Cluster Kubernetes funcional
- Helm instalado e configurado
- Ingress Controller instalado (opcional, para acesso externo)
- Secret TLS criado (opcional, para HTTPS)

## Variáveis de Configuração

| Variável            | Descrição                  | Exemplo               |
| :------------------ | :------------------------- | :-------------------- |
| `<NAMESPACE>`       | Namespace do Argo CD       | argocd                |
| `<DOMINIO>`         | Domínio do Argo CD         | argocd.exemplo.com.br |
| `<INGRESS_CLASS>`   | IngressClass a ser usada   | argocd-ingress        |
| `<IP_LOADBALANCER>` | IP do LoadBalancer         | 192.168.1.80          |
| `<NOME_SECRET_TLS>` | Nome do secret TLS         | tls-certificado       |
| `<STORAGECLASS>`    | StorageClass para Redis HA | nfs-storage           |

---

## Etapa 1: Adicionar Repositório Helm

```bash
helm repo add argo https://argoproj.github.io/argo-helm
helm repo update
```

---

## Etapa 2: Criar Namespace

```bash
kubectl create namespace <NAMESPACE>
```

---

## Etapa 3: Instalar Ingress Controller Dedicado (Opcional)

Se preferir um Ingress Controller exclusivo para o Argo CD:

```bash
helm install argocd-ingress ingress-nginx/ingress-nginx \
  --namespace <NAMESPACE> \
  --set controller.ingressClassResource.name=<INGRESS_CLASS> \
  --set controller.ingressClassResource.controllerValue="k8s.io/ingress-nginx" \
  --set controller.service.type=LoadBalancer \
  --set controller.service.loadBalancerIP=<IP_LOADBALANCER> \
  --set controller.replicaCount=1 \
  --set controller.extraArgs.watch-namespace=<NAMESPACE>
```

---

## Etapa 4: Criar Arquivo de Configuração

Crie o arquivo `argocd-values.yaml`:

```yaml
global:
  domain: <DOMINIO>

server:
  replicas: 2
  ingress:
    enabled: true
    ingressClassName: <INGRESS_CLASS>
    annotations:
      nginx.ingress.kubernetes.io/backend-protocol: "HTTPS"
    extraTls:
      - secretName: <NOME_SECRET_TLS>
        hosts:
          - <DOMINIO>

controller:
  replicas: 2

repoServer:
  replicas: 2

redis-ha:
  enabled: true
  master:
    persistence:
      enabled: true
      storageClass: <STORAGECLASS>
      size: 8Gi
  replica:
    persistence:
      enabled: true
      storageClass: <STORAGECLASS>
      size: 8Gi

applicationSet:
  replicaCount: 2

notifications:
  enabled: true

configs:
  params:
    server.insecure: false
    controller.status.processors: "20"
    controller.operation.processors: "10"
  cm:
    timeout.reconciliation: 180s
  rbac:
    policy.default: role:readonly
    scopes: '[groups]'

serverService:
  type: ClusterIP

repoServerService:
  type: ClusterIP

controllerService:
  type: ClusterIP

resources:
  requests:
    cpu: 250m
    memory: 512Mi
  limits:
    cpu: 1000m
    memory: 2Gi
```

---

## Etapa 5: Instalar o Argo CD

```bash
helm upgrade --install argocd argo/argo-cd \
  --namespace <NAMESPACE> \
  --values argocd-values.yaml
```

---

## Etapa 6: Verificar Instalação

```bash
# Verificar pods
kubectl get pods -n <NAMESPACE>

# Verificar serviços
kubectl get svc -n <NAMESPACE>

# Verificar ingress
kubectl get ingress -n <NAMESPACE>
```

---

## Obter Senha do Admin

```bash
kubectl get secret argocd-initial-admin-secret -n <NAMESPACE> \
  -o jsonpath="{.data.password}" | base64 -d
```

---

## Procedimento: Criar Usuário Local no ArgoCD (Sem CLI)

Criação manual do Argocd

## Pré-requisitos para atuar

- Acesso kubectl ao cluster onde o ArgoCD está instalado
- Ferramenta `htpasswd` instalada (pacote `apache2-utils` no Ubuntu/Debian)

---

## Passo 1: Definir o Usuário no ConfigMap

Editar o ConfigMap `argocd-cm`:

```bash
kubectl edit configmap argocd-cm -n argocd
```

Adicionar na seção `data`:

```yaml
data:
  accounts.<usuario>: login
```

**IMPORTANTE:**

- Use apenas `login` para autenticação via senha
- NÃO use `apiKey` se quiser apenas senha (sem tokens)

Salvar e sair.

---

## Passo 2: Gerar Hash Bcrypt da Senha

Execute localmente:

```bash
htpasswd -nbB admin '<senha>' | cut -d: -f2
```

**Saída esperada (exemplo):**

```bash
$2y$05$xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

**Copie esse hash completo (incluindo o `$2y$`)**

---

## Passo 3: Adicionar Senha no Secret

**IMPORTANTE:** Use o hash COMPLETO copiado no passo anterior.

```bash
kubectl patch secret argocd-secret -n argocd -p '{"stringData": {"accounts.<usuario>.password": "<HASH_BCRYPT_COMPLETO>"}}'
```

**Opcional:** Adicionar timestamp da senha (recomendado):

```bash
kubectl patch secret argocd-secret -n argocd -p "{\"stringData\": {\"accounts.<usuario>.passwordMtime\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}}"
```

---

## Passo 4: Configurar Permissões RBAC

Editar o ConfigMap `argocd-rbac-cm`:

```bash
kubectl edit configmap argocd-rbac-cm -n argocd
```

Adicionar políticas na seção `data.policy.csv`:

```yaml
data:
  policy.csv: |
    p, <usuario>, applications, *, */*, allow
    p, <usuario>, repositories, *, *, allow
```

**Exemplo com permissões completas:**

```yaml
data:
  policy.csv: |
    p, <usuario>, applications, *, */*, allow
    p, <usuario>, repositories, *, *, allow
    p, <usuario>, clusters, *, *, allow
    p, <usuario>, projects, *, *, allow
```

**Exemplo com permissões somente leitura:**

```yaml
data:
  policy.csv: |
    p, <usuario>, applications, get, */*, allow
    p, <usuario>, repositories, get, *, allow
```

Salvar e sair.

---

## Passo 5: Restart do ArgoCD Server

```bash
kubectl rollout restart deployment argocd-server -n argocd
```

Aguardar o pod reiniciar:

```bash
kubectl rollout status deployment argocd-server -n argocd
```

---

## Passo 6: Validar (Opcional)

Verificar se o hash foi gravado corretamente no Secret:

```bash
kubectl get secret argocd-secret -n argocd -o jsonpath='{.data.accounts\.<usuario>\.password}' | base64 -d
```

**Deve retornar o hash bcrypt completo começando com `$2y$` ou `$2a$`**

---

## Passo 7: Testar Login

Acessar a UI do ArgoCD e fazer login com:

- **Username:** `<usuario>`
- **Password:** `<senha>`

---

## Troubleshooting

### Erro: "parsing time ... cannot parse"

**Causa:** Formato incorreto do `passwordMtime`

**Solução:**

```bash
# Remover o passwordMtime com erro
kubectl patch secret argocd-secret -n argocd --type=json -p='[{"op": "remove", "path": "/data/accounts.<usuario>.passwordMtime"}]'

# Adicionar novamente com formato correto
kubectl patch secret argocd-secret -n argocd -p "{\"stringData\": {\"accounts.<usuario>.passwordMtime\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}}"

# Restart
kubectl rollout restart deployment argocd-server -n argocd
```

### Erro: "Invalid username or password"

**Causas possíveis:**

1. **Hash bcrypt incompleto/incorreto**

```bash
Validar:
```bash
kubectl get secret argocd-secret -n argocd -o jsonpath='{.data.accounts\.<usuario>\.password}' | base64 -d
```

Deve começar com `$2y$` ou `$2a$`
Se estiver errado, corrigir:

```bash
kubectl patch secret argocd-secret -n argocd --type=json -p='[{"op": "remove", "path": "/data/accounts.<usuario>.password"}]'
kubectl patch secret argocd-secret -n argocd -p '{"stringData": {"accounts.<usuario>.password": "<HASH_CORRETO>"}}'
kubectl rollout restart deployment argocd-server -n argocd
```

1. **Usuário não configurado no ConfigMap**

Verificar:

```bash
kubectl get configmap argocd-cm -n argocd -o yaml | grep accounts
```

Deve aparecer: `accounts.<usuario>: login`

1. **ArgoCD Server não foi restartado**

Forçar restart:

```bash
kubectl rollout restart deployment argocd-server -n argocd
```

---

## Referências

- [ArgoCD User Management - Official Docs](https://argo-cd.readthedocs.io/en/stable/operator-manual/user-management/)
- [ArgoCD FAQ - Password Management](https://argo-cd.readthedocs.io/en/release-2.2/faq/)
- [Medium Article - Manage ArgoCD Users Without CLI](https://medium.com/@dedicatted/how-to-manage-argo-cd-local-users-without-cli-access-71fbf4d3d17a)

---

## Notas Importantes

1. **stringData vs data:** Use sempre `stringData` nos patches, o Kubernetes converte automaticamente para base64
2. **Aspas simples vs duplas:** Use aspas simples `'` quando não tiver variáveis shell, e duplas `"` quando tiver `$(date ...)`
3. **Hash bcrypt:** Sempre copie o hash COMPLETO incluindo `$2y$` ou `$2a$`
4. **Restart obrigatório:** O ArgoCD só reconhece mudanças de senha após restart do pod argocd-server

---

## Gerenciamento de Usuários - OLD MAS DEVE TER ALGO VÁLIDO

### Criar Novo Usuário

1. Gere o hash da senha:

```bash
htpasswd -bnBC 10 "" '<SENHA>' | tr -d ':\n'
```

1. Adicione o usuário no ConfigMap:

```bash
kubectl edit configmap argocd-cm -n <NAMESPACE>
```

```yaml
data:
  accounts.<USUARIO>: apiKey,login
  accounts.<USUARIO>.enabled: "true"
  accounts.<USUARIO>.password: <HASH_SENHA>
```

### Configurar Permissões (RBAC)

```bash
kubectl edit configmap argocd-rbac-cm -n <NAMESPACE>
```

```yaml
data:
  policy.csv: |
    # Permissões para projeto específico
    p, role:<NOME_ROLE>, applications, logs, <PROJETO>/*, allow
    p, role:<NOME_ROLE>, applications, restart, <PROJETO>/*, allow
    p, role:<NOME_ROLE>, applications, sync, <PROJETO>/*, allow
    p, role:<NOME_ROLE>, repositories, get, *, allow
    p, role:<NOME_ROLE>, clusters, get, *, allow
    p, role:<NOME_ROLE>, exec, create, <PROJETO>/*, allow
    p, role:<NOME_ROLE>, applications, *, <PROJETO>/*, allow

    # Associar usuário ao role
    g, <USUARIO>, role:<NOME_ROLE>
```

---

## CLI do Argo CD

### Instalar CLI

```bash
# Linux
curl -sSL -o argocd-linux-amd64 https://github.com/argoproj/argo-cd/releases/latest/download/argocd-linux-amd64
sudo install -m 555 argocd-linux-amd64 /usr/local/bin/argocd
rm argocd-linux-amd64

# macOS
brew install argocd
```

### Login via CLI

```bash
argocd login <DOMINIO> --username admin --password <SENHA>
```

### Comandos Úteis

```bash
# Listar aplicações
argocd app list

# Sincronizar aplicação
argocd app sync <NOME_APP>

# Ver status da aplicação
argocd app get <NOME_APP>

# Ver logs
argocd app logs <NOME_APP>
```

---

## Comandos Kubectl Úteis

```bash
# Ver todas as aplicações Argo CD
kubectl get applications -n <NAMESPACE>

# Descrever aplicação
kubectl describe application <NOME_APP> -n <NAMESPACE>

# Ver projetos
kubectl get appprojects -n <NAMESPACE>

# Logs do Argo CD Server
kubectl logs -n <NAMESPACE> -l app.kubernetes.io/name=argocd-server
```

---

## Documentação

- [Documentação Oficial Argo CD](https://argo-cd.readthedocs.io/)
- [Helm Chart Argo CD](https://github.com/argoproj/argo-helm/tree/main/charts/argo-cd)
- [GitOps com Argo CD](https://argo-cd.readthedocs.io/en/stable/user-guide/best_practices/)
- [RBAC Configuration](https://argo-cd.readthedocs.io/en/stable/operator-manual/rbac/)

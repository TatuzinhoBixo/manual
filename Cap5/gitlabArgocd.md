# 📋 Procedimento de Implementação GitOps

## 🎯 Objetivo
Automatizar a atualização dos manifestos Kubernetes em um repositório GitOps separado quando uma nova versão da aplicação for buildada.

---

## 📦 Pré-requisitos

1. ✅ Repositório de código da aplicação (onde está o `.gitlab-ci.yml`)
2. ✅ Repositório GitOps separado com os manifestos Kubernetes
3. ✅ Variável `GITOPS_TOKEN` configurada no GitLab CI/CD (Settings → CI/CD → Variables)
   - **Tipo:** Project Access Token ou Personal Access Token
   - **Permissões necessárias:** `write_repository` (permite push)
   - **Role mínimo:** Developer ou Maintainer no repositório GitOps
   - **Escopo:** Acesso ao repositório GitOps de destino
4. ✅ ArgoCD ou Flux configurado monitorando o repositório GitOps

### 🔑 Como criar o GITOPS_TOKEN

**Opção 1: Project Access Token (Recomendado)**
1. Vá até o repositório GitOps
2. Settings → Access Tokens
3. Crie um token com:
   - Nome: `gitops-automation`
   - Role: `Maintainer`
   - Scopes: `write_repository`
   - Expiration: Defina conforme política da empresa

**Opção 2: Personal Access Token**
1. User Settings → Access Tokens
2. Crie um token com:
   - Nome: `gitops-ci-token`
   - Scopes: `write_repository`, `api`
   - Expiration: Defina conforme política da empresa

**Configurar no projeto de CI/CD:**
1. Vá ao repositório da aplicação (não o GitOps)
2. Settings → CI/CD → Variables
3. Adicione variável:
   - Key: `GITOPS_TOKEN`
   - Value: `<seu-token>`
   - Type: `Variable`
   - Protected: ✅ (apenas em branches/tags protegidas)
   - Masked: ✅ (esconde nos logs)

---

## 🔧 Implementação

### 1. Modificar o job de build Docker (PRD)

**Antes:** Gerava apenas tag `:latest`

**Depois:** Gera tag versionada `v1.0.$CI_PIPELINE_IID` + `:latest`

```yaml
docker-prd:
  stage: docker
  script:
    - export VERSION_TAG="v1.0.$CI_PIPELINE_IID"
    - docker build -t "$IMAGE:$VERSION_TAG" -t "$IMAGE:latest" .
    - docker push "$IMAGE:$VERSION_TAG"
    - docker push "$IMAGE:latest"
```

---

### 2. Adicionar stage `update-gitops`

Adiciona um novo stage que:
- Clona o repositório GitOps
- Atualiza o `deployment.yaml` com a nova tag
- Commita e faz push das alterações

```yaml
update-gitops-prd:
  stage: update-gitops
  script: |
    git clone https://oauth2:${GITOPS_TOKEN}@<URL_REPO_GITOPS> gitops-repo
    cd gitops-repo
    sed -i "s|image: <REGISTRY>/<IMAGE>:.*|image: <REGISTRY>/<IMAGE>:${NEW_VERSION}|g" <PATH>/deployment.yaml
    git add <PATH>/deployment.yaml
    git commit -m "chore: update image tag to ${NEW_VERSION} [skip ci]"
    git push origin main
```

---

## 🔄 Fluxo de Funcionamento

```
1. Developer cria TAG no Git
         ↓
2. Pipeline CI/CD é disparada
         ↓
3. Job build-prd: Compila aplicação
         ↓
4. Job docker-prd: Cria imagem com versão v1.0.X
         ↓
5. Job update-gitops-prd: Atualiza repositório GitOps
         ↓
6. ArgoCD detecta mudança e aplica no cluster
```

---

## ✅ Checklist de Validação

- [ ] Pipeline executa sem erros
- [ ] Imagem é criada com 2 tags (versionada + latest)
- [ ] Repositório GitOps é atualizado automaticamente
- [ ] Commit no GitOps contém `[skip ci]` para evitar loops
- [ ] ArgoCD sincroniza e aplica as mudanças no cluster

---

## 🐛 Troubleshooting

### Erro: "Permission denied" ao fazer push
- Verifique se o token tem permissão `write_repository`
- Verifique se o token tem role `Maintainer` ou `Developer` no repo GitOps

### Erro: "Authentication failed"
- Verifique se o token está correto na variável `GITOPS_TOKEN`
- Verifique se o token não expirou

### Pipeline fica em loop infinito
- Certifique-se que o commit contém `[skip ci]` na mensagem
- Verifique as regras de trigger da pipeline

---

**Agora tenta fazer sozinho e me conta como foi! 💪**
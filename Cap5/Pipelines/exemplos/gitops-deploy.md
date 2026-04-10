# Pipeline GitOps - Atualização de Deployment

## Descrição

Este exemplo demonstra um job de pipeline que implementa o padrão GitOps: após o build de uma imagem, o pipeline atualiza automaticamente o repositório de manifests Kubernetes, permitindo que ferramentas como ArgoCD detectem a mudança e realizem o deploy.

---

## Variáveis Necessárias

Configure estas variáveis em **Settings > CI/CD > Variables**:

| Variável | Descrição | Exemplo |
|:---------|:----------|:--------|
| `GITOPS_REPO_URL` | URL do repositório GitOps | `https://gitlab.exemplo.com.br/infra/gitops-app.git` |
| `REGISTRY_URL` | URL do registry de imagens | `registry.exemplo.com.br` |
| `CI_EMAIL` | Email para commits do CI | `ci-bot@exemplo.com.br` |
| `IMAGE_TAG` | Tag da imagem (geralmente construída no pipeline) | `${REGISTRY_URL}/${CI_PROJECT_PATH}:${CI_COMMIT_SHORT_SHA}` |

---

## Fluxo do Job

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Clone GitOps   │────▶│ Atualiza YAML   │────▶│  Push changes   │
│   Repository    │     │   com nova tag  │     │    to main      │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                                        │
                                                        ▼
                                               ┌─────────────────┐
                                               │  ArgoCD detecta │
                                               │  e faz deploy   │
                                               └─────────────────┘
```

---

## Exemplo de Job

```yaml
variables:
  # Defina ou obtenha de CI/CD Variables
  GITOPS_REPO_URL: "https://gitlab.exemplo.com.br/infra/gitops-app.git"
  REGISTRY_URL: "registry.exemplo.com.br"
  IMAGE_TAG: "${REGISTRY_URL}/${CI_PROJECT_PATH}:${CI_COMMIT_SHORT_SHA}"

update_deployment:
  stage: deploy
  tags:
    - docker
  script:
    - |
      echo "Clonando repositório GitOps"
      git clone https://oauth2:${CI_JOB_TOKEN}@${GITOPS_REPO_URL#https://}

      # Nome do diretório clonado (último segmento da URL sem .git)
      REPO_DIR=$(basename ${GITOPS_REPO_URL} .git)
      cd ${REPO_DIR}

      echo "Tag de imagem: $IMAGE_TAG"

      echo "Conteúdo atual do deployment:"
      grep "image:" deployment.yaml || true

      echo "Atualizando tag da imagem"
      sed -i "s|image: ${REGISTRY_URL}/.*|image: ${IMAGE_TAG}|" deployment.yaml

      echo "Conteúdo após atualização:"
      grep "image:" deployment.yaml

      # Verifica se houve alterações
      if git diff --exit-code deployment.yaml; then
        echo "Nenhuma alteração detectada. Pulando commit."
        exit 0
      fi

      git config --global user.email "${CI_EMAIL}"
      git config --global user.name "GitLab CI"
      git add deployment.yaml
      git commit -m "Atualiza imagem para ${CI_COMMIT_SHORT_SHA}"

      # Push com retry
      git push origin main || (sleep 5 && git push origin main)
  rules:
    - if: $CI_COMMIT_BRANCH == "main"
```

---

## Explicação dos Comandos

| Comando | Descrição |
|:--------|:----------|
| `git clone https://oauth2:${CI_JOB_TOKEN}@...` | Clona usando token de autenticação do CI |
| `sed -i "s\|...\|...\|"` | Substitui a linha da imagem no YAML |
| `git diff --exit-code` | Retorna código 0 se não houver diferenças |
| `git push \|\| (sleep && push)` | Retry em caso de falha (conflito de push) |

---

## Requisitos

1. **Token de acesso**: O `CI_JOB_TOKEN` precisa ter permissão de escrita no repositório GitOps
2. **Estrutura do deployment.yaml**: O arquivo deve conter uma linha `image:` que será substituída
3. **Branch protegida**: Se `main` estiver protegida, configure exceção para o token do CI

---

## Troubleshooting

### Erro de permissão no push

Verifique se o projeto GitOps permite push via `CI_JOB_TOKEN`:
- Settings > Repository > Protected branches
- Ou use um Deploy Token com permissão de escrita

### Nenhuma alteração detectada

O job pula o commit se a tag já estiver atualizada. Isso evita commits duplicados em re-runs do pipeline.

---

## Referências

- [GitOps com GitLab](https://docs.gitlab.com/ee/user/clusters/agent/gitops.html)
- [CI/CD Job Token](https://docs.gitlab.com/ee/ci/jobs/ci_job_token.html)

# Estrutura Básica de Pipelines

## Descrição

Pipelines no GitLab CI/CD são definidos através do arquivo `.gitlab-ci.yml` na raiz do repositório. Este documento explica a estrutura e sintaxe básica para criação de pipelines.

---

## Estrutura do Arquivo

```yaml
# Definição de stages (ordem de execução)
stages:
  - build
  - test
  - deploy

# Variáveis globais
variables:
  APP_NAME: "minha-aplicacao"

# Job de exemplo
nome_do_job:
  stage: build
  tags:
    - docker
  script:
    - echo "Executando comandos"
```

---

## Componentes Principais

### stages

Define a ordem de execução dos estágios. Jobs no mesmo stage rodam em paralelo.

```yaml
stages:
  - build      # Primeiro: compilação
  - test       # Segundo: testes
  - deploy     # Terceiro: deploy
```

### variables

Variáveis disponíveis em todos os jobs do pipeline.

```yaml
variables:
  AMBIENTE: "homologacao"
  REGISTRY_URL: "registry.exemplo.com.br"
```

### tags

Define em qual Runner o job será executado (baseado nas tags configuradas no Runner).

```yaml
tags:
  - docker
  - linux
```

### script

Comandos a serem executados no job.

```yaml
script:
  - npm install
  - npm run build
```

### only/except (legado) ou rules

Controla quando o job é executado.

```yaml
# Sintaxe moderna (recomendada)
rules:
  - if: $CI_COMMIT_BRANCH == "main"
    when: always
  - when: never

# Sintaxe legada
only:
  - main
  - develop
```

### artifacts

Arquivos gerados que podem ser usados por jobs posteriores.

```yaml
artifacts:
  paths:
    - build/
  expire_in: 1 week
```

### dependencies

Define de quais jobs anteriores os artifacts devem ser baixados.

```yaml
deploy:
  stage: deploy
  dependencies:
    - build
```

---

## Variáveis Predefinidas

O GitLab CI/CD disponibiliza variáveis automáticas:

| Variável | Descrição |
|:---------|:----------|
| `CI_COMMIT_SHA` | Hash completo do commit |
| `CI_COMMIT_SHORT_SHA` | Hash curto (8 caracteres) |
| `CI_COMMIT_BRANCH` | Nome da branch |
| `CI_PIPELINE_ID` | ID do pipeline |
| `CI_JOB_TOKEN` | Token para autenticação em APIs GitLab |
| `CI_PROJECT_NAME` | Nome do projeto |
| `CI_REGISTRY_IMAGE` | Caminho da imagem no registry |

---

## Exemplo Completo

```yaml
stages:
  - build
  - test
  - deploy

variables:
  DOCKER_IMAGE: "${CI_REGISTRY_IMAGE}:${CI_COMMIT_SHORT_SHA}"

build:
  stage: build
  tags:
    - docker
  script:
    - docker build -t $DOCKER_IMAGE .
    - docker push $DOCKER_IMAGE
  rules:
    - if: $CI_COMMIT_BRANCH == "main"

test:
  stage: test
  tags:
    - docker
  script:
    - docker run --rm $DOCKER_IMAGE npm test
  needs:
    - build

deploy:
  stage: deploy
  tags:
    - docker
  script:
    - echo "Deploying $DOCKER_IMAGE"
  rules:
    - if: $CI_COMMIT_BRANCH == "main"
      when: manual
```

---

## Boas Práticas

1. **Use `rules` em vez de `only/except`**: Sintaxe mais flexível e moderna
2. **Defina `needs` para dependências**: Otimiza o tempo de execução
3. **Use variáveis para valores reutilizados**: Facilita manutenção
4. **Configure `artifacts` com expiração**: Evita consumo excessivo de armazenamento
5. **Use jobs manuais para produção**: Adicione `when: manual` em deploys críticos

---

## Referências

- [Referência .gitlab-ci.yml](https://docs.gitlab.com/ee/ci/yaml/)
- [Variáveis CI/CD](https://docs.gitlab.com/ee/ci/variables/predefined_variables.html)

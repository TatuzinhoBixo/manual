# Integração GitLab CI/CD com ArgoCD

## Descrição

ArgoCD é uma ferramenta de Continuous Delivery declarativa para Kubernetes que segue o padrão GitOps. Esta integração permite que pipelines do GitLab CI/CD atualizem repositórios de manifests, e o ArgoCD automaticamente sincronize as mudanças com o cluster.

---

## Variáveis de Configuração

| Variável | Descrição | Exemplo |
|:---------|:----------|:--------|
| `<NOME_PROJETO>` | Nome do projeto/aplicação | `minha-aplicacao` |
| `<URL_REPOSITORIO>` | URL do repositório GitOps | `https://gitlab.exemplo.com.br/infra/gitops.git` |
| `<NAMESPACE>` | Namespace Kubernetes de destino | `producao` |
| `<BRANCH>` | Branch a ser monitorada | `main` |
| `<USUARIO_GIT>` | Usuário com acesso ao repositório | `deploy-user` |
| `<TOKEN_GIT>` | Token de acesso ao repositório | Token de deploy ou pessoal |

---

## Configuração no ArgoCD

### 1. Criar Projeto

O projeto agrupa aplicações relacionadas e define permissões.

**Caminho**: Settings > Projects > New Project

| Campo | Valor | Descrição |
|:------|:------|:----------|
| Name | `<NOME_PROJETO>` | Identificador único do projeto |
| Description | (opcional) | Descrição do projeto |

Após criar, configure:

#### Source Repositories
Repositórios permitidos como fonte de manifests.
- Clique em "Add Source"
- Adicione: `<URL_REPOSITORIO>`

#### Destinations
Clusters e namespaces onde o projeto pode fazer deploy.

| Server | Namespace |
|:-------|:----------|
| `https://kubernetes.default.svc` | `<NAMESPACE>` |

> Use `*` para permitir qualquer namespace (não recomendado em produção).

#### Cluster Resource Allow List
Recursos que o projeto pode criar no cluster.

| Kind | Group |
|:-----|:------|
| `Namespace` | `*` |
| `*` | `*` (para permitir todos) |

---

### 2. Conectar Repositório

Configura credenciais para o ArgoCD acessar o repositório Git.

**Caminho**: Settings > Repositories > Connect Repo

| Campo | Valor |
|:------|:------|
| Connection method | `VIA HTTPS` |
| Type | `git` |
| Project | `<NOME_PROJETO>` |
| Repository URL | `<URL_REPOSITORIO>` |
| Username | `<USUARIO_GIT>` |
| Password | `<TOKEN_GIT>` |

Clique em **Connect** e verifique se o status mostra "Successful".

---

### 3. Criar Aplicação

A aplicação representa um deployment específico.

**Caminho**: Applications > New App

#### General

| Campo | Valor |
|:------|:------|
| Application Name | `<NOME_PROJETO>` |
| Project Name | `<NOME_PROJETO>` |
| Sync Policy | `Automatic` (ou Manual) |

#### Source

| Campo | Valor |
|:------|:------|
| Repository URL | `<URL_REPOSITORIO>` |
| Revision | `<BRANCH>` |
| Path | `.` (ou subdiretório com manifests) |

#### Destination

| Campo | Valor |
|:------|:------|
| Cluster URL | `https://kubernetes.default.svc` |
| Namespace | `<NAMESPACE>` |

Clique em **Create**.

---

## Fluxo GitOps Completo

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Commit     │────▶│   Pipeline   │────▶│ Atualiza     │
│   no código  │     │   GitLab CI  │     │ repo GitOps  │
└──────────────┘     └──────────────┘     └──────────────┘
                                                 │
                                                 ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Aplicação   │◀────│   ArgoCD     │◀────│  Detecta     │
│  atualizada  │     │   Sync       │     │  mudança     │
└──────────────┘     └──────────────┘     └──────────────┘
```

---

## Sincronização

### Automática
Configure `Sync Policy: Automatic` para que o ArgoCD aplique mudanças automaticamente quando detectar diferenças entre o Git e o cluster.

### Manual
Com `Sync Policy: Manual`, mudanças são detectadas mas só aplicadas após aprovação na interface do ArgoCD.

### Forçar Sync via CLI

```bash
argocd app sync <NOME_PROJETO>
```

---

## Troubleshooting

### Aplicação "OutOfSync"

A aplicação está diferente do que está no Git.

1. Verifique a aba "Diff" para ver as diferenças
2. Clique em "Sync" para aplicar as mudanças
3. Se persistir, verifique se há recursos criados manualmente no cluster

### Erro de conexão com repositório

1. Verifique se as credenciais estão corretas
2. Confirme que o token tem permissão de leitura no repositório
3. Teste a URL do repositório manualmente

### Namespace não existe

O ArgoCD não cria namespaces automaticamente por padrão. Opções:

1. Crie o namespace manualmente:
```bash
kubectl create namespace <NAMESPACE>
```

2. Ou inclua o namespace nos manifests do repositório GitOps

---

## Referências

- [Documentação ArgoCD](https://argo-cd.readthedocs.io/)
- [ArgoCD + GitLab](https://argo-cd.readthedocs.io/en/stable/user-guide/private-repositories/)

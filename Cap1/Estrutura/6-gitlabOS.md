# Instalação do GitLab (OS Nativo)

## Descrição

Instalação do GitLab Enterprise Edition diretamente no sistema operacional, sem containers.

## Requisitos de Hardware

| Uso | vCPU | RAM | Disco |
|:----|:----:|:---:|:-----:|
| Desenvolvimento | 2 | 4GB | 50GB |
| Produção | 4+ | 8-16GB | 100GB+ |

## Variáveis de Configuração

| Variável | Descrição | Exemplo |
|:---------|:----------|:--------|
| `<DOMINIO>` | Domínio do GitLab | gitlab.exemplo.com.br |
| `<DOMINIO_REGISTRY>` | Domínio do Registry | registry.exemplo.com.br |

---

## Instalação do GitLab

### Etapa 1: Instalar dependências

```bash
sudo apt update
sudo apt install -y curl ca-certificates postfix
```

> `ca-certificates`: Comunicação com repositórios externos
> `postfix`: Notificações por e-mail

### Etapa 2: Adicionar repositório GitLab

```bash
curl https://packages.gitlab.com/install/repositories/gitlab/gitlab-ee/script.deb.sh | sudo bash
```

### Etapa 3: Configurar certificados SSL

```bash
sudo mkdir -p /etc/gitlab/ssl
sudo chmod 755 /etc/gitlab/ssl

# Copie os certificados para o diretório
# <DOMINIO>.crt e <DOMINIO>.key
# <DOMINIO_REGISTRY>.crt e <DOMINIO_REGISTRY>.key

# Ajustar permissões
sudo chmod 600 /etc/gitlab/ssl/*.key
sudo chmod 644 /etc/gitlab/ssl/*.crt
```

### Etapa 4: Instalar GitLab

```bash
sudo apt install -y gitlab-ee
```

### Etapa 5: Configurar GitLab

Edite `/etc/gitlab/gitlab.rb`:

```ruby
external_url 'https://<DOMINIO>'
registry_external_url 'https://<DOMINIO_REGISTRY>'
nginx['redirect_http_to_https'] = true
```

### Etapa 6: Aplicar configuração

```bash
sudo gitlab-ctl reconfigure
```

### Etapa 7: Obter senha inicial

```bash
sudo cat /etc/gitlab/initial_root_password
```

---

## Instalação do GitLab Runner (em servidor separado)

### Instalar Docker

```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
```

### Instalar GitLab Runner

```bash
wget https://s3.amazonaws.com/gitlab-runner-downloads/latest/deb/gitlab-runner_amd64.deb
sudo dpkg -i gitlab-runner_amd64.deb
sudo usermod -aG docker gitlab-runner
```

### Registrar Runner

```bash
sudo gitlab-runner register
```

**Respostas para o registro:**

| Pergunta | Resposta |
|:---------|:---------|
| GitLab instance URL | `https://<DOMINIO>` |
| Registration token | (obter no GitLab: Settings > CI/CD > Runners) |
| Description | `docker-runner` |
| Tags | `docker,linux` |
| Executor | `docker` |
| Default Docker image | `alpine:latest` |

### Verificar Runner

```bash
sudo gitlab-runner status
```

---

## Referências

- [Documentação GitLab](https://docs.gitlab.com/ee/install/)
- [GitLab Runner](https://docs.gitlab.com/runner/)

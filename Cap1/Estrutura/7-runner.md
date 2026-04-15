# Configuração do GitLab Runner

## Descrição

O GitLab Runner é o agente responsável por executar os jobs definidos nos pipelines CI/CD. Esta documentação cobre a configuração e otimização do Runner, incluindo ajustes de paralelismo.

---

## Variáveis de Configuração

| Variável | Descrição | Exemplo |
|:---------|:----------|:--------|
| `<GITLAB_URL>` | URL da instância GitLab | `https://gitlab.tatulab.com.br` |
| `<GITLAB_HOST>` | Hostname do GitLab (sem protocolo) | `gitlab.tatulab.com.br` |
| `<IP_DO_GITLAB>` | IP do servidor GitLab (para `/etc/hosts`) | `192.168.1.10` |
| `<AUTH_TOKEN>` | Token de autenticação gerado ao criar o runner na UI | `glrt-xxxxxxxxxxxxxxxx` |
| `<RUNNER_NAME>` | Nome descritivo do Runner | `dumeio` |

---

## Instalação do GitLab Runner

> Recomenda-se instalar o Runner em um servidor **separado** do GitLab, para evitar concorrência de recursos durante a execução dos pipelines.

### Etapa 1: Atualizar o sistema

```bash
sudo apt update
sudo apt upgrade -y
```

### Etapa 2: Instalar dependências

```bash
sudo apt install -y curl ca-certificates gnupg
```

### Etapa 3: Instalar o Docker

O executor `docker` é o mais utilizado, portanto o Docker deve estar instalado no host do Runner:

```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
```

Verifique a instalação:

```bash
sudo docker --version
sudo systemctl status docker
```

A saída esperada é similar a:

```
Docker version 29.4.0, build 9d7ad9f
● docker.service - Docker Application Container Engine
     Loaded: loaded (/usr/lib/systemd/system/docker.service; enabled; preset: enabled)
     Active: active (running)
```

### Etapa 4: Adicionar o repositório oficial do GitLab Runner

```bash
curl -L "https://packages.gitlab.com/install/repositories/runner/gitlab-runner/script.deb.sh" | sudo bash
```

### Etapa 5: Instalar o pacote do GitLab Runner

```bash
sudo apt install -y gitlab-runner
```

> O pacote `gitlab-runner-helper-images` é instalado automaticamente como dependência (~560 MB).

### Etapa 6: Permitir que o Runner utilize o Docker

O serviço `gitlab-runner` roda como o usuário `gitlab-runner`. Para que ele consiga criar containers, adicione esse usuário ao grupo `docker`:

```bash
sudo usermod -aG docker gitlab-runner
```

### Etapa 7: Iniciar e habilitar o serviço

```bash
sudo systemctl enable gitlab-runner
sudo systemctl start gitlab-runner
sudo gitlab-runner status
```

Saída esperada:

```
gitlab-runner: Service is running
```

### Etapa 8: Garantir resolução DNS do GitLab

Antes de registrar, confirme que o servidor do Runner resolve o domínio do GitLab:

```bash
ping <GITLAB_HOST>
curl -I <GITLAB_URL>
```

Se o `ping` retornar `Name or service not known`, o DNS não está resolvendo. Soluções:

- **Ambiente com DNS interno** — garanta que `/etc/resolv.conf` aponta para o servidor DNS interno (ver `3-dns.md`).
- **Ambiente de lab** — adicione a entrada manualmente em `/etc/hosts`:

```bash
sudo nano /etc/hosts
```

```
<IP_DO_GITLAB>   <GITLAB_HOST>
```

### Etapa 9: Criar o Runner no GitLab (fluxo novo)

A partir do GitLab Runner 15.6, o fluxo recomendado é **criar o runner primeiro na interface web** e só depois vincular a máquina usando o token gerado.

1. Acesse o GitLab como administrador.
2. Vá em **Admin Area > CI/CD > Runners > New instance runner**.
   - Para runner de grupo: **Group > Build > Runners > New group runner**.
   - Para runner de projeto: **Project > Settings > CI/CD > Runners > New project runner**.
3. Preencha os campos:
   - **Tags**: `docker`
   - **Run untagged jobs**: marque se o runner deve pegar jobs sem tag.
   - **Description**: `<RUNNER_NAME>` (ex.: `dumeio`).
4. Clique em **Create runner**.
5. O GitLab exibirá o **authentication token** (formato `glrt-xxxxxxxxxxxx`). Copie — ele só é mostrado uma vez.

### Etapa 10: Registrar o Runner na máquina

Com o token em mãos, rode o registro passando os parâmetros direto na linha de comando:

```bash
sudo gitlab-runner register \
  --url <GITLAB_URL> \
  --registration-token <AUTH_TOKEN>
```

O comando ainda fará algumas perguntas interativas. Responda:

| Pergunta | Resposta |
|:---------|:---------|
| GitLab instance URL | `<GITLAB_URL>` (já preenchido) |
| Registration token | `<AUTH_TOKEN>` (já preenchido) |
| Description | `<RUNNER_NAME>` (ex.: `dumeio`) |
| Tags | `docker` |
| Maintenance note | (deixe em branco) |
| Executor | `docker` |
| Default Docker image | `alpine:latest` |

> **Aviso de deprecation**: o GitLab Runner exibirá um warning sobre `registration tokens` estarem deprecados. Isso é esperado — o fluxo novo (authentication token criado na UI) é exatamente o que estamos usando, apesar do flag ainda se chamar `--registration-token`.

Saída esperada ao final:

```
Runner registered successfully.
Configuration (with the authentication token) was saved in "/etc/gitlab-runner/config.toml"
```

Após o registro, o Runner aparecerá **online (bolinha verde)** na mesma tela onde ele foi criado no GitLab.

---

## Arquivo de Configuração

O arquivo de configuração do Runner está localizado em:

```
/etc/gitlab-runner/config.toml
```

### Estrutura Básica

```toml
concurrent = 1
check_interval = 0
shutdown_timeout = 0

[session_server]
  session_timeout = 1800

[[runners]]
  name = "<RUNNER_NAME>"
  url = "<GITLAB_URL>"
  token = "TOKEN_GERADO"
  executor = "docker"
  [runners.docker]
    image = "alpine:latest"
    privileged = false
    disable_entrypoint_overwrite = false
    oom_kill_disable = false
    disable_cache = false
    volumes = ["/cache"]
```

---

## Paralelismo

### O que é?

O parâmetro `concurrent` define quantos jobs podem ser executados simultaneamente pelo Runner. Por padrão, o valor é `1`, o que significa que apenas um job é executado por vez.

### Quando aumentar?

Aumentar o paralelismo é útil quando:
- A VM/servidor possui recursos suficientes (CPU, RAM)
- Existem muitos jobs aguardando na fila
- Os jobs não competem por recursos compartilhados

### Como configurar

1. Edite o arquivo de configuração:

```bash
sudo nano /etc/gitlab-runner/config.toml
```

2. Altere o valor de `concurrent`:

```toml
# Antes
concurrent = 1

# Depois (exemplo com 4 jobs simultâneos)
concurrent = 4
```

3. Reinicie o Runner:

```bash
sudo gitlab-runner restart
```

### Recomendações de Recursos

| Jobs Simultâneos | vCPU Mínimo | RAM Mínima |
|:---------------:|:-----------:|:----------:|
| 2 | 2 | 4GB |
| 4 | 4 | 8GB |
| 8 | 8 | 16GB |

> **Importante**: Monitore o uso de recursos após alterar o paralelismo. Se a VM apresentar lentidão ou falhas nos jobs, reduza o valor de `concurrent`.

---

## Verificação do Status

```bash
# Verificar status do serviço
sudo gitlab-runner status

# Listar runners registrados
sudo gitlab-runner list

# Verificar logs
sudo journalctl -u gitlab-runner -f
```

---

## Troubleshooting

### Runner não aparece no GitLab

1. Verifique se o serviço está rodando:
```bash
sudo gitlab-runner status
```

2. Verifique conectividade com o GitLab:
```bash
curl -I <GITLAB_URL>
```

3. Re-registre o Runner se necessário:
```bash
sudo gitlab-runner register
```

### Jobs ficam pendentes

- Verifique se as tags do job correspondem às tags do Runner
- Confirme que o Runner está online no GitLab
- Verifique se o executor (Docker) está funcionando

---

## Referências

- [Documentação GitLab Runner](https://docs.gitlab.com/runner/)
- [Configuração Avançada](https://docs.gitlab.com/runner/configuration/advanced-configuration.html)

# Configuração do GitLab Runner

## Descrição

O GitLab Runner é o agente responsável por executar os jobs definidos nos pipelines CI/CD. Esta documentação cobre a configuração e otimização do Runner, incluindo ajustes de paralelismo.

---

## Variáveis de Configuração

| Variável | Descrição | Exemplo |
|:---------|:----------|:--------|
| `<GITLAB_URL>` | URL da instância GitLab | `https://gitlab.exemplo.com.br` |
| `<REGISTRATION_TOKEN>` | Token de registro do Runner | Obtido em Settings > CI/CD > Runners |
| `<RUNNER_NAME>` | Nome descritivo do Runner | `docker-runner-prod` |

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

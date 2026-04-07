# Instalação do GitLab (Docker)

## Descrição

GitLab é uma plataforma DevOps completa que inclui repositório Git, CI/CD, registro de containers e mais. Esta instalação utiliza Docker Compose.

## Pré-requisitos

- Docker e Docker Compose instalados
- Certificados SSL válidos
- DNS configurado

## Variáveis de Configuração

| Variável | Descrição | Exemplo |
|:---------|:----------|:--------|
| `<DOMINIO>` | Domínio do GitLab | gitlab.exemplo.com.br |
| `<DOMINIO_REGISTRY>` | Domínio do Registry | registry.exemplo.com.br |
| `<VERSAO_GITLAB>` | Versão do GitLab | 18.2.2-ce.0 |
| `<DIRETORIO_DADOS>` | Diretório para dados | /git/gitlab |

---

## Docker Compose

Crie o arquivo `docker-compose.yaml`:

```yaml
services:
  gitlab:
    image: gitlab/gitlab-ce:<VERSAO_GITLAB>
    restart: always
    hostname: <DOMINIO>
    ports:
      - "80:80"
      - "443:443"
      - "2222:22"
      - "5001:5000"
    environment:
      GITLAB_OMNIBUS_CONFIG: |
        external_url 'https://<DOMINIO>'
        gitlab_rails['gitlab_shell_ssh_port'] = 2222

        # Registry
        registry_external_url 'https://<DOMINIO_REGISTRY>'
        registry['enable'] = true
        registry['host'] = "<DOMINIO_REGISTRY>"
        registry['port'] = 5000
        registry['issuer'] = "gitlab-issuer"
        registry_nginx['ssl_certificate'] = "/etc/gitlab/ssl/fullchain.pem"
        registry_nginx['ssl_certificate_key'] = "/etc/gitlab/ssl/privkey.pem"

        # Nginx/SSL
        nginx['listen_https'] = true
        nginx['ssl_certificate'] = "/etc/gitlab/ssl/fullchain.pem"
        nginx['ssl_certificate_key'] = "/etc/gitlab/ssl/privkey.pem"
        nginx['redirect_http_to_https'] = true
        letsencrypt['enable'] = false

    volumes:
      - <DIRETORIO_DADOS>/config:/etc/gitlab
      - <DIRETORIO_DADOS>/logs:/var/log/gitlab
      - <DIRETORIO_DADOS>/data:/var/opt/gitlab
      - <DIRETORIO_DADOS>/ssl:/etc/gitlab/ssl

    networks:
      - gitlab_net

networks:
  gitlab_net:
    driver: bridge
```

---

## Iniciar GitLab

```bash
docker compose up -d
```

> **Certificados**: Certifique-se de que os arquivos `fullchain.pem` e `privkey.pem` estão no diretório SSL configurado.

## Referências

- [Documentação GitLab Docker](https://docs.gitlab.com/ee/install/docker.html)


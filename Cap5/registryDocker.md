# Instalação do Docker Registry

## Descrição

Docker Registry privado para armazenar imagens de containers. Alternativa ao Registry integrado do GitLab.

## Pré-requisitos

- Docker e Docker Compose instalados
- Certificados SSL válidos
- `htpasswd` (parte do pacote `apache2-utils`)

## Variáveis de Configuração

| Variável | Descrição | Exemplo |
|:---------|:----------|:--------|
| `<DOMINIO_REGISTRY>` | Domínio do registry | registry.exemplo.com.br |
| `<USUARIO_REGISTRY>` | Usuário para autenticação | admin |
| `<SENHA_REGISTRY>` | Senha do usuário | (usar senha forte, sem caracteres especiais) |
| `<DIRETORIO_DADOS>` | Diretório para dados | /var/lib/registry |
| `<DIRETORIO_CERTS>` | Diretório dos certificados | /etc/ssl/registry |

---

## Configuração

### Etapa 1: Criar arquivo de autenticação

```bash
sudo apt install -y apache2-utils
mkdir -p <DIRETORIO_DADOS>/auth
htpasswd -Bbn <USUARIO_REGISTRY> <SENHA_REGISTRY> > <DIRETORIO_DADOS>/auth/htpasswd
chmod 600 <DIRETORIO_DADOS>/auth/htpasswd
```

> **Nota**: A senha não deve conter caracteres especiais para evitar problemas de autenticação.

### Etapa 2: Docker Compose

Crie `docker-compose.yaml`:

```yaml
services:
  registry:
    image: registry:2
    restart: always
    ports:
      - "5000:5000"
    environment:
      REGISTRY_HTTP_ADDR: :5000
      REGISTRY_HTTP_TLS_CERTIFICATE: /certs/fullchain.pem
      REGISTRY_HTTP_TLS_KEY: /certs/private.key
      REGISTRY_AUTH: htpasswd
      REGISTRY_AUTH_HTPASSWD_REALM: "Registry Realm"
      REGISTRY_AUTH_HTPASSWD_PATH: /auth/htpasswd
    volumes:
      - <DIRETORIO_DADOS>/data:/var/lib/registry
      - <DIRETORIO_CERTS>:/certs:ro
      - <DIRETORIO_DADOS>/auth:/auth:ro
```

### Etapa 3: Iniciar

```bash
docker compose up -d
```

---

## Testes

### Login no registry

```bash
docker login <DOMINIO_REGISTRY>:5000
```

### Listar repositórios

```bash
curl -u <USUARIO_REGISTRY>:<SENHA_REGISTRY> https://<DOMINIO_REGISTRY>:5000/v2/_catalog
```

### Listar tags de uma imagem

```bash
curl -u <USUARIO_REGISTRY>:<SENHA_REGISTRY> https://<DOMINIO_REGISTRY>:5000/v2/<PROJETO>/<IMAGEM>/tags/list
```

---

## Referências

- [Documentação Docker Registry](https://docs.docker.com/registry/)


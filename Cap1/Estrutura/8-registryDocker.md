# Instalação do Docker Registry

## Descrição

Docker Registry privado para armazenar imagens de containers. Alternativa ao Registry integrado do GitLab.

## Pré-requisitos

- Docker e Docker Compose instalados (ver seção [Instalação do Docker](#instalação-do-docker))
- Certificados SSL válidos
- `htpasswd` (parte do pacote `apache2-utils`)

---

## Instalação do Docker

### Etapa 1: Remover versões antigas (se houver)

```bash
sudo apt remove -y docker docker-engine docker.io containerd runc
```

### Etapa 2: Instalar dependências

```bash
sudo apt update
sudo apt install -y ca-certificates curl gnupg lsb-release
```

### Etapa 3: Adicionar chave GPG oficial do Docker

```bash
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | \
  sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
```

### Etapa 4: Adicionar repositório do Docker

```bash
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
```

### Etapa 5: Instalar Docker Engine e Docker Compose

```bash
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

### Etapa 6: Habilitar e iniciar o serviço

```bash
sudo systemctl enable docker
sudo systemctl start docker
```

### Etapa 7: (Opcional) Adicionar usuário ao grupo docker

Para rodar comandos `docker` sem `sudo`:

```bash
sudo usermod -aG docker $USER
newgrp docker
```

### Etapa 8: Verificar instalação

```bash
docker --version
docker compose version
docker run --rm hello-world
```

---

## Variáveis de Configuração

| Variável             | Descrição                  | Exemplo                                      |
| :------------------- | :------------------------- | :------------------------------------------- |
| `<DOMINIO_REGISTRY>` | Domínio do registry        | registry.exemplo.com.br                      |
| `<USUARIO_REGISTRY>` | Usuário para autenticação  | admin                                        |
| `<SENHA_REGISTRY>`   | Senha do usuário           | (usar senha forte, sem caracteres especiais) |
| `<DIRETORIO_DADOS>`  | Diretório para dados       | /var/lib/registry                            |
| `<DIRETORIO_CERTS>`  | Diretório dos certificados | /etc/ssl/registry                            |

---

## Configuração

### Etapa 1: Criar arquivo de autenticação

```bash
sudo apt install -y apache2-utils
mkdir -p /opt/auth
htpasswd -Bbn <USUARIO_REGISTRY> <SENHA_REGISTRY> > <DIRETORIO_DADOS>/auth/htpasswd
chmod 600 /opt/auth/htpasswd
```

> **Nota**: A senha não deve conter caracteres especiais para evitar problemas de autenticação.

### Etapa 2: Instalar certificado SSL (wildcard *.tatulab.com.br)

Usaremos o certificado wildcard já existente para o domínio `*.tatulab.com.br`, que cobre o DNS `registry3.tatulab.com.br`.

Criar o diretório dos certificados:

```bash
sudo mkdir -p <DIRETORIO_CERTS>
```

Copiar os arquivos `.pem` (certificado) e `.key` (chave privada) para o diretório:

```bash
sudo cp tatulab.com.br.pem <DIRETORIO_CERTS>/fullchain.pem
sudo cp tatulab.com.br.key <DIRETORIO_CERTS>/privkey.pem
```

Ajustar permissões:

```bash
sudo chmod 644 <DIRETORIO_CERTS>/fullchain.pem
sudo chmod 600 <DIRETORIO_CERTS>/privkey.pem
sudo chown root:root <DIRETORIO_CERTS>/fullchain.pem <DIRETORIO_CERTS>/privkey.pem
```

> **Importante**: o arquivo `fullchain.pem` deve conter o certificado do domínio **seguido da cadeia intermediária** da CA. Se você tiver os arquivos separados, concatene-os:
> ```bash
> cat certificado.pem intermediario.pem | sudo tee <DIRETORIO_CERTS>/fullchain.pem
> ```

### Etapa 2.1: Configurar DNS

Garanta que o DNS `registry3.tatulab.com.br` está apontando para o IP do servidor onde o registry será executado.

### Etapa 3: Docker Compose

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
      REGISTRY_HTTP_TLS_KEY: /certs/privkey.pem
      REGISTRY_AUTH: htpasswd
      REGISTRY_AUTH_HTPASSWD_REALM: "Registry Realm"
      REGISTRY_AUTH_HTPASSWD_PATH: /auth/htpasswd
    volumes:
      - /opt/data:/var/lib/registry
      - /opt/certs:/certs:ro
      - /opt/auth:/auth:ro
```

> **Importante**: os nomes dos arquivos no compose (`fullchain.pem` e `privkey.pem`) precisam bater com os gerados na Etapa 2.

### Etapa 4: Iniciar

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

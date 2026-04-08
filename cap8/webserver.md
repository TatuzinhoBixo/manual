# VirtualHosts e Load Balancer — Apache, Nginx e HAProxy

## Descrição

Este tutorial cobre os principais modelos de configuração de proxy reverso, VirtualHosts e load balancing para **Apache**, **Nginx** e **HAProxy** em servidores fora do Kubernetes, no contexto de administração de sistemas (sysadmin).

- **Apache** e **Nginx** — proxy reverso, VirtualHosts, redirect, SSL, arquivos estáticos
- **HAProxy** — load balancer TCP/HTTP de alta performance, health check, SSL termination, ACLs

---

## Comparativo rápido: Apache vs Nginx vs HAProxy

| Aspecto                      | Apache                          | Nginx                         | HAProxy                       |
| :--------------------------- | :------------------------------ | :---------------------------- | :---------------------------- |
| Função principal             | Servidor web + proxy            | Servidor web + proxy          | Load balancer + proxy         |
| Modelo de processamento      | Por thread/processo             | Event-driven                  | Event-driven                  |
| Configuração de VirtualHost  | `<VirtualHost>` blocks          | `server {}` blocks            | `frontend` + `backend` blocks |
| Arquivo de configuração      | `/etc/apache2/sites-available/` | `/etc/nginx/sites-available/` | `/etc/haproxy/haproxy.cfg`    |
| Ativar site                  | `a2ensite`                      | Symlink manual                | Editar `haproxy.cfg`          |
| Testar configuração          | `apache2ctl configtest`         | `nginx -t`                    | `haproxy -c -f haproxy.cfg`   |
| Recarregar                   | `systemctl reload apache2`      | `systemctl reload nginx`      | `systemctl reload haproxy`    |
| Proxy reverso HTTP           | `mod_proxy`                     | Nativo                        | Nativo                        |
| Load balancing               | Limitado                        | Upstream block                | Nativo e avançado             |
| Health check                 | Limitado                        | Limitado                      | Nativo e avançado             |
| Stats/Dashboard              | Não                             | Não                           | Página de stats nativa        |
| `.htaccess`                  | Suportado                       | Não suportado                 | Não suportado                 |
| Roteamento por domínio (SNI) | Sim                             | Sim                           | Sim (modo HTTP)               |
| Proxy TCP puro (layer 4)     | Não                             | Limitado                      | Nativo (modo TCP)             |

---

## Variáveis de Configuração

| Variável          | Descrição                                    | Exemplo            |
| :---------------- | :------------------------------------------- | :----------------- |
| `<DOMINIO>`       | Nome do domínio do site                      | app.exemplo.com.br |
| `<APLICACAO>`     | Nome da aplicação (usado em logs e backends) | minha-app          |
| `<IP_BACKEND>`    | IP do servidor de aplicação                  | 10.0.0.50          |
| `<PORTA_BACKEND>` | Porta do serviço backend                     | 8080               |
| `<IP_BACKEND_1>`  | IP do primeiro servidor backend              | 10.0.0.51          |
| `<IP_BACKEND_2>`  | IP do segundo servidor backend               | 10.0.0.52          |
| `<IP_BACKEND_3>`  | IP do terceiro servidor backend              | 10.0.0.53          |
| `<CERTIFICADO>`   | Arquivo do certificado SSL                   | app.exemplo.crt    |
| `<CHAVE_PRIVADA>` | Arquivo da chave privada SSL                 | app.exemplo.key    |
| `<INTERMEDIARIO>` | Certificado intermediário (chain)            | ca-bundle.crt      |
| `<CERT_PEM>`      | Certificado + chave em arquivo único (.pem)  | app.exemplo.pem    |
| `<PORTA_STATS>`   | Porta da página de estatísticas do HAProxy   | 8404               |
| `<STATS_USER>`    | Usuário da página de stats                   | admin              |
| `<STATS_PASS>`    | Senha da página de stats                     | senhaforte         |

---

## Apache

### Estrutura de arquivos

```
/etc/apache2/
├── sites-available/      ← arquivos de configuração (inativos)
│   ├── <APLICACAO>.conf
│   └── default.conf
├── sites-enabled/        ← symlinks dos sites ativos (a2ensite)
├── mods-available/       ← módulos disponíveis
├── mods-enabled/         ← módulos ativos (a2enmod)
└── apache2.conf          ← configuração principal
```

### Módulos necessários

```bash
# Proxy reverso HTTP
sudo a2enmod proxy proxy_http

# Proxy reverso HTTPS (backend SSL)
sudo a2enmod proxy proxy_http proxy_connect ssl

# Redirect e rewrite
sudo a2enmod rewrite

# Headers
sudo a2enmod headers

# Reload após ativar módulos
sudo systemctl reload apache2
```

---

### Modelo 1 — Proxy Reverso HTTP (porta 80)

```apache
<VirtualHost *:80>
    ServerName <DOMINIO>

    ServerAdmin webmaster@localhost
    DocumentRoot "/var/www/<APLICACAO>"

    LogLevel warn
    ErrorLog  ${APACHE_LOG_DIR}/error-<APLICACAO>.log
    CustomLog ${APACHE_LOG_DIR}/access-<APLICACAO>.log combined

    ProxyRequests Off
    ProxyTimeout 500
    ProxyStatus On
    ProxyPreserveHost On

    <Proxy *>
        AddDefaultCharset Off
        Order allow,deny
        Allow from all
    </Proxy>

    ProxyPass        / http://<IP_BACKEND>:<PORTA_BACKEND>/
    ProxyPassReverse / http://<IP_BACKEND>:<PORTA_BACKEND>/

    ServerSignature Off
</VirtualHost>
```

---

### Modelo 2 — Proxy Reverso HTTPS (porta 443)

```apache
<VirtualHost *:443>
    ServerName <DOMINIO>

    LogLevel error
    ErrorLog  /var/log/apache2/<APLICACAO>-error.log
    CustomLog /var/log/apache2/<APLICACAO>-access.log vhost_combined

    ProxyRequests Off
    ProxyStatus On
    ProxyPreserveHost On

    <Proxy *>
        AddDefaultCharset Off
        Order allow,deny
        Allow from all
    </Proxy>

    SSLEngine On
    SSLCertificateFile      /etc/apache2/ssl/<CERTIFICADO>.crt
    SSLCertificateKeyFile   /etc/apache2/ssl/<CHAVE_PRIVADA>.key
    SSLCertificateChainFile /etc/apache2/ssl/<INTERMEDIARIO>.crt

    # Desabilitar verificação SSL do backend (quando backend usa SSL sem cert válido)
    SSLProxyEngine On
    SSLProxyVerify none
    SSLProxyCheckPeerCN     off
    SSLProxyCheckPeerName   off
    SSLProxyCheckPeerExpire off

    ProxyPass        / https://<IP_BACKEND>:<PORTA_BACKEND>/
    ProxyPassReverse / https://<IP_BACKEND>:<PORTA_BACKEND>/

    ServerSignature Off
</VirtualHost>
```

> **Nota — SSLProxyVerify none:** Desabilita a verificação do certificado do backend. Útil quando o backend usa certificado autoassinado ou interno. Em produção com backend confiável, prefira `SSLProxyVerify require`.

---

### Modelo 3 — HTTP + HTTPS com redirect automático

```apache
# Redireciona HTTP → HTTPS
<VirtualHost *:80>
    ServerName <DOMINIO>

    RewriteEngine On
    RewriteRule ^(.*)$ https://%{HTTP_HOST}$1 [R=301,L]

    LogLevel warn
    ErrorLog  ${APACHE_LOG_DIR}/error-<APLICACAO>.log
    CustomLog ${APACHE_LOG_DIR}/access-<APLICACAO>.log combined
</VirtualHost>

# Serve HTTPS
<VirtualHost *:443>
    ServerName <DOMINIO>

    SSLEngine On
    SSLCertificateFile      /etc/apache2/ssl/<CERTIFICADO>.crt
    SSLCertificateKeyFile   /etc/apache2/ssl/<CHAVE_PRIVADA>.key
    SSLCertificateChainFile /etc/apache2/ssl/<INTERMEDIARIO>.crt

    ProxyRequests Off
    ProxyPreserveHost On

    <Proxy *>
        Order allow,deny
        Allow from all
    </Proxy>

    ProxyPass        / http://<IP_BACKEND>:<PORTA_BACKEND>/
    ProxyPassReverse / http://<IP_BACKEND>:<PORTA_BACKEND>/

    LogLevel error
    ErrorLog  /var/log/apache2/<APLICACAO>-error.log
    CustomLog /var/log/apache2/<APLICACAO>-access.log vhost_combined

    ServerSignature Off
</VirtualHost>
```

---

### Modelo 4 — Proxy por subpath

Útil quando múltiplas aplicações estão no mesmo domínio, separadas por path.

```apache
<VirtualHost *:80>
    ServerName <DOMINIO>

    ProxyRequests Off
    ProxyPreserveHost On

    # Aplicação A em /app-a/
    ProxyPass        /app-a/ http://<IP_BACKEND_A>:<PORTA_BACKEND_A>/
    ProxyPassReverse /app-a/ http://<IP_BACKEND_A>:<PORTA_BACKEND_A>/

    # Aplicação B em /app-b/
    ProxyPass        /app-b/ http://<IP_BACKEND_B>:<PORTA_BACKEND_B>/
    ProxyPassReverse /app-b/ http://<IP_BACKEND_B>:<PORTA_BACKEND_B>/

    # Raiz servida localmente
    DocumentRoot /var/www/html

    ErrorLog  ${APACHE_LOG_DIR}/error-<APLICACAO>.log
    CustomLog ${APACHE_LOG_DIR}/access-<APLICACAO>.log combined
</VirtualHost>
```

> **Atenção:** A ordem importa. O Apache avalia as diretivas `ProxyPass` de cima para baixo. Regras mais específicas devem vir antes das mais genéricas.

---

### Modelo 5 — Redirect permanente (301) e temporário (302)

```apache
<VirtualHost *:80>
    ServerName <DOMINIO_ANTIGO>

    # Redirect 301 — permanente (domínio inteiro)
    Redirect 301 / https://<DOMINIO_NOVO>/

    # Redirect 302 — temporário (path específico)
    # Redirect 302 /old-path/ https://<DOMINIO_NOVO>/new-path/
</VirtualHost>
```

---

### Modelo 6 — Servir arquivos estáticos localmente

```apache
<VirtualHost *:80>
    ServerName <DOMINIO>

    DocumentRoot /var/www/<APLICACAO>

    <Directory /var/www/<APLICACAO>>
        Options -Indexes +FollowSymLinks
        AllowOverride None
        Require all granted
    </Directory>

    ErrorLog  ${APACHE_LOG_DIR}/error-<APLICACAO>.log
    CustomLog ${APACHE_LOG_DIR}/access-<APLICACAO>.log combined

    ServerSignature Off
</VirtualHost>
```

---

### Modelo 7 — Restringir acesso por IP

```apache
<VirtualHost *:80>
    ServerName <DOMINIO>

    ProxyRequests Off
    ProxyPreserveHost On

    <Proxy *>
        # Permitir apenas IPs específicos
        Require ip 10.0.0.0/8
        Require ip 192.168.1.0/24
        # Require all granted  ← libera todos
    </Proxy>

    ProxyPass        / http://<IP_BACKEND>:<PORTA_BACKEND>/
    ProxyPassReverse / http://<IP_BACKEND>:<PORTA_BACKEND>/

    ErrorLog  ${APACHE_LOG_DIR}/error-<APLICACAO>.log
    CustomLog ${APACHE_LOG_DIR}/access-<APLICACAO>.log combined
</VirtualHost>
```

---

### Ativar e testar site no Apache

```bash
# Ativar o site
sudo a2ensite <APLICACAO>.conf

# Testar configuração (sempre antes de reload)
sudo apache2ctl configtest

# Recarregar Apache
sudo systemctl reload apache2

# Verificar sites ativos
sudo apache2ctl -S

# Desativar site
sudo a2dissite <APLICACAO>.conf
```

---

### Parâmetros Apache importantes

| Parâmetro             | Descrição                                          |
| :-------------------- | :------------------------------------------------- |
| `ServerName`          | Domínio principal do VirtualHost                   |
| `ServerAlias`         | Domínios alternativos (ex: `www.<DOMINIO>`)        |
| `DocumentRoot`        | Diretório raiz dos arquivos servidos               |
| `ProxyPass`           | Encaminha requisições para o backend               |
| `ProxyPassReverse`    | Reescreve headers de resposta do backend           |
| `ProxyPreserveHost`   | Mantém o header `Host` original na requisição      |
| `ProxyTimeout`        | Tempo máximo de espera do backend (segundos)       |
| `SSLEngine`           | Habilita SSL no VirtualHost                        |
| `SSLProxyEngine`      | Habilita SSL na conexão com o backend              |
| `RewriteEngine`       | Habilita mod_rewrite para redirect/rewrite de URLs |
| `ServerSignature Off` | Oculta versão do Apache nas páginas de erro        |

---

## Nginx

### Estrutura de arquivos

```
/etc/nginx/
├── sites-available/      ← arquivos de configuração (inativos)
│   └── <APLICACAO>.conf
├── sites-enabled/        ← symlinks dos sites ativos
├── conf.d/               ← configurações globais adicionais
├── snippets/             ← trechos reutilizáveis (SSL, etc.)
└── nginx.conf            ← configuração principal
```

---

### Modelo 1 — Proxy Reverso HTTP (porta 80)

```nginx
server {
    listen 80;
    server_name <DOMINIO>;

    access_log /var/log/nginx/<APLICACAO>-access.log combined;
    error_log  /var/log/nginx/<APLICACAO>-error.log error;

    location / {
        proxy_pass http://<IP_BACKEND>:<PORTA_BACKEND>;

        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_connect_timeout 10s;
        proxy_read_timeout    500s;
        proxy_send_timeout    500s;
    }
}
```

---

### Modelo 2 — Proxy Reverso HTTPS (porta 443)

```nginx
upstream <APLICACAO>_backend {
    server <IP_BACKEND>:<PORTA_BACKEND>;
}

server {
    listen 443 ssl;
    server_name <DOMINIO>;

    ssl_certificate     /etc/nginx/ssl/<CERTIFICADO>.crt;
    ssl_certificate_key /etc/nginx/ssl/<CHAVE_PRIVADA>.key;

    # Protocolos e ciphers recomendados
    ssl_protocols             TLSv1.2 TLSv1.3;
    ssl_ciphers               HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache         shared:SSL:10m;
    ssl_session_timeout       10m;

    access_log /var/log/nginx/<APLICACAO>-access.log combined;
    error_log  /var/log/nginx/<APLICACAO>-error.log error;

    location / {
        proxy_pass https://<APLICACAO>_backend;

        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Desabilitar verificação SSL do backend (cert autoassinado)
        proxy_ssl_verify off;
    }
}
```

---

### Modelo 3 — HTTP + HTTPS com redirect automático

```nginx
# Redireciona HTTP → HTTPS
server {
    listen 80;
    server_name <DOMINIO>;

    return 301 https://$server_name$request_uri;
}

# Serve HTTPS
server {
    listen 443 ssl;
    server_name <DOMINIO>;

    ssl_certificate     /etc/nginx/ssl/<CERTIFICADO>.crt;
    ssl_certificate_key /etc/nginx/ssl/<CHAVE_PRIVADA>.key;
    ssl_protocols       TLSv1.2 TLSv1.3;

    access_log /var/log/nginx/<APLICACAO>-access.log combined;
    error_log  /var/log/nginx/<APLICACAO>-error.log error;

    location / {
        proxy_pass http://<IP_BACKEND>:<PORTA_BACKEND>;

        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

---

### Modelo 4 — Proxy por subpath

```nginx
server {
    listen 80;
    server_name <DOMINIO>;

    access_log /var/log/nginx/<APLICACAO>-access.log combined;
    error_log  /var/log/nginx/<APLICACAO>-error.log error;

    # Aplicação A em /app-a/
    location /app-a/ {
        proxy_pass http://<IP_BACKEND_A>:<PORTA_BACKEND_A>/;
        proxy_set_header Host            $host;
        proxy_set_header X-Real-IP       $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    # Aplicação B em /app-b/
    location /app-b/ {
        proxy_pass http://<IP_BACKEND_B>:<PORTA_BACKEND_B>/;
        proxy_set_header Host            $host;
        proxy_set_header X-Real-IP       $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    # Raiz
    location / {
        root /var/www/html;
        index index.html;
    }
}
```

> **Nota:** A barra `/` no final do `proxy_pass` remove o prefixo do path antes de encaminhar ao backend. `proxy_pass http://backend:8080/` transforma `/app-a/foo` em `/foo`. Sem a barra, o path completo `/app-a/foo` é enviado ao backend.

---

### Modelo 5 — Redirect permanente (301) e temporário (302)

```nginx
server {
    listen 80;
    server_name <DOMINIO_ANTIGO>;

    # Redirect 301 — permanente (domínio inteiro)
    return 301 https://<DOMINIO_NOVO>$request_uri;

    # Redirect 302 — temporário
    # return 302 https://<DOMINIO_NOVO>$request_uri;
}

server {
    listen 80;
    server_name <DOMINIO>;

    # Redirect de path específico
    location /old-path/ {
        return 301 /new-path/;
    }

    location / {
        proxy_pass http://<IP_BACKEND>:<PORTA_BACKEND>;
    }
}
```

---

### Modelo 6 — Servir arquivos estáticos

```nginx
server {
    listen 80;
    server_name <DOMINIO>;

    root /var/www/<APLICACAO>;
    index index.html index.htm;

    access_log /var/log/nginx/<APLICACAO>-access.log combined;
    error_log  /var/log/nginx/<APLICACAO>-error.log error;

    location / {
        try_files $uri $uri/ =404;
    }

    # Cache de assets estáticos
    location ~* \.(jpg|jpeg|png|gif|ico|css|js|woff2)$ {
        expires 30d;
        add_header Cache-Control "public, no-transform";
    }
}
```

---

### Modelo 7 — Restringir acesso por IP

```nginx
server {
    listen 80;
    server_name <DOMINIO>;

    # Bloco de IPs permitidos
    allow 10.0.0.0/8;
    allow 192.168.1.0/24;
    deny all;

    location / {
        proxy_pass http://<IP_BACKEND>:<PORTA_BACKEND>;
        proxy_set_header Host      $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    error_log  /var/log/nginx/<APLICACAO>-error.log error;
    access_log /var/log/nginx/<APLICACAO>-access.log combined;
}
```

---

### Modelo 8 — Load Balancer entre múltiplos backends

```nginx
upstream <APLICACAO>_cluster {
    # Round-robin (padrão)
    server <IP_BACKEND_1>:<PORTA_BACKEND>;
    server <IP_BACKEND_2>:<PORTA_BACKEND>;
    server <IP_BACKEND_3>:<PORTA_BACKEND>;

    # Ou least_conn (menor número de conexões ativas)
    # least_conn;

    # Ou ip_hash (sticky session por IP do cliente)
    # ip_hash;
}

server {
    listen 80;
    server_name <DOMINIO>;

    location / {
        proxy_pass http://<APLICACAO>_cluster;

        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    access_log /var/log/nginx/<APLICACAO>-access.log combined;
    error_log  /var/log/nginx/<APLICACAO>-error.log error;
}
```

---

### Ativar e testar site no Nginx

```bash
# Criar symlink para ativar o site
sudo ln -s /etc/nginx/sites-available/<APLICACAO>.conf \
           /etc/nginx/sites-enabled/<APLICACAO>.conf

# Testar configuração (sempre antes de reload)
sudo nginx -t

# Recarregar Nginx
sudo systemctl reload nginx

# Verificar sites ativos e configuração
sudo nginx -T | grep server_name

# Desativar site
sudo rm /etc/nginx/sites-enabled/<APLICACAO>.conf
```

---

### Parâmetros Nginx importantes

| Parâmetro              | Descrição                                            |
| :--------------------- | :--------------------------------------------------- |
| `server_name`          | Domínio do server block                              |
| `listen`               | Porta e protocolo                                    |
| `proxy_pass`           | URL do backend                                       |
| `proxy_set_header`     | Headers enviados ao backend                          |
| `proxy_ssl_verify off` | Desabilita verificação SSL do backend                |
| `upstream`             | Define grupo de servidores backend                   |
| `least_conn`           | Algoritmo de balanceamento por menor conexão         |
| `ip_hash`              | Sticky session baseado no IP do cliente              |
| `return`               | Redirect ou resposta direta (sem processar location) |
| `try_files`            | Tenta servir arquivo local antes de redirecionar     |
| `expires`              | Define cache de assets estáticos                     |

---

## HAProxy

### Apache — 403 Forbidden

**Causa comum:** Permissão negada no `DocumentRoot` ou diretiva `Require` bloqueando.

```bash
# Verificar permissões do diretório
ls -la /var/www/<APLICACAO>

# Verificar logs
tail -f /var/log/apache2/error-<APLICACAO>.log
```

Corrigir permissões:
```bash
sudo chown -R www-data:www-data /var/www/<APLICACAO>
sudo chmod -R 755 /var/www/<APLICACAO>
```

### Apache — 502 Bad Gateway

**Causa comum:** Backend inacessível ou `mod_proxy` não carregado.

```bash
# Verificar se mod_proxy está ativo
sudo apache2ctl -M | grep proxy

# Testar acesso direto ao backend
curl http://<IP_BACKEND>:<PORTA_BACKEND>
```

### Apache — VirtualHost errado sendo servido

**Causa:** Múltiplos VirtualHosts e o Apache está servindo o primeiro da lista.

```bash
# Listar todos os VirtualHosts e identificar conflito
sudo apache2ctl -S
```

O primeiro VirtualHost na porta é o default. Garanta que cada `ServerName` seja único.

### Nginx — 502 Bad Gateway

**Causa comum:** Backend inacessível, timeout ou `proxy_pass` apontando para endereço errado.

```bash
# Verificar logs
tail -f /var/log/nginx/<APLICACAO>-error.log

# Testar acesso direto ao backend
curl http://<IP_BACKEND>:<PORTA_BACKEND>

# Verificar se o upstream resolve
nginx -T | grep upstream
```

### Nginx — SSL: no shared cipher / protocolo incompatível

**Causa:** Backend ou cliente usando TLS em versão incompatível.

```nginx
# Adicionar no server block para forçar TLS 1.2+
ssl_protocols TLSv1.2 TLSv1.3;
ssl_ciphers   HIGH:!aNULL:!MD5;
```

### Nginx — rewrite loop (redirect infinito)

**Causa:** `return 301` em um server block que também serve HTTPS.

Verificar se o redirect HTTP→HTTPS está em um `server` block separado, escutando apenas na porta 80.

---

## HAProxy

O HAProxy (High Availability Proxy) é um load balancer e proxy TCP/HTTP de alta performance. Diferente do Apache e Nginx, seu foco principal é **distribuir carga entre múltiplos backends** com health check nativo, algoritmos de balanceamento avançados e página de estatísticas integrada.

### Conceito: Frontend e Backend

O HAProxy trabalha com dois blocos principais:

```
Cliente → Frontend (recebe conexões) → Backend (encaminha para os servidores)
```

- **`frontend`** — define em qual IP/porta o HAProxy escuta e as ACLs de roteamento
- **`backend`** — define os servidores de destino, algoritmo de balanceamento e health check
- **`listen`** — atalho que combina frontend + backend em um único bloco (usado para casos simples)

---

### Estrutura de arquivos

```
/etc/haproxy/
├── haproxy.cfg       ← arquivo de configuração principal (único)
└── certs/            ← certificados SSL (convenção, não obrigatório)
    └── <CERT_PEM>
```

> **Nota — arquivo único:** Diferente do Apache e Nginx, o HAProxy usa um único arquivo de configuração. Todas as configurações de frontends, backends e globals ficam em `haproxy.cfg`.

---

### Estrutura base do haproxy.cfg

```haproxy
#---------------------------------------------------------------------
# Global
#---------------------------------------------------------------------
global
    log         /dev/log local0
    log         /dev/log local1 notice
    chroot      /var/lib/haproxy
    stats socket /run/haproxy/admin.sock mode 660 level admin
    stats timeout 30s
    user        haproxy
    group       haproxy
    daemon

    # Segurança SSL
    ssl-default-bind-ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256
    ssl-default-bind-options ssl-min-ver TLSv1.2 no-tls-tickets

#---------------------------------------------------------------------
# Defaults
#---------------------------------------------------------------------
defaults
    log     global
    mode    http
    option  httplog
    option  dontlognull
    option  forwardfor
    option  http-server-close
    timeout connect  5s
    timeout client   50s
    timeout server   50s
    errorfile 400 /etc/haproxy/errors/400.http
    errorfile 403 /etc/haproxy/errors/403.http
    errorfile 408 /etc/haproxy/errors/408.http
    errorfile 500 /etc/haproxy/errors/500.http
    errorfile 502 /etc/haproxy/errors/502.http
    errorfile 503 /etc/haproxy/errors/503.http
    errorfile 504 /etc/haproxy/errors/504.http
```

---

### Modelo 1 — Load Balancer HTTP simples

```haproxy
frontend <APLICACAO>-frontend
    bind *:80
    default_backend <APLICACAO>-backend

backend <APLICACAO>-backend
    balance roundrobin
    option  httpchk GET /
    server  srv1 <IP_BACKEND_1>:<PORTA_BACKEND> check
    server  srv2 <IP_BACKEND_2>:<PORTA_BACKEND> check
    server  srv3 <IP_BACKEND_3>:<PORTA_BACKEND> check
```

---

### Modelo 2 — Load Balancer HTTPS com SSL Termination

O HAProxy recebe HTTPS do cliente, termina o SSL e encaminha HTTP para os backends.

> **Nota — arquivo .pem:** O HAProxy exige que o certificado e a chave privada estejam em um único arquivo `.pem`. Gere com:
> ```bash
> cat <CERTIFICADO>.crt <INTERMEDIARIO>.crt <CHAVE_PRIVADA>.key > /etc/haproxy/certs/<CERT_PEM>
> chmod 600 /etc/haproxy/certs/<CERT_PEM>
> ```

```haproxy
frontend <APLICACAO>-frontend
    bind *:443 ssl crt /etc/haproxy/certs/<CERT_PEM>
    http-request set-header X-Forwarded-Proto https
    default_backend <APLICACAO>-backend

backend <APLICACAO>-backend
    balance roundrobin
    option  httpchk GET /
    http-check expect status 200
    server  srv1 <IP_BACKEND_1>:<PORTA_BACKEND> check
    server  srv2 <IP_BACKEND_2>:<PORTA_BACKEND> check
```

---

### Modelo 3 — HTTP + HTTPS com redirect automático

```haproxy
frontend http-frontend
    bind *:80
    # Redireciona todo tráfego HTTP para HTTPS
    http-request redirect scheme https code 301

frontend https-frontend
    bind *:443 ssl crt /etc/haproxy/certs/<CERT_PEM>
    http-request set-header X-Forwarded-Proto https
    default_backend <APLICACAO>-backend

backend <APLICACAO>-backend
    balance roundrobin
    option  httpchk GET /
    server  srv1 <IP_BACKEND_1>:<PORTA_BACKEND> check
    server  srv2 <IP_BACKEND_2>:<PORTA_BACKEND> check
```

---

### Modelo 4 — Roteamento por domínio (múltiplas aplicações)

Equivalente ao VirtualHost do Apache/Nginx — um único frontend roteia para backends diferentes baseado no domínio.

```haproxy
frontend https-frontend
    bind *:443 ssl crt /etc/haproxy/certs/<CERT_PEM>
    http-request set-header X-Forwarded-Proto https

    # ACLs por domínio
    acl is_app_a  hdr(host) -i app-a.exemplo.com.br
    acl is_app_b  hdr(host) -i app-b.exemplo.com.br
    acl is_api    hdr(host) -i api.exemplo.com.br

    # Roteamento
    use_backend backend-app-a if is_app_a
    use_backend backend-app-b if is_app_b
    use_backend backend-api   if is_api

    default_backend backend-app-a

backend backend-app-a
    balance roundrobin
    option  httpchk GET /health
    server  srv1 <IP_BACKEND_1>:<PORTA_BACKEND> check
    server  srv2 <IP_BACKEND_2>:<PORTA_BACKEND> check

backend backend-app-b
    balance roundrobin
    option  httpchk GET /health
    server  srv1 <IP_BACKEND_3>:<PORTA_BACKEND> check

backend backend-api
    balance leastconn
    option  httpchk GET /api/health
    server  srv1 <IP_BACKEND_1>:<PORTA_BACKEND> check
    server  srv2 <IP_BACKEND_2>:<PORTA_BACKEND> check
```

---

### Modelo 5 — Proxy TCP puro (Layer 4)

Usado para balancear conexões TCP sem inspecionar o conteúdo HTTP — útil para bancos de dados, SMTP, SSH, ou qualquer protocolo não-HTTP.

```haproxy
frontend <APLICACAO>-tcp-frontend
    bind *:<PORTA_BACKEND>
    mode tcp
    option tcplog
    default_backend <APLICACAO>-tcp-backend

backend <APLICACAO>-tcp-backend
    mode tcp
    balance roundrobin
    option  tcp-check
    server  srv1 <IP_BACKEND_1>:<PORTA_BACKEND> check
    server  srv2 <IP_BACKEND_2>:<PORTA_BACKEND> check
    server  srv3 <IP_BACKEND_3>:<PORTA_BACKEND> check
```

---

### Modelo 6 — Algoritmos de balanceamento

```haproxy
backend <APLICACAO>-backend

    # Round-robin (padrão) — distribui sequencialmente
    balance roundrobin

    # Least connections — encaminha para o servidor com menos conexões ativas
    # balance leastconn

    # Source — sticky session por IP do cliente (equivalente ao ip_hash do Nginx)
    # balance source

    # URI — mesmo URI sempre vai para o mesmo backend (útil para cache)
    # balance uri

    server srv1 <IP_BACKEND_1>:<PORTA_BACKEND> check weight 1
    server srv2 <IP_BACKEND_2>:<PORTA_BACKEND> check weight 2   # recebe o dobro de requisições
    server srv3 <IP_BACKEND_3>:<PORTA_BACKEND> check weight 1 backup  # só usado se os outros caírem
```

---

### Modelo 7 — Health Check avançado

```haproxy
backend <APLICACAO>-backend
    balance roundrobin

    # Health check HTTP com path e status esperado
    option  httpchk GET /health HTTP/1.1\r\nHost:\ <DOMINIO>
    http-check expect status 200

    # Intervalo e thresholds do health check
    # check inter 2s   → verifica a cada 2 segundos
    # rise 2           → considera healthy após 2 checks OK
    # fall 3           → considera unhealthy após 3 checks falhos

    server srv1 <IP_BACKEND_1>:<PORTA_BACKEND> check inter 2s rise 2 fall 3
    server srv2 <IP_BACKEND_2>:<PORTA_BACKEND> check inter 2s rise 2 fall 3
```

---

### Modelo 8 — Restringir acesso por IP via ACL

```haproxy
frontend <APLICACAO>-frontend
    bind *:80

    # Definir ACL de IPs permitidos
    acl rede_interna src 10.0.0.0/8
    acl rede_interna src 192.168.1.0/24

    # Bloquear quem não está na rede interna
    http-request deny if !rede_interna

    default_backend <APLICACAO>-backend

backend <APLICACAO>-backend
    balance roundrobin
    server srv1 <IP_BACKEND_1>:<PORTA_BACKEND> check
```

---

### Modelo 9 — Página de estatísticas (Stats)

O HAProxy possui uma página web nativa de monitoramento em tempo real.

```haproxy
frontend stats
    bind *:<PORTA_STATS>
    stats enable
    stats uri /stats
    stats realm HAProxy\ Statistics
    stats auth <STATS_USER>:<STATS_PASS>
    stats refresh 10s
    stats show-legends
    stats show-node
```

Acesse em: `http://<IP_SERVIDOR>:<PORTA_STATS>/stats`

---

### Ativar e testar HAProxy

```bash
# Instalar HAProxy
sudo apt install haproxy -y

# Testar configuração (sempre antes de reload)
sudo haproxy -c -f /etc/haproxy/haproxy.cfg

# Iniciar
sudo systemctl start haproxy

# Recarregar sem derrubar conexões ativas
sudo systemctl reload haproxy

# Verificar status
sudo systemctl status haproxy

# Habilitar no boot
sudo systemctl enable haproxy
```

---

### Parâmetros HAProxy importantes

| Parâmetro               | Descrição                                                      |
| :---------------------- | :------------------------------------------------------------- |
| `bind`                  | IP e porta onde o frontend escuta                              |
| `mode http`             | Proxy camada 7 (inspeciona HTTP)                               |
| `mode tcp`              | Proxy camada 4 (TCP puro, sem inspecionar conteúdo)            |
| `balance roundrobin`    | Distribui requisições sequencialmente                          |
| `balance leastconn`     | Encaminha para o servidor com menos conexões                   |
| `balance source`        | Sticky session por IP do cliente                               |
| `option httpchk`        | Ativa health check HTTP                                        |
| `http-check expect`     | Define o status HTTP esperado no health check                  |
| `check inter`           | Intervalo entre health checks                                  |
| `rise`                  | Quantidade de checks OK para considerar servidor healthy       |
| `fall`                  | Quantidade de checks falhos para considerar servidor unhealthy |
| `weight`                | Peso do servidor no balanceamento                              |
| `backup`                | Servidor usado apenas quando os principais estão fora          |
| `acl`                   | Define uma condição para roteamento                            |
| `use_backend`           | Roteia para um backend baseado em ACL                          |
| `http-request redirect` | Redireciona requisições HTTP                                   |
| `http-request deny`     | Bloqueia requisições que atendem a uma ACL                     |
| `forwardfor`            | Adiciona header `X-Forwarded-For` com IP do cliente            |

---

### Comandos de diagnóstico HAProxy

```bash
# Verificar sintaxe da configuração
sudo haproxy -c -f /etc/haproxy/haproxy.cfg

# Verificar status e conexões ativas
sudo systemctl status haproxy

# Logs em tempo real
sudo tail -f /var/log/haproxy.log

# Acessar socket de administração
sudo socat stdio /run/haproxy/admin.sock

# Listar backends e status dos servidores via socket
echo "show stat" | sudo socat stdio /run/haproxy/admin.sock | cut -d',' -f1,2,18,19

# Verificar portas em uso
ss -tlnp | grep haproxy

# Testar acesso direto ao backend
curl http://<IP_BACKEND>:<PORTA_BACKEND>
```

---

### Troubleshooting HAProxy

#### Servidor marcado como DOWN mesmo estando ativo

**Causa comum:** Health check falhando — path errado, status HTTP diferente do esperado ou timeout.

```bash
# Verificar logs do health check
tail -f /var/log/haproxy.log | grep "Server"

# Testar o health check manualmente
curl -I http://<IP_BACKEND>:<PORTA_BACKEND>/health
```

Ajustar o path e o status esperado:
```haproxy
option  httpchk GET /
http-check expect status 200
```

#### Erro ao carregar certificado SSL

**Causa:** Certificado e chave privada não estão no mesmo arquivo `.pem`, ou permissões incorretas.

```bash
# Gerar o .pem correto
cat <CERTIFICADO>.crt <INTERMEDIARIO>.crt <CHAVE_PRIVADA>.key > /etc/haproxy/certs/<CERT_PEM>
chmod 600 /etc/haproxy/certs/<CERT_PEM>

# Testar configuração
sudo haproxy -c -f /etc/haproxy/haproxy.cfg
```

#### 503 Service Unavailable

**Causa:** Todos os servidores do backend estão marcados como DOWN.

```bash
# Verificar status dos servidores
echo "show stat" | sudo socat stdio /run/haproxy/admin.sock | cut -d',' -f1,2,18,19

# Verificar logs
tail -f /var/log/haproxy.log
```

#### HAProxy não recarrega (reload falha)

**Causa:** Erro de sintaxe na configuração.

```bash
# Sempre testar antes de recarregar
sudo haproxy -c -f /etc/haproxy/haproxy.cfg

# Ver erro detalhado
sudo haproxy -c -f /etc/haproxy/haproxy.cfg 2>&1
```

---

## Comandos de diagnóstico

### Apache

```bash
# Verificar sintaxe
sudo apache2ctl configtest

# Listar VirtualHosts ativos com portas e IPs
sudo apache2ctl -S

# Verificar módulos ativos
sudo apache2ctl -M

# Logs em tempo real
sudo tail -f /var/log/apache2/error.log
sudo tail -f /var/log/apache2/access.log

# Verificar se Apache está escutando nas portas
ss -tlnp | grep apache2

# Testar acesso com header Host específico
curl -H "Host: <DOMINIO>" http://127.0.0.1
```

### Nginx

```bash
# Verificar sintaxe
sudo nginx -t

# Dump de toda a configuração compilada
sudo nginx -T

# Logs em tempo real
sudo tail -f /var/log/nginx/error.log
sudo tail -f /var/log/nginx/<APLICACAO>-error.log

# Verificar se Nginx está escutando nas portas
ss -tlnp | grep nginx

# Testar acesso com header Host específico
curl -H "Host: <DOMINIO>" http://127.0.0.1

# Verificar versão e módulos compilados
nginx -V
```

---

## Troubleshooting

### Apache — 403 Forbidden

**Causa comum:** Permissão negada no `DocumentRoot` ou diretiva `Require` bloqueando.

```bash
# Verificar permissões do diretório
ls -la /var/www/<APLICACAO>

# Verificar logs
tail -f /var/log/apache2/error-<APLICACAO>.log
```

Corrigir permissões:
```bash
sudo chown -R www-data:www-data /var/www/<APLICACAO>
sudo chmod -R 755 /var/www/<APLICACAO>
```

### Apache — 502 Bad Gateway

**Causa comum:** Backend inacessível ou `mod_proxy` não carregado.

```bash
# Verificar se mod_proxy está ativo
sudo apache2ctl -M | grep proxy

# Testar acesso direto ao backend
curl http://<IP_BACKEND>:<PORTA_BACKEND>
```

### Apache — VirtualHost errado sendo servido

**Causa:** Múltiplos VirtualHosts e o Apache está servindo o primeiro da lista.

```bash
# Listar todos os VirtualHosts e identificar conflito
sudo apache2ctl -S
```

O primeiro VirtualHost na porta é o default. Garanta que cada `ServerName` seja único.

### Nginx — 502 Bad Gateway

**Causa comum:** Backend inacessível, timeout ou `proxy_pass` apontando para endereço errado.

```bash
# Verificar logs
tail -f /var/log/nginx/<APLICACAO>-error.log

# Testar acesso direto ao backend
curl http://<IP_BACKEND>:<PORTA_BACKEND>

# Verificar se o upstream resolve
nginx -T | grep upstream
```

### Nginx — SSL: no shared cipher / protocolo incompatível

**Causa:** Backend ou cliente usando TLS em versão incompatível.

```nginx
# Adicionar no server block para forçar TLS 1.2+
ssl_protocols TLSv1.2 TLSv1.3;
ssl_ciphers   HIGH:!aNULL:!MD5;
```

### Nginx — rewrite loop (redirect infinito)

**Causa:** `return 301` em um server block que também serve HTTPS.

Verificar se o redirect HTTP→HTTPS está em um `server` block separado, escutando apenas na porta 80.

---

## Referências

- [Apache — mod_proxy](https://httpd.apache.org/docs/2.4/mod/mod_proxy.html)
- [Apache — VirtualHost](https://httpd.apache.org/docs/2.4/vhosts/)
- [Apache — mod_ssl](https://httpd.apache.org/docs/2.4/mod/mod_ssl.html)
- [Apache — mod_rewrite](https://httpd.apache.org/docs/2.4/mod/mod_rewrite.html)
- [Nginx — ngx_http_proxy_module](https://nginx.org/en/docs/http/ngx_http_proxy_module.html)
- [Nginx — server blocks](https://nginx.org/en/docs/http/server_names.html)
- [Nginx — upstream](https://nginx.org/en/docs/http/ngx_http_upstream_module.html)
- [HAProxy — Configuration Manual](https://docs.haproxy.org/2.8/configuration.html)
- [HAProxy — Starter Guide](https://docs.haproxy.org/2.8/intro.html)
- [HAProxy — ACL](https://docs.haproxy.org/2.8/configuration.html#7)

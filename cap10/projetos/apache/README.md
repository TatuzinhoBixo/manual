# DevOps Toolkit

Ferramenta web completa para DevOps com calculadora de recursos Kubernetes, gerador de manifestos YAML, conversor YAML/JSON e encoder Base64.

## Funcionalidades

### 1. Calculadora de Recursos Kubernetes
- Conversor de unidades de memória (bytes, Ki, Mi, Gi, Ti, KB, MB, GB)
- Conversor de unidades de CPU (millicores, cores)
- Calculadora de recursos totais por réplicas
- Estimador de custos (AWS/GCP/Azure referência)

### 2. Gerador de Manifestos YAML
- Deployment
- Service (ClusterIP, NodePort, LoadBalancer)
- Ingress (com suporte a TLS)
- ConfigMap
- Secret
- HPA (Horizontal Pod Autoscaler)
- Labels e variáveis de ambiente customizáveis

### 3. Conversor YAML ↔ JSON
- Conversão bidirecional
- Validação de sintaxe
- Formatação automática

### 4. Encoder/Decoder Base64
- Encode/decode de texto
- Gerador de Kubernetes Secrets
- Múltiplos campos por Secret

## Deploy no Apache

### Pré-requisitos
- Apache 2.4+
- Módulos: `mod_rewrite` (opcional)

### Instalação

#### Opção 1: Diretório padrão
```bash
# Copiar arquivos para o DocumentRoot do Apache
sudo cp -r * /var/www/html/devops-toolkit/

# Ajustar permissões
sudo chown -R www-data:www-data /var/www/html/devops-toolkit/
sudo chmod -R 755 /var/www/html/devops-toolkit/
```

#### Opção 2: VirtualHost dedicado
```bash
# Criar diretório
sudo mkdir -p /var/www/devops-toolkit

# Copiar arquivos
sudo cp -r * /var/www/devops-toolkit/

# Ajustar permissões
sudo chown -R www-data:www-data /var/www/devops-toolkit/
sudo chmod -R 755 /var/www/devops-toolkit/
```

### Configuração do Apache

#### VirtualHost básico
Criar arquivo `/etc/apache2/sites-available/devops-toolkit.conf`:

```apache
<VirtualHost *:80>
    ServerName devops.example.com
    DocumentRoot /var/www/devops-toolkit

    <Directory /var/www/devops-toolkit>
        Options -Indexes +FollowSymLinks
        AllowOverride All
        Require all granted
    </Directory>

    # Cache para assets estáticos
    <FilesMatch "\.(css|js|png|jpg|ico|svg)$">
        Header set Cache-Control "max-age=604800, public"
    </FilesMatch>

    # Compressão
    <IfModule mod_deflate.c>
        AddOutputFilterByType DEFLATE text/html text/css application/javascript
    </IfModule>

    ErrorLog ${APACHE_LOG_DIR}/devops-toolkit-error.log
    CustomLog ${APACHE_LOG_DIR}/devops-toolkit-access.log combined
</VirtualHost>
```

#### Habilitar o site
```bash
# Habilitar módulos necessários
sudo a2enmod headers
sudo a2enmod deflate

# Habilitar site
sudo a2ensite devops-toolkit.conf

# Testar configuração
sudo apache2ctl configtest

# Reiniciar Apache
sudo systemctl reload apache2
```

### Com HTTPS (Recomendado)

```apache
<VirtualHost *:443>
    ServerName devops.example.com
    DocumentRoot /var/www/devops-toolkit

    SSLEngine on
    SSLCertificateFile /etc/letsencrypt/live/devops.example.com/fullchain.pem
    SSLCertificateKeyFile /etc/letsencrypt/live/devops.example.com/privkey.pem

    <Directory /var/www/devops-toolkit>
        Options -Indexes +FollowSymLinks
        AllowOverride All
        Require all granted
    </Directory>

    # Security Headers
    Header always set X-Content-Type-Options "nosniff"
    Header always set X-Frame-Options "SAMEORIGIN"
    Header always set X-XSS-Protection "1; mode=block"
    Header always set Referrer-Policy "strict-origin-when-cross-origin"

    # Cache para assets
    <FilesMatch "\.(css|js|png|jpg|ico|svg)$">
        Header set Cache-Control "max-age=604800, public"
    </FilesMatch>

    <IfModule mod_deflate.c>
        AddOutputFilterByType DEFLATE text/html text/css application/javascript
    </IfModule>

    ErrorLog ${APACHE_LOG_DIR}/devops-toolkit-ssl-error.log
    CustomLog ${APACHE_LOG_DIR}/devops-toolkit-ssl-access.log combined
</VirtualHost>

# Redirect HTTP to HTTPS
<VirtualHost *:80>
    ServerName devops.example.com
    Redirect permanent / https://devops.example.com/
</VirtualHost>
```

## Estrutura de Arquivos

```
devops-toolkit/
├── index.html          # Página principal
├── css/
│   └── style.css       # Estilos (dark/light mode)
├── js/
│   ├── yaml-parser.js  # Parser YAML minimalista
│   └── app.js          # Lógica da aplicação
└── README.md           # Este arquivo
```

## Características Técnicas

- **Zero dependências externas**: Não usa frameworks ou bibliotecas externas
- **Mobile-first**: Design responsivo para qualquer dispositivo
- **Dark mode**: Tema escuro por padrão (preferência de DevOps)
- **LocalStorage**: Persistência de configurações e tema
- **Export/Import**: Backup e restauração de dados
- **Offline**: Funciona 100% sem internet após carregamento inicial

## Browser Support

- Chrome 80+
- Firefox 75+
- Safari 13+
- Edge 80+

## Licença

MIT License - Use livremente em projetos pessoais e comerciais.

---

Feito com ☕ para DevOps

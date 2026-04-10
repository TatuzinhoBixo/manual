Instalar o Wordpress no OS

Instalar o apache2
```bash
sudo apt update
sudo apt install apache2
```

Instalar o php
```bash
sudo apt install php libapache2-mod-php php-mysql php-cli php-curl php-gd php-intl php-mbstring php-xml php-zip
```

Baixar e configurar o wordpress
```bash
cd /tmp
wget -c http://wordpress.org/latest.tar.gz
```

Permissões de pastas
```bash
sudo chown -R www-data:www-data /var/www/tatu-lab.com.br/
sudo find /var/www/tatu-lab.com.br/ -type d -exec chmod 755 {} \;
sudo find /var/www/tatu-lab.com.br/ -type f -exec chmod 644 {} \;
```

Modelo de virtualHost para o site
```bash
sudo vim /etc/apache2/sites-available/tatu-lab.com.br.conf
```

Conteúdo do site.conf
```yaml
<VirtualHost *:80>
    ServerName tatu-lab.com.br
    ServerAlias www.tatu-lab.com.br
    DocumentRoot /var/www/tatu-lab.com.br

    # Redirecionamento para HTTPS
    RewriteEngine On
    RewriteCond %{HTTPS} off
    RewriteRule ^ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]

    ErrorLog ${APACHE_LOG_DIR}/tatu-lab.com.br-error.log
    CustomLog ${APACHE_LOG_DIR}/tatu-lab.com.br-access.log combined
</VirtualHost>

<VirtualHost *:443>
    ServerName tatu-lab.com.br
    ServerAlias www.tatu-lab.com.br
    DocumentRoot /var/www/tatu-lab.com.br

    ErrorLog ${APACHE_LOG_DIR}/tatu-lab.com.br-ssl-error.log
    CustomLog ${APACHE_LOG_DIR}/tatu-lab.com.br-ssl-access.log combined

    # Inclua aqui os caminhos para seus arquivos de certificado digital!
    SSLEngine on
    SSLCertificateFile    /caminho/para/seu/certificado/tatu-lab.com.br.crt 
    SSLCertificateKeyFile /caminho/para/sua/chave/tatu-lab.com.br.key
    # Se tiver um arquivo de CA bundle:
    # SSLCertificateChainFile /caminho/para/seu/certificado/chain.crt

    <Directory /var/www/tatu-lab.com.br/>
        Options FollowSymLinks
        AllowOverride All
        Require all granted
    </Directory>
</VirtualHost>
```

Ativar o site e módulos
```bash
sudo a2ensite tatu-lab.com.br.conf
sudo a2enmod rewrite
sudo a2enmod ssl
sudo a2dissite 000-default.conf # Desabilita a página padrão do Apache
```

Teste se está tudo bem
```bash
sudo apache2ctl configtest
sudo systemctl restart apache2
```

Configurar o wp-config.php
```bash
cd /var/www/tatu-lab.com.br
cp wp-config-sample.php wp-config.php
```

Editar o wp-config.php
```yaml
define( 'DB_NAME', 'nome_do_seu_banco' );
define( 'DB_USER', 'usuario_do_banco' );
define( 'DB_PASSWORD', 'sua_senha_secreta' );
define( 'DB_HOST', 'localhost' ); // Ou o IP/nome do host, se for externo
```


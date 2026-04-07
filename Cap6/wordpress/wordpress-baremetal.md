# WordPress - Instalação em Servidor Bare-Metal

## Descrição

Guia para instalação do WordPress diretamente em servidor Linux (sem Kubernetes). Use esta abordagem para ambientes mais simples ou quando não há necessidade de orquestração de containers.

## Pré-requisitos

- Servidor Linux (Debian/Ubuntu ou RHEL/CentOS)
- Servidor web (Apache ou Nginx) instalado
- PHP 7.4+ com extensões necessárias
- Banco de dados MariaDB/MySQL acessível

## Variáveis de Configuração

| Variável | Descrição | Exemplo |
|:---------|:----------|:--------|
| `<DB_NAME>` | Nome do banco de dados | wordpress |
| `<DB_USER>` | Usuário do banco | wpuser |
| `<DB_PASSWORD>` | Senha do banco | (senha forte) |
| `<DB_HOST>` | Endereço do banco | localhost |

---

## Etapa 1: Baixar WordPress

```bash
cd /tmp
wget https://wordpress.org/latest.tar.gz
tar -xzvf latest.tar.gz
```

---

## Etapa 2: Mover Arquivos

```bash
sudo mv /tmp/wordpress/* /var/www/html/
```

---

## Etapa 3: Configurar Banco de Dados

```bash
sudo cp /var/www/html/wp-config-sample.php /var/www/html/wp-config.php
sudo vim /var/www/html/wp-config.php
```

Edite as seguintes linhas:

```php
/** O nome do banco de dados do WordPress */
define( 'DB_NAME', '<DB_NAME>' );

/** Usuário do banco de dados MySQL */
define( 'DB_USER', '<DB_USER>' );

/** Senha do banco de dados MySQL */
define( 'DB_PASSWORD', '<DB_PASSWORD>' );

/** Endereço do servidor de banco de dados */
define( 'DB_HOST', '<DB_HOST>' );
```

---

## Etapa 4: Configurar Permissões

```bash
sudo chown -R www-data:www-data /var/www/html/
sudo find /var/www/html/ -type d -exec chmod 755 {} \;
sudo find /var/www/html/ -type f -exec chmod 644 {} \;
```

---

## Etapa 5: Finalizar Instalação

Acesse o WordPress pelo navegador e siga o assistente de instalação:

```
http://<IP_SERVIDOR>/wp-admin/install.php
```

---

## Referências

- [Instalação WordPress](https://wordpress.org/documentation/article/how-to-install-wordpress/)
- [Requisitos do WordPress](https://wordpress.org/about/requirements/)

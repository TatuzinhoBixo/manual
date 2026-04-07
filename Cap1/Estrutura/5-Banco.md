# Instalação do MySQL

## Descrição

Este documento detalha a instalação e configuração do MySQL Server em uma VM dedicada. O banco de dados será utilizado pelas aplicações do cluster Kubernetes.

## Variáveis de Configuração

| Variável | Descrição | Exemplo |
|:---------|:----------|:--------|
| `<REDE_INTERNA>` | Range de IPs da rede interna | 192.168.1.% |
| `<SENHA_ROOT>` | Senha do usuário root | (usar senha forte) |
| `<NOME_BANCO>` | Nome do banco de dados | wordpress |
| `<USUARIO_APP>` | Usuário da aplicação | app_user |
| `<SENHA_USUARIO>` | Senha do usuário | (usar senha forte) |

> **Segurança**: Nunca utilize senhas hardcoded em documentação ou código. Use gerenciadores de secrets ou variáveis de ambiente.

---

## Etapa 1: Instalação

```bash
sudo apt update
sudo apt install -y mysql-server mysql-client
sudo systemctl start mysql.service
sudo systemctl enable mysql.service
```

---

## Etapa 2: Configurar Senha do Root

```bash
sudo mysql

# Definir senha do root
ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY '<SENHA_ROOT>';
FLUSH PRIVILEGES;
exit;
```

---

## Etapa 3: Criar Banco de Dados e Usuário

```bash
mysql -u root -p

# Criar banco de dados
CREATE DATABASE <NOME_BANCO> CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

# Criar usuário para acesso local
CREATE USER '<USUARIO_APP>'@'localhost' IDENTIFIED BY '<SENHA_USUARIO>';

# Criar usuário para acesso remoto (da rede interna)
CREATE USER '<USUARIO_APP>'@'<REDE_INTERNA>' IDENTIFIED BY '<SENHA_USUARIO>';

# Conceder permissões
GRANT ALL PRIVILEGES ON <NOME_BANCO>.* TO '<USUARIO_APP>'@'localhost';
GRANT ALL PRIVILEGES ON <NOME_BANCO>.* TO '<USUARIO_APP>'@'<REDE_INTERNA>';

FLUSH PRIVILEGES;
exit;
```

---

## Etapa 4: Habilitar Acesso Remoto

Edite o arquivo de configuração:

```bash
sudo vim /etc/mysql/mysql.conf.d/mysqld.cnf
```

Altere as seguintes linhas:

```ini
bind-address            = 0.0.0.0
mysqlx-bind-address     = 0.0.0.0
```

Reinicie o serviço:

```bash
sudo systemctl restart mysql
```

---

## Etapa 5: Testar Conexão

### Local

```bash
mysql -u <USUARIO_APP> -p
```

### Remoto (de outra VM)

```bash
mysql -h <IP_SERVIDOR_MYSQL> -u <USUARIO_APP> -p
```

---

## Observações de Segurança

> **Acesso Remoto**: O `bind-address = 0.0.0.0` permite conexões de qualquer IP. Em produção, considere:
> - Usar firewall para restringir acesso apenas à rede do cluster
> - Configurar SSL/TLS para conexões
> - Usar usuários com permissões mínimas necessárias

> **Backup**: Configure backups regulares do banco de dados usando `mysqldump` ou ferramentas como Velero (para Kubernetes).

## Referências

- [Documentação MySQL](https://dev.mysql.com/doc/)
- [MySQL Security Best Practices](https://dev.mysql.com/doc/refman/8.0/en/security.html)

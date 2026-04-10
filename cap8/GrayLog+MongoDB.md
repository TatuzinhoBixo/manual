## Instalação do Graylog com MongoDB e Elasticsearch

Procedimento para instalar o stack de logs centralizado Graylog.

### Pré-requisitos

```bash
apt-get install apt-transport-https uuid-runtime pwgen openjdk-11-jdk gnupg wget
```

### 1. Instalar MongoDB

```bash
wget -qO - https://www.mongodb.org/static/pgp/server-5.0.asc | apt-key add -
echo "deb http://repo.mongodb.org/apt/debian buster/mongodb-org/5.0 main" | tee /etc/apt/sources.list.d/mongodb-org-5.0.list
apt update
apt install mongodb-org -y
systemctl start mongod
systemctl enable mongod
systemctl status mongod
```

### 2. Instalar Elasticsearch

```bash
wget -qO - https://artifacts.elastic.co/GPG-KEY-elasticsearch | apt-key add -
apt-get install apt-transport-https
echo "deb https://artifacts.elastic.co/packages/7.x/apt stable main" | tee /etc/apt/sources.list.d/elastic-7.x.list
apt-get update && apt-get install elasticsearch
systemctl start elasticsearch
systemctl enable elasticsearch
```

#### Configuração Elasticsearch

Editar `/etc/elasticsearch/elasticsearch.yml`:

- Descomentar e configurar o nome do cluster
- Adicionar no final: `action.auto_create_index: false`

```bash
systemctl daemon-reload
systemctl restart elasticsearch
```

### 3. Instalar Graylog

```bash
wget https://packages.graylog2.org/repo/packages/graylog-4.0-repository_latest.deb
dpkg -i graylog-4.0-repository_latest.deb
apt-get update
apt-get install graylog-server
systemctl enable graylog-server
```

#### Configuração Graylog

Editar `/etc/graylog/server/server.conf`:

Gerar password_secret:
```bash
pwgen -N 1 -s 96
```

Gerar root_password_sha2:
```bash
echo -n "<sua-senha>" | sha256sum | cut -d " " -f1
```

Configurar no arquivo:
```
password_secret = <hash-gerado>
root_password_sha2 = <hash-senha>
root_timezone = America/Manaus
http_bind_address = <ip-servidor>:9000
```

Iniciar o serviço:
```bash
systemctl enable graylog-server.service
systemctl start graylog-server.service
```

### 4. Configurar Rsyslog nos Clientes

Adicionar ao `/etc/rsyslog.conf`:

```
*.* @<ip-graylog>:1514;RSYSLOG_SyslogProtocol23Format
```

### 5. Acessar Interface Web

URL: `http://<ip-servidor>:9000`

Configurar Input:
- System/Inputs → Syslog UDP
- Bind Address: `0.0.0.0`
- Port: `1514`
- Allow overriding date: ✓

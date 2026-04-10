# Instalação do Zabbix 4.0, Mysql e Nginx / OS. CentOS7

yum update
rpm -Uvh https://repo.zabbix.com/zabbix/4.0/rhel/7/x86_64/zabbix-release-4.0-2.el7.noarch.rpm
yum clean all
yum install zabbix-server-mysql zabbix-web-mysql zabbix-nginx-conf zabbix-agent nginx

# Instala Mysql
yum install mysql mysql-server 
#No centos7
yum install mariadb mariadb-server -y; systemctl start mariadb
systemctl start mariadb # Iniciar o serviço
systemctl enable mariadb

# Configuração das tabelas MYSQL
mysql -uroot -p #não precisa de senha no momento
create database zabbixdb character set utf8 collate utf8_bin;
create user 'zabbix'@'localhost' IDENTIFIED WITH mysql_native_password BY 'password';

# outra forma de criar usuário: 
CREATE USER 'zabbix'@'localhost' IDENTIFIED BY 'minhasenha';

grant all on zabbixdb.* to 'zabbix'@'localhost';
FLUSH PRIVILEGES;
quit;

# Adicional verificar os usuários do mysql
SELECT user FROM mysql.user;

#Importar as tabelas Zabbix
zcat /usr/share/doc/zabbix-server-mysql*/create.sql.gz | mysql -uzabbix -p zabbixdb

# Configuração de arquivos
# Edit file /etc/zabbix/zabbix_server.conf 
DBPassword=minhasenha
DBName=zabbixdb
#Edit file /etc/nginx/conf.d/zabbix.conf, uncomment and set 'listen' and 'server_name' directives.
listen 80;
server_name <IP SERVIDOR>;
#Edit file  /etc/httpd/conf.d/zabbix.conf, uncomment and set the right timezone for you. 
; php_value[date.timezone] = America/Manaus
#Start Zabbix server and agent processes and make it start at system boot.
systemctl restart zabbix-server zabbix-agent httpd 
systemctl enable zabbix-server zabbix-agent httpd

# Entrar na página <ip> e configurar o password e acessar a págiana
# login Admin
# senha zabbix

# MIGRAÇÃO ZABBIX PARA UMA OUTRA VERSÃO
# Configuração de uma versão superior em outro servidor
# Backup e Restore do banco, feito de preferência em um servidor clonado

# Script Backup
# !/bin/sh
# BACKUP DO SCHEMA E BANCO DE DADOS ZABBIX (IGNORANDO AS MAIORES TABELAS)
DBNAME=zabbix
DBUSER=zabbix
DBPASS=zabbixpwd
BK_DEST=/opt
###REALIZANDO BACKUP SOMENTE DO SCHEMA DO BANCO###
sudo mysqldump --no-data --single-transaction -u$DBUSER -p"$DBPASS" "$DBNAME" | /bin/gzip > "$BK_DEST/$DBNAME-`date +%Y-%m-%d`-schema.sql.gz"
##REALIZANDO BACKUP DO BANCO ZABBIX IGNORANDO AS MAIORES TABELAS###
sudo mysqldump -u"$DBUSER"  -p"$DBPASS" "$DBNAME" --single-transaction --skip-lock-tables --no-create-info --no-create-db \
    | /bin/gzip > "$BK_DEST/$DBNAME-`date +%Y-%m-%d`-config.sql.gz"

# Comando para restaurar o Banco
mysql_dump -uroot -p zabbix > zabix.sql restore - mysql -urrot -p zabbix <zabbix.sql












#Caso seja uma migração da versão 3.x para uma 4.x, será preciso converter as tabelas
#SCRIPT
#!/bin/bash
# mycollate.sh <database> [<charset> <collation>]
# changes MySQL/MariaDB charset and collation for one database - all tables and
# all columns in all tables
DB="$1"
CHARSET="$2"
COLL="$3"
[ -n "$DB" ] || exit 1
[ -n "$CHARSET" ] || CHARSET="utf8"
[ -n "$COLL" ] || COLL="utf8_bin"
echo $DB
echo "USE $DB; SHOW TABLES;" | mysql -s -uroot -pSenhas@@?0| (
while read TABLE; do
echo $DB.$TABLE
echo "ALTER TABLE $TABLE CONVERT TO CHARACTER SET $CHARSET COLLATE $COLL;" | mysql -uroot -pSenhas@@?0 $DB
done
)
#Alterar a forma de armazenamento das tabelas, conforme o arquivo em /etc/mysql/conf/myserver.cnf








#Instalação e configuração do Grafana
dnf install wget
#pode alterar de acordo com a versão
wget https://dl.grafana.com/oss/release/grafana-6.7.2-1.x86_64.rpm
yum install grafana-6.7.2-1.x86_64.rpm
systemctl enable grafana-server
systemctl start grafana-server
#Pela url do <ip>:3000 alteirar a senha e acessar o pagina do grafana
#login admin
#login admin

#Instalar Plugin Zabbix
grafana-cli plugins install alexanderzobnin-zabbix-app
systemctl restart grafana-serve

#configurar url do plugin e incluir a senha
#capo URL: http://<ip>/api_jsonrpc.php
#Access: Browser
#Adicionar o login e senha do zabbix
#Escolher a versão do Zabbix
#O banco de informações caso já exista outro grafana, está no caminho /var/lib/grafana/grafana.db. É preciso apenas transferência do arquivo preservando as permissões










#Instalação do Zabbix na função de proxy

#Baixar o repositório no site da Zabbix
rpm -Uvh https://repo.zabbix.com/zabbix/4.0/rhel/7/x86_64/zabbix-release-4.0-1.el8.noarch.rpm

#Instalar e configurar o Mysql, nas mesmas configurações sugeridas na instalação do Zabbix principal

#Configuração de arquivos
#Edit file /etc/zabbix/zabbix_proxy.conf
Server=<ip do zabbix principal>
Hostname=<nome do servidor>
DBName=zabbix_proxy
DBUser=zabbix_proxy
DBPassword=password

#Edit file /etc/zabbix/zabbix_agentd.conf
Server=<ip servidor>
Hostname=<noem>

#cadastrar o zabbix-proxy na pagina do zabbix em "adminsitração / proxy"

#Caso o zabbix ou o proxy não suba, o motivo pode ser o limite de conexões, no caso o Mario fez as alterações
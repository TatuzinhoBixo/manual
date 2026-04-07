# Criação de um banco de dados com proxysql

Namespace utilizado
namespace

```bash
kubectl create ns mariadb
```

## Prepaparação do cluster

Necessário instalar o prometheus antes para que o operator funcione
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

CRDs

```bash
helm repo add mariadb-operator https://mariadb-operator.github.io/mariadb-operator
helm repo update
helm install mariadb-operator-crds mariadb-operator/mariadb-operator-crds \
  --namespace mariadb-system --create-namespace
```

Verifica se deu tudo certo

```bash
kubectl get crd | grep mariadb
```

Instalção do operator do mariadb

```bash
helm repo add mariadb-operator https://helm.mariadb.com/mariadb-operator
helm repo update
helm install mariadb-operator mariadb-operator/mariadb-operator \
  --namespace mariadb-system --create-namespace \
  --set metrics.enabled=true
```

Para saber se tudo ocorreu bem com o operator

```bash
kubectl get pods -n mariadb-system
kubectl logs -n mariadb -l app.kubernetes.io/name=mariadb-operator --tail=50
```

Namespaces criados

```bash
kubectl get ns | grep mariadb
```

Pods do operator saudáveis

```bash
kubectl get pods -n mariadb
```

CRDs presentes

```bash
kubectl get crd | grep mariadb
```

Operator rodando sem crash

```bash
kubectl get pods -n mariadb
```

## Instalação do banco de dados

Secret para o mariadb
arquivo mariadb-secret.yaml

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: mariadb-secrets
  namespace: mariadb
type: Opaque
stringData:
  rootPassword: "SenhaForte123!"
  replicationPassword: "Replic@123"
  mariadbPassword: "AppP@ss"
```

Manifesto do mariadb-galera
arquivo mariadb-galera.yaml

```yaml
apiVersion: k8s.mariadb.com/v1alpha1
kind: MariaDB
metadata:
  name: mariadb-galera
  namespace: mariadb
spec:
  rootPasswordSecretKeyRef:
    name: mariadb-secrets
    key: rootPassword

  replicas: 3
  galera:
    enabled: true

  storage:
    size: 10Gi
    storageClassName: longhorn

  affinity:
    podAntiAffinity:
      preferredDuringSchedulingIgnoredDuringExecution:
        - weight: 100
          podAffinityTerm:
            labelSelector:
              matchLabels:
                app.kubernetes.io/name: mariadb
            topologyKey: kubernetes.io/hostname

  # <-- resources corretamente posicionados (top-level)
  resources:
    requests:
      cpu: "1"
      memory: "1Gi"
    limits:
      cpu: "2"
      memory: "2Gi"
```

Manifesto do serviço
mariadb-serviceyaml

```yaml
apiVersion: v1
kind: Service
metadata:
  name: mariadb-galera-lb
  namespace: mariadb
spec:
  type: LoadBalancer
  loadBalancerIP: 192.168.1.75   # IP fixo
  selector:
    app.kubernetes.io/name: mariadb
  ports:
    - port: 3306
      targetPort: 3306
      protocol: TCP
```

Comando para verificar os recursos aplicados, ns mariadb

```bash
kubectl get statefulset mariadb-galera -n mariadb -o jsonpath='{range .spec.template.spec.containers[*]}{.name}{"\n"}Requests: cpu=''{.resources.requests.cpu}'' mem=''{.resources.requests.memory}''\nLimits: cpu=''{.resources.limits.cpu}'' mem=''{.resources.limits.memory}''\n\n{end}'
```

Instalação do proxysql
proxysql.yaml

```yaml
apiVersion: apps/v1
kind: Deployment # ALTERADO: Garante 2 réplicas HA
metadata:
  name: proxysql
  namespace: mariadb
spec:
  replicas: 2      # 2 réplicas para Alta Disponibilidade
  selector:
    matchLabels:
      app: proxysql
  template:
    metadata:
      labels:
        app: proxysql
    spec:
      # O InitContainer para apagar o DB foi REMOVIDO para que o Pod
      # não tente apagar algo que não deveria se o volume for persistente,
      # e é inútil com emptyDir.
      containers:
      - name: proxysql
        image: proxysql/proxysql:2.5.5
        imagePullPolicy: IfNotPresent
        command:
        - proxysql
        - -f
        - -c
        - /etc/proxysql.cnf
        ports:
        - name: mysql
          containerPort: 6033
        - name: admin
          containerPort: 6032
        volumeMounts:
        - name: config-volume
          mountPath: /etc/proxysql.cnf
          subPath: proxysql.cnf
          readOnly: true
        - name: datadir
          mountPath: /var/lib/proxysql
      volumes:
      - name: config-volume
        configMap:
          name: proxysql-config
      - name: datadir
        emptyDir: {} # Corrigido: Volume volátil. O ConfigMap é a persistência.
```

Service do proxysql
proxy-service.yaml

```yaml
apiVersion: v1
kind: Service
metadata:
  name: proxysql-lb
  namespace: mariadb
spec:
  type: LoadBalancer
  loadBalancerIP: 10.20.4.50
  selector:
    app: proxysql
  ports:
  - name: mysql-client
    protocol: TCP
    port: 6033
    targetPort: 6033
  - name: proxysql-admin
    protocol: TCP
    port: 6032
    targetPort: 6032
```

## Configuração do proxysql

Criação do usuário monitor no banco de dados mariadb
Fazer o login:

```bash
kubectl exec -it -n mariadb mariadb-galera-0 -- mariadb -u root -p
```

e depois

```bash
CREATE USER 'monitor'@'%' IDENTIFIED BY 'SuaSenhaAqui';
GRANT REPLICATION CLIENT ON *.* TO 'monitor'@'%';
GRANT SELECT ON sys.* TO 'monitor'@'%';
FLUSH PRIVILEGES;
```

Configuração do proxysql
proxysql-config.yaml

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: proxysql-config
  namespace: mariadb
data:
  proxysql.cnf: |
    datadir="/var/lib/proxysql"

    admin_variables=
    {
        admin_credentials="admin:<senhaproxy>"
        mysql_ifaces="0.0.0.0:6032"
        refresh_interval=2000
    }

    mysql_variables=
    {
        threads=8
        max_connections=2048
        interfaces="0.0.0.0:6033"
        monitor_username="usuario_backend"
        monitor_password="<senhaback>"
        monitor_galera_healthcheck_interval=2000
        monitor_galera_healthcheck_timeout=800
        monitor_galera_healthcheck_max_timeout_count=5
    }

    # ================ GALERA HOSTGROUPS (obrigatório) ================
    mysql_galera_hostgroups=
    (
        {
            writer_hostgroup=20
            backup_writer_hostgroup=21
            reader_hostgroup=10
            offline_hostgroup=99
            max_writers=1
            writer_is_also_reader=1
            max_transactions_behind=100
            comment="galera-cluster"
        }
    )

    # ================ SERVIDORES (os 3 nós do StatefulSet) ================
    mysql_servers=
    (
        { address="mariadb-galera-0.mariadb-galera-internal.mariadb.svc.cluster.local", port=3306, hostgroup=10, status="ONLINE", max_connections=1000 },
        { address="mariadb-galera-1.mariadb-galera-internal.mariadb.svc.cluster.local", port=3306, hostgroup=10, status="ONLINE", max_connections=1000 },
        { address="mariadb-galera-2.mariadb-galera-internal.mariadb.svc.cluster.local", port=3306, hostgroup=10, status="ONLINE", max_connections=1000 }
    )

    # ================ USUÁRIOS (só um bloco!) ================
    mysql_users=
    (
        { username="usuario_backend",  password="<senhaback>", default_hostgroup=20, transaction_persistent=1, active=1 },
        { username="usuario_backend",  password="<senhaback>", default_hostgroup=10,  active=1 },  # monitor user
        { username="user1", password="<senhauser1>",      default_hostgroup=20, transaction_persistent=1, active=1 },
        { username="user2", password="<senhauser2>",      default_hostgroup=20, transaction_persistent=1, active=1 },
        { username="user3", password="<senhauser3>",      default_hostgroup=20, transaction_persistent=1, active=1 }
    )

    # ================ REGRAS MÍNIMAS (só fallback) ================
    mysql_query_rules=
    (
        { rule_id=100, active=1, match_pattern=".*", destination_hostgroup=20, apply=1 }
    )
```

## Acesso ao banco de dados

Acesso direto no MariaDB (via socket, sem passar pelo Istio/ProxySQL)

Acesso com o usuário root

```bash
kubectl exec -it mariadb-galera-0 -n mariadb -c mariadb -- mariadb -u root -p'SenhaForte123!' --socket=/run/mysqld/mysqld.sock

Acesso com o usuário root sem precisar digitar a senha
```bash
kubectl exec -it mariadb-galera-0 -n mariadb -c mariadb -- sh -c 'mariadb -u root -p"$MARIADB_ROOT_PASSWORD" --socket=/run/mysqld/mysqld.sock'
``

Acesso com usuário bixo

```bash
kubectl exec -it mariadb-galera-0 -n mariadb -c mariadb -- mariadb -u bixo -p'@Sandlash45$$'
--socket=/run/mysqld/mysqld.sock
```

Acesso com o usuário monitor

```bash
kubectl exec -it mariadb-galera-0 -n mariadb -c mariadb -- mariadb -u monitor -p'SuaSenhaAqui'
--socket=/run/mysqld/mysqld.sock
```

Acesso via ProxySQL (como as aplicações conectam)

Acesso com o usuário bixo
kubectl exec -it proxysql-5558bfc8c8-hx27c -n mariadb -c proxysql -- mysql -u bixo -p'@Sandlash45$$' -h 127.0.0.1 -P 6033

Admin do ProxySQL (porta 6032)

```bash
kubectl exec -it proxysql-5558bfc8c8-hx27c -n mariadb -c proxysql -- mysql -u admin -p'Arreto23' -h 127.0.0.1 -P 6032
```

Comandos adicionais

Entra no mariadb e mostra os bancos existentes

```bash
kubectl exec mariadb-galera-0 -n mariadb -c mariadb -- sh -c 'mariadb -u root -p"$MARIADB_ROOT_PASSWORD" --socket=/run/mysqld/mysqld.sock -e "SHOW DATABASES;"'
```

Teste de conexão

```bash
kubectl exec -it proxysql-5dcdd76d97-5hk8c -n mariadb -c proxysql -- mysql -ubixo -p'@Sandlash45$$' -h 127.0.0.1 -P 6033
```

Para cada mudança no proxysql

```bash
kubectl rollout restart daemonset proxysql -n mariadb
```

### Criação de um banco de dados mysql

login

```bash
kubectl exec -it -n mariadb mariadb-galera-0 -- mariadb -u root -p
```

comandos internos

```bash
CREATE DATABASE bixo;
CREATE USER 'bixo'@'%' IDENTIFIED BY '@Sandlash45$$';
GRANT ALL PRIVILEGES ON bixo.* TO 'bixo'@'%';
FLUSH PRIVILEGES;
```

## Gestão de Permissões e Acesso a Bancos de Dados (MySQL/MariaDB)

Este documento descreve as boas práticas para configuração de hosts, níveis de segurança e comandos essenciais para a gestão de usuários e privilégios.

## 1. Configuração de Host e Níveis de Segurança

A definição do `Host` determina de onde o usuário tem permissão para se conectar ao banco de dados. Quanto mais restrito, maior a segurança.

| Host (Origem)   | Significado                                                        | Nível de Segurança          |
| :-------------- | :----------------------------------------------------------------- | :-------------------------- |
| `%`             | Permite conexão de qualquer endereço IP.                           | **Baixo** (Permissivo)      |
| `localhost`     | Permite conexão apenas da própria máquina onde o banco reside.     | **Alto**                    |
| `192.168.1.100` | Permite conexão apenas de um IP fixo específico.                   | **Muito Alto**              |
| `192.168.1.%`   | Permite conexões de qualquer IP dentro de uma sub-rede específica. | **Médio** (Restrito à rede) |

> **Nota de Arquitetura:** Em ambientes de produção com múltiplos workers, recomenda-se liberar IPs específicos ou utilizar uma estratégia de **Egress/Proxy** para centralizar o tráfego.

---

## 2. Guia de Comandos SQL

### 2.1. Criação e Concessão de Privilégios

Para criar um usuário vinculado a um IP específico e atribuir permissões totais a um banco de dados:

```sql
-- Criar o usuário com IP de origem e senha
CREATE USER 'bixo'@'192.168.1.47' IDENTIFIED BY '@Sandlash45$$';

-- Conceder todos os privilégios no banco 'bixo' para este usuário
GRANT ALL PRIVILEGES ON bixo.* TO 'bixo'@'192.168.1.47';

-- Atualizar as tabelas de privilégios para aplicar as mudanças
FLUSH PRIVILEGES;
```

### 2.2. Auditoria de Usuários e Permissões

Comandos para verificar quem tem acesso e quais são seus níveis de privilégio:

```sql
-- Listar usuários cadastrados
SELECT user, host FROM mysql.user;

-- Ver permissões de um usuário escolhido
SHOW GRANTS FOR 'tatu'@'192.168.1.54';
```

---

## 3. Navegação de Dados

```sql
-- Comandos básicos de exploração
SHOW DATABASES;
USE tatu;
SHOW TABLES;
```

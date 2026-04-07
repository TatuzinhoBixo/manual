## Testes e Diagnóstico do MySQL/MariaDB Galera

Este documento contém comandos para verificar o estado de um cluster Galera (MySQL/MariaDB), identificar problemas de replicação e monitorar performance.

### Conexão ao Banco de Dados

```bash
mysql -u root -p
```
> Insira a senha configurada durante a instalação do banco.

### Verificar Estado do Cluster Galera

#### Quantidade de nós no cluster
```sql
SHOW STATUS LIKE 'wsrep_cluster_size';
```

#### Estado de sincronização
```sql
SHOW STATUS LIKE 'wsrep_local_state_comment';
```

### Verificar Gargalos de Replicação

```sql
SHOW STATUS LIKE 'wsrep_flow_control_paused';
SHOW STATUS LIKE 'wsrep_local_recv_queue';
SHOW STATUS LIKE 'wsrep_flow_control_sent';
```

| Variável | Ideal | O que procurar |
|----------|-------|----------------|
| `wsrep_local_recv_queue` | 0 | Valor > 0 indica que o nó está atrasado em aplicar transações |
| `wsrep_flow_control_paused` | 0.0 | Valor alto (ex: 0.1+) indica que o Galera está pausando o cluster |
| `wsrep_flow_control_sent` | 0 | Se alto, este nó pode ser o gargalo do cluster |

### Verificar Conexões e Performance

#### Conexões ativas (queries lentas ou bloqueios)
```sql
SHOW PROCESSLIST;
```

#### Variáveis globais de memória e buffers
```sql
SHOW GLOBAL VARIABLES LIKE 'innodb_buffer_pool_size';
SHOW GLOBAL VARIABLES LIKE 'max_connections';
```

### Consultas Administrativas

#### Listar usuários cadastrados
```sql
SELECT User, Host, plugin FROM mysql.user;
```

#### Listar bancos de dados
```sql
SHOW DATABASES;
```

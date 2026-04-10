## Configuração de Inotify para Novos Workers

Ao adicionar novos nós worker em um cluster Kubernetes ou ao rodar muitos containers, pode ser necessário aumentar os limites do inotify para evitar erros de monitoramento de arquivos.

### Problema

Erros como:
- `too many open files`
- `inotify_add_watch failed`
- Pods que não conseguem iniciar por falta de file watchers

### Solução

Aumentar os limites do kernel para inotify:

```bash
# Aplicar imediatamente (não persiste após reboot)
sudo sysctl -w fs.inotify.max_user_instances=8192
sudo sysctl -w fs.inotify.max_user_watches=1048576
```

### Persistir as Configurações

Adicionar ao `/etc/sysctl.conf` para sobreviver a reinicializações:

```bash
echo "fs.inotify.max_user_instances=8192" | sudo tee -a /etc/sysctl.conf
echo "fs.inotify.max_user_watches=1048576" | sudo tee -a /etc/sysctl.conf
```

Aplicar as configurações:

```bash
sudo sysctl -p
```

### Verificar Configurações Atuais

```bash
cat /proc/sys/fs/inotify/max_user_instances
cat /proc/sys/fs/inotify/max_user_watches
```

### Parâmetros

| Parâmetro | Descrição | Valor Recomendado |
|-----------|-----------|-------------------|
| `max_user_instances` | Número máximo de instâncias inotify por usuário | 8192 |
| `max_user_watches` | Número máximo de watches por usuário | 1048576 |

> **Nota**: Execute este procedimento em todos os nós worker do cluster Kubernetes antes de adicionar workloads.

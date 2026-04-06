# Procedimento de Recuperação de Cluster RKE2 - Certificados Expirados e etcd

**Versão:** 1.0
**Data:** 2026-03-10
**Ambiente:** RKE2 v1.30.x | 3 Control Planes + Workers
**Autor:** Equipe de Infraestrutura

---

## 1. Visão Geral

Este documento descreve o procedimento de recuperação de um cluster RKE2 quando os certificados internos (x509) expiram e/ou o etcd apresenta falhas (ex: alarme NOSPACE).

### Topologia de Referência

| Nó | IP | Função |
|----|-----|--------|
| trt-control1 | 10.100.171.21 | Control Plane (init/líder) |
| trt-control2 | 10.100.171.25 | Control Plane |
| trt-control3 | 10.100.171.31 | Control Plane |
| HAProxy | 10.100.171.26 | Load Balancer dos Control Planes |
| trt-wrk1-4 | — | Workers |

### Causa Raiz Comum

```
etcd cheio ou com alarme NOSPACE → cluster degrada →
rotação automática de certs falha → certificados expiram →
cluster para completamente
```

---

## 2. Diagnóstico

### 2.1 Verificar status do serviço

```bash
systemctl status rke2-server     # nos control planes
systemctl status rke2-agent      # nos workers
```

### 2.2 Verificar logs

```bash
journalctl -u rke2-server -n 100 --no-pager
```

### 2.3 Sinais de certificado expirado

Nos logs aparecerá algo como:

```
x509: certificate has expired or is not yet valid
```

### 2.4 Verificar validade dos certificados

```bash
# Verificar certificado do kube-apiserver
openssl x509 -in /var/lib/rancher/rke2/server/tls/serving-kube-apiserver.crt -noout -dates

# Verificar todos os certificados de uma vez
for cert in /var/lib/rancher/rke2/server/tls/*.crt; do
  echo "=== $cert ==="
  openssl x509 -in "$cert" -noout -dates 2>/dev/null
done
```

### 2.5 Verificar espaço em disco e tamanho do etcd

```bash
df -h /
du -sh /var/lib/rancher/rke2/server/db/etcd/
```

> **IMPORTANTE:** O etcd tem limite interno de 2GB (padrão). Mesmo com disco sobrando, se o DB do etcd ultrapassar esse limite, o alarme NOSPACE é disparado.

---

## 3. Procedimento de Recuperação

### CENÁRIO A: Apenas Certificados Expirados (etcd saudável)

Se o etcd está funcionando normalmente e apenas os certificados expiraram:

#### Passo 1 — Parar todos os control planes

```bash
# Em CADA control plane (control1, control2, control3):
systemctl stop rke2-server
```

#### Passo 2 — Rotacionar certificados no nó init (control1)

```bash
# No trt-control1 (nó init):
rke2 certificate rotate
systemctl start rke2-server
```

Aguarde até o nó ficar Ready:

```bash
/var/lib/rancher/rke2/bin/kubectl \
  --kubeconfig /etc/rancher/rke2/rke2.yaml get nodes
```

#### Passo 3 — Rotacionar nos demais control planes

```bash
# Em CADA um dos outros control planes (control2, control3):
rke2 certificate rotate
systemctl start rke2-server
```

Aguardar cada um ficar Ready antes de iniciar o próximo.

#### Passo 4 — Verificar workers

Os workers geralmente se reconectam automaticamente. Se algum ficar NotReady:

```bash
# No worker com problema:
systemctl restart rke2-agent
```

Se persistir:

```bash
rke2 certificate rotate
systemctl restart rke2-agent
```

---

### CENÁRIO B: Certificados Expirados + etcd com Falha (NOSPACE / timeout)

Este é o cenário mais grave. O etcd não consegue operar e os certificados expiraram.

#### Sinais no log

```
failed to disarm etcd alarms: etcdserver: request timed out
etcd alarm list failed
```

#### Passo 1 — Parar TODOS os control planes

```bash
# Em CADA control plane:
systemctl stop rke2-server
```

Verificar que não ficou processo residual:

```bash
ps aux | grep etcd
# Se houver processo etcd rodando, mate-o:
kill -9 <PID>
```

#### Passo 2 — Rotacionar certificados no nó init

```bash
# No trt-control1 (nó init):
rke2 certificate rotate
```

#### Passo 3 — Identificar o snapshot do etcd

```bash
ls -lt /var/lib/rancher/rke2/server/db/snapshots/
```

Escolha o snapshot mais recente **anterior** à data do problema.

#### Passo 4 — Localizar o etcdctl

```bash
find /var/lib/rancher/rke2 -name etcdctl -type f 2>/dev/null
```

Caminho típico:

```
/var/lib/rancher/rke2/agent/containerd/io.containerd.snapshotter.v1.overlayfs/snapshots/2/fs/usr/local/bin/etcdctl
```

Criar alias para facilitar:

```bash
export ETCDCTL=$(find /var/lib/rancher/rke2 -name etcdctl -type f 2>/dev/null | head -1)
```

#### Passo 5 — Fazer backup do etcd atual

```bash
cp -r /var/lib/rancher/rke2/server/db/etcd /var/lib/rancher/rke2/server/db/etcd-backup-$(date +%Y%m%d%H%M)
```

#### Passo 6 — Identificar o nome e IP do nó init

Verifique no config.yaml ou nos logs anteriores:

```bash
cat /etc/rancher/rke2/config.yaml
```

O nome do membro etcd segue o padrão: `<hostname>-<hash>`

Para descobrir o nome exato, olhe nos logs antigos:

```bash
journalctl -u rke2-server --no-pager | grep "member name"
```

Ou verifique no backup do etcd.

#### Passo 7 — Restaurar o snapshot

```bash
# Remover o diretório etcd atual
rm -rf /var/lib/rancher/rke2/server/db/etcd

# Restaurar com os parâmetros corretos
# SUBSTITUA os valores conforme seu ambiente:
#   NOME_MEMBRO = nome do membro etcd (ex: trt-control1-df8c9a99)
#   IP_CONTROL1 = IP do nó init (ex: 10.100.171.21)
#   SNAPSHOT    = caminho do snapshot escolhido

$ETCDCTL snapshot restore <SNAPSHOT> \
  --data-dir=/var/lib/rancher/rke2/server/db/etcd \
  --name <NOME_MEMBRO> \
  --initial-cluster <NOME_MEMBRO>=https://<IP_CONTROL1>:2380 \
  --initial-advertise-peer-urls https://<IP_CONTROL1>:2380 \
  --skip-hash-check
```

**Exemplo real:**

```bash
$ETCDCTL snapshot restore /var/lib/rancher/rke2/server/db/snapshots/etcd-snapshot-1709827200 \
  --data-dir=/var/lib/rancher/rke2/server/db/etcd \
  --name trt-control1-df8c9a99 \
  --initial-cluster trt-control1-df8c9a99=https://10.100.171.21:2380 \
  --initial-advertise-peer-urls https://10.100.171.21:2380 \
  --skip-hash-check
```

#### Passo 8 — Iniciar o nó init

```bash
systemctl start rke2-server
```

Acompanhar os logs:

```bash
journalctl -u rke2-server -f
```

Aguardar até ver:

```
rke2 is up and running
```

Verificar:

```bash
/var/lib/rancher/rke2/bin/kubectl \
  --kubeconfig /etc/rancher/rke2/rke2.yaml get nodes
```

#### Passo 9 — Rejoin dos outros control planes

Em **cada** control plane secundário (control2, control3):

```bash
systemctl stop rke2-server
rm -rf /var/lib/rancher/rke2/server/db/etcd
systemctl start rke2-server
```

> **IMPORTANTE:** Faça um de cada vez. Aguarde cada nó ficar Ready antes de iniciar o próximo.

#### Passo 10 — Verificar workers

```bash
/var/lib/rancher/rke2/bin/kubectl \
  --kubeconfig /etc/rancher/rke2/rke2.yaml get nodes
```

Workers que não voltarem automaticamente:

```bash
# No worker com problema:
systemctl restart rke2-agent
```

---

## 4. Validação Pós-Recuperação

### 4.1 Todos os nós Ready

```bash
/var/lib/rancher/rke2/bin/kubectl \
  --kubeconfig /etc/rancher/rke2/rke2.yaml get nodes
```

Todos devem estar `Ready`.

### 4.2 Saúde do etcd

```bash
$ETCDCTL --endpoints=https://127.0.0.1:2379 \
  --cacert=/var/lib/rancher/rke2/server/tls/etcd/server-ca.crt \
  --cert=/var/lib/rancher/rke2/server/tls/etcd/server-client.crt \
  --key=/var/lib/rancher/rke2/server/tls/etcd/server-client.key \
  endpoint health
```

### 4.3 Membros do etcd

```bash
$ETCDCTL --endpoints=https://127.0.0.1:2379 \
  --cacert=/var/lib/rancher/rke2/server/tls/etcd/server-ca.crt \
  --cert=/var/lib/rancher/rke2/server/tls/etcd/server-client.crt \
  --key=/var/lib/rancher/rke2/server/tls/etcd/server-client.key \
  member list -w table
```

Devem aparecer 3 membros, todos `started`.

### 4.4 Pods do sistema

```bash
/var/lib/rancher/rke2/bin/kubectl \
  --kubeconfig /etc/rancher/rke2/rke2.yaml get pods -A | grep -v Running
```

### 4.5 Verificar certificados renovados

```bash
for cert in /var/lib/rancher/rke2/server/tls/*.crt; do
  echo "=== $(basename $cert) ==="
  openssl x509 -in "$cert" -noout -enddate 2>/dev/null
done
```

### 4.6 Verificar conexão com Rancher

Acessar a interface do Rancher e confirmar que o cluster aparece como ativo.

---

## 5. Prevenção

### 5.1 Monitorar expiração de certificados

Criar um cron que verifica semanalmente:

```bash
# /etc/cron.weekly/check-rke2-certs
#!/bin/bash
DAYS_WARNING=30
for cert in /var/lib/rancher/rke2/server/tls/*.crt; do
  if openssl x509 -in "$cert" -checkend $((DAYS_WARNING * 86400)) -noout 2>/dev/null; then
    : # OK
  else
    echo "ALERTA: $(basename $cert) expira em menos de ${DAYS_WARNING} dias!"
  fi
done
```

```bash
chmod +x /etc/cron.weekly/check-rke2-certs
```

### 5.2 Restart periódico dos control planes

O RKE2 renova certificados automaticamente no restart do serviço. Agendar um restart a cada 6 meses (em janela de manutenção, um nó por vez):

```bash
rke2 certificate rotate
systemctl restart rke2-server
```

### 5.3 Monitorar tamanho do etcd

```bash
# /etc/cron.daily/check-etcd-size
#!/bin/bash
ETCD_DIR="/var/lib/rancher/rke2/server/db/etcd"
SIZE_MB=$(du -sm "$ETCD_DIR" 2>/dev/null | awk '{print $1}')
if [ "$SIZE_MB" -gt 500 ]; then
  echo "ALERTA: etcd com ${SIZE_MB}MB (limite recomendado: 500MB)"
fi
```

### 5.4 Monitorar espaço em disco

Manter no mínimo 20% de espaço livre no disco dos control planes.

---

## 6. Referência Rápida de Comandos

| Ação | Comando |
|------|---------|
| Status do serviço | `systemctl status rke2-server` |
| Logs em tempo real | `journalctl -u rke2-server -f` |
| Listar nós | `kubectl --kubeconfig /etc/rancher/rke2/rke2.yaml get nodes` |
| Rotacionar certs | `rke2 certificate rotate` |
| Parar RKE2 | `systemctl stop rke2-server` |
| Iniciar RKE2 | `systemctl start rke2-server` |
| Ver snapshots etcd | `ls -lt /var/lib/rancher/rke2/server/db/snapshots/` |
| Tamanho do etcd | `du -sh /var/lib/rancher/rke2/server/db/etcd/` |
| Verificar certs | `openssl x509 -in <cert> -noout -dates` |
| Localizar etcdctl | `find /var/lib/rancher/rke2 -name etcdctl -type f` |

---

## 7. Ordem de Operação (Resumo)

```
1. Parar TODOS os control planes
2. Rotacionar certificados no nó init (control1)
3. [Se etcd com falha] Restaurar snapshot no nó init
4. Iniciar nó init → aguardar Ready
5. Rejoin control2 (deletar etcd + start) → aguardar Ready
6. Rejoin control3 (deletar etcd + start) → aguardar Ready
7. Verificar workers (restart agent se necessário)
8. Validar cluster completo
```

> **REGRA DE OURO:** Sempre começar pelo nó init (quem tem `cluster-init: true` no config.yaml). Fazer um nó por vez. Nunca pular etapas.

## Manutenção de Nós do Cluster

Este procedimento prepara um nó para manutenção (atualização de SO, reinício, troca de hardware) de forma segura, garantindo que os pods sejam realocados antes da intervenção.

### Fluxo de Manutenção

1. **Cordon** - Impede novos pods de serem agendados no nó
2. **Drain** - Remove os pods existentes de forma controlada
3. **Manutenção** - Execute a intervenção necessária
4. **Uncordon** - Libera o nó para receber pods novamente

### 1. Bloquear Agendamento (Cordon)

Impede que novos pods sejam agendados no nó, mas mantém os pods existentes:

```bash
kubectl cordon <nome-do-node>
```

Verificar status:
```bash
kubectl get nodes
```
> O nó aparecerá com `SchedulingDisabled`

### 2. Drenar o Nó (Drain)

Remove todos os pods do nó de forma controlada, realocando-os em outros nós:

```bash
kubectl drain <nome-do-node> --ignore-daemonsets --delete-emptydir-data
```

| Flag | Descrição |
|------|-----------|
| `--ignore-daemonsets` | Ignora pods de DaemonSets (eles rodam em todos os nós) |
| `--delete-emptydir-data` | Permite deletar pods com volumes emptyDir |

### 3. Executar a Manutenção

Com o nó drenado, execute a manutenção necessária:
- Atualização de sistema operacional
- Reinício do servidor
- Troca de hardware
- Atualização do kubelet/RKE2

### 4. Liberar o Nó (Uncordon)

Após a manutenção, libere o nó para receber pods novamente:

```bash
kubectl uncordon <nome-do-node>
```

### Verificação Final

```bash
kubectl get nodes
kubectl get pods -A -o wide | grep <nome-do-node>
```

> **Nota**: Em clusters de produção, certifique-se de que há capacidade suficiente nos outros nós antes de drenar. Considere fazer a manutenção de um nó por vez.

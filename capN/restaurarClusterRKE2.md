# Procedimento de Recuperação de Cluster RKE2 a partir de Snapshot

**Cenário:**

* Cluster RKE2 com 3 nós Control Plane e 4 nós Worker.
* Recuperação a partir de um snapshot etcd previamente criado.

**Objetivo:** Restaurar o cluster RKE2 para o estado do snapshot, trazendo todos os Control Planes e Workers de volta online.

**Pré-requisitos:**

1.  **Snapshot Válido:** Acesso a um snapshot etcd válido do seu cluster RKE2 (local ou em armazenamento S3).
2.  **Acesso SSH:** Acesso root ou sudo a todos os nós (Control Planes e Workers).
3.  **Credenciais:** Token do cluster (geralmente presente em `/etc/rancher/rke2/config.yaml`).
4.  **Informações dos Nós:** IPs e hostnames de todos os Control Planes e Workers.
5.  **Backup de Configurações Críticas (Opcional, mas Recomendado):** Backup dos arquivos `/etc/rancher/rke2/config.yaml` e `/var/lib/rancher/rke2/server/manifests/` de todos os nós.

**Visão Geral do Processo:**

O processo envolve parar o RKE2 em **todos** os nós, realizar a restauração do snapshot em **um** dos nós Control Plane, limpar os dados do RKE2 nos outros Control Planes e Workers, e então reiniciar o serviço RKE2 nesses nós para que eles se religuem ao Control Plane restaurado.

**Passos do Procedimento:**

---

**Passo 1: Parar o Serviço RKE2 em TODOS os Nós**

É crucial que o RKE2 esteja parado em todos os Control Planes e Workers antes de iniciar o processo de restauração.

* Conecte-se a cada nó (Control Plane e Worker) via SSH.
* Execute os comandos apropriados para parar o serviço RKE2:

    ```bash
    # Nos nós Control Plane
    sudo systemctl stop rke2-server.service

    # Nos nós Worker
    sudo systemctl stop rke2-agent.service
    ```

* Verifique se os serviços estão inativos em todos os nós.

    ```bash
    # Nos Control Planes
    sudo systemctl status rke2-server.service

    # Nos Workers
    sudo systemctl status rke2-agent.service
    ```

---

**Passo 2: Escolher o Nó de Recuperação e Localizar o Snapshot**

* Escolha um dos 3 nós Control Plane para ser o "nó de recuperação" inicial.
* Identifique o **caminho completo** para o arquivo de snapshot etcd que você usará. Exemplo: `/var/lib/rancher/rke2/server/db/snapshots/etcd-snapshot-TIMESTAMP.db`.
* Se o snapshot estiver no S3, baixe-o para o nó de recuperação ou prepare o comando de restauração para usar S3 diretamente (consulte a documentação RKE2 oficial para detalhes de S3 restore).

---

**Passo 3: Realizar a Restauração no Nó de Recuperação (Primeiro Control Plane)**

* Conecte-se ao nó Control Plane escolhido para a recuperação.
* Execute o comando `rke2 server` com os flags de restauração. Este comando irá **limpar os dados existentes** em `/var/lib/rancher/rke2` e restaurar o snapshot.

    ```bash
    # Substitua <caminho_para_o_snapshot> pelo caminho real do arquivo de snapshot
    # O data-dir padrão para RKE2 é /var/lib/rancher/rke2
    sudo rke2 server \
      --cluster-reset \
      --cluster-reset-data-dir=/var/lib/rancher/rke2 \
      --cluster-reset-snapshot=<caminho_para_o_snapshot>
    ```

* Aguarde a conclusão do comando. Ele terminará e o processo `rke2 server` **não** ficará rodando.
* Verifique os logs (`sudo journalctl -u rke2-server -f`) para confirmar que a restauração foi bem-sucedida.

---

**Passo 4: Iniciar o Serviço RKE2 no Nó de Recuperação**

* Após a restauração bem-sucedida, inicie o serviço `rke2-server` neste nó.

    ```bash
    sudo systemctl start rke2-server.service
    ```

* Monitore os logs para garantir que o serviço iniciou corretamente.

---

**Passo 5: Limpar Dados e Reiniciar nos OUTROS Control Planes (Nós 2 e 3)**

* Conecte-se a cada um dos outros dois nós Control Plane.
* **Pare** o serviço (se por algum motivo ele reiniciou).
* **Limpe completamente** o diretório de dados do RKE2. **ATENÇÃO: Este comando apaga todos os dados do RKE2 neste nó!**

    ```bash
    # Certifique-se de que o serviço rke2-server está parado!
    sudo rm -rf /var/lib/rancher/rke2/*
    ```

* Inicie o serviço RKE2. Ele se conectará ao Control Plane restaurado.

    ```bash
    sudo systemctl start rke2-server.service
    ```

* Monitore os logs e o status dos nós (`kubectl get nodes`) para confirmar que eles estão se juntando e ficando `Ready`.

---

**Passo 6: Limpar Dados e Reiniciar nos Nós Workers (Nós 1 a 4)**

* Conecte-se a cada um dos quatro nós Worker.
* **Pare** o serviço `rke2-agent`.
* **Limpe completamente** o diretório de dados do RKE2. **ATENÇÃO: Este comando apaga todos os dados do RKE2 neste nó!**

    ```bash
    # Certifique-se de que o serviço rke2-agent está parado!
    sudo rm -rf /var/lib/rancher/rke2/*
    ```

* Inicie o serviço RKE2 agent. Ele se conectará ao cluster restaurado.

    ```bash
    sudo systemctl start rke2-agent.service
    ```

* Monitore os logs e o status dos nós (`kubectl get nodes`) para confirmar que eles estão se juntando e ficando `Ready`.

---

**Passo 7: Verificação Pós-Recuperação**

* A partir de um Control Plane, use `kubectl` para verificar a saúde do cluster:
    * Verifique os nós: `kubectl get nodes` (Todos os 7 nós devem estar `Ready`).
    * Verifique os pods do sistema: `kubectl get pods -A`.
    * Verifique suas aplicações e serviços.
* Confirme que suas aplicações estão funcionando corretamente.

---

**Considerações Importantes e Troubleshooting:**

* **Perda de Dados:** A restauração volta ao ponto no tempo do snapshot. Dados ou configurações criados após o snapshot são perdidos.
* **Armazenamento Persistente (PVs):** Este procedimento **não** recupera dados de PVs externos. Estes devem ter um plano de backup/recuperação separado.
* **Dependências Externas:** Verifique se serviços externos (bancos de dados, etc.) estão acessíveis e funcionais.
* **Networking e Firewall:** Garanta a conectividade entre os nós e que as portas necessárias do RKE2 estão abertas.
* **Testes:** Teste este procedimento regularmente em um ambiente não produtivo para garantir sua eficácia.

---

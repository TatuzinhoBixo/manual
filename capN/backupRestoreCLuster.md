### Passso para fazer o backcup do cluster RKE2
O RKE2, assim como o K3s, facilita o backup do estado do cluster (que fica armazenado no banco de dados etcd nos nós server/control plane) através de um comando embutido.

Aqui estão os passos para fazer o backup do seu cluster RKE2:

Passo 1: Acesse um dos seus nós Server (Control Plane)

O backup do etcd precisa ser executado em um dos nós que está rodando o componente rke2-server. Em um cluster HA, você só precisa executar o backup em um dos nós server para capturar o estado completo do cluster, mas é uma boa prática ter rotinas de backup que cubram todos ou vários servers por redundância.

Acesse o nó via SSH ou diretamente no console. Você precisará de permissões de sudo.

Passo 2: Execute o Comando de Backup do etcd

O comando principal é rke2 etcd-snapshot. É altamente recomendável especificar um local para salvar o snapshot usando a flag --snapshot-path. O local padrão é dentro do diretório de dados do RKE2 (/var/lib/rancher/rke2/server/db/snapshots), mas salvá-lo em outro local ou em um volume dedicado facilita a cópia de segurança.

```bash
sudo rke2 etcd-snapshot --snapshot-path /caminho/seguro/para/salvar/backups/
```
Substitua /caminho/seguro/para/salvar/backups/ pelo diretório onde você deseja que o arquivo de backup seja criado neste nó. É importante que este diretório exista e que o usuário rke2 (ou root) tenha permissão de escrita nele.

Ao executar o comando, você verá uma mensagem indicando que o snapshot foi criado e o caminho completo do arquivo, algo como:


```bash
INFO[2025-04-25T11:10:00-04:00] Creating snapshot at /caminho/seguro/para/salvar/backups/etcd-snapshot-<timestamp>.db.gz
INFO[2025-04-25T11:10:01-04:00] Snapshot created
```

O nome do arquivo incluirá um timestamp para identificação.

Passo 3: Verifique e Secure o Arquivo de Backup (CRUCIAL!)

Este é o passo mais importante. O arquivo criado no Passo 2 está salvo localmente no nó server onde você rodou o comando. Para que o backup seja realmente útil em caso de falha do nó, você precisa copiar este arquivo para um local externo seguro.

Use ls para confirmar que o arquivo foi criado:

```bash
ls -lh /caminho/seguro/para/salvar/backups/
```
Em seguida, copie-o para:

Um servidor de backups externo.
Um armazenamento de objetos (S3, S3 compatível, etc.).
Uma unidade de rede montada.
Qualquer outro local fora do cluster Kubernetes e fora dos próprios nós do cluster.
Exemplo de cópia (usando scp para outro servidor - substitua os detalhes):

```bash
scp /caminho/seguro/para/salvar/backups/etcd-snapshot-<timestamp>.db.gz usuario@servidor-remoto:/local/de/backups/rke2/
```

Passo 4: (Opcional) Automatize seus Backups

Para garantir que você sempre tenha backups recentes, configure uma rotina para executar o comando sudo rke2 etcd-snapshot regularmente (usando cron, por exemplo) e copiar os arquivos resultantes para o local seguro.

Resumo Rápido:

Acesse um nó server do RKE2.
Execute sudo rke2 etcd-snapshot --snapshot-path /seu/diretorio/de/backup/.
COPIE O ARQUIVO .db.gz RESULTANTE PARA UM LOCAL SEGURO EXTERNO AO CLUSTER.
Este snapshot contém todo o estado do seu cluster Kubernetes (definições de Deployments, Services, configurações, etc.). 

### Passso para fazer o restore do cluster RKE2
Pré-requisitos:

Você tem o arquivo de snapshot (.db.gz) que deseja restaurar.
Você tem acesso a um dos seus nós server (control plane) via SSH ou console, com permissões de sudo.
Processo de Restauração:

Passo 1: Copie o Arquivo de Snapshot de Volta para o Nó Server

Transfira o arquivo .db.gz que você salvou externamente de volta para um diretório acessível no nó server onde você fará a restauração. Um bom local temporário pode ser o diretório home do usuário ou um diretório /tmp/rke2-restore.

Bash

#### Exemplo usando scp do seu local seguro para o nó server
scp /local/de/backups/rke2/etcd-snapshot-<timestamp>.db.gz usuario@seu-no-server:/caminho/temporario/no/no/
Substitua os caminhos e usuario@seu-no-server pelos seus dados.

Passo 2: Pare o Serviço RKE2 Server no Nó Destino

É crucial parar o serviço rke2-server no nó onde você executará o comando de restauração para evitar conflitos com o etcd em execução.

```bash
sudo systemctl stop rke2-server
```

Passo 3: Execute o Comando de Restauração

Use o comando rke2 etcd-snapshot restore. Você precisa especificar o caminho completo para o arquivo de snapshot. O RKE2 irá descompactar o snapshot e preparar o diretório de dados do etcd para usar esse estado.

```bash
sudo rke2 etcd-snapshot restore /caminho/temporario/no/no/etcd-snapshot-<timestamp>.db.gz
```
O RKE2 usará seu diretório de dados configurado (por padrão /var/lib/rancher/rke2) para colocar os arquivos restaurados. Certifique-se de ter espaço em disco suficiente.
Aguarde a conclusão do comando. Ele informará quando a restauração estiver completa.

Passo 4: Inicie o Serviço RKE2 Server Restaurado

Agora que o diretório de dados está preparado com o estado do snapshot, você pode iniciar o serviço RKE2 server. Ele carregará o etcd a partir dos dados restaurados.

```bash
sudo systemctl start rke2-server
```

Aguarde alguns minutos para o serviço subir completamente e o control plane se estabilizar. Você pode verificar o status do serviço com sudo 

```bash
systemctl status rke2-server e os logs com sudo journalctl -u rke2-server -f.
```

Passo 5: Verifique a Saúde do Cluster Restaurado

Em um terminal com acesso ao cluster (usando kubectl configurado para o endpoint do nó restaurado ou um Load Balancer se aplicável), verifique se os nós estão Ready e se os pods do sistema estão rodando.

```bash
kubectl get nodes
kubectl get pods --all-namespaces
```

O cluster deve voltar ao estado que ele tinha no momento em que o snapshot foi criado.

#### Considerações Importantes para Restauração (Especialmente em HA):

Clusters HA (Alta Disponibilidade com Múltiplos Servers): Restaurar um cluster HA é mais complexo do que um cluster single-node. A abordagem recomendada geralmente é:
Escolha um dos nós server e siga os Passos 1 a 4 nele. Este nó será o "primeiro" nó restaurado.
Para os outros nós server HA (os que não foram usados para a restauração inicial): A forma mais limpa e segura é removê-los do cluster HA existente (usando o script rke2-uninstall.sh neles) e re-adicioná-los como novos nós server apontando para o primeiro nó server restaurado. 

- Desinstalação do RKE2 de um Nó
Este procedimento remove completamente a instalação do RKE2 de um nó, incluindo binários, serviços e configurações. Em nós Server (Control Plane), é crucial salvar o arquivo de configuração antes de desinstalar, especialmente se você planeja re-adicionar o nó a um cluster existente com configurações específicas.
    Passo 1: (Em Nós Server/Control Plane) Salve o Arquivo de Configuração

    Se você está desinstalando um nó que era um Server (Control Plane) e planeja re-utilizá-lo em outro cluster ou re-adicioná-lo a um cluster HA restaurado, salve uma cópia do seu arquivo de configuração /etc/rke2/rancher/config.yaml. Este arquivo contém configurações importantes que podem precisar ser replicadas ao configurar o nó novamente. O script de desinstalação irá removê-lo.

    Acesse o nó que será desinstalado.

    Copie o arquivo para um local temporário no nó:

    ```bash
    sudo cp /etc/rke2/rancher/config.yaml /tmp/rke2-config-backup.yaml
    ```
    Importante: Transfira esta cópia para um local externo seguro (sua máquina local, servidor de backups, etc.) imediatamente, pois o diretório /tmp é limpável e o nó será removido.


    Exemplo usando scp para transferir para sua máquina local (execute da sua máquina)
    
    ```bash
    scp usuario@seu-no-rke2:/tmp/rke2-config-backup.yaml /caminho/seguro/na/sua/maquina/
    ```
    Se o nó for apenas um Agent (Worker) e não tinha configurações customizadas importantes além do token e do endereço do servidor (que você terá do servidor principal), salvar este arquivo pode não ser estritamente necessário, mas ainda assim é uma boa prática em caso de dúvida.

    Passo 2: Execute o Script de Desinstalação do RKE2

    O RKE2 instala um script de desinstalação no nó. A localização padrão deste script depende do tipo de instalação (server ou agent), mas geralmente estão em /usr/local/bin/.

    Acesse o nó que será desinstalado.

    Execute o script apropriado com sudo:

    Para nós Server (Control Plane):


    ```bash
    sudo /usr/local/bin/rke2-uninstall.sh
    ```

    Passo 3: Verifique a Limpeza (Opcional)

    Após a execução do script, você pode verificar manualmente se os serviços foram removidos e os diretórios limpos:

    ```bash
    sudo systemctl status rke2-server  # Deve dizer 'not found'
    sudo systemctl status rke2-agent   # 
    ```

    Deve dizer 'not found'
    ls -l /etc/rke2/                   # Deve estar vazio ou não existir
    ls -l /var/lib/rancher/rke2/       # Deve estar vazio ou não existir (verifique o --data-dir se for customizado)
    O nó agora está limpo e pronto para ser reinstalado, configurado como um novo nó (seja server ou agent), ou simplesmente desligado/reutilizado para outro fim.

Após a remoção, incluir o controlplanes restantes no cluster restarurado, eles farão o join no cluster e a sincronizarão seu estado do etcd a partir dele. Restaurar todos os nós server HA simultaneamente a partir do mesmo snapshot é possível, mas requer coordenação extra para garantir que eles formem o cluster etcd corretamente após a restauração, e geralmente é mais propenso a erros. Re-adicionar os outros é mais robusto.
Nós Agent (Workers): Os nós agent não precisam ser restaurados a partir de um snapshot do etcd. Eles apenas se conectam aos nós server. Após a restauração dos servers, os agents devem eventualmente se reconectar e voltar ao estado Ready. Pode ser necessário reiniciar o serviço rke2-agent neles (sudo systemctl restart rke2-agent) ou até mesmo reinstalar/re-conectar o agent se houver problemas de comunicação persistentes.
Versão do RKE2: Idealmente, a versão do RKE2 que você está restaurando deve ser a mesma versão que criou o snapshot. Restaurar um snapshot de uma versão mais antiga em uma versão mais nova do RKE2 pode funcionar, mas a compatibilidade depende das mudanças entre as versões e é altamente recomendado verificar a documentação de upgrade do RKE2 para ver se há passos específicos para restaurar snapshots de versões anteriores.
Diretório de Dados: Certifique-se de que o comando rke2 etcd-snapshot restore esteja operando no diretório de dados correto do RKE2 (--data-dir se for diferente do padrão).
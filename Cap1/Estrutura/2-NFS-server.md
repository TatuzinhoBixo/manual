## Configuração de NFS no Debian

Procedimento para configurar servidor e cliente NFS no Debian/Ubuntu.

### Configuração do Servidor NFS

#### 1. Instalar o servidor NFS

```bash
sudo apt install nfs-kernel-server
```

#### 2. Configurar o export

Editar `/etc/exports`:

```bash
sudo vim /etc/exports
```

Adicionar a linha:

```
<diretorio-compartilhado>    <rede-permitida>/<mascara>(rw,sync,no_subtree_check)
```

Exemplo:

```
/media/nfs    192.168.1.0/24(rw,sync,no_subtree_check)
```

#### 3. Reiniciar o serviço

```bash
sudo systemctl restart nfs-kernel-server
```

### Configuração do Cliente NFS

#### 1. Instalar o cliente NFS

```bash
sudo apt install nfs-common
```

#### 2. Criar ponto de montagem

```bash
sudo mkdir -p <ponto-montagem>
```

#### 3. Montar o compartilhamento

```bash
sudo mount -t nfs4 <ip-servidor>:<diretorio-remoto> <ponto-montagem>
```

### Montagem Automática via fstab

Adicionar ao `/etc/fstab`:

```
<ip-servidor>:<diretorio-remoto>    <ponto-montagem>    nfs4    defaults,user,exec,noauto    0 0
```

> A opção `noauto` evita problemas de boot se o servidor NFS estiver indisponível.

### Montar Todas as Partições do fstab

```bash
sudo mount -a
```

### Opções Comuns do Export

| Opção              | Descrição                              |
| ------------------ | -------------------------------------- |
| `rw`               | Leitura e escrita                      |
| `ro`               | Somente leitura                        |
| `sync`             | Escrita síncrona (mais seguro)         |
| `async`            | Escrita assíncrona (mais rápido)       |
| `no_subtree_check` | Desabilita verificação de subdiretório |
| `no_root_squash`   | Permite acesso root (use com cuidado)  |

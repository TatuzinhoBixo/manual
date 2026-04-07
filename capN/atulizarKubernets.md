# Procedimento de Atualização RKE2 - Produção

## Verificar Versões Disponíveis

## Pré-requisitos

- Backup do etcd atualizado
- Janela de manutenção programada
- Arquivos de instalação baixados e validados
- Verificar compatibilidade da versão

## Ordem de Atualização

1. **Control Planes** (um por vez)
2. **Workers** (um por vez)


### Listar versões disponíveis do RKE2
```bash
# Listar todas as versões disponíveis
curl -s https://api.github.com/repos/rancher/rke2/releases | grep 'tag_name' | cut -d\" -f4 | sort -V

# Listar apenas versões estáveis (sem rc)
curl -s https://api.github.com/repos/rancher/rke2/releases | grep 'tag_name' | cut -d\" -f4 | sort -V | grep -v 'rc'

# Listar apenas versões de uma linha específica (exemplo: 1.32.x)
curl -s https://api.github.com/repos/rancher/rke2/releases | grep 'tag_name' | cut -d\" -f4 | sort -V | grep -v 'rc' | grep 'v1.32'
```

### Verificar versão atual do cluster
```bash
# Ver versões de todos os nós
kubectl get nodes

# Ver apenas a versão (sem detalhes dos nós)
kubectl get nodes -o wide
```

### Escolher a versão para atualizar

**Recomendações:**
- Atualize para a versão minor imediatamente superior (ex: 1.31.x → 1.32.x)
- Evite pular versões minor (não faça 1.31.x → 1.34.x diretamente)
- Escolha a versão patch mais recente da minor desejada
- Evite versões com sufixo `rc` (release candidate) em produção

**Exemplo:**
- Versão atual: v1.31.4+rke2r1
- Versão alvo: v1.32.11+rke2r1 (última versão estável da linha 1.32)

---

## Baixar Arquivos de Instalação

**IMPORTANTE:** Os mesmos arquivos servem para Control Planes e Workers. Baixe uma única vez e distribua para todos os nós.

### Opção 1: Download direto no servidor
```bash
# Definir a versão desejada
VERSION="v1.32.11+rke2r1"

# Criar diretório
mkdir -p ~/rke2-update
cd ~/rke2-update

# Baixar tarball
wget https://github.com/rancher/rke2/releases/download/${VERSION}/rke2.linux-amd64.tar.gz

# Baixar checksum
wget https://github.com/rancher/rke2/releases/download/${VERSION}/sha256sum-amd64.txt

# Verificar integridade
sha256sum -c sha256sum-amd64.txt --ignore-missing
```

### Opção 2: Download em outra máquina e transferência
```bash
# Na máquina local
VERSION="v1.32.11+rke2r1"
wget https://github.com/rancher/rke2/releases/download/${VERSION}/rke2.linux-amd64.tar.gz
wget https://github.com/rancher/rke2/releases/download/${VERSION}/sha256sum-amd64.txt

# Transferir para os servidores
```bash
scp rke2.linux-amd64.tar.gz sha256sum-amd64.txt usuario@servidor:~/rke2-update/
```

---

## Atualização de Control Plane

### 1. Preparar arquivos
```bash
# Fazer login como root
sudo su -

# Criar diretório temporário
mkdir -p /tmp/rke2-install
cd /tmp/rke2-install

# Copiar arquivos para o diretório temporário
cp <caminho-dos-arquivos>/* .

# Verificar integridade
sha256sum -c sha256sum-amd64.txt --ignore-missing
```

**Resultado esperado:** `rke2.linux-amd64.tar.gz: OK`

---

### 2. Parar o serviço
```bash
systemctl stop rke2-server
```

**Verificar:** Serviço deve estar parado

---

### 3. Atualizar binários
```bash
# Extrair arquivos sobrescrevendo os antigos
tar -xzf rke2.linux-amd64.tar.gz -C /usr/local --overwrite

# Verificar versão do binário instalado
/usr/local/bin/rke2 --version
```

**Resultado esperado:** Versão desejada deve aparecer

---

### 4. Reiniciar serviço
```bash
# Recarregar systemd
systemctl daemon-reload

# Iniciar serviço
systemctl start rke2-server

# Verificar status
systemctl status rke2-server
```

**Verificar:** Serviço deve estar `active (running)`

---

### 5. Validar atualização
```bash
# Verificar versão do nó
kubectl get nodes

# Verificar pods do sistema
kubectl get pods -n kube-system
```

**Resultado esperado:** Nó deve aparecer com versão atualizada e status `Ready`

---

### 6. Aguardar estabilização

- Aguarde 2-5 minutos
- Verifique logs se necessário: `journalctl -u rke2-server -f`
- Confirme que todos os pods do sistema estão rodando

---

## Atualização de Worker

**IMPORTANTE:** Os mesmos arquivos (rke2.linux-amd64.tar.gz e sha256sum-amd64.txt) são usados para atualizar os workers.


### Opção 1: Download direto no servidor

```bash
# Definir a versão desejada
VERSION="v1.32.11+rke2r1"

# Criar diretório
mkdir -p ~/rke2-update
cd ~/rke2-update

# Baixar tarball
wget https://github.com/rancher/rke2/releases/download/${VERSION}/rke2.linux-amd64.tar.gz

# Baixar checksum
wget https://github.com/rancher/rke2/releases/download/${VERSION}/sha256sum-amd64.txt

# Verificar integridade
sha256sum -c sha256sum-amd64.txt --ignore-missing

### 1. Preparar arquivos
```bash
# Fazer login como root
sudo su -

# Criar diretório temporário
mkdir -p /tmp/rke2-install
cd /tmp/rke2-install

# Copiar arquivos (mesmos arquivos usados nos control planes)
cp <caminho-dos-arquivos>/* .

# Verificar integridade
sha256sum -c sha256sum-amd64.txt --ignore-missing
```

---

### 2. Fazer drain do nó

**Execute de um control plane:**
```bash
kubectl drain <node> --ignore-daemonsets --delete-emptydir-data --grace-period=300
```

**Aguarde:** Todos os pods serem redistribuídos

**Caso demore mais que 5 min
rodar
```bash
kubectl drain <node> --ignore-daemonsets --delete-emptydir-data --disable-eviction --force

---

### 3. Parar o serviço

**No worker:**
```bash
systemctl stop rke2-agent
```

---

### 4. Atualizar binários
```bash
# Extrair arquivos (mesmo processo do control plane)
```bash
tar -xzf rke2.linux-amd64.tar.gz -C /usr/local --overwrite
```

# Verificar versão
/usr/local/bin/rke2 --version
```

**Resultado esperado:** Versão desejada deve aparecer

---

### 5. Reiniciar serviço
```bash
# Recarregar systemd
systemctl daemon-reload

# Iniciar serviço
systemctl start rke2-agent

# Verificar status

```

---

### 6. Reativar o nó

**Execute de um control plane:**
```bash
kubectl uncordon <nome-do-worker>
```

---

### 7. Validar atualização

```bash
# Verificar versão do nó
kubectl get nodes

# Verificar pods redistribuídos
kubectl get pods -A -o wide | grep <nome-do-worker>
```

---

## Checklist por Nó

- [ ] Arquivos copiados e checksum validado
- [ ] Serviço parado (rke2-server ou rke2-agent)
- [ ] Binários atualizados (verificar com `rke2 --version`)
- [ ] Serviço reiniciado
- [ ] Nó aparece como Ready
- [ ] Versão correta em `kubectl get nodes`
- [ ] Pods do sistema funcionando (control plane)
- [ ] Aguardado 2-5 minutos de estabilização

---

## Troubleshooting

### Erro de permissão no tar
**Solução:** Executar como root (`sudo su -`)

### Serviço não inicia
**Verificar logs:** `journalctl -u rke2-server -xe` ou `journalctl -u rke2-agent -xe`

### Nó não fica Ready
**Aguardar:** Até 5 minutos
**Verificar:** `kubectl describe node <nome-do-no>`

### Versão não atualiza
**Verificar:** Se o binário foi extraído corretamente em `/usr/local/bin/rke2`
**Executar:** `/usr/local/bin/rke2 --version` para confirmar

---

## Observações Importantes

- **Os mesmos arquivos de instalação servem para Control Planes e Workers**
- Sempre execute como root
- Aguarde cada nó estabilizar antes de prosseguir
- Não atualize múltiplos control planes simultaneamente
- Em produção, considere fazer backup do etcd antes de cada control plane
- Monitore aplicações críticas durante a atualização dos workers

**Tempo estimado:** 10-15 minutos por nó (incluindo estabilização)
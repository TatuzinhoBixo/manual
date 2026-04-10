## Comandos Linux Variados

Coleção de comandos úteis para administração de sistemas Linux.

### Gerenciamento de Memória

#### Limpar Swap

```bash
sudo swapoff -av && sudo swapon -av
```

### Listagem de Arquivos

#### Ordenar por tamanho e data

```bash
ls -lhtSr
```

### Limpeza de Arquivos Antigos

#### Remover arquivos com mais de 30 dias

```bash
find $PWD -type f -mtime +30 -exec rm {} \;
```

### Logrotate

#### Testar configuração

```bash
logrotate -d /etc/logrotate.conf
```

#### Testar arquivo específico

```bash
sudo logrotate -d /etc/logrotate.d/<arquivo>
```

### Curl - Verificar Resposta HTTP

```bash
curl -I -s <url> | head -n 1
```

### Conexões de Rede

#### Quantidade de conexões ativas

```bash
ss -t | wc -l
```

### Compactação

#### Criar arquivo tar.gz

```bash
tar -czvf <arquivo>.tar.gz <diretorio>
```

### Editor de Texto Padrão

#### Listar editores disponíveis

```bash
update-alternatives --list editor
```

#### Definir vim como padrão

```bash
update-alternatives --set editor /usr/bin/vim.basic
```

### Gerenciamento de Usuários

#### Copiar chave SSH para servidor remoto

```bash
ssh-copy-id -i /home/<usuario>/.ssh/id_rsa.pub <usuario>@<ip>
```

#### Criar usuário com home customizado

```bash
useradd --system --shell /bin/bash --create-home --home-dir /var/lib/<usuario> <usuario>
```

#### Adicionar usuário ao sudoers

```bash
echo '<usuario> ALL=(ALL) NOPASSWD: ALL' | sudo tee -a /etc/sudoers
```

### Configuração do Vim

Criar arquivo `~/.vimrc`:

```vim
" Números de linha
set number
set relativenumber

" Indentação
set autoindent
set smartindent
set expandtab
set tabstop=2
set shiftwidth=2

" Visual
syntax on
set showmatch
set ruler
set cursorline

" Caracteres invisíveis
set list
set listchars=tab:»·,trail:·

" Busca
set incsearch
set hlsearch

" Autocompletar
set wildmenu
set wildmode=longest:full,full

" Histórico e backup
set history=1000
set nobackup
set nowritebackup
set noswapfile

" Scroll
set scrolloff=5
set sidescrolloff=5

" Mouse
set mouse=a

" Clipboard do sistema
set clipboard=unnamedplus

" Remover espaços no final ao salvar
autocmd BufWritePre * :%s/\s\+$//e

" Atalhos
nnoremap <Space>w :wq!<CR>
nnoremap <Space>q :q<CR>
nnoremap <Space>s :w<CR>
```

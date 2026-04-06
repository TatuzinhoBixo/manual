resource "proxmox_virtual_environment_file" "cloud_config" {
  content_type = "snippets"
  datastore_id = "local"
  node_name = "tatuserv"
  source_raw {
    data = <<-EOF
users:
  - default
  - name: tatu    
    groups:
      - sudo      
    shell: /bin/bash
    ssh_authorized_keys:
      - ${var.ssh_public_key}  
package_update: true         
package_upgrade: true     
packages:
  - qemu-agent     
  - vim           
  - chrony        
  - nfs-common    
  - htop
  - git
  - telnet
  - btop
  - net-tools
  - bind9-dnsutils
write_files:
- path: /home/tatu/.vimrc
  owner: tatu:tatu
  permissions: '0644'
  content: |
    " ============================================================
    " .vimrc - SysAdmin / DevOps (Celito)
    " ============================================================
    set number
    set relativenumber
    set cursorline
    set scrolloff=8
    set colorcolumn=120
    set signcolumn=yes
    set termguicolors
    set noswapfile
    set nobackup
    set undofile
    set undodir=~/.vim/undodir
    set hidden
    set confirm
    set autoread
    set updatetime=300
    set hlsearch
    set incsearch
    set ignorecase
    set smartcase
    set tabstop=2
    set shiftwidth=2
    set expandtab
    set smartindent
    set autoindent
    filetype plugin indent on
    autocmd FileType yaml setlocal ts=2 sw=2 expandtab
    autocmd FileType yml  setlocal ts=2 sw=2 expandtab
    set clipboard=unnamedplus
    set laststatus=2
    set showcmd
    set wildmenu
    set wildmode=longest:full,full
    set splitbelow
    set splitright
    syntax on
    set background=dark
    let mapleader = " "
    nnoremap <leader>/ :nohlsearch<CR>
    nnoremap <C-h> <C-w>h
    nnoremap <C-j> <C-w>j
    nnoremap <C-k> <C-w>k
    nnoremap <C-l> <C-w>l
    nnoremap <leader>w :w<CR>
    nnoremap <leader>q :q!<CR>
    nnoremap <leader>r :source ~/.vimrc<CR>
    set encoding=utf-8
    set fileencoding=utf-8

runcmd:
  - systemctl enable qemu-guest-agent
  - systemctl start qemu-guest-agent
  - timedatectl set-timezone America/Manaus
  - systemctl enable chrony
  - systemctl start chrony
  - mkdir -p /home/tatu/.vim/undodir
  - chown -R tatu:tatu /home/tatu/.vim
EOF

  file_name = "cloud-config.yaml"
  }
}

resource "proxmox_virtual_environment_vm" "ubuntu_vm"{
  name = "ubuntu-terraform-ex01"
  node_name = "tatuserv"
  vm_id = 200
  agent {
    enable = true
  }
  cpu {
    cores = 2
    type = "x86-64-v2-AES"
  }
  memory {
    dedicated = 2048
  }
  disk {
    datastore_id = var.storage
    #file_id = proxmox_virtual_environment_download_file.ubuntu_cloud_image.id #baixa a imagem caso não tenha
    file_id = "local:iso/ubuntu-24.04-cloudimg-amd64.img"
    interface = "virtio0"
    size = 40
  }
  network_device {
    bridge = "vmbr0"
    model = "virtio"
  }
  initialization {
    user_data_file_id = proxmox_virtual_environment_file.cloud_config.id
    dns {
      servers = var.dns_servers
    }
    ip_config {
      ipv4 {
        address = var.vm_ip
        gateway = var.gateway
      }
    }
  }
  lifecycle {
    ignore_changes = []
  }
}
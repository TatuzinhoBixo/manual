# Aumento de disco quando é extendido no virtualizador e disco LVM
saber as configurações existentes 
```bash
pvdisplay
vgdisplay
lvdisplay
df -h
fdisk -l
```

executar o comando 
```bash
growpart /dev/<part> <numero>
```

Redimencionar
```bash
pvresize /dev/<part><numero>
```

Aumentar o lv
```bash
lvextend -l +100%FREE /dev/ubuntu-vg/ubuntu-lv --resizefs
```

Verificar
```
df -h /
```

# Aumento de disco quando é extendido no virtualizador e disco LVM

Instalar o partprobe
```bash
apt install parted
```

Abrir o parted
```bash
sudo parted /dev/sda
```

Exiba as partições e verifique os números
```
print
```

Redimesione as partições
```bash
resizepart <número> 100%
```

saia do parted
```bash
quit
```

Agora atualize o tamanho do disco no lvm 
```bash 
sudo partprobe -s
```

Remimensione o PV
```bash
sudo pvresize <dev/disk>
```

Estenda o VG
```bash
sudo lvextend -l +100%FREE <endereçoLV>
```

Estender o sistema de arquivos
```bash
sudo resize2fs <endereçoLV>
```

Verificar as partições
```bash
lsblk 
```



# Provisionamento de Storage LVM com XFS para Exportação NFS

Este procedimento descreve a configuração do disco bruto `/dev/sdb` (800 GiB) utilizando LVM e XFS para servir como armazenamento persistente via NFS em ambiente de produção.

## 1. Camada de Abstração de Hardware (LVM)
Preparação do disco físico e criação dos volumes lógicos para permitir flexibilidade e expansão futura.

```bash
# Inicializa o disco físico (Physical Volume)
sudo pvcreate /dev/sdb

# Cria o grupo de volumes (Volume Group)
sudo vgcreate vg_storage /dev/sdb

# Cria o volume lógico (Logical Volume) usando 100% do espaço disponível
sudo lvcreate -l 100%FREE -n lv_storage vg_storage


# Formata o volume lógico com o sistema de arquivos XFS
sudo mkfs.xfs /dev/mapper/vg_storage-lv_storage

# Configura a montagem persistente no /etc/fstab
echo "/dev/mapper/vg_storage-lv_storage /var/nfs/storage xfs defaults 0 0" | sudo tee -a /etc/fstab

# Efetiva a montagem do volume
sudo mount -a


# Ajusta o proprietário e permissões para o padrão NFS (nobody:nogroup)
sudo chown nobody:nogroup /var/nfs/storage
sudo chmod 775 /var/nfs/storage

# Atualiza os exports do NFS para disponibilizar o novo storage
sudo exportfs -rav


# Servidor remoto
# Instala os utilitários necessários
sudo apt update && sudo apt install nfs-common -y

# Cria o diretório de montagem local
sudo mkdir -p /mnt/nfs_storage

# Montagem manual para teste (volátil)
sudo mount -t nfs <IP_DO_SERVIDOR>:/var/nfs/storage /mnt/nfs_storage -o rw,soft,timeo=30

# Configuração de montagem persistente no /etc/fstab do cliente
echo "<IP_DO_SERVIDOR>:/var/nfs/storage /mnt/nfs_storage nfs defaults,rw,soft,timeo=30 0 0" | sudo tee -a /etc/fstab

-----------------------------

# Letras em MAIUSCULO são nomes que podem ser personalizados#Criar o volume no disco
pvcreate VOLUME /dev/sd* #nome disco virtual e o nome do dev

# Criar o grupo de volume
vgcreate GRVOLUME /dev/sd*  #nome do grupo e o nome do dev

# Criar o volume lógico
lvcreate -L 5GB -n FILES GRVOLUME #criar 5GB volume logico com o nome FILES e informar o nome do grupo

# Formatar o disco lógico
mkfs.ext4 LVPATH #Formatar o disco em ext4
sudo mkfs.xfs -f /dev/sdb1 #Formatar o disco em em xfs


# Montar o volume
mount "LVPAHT" /mnt/PASTA #Montar a partição lvm

##############################

# Aumentar o volume após um novo hd
# Formatar o disco com LVM

pvcreate /dev/sd** #Adicionar o disco virtual

# Atribuir o disco criado
vgextend GRVLOUME /dev/sd**  # Adicionar o disco no grupo

# Desmontar a partição
umount /mnt/PASTA

#Aumentar o disco logico
lvextend -L 10GB LVPATH # Aumentar a partição para 10GB
lvextend -L +10GB LVPATH # Aumentar a partição em 10GB
lvextend -l +100%FREE LVPATH # Aumentar para o total da partição

# Procurar por erros
e2fsck -f LVPATH

# Para saber o formato df -hT

# Redimencionar a partição
resize2fs LVPATH
xfs_growfs LVPATH # caso seja no formato xfs

# Montar a partição novamente
mount LVPATH /mnt/PASTA

# Incluir no fstab, esse no caso está como xfs
/dev/sdb1  <ponto-montagem>  xfs  defaults  0  0

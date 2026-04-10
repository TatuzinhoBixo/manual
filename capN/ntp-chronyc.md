# Instalação chrony
apt-get install chrony
dnf install chrony

#Ativação
systemctl enable chronyd

# Chegar a atividade
chronyc activity
chronyc sources
chronyc tracking
timedatectl

# Configuração 
vim /etc/chrony.conf
server SERVIDORNTP ibusrt

# Restart no serviço
systemctl restart chronyd


# Instalação ntpd
apt install ntp ntpdate ntp-doc

# Ativação
systemctl enable ntpd

# Sicornizar o relógio
ntpdate SERVIDORNTP

# Em caso de erro "ntpdate[6733]: the NTP socket is in use, exiting"
systemctl stop ntpd
rm /etc/localtime
ln -s /usr/share/zoneinfo/America/Manaus /etc/localtime
systemctl start ntpd

# ConfiguraçãoOpcional 
vim /etc/ntp.conf
Adicionar server a.ntp.br
systemctl restart ntpd
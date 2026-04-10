## Configuração de Rede no Linux

Procedimentos para configurar rede em diferentes distribuições Linux.

### Instalar Utilitários de Rede

```bash
# Ubuntu/Debian
sudo apt install inetutils-ping htop net-tools
```

### Debian - Arquivo /etc/network/interfaces

#### IP Fixo

```bash
sudo vim /etc/network/interfaces
```

```
auto <interface>
iface <interface> inet static
    address <ip>
    netmask <mascara>
    gateway <gateway>
```

Reiniciar networking:

```bash
sudo systemctl restart networking
```

#### DHCP

```
auto <interface>
iface <interface> inet dhcp
```

### Configurar DNS Fixo (systemd-resolved)

```bash
sudo vim /etc/systemd/resolved.conf
```

```
[Resolve]
DNS=<ip-dns-1> <ip-dns-2>
```

Reiniciar o serviço:

```bash
sudo systemctl restart systemd-resolved
```

### RHEL/CentOS - Usando nmcli

#### Listar conexões

```bash
nmcli con show
nmcli dev show
```

#### Configurar IP via DHCP

```bash
nmcli con mod "<nome-conexao>" ipv4.method auto
```

#### Configurar IP Fixo

```bash
nmcli con mod "<nome-conexao>" \
  ifname "<interface>" \
  type ethernet \
  ip4 <ip>/<mascara> \
  gw4 <gateway> \
  ipv4.dns <ip-dns>
```

#### Adicionar DNS

```bash
nmcli con mod "<nome-conexao>" ipv4.dns <ip-dns>
```

#### Gerenciar conexão

```bash
nmcli connection down "<nome-conexao>"
nmcli connection up "<nome-conexao>"
nmcli connection delete id "<nome-conexao>"
```

### Ubuntu - Netplan (YAML)

Arquivo em `/etc/netplan/`:

#### DHCP

```yaml
network:
  version: 2
  renderer: networkd
  ethernets:
    <interface>:
      dhcp4: true
```

#### IP Fixo

```yaml
network:
  version: 2
  ethernets:
    <interface>:
      dhcp4: false
      addresses:
        - <ip>/<mascara>
      routes:
        - to: default
          via: <gateway>
      nameservers:
        addresses:
          - <ip-dns-1>
          - <ip-dns-2>
```

Aplicar configuração:

```bash
sudo netplan apply
```

### Verificar Configuração

```bash
ip addr show
ip route show
cat /etc/resolv.conf
```

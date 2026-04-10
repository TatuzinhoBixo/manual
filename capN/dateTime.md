## Configuração de Data e Hora no Linux

Procedimento para configurar sincronização de horário usando Chrony.

### Instalação do Chrony

```bash
# Debian/Ubuntu
sudo apt install chrony

# RHEL/CentOS/Fedora
sudo dnf install chrony
```

### Configuração Básica

```bash
# Iniciar o serviço
sudo systemctl start chronyd

# Habilitar na inicialização
sudo systemctl enable chrony

# Definir timezone
sudo timedatectl set-timezone America/Manaus

# Reiniciar para aplicar
sudo systemctl restart chronyd
```

### Verificar Status

```bash
timedatectl
```

### Configurar Servidor NTP Personalizado

Editar `/etc/chrony.conf`:

```bash
sudo vim /etc/chrony.conf
```

Adicionar servidor:

```
server <servidor-ntp> iburst
```

Servidores NTP públicos do Brasil:

```
server a.st1.ntp.br iburst
server b.st1.ntp.br iburst
server c.st1.ntp.br iburst
```

Reiniciar após alteração:

```bash
sudo systemctl restart chronyd
```

### Timezones Comuns no Brasil

| Timezone | Região |
|----------|--------|
| America/Sao_Paulo | Brasília, SP, RJ |
| America/Manaus | Manaus, AM |
| America/Cuiaba | Cuiabá, MT |
| America/Belem | Belém, PA |
| America/Fortaleza | Fortaleza, CE |

### Listar Timezones Disponíveis

```bash
timedatectl list-timezones | grep America
```

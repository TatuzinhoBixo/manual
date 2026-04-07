# Instalação do Servidor DNS (BIND9)

## Descrição

Este documento detalha a instalação e configuração do BIND9 como servidor DNS interno. O DNS resolve os nomes do cluster Kubernetes e das aplicações.

## Variáveis de Configuração

| Variável | Descrição | Exemplo |
|:---------|:----------|:--------|
| `<DOMINIO>` | Domínio interno | exemplo.com.br |
| `<IP_DNS>` | IP do servidor DNS | 192.168.1.40 |
| `<IP_WILDCARD>` | IP para registros wildcard (Ingress) | 192.168.1.41 |
| `<EMAIL_ADMIN>` | Email do administrador (formato DNS) | admin.exemplo.com.br |

---

## Etapa 1: Instalação

```bash
sudo apt update
sudo apt install -y bind9 bind9utils bind9-doc dnsutils
```

---

## Etapa 2: Configurar Zona DNS

### 2.1 Declarar a zona

Edite `/etc/bind/named.conf.local`:

```bash
sudo vim /etc/bind/named.conf.local
```

Adicione:

```bind
zone "<DOMINIO>" {
    type master;
    file "/etc/bind/zones/db.<DOMINIO>";
};
```

### 2.2 Criar diretório de zonas

```bash
sudo mkdir -p /etc/bind/zones
```

### 2.3 Criar arquivo de zona

```bash
sudo vim /etc/bind/zones/db.<DOMINIO>
```

Conteúdo:

```bind
;
; Zona DNS para <DOMINIO>
;
$TTL 604800
@   IN  SOA ns1.<DOMINIO>. <EMAIL_ADMIN>. (
            2024010101  ; Serial (AAAAMMDDNN)
            604800      ; Refresh (7 dias)
            86400       ; Retry (1 dia)
            2419200     ; Expire (28 dias)
            604800 )    ; Negative Cache TTL (7 dias)

; Nameservers
@       IN  NS      ns1.<DOMINIO>.

; Registros A
@       IN  A       <IP_DNS>
ns1     IN  A       <IP_DNS>

; Registro Wildcard - direciona *.<DOMINIO> para o Ingress
*       IN  A       <IP_WILDCARD>

; Registros específicos (adicione conforme necessário)
; kube    IN  A       <IP_HAPROXY>
; grafana IN  A       <IP_WILDCARD>
```

---

## Etapa 3: Configurar Forwarders

Edite `/etc/bind/named.conf.options`:

```bash
sudo vim /etc/bind/named.conf.options
```

Conteúdo:

```bind
options {
    directory "/var/cache/bind";

    // Habilitar recursão para consultas externas
    recursion yes;
    allow-recursion { any; };
    allow-query { any; };

    // Forwarders - DNS públicos para resolver domínios externos
    forwarders {
        8.8.8.8;        // Google DNS
        8.8.4.4;        // Google DNS
        1.1.1.1;        // Cloudflare DNS
    };

    // DNSSEC (desabilitado para simplificar)
    dnssec-validation no;

    // IPv6
    listen-on-v6 { any; };

    // Transferência de zona apenas local
    allow-transfer { localhost; };
};
```

---

## Etapa 4: Validar e Iniciar

### Validar configuração geral

```bash
sudo named-checkconf
```

### Validar arquivo de zona

```bash
sudo named-checkzone <DOMINIO> /etc/bind/zones/db.<DOMINIO>
```

### Reiniciar serviço

```bash
sudo systemctl restart bind9
sudo systemctl enable bind9
```

---

## Etapa 5: Testar

### Testar resolução local

```bash
dig @<IP_DNS> test.<DOMINIO>
```

### Testar resolução externa (via forwarders)

```bash
dig @<IP_DNS> google.com
```

---

## Observações

> **Serial**: Sempre incremente o serial ao modificar a zona. Formato recomendado: `AAAAMMDDNN` (ano, mês, dia, número da alteração).

> **Segurança**: A configuração `allow-recursion { any; }` permite consultas de qualquer IP. Em produção, restrinja para a rede interna:
> ```bind
> allow-recursion { 192.168.1.0/24; localhost; };
> ```

> **Wildcard**: O registro `*` direciona todos os subdomínios não declarados explicitamente para o IP do Ingress Controller.

## Referências

- [Documentação BIND9](https://bind9.readthedocs.io/)
- [DNS Zone File Format](https://www.zytrax.com/books/dns/ch8/)

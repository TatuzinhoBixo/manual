## Verificar Validade de Certificado SSL via Bash

Comando para verificar a data de expiração de um certificado SSL diretamente pelo terminal, útil para monitoramento e automação.

### Verificar Data de Expiração

```bash
echo | openssl s_client -connect <dominio>:443 -servername <dominio> 2>/dev/null | openssl x509 -noout -enddate
```

#### Exemplo

```bash
echo | openssl s_client -connect exemplo.com.br:443 -servername exemplo.com.br 2>/dev/null | openssl x509 -noout -enddate
```

#### Saída esperada
```
notAfter=Dec 31 23:59:59 2025 GMT
```

### Verificar Datas de Emissão e Expiração

```bash
echo | openssl s_client -connect <dominio>:443 -servername <dominio> 2>/dev/null | openssl x509 -noout -dates
```

### Ver Detalhes Completos do Certificado

```bash
echo | openssl s_client -connect <dominio>:443 -servername <dominio> 2>/dev/null | openssl x509 -noout -text
```

### Script para Verificar Múltiplos Domínios

```bash
for dominio in site1.com.br site2.com.br site3.com.br; do
  echo -n "$dominio: "
  echo | openssl s_client -connect $dominio:443 -servername $dominio 2>/dev/null | openssl x509 -noout -enddate
done
```

### Verificar Dias Restantes

```bash
dominio="<dominio>"
expiry=$(echo | openssl s_client -connect $dominio:443 -servername $dominio 2>/dev/null | openssl x509 -noout -enddate | cut -d= -f2)
expiry_epoch=$(date -d "$expiry" +%s)
now_epoch=$(date +%s)
days_left=$(( (expiry_epoch - now_epoch) / 86400 ))
echo "Dias restantes: $days_left"
```

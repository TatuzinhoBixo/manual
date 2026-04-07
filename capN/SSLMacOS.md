# Utilitários SSL

## Descrição

Comandos úteis para verificação e gerenciamento de certificados SSL.

---

## Verificar Data de Validade

```bash
echo | openssl s_client -connect <DOMINIO>:443 -servername <DOMINIO> 2>/dev/null | openssl x509 -noout -enddate
```

## Verificar Informações do Certificado

```bash
echo | openssl s_client -connect <DOMINIO>:443 -servername <DOMINIO> 2>/dev/null | openssl x509 -noout -text
```

## Verificar Cadeia de Certificados

```bash
echo | openssl s_client -connect <DOMINIO>:443 -servername <DOMINIO> -showcerts 2>/dev/null
```

## Verificar Certificado Local

```bash
openssl x509 -in <ARQUIVO_CERT> -noout -dates
openssl x509 -in <ARQUIVO_CERT> -noout -subject -issuer
```

---

## Referências

- [Documentação OpenSSL](https://www.openssl.org/docs/)
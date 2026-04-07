### Pegar o csr
openssl req -new -newkey rsa:2048 -nodes -keyout SEU_DOMINIO.key -out SEU_DOMINIO.csr


### Testes de Certificados
Testes de corespondencia:

```bash
openssl x509 -noout -modulus -in certificado.crt | openssl md5
```

```bash
openssl rsa -noout -modulus -in private.key | openssl md5
```

```bash
openssl req -noout -modulus -in requisicao.csr | openssl md5
```

Regra: O hash MD5 retornado tem que ser idêntico. Se for diferente, a chave não abre esse certificado.

Diferenciar o Inter vs Site
```bash
openssl x509 -noout -subject -issuer -in arquivo.crt
```
Certificado do Site (Leaf):
  subject: O domínio do seu site (ex: CN=servicos.am.gov.br).
  ssuer: O nome da autoridade (ex: CN=Sectigo RSA Organization Validation).

Certificado Intermediário (Chain/CA):
  subject: O nome da autoridade (ex: CN=Sectigo RSA Organization Validation).
  issuer: Uma autoridade raiz ou outra intermediária (ex: CN=UserTrust RSA CA).

Certificado Raiz (Root):
  subject e issuer são iguais.


### VirtualHost / apache
```bash
<VirtualHost *:443>
    ServerName seudominio.com.br

    SSLEngine on
    # Aponta para o arquivo que contém APENAS o certificado do domínio
    SSLCertificateFile /caminho/site.crt
    
    # Aponta para a chave privada
    SSLCertificateKeyFile /caminho/privada.key
    
    # Aponta para o arquivo dos intermediários (Obrigatório para mobile/browsers antigos)
    SSLCertificateChainFile /caminho/intermediate.crt
</VirtualHost>
```

```bash
<VirtualHost *:443>
    ServerName seudominio.com.br

    SSLEngine on
    # O arquivo fullchain.pem já contém o site + intermediários
    SSLCertificateFile /etc/letsencrypt/live/dom/fullchain.pem
    
    # Chave privada
    SSLCertificateKeyFile /etc/letsencrypt/live/dom/privkey.pem
    
    # ChainFile não é necessário aqui pois já está no fullchain
</VirtualHost>
```

### VritualHost Nginx
```bash
server {
    listen 443 ssl;
    server_name seudominio.com.br;

    # Aponta para o arquivo COMPLETO (Site + Intermediários)
    # No Let's Encrypt é o fullchain.pem. No manual é o bundle que você criou.
    ssl_certificate /etc/nginx/ssl/bundle_completo.crt;
    
    # Chave privada
    ssl_certificate_key /etc/nginx/ssl/privada.key;
    
    # Otimizações recomendadas
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
}
```

### Certificados lets encript

privkey.pem	          A Chave Privada.	                      .key
cert.pem	            Apenas o certificado do site.	          .crt (sozinho)
chain.pem	Apenas o(s) intermediário(s).	                  .intermediate.crt
fullchain.pem	        Certificado do site + Intermediários.	  .pem (bundle)

### 
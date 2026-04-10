## Comandos Keytool para Certificados Java

O `keytool` é uma ferramenta de gerenciamento de chaves e certificados incluída no JDK. Utilizado para importar certificados SSL em keystores Java.

### Importar Certificado na Keystore

```bash
keytool -v -import -noprompt -trustcacerts \
  -alias "<nome-alias>" \
  -file <caminho-certificado>.crt \
  -keystore <caminho-jdk>/jre/lib/security/cacerts \
  -storepass changeit
```

#### Parâmetros

| Parâmetro | Descrição |
|-----------|-----------|
| `-v` | Modo verbose |
| `-import` | Importar certificado |
| `-noprompt` | Não solicitar confirmação |
| `-trustcacerts` | Confiar em certificados da CA |
| `-alias` | Nome identificador do certificado |
| `-file` | Caminho do arquivo de certificado |
| `-keystore` | Caminho da keystore Java |
| `-storepass` | Senha da keystore (padrão: changeit) |

### Localização Comum da Keystore

```bash
# Java 8+
$JAVA_HOME/jre/lib/security/cacerts

# Java 11+
$JAVA_HOME/lib/security/cacerts
```

### Listar Certificados na Keystore

```bash
keytool -list -keystore <caminho-jdk>/jre/lib/security/cacerts -storepass changeit
```

### Listar com Detalhes de um Alias

```bash
keytool -list -v -alias "<nome-alias>" -keystore <caminho-jdk>/jre/lib/security/cacerts -storepass changeit
```

### Remover Certificado da Keystore

```bash
keytool -delete -alias "<nome-alias>" -keystore <caminho-jdk>/jre/lib/security/cacerts -storepass changeit
```

### Exportar Certificado da Keystore

```bash
keytool -export -alias "<nome-alias>" -file <certificado-exportado>.crt -keystore <caminho-jdk>/jre/lib/security/cacerts -storepass changeit
```

> **Nota**: A senha padrão da cacerts é `changeit`. Em ambiente de produção, considere alterá-la.

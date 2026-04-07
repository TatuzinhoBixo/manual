# Kubernetes Secrets

## Descrição

Secrets são objetos Kubernetes para armazenar dados sensíveis como senhas, tokens e certificados. Diferente de ConfigMaps, Secrets são codificados em base64 e podem ter acesso restrito via RBAC.

## Variáveis de Configuração

| Variável | Descrição | Exemplo |
|:---------|:----------|:--------|
| `<NOME_SECRET>` | Nome do secret | tls-meusite |
| `<NAMESPACE>` | Namespace do secret | default |
| `<CAMINHO_CERT>` | Caminho do certificado | /etc/ssl/cert.pem |
| `<CAMINHO_KEY>` | Caminho da chave privada | /etc/ssl/key.pem |

---

## Tipos de Secrets

| Tipo | Uso |
|:-----|:----|
| `kubernetes.io/tls` | Certificados TLS |
| `kubernetes.io/dockerconfigjson` | Credenciais de registry |
| `Opaque` | Dados genéricos (padrão) |

---

## Secret TLS (Certificados)

### Criar secret TLS

```bash
kubectl create secret tls <NOME_SECRET> \
  --cert=<CAMINHO_CERT> \
  --key=<CAMINHO_KEY> \
  -n <NAMESPACE>
```

### Atualizar secret TLS existente

```bash
kubectl create secret tls <NOME_SECRET> \
  --cert=<CAMINHO_CERT> \
  --key=<CAMINHO_KEY> \
  -n <NAMESPACE> \
  --dry-run=client -o yaml | kubectl apply -f -
```

---

## Secret de Registry (Docker)

Para autenticação em registries privados:

```bash
kubectl create secret docker-registry <NOME_SECRET> \
  --docker-server=<URL_REGISTRY> \
  --docker-username=<USUARIO> \
  --docker-password=<SENHA> \
  -n <NAMESPACE>
```

### Usar no Deployment

```yaml
spec:
  template:
    spec:
      imagePullSecrets:
        - name: <NOME_SECRET>
```

---

## Secret Genérico (Opaque)

Para senhas e dados genéricos:

```bash
kubectl create secret generic <NOME_SECRET> \
  --from-literal=password=<SENHA> \
  --from-literal=username=<USUARIO> \
  -n <NAMESPACE>
```

### Usar como variável de ambiente

```yaml
env:
  - name: DB_PASSWORD
    valueFrom:
      secretKeyRef:
        name: <NOME_SECRET>
        key: password
```

---

## Comandos Úteis

```bash
# Listar secrets
kubectl get secrets -n <NAMESPACE>

# Ver detalhes
kubectl describe secret <NOME_SECRET> -n <NAMESPACE>

# Decodificar valor
kubectl get secret <NOME_SECRET> -n <NAMESPACE> -o jsonpath="{.data.<KEY>}" | base64 -d

# Deletar secret
kubectl delete secret <NOME_SECRET> -n <NAMESPACE>
```

---

## Observações de Segurança

> **Base64 não é criptografia**: Secrets são apenas codificados, não criptografados. Considere usar:
> - Sealed Secrets
> - HashiCorp Vault
> - External Secrets Operator

---

## Referências

- [Documentação Kubernetes Secrets](https://kubernetes.io/docs/concepts/configuration/secret/)
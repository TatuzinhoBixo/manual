# Criando Secret de Pull de Imagem para Registry Privado no Kubernetes

Este documento explica o passo a passo para criar um **Secret do tipo `kubernetes.io/dockerconfigjson`** que permite que pods no cluster Kubernetes façam pull de imagens de um registry privado autenticado.

## Exemplo prático: Registry `registry.tatulab.com.br`

**Informações usadas no exemplo:**

- **Registry**: `registry.tatulab.com.br`
- **Usuário**: `deploy`
- **Senha/Token**: `glpat-APyJRA1bKHROG86-KCW7x286MQp1OjEH.01.0w170hgp5` (Personal Access Token do GitLab)

## Passo a passo

### 1. Gerar o valor de `auth`

O campo `auth` é a string `username:password` codificada em **base64**.

```bash
echo -n 'deploy:glpat-APyJRA1bKHROG86-KCW7x286MQp1OjEH.01.0w170hgp5' | base64 | tr -d '\r\n'


resultado
ZGVwbG95OmdscGF0LUFQeUpSQTFiS0hST0c4Ni1LQ1c3eDI4Nk1RcDFPakVILjAxLjB3MTcwZ2dwNQ==

montar json
{
  "auths": {
    "registry.tatulab.com.br": {
      "username": "deploy",
      "password": "glpat-APyJRA1bKHROG86-KCW7x286MQp1OjEH.01.0w170hgp5",
      "auth": "ZGVwbG95OmdscGF0LUFQeUpSQTFiS0hST0c4Ni1LQ1c3eDI4Nk1RcDFPakVILjAxLjB3MTcwZ2dwNQ=="
    }
  }
}

3. Codificar o JSON inteiro em base64
echo -n '{"auths":{"registry.tatulab.com.br":{"username":"deploy","password":"glpat-APyJRA1bKHROG86-KCW7x286MQp1OjEH.01.0w170hgp5","auth":"'$(echo -n 'deploy:glpat-APyJRA1bKHROG86-KCW7x286MQp1OjEH.01.0w170hgp5' | base64 | tr -d '\r\n')'"}}}' | base64 | tr -d '\r\n'

resultado final
eyJhdXRocyI6eyJyZWdpc3RyeS50YXR1bGFiLmNvbS5iciI6eyJ1c2VybmFtZSI6ImRlcGxveSIsInBhc3N3b3JkIjoiZ2xwYXQtQVB5SlJBMWJLSFJPRzg2LUtDVzd4Mjg2TVFwMU9qRUguMDEuMHcxNzBoZ3A1IiwiYXV0aCI6IlpHVndiRzk1T21kc2NHRjBMVUZRZVVwU1FURmlTMGhTVDBjNE5pMUxRMWMzZURJNE5rMVJjREZQYWtWSUxqQXhMakIzTVRjd2FHZHdOUT09In19fQ==


Criar o Secret no Kubernetes
apiVersion: v1
kind: Secret
metadata:
  name: registry-tatulab-secret
  namespace: dcorp
  annotations:
    argocd.argoproj.io/sync-options: Replace=true   # opcional – útil com ArgoCD
type: kubernetes.io/dockerconfigjson
data:
  .dockerconfigjson: eyJhdXRocyI6eyJyZWdpc3RyeS50YXR1bGFiLmNvbS5iciI6eyJ1c2VybmFtZSI6ImRlcGxveSIsInBhc3N3b3JkIjoiZ2xwYXQtQVB5SlJBMWJLSFJPRzg2LUtDVzd4Mjg2TVFwMU9qRUguMDEuMHcxNzBoZ3A1IiwiYXV0aCI6IlpHVndiRzk1T21kc2NHRjBMVUZRZVVwU1FURmlTMGhTVDBjNE5pMUxRMWMzZURJNE5rMVJjREZQYWtWSUxqQXhMakIzTVRjd2FHZHdOUT09In19fQ==

# Sealed Secrets — Gerenciar credenciais via Git de forma segura

## 🧭 Por que este tutorial existe

Em GitOps (ArgoCD, Flux, etc) o estado desejado do cluster vive no Git. Mas **`Secret` do Kubernetes não pode ir cru pro Git** — base64 não é cifragem, é só encoding. Comitar `Secret` no repo é o mesmo que comitar a senha em texto puro.

**Sealed Secrets** resolve isso: você cifra o `Secret` com uma chave pública do cluster, gera um recurso `SealedSecret` (cifrado), e **esse sim** vai pro Git. Um controller no cluster decifra e materializa o `Secret` real automaticamente.

```
┌───────────────────────────────────────────────────────────────────┐
│                         FLUXO BÁSICO                               │
├───────────────────────────────────────────────────────────────────┤
│                                                                    │
│   1. kubectl create secret ... --dry-run=client -o yaml            │
│                          │                                         │
│                          ▼                                         │
│   2. kubeseal (CLI)  ── usa chave pública do cluster               │
│                          │                                         │
│                          ▼                                         │
│   3. SealedSecret cifrado (yaml)  ───►  commit no GitLab           │
│                                                       │            │
│                                                       ▼            │
│   4. ArgoCD aplica SealedSecret no cluster                         │
│                                                       │            │
│                                                       ▼            │
│   5. sealed-secrets-controller decifra ──► Secret nativo do K8s    │
│                                                                    │
└───────────────────────────────────────────────────────────────────┘
```

> **Alternativas consideradas e descartadas neste manual:**
> - **External Secrets Operator (ESO) + Vault/AWS SM/GCP SM** — mais robusto pra grandes empresas; pesado pra começar sem cofre externo já rodando
> - **sops + age/KMS** — cifra arquivos inteiros, integração com ArgoCD via plugin (config-management-plugin) que é mais chato de configurar

---

## Pré-requisitos

- Cluster Kubernetes com `kubectl` e `helm` configurados
- Acesso de admin (para instalar o controller no `kube-system`)
- Repositório Git para versionar os `SealedSecret`

---

## Etapa 1 — Instalar o controller no cluster

### 1.1 Adicionar o repo Helm

```bash
helm repo add sealed-secrets https://bitnami-labs.github.io/sealed-secrets
helm repo update
```

### 1.2 Instalar via Helm

```bash
helm install sealed-secrets sealed-secrets/sealed-secrets \
  -n kube-system \
  --set fullnameOverride=sealed-secrets-controller
```

> **Por que `fullnameOverride=sealed-secrets-controller`?** O Helm gera nomes como `sealed-secrets-sealed-secrets`. O override deixa nomes mais limpos e bate com o que a CLI `kubeseal` espera por padrão.

### 1.3 Verificar a instalação

```bash
kubectl -n kube-system get pods -l app.kubernetes.io/name=sealed-secrets
kubectl -n kube-system get svc sealed-secrets-controller
```

Esperado:

```
NAME                                          READY   STATUS    RESTARTS   AGE
sealed-secrets-controller-xxxxxxxxxx-xxxxx    1/1     Running   0          30s
```

> **Migração futura para ArgoCD:** mais adiante, o próprio controller deve virar uma `Application` ArgoCD (Helm). Por enquanto a instalação manual desbloqueia o trabalho.

---

## Etapa 2 — Instalar a CLI `kubeseal`

A CLI roda **na sua máquina** e usa a chave pública do controller pra cifrar.

### Linux x86_64

```bash
KUBESEAL_VERSION='0.27.1'
curl -L "https://github.com/bitnami-labs/sealed-secrets/releases/download/v${KUBESEAL_VERSION}/kubeseal-${KUBESEAL_VERSION}-linux-amd64.tar.gz" \
  | tar -xz kubeseal
sudo install -m 755 kubeseal /usr/local/bin/kubeseal
kubeseal --version
```

### macOS (Homebrew)

```bash
brew install kubeseal
```

### Verificação de comunicação com o controller

```bash
kubeseal --fetch-cert > /tmp/sealed-secrets-pub.pem
cat /tmp/sealed-secrets-pub.pem | head -5
```

Deve imprimir um certificado X.509 (`-----BEGIN CERTIFICATE-----`). Se falhar com erro de `connection refused`, conferir nome do controller (deve casar com o `--controller-name` da CLI, default é `sealed-secrets-controller` — mesmo do `fullnameOverride`).

---

## Etapa 3 — Backup da master key (CRÍTICO)

A chave master vive como `Secret` no `kube-system`. **Se o cluster for refeito sem essa chave, todos os `SealedSecret` no Git viram lixo** — não decifram mais.

### 3.1 Exportar o backup

```bash
kubectl -n kube-system get secret \
  -l sealedsecrets.bitnami.com/sealed-secrets-key \
  -o yaml > sealed-secrets-master-key-BACKUP.yaml
```

### 3.2 Guardar fora do Git, em local seguro

⚠️ **Esse arquivo contém a chave privada em texto plano.** É tão sensível quanto a senha de admin do cluster. **Nunca** commita no Git.

Opções:
- Cofre de senhas pessoal/equipe (Bitwarden, 1Password, KeePass, LastPass)
- Repositório Git **privado** com `git-crypt` ou `sops` (cifrado em outro nível)
- KMS de um cloud provider (AWS KMS, GCP KMS, Azure Key Vault)
- USB/SSD criptografado offline (último recurso, vulnerável a perda)

### 3.3 Restaurar em outro cluster (disaster recovery)

Se precisar provisionar um novo cluster e manter os `SealedSecret` existentes funcionando:

```bash
# 1. Aplicar o backup ANTES de instalar o controller
kubectl apply -f sealed-secrets-master-key-BACKUP.yaml

# 2. Instalar o controller normalmente (passo 1.2)
helm install sealed-secrets sealed-secrets/sealed-secrets ...

# 3. Reiniciar para forçar a leitura da chave restaurada
kubectl -n kube-system rollout restart deploy sealed-secrets-controller
```

---

## Etapa 4 — Workflow padrão de selar um Secret

Padrão pra todo Secret novo:

### 4.1 Criar o Secret (sem aplicar)

```bash
kubectl create secret generic <NOME_SECRET> \
  --from-literal=<chave>=<valor> \
  --namespace <NAMESPACE> \
  --dry-run=client -o yaml > /tmp/<NOME_SECRET>.yaml
```

### 4.2 Selar com `kubeseal`

```bash
kubeseal --format yaml < /tmp/<NOME_SECRET>.yaml > <NOME_SECRET>-sealed.yaml
```

### 4.3 Conferir e commitar

```bash
cat <NOME_SECRET>-sealed.yaml
```

Saída esperada (a parte cifrada vai aparecer como `encryptedData:`):

```yaml
apiVersion: bitnami.com/v1alpha1
kind: SealedSecret
metadata:
  name: <NOME_SECRET>
  namespace: <NAMESPACE>
spec:
  encryptedData:
    <chave>: AgB7nZ...string-grande-cifrada...
  template:
    metadata:
      name: <NOME_SECRET>
      namespace: <NAMESPACE>
    type: Opaque
```

Esse arquivo é **seguro pra commitar no Git**. Apaga o `/tmp/<NOME_SECRET>.yaml` (não cifrado).

```bash
rm /tmp/<NOME_SECRET>.yaml
git add <NOME_SECRET>-sealed.yaml
git commit -m "chore(secrets): seal <NOME_SECRET>"
git push
```

### 4.4 Aplicar (manualmente ou via ArgoCD)

```bash
kubectl apply -f <NOME_SECRET>-sealed.yaml
```

O controller decifra e cria automaticamente o `Secret` correspondente:

```bash
kubectl -n <NAMESPACE> get sealedsecret,secret | grep <NOME_SECRET>
```

---

## Etapa 5 — Selar Secrets já existentes no cluster

Se você já tem `Secret`s rodando que precisam ir pro Git:

### 5.1 Exportar do cluster

```bash
kubectl -n <NAMESPACE> get secret <NOME_SECRET> -o yaml > /tmp/<NOME_SECRET>-export.yaml
```

### 5.2 Limpar metadata transitória

Antes de selar, remover campos gerados pelo K8s (`uid`, `resourceVersion`, `creationTimestamp`, etc):

```bash
kubectl -n <NAMESPACE> get secret <NOME_SECRET> -o yaml \
  | grep -v -E 'uid:|resourceVersion:|creationTimestamp:|selfLink:|^\s*managedFields:' \
  > /tmp/<NOME_SECRET>-clean.yaml

# Ou com yq (mais robusto):
# kubectl -n <NAMESPACE> get secret <NOME_SECRET> -o yaml \
#   | yq 'del(.metadata.uid, .metadata.resourceVersion, .metadata.creationTimestamp, .metadata.managedFields, .metadata.selfLink, .metadata.annotations."kubectl.kubernetes.io/last-applied-configuration")' \
#   > /tmp/<NOME_SECRET>-clean.yaml
```

### 5.3 Selar e commitar

```bash
kubeseal --format yaml < /tmp/<NOME_SECRET>-clean.yaml > <NOME_SECRET>-sealed.yaml
rm /tmp/<NOME_SECRET>-export.yaml /tmp/<NOME_SECRET>-clean.yaml
git add <NOME_SECRET>-sealed.yaml
```

---

## Etapa 6 — O que NÃO selar (importante)

Nem todo `Secret` no cluster precisa ir pro Git. Selar errado gera duplicação ou conflito.

### Tipos a IGNORAR

| Tipo de Secret                                    | Por que ignorar                                   |
| ------------------------------------------------- | ------------------------------------------------- |
| `kubernetes.io/service-account-token`             | Auto-gerado por SA — recriado a cada reinstalação |
| `helm.sh/release.v1`                              | Estado interno do Helm — gerenciado pelo chart    |
| Secrets gerados por **operadores** (Prometheus Operator, Cert Manager, etc) | Recriados pelo controller a cada reconcile      |
| Secrets de **webhooks de admissão** (`prometheus-admission`, `cert-manager-webhook-ca`) | Auto-renovados, têm TTL curto                |
| Secrets gerados por charts Helm (ex: `kube-prometheus-stack-grafana`) | Definidos via `values.yaml` do chart            |
| Certificados TLS auto-renovados (cert-manager)    | Renovação automática quebra com SealedSecret      |

### Como identificar

```bash
# Lista secrets ignorando os auto-gerados óbvios:
kubectl -n <NAMESPACE> get secrets \
  --field-selector type!=helm.sh/release.v1,type!=kubernetes.io/service-account-token

# Para conferir se um secret é gerado por um operator, olhe os ownerReferences:
kubectl -n <NAMESPACE> get secret <NOME> -o jsonpath='{.metadata.ownerReferences}'
```

Se houver `ownerReferences`, o Secret é de um controller — **não selar**.

---

## Etapa 7 — Selar credenciais usadas em Helm Charts

Charts populares (Grafana, Prometheus, etc) costumam aceitar credenciais via `existingSecret` em vez de `adminPassword` em texto puro nos values:

```yaml
# values.yaml (commit em texto puro, sem senha)
grafana:
  admin:
    existingSecret: grafana-admin-credentials
    userKey: admin-user
    passwordKey: admin-password
```

E o `SealedSecret`:

```bash
kubectl create secret generic grafana-admin-credentials \
  --from-literal=admin-user=admin \
  --from-literal=admin-password='<SENHA>' \
  -n monitor \
  --dry-run=client -o yaml \
  | kubeseal --format yaml > grafana-admin-credentials-sealed.yaml
```

> **Atenção:** o `existingSecret` precisa **existir antes** do Helm Sync. No ArgoCD use `argocd.argoproj.io/sync-wave` para garantir que o `SealedSecret` aplique antes do Helm App.

---

## Casos especiais

### Certificados TLS

Duas opções:

**(a) Selar como SealedSecret** — funciona, mas **renovação manual**:

```bash
# IMPORTANTE: o namespace deve ser o mesmo do IngressGateway que serve o cert.
# - Perfil Istio "default"/"demo" (ingressgateway compartilhado): istio-system
# - Perfil Istio "minimal" (ingressgateway por namespace, ex: monitor): namespace do app
kubectl create secret tls tls-tatulab \
  --cert=fullchain.pem --key=privkey.pem \
  -n <NAMESPACE_DO_INGRESSGATEWAY> \
  --dry-run=client -o yaml \
  | kubeseal --format yaml > tls-tatulab-sealed.yaml
```

> **Como descobrir o namespace correto:** `kubectl get gateway -A` e olha onde está o `Gateway` que referencia o `credentialName`. O Secret precisa estar nesse mesmo namespace (a partir do Istio 1.15+).

**(b) Usar `cert-manager`** (recomendado em produção) — gera e renova certificados automaticamente via Let's Encrypt, mantém só o `Certificate` resource no Git (sem dados sensíveis).

### Credenciais usadas em ConfigMap

Alguns componentes (ex: Kiali) leem credenciais direto do `ConfigMap` em texto plano. Não dá pra `secretKeyRef` num campo arbitrário do CM. Workarounds:

1. Mover toda a config para `Secret` em vez de `ConfigMap` (Kiali aceita ambos)
2. Usar um init-container que substitui `${VAR}` no CM antes de o app subir
3. Aceitar a senha em texto no CM e proteger o acesso ao CM via RBAC

A opção (1) é a mais GitOps-friendly: o `Secret` inteiro vira `SealedSecret`.

---

## Rotação de chaves

O controller rotaciona a chave master automaticamente a cada **30 dias** (default). Chaves antigas continuam decifrando os `SealedSecret` antigos (sem necessidade de re-cifrar).

Para verificar quantas chaves existem:

```bash
kubectl -n kube-system get secrets -l sealedsecrets.bitnami.com/sealed-secrets-key
```

Para renovar **manualmente** todos os `SealedSecret` com a chave mais nova (boa prática anual):

```bash
# Para cada SealedSecret no Git:
kubeseal --re-encrypt < sealed-secret-old.yaml > sealed-secret-new.yaml
```

---

## Troubleshooting

### `kubeseal: no controller found`

A CLI não achou o controller. Causas:

1. Você está num kubeconfig diferente do cluster onde instalou — confirma com `kubectl config current-context`
2. O controller tem nome diferente — força com:
   ```bash
   kubeseal --controller-name=<NOME> --controller-namespace=<NS> ...
   ```

### `SealedSecret` aplicado mas Secret não aparece

Olhar os logs do controller:

```bash
kubectl -n kube-system logs deploy/sealed-secrets-controller --tail=50
```

Causas comuns:
- Namespace do `SealedSecret` não bate com o `metadata.namespace` quando foi cifrado (sealed secrets é namespace-scoped por default)
- Cluster diferente do que cifrou (chave pública divergente)

### "no key could decrypt the secret"

Você cifrou com a chave pública de um cluster e está tentando aplicar em outro. Re-selar contra o cluster destino:

```bash
kubeseal --fetch-cert > /tmp/cluster-destino-pub.pem
kubeseal --cert /tmp/cluster-destino-pub.pem --format yaml < secret-original.yaml \
  > secret-resealed.yaml
```

### "cannot fetch certificate" durante CI/CD offline

CI/CD que não tem acesso ao cluster — buscar a chave pública uma vez, commitar **publicamente** (chave pública é segura) e usar no `kubeseal`:

```bash
# Uma vez, na sua máquina:
kubeseal --fetch-cert > pub-cert-cluster.pem
git add pub-cert-cluster.pem

# No CI:
kubeseal --cert pub-cert-cluster.pem --format yaml < secret.yaml > sealed.yaml
```

---

## Estrutura recomendada no repositório

```
gitlab-repo/
├── secrets/                          # SealedSecrets cifrados (seguros pro Git)
│   ├── monitor/
│   │   ├── kiali-signing-key-sealed.yaml
│   │   ├── minio-credentials-sealed.yaml
│   │   └── grafana-admin-credentials-sealed.yaml
│   └── istio-system/
│       └── tls-tatulab-sealed.yaml
└── apps/
    └── ...                            # restante dos manifestos
```

Apontar uma `Application` ArgoCD para `secrets/` com `sync-wave: -5` (antes das apps que consomem).

---

## Referências

- [Sealed Secrets — repositório oficial](https://github.com/bitnami-labs/sealed-secrets)
- [Helm chart](https://github.com/bitnami-labs/sealed-secrets/tree/main/helm/sealed-secrets)
- [Comparativo de soluções de secrets em GitOps](https://kubernetes.io/blog/2022/12/12/external-secrets-operator-or-sealed-secrets/)

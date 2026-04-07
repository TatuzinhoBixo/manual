# Helm

## Descrição

O Helm é o gerenciador de pacotes oficial para Kubernetes. Ele simplifica a instalação e gerenciamento de aplicações complexas através de "charts" - pacotes pré-configurados que definem todos os recursos necessários para uma aplicação.

### Principais Funcionalidades

- **Charts**: Pacotes reutilizáveis com templates Kubernetes
- **Releases**: Instâncias de charts instalados no cluster
- **Repositórios**: Coleções de charts disponíveis para instalação
- **Valores customizados**: Personalização via arquivos `values.yaml`
- **Rollback**: Reverter para versões anteriores de releases

### Exemplos de Aplicações Instaláveis via Helm

- Rancher (gerenciamento de clusters)
- Ingress Controllers (NGINX, Traefik)
- Longhorn / NFS-Subdir (storage)
- Prometheus, Grafana, Loki (observabilidade)
- Cert-Manager (certificados TLS)
- ArgoCD (GitOps)

## Pré-requisitos

- kubectl configurado e com acesso ao cluster
- Conexão de rede com a API do Kubernetes

## Instalação

### Opção 1: Script oficial (recomendado)

```bash
# Baixar script de instalação
curl -fsSL -o get_helm.sh https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3

# Tornar executável
chmod 700 get_helm.sh

# Executar instalação
./get_helm.sh

# Limpar arquivo temporário
rm get_helm.sh
```

### Opção 2: Via snap (Ubuntu)

```bash
sudo snap install helm --classic
```

### Opção 3: Via apt (Debian/Ubuntu)

```bash
curl https://baltocdn.com/helm/signing.asc | gpg --dearmor | sudo tee /usr/share/keyrings/helm.gpg > /dev/null
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/helm.gpg] https://baltocdn.com/helm/stable/debian/ all main" | sudo tee /etc/apt/sources.list.d/helm-stable-debian.list
sudo apt-get update && sudo apt-get install helm
```

### Verificar instalação

```bash
helm version
```

## Comandos Básicos

```bash
# Adicionar repositório
helm repo add <nome> <url>

# Atualizar repositórios
helm repo update

# Pesquisar charts
helm search repo <termo>

# Instalar chart
helm install <release-name> <chart> -n <namespace>

# Listar releases instalados
helm list -A

# Desinstalar release
helm uninstall <release-name> -n <namespace>
```

## Observações

> **Localização**: Assim como o kubectl, o Helm pode ser instalado em qualquer máquina com acesso à API do cluster.

> **Repositórios Úteis**:
> - Bitnami: `https://charts.bitnami.com/bitnami`
> - Rancher: `https://releases.rancher.com/server-charts/stable`
> - Prometheus Community: `https://prometheus-community.github.io/helm-charts`

## Referências

- [Instalação do Helm](https://helm.sh/docs/intro/install/)
- [Documentação Helm](https://helm.sh/docs/)
- [Artifact Hub (repositório de charts)](https://artifacthub.io/)
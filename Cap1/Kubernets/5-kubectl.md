# kubectl

## Descrição

O `kubectl` é a ferramenta de linha de comando oficial para interagir com clusters Kubernetes. Permite executar comandos para deploy de aplicações, inspecionar e gerenciar recursos do cluster, e visualizar logs.

### Principais Funcionalidades

- Gerenciar deployments, services, pods e outros recursos
- Visualizar logs e status de aplicações
- Executar comandos dentro de containers
- Aplicar configurações via arquivos YAML
- Escalar aplicações e gerenciar rollouts

## Pré-requisitos

- Acesso a um cluster Kubernetes (kubeconfig configurado)
- Conexão de rede com a API do cluster

## Instalação

### Opção 1: Download direto do binário

```bash
# Baixar a versão mais recente
curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"

# Tornar executável
chmod +x kubectl

# Mover para diretório no PATH
sudo mv kubectl /usr/local/bin/
```

### Opção 2: Via repositório apt (Debian/Ubuntu)

```bash
# Instalar dependências
sudo apt-get update && sudo apt-get install -y apt-transport-https ca-certificates curl

# Adicionar chave GPG do Kubernetes
curl -fsSL https://pkgs.k8s.io/core:/stable:/v1.31/deb/Release.key | sudo gpg --dearmor -o /etc/apt/keyrings/kubernetes-apt-keyring.gpg

# Adicionar repositório
echo 'deb [signed-by=/etc/apt/keyrings/kubernetes-apt-keyring.gpg] https://pkgs.k8s.io/core:/stable:/v1.31/deb/ /' | sudo tee /etc/apt/sources.list.d/kubernetes.list

# Instalar kubectl
sudo apt-get update && sudo apt-get install -y kubectl
```

### Configuração do kubeconfig

Após a instalação, configure o acesso ao cluster copiando o arquivo kubeconfig:

```bash
# Criar diretório de configuração
mkdir -p ~/.kube

# Copiar kubeconfig do control plane (executar no control plane)
# O arquivo está em /etc/rancher/rke2/rke2.yaml no RKE2
sudo cp /etc/rancher/rke2/rke2.yaml ~/.kube/config
sudo chown $(id -u):$(id -g) ~/.kube/config
```

### Verificar instalação

```bash
kubectl version --client
kubectl cluster-info
```

## Observações

> **Localização**: Geralmente instala-se o kubectl no primeiro control plane, mas pode ser instalado em qualquer máquina com acesso de rede à API do cluster.

> **Autocompletion**: Para habilitar autocompletion no bash, execute:
> ```bash
> echo 'source <(kubectl completion bash)' >> ~/.bashrc
> source ~/.bashrc
> ```

## Referências

- [Instalação do kubectl](https://kubernetes.io/docs/tasks/tools/install-kubectl-linux/)
- [kubectl Cheat Sheet](https://kubernetes.io/docs/reference/kubectl/cheatsheet/)
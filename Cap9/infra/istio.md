### Instalação do Istio
curl -L https://istio.io/downloadIstio | sh -
cd istio-*
export PATH=$PWD/bin:$PATH
istioctl install --set values.defaultRevision=default

#### Verificar a versão
istioctl version

#### Aplicar o istio no namespace
kubectl label namespace <namespace> istio-injection=enabled
kubectl get namespace <namespace> --show-labels


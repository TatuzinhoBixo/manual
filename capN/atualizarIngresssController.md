### Atualizar o ingress-controller NGINX

Antes de atualizar, verifique a versão com o comando
```bash
kubectl get pods --all-namespaces -l app.kubernetes.io/name=ingress-nginx -o jsonpath="{.items[0].spec.containers[0].image}"
```

Atualize o repostiório do Helm
> Se entende que a instalação do ingress foi feita via Helm
```bash
helm repo update
```
Verifique a última versão disponivel 
```bash
helm search repo ingress-nginx/ingress-nginx --versions | head
```
Faça o backup dos valores atuais
```bash
helm get values ingress-nginx -n ingress-nginx -o yaml > valores-antigos.yaml
```
Atualize o Nginx Controller para a última versão disponível
```bash
helm upgrade ingress-nginx ingress-nginx/ingress-nginx \
  -n ingress-nginx \
  -f valores-antigos.yaml
```
Caso prefira instalar uma versão específica use:
```bash
helm upgrade ingress-nginx ingress-nginx/ingress-nginx \
  --version <versao> \
  -n ingress-nginx \
  -f valores-antigos.yaml
```
Verifique novamente a versão, ja deve ter sido atualizada
```bash
kubectl get pods --all-namespaces -l app.kubernetes.io/name=ingress-nginx -o jsonpath="{.items[0].spec.containers[0].image}"
```
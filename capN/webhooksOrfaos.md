### Como remover Webhooks órfãos
Exemplos de erros
```bash
root@control1:~/manifestos/wordpress# kubectl apply -f ingress.yaml 
Error from server (InternalError): error when creating "ingress.yaml": Internal error occurred: failed calling webhook "validate.nginx.ingress.kubernetes.io": failed to call webhook: Post "https://linerd-ingress-ingress-nginx-controller-admission.linkerd-viz.svc:443/networking/v1/ingresses?timeout=10s": service "linerd-ingress-ingress-nginx-controller-admission" not found
```

#### Para ver os webhooks existentes
```bash
kubectl get validatingwebhookconfigurations
kubectl get mutatingwebhookconfigurations
```

#### Deletar se encontrar órfãos
kubectl delete validatingwebhookconfigurations <nome-do-webhook-orfao>

### Ajustes do Cluster
Após a instalação do clustes completo, é recomendado verificar se o Taint está ativado, isso é importante pois impede que os pods de serviços sejam rodados nos controlplanes, deixando esses nós apenas para serviço de gerenciamento de cluster e não como os serviços.
Então, com o cluster operacional, verifique os nós ativos atraves de algum nó que tenha o acesso do kubectl
```bash
kubectl get no
```
Sabendo o nome dos controlplanes, rode o comando para verificar 
```bash
kubectl describe node <controlplane> | grep Taints
```
Caso o resultado seja:
> Taints:             \<none>

É necesário ativar, para isso use o comando:
```yaml
kubectl taint node <control> node-role.kubernetes.io/control-plane=true:NoSchedule
```
Agora o resultado deve ser:
```bash
kubectl describe node <control> | grep Taints:
Taints:             node-role.kubernetes.io/control-plane=true:NoSchedule
```

Outra forma de verificar é a seguinte
```bash
kubectl get nodes --show-labels
```

#### Repita o processo em todos os controlplanes.

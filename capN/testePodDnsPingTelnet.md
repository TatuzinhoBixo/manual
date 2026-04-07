### Teste de pod

Aqui temos dois comandos onde ele vai testar a comunicação do pod tanto na resolução de nome, na comunicação de ips e teste de portas, isso é solicitado as vezes quando uma aplicação precisa consultar algum serviço externo fora do cluster e quando não encontra acaba ocorrendo erros mesmo com o pod running.

#### Teste de ping
```bash
kubectl run ping-test-once --image=busybox --restart=Never -i -t --rm -- ping -c 4 <ip>
```

O resultado vai ser mostrado no prompt

#### Teste de dnslookup
O comando cria um pod que roda o teste de nslookup, após isso é verificado o log do pod e por fim ele é deletado

```
kubectl run nslookup-test-once --image=busybox --restart=Never -- nslookup <dns> <ip-dns-consulta-opcional>
kubectl logs nslookup-test-once
kubectl delete po nslookup-test-once
```

#### Teste de conectividade
Para fazer o teste de consulta de porta apontando para um determinado servidor, se roda um pod de teste e após isso verifica o log e depois o pod é removido
```bash
kubectl run netcat-test-once --image=busybox --restart=Never -- nc -zv <host-destino> <porta-destino>
kubectl logs netcat-test-once
kubectl delete pod netcat-test-once
```


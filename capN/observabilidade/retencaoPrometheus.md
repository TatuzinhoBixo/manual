### Tempo de retenção do prometheus

Comando que informa o tempo/armazenamento de rentenção do Promethues
```bash
kubectl get deployment prometheus-server -n observability -o yaml | grep -A 10 "args:"
```

exemplo de saida, no caso está em 90 dias
```yaml
--storage.tsdb.retention.time=90d
```

mostrar o espaço utilizado

Espaço total do pvc, tamanho de uso e porcentagem do Prometheus.
```bash
kubectl exec -n observability deployment/prometheus-server -c prometheus-server -- df -h /data
```

Espaço em uso apenas dos dados
```bash
kubectl exec -n observability deployment/prometheus-server -c prometheus-server -- du -sh /data
```

### Para alterar os dias de retenção
Criar o arquivo prometheus-custom-values.yaml
Incluir os dadosm, por exemplo 30 dias
```yaml
server:
  retention: 30d
```

busscar a versão certa do helm do promethues
```bash
helm list -n observability | grep prometheus
```

Nesse exemplo seria a 27.31.0
```bash
prodam@control1:~$ helm list -n observability | grep prometheus
blackbox-exporter       observability   1               2025-08-25 16:12:46.683275244 -0400 -04 deployed        prometheus-blackbox-exporter-11.2.2           v0.27.0    
prometheus              observability   50              2026-01-19 11:30:53.771621544 -0400 -04 deployed        prometheus-27.31.0                            v3.5.0    
```

Rodar o comando  para atualizar
```bash
helm upgrade prometheus prometheus-<versao> -n observability -f prometheus-custom-values.yaml --reuse-values
```


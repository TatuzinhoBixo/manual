# Comando para checar e renovar os certificados assinados pela CA

Verificar a expiração

```bash
rke2 certificate check --output table
```

Renovar todos os certificados (no contorlplane nodes)

```bash
systemctl stop rke2-server
rke2 certificate rotate
systemctl start rke2-server
```

Para a renovação dos agents nodes é necessário apenas dar um restart no serviço

```bash
systemctl restart rke2-agent
```

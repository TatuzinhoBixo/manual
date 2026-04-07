## Troubleshooting de Webhooks no Kubernetes

Webhooks são mecanismos que interceptam requisições à API do Kubernetes antes de serem persistidas. Existem dois tipos:

- **ValidatingWebhook**: Valida recursos e pode rejeitar a criação/modificação
- **MutatingWebhook**: Modifica recursos automaticamente antes de serem salvos

### Quando Webhooks Causam Problemas

- Pods não são criados e mostram erros de webhook no `kubectl describe`
- Operações de deploy falham com mensagens de timeout
- O serviço do webhook não está disponível (pod deletado, namespace removido)
- CRDs de operators removidos deixam webhooks órfãos

### Listar Webhooks Configurados

```bash
kubectl get validatingwebhookconfigurations
kubectl get mutatingwebhookconfigurations
```

### Inspecionar um Webhook Específico

```bash
kubectl describe validatingwebhookconfiguration <nome>
kubectl describe mutatingwebhookconfiguration <nome>
```

### Remover Webhooks Problemáticos

> **Atenção**: Remover webhooks pode permitir a criação de recursos inválidos. Certifique-se de que o webhook está realmente órfão ou causando problemas antes de deletar.

```bash
kubectl delete validatingwebhookconfiguration <nome>
kubectl delete mutatingwebhookconfiguration <nome>
```

### Cenários Comuns

| Cenário | Solução |
|---------|---------|
| Operator removido deixou webhook | Delete o webhook manualmente |
| Webhook timeout ao criar pods | Verifique se o serviço do webhook está running |
| Erro de certificado no webhook | Recrie os certificados ou reinstale o operator |

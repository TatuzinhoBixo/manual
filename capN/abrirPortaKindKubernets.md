## Port-Forward para Testes Locais

Este comando permite acessar um pod diretamente via navegador, sem passar pelo Service. Útil para testes rápidos, debug ou quando o Service não está configurado corretamente.

### Quando Usar

- Testar uma aplicação antes de configurar o Ingress
- Debug de conectividade direta ao pod
- Acesso temporário a serviços internos do cluster
- Validar se a aplicação está respondendo corretamente

### Comando

```bash
kubectl port-forward --address 0.0.0.0 pod/<nome-pod> <porta-local>:<porta-container>
```

### Exemplo Prático

Para um Nginx do Bitnami que roda na porta 8080:

```bash
kubectl port-forward --address 0.0.0.0 pod/<nome-pod-webserver> 8081:8080
```

Após executar, acesse `http://<ip-do-node>:8081` no navegador.

### Parâmetros

| Parâmetro | Descrição |
|-----------|-----------|
| `--address 0.0.0.0` | Permite acesso de qualquer IP (não apenas localhost) |
| `<porta-local>` | Porta na máquina onde kubectl está rodando |
| `<porta-container>` | Porta onde a aplicação escuta dentro do container |

> **Nota**: O port-forward mantém a conexão aberta enquanto o comando estiver em execução. Use `Ctrl+C` para encerrar.

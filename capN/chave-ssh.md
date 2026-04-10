## Configuração de Chaves SSH

Procedimento para gerar e configurar chaves SSH para autenticação sem senha entre servidores.

### 1. Gerar Par de Chaves

Execute com o usuário que fará as conexões:

```bash
ssh-keygen -t rsa -b 4096
```

Ou com algoritmo Ed25519 (mais moderno):

```bash
ssh-keygen -t ed25519
```

> Pressione Enter para aceitar o local padrão (`~/.ssh/id_rsa` ou `~/.ssh/id_ed25519`).
> A passphrase é opcional mas recomendada para maior segurança.

### 2. Copiar Chave Pública para o Servidor Remoto

```bash
ssh-copy-id -i ~/.ssh/id_rsa.pub <usuario>@<ip>
```

Ou para Ed25519:

```bash
ssh-copy-id -i ~/.ssh/id_ed25519.pub <usuario>@<ip>
```

### 3. Testar Conexão

```bash
ssh <usuario>@<ip>
```

A conexão deve ocorrer sem solicitar senha (apenas passphrase, se configurada).

### Copiar Chave Manualmente (Alternativa)

Se `ssh-copy-id` não estiver disponível:

```bash
cat ~/.ssh/id_rsa.pub | ssh <usuario>@<ip> "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"
```

### Permissões Corretas

No servidor remoto, as permissões devem ser:

```bash
chmod 700 ~/.ssh
chmod 600 ~/.ssh/authorized_keys
```

### Transferir Chave Privada para Outra Máquina

> **Atenção**: A chave privada deve ser mantida segura. Transfira apenas se necessário.

```bash
scp ~/.ssh/id_rsa <usuario>@<ip-destino>:~/.ssh/
```

Após transferir, ajuste as permissões no destino:

```bash
chmod 600 ~/.ssh/id_rsa
```

### Troubleshooting

Se a conexão ainda pedir senha, verifique:

1. Permissões do diretório `.ssh` e arquivo `authorized_keys`
2. Configuração do `sshd_config` no servidor:
   ```
   PubkeyAuthentication yes
   AuthorizedKeysFile .ssh/authorized_keys
   ```
3. Logs de autenticação: `sudo tail -f /var/log/auth.log`

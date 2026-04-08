## Listar Containers Docker com Formatação

Comandos para visualizar containers Docker de forma organizada, útil para monitoramento e troubleshooting.

### Listagem Formatada Básica

```bash
docker ps --format "table {{.ID}}\t{{.Names}}\t{{.Status}}"
```

### Formatos Úteis

#### Com portas expostas
```bash
docker ps --format "table {{.ID}}\t{{.Names}}\t{{.Ports}}\t{{.Status}}"
```

#### Com imagem utilizada
```bash
docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}"
```

#### Formato compacto para scripts
```bash
docker ps --format "{{.Names}}: {{.Status}}"
```

### Campos Disponíveis

| Campo | Descrição |
|-------|-----------|
| `{{.ID}}` | ID do container |
| `{{.Names}}` | Nome do container |
| `{{.Image}}` | Imagem utilizada |
| `{{.Status}}` | Status atual |
| `{{.Ports}}` | Portas mapeadas |
| `{{.Networks}}` | Redes conectadas |
| `{{.Mounts}}` | Volumes montados |
| `{{.CreatedAt}}` | Data de criação |

### Incluir Containers Parados

```bash
docker ps -a --format "table {{.Names}}\t{{.Status}}\t{{.Image}}"
```

### Filtrar por Status

```bash
# Apenas containers rodando
docker ps --filter "status=running" --format "table {{.Names}}\t{{.Status}}"

# Apenas containers parados
docker ps -a --filter "status=exited" --format "table {{.Names}}\t{{.Status}}"
```

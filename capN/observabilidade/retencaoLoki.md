### Tempo de retenção do loki

Comando que informa o tempo de armazenamento do dados Loki

```bash
helm get values loki -n observability | grep retention_peri
```

# Loki - Verificação de Espaço em Disco
## 1. Backend (Compactor e Index)
```bash
kubectl exec -n observability loki-backend-0 -- df -h | grep -E "Filesystem|/var/loki"
```

**O que faz:**
- Acessa o pod `loki-backend-0` (primeiro replica do backend)
- Executa `df -h` para ver uso de disco em formato legível
- Filtra apenas a linha do filesystem e o mount point `/var/loki`

**O que é armazenado aqui:**
- Índices TSDB (Time Series Database)
- Compaction metadata (dados compactados)
- Cache local
- **NÃO são os logs em si**, apenas metadados e índices

---

## 2. MinIO (Object Storage - Logs Reais)
```bash
kubectl exec -n observability loki-minio-0 -- df -h | grep -E "Filesystem|/export"
```

**O que faz:**
- Acessa o pod `loki-minio-0` (MinIO que funciona como S3)
- Executa `df -h` para ver uso de disco
- Filtra os mount points `/export` (onde MinIO armazena os dados)

**O que é armazenado aqui:**
- **Os logs reais em chunks compactados**
- Buckets: `chunks`, `ruler`, `admin`
- Este é o armazenamento principal e mais importante do Loki
- Possui múltiplos volumes (`/export-0`, `/export-1`) para distribuição

---

## 3. Read (Query/Consulta)
```bash
kubectl exec -n observability loki-read-566c78678c-7x6xr -- df -h | grep -E "Filesystem|/var/loki"
```

**O que faz:**
- Acessa um pod de leitura (query frontend)
- Executa `df -h` para ver uso de disco
- Filtra o mount point `/var/loki`

**O que é armazenado aqui:**
- Cache de queries
- Índices locais para acelerar buscas
- Resultados temporários de consultas
- Uso menor que backend/minio

---

## 4. Write (Ingestão)
```bash
kubectl exec -n observability loki-write-0 -- df -h | grep -E "Filesystem|/var/loki"
```

**O que faz:**
- Acessa o pod `loki-write-0` (primeiro replica de ingestão)
- Executa `df -h` para ver uso de disco
- Filtra o mount point `/var/loki`

**O que é armazenado aqui:**
- WAL (Write-Ahead Log) - buffer de escrita
- Chunks temporários antes de enviar ao MinIO
- Logs em processo de ingestão
- Após ingestão, dados são movidos para o MinIO

---

## Resumo da Arquitetura
```
Logs chegam → Write (buffer/WAL) → MinIO (armazenamento final)
                                        ↓
Queries → Read (cache) → Backend (índices) → MinIO (busca logs)


# Loki - Verificação de Espaço em Disco

## 1. Backend (Compactor e Index)
```bash
kubectl exec -n observability loki-backend-0 -- df -h | grep -E "Filesystem|/var/loki"
```

**O que faz:**
- Acessa o pod `loki-backend-0` (primeiro replica do backend)
- Executa `df -h` para ver uso de disco em formato legível
- Filtra apenas a linha do filesystem e o mount point `/var/loki`

**O que é armazenado aqui:**
- Índices TSDB (Time Series Database)
- Compaction metadata (dados compactados)
- Cache local
- **NÃO são os logs em si**, apenas metadados e índices

---

## 2. MinIO (Object Storage - Logs Reais)
```bash
kubectl exec -n observability loki-minio-0 -- df -h | grep -E "Filesystem|/export"
```

**O que faz:**
- Acessa o pod `loki-minio-0` (MinIO que funciona como S3)
- Executa `df -h` para ver uso de disco
- Filtra os mount points `/export` (onde MinIO armazena os dados)

**O que é armazenado aqui:**
- **Os logs reais em chunks compactados**
- Buckets: `chunks`, `ruler`, `admin`
- Este é o armazenamento principal e mais importante do Loki
- Possui múltiplos volumes (`/export-0`, `/export-1`) para distribuição

### 2.1 MinIO - Comando Resumido (Recomendado)
```bash
kubectl exec -n observability loki-minio-0 -- df -h /export-0 /export-1
```

**O que faz:**
- Acessa o pod `loki-minio-0`
- Executa `df -h` nos dois volumes de export do MinIO
- Mostra diretamente o uso de disco dos volumes principais

**Por que usar este comando:**
- **Mais direto e rápido** que o grep
- Mostra exatamente os dois volumes onde os logs ficam armazenados
- Fornece: tamanho total, usado, disponível e porcentagem
- **Este é o comando principal para monitorar espaço do Loki**

**Exemplo de output:**
```
Filesystem    Size  Used Avail Use% Mounted on
/export-0     491G   65G  401G  14% /export-0
/export-1     491G   65G  401G  14% /export-1
```

**Interpretação:**
- Total configurado: ~1TB (491G × 2)
- Total usado: ~130G (65G × 2)
- Logs armazenados por 30 dias ocupam 14% do espaço

---

## 3. Read (Query/Consulta)
```bash
kubectl exec -n observability loki-read-566c78678c-7x6xr -- df -h | grep -E "Filesystem|/var/loki"
```

**O que faz:**
- Acessa um pod de leitura (query frontend)
- Executa `df -h` para ver uso de disco
- Filtra o mount point `/var/loki`

**O que é armazenado aqui:**
- Cache de queries
- Índices locais para acelerar buscas
- Resultados temporários de consultas
- Uso menor que backend/minio

---

## 4. Write (Ingestão)
```bash
kubectl exec -n observability loki-write-0 -- df -h | grep -E "Filesystem|/var/loki"
```

**O que faz:**
- Acessa o pod `loki-write-0` (primeiro replica de ingestão)
- Executa `df -h` para ver uso de disco
- Filtra o mount point `/var/loki`

**O que é armazenado aqui:**
- WAL (Write-Ahead Log) - buffer de escrita
- Chunks temporários antes de enviar ao MinIO
- Logs em processo de ingestão
- Após ingestão, dados são movidos para o MinIO

---

## Resumo da Arquitetura
```
Logs chegam → Write (buffer/WAL) → MinIO (armazenamento final)
                                        ↓
Queries → Read (cache) → Backend (índices) → MinIO (busca logs)
```

**Componente mais importante:** MinIO - onde ficam os logs reais armazenados por 30 dias.

**Comando recomendado para monitoramento diário:**
```bash
kubectl exec -n observability loki-minio-0 -- df -h /export-0 /export-1
```


# Loki - Procedimento para Alterar Retenção

## 1. Verificar a versão atual do Loki
```bash
helm list -n observability | grep loki
```

**Output esperado:**
```
loki    observability   1       2025-09-10 11:16:40.646384373 -0400 -04 deployed        loki-6.36.1     3.5.3
```

A coluna **CHART** mostra `loki-6.36.1` - essa é a versão do chart Helm instalada.

---

## 2. Verificar a retenção atual
```bash
helm get values loki -n observability | grep retention_period
```

**Output esperado:**
```
retention_period: 30d
```

---

## 3. Criar arquivo de values customizado
```bash
cat > loki-custom-values.yaml << EOF
loki:
  limits_config:
    retention_period: 15d
EOF
```

*(Altere `15d` para o valor desejado: 7d, 15d, 30d, 60d, etc)*

---

## 4. Aplicar o upgrade do Helm
```bash
helm upgrade loki loki --repo https://grafana.github.io/helm-charts -n observability --version 6.36.1 --reuse-values -f loki-custom-values.yaml
```

**Parâmetros:**
- `--version 6.36.1`: Mantém a mesma versão do chart
- `--reuse-values`: Mantém todas as outras configurações existentes
- `-f loki-custom-values.yaml`: Aplica apenas a alteração de retenção

---

## 5. Verificar se a alteração foi aplicada
```bash
helm get values loki -n observability | grep retention_period
```

**Output esperado:**
```
retention_period: 15d
```

---

## 6. Aguardar a limpeza automática

O componente **backend (compactor)** do Loki fará a limpeza dos logs antigos automaticamente.

- A limpeza acontece periodicamente
- Logs fora do período de retenção serão deletados do MinIO
- Pode levar algumas horas para ver a redução no espaço usado

**Para monitorar o espaço durante a limpeza:**
```bash
kubectl exec -n observability loki-minio-0 -- df -h /export-0 /export-1
```

---

## Observações Importantes

- **NÃO delete dados manualmente** do MinIO
- **NÃO recrie PVCs**
- O `--reuse-values` garante que MinIO, replicas, recursos e outras configs sejam mantidas
- A redução de espaço NÃO é imediata
- Reiniciar os pods do backend pode acelerar o processo (opcional)
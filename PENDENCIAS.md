docker do registry-ui

## Cap7/02-loki.md — onde parei
- MinIO distribuído (4 pods) OK
- Job `minio-create-buckets` aplicado e Completed (3 buckets: loki-data, loki-ruler, loki-admin)
- `loki-read` deployado mas em 503 — falta aplicar:
  - `loki-write-statefulset.yaml` (seção 2.5)
  - `loki-backend-statefulset.yaml` (seção 2.6)
- Depois: restart do loki-read e validar Ready
- Seguir pra Parte 3 (Promtail)

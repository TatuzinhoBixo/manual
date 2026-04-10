# SkyWalking Browser Monitoring - Documentacao

## O que foi feito

Integracao do Apache SkyWalking Client JS com a aplicacao frontend **DevOps Toolkit**, permitindo monitoramento de performance e erros diretamente no browser do usuario.

## Arquitetura

```
Browser (usuario)
    |
    |-- Carrega a aplicacao via nginx.tatulab.com.br
    |-- SkyWalking Client JS coleta metricas de performance e erros
    |-- Envia dados via POST para skywalking-oap.tatulab.com.br
    |
Traefik (LoadBalancer - 192.168.1.72)
    |
    |-- IngressRoute com Middleware CORS
    |
SkyWalking OAP (porta 12800) --> Elasticsearch --> SkyWalking UI
```

## Pre-requisitos

- SkyWalking OAP **10.2+** (utilizado: 10.3.0)
- SkyWalking Client JS **1.0.0+**
- `receiver-browser` habilitado no OAP (habilitado por padrao)
- Traefik como Ingress Controller
- DNS configurado para `skywalking-oap.tatulab.com.br` apontando para o Traefik (192.168.1.72)

## Alteracoes realizadas

### 1. index.html - Adicao do SkyWalking Client JS

O script foi adicionado no `<head>` do HTML para capturar os eventos de performance desde o inicio do carregamento da pagina.

```html
<script src="https://cdn.jsdelivr.net/npm/skywalking-client-js@1.0.0/lib/index.min.js"></script>
<script>
    var swConfig = {
        collector: 'https://skywalking-oap.tatulab.com.br',
        service: 'devops-toolkit-frontend',
        serviceVersion: '1.0.0',
        pagePath: location.pathname,
        jsErrors: true,
        apiErrors: true,
        resourceErrors: true,
        autoTracePerf: true,
        useWebVitals: true,
        enableSPA: true
    };
    ClientMonitor.register(swConfig);
    window.addEventListener('load', function() {
        setTimeout(function() {
            ClientMonitor.setPerformance(swConfig);
        }, 3000);
    });
</script>
```

**Pontos importantes:**

- O script DEVE ficar no `<head>` para capturar eventos de performance
- O `setPerformance()` e chamado 3 segundos apos o `load` para garantir que todas as metricas foram coletadas
- `pagePath` usa `location.pathname` (path relativo, nao URL completa)

### 2. IngressRoute + Middleware CORS (Kubernetes/Traefik)

Arquivo: `ingressroute-skywalking.yaml`

```yaml
apiVersion: traefik.io/v1alpha1
kind: Middleware
metadata:
  name: cors-skywalking
  namespace: observability
spec:
  headers:
    accessControlAllowMethods:
      - GET
      - POST
      - OPTIONS
    accessControlAllowHeaders:
      - "*"
    accessControlAllowOriginList:
      - "*"
    accessControlMaxAge: 86400
---
apiVersion: traefik.io/v1alpha1
kind: IngressRoute
metadata:
  name: skywalking-oap-ingressroute
  namespace: observability
spec:
  entryPoints:
    - websecure
  routes:
    - kind: Rule
      match: Host(`skywalking-oap.tatulab.com.br`)
      middlewares:
        - name: cors-skywalking
      services:
        - name: skywalking-oap
          port: 12800
  tls:
    secretName: tls-tatulab
```

**Por que o CORS e necessario:**

O SkyWalking Client JS roda no browser do usuario (fora do cluster). Quando a aplicacao e servida por `nginx.tatulab.com.br` e tenta enviar dados para `skywalking-oap.tatulab.com.br`, o browser bloqueia por politica de Same-Origin. O Middleware CORS permite essas requisicoes cross-origin.

### 3. Kustomization

O arquivo foi adicionado ao `kustomization.yaml`:

```yaml
resources:
  - gw-vs.yaml
  - elastic.yaml
  - ui.yaml
  - oap.yaml
  - ingressroute-skywalking.yaml
```

### 4. DNS

Registro DNS necessario:

```
192.168.1.72  skywalking-oap.tatulab.com.br
```

Deve ser configurado no servidor DNS da rede para que todos os usuarios que acessem a aplicacao consigam enviar dados ao OAP.

## Parametros de configuracao do ClientMonitor

| Parametro | Tipo | Descricao |
|---|---|---|
| `collector` | string | URL do SkyWalking OAP (porta 12800) |
| `service` | string | Nome do servico (aparece no SkyWalking UI) |
| `serviceVersion` | string | Versao da aplicacao |
| `pagePath` | string | Path da pagina atual |
| `jsErrors` | boolean | Captura erros JavaScript |
| `apiErrors` | boolean | Captura erros de requisicoes HTTP |
| `resourceErrors` | boolean | Captura erros de carregamento de recursos |
| `autoTracePerf` | boolean | Envia dados de performance automaticamente |
| `useWebVitals` | boolean | Coleta Core Web Vitals (LCP, FID, CLS) |
| `enableSPA` | boolean | Monitora navegacao em Single Page Applications |

## O que e monitorado

- **Performance**: FP (First Paint), FCP (First Contentful Paint), LCP (Largest Contentful Paint), FID (First Input Delay), CLS (Cumulative Layout Shift)
- **Erros JavaScript**: Excecoes nao tratadas, promise rejections
- **Erros de API**: Falhas em requisicoes XMLHttpRequest e Fetch
- **Erros de recursos**: Falhas ao carregar scripts, CSS, imagens
- **Page Views**: Visualizacoes de pagina

## Onde visualizar os dados

No SkyWalking UI, os dados aparecem na secao **Browser** (icone no menu lateral esquerdo), NAO na secao "General Service". La voce encontra:

- **Services**: `devops-toolkit-frontend`
- **Pages**: Paginas acessadas
- **Performance**: Metricas de carregamento
- **Errors**: Erros capturados

## Cenarios de aplicacao

### Aplicacoes frontend estaticas (HTML/CSS/JS)

Como o DevOps Toolkit, aplicacoes que nao possuem backend proprio. O Client JS e adicionado via tag `<script>` direto no HTML. Ideal para:

- Landing pages
- Dashboards estaticos
- Ferramentas web client-side
- Sites institucionais

### Single Page Applications (SPA)

Frameworks como React, Angular, Vue.js. O Client JS pode ser instalado via npm (`npm install skywalking-client-js`) e importado no codigo. Com `enableSPA: true`, monitora navegacao entre rotas sem reload da pagina.

### Aplicacoes com backend (distributed tracing)

Quando a aplicacao frontend se comunica com APIs backend que tambem estao instrumentadas com agentes SkyWalking (Java, Node.js, Python, Go, etc.), o Client JS adiciona o header `sw8` nas requisicoes HTTP, permitindo **distributed tracing completo** do browser ate o backend. Este e o cenario onde o SkyWalking entrega mais valor.

### Micro frontends

Em arquiteturas de micro frontends, cada modulo pode ser instrumentado separadamente com nomes de servico diferentes, permitindo monitorar a performance de cada micro frontend individualmente.

## Compatibilidade de versoes

| SkyWalking Client JS | SkyWalking OAP |
|---|---|
| 1.0.0+ | 10.2+ |
| 0.x | 8.x - 10.1 |

## Problemas comuns

| Problema | Causa | Solucao |
|---|---|---|
| Dados nao aparecem | CORS bloqueando requisicoes | Adicionar Middleware CORS no Traefik |
| `ERR_NAME_NOT_RESOLVED` | DNS nao configurado | Adicionar registro DNS para o OAP |
| `Tracing is not supported` | Normal em apps sem requisicoes XHR | Ignorar - nao impacta o monitoramento de performance |
| Performance data nao enviado | Script no final do `<body>` | Mover para o `<head>` e usar `setPerformance()` com delay |
| Script nao carrega | Caminho do CDN incorreto | Usar `/lib/index.min.js` (nao `/dist/`) |

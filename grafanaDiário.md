# Dashboard - Monitoramento Synthetic Diário Digital

## Sumário

1. Visão Geral
2. Descrição dos Painéis
3. Glossário de Métricas
4. Como interpretar o dashboard
5. Valores de referência
6. O que fazer em caso de falha

---

## 1. Visão Geral

Este dashboard apresenta o resultado do monitoramento automatizado do sistema **Diário Digital da SEDUC-AM** (`diariodigital.seduc.am.gov.br`).

**Como funciona:**

A cada 5 minutos, um robô simula um usuário real executando o seguinte fluxo:

1. Acessa a página inicial do sistema
2. Clica no botão "ENTRAR"
3. Faz login via conta Google institucional
4. Navega até a página de seleção de escolas
5. Valida que a lista de escolas foi retornada corretamente

O robô registra o tempo de cada etapa e publica o resultado para visualização neste dashboard.

**O dashboard é dividido em 2 seções:**

- **Status Operacional** (sempre visível): mostra se o sistema está funcionando no momento
- **Métricas Detalhadas** (colapsável): mostra análise aprofundada de performance

---

## 2. Descrição dos Painéis

### 2.1. Seção "Status Operacional"

| Painel                           | O que mostra                                                                                                                                           |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Status Atual**                 | Indicador principal: VERDE = sistema OK, VERMELHO = sistema com falha. Este é o painel mais importante do dashboard.                                   |
| **Escolas na 1ª página**         | Quantidade de escolas retornadas na consulta. Valor esperado: 10. Se retornar 0, significa que o login funcionou mas a consulta falhou.                |
| **Última execução há**           | Tempo desde o último check. Se passar de 10 minutos sem atualizar, indica que o robô pode estar travado.                                               |
| **Duração total**                | Quanto tempo a execução completa levou (em segundos). Valor típico: 35-45 segundos.                                                                    |
| **Histórico de disponibilidade** | Linha do tempo mostrando status nas últimas 24h. Permite identificar quando houve falhas, por quanto tempo duraram e se há padrão de falha recorrente. |

### 2.2. Seção "Métricas Detalhadas"

| Painel                             | O que mostra                                                                                                           |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **Tempo por etapa do fluxo**       | Gráfico mostrando quanto tempo cada etapa leva. Útil para identificar onde está o gargalo quando o sistema está lento. |
| **Web Vitals - Página de Escolas** | Indicadores de performance da página final (FCP e TTFB). Explicados em detalhe na próxima seção.                       |
| **Duração atual por etapa**        | Barras horizontais com o tempo atual de cada etapa. Versão visual e rápida do gráfico de linhas.                       |

---

## 3. Glossário de Métricas

### 3.1. Métricas de fluxo (tempo por etapa)

| Métrica             | Significado                                                                                                                                             | Valor típico   |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| **Página inicial**  | Tempo para carregar a página inicial do sistema (antes do login)                                                                                        | 1-3 segundos   |
| **Redirect Google** | Tempo entre clicar em ENTRAR e aparecer a tela de login do Google                                                                                       | 2-4 segundos   |
| **Login completo**  | Tempo de todo o processo de login: preencher email, senha, redirects do Google, voltar ao sistema. Inclui uma espera fixa de 15 segundos por segurança. | 20-25 segundos |
| **Página escolas**  | Tempo para carregar a página de seleção de escolas após o login                                                                                         | 1-3 segundos   |

### 3.2. Web Vitals (termos importantes)

As "Web Vitals" são métricas padronizadas pelo Google para medir **a experiência percebida pelo usuário** ao carregar uma página. Não é a mesma coisa que "tempo de carregamento" — são métricas que refletem especificamente o que o usuário VÊ e SENTE.

#### FCP - First Contentful Paint

**O que é:** Tempo entre o usuário abrir a página e **ver o primeiro conteúdo** aparecer na tela (pode ser um texto, uma imagem, um logo — qualquer coisa visível).

**Na prática:** É o momento em que o usuário para de olhar uma tela em branco e começa a enxergar que "algo está carregando".

**Analogia:** É como esperar num restaurante. O FCP é o momento em que o garçom chega à sua mesa com o cardápio. Você ainda não comeu, mas já sente que está sendo atendido.

**Valores de referência (padrão Google):**
- **Bom:** menos de 1.8 segundos (verde)
- **Precisa melhorar:** entre 1.8 e 3.0 segundos (amarelo)
- **Ruim:** mais de 3.0 segundos (vermelho)

**No nosso caso:** valor atual ~0.5s → ótimo.

---

#### TTFB - Time To First Byte

**O que é:** Tempo entre o navegador pedir a página e **receber o primeiro byte de resposta** do servidor.

**Na prática:** Mede a velocidade do servidor em começar a responder. Não mede download nem renderização — apenas quanto tempo o servidor demora para processar a requisição e começar a enviar resposta.

**Analogia:** Seguindo a metáfora do restaurante, o TTFB é o tempo entre você fazer o pedido e o garçom dizer "certo, vou preparar". Se demora muito, indica que a cozinha (servidor) está sobrecarregada.

**Valores de referência:**
- **Bom:** menos de 0.8 segundos (verde)
- **Precisa melhorar:** entre 0.8 e 1.8 segundos (amarelo)
- **Ruim:** mais de 1.8 segundos (vermelho)

**No nosso caso:** valor atual ~0.1s → excelente.

---

### 3.3. Relação entre as métricas

É importante entender que as métricas se **complementam** e contam histórias diferentes:

- **Duração total alta + TTFB normal** → servidor está OK, mas algo no fluxo (login, redirects) está lento
- **TTFB alto** → servidor está sobrecarregado ou com problema de rede
- **FCP alto + TTFB normal** → servidor responde rápido, mas a página demora para renderizar (problema no frontend)
- **Status vermelho + todas as durações normais** → o sistema está respondendo, mas há algum problema lógico (senha expirada, ex.)

---

## 4. Como interpretar o dashboard

### 4.1. Olhar rápido (30 segundos)

Basta olhar o painel **Status Atual** na parte superior:

- **Verde "OK"** → sistema funcionando, nada a fazer
- **Vermelho "FALHA"** → há um problema, ir para a análise detalhada

### 4.2. Análise média (2 minutos)

Se o Status Atual estiver VERDE, vale verificar:

- **Última execução há** → confirmar que está atualizando (valor menor que 10 minutos)
- **Escolas na 1ª página** → confirmar que retorna 10
- **Duração total** → confirmar que está no range esperado (35-45s)

### 4.3. Análise profunda (investigação de problema)

Se houver falha ou lentidão, expandir a seção **Métricas Detalhadas** e observar:

- **Tempo por etapa** → identificar qual etapa está mais lenta que o normal
- **Web Vitals** → ver se o servidor está respondendo bem (TTFB) e se a página renderiza rápido (FCP)
- **Histórico de disponibilidade** → ver se é falha pontual ou recorrente

---

## 5. Valores de referência

Esta tabela serve como base para comparar com os valores atuais do dashboard. Se algo estiver muito acima desses valores, há degradação do serviço.

| Métrica            | Verde (bom) | Amarelo (atenção) | Vermelho (problema) |
| ------------------ | ----------- | ----------------- | ------------------- |
| Status             | OK (1)      | -                 | FALHA (0)           |
| Escolas            | 10          | -                 | 0                   |
| Última execução há | < 6 min     | 6 a 10 min        | > 10 min            |
| Duração total      | < 45s       | 45 a 60s          | > 60s               |
| Página inicial     | < 3s        | 3 a 5s            | > 5s                |
| Redirect Google    | < 5s        | 5 a 8s            | > 8s                |
| Login completo     | < 25s       | 25 a 30s          | > 30s               |
| Página escolas     | < 3s        | 3 a 5s            | > 5s                |
| FCP                | < 1.8s      | 1.8 a 3.0s        | > 3.0s              |
| TTFB               | < 0.8s      | 0.8 a 1.8s        | > 1.8s              |

---

## 6. O que fazer em caso de falha

### 6.1. Status VERMELHO isolado (1 execução)

Aguardar próximo ciclo (5 minutos). Pode ter sido instabilidade pontual de rede ou do Google. Se voltar ao VERDE, não requer ação.

### 6.2. Status VERMELHO persistente (2 ou mais ciclos)

Abrir investigação:

1. Acessar o sistema Diário Digital manualmente no navegador
2. Tentar reproduzir o fluxo: login, consulta de escolas
3. Se funcionar manualmente, o problema pode ser na conta de monitoramento (senha alterada, bloqueio do Google)
4. Se não funcionar manualmente, há problema real no sistema - escalar para a equipe responsável

### 6.3. Degradação de performance (tempos acima do esperado)

Comparar com o histórico:

- Se a lentidão for gradual ao longo do dia, pode ser carga de usuários
- Se for pico isolado, pode ser instabilidade de rede
- Se for persistente e crescente, abrir chamado com a equipe de infraestrutura

---

## Contato

Para dúvidas sobre este monitoramento ou ajustes no dashboard, contactar a equipe **DSRED/GEINFS**.

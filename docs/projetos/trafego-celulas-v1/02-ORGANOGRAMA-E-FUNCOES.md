# Organograma e Funções

## Nível departamental

### Gerente de Tráfego Pago e Performance (`manager-trafego`)

Responsável por estratégia consolidada, priorização, distribuição de orçamento entre células, aprovação de mudanças relevantes, saúde do departamento e reporte único ao Gerente Geral.

Não executa silenciosamente o trabalho das células e não movimenta verba fora do limite aprovado.

## Célula Meta Ads & WhatsApp

### Coordenador Meta Ads & WhatsApp (`coordinator-meta-whatsapp`)

Recebe do gerente o objetivo, escopo, verba autorizada e critérios de sucesso. Distribui o trabalho, valida a consistência da célula, aceita entregas internas e devolve ao gerente um pacote consolidado.

Agentes subordinados:

1. **Media Planner Meta/WhatsApp** (`media-planner-meta-whatsapp`) — plano de mídia, públicos, placements, funil e distribuição interna da verba.
2. **Campaign Builder Meta/WhatsApp** (`campaign-builder-meta-whatsapp`) — estrutura de campanhas, conjuntos, anúncios, nomenclatura e configuração.
3. **Tracking Meta/WhatsApp** (`pixel-events-tracking-meta-whatsapp`) — Pixel, Conversions API, eventos, UTMs e validação de sinais.
4. **Otimizador Meta/WhatsApp** (`campaign-optimizer-meta-whatsapp`) — leitura de desempenho e ajustes dentro das alçadas aprovadas.
5. **Guardião de Verba Meta/WhatsApp** (`budget-guardian-meta-whatsapp`) — pacing, limites, anomalias e prevenção de desperdício.
6. **Análise Criativa Meta/WhatsApp** (`creative-performance-analysis-meta-whatsapp`) — desempenho de criativos, mensagens, formatos e recomendações para Design/Social/Branding.

## Célula TikTok Ads

### Coordenador TikTok Ads (`coordinator-tiktok`)

Recebe do gerente o objetivo, escopo, verba autorizada e critérios de sucesso. Distribui o trabalho, valida a consistência da célula, aceita entregas internas e devolve ao gerente um pacote consolidado.

Agentes subordinados:

1. **Media Planner TikTok** (`media-planner-tiktok`) — plano de mídia, públicos, formatos, funil e distribuição interna da verba.
2. **Campaign Builder TikTok** (`campaign-builder-tiktok`) — campanhas, grupos, anúncios, nomenclatura e configuração.
3. **Tracking TikTok** (`pixel-events-tracking-tiktok`) — Pixel, Events API, eventos, UTMs e validação de sinais.
4. **Otimizador TikTok** (`campaign-optimizer-tiktok`) — leitura de desempenho e ajustes dentro das alçadas aprovadas.
5. **Guardião de Verba TikTok** (`budget-guardian-tiktok`) — pacing, limites, anomalias e prevenção de desperdício.
6. **Análise Criativa TikTok** (`creative-performance-analysis-tiktok`) — desempenho de vídeos, hooks, mensagens, formatos e recomendações para Design/Social/Branding.

## Regra de reporte

```text
Agente → Coordenador da sua célula → Gerente de Tráfego → Gerente Geral
```

- agente não pula o coordenador para reportar rotina ao gerente;
- coordenador não altera verba de outra célula;
- gerente consolida e decide a alocação entre células;
- comunicação externa continua pertencendo ao Gerente Geral/PM;
- exceções deixam registro de ator, motivo, data, escopo e impacto.

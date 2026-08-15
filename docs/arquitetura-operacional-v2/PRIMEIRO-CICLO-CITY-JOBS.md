# Primeiro ciclo da agência assistida — City Jobs, 15/08/2026

> Relatório curto ao CEO, exigido pela regra 9 da ordem de ativação.
> **Sem falha crítica. Zero recusas. Zero publicação — o pacote parou na
> aprovação humana, como mandado.**

## O que entrou

Solicitação da **City Jobs** (plataforma que conecta candidatos a vagas na
cidade): primeira semana de social media — estratégia de conteúdo, calendário
editorial, textos dos posts e especificação de design das peças. Entrou pela
porta oficial (`ClientRequestDb`, origem `esteira-assistida`), com rastro desde
o primeiro minuto.

## Quem executou (todos IA, todos registrados)

| Horário | Departamento | Função | Custo |
|---|---|---|---|
| 20:10:03 | Project Management | `pm-orchestrator` | US$ 0,0085 |
| 20:10:47 | Branding | `brand-architect` | US$ 0,0060 |
| 20:11:35 | Social Media | `social-strategist` | US$ 0,0069 |
| 20:12:23 | Social Media | `editorial-planner` | US$ 0,0105 |
| 20:13:06 | Social Media | `copywriter` | US$ 0,0170 |
| 20:14:07 | Design | `graphic-designer` | US$ 0,0193 |

## Handoffs realizados

| De | Para | Estado |
|---|---|---|
| project-management | branding | **aceito** |
| branding | social-media | **aceito** |
| social-media | design | **aceito** |

Nenhum bastão ficou solto: cada handoff carregou o contrato do 03-ESTEIRA
(entrada, saída, versão, critérios, responsável) e só saiu da fila anterior
depois do aceite do departamento destino.

## Entregável produzido

Pacote da cadeia completa: contexto de marca, estratégia de social, calendário
editorial, textos dos posts com direção de arte por peça, e especificação de
design. O artefato do copywriter, por exemplo, veio com legenda, hashtags,
formato, paleta, tipografia e elementos gráficos por post.

## Custo, tempo, aprovações e falhas

| Medida | Resultado |
|---|---|
| **Custo total do ciclo** | **US$ 0,0683** (seis execuções de IA) |
| **Tempo de ponta a ponta** | **4 minutos e 4 segundos** (20:10:03 → 20:14:07) |
| **Aprovações** | 1 card de aprovação **humana** criado, visível ao cliente. Nada publicado, nada gasto fora da IA, nada enviado a ninguém. |
| **Recusas** | 0 |
| **Falhas críticas** | Nenhuma |

## O único incidente, e o que foi feito

A conexão HTTP do operador caiu antes de receber a resposta — a cadeia inteira
leva mais que a janela do gateway. **O trabalho não se perdeu**: as seis
execuções estavam gravadas e o pacote estava pronto no servidor. Ainda assim,
virou conserto na mesma sessão: o ciclo agora é **retomável** (passo já pago
naquele `correlationId` volta do registro, não do provedor), provado ao
retomar este mesmo ciclo — os seis passos voltaram como `reaproveitado` a
custo zero.

## Situação da ativação

- **Ligado:** City Jobs (`v2_execucao` no escopo do `clientId` dela, com motivo
  e decisor registrados). Nenhuma outra chave virada; global é recusado em
  código.
- **Ligadas na ficha:** só as 6 funções da cadeia. As outras 56 recusam.
- **Continua atrás de gente:** publicação em redes, anúncios, verba, cobrança e
  mensagem externa.

**Sem falha crítica no primeiro ciclo — pela regra 7 da ordem, os demais
clientes parceiros podem ser liberados no mesmo modo assistido.**

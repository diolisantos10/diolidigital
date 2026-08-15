# Agentes da casa — as descrições de cargo

> Ordem do CEO, 15/08/2026, executada pelo Agente de Fichas (Control Room):
> cada função que opera nesta casa tem descrição de cargo no formato do
> template mestre (D-003, simplificada). O rollout da V2 só começa com as
> fichas completas — e completude aqui é TESTE, não promessa
> (`__tests__/v2/fichas-da-linha.test.ts`).

## O que é o quê

| Lugar | O que é | Quem lê |
|---|---|---|
| **`agentes/*.md`** (14 fichas) | A OBRA — a equipe de engenharia que constrói e mantém o sistema | Humanos; crachás em `.claude/agents/` com selo |
| **`agentes/linha/`** (11 + 62 fichas) | A LINHA — os funcionários da agência do catálogo canônico V2: 11 fichas de departamento (blocos comuns) + 62 fichas de função | Humanos; o "crachá" da linha é o catálogo (`lib/agency/catalogo-v2/`) + o motor de cada função |
| **`.claude/agents/`** | Crachás da obra (o que o agente de engenharia veste) | Os agentes |

**Obra separada da linha por determinação do CEO (15/08).** A obra constrói a
fábrica; a linha trabalha nela.

## O dispositivo de atualização (decisão do CEO, 15/08/2026 — simples de propósito)

1. **Só o CEO altera ficha** — ou um Diretor, a mando dele.
2. **Quem altera a ficha recompila o crachá na mesma sessão.** Na obra: o
   arquivo em `.claude/agents/` + selo. Na linha: o catálogo/manifesto — e o
   teste de contrato + o teste de cobertura reprovam divergência sozinhos.
3. **Todo crachá carrega o selo** da versão da ficha que o sustenta.

## Fichas da OBRA (14 — todas em vigor)

`diretor`, `pm`, `seguranca`, `qualidade`, `cerebro`, `interface`,
`experiencia`, `esteira`, `departamentos`, `plataforma`, `meta`, `google`,
`tiktok`, `branding` — v1.0, seladas nos crachás em 15/08/2026.

## Fichas da LINHA (11 departamentos, 62 funções — todas em vigor)

Uma pasta por departamento canônico em `linha/`, com `_departamento.md`
(blocos comuns) + uma ficha por função. Cobertura garantida por CI: função
nova no manifesto sem ficha reprova a rodada; ficha órfã também.

Toda função da linha NASCE DESLIGADA no catálogo — ligar/expor é decisão
registrada (escada sombra → allowlist → wide), nunca efeito de deploy.

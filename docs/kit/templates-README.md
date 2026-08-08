<!-- ESPELHO-DO-KIT
origem: templates/README.md
kit-commit: 8af560a2428ddd011a724ab04e78fe85382c1a8b
sha256-do-corpo: 27eb34ef037bfd8b18defa33250698bb854aea0ecfa17044d1d481a90355340c
-->

> ⚠️ **ESPELHO GERADO — NÃO EDITE ESTE ARQUIVO.**
>
> Ele é uma cópia automática de `diolisantos10/dioli-brain-kit` → `templates/README.md`,
> no commit `8af560a`.
>
> **Editar aqui não muda a doutrina** — muda só este repositório, e a próxima
> geração do espelho apaga a sua edição sem avisar. Para mudar a regra,
> edite **no kit**; quem escreve lá é o CEO / Diretor Geral do Cérebro.
>
> Um Diretor de projeto **propõe** mudança de doutrina; promover é ato do
> Diretor Geral, com aval do CEO. Isso é o guardrail 3 aplicado à doutrina:
> agente nunca muda as próprias regras.

---

# Templates — código-molde generalizado ✅

Extraídos do FOOCCI Brain (a referência provada em produção) e generalizados —
nada de nome de domínio hard-coded. Copie, renomeie e adapte o corpo ao projeto.

## Prontos

| Template | Papel | Origem (FOOCCI) |
|---|---|---|
| `engine-dispatcher.ts` | ponto único que fala com a IA (SDK ou fetch cru); roteia OPENAI/CLAUDE/GEMINI | `engines/OpenAIEngineAdapter` + `AIEngineRouter` |
| `reason-gateway.ts` | o **portão** `reasonAsAgent` — escopo → verdade → piloto → coerência; fallback honesto | `reasoning/BrainReasoner` |
| `knowledge-registry.ts` | registry de adaptadores de verdade por domínio + `knowledgeBlock` | `knowledge/KnowledgeAdapterRegistry` |
| `quality-gate.ts` | registry de gates por agente; sem gate = REPROVADO | `quality/BrainQualityGate` |
| `action-ladder.ts` | a **escada** sombra→allowlist→wide + catálogo fechado de ações | `support/SupportRemediationLadder` |
| `architecture.test.ts` | blindagem: CI falha se alguém falar com a IA fora do motor | `brain/architecture.test.ts` |

## Ordem de plantio (usa o manual em `../docs/03-como-plantar.md`)

1. `engine-dispatcher` + `architecture.test` → o motor e a blindagem.
2. `knowledge-registry` → a verdade do domínio.
3. `reason-gateway` → o portão que amarra tudo.
4. Primeiro agente: ficha + adaptador + reasoner (via portão) + `quality-gate`.
5. Se o agente EXECUTA algo: `action-ladder` (nasce em SHADOW).

## Regras de adaptação

- Generalizar nomes; manter os comentários do PORQUÊ.
- Verdade sempre ancorada (`truthSources`/`missingContext`); nunca serializar
  segredo/PII.
- Todo agente nasce em SOMBRA; sobe a escada com evidência, não com pressa.
- O que aprender no plantio → devolver ao molde + registrar em `../casos/`.

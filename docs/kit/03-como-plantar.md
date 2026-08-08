<!-- ESPELHO-DO-KIT
origem: docs/03-como-plantar.md
kit-commit: 8bc1af83271e4fa762041cebf7a8ff34347327fa
sha256-do-corpo: 6910f751c6e3b9bd885a2caee1e58db8fc3994c4a4ddc6b856927a01b9c1d965
-->

> ⚠️ **ESPELHO GERADO — NÃO EDITE ESTE ARQUIVO.**
>
> Ele é uma cópia automática de `diolisantos10/dioli-brain-kit` → `docs/03-como-plantar.md`,
> no commit `8bc1af8`.
>
> **Editar aqui não muda a doutrina** — muda só este repositório, e a próxima
> geração do espelho apaga a sua edição sem avisar. Para mudar a regra,
> edite **no kit**; quem escreve lá é o CEO / Diretor Geral do Cérebro.
>
> Um Diretor de projeto **propõe** mudança de doutrina; promover é ato do
> Diretor Geral, com aval do CEO. Isso é o guardrail 3 aplicado à doutrina:
> agente nunca muda as próprias regras.

---

# 03 — Como plantar o cérebro num projeto novo

Roteiro provado. Fundação primeiro; agentes depois. Não pule etapas — cada uma
existe porque a falta dela já doeu.

## Fase 0 — Raio-x (1 dia)
- Ler TUDO que existe: docs, schema, rotas, deploy, testes.
- Mapa honesto: o que funciona / parcial / esboço / quebrado.
- Identificar: stack, auth, multi-tenancy, onde a IA se encaixa, riscos.
- **Entregável:** relatório de status + onde o cérebro entra.

## Fase 1 — Fundação (1-2 dias)
1. **Motor**: pasta `engines/` com o SDK da IA + dispatcher estruturado
   (`callStructuredJson` ou equivalente) + seleção por agente.
2. **Blindagem**: regra de lint (SDK só em `engines/`) + teste arquitetural
   (lista congelada) no CI.
3. **Portão**: `reasonAsAgent()` agnóstico, com prompt de escopo universal
   (verdade ancorada, guardrails anti-invenção, "não sabe → pergunta").
4. **Registry** de adaptadores de conhecimento + de quality gates.
5. **CI**: typecheck + testes em todo push (se não houver, criar).
6. **Chaves**: variável da IA no ambiente (nunca no código), com fallback
   determinístico honesto quando ausente.

## Fase 2 — Primeiro agente (2-3 dias)
- Escolher o agente de MAIOR valor com MENOR risco de execução.
- Seguir a anatomia (ficha → verdade → reasoner → gate → escada → UI → testes).
- Nasce em **SOMBRA**: raciocina e registra evidência, não age.
- Probes de regressão do domínio (as perguntas onde a IA tende a inventar).

## Fase 3 — Prova e subida (data-gated, sem prazo fixo)
- Coletar evidência em sombra (volume mínimo definido ANTES).
- Prova de valor (ex.: replay agente vs. status quo, lift projetado).
- Subir para ALLOWLIST com interruptor humano + botão de pânico.
- Só ampliar com dado. Paciência é estratégia.

## Fase 4 — Devolver ao kit
- O que o plantio ensinou → atualizar molde/templates/casos.
- Registrar o caso em `casos/<produto>.md`.

## Armadilhas conhecidas (todas já aconteceram)
- **Sinal de fundo sequestra a resposta** — sinal de sistema sem relação com a
  pergunta vira "diagnóstico". Ancorar SEMPRE no relato; sinais são fundo.
- **Config opcional tratada como crítica** — separar tiers (CRITICAL/OPTIONAL);
  opcional ausente é informação, não incidente.
- **Casamento sintoma→causa frouxo** — usar palavras-gatilho curadas por modo de
  falha; na dúvida, NÃO casar e pedir detalhe.
- **Agente mudo parece quebrado** — resumo-base sempre; destaque só com limiar.
- **Otimizar cedo demais** — limiares mínimos de amostra explícitos no código.
- **Teste de contrato desatualizado trava o CI** — ao mudar comportamento
  intencionalmente, atualizar o contrato JUNTO, no mesmo commit.
- **Migration nova + deploy** — migração aditiva com default seguro; nunca
  editar migration já commitada (checksum).
- **Exaustão de conexões do banco** em tempestade de deploys — connection limit
  na URL do banco + preDeploy com retry/auto-heal.

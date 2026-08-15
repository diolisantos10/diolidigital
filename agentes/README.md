# Agentes da casa — as descrições de cargo

> Ordem do CEO, 15/08/2026, executada pelo Diretor Geral (Control Room):
> cada produto ganha a pasta de agentes com a **descrição de cargo** de cada um,
> no formato do **template mestre de agentes** (Control Room,
> `template-agentes/`, decisão D-003).

## O que é o quê — não confundir os três lugares

| Lugar | O que é | Quem lê |
|---|---|---|
| **`agentes/` (esta pasta)** | A **ficha** — descrição de cargo completa: mandato, limites, métricas, governança. | **Humanos.** É onde o CEO tira dúvida do que o agente pode ou não fazer, e onde se audita. |
| **`.claude/agents/*.md` e `CLAUDE.md`** | O **crachá** — o prompt operacional que o agente carrega em toda sessão, automaticamente. | **O agente.** Curto, compilado da ficha. |
| **`docs/agents/`** | Histórico e material de trabalho de cada especialista. | Quem opera a casa. |

**A regra que amarra os três:** a ficha nunca é colada como prompt; o crachá é
derivado dela; e quando a ficha muda, o crachá se recompila — **nunca o
contrário**. Papel dizendo uma coisa e agente fazendo outra é o defeito que
esta pasta existe para impedir.

## Nota honesta sobre a primeira ficha

O cargo de Diretor nasceu **antes** da ficha (`.claude/agents/diretor.md`,
14/08/2026 — a "constituição do cargo"). Aqui a ordem foi inversa ao fluxo
padrão: o crachá existia, e a ficha foi **compilada dele e dos registros da
casa** (`ESTADO-REAL-08-08.md`, `QUEM-APROVA.md`, `modelo-de-negocio.md`,
doutrinas 18, 24 e 29). Nada na ficha foi inventado; campo sem fonte está
marcado como pendente.

A partir de agora vale a ordem certa: **mudança de cargo começa pela ficha**
(corrigida pelo dono de negócio), e o crachá se ajusta a ela com versão nova.

## O dispositivo de atualização (decisão do CEO, 15/08/2026 — simples de propósito)

1. **Só o CEO altera ficha** — ou um Diretor, a mando dele.
2. **Quem altera a ficha recompila o crachá na mesma sessão.** Uma ordem, dois
   arquivos, sempre juntos. Sessão que mexeu na ficha e não recompilou o crachá
   não terminou o trabalho.
3. **Todo crachá carrega o selo** — *"conferido contra a ficha vX.Y"* — então
   qualquer sessão enxerga na hora se os dois estão casados.

Sem fila de aprovação, sem vigia, sem burocracia. É isso.

## Fichas da casa

| Ficha | Status |
|---|---|
| `diretor-v1.0.md` | ✅ EM VIGOR — avaliador: o Diretor Geral (decisão do CEO, 15/08/2026) |
| `pm-v1.0.md` | ✅ EM VIGOR — retrato do crachá em operação (15/08/2026) |
| `seguranca`, `qualidade`, `cerebro`, `interface`, `experiencia`, `esteira`, `departamentos`, `plataforma`, `meta`, `google`, `tiktok`, `branding` (v1.0) | 🟡 ESCRITAS, AGUARDANDO OK DO CEO para subir — ver `antes-depois.md` |

Medição da rodada completa: `antes-depois.md`.

Os demais cargos (`pm`, especialistas) ganham ficha conforme a necessidade —
começando pelos que têm mais poder de causar dano.

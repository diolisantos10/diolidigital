# Como esta biblioteca se mantém viva

> Ordem do CEO (03/08/2026): *"que essa biblioteca seja atualizada diariamente,
> e que isso nunca mais se repita."* O "isso" é a restrição da conta de
> anúncios da Meta, no dia do lançamento da Foocci.

## O mecanismo

1. **Captura** — `node scripts/biblioteca/capturar.mjs` refaz a captura de
   TODAS as fontes de todos os manifestos (`docs/plataformas/*/fontes.json`).
   Cada arquivo capturado carrega `capturado_em` e `hash`; quando o hash muda,
   a ferramenta imprime `[MUDOU]` e lista as mudanças no fim.
2. **Rotina diária** — uma Routine agendada abre uma sessão nova todo dia de
   manhã, roda a captura, e quando algo mudou: lê o diff, resume a mudança em
   `docs/plataformas/CHANGELOG.md` (data, fonte, o que mudou em uma linha),
   ajusta a cartilha da plataforma se a mudança for operacional, e commita.
   Quando nada mudou, registra a passagem silenciosamente no próprio commit
   diário do CHANGELOG (ou não commita nada — sem ruído).
3. **Falha não é silêncio** — captura que falhar (bloqueio, página fora do ar)
   sai no relatório da rotina e entra como lacuna datada no CHANGELOG. Fonte
   que falha 3 dias seguidos vira pendência em `docs/pendencias.md`.

## As regras

- **Fonte é o que foi capturado, não o que se lembra.** Parecer de especialista
  cita `fontes/<slug>.md` ou declara lacuna.
- **Ninguém edita `fontes/*.md` à mão.** É cópia de captura; a mão edita a
  cartilha.
- **Manifesto cresce, não encolhe.** Remover uma fonte do manifesto exige
  registro no CHANGELOG com motivo.

## Limitações declaradas

- A captura roda com Chromium via proxy da sessão (TLS limitado a 1.2 pelo
  egress — verificação de certificado permanece ativa).
- Página que exige login (ex.: painéis internos do Ads Manager) não entra na
  biblioteca — o que é público é o que é capturável.

# FICHA DE DESPACHO — RODADA 3: CONSERTO. O `qualidade` te REPROVOU num ponto.

## Veredito do Essencial `qualidade`: APROVADO COM RESSALVA — 1 defeito BLOQUEANTE

Nove frentes de auditoria seguraram. **Uma quebrou**, e é a que você precisa
consertar agora. Não é opinião do PM: o `qualidade` refez a busca, o `diff` e a
tabela de datas do zero, e achou **fonte contra fonte**.

## O DEFEITO — uma inferência afirmada como fato

**O que você escreveu:** que em 07/08/2026 a Central de Ajuda "respondia **em
HTML**" e que "a proteção **apertou**" entre 07/08 e 30/08.

**O que a fonte de 07/08 diz, literalmente:**
- `fontes/medicao-tecnica-2026-08-07.md` §4: *"A **API pública do Help Center
  (Zendesk)** devolveu HTTP 429 Too Many Requests após ~14 leituras seguidas."*
  — fala de **API**, não de HTML.
- `pareceres/2026-08-07-agente-autonomo-de-prospeccao.md`: *"Existe API oficial ou
  caminho autorizado? **NÃO.** (...) **Navegador é o único caminho que existe.**"*
  — que contradiz o item acima, no mesmo dia.

**Portanto: ninguém mediu o HTML da Central de Ajuda em 07/08**, e as duas fontes
daquela data se contradizem sobre qual interface devolveu o 429. **"A proteção
apertou" é LACUNA, não fato.** Este é exatamente o padrão dos dois pareceres de
memória refutados em 13/08/2026: citação virando fato.

**Isto não derruba** o veredito operacional (silêncio ≠ autorização, HUMAN_GATE,
banimento alcança outras contas) — nenhuma dessas conclusões depende da Central de
Ajuda. **Derruba sim** a base técnica que o parecer usa para justificar o caminho
da API do Zendesk.

## O QUE CONSERTAR — os três lugares, e só eles

O PM já corrigiu `fontes/medicao-tecnica-2026-08-30.md` §4 (era artefato dele).
**Leia essa correção primeiro** — o texto novo dela é o padrão a seguir. Faltam:

1. `pareceres/2026-08-30-operacao-da-sessao-autenticada.md` **linha ~60**:
   *"...em HTML limpo, sem desafio, antes de a proteção apertar) — não vira LACUNA"*
2. `pareceres/2026-08-30-operacao-da-sessao-autenticada.md` **linha ~126**:
   *"...Ajuda em HTML apertou a proteção (429 depois de ~14 leituras em 07/08 → ...)"*
3. `policy.json`, campo `anti_bot.central_de_ajuda_html_2026_08_30`:
   *"...— a proteção apertou entre 07/08 e 30/08."*

Em cada um: **afirme só o que foi medido hoje** (403 com `cf-mitigated: challenge`
na primeira requisição, nas 12 URLs, em 30/08/2026) e **marque como LACUNA** o que
o HTML respondia em 07/08, **citando a contradição entre as duas fontes daquela
data**. Não conserte apagando — conserte declarando.

## O SEGUNDO DEFEITO — não bloqueante, mas conserte junto

Sua **nota metodológica** sobre a busca do silêncio declara ter filtrado as 24
ocorrências de "API" que vieram do cabeçalho escrito pelo PM. **Ela não declara**
que você também filtrou **1 ocorrência de "exclusiva"**, que estava no campo
`titulo:` do frontmatter de
`ajuda-plano-gratuito-nao-consigo-enviar-proposta-2026-08-30.md` (linha 2,
"...janela de 24h **exclusiva** de assinantes"). O número final (**28**) está
**certo** — o `qualidade` refez e bateu termo a termo. O que está incompleto é a
**explicação do método**. Complete-a: filtro não declarado parece filtro
escondido.

## O TERCEIRO ITEM — incorpore o parecer do `seguranca`, que já saiu

O Essencial `seguranca` entregou
`pareceres/2026-08-30-seguranca-sessao-do-titular.md`. **Leia-o.** Ele decidiu a
pergunta que o seu parecer deixou em aberto:

- **A leitura pela API do Zendesk NÃO burlou proteção** — as 12 capturas ficam
  válidas. Mas **não vira rotina**: só recaptura ocasional de documentação, no
  ritmo de hoje.
- Ele abriu um **P0 de pré-condição**: "Claude in Chrome com a sessão do titular"
  só é seguro em **perfil de navegador isolado**, e esse isolamento **não existe
  em código** — só como parágrafo de especificação.

**Atualize o bloco 🔴 do seu parecer** para registrar que a pergunta foi decidida,
por quem, com que ressalva — e **acrescente uma linha em `policy.json`** que
registre o P0 do perfil isolado como pré-condição de `sessao_autenticada`.
**Não afrouxe nenhuma flag.** `auto_submission_allowed`, `browser_automation_allowed`
e `auto_messaging_allowed` continuam `false`; `human_gate_required` continua `true`.

## O QUE NÃO FAZER
- **Não reescreva o parecer inteiro.** Ele foi aprovado em 9 de 10 frentes.
  Cirurgia, não demolição.
- **Não toque** nas capturas de `fontes/` (nem as de 07/08, nem as de 30/08) —
  exceto que **não** deve tocar em nenhuma: a correção da medição já foi feita.
- **Não toque** em `prisma/schema.prisma`, `lib/agency/celula/**`,
  `lib/marketplaces/**`, `docs/plataformas/99freelas/mensagens.json`,
  `__tests__/celula/**`, `docs/celula-prospeccao/**`.
- **Não toque** no parecer do `seguranca` — é dele.
- **Sem rede** (não há egress). Sem `git commit`, sem `git push`.

## CRITÉRIO DE ACEITE
- `grep -n "apertou\|apertar"` no parecer e no `policy.json` não devolve mais
  nenhuma **afirmação**; só menção declarada como LACUNA.
- A nota metodológica declara os **dois** filtros (24 de "API" + 1 de "exclusiva").
- O bloco 🔴 registra a decisão do `seguranca` e o P0 do perfil isolado.
- Nenhuma flag de permissão afrouxada.

## Devolutiva
Bullets curtos. Diga o que mudou em cada arquivo e cole o `grep` que prova o
critério de aceite.

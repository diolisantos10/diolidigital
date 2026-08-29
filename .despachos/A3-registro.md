# DESPACHO A3 — O registro do diagnóstico (item 4). CURTO. Um arquivo só.

## OBJETIVO
Escrever `docs/diagnosticos/o-convite-do-marcos-nao-valeu-29-08.md` — o registro
do que foi medido hoje sobre o convite de parceria do Marcos (Foocci).

⛔ **NÃO escreva código. NÃO toque em nenhum `.ts`. Um único arquivo `.md`.**
Toda a construção JÁ ESTÁ FEITA e no disco — leia-a e registre. Se você editar
código, quebra o trabalho de outros dois especialistas.

## LEIA ANTES (é daqui que sai o registro)
- `lib/agency/comercial/regra-do-convite.ts` (novo)
- `lib/agency/comercial/retrato-dos-convites.ts` (novo)
- `app/api/piloto/diagnostico/route.ts` (seção `parcerias`, a partir da linha 127)
- `lib/agency/persistence/cliente-vinculos.ts` (as duas flags `unicoPorCliente`
  novas + `traduzirConflitoDeFusao` no fim)
- `app/api/clients/[id]/fundir/route.ts` (o `try/catch` do `$transaction`)
- `__tests__/comercial/o-convite-do-marcos-aponta-para-o-cadastro-errado.test.ts`
- `__tests__/agency/fundir-cliente.test.ts` (o guarda novo, a partir da linha 176)
- `__tests__/agency/fundir-cliente-rota.test.ts` (novo)
- `docs/diagnosticos/fusao-de-cliente-duplicado.md` (o achado anterior)

## O QUE O DOCUMENTO TEM DE DIZER — nesta ordem

### 1. O QUE FOI MEDIDO
- A cadeia do convite está inteira e no ar. Não falta peça.
- PR #399 deu nome às cinco recusas e faz `resolverConviteDeParceria` gritar
  `[CONVITE-RECUSADO]` no log.
- **Nenhum `[CONVITE-RECUSADO]` apareceu desde o deploy** → o Marcos não voltou.
  **O log só fala quando ele volta — por isso ele não acha a causa.** Esse é o
  buraco que hoje foi fechado.
- A FOOCCI nasceu DUAS vezes em 27/08 21:22 (double-submit, 7s de diferença):
  `cmtc145qf007a0xo4txmjss11` e `cmtc13zy700760xo40pmav2xc`.

### 2. A HIPÓTESE — e diga com todas as letras que é HIPÓTESE, não conclusão
O link do Marcos foi cunhado ANTES de o duplicado ser descoberto. Se ele aponta
para o cadastro que NÃO carrega a parceria, então — porque
`ParceriaDoCliente.clientId` é `@unique` (`prisma/schema.prisma:2764`), e a
parceria só pode viver em UM dos dois — o motivo é `parceria_nao_esta_viva`.
**Isto não foi provado. Só a medição em produção prova.**

### 3. COMO SE MEDE EM PRODUÇÃO — o `curl` exato
```
curl -sS "https://<host>/api/piloto/diagnostico?chave=$PILOTO_SECRET" | jq .parcerias
```
(ou `-H "Authorization: Bearer $PILOTO_SECRET"`.)

E explique **como se lê a resposta**, que é o que importa:
- `parcerias.por_motivo` — o placar num relance.
- `parcerias.convites[]` — cada convite com `motivo`, `clientId`, `prefixo` (8
  caracteres do token), `usos`, `ultimoUsoEm`, `expiraEm`, `revogadoEm`.
- `parcerias.clientes_de_nome_colidente[]` — os grupos de nome duplicado, com
  `temParceriaViva` por cadastro.
- **A leitura que responde a pergunta:** um convite com
  `motivo: "parceria_nao_esta_viva"` cujo `clientId` esteja num grupo de nome
  colidente onde o OUTRO cadastro tem `temParceriaViva: true` → **é a causa, e
  o conserto é fundir os dois cadastros.**
- ⚠️ Diga que `PILOTO_SECRET` precisa estar configurado como variável PRÓPRIA em
  produção: sem ela a rota cai no `CRON_SECRET`, que é segredo de ESCRITA, e ele
  passaria a trafegar em `?chave=` (o achado do `seguranca` já registrado no
  cabeçalho da rota). **Sem `PILOTO_SECRET` a rota devolve 503 e não mede nada.**

### 4. O QUE FOI CONSERTADO NO CAMINHO DO CONSERTO
A fusão — o caminho que o CEO usaria para juntar os dois cadastros — abortava
com **500 cru**: `parceriaDoCliente` e `brandBrain` são `@unique` por `clientId`
mas não carregavam `unicoPorCliente: true`, então `moverVinculos` tentava MOVER
em vez de descartar, o Prisma jogava `P2002` e a transação abortava. Hoje: as
duas flags, um guarda que lê o `prisma/schema.prisma` e pega **o próximo**
`@unique` que entrar sem flag, e `P2002` virando **409 legível** que diz qual
vínculo colidiu (`traduzirConflitoDeFusao`).

### 5. AS MUTAÇÕES RODADAS — copie esta tabela como está, é medição real
| # | O que foi quebrado de propósito | Resultado |
|---|---|---|
| M1 | tirar `unicoPorCliente` de `parceriaDoCliente` | VERMELHO, nomeando `ParceriaDoCliente` |
| M2 | tirar de `brandBrain` | VERMELHO, nomeando `BrandBrain` |
| M3 | tirar de `googleDriveConnection` (que já tinha) | VERMELHO — prova que o guarda pega o caso geral, não só os dois consertados |
| M4 | `P2002` voltar a ser 500 cru | VERMELHO (2 testes de rota) |
| M5 | o retrato devolver o TOKEN INTEIRO | VERMELHO — a trava de credencial existe |
| M6 | inverter a ordem da regra (vencido antes de revogado) | VERMELHO |
| M7 | trocar `<` por `<=` na vitalidade da parceria | VERMELHO |
| M8 | a regra compartilhada parar de reconhecer `revogado` | VERMELHO em **3 arquivos**, incluindo os testes PRÉ-EXISTENTES do caminho de produção |
| M9 | a regra parar de reconhecer `parceria_nao_esta_viva` | VERMELHO em **3 arquivos**, idem |

Explique por que M8 e M9 são as que importam: elas provam que
`examinarConviteDeParceria` — o mesmo que `app/api/sdr/chat/route.ts:766` chama —
usa **a mesma** função que o diagnóstico. Não há duas versões de "por que este
convite não vale".

### 6. ⛔ O QUE NÃO FOI POSSÍVEL PROVAR — seção própria, com todas as letras
- **A causa NÃO está provada.** Nada foi medido em produção: este ambiente não
  tem credencial de produção nem `PILOTO_SECRET`. Tudo o que existe é a régua
  que mede — e ela ainda não foi apontada para o banco real.
- **Não se sabe para qual dos dois cadastros o link do Marcos aponta.** É a
  primeira coisa que o `curl` responde.
- **Não se sabe se os dois cadastros têm parceria ou cérebro de marca.** Só
  importa para saber se a fusão teria mesmo batido no `P2002`; o conserto vale
  de qualquer jeito.
- **Nenhum cadastro de produção foi tocado. Nenhuma cobrança. Nenhuma mensagem
  a pessoa real.**

## O QUE VEM DEPOIS (última seção, curta)
1. CEO ou Diretor rodam o `curl` em produção e leem `parcerias`.
2. Confirmada a hipótese → fundir os dois cadastros da FOOCCI (o caminho agora
   não aborta) e conferir que o convite volta a valer.
3. Refutada → o retrato já diz qual dos seis motivos é, e aí a investigação
   começa do motivo certo em vez de recomeçar do zero.

## FORMATO
Português do Brasil, direto, conclusão primeiro. Curto — é registro, não ensaio.
Não invente número que você não leu no disco. Não commite. Não rode `git`.

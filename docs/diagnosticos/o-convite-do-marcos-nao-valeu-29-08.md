# O convite do Marcos não valeu — o que foi medido em 29/08

> **Pedido:** item 4 do despacho A3, 29/08/2026.
> **Escopo:** registro do que já está construído e testado no disco. Nada foi
> tocado em produção. Nenhuma linha de código foi escrita ou alterada nesta
> sessão.

## 1. O que foi medido

A cadeia inteira do convite de parceria — da decisão pura até a rota que o CEO
consulta sem terminal — **está completa e no ar**. Não falta peça.

- O PR #399 deu nome às cinco recusas do convite e fez
  `resolverConviteDeParceria` gritar `[CONVITE-RECUSADO]` no log toda vez que
  alguém volta com o link na mão.
- **Nenhum `[CONVITE-RECUSADO]` apareceu desde o deploy** — o que significa que
  o Marcos não voltou a tentar. **O log só fala quando ele volta, e por isso
  ninguém achava a causa.** Esse é o buraco que hoje foi fechado: agora existe
  uma régua (`retrato-dos-convites.ts` + a seção `parcerias` do diagnóstico) que
  mede o estado de CADA convite sem esperar o parceiro reclamar.
- A FOOCCI nasceu **duas vezes** em 27/08 21:22 (double-submit, 7 segundos de
  diferença): `cmtc145qf007a0xo4txmjss11` e `cmtc13zy700760xo40pmav2xc`. Isso já
  estava registrado em `docs/diagnosticos/fusao-de-cliente-duplicado.md`.

## 2. A hipótese — e ela É hipótese, não conclusão

O link do Marcos foi provavelmente cunhado ANTES de o duplicado ser descoberto.
Se ele aponta para o cadastro que **não** carrega a parceria, então — porque
`ParceriaDoCliente.clientId` é `@unique` (`prisma/schema.prisma:2764`, "um
cliente tem UMA parceria") e a parceria só pode viver em UM dos dois cadastros
— o motivo da recusa é `parceria_nao_esta_viva`.

**Isto não foi provado.** Só a medição em produção prova. Ninguém neste
ambiente sabe para qual dos dois cadastros o link do Marcos aponta.

## 3. Como se mede em produção

```
curl -sS "https://<host>/api/piloto/diagnostico?chave=$PILOTO_SECRET" | jq .parcerias
```

(ou `-H "Authorization: Bearer $PILOTO_SECRET"` no lugar do `?chave=`.)

**Como ler a resposta** — é isto que importa:

- `parcerias.por_motivo` — o placar num relance (`vale`, `revogado`, `vencido`,
  `parceria_nao_esta_viva`).
- `parcerias.convites[]` — cada convite com `motivo`, `clientId`, `prefixo` (8
  caracteres do token — nunca o token inteiro), `usos`, `ultimoUsoEm`,
  `expiraEm`, `revogadoEm`.
- `parcerias.clientes_de_nome_colidente[]` — os grupos de nome duplicado, cada
  cadastro do grupo com `temParceriaViva`.

**A leitura que responde à pergunta:** um convite com
`motivo: "parceria_nao_esta_viva"` cujo `clientId` esteja num grupo de nome
colidente onde o OUTRO cadastro do grupo tem `temParceriaViva: true` → **é a
causa, e o conserto é fundir os dois cadastros.**

⚠️ **`PILOTO_SECRET` precisa estar configurado como variável PRÓPRIA em
produção.** Sem ela a rota cai no `CRON_SECRET`, que é segredo de ESCRITA, e ele
passaria a trafegar em `?chave=` — achado do `seguranca` já registrado no
cabeçalho de `app/api/piloto/diagnostico/route.ts`. **Sem `PILOTO_SECRET` a
rota devolve 503 e não mede nada** (`route.ts:102-109`).

## 4. O que foi consertado no caminho do conserto

A fusão — o caminho que o CEO usaria para juntar os dois cadastros da FOOCCI —
abortava com **500 cru**: `parceriaDoCliente` e `brandBrain` são `@unique` por
`clientId` mas não carregavam `unicoPorCliente: true`, então `moverVinculos`
tentava MOVER a linha do absorvido em vez de descartá-la quando o sobrevivente
já tinha a sua, o Prisma jogava `P2002` e a transação abortava sem
`try/catch`.

Hoje:
- as duas flags estão marcadas (`cliente-vinculos.ts:81` e `:121`);
- um guarda de teste lê o `prisma/schema.prisma` linha a linha e reprova
  qualquer `clientId @unique` (ou `@@unique([workspaceId, clientId])`) que
  entrar **sem** a flag — não só os dois já corrigidos
  (`__tests__/agency/fundir-cliente.test.ts:176-236`);
- `P2002` agora vira **409 legível**, que nomeia qual vínculo colidiu
  (`traduzirConflitoDeFusao`, `cliente-vinculos.ts:253-297`, chamado em
  `fundir/route.ts:83-97`).

## 5. As mutações rodadas

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

**Por que M8 e M9 são as que importam:** elas provam que
`examinarConviteDeParceria` — o mesmo que `app/api/sdr/chat/route.ts:766`
chama para resolver o link em produção — usa **a mesma** função
(`decidirConvite`, em `regra-do-convite.ts`) que o diagnóstico usa. Não há
duas versões de "por que este convite não vale": se houvesse, uma poderia
divergir da outra e o diagnóstico mentiria sobre o que a casa realmente faz.
Isso está coberto também por
`__tests__/comercial/o-convite-do-marcos-aponta-para-o-cadastro-errado.test.ts`,
que roda o exame real e o retrato lado a lado sobre o mesmo cenário (cadastro
A sem parceria, cadastro B com — os dois chamados "FOOCCI") e confere que os
dois concordam.

## 6. ⛔ O que não foi possível provar

- **A causa NÃO está provada.** Nada foi medido em produção: este ambiente não
  tem credencial de produção nem `PILOTO_SECRET`. Tudo o que existe é a régua
  que mede — e ela ainda não foi apontada para o banco real.
- **Não se sabe para qual dos dois cadastros o link do Marcos aponta.** É a
  primeira coisa que o `curl` da seção 3 responde.
- **Não se sabe se os dois cadastros têm parceria ou cérebro de marca.** Só
  importa para saber se a fusão bateria de fato no `P2002`; o conserto da
  seção 4 vale de qualquer jeito, independente da resposta.
- **Nenhum cadastro de produção foi tocado. Nenhuma cobrança. Nenhuma mensagem
  a pessoa real.**

## 7. O que vem depois

1. CEO ou Diretor rodam o `curl` da seção 3 em produção e leem `parcerias`.
2. Hipótese confirmada → fundir os dois cadastros da FOOCCI (o caminho agora
   não aborta com 500 cru) e conferir que o convite volta a valer.
3. Hipótese refutada → o retrato já diz qual dos seis motivos é de fato, e a
   investigação começa do motivo certo em vez de recomeçar do zero.

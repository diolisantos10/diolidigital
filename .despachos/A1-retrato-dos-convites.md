# DESPACHO A1 — O retrato dos convites (itens 1 e 2 da ficha do Diretor)

## OBJETIVO EM UMA FRASE
Tornar possível saber, sem terminal e **sem o Marcos voltar ao site**, em que
estado está cada `ConviteDeParceria` do banco de produção — e provar a hipótese
do cadastro duplicado com teste que passa pelo código real.

## O CONTEXTO REAL (leia antes de escrever uma linha)
- `lib/agency/comercial/convite-de-parceria.ts` — `examinarConviteDeParceria`
  (linha ~205) decide os seis motivos. `resolverConviteDeParceria` (linha ~250)
  grita `[CONVITE-RECUSADO]`. **O log só fala quando alguém volta — por isso ele
  não acha a causa. É esse buraco que você fecha.**
- `lib/agency/financeiro/parceria-do-parceiro.ts` — `parceriaVivaDoCliente`
  (linha ~185): `null` se não existe, se `revogadaEm`, se `validaAte` ilegível,
  ou se `validaAte.getTime() < agora.getTime()`. ⚠️ **É `<`, não `<=`.** A regra
  pura tem de reproduzir isso byte a byte.
- `app/api/piloto/diagnostico/route.ts` — a rota que você AMPLIA. Somente `GET`,
  `PILOTO_SECRET`, só `findMany`, `LIMITE = 500`, e o padrão de falha
  `medido:false` + 503 nas linhas finais. Leia o cabeçalho inteiro: ele explica
  por que a rota é somente-leitura e por que não devolve PII.
- `docs/diagnosticos/fusao-de-cliente-duplicado.md` — a FOOCCI nasceu duas vezes
  em 27/08 21:22 (double-submit, 7s): `cmtc145qf007a0xo4txmjss11` e
  `cmtc13zy700760xo40pmav2xc`.
- `prisma/schema.prisma:2758` — `model ParceriaDoCliente`, com
  `clientId String @unique` na linha 2764. É por isso que a parceria só pode
  viver em UM dos dois cadastros.
- Padrão de teste desta casa: `__tests__/comercial/o-convite-recusado-nao-e-mudo.test.ts`
  — `vi.hoisted` + `vi.mock("@/lib/db/client")`. Copie o estilo.

## A HIPÓTESE A MEDIR (é hipótese, NÃO conclusão)
O link do Marcos foi cunhado ANTES de o duplicado ser descoberto. Se ele aponta
para o cadastro errado, a `ParceriaDoCliente` vive no OUTRO cliente → o motivo é
`parceria_nao_esta_viva`. **Você não vai provar isso aqui — você vai construir a
régua que mede isso em produção.**

## O QUE ENTREGAR

### 1. A REGRA PURA COMPARTILHADA — faça isto PRIMEIRO
Novo: `lib/agency/comercial/regra-do-convite.ts`. **Zero import de Prisma, zero
import de `@/lib/db/client`.** Só tipos e a decisão.

Exporte:
- `type MotivoDaRecusaDoConvite` (mova a definição para cá).
- `type LinhaDeConvite = { clientId: string; expiraEm: Date; revogadoEm: Date | null }`
- `type LinhaDeParceria = { revogadaEm: Date | null; validaAte: Date } | null`
- `function decidirConvite(convite: LinhaDeConvite | null, parceria: LinhaDeParceria, agora: Date): MotivoDaRecusaDoConvite | null`
  — `null` significa "vale". Ordem: `token_desconhecido` (convite nulo) →
  `revogado` → `vencido` → `parceria_nao_esta_viva` → `null`.
  `sem_token` e `erro_de_banco` NÃO saem daqui: são estados de quem chama, não
  da linha.
- E uma função para a vitalidade da parceria com a MESMA aritmética de
  `parceriaVivaDoCliente` (`revogadaEm` → morta; `validaAte` inválida → morta;
  `validaAte < agora` → morta).

**`convite-de-parceria.ts` PASSA A USAR ESTA FUNÇÃO.** Não deixe duas cópias da
regra: *duas versões de "por que este convite não vale" divergiriam, e a do
diagnóstico mentiria.* Mantenha o `export type MotivoDaRecusaDoConvite`
re-exportado de `convite-de-parceria.ts`, porque outros arquivos podem importá-lo
de lá — não quebre importador nenhum.

⚠️ A decisão de `examinarConviteDeParceria` tem de continuar **byte a byte** a de
hoje, incluindo: `sem_token` não toca o banco; a trilha (`usos: increment`) só
roda DEPOIS da decisão e não pode derrubá-la; `catch` → `erro_de_banco`.
Os testes existentes em `__tests__/comercial/o-convite-recusado-nao-e-mudo.test.ts`,
`o-convite-do-parceiro.test.ts` e `a-jornada-do-parceiro.test.ts` têm de continuar
verdes SEM edição. Se você precisar editar um deles, PARE e diga por quê no relato.

### 2. O RETRATO — módulo puro
Novo: `lib/agency/comercial/retrato-dos-convites.ts`. Puro, sem Prisma. Recebe as
linhas já lidas e devolve o retrato. Ele usa `decidirConvite` — não reimplementa.

Para CADA convite, devolva:
- `motivo` — qual dos motivos ele recebe **AGORA** (ou `"vale"` / `null`).
- `clientId` para onde aponta.
- `prefixo` — **os 8 primeiros caracteres do token, e NADA MAIS.**
- `usos`, `ultimoUsoEm`, `expiraEm`, `revogadoEm`.

E a denúncia de **cliente duplicado**: clientes cujo nome normalizado colide.
Normalização: minúsculo, sem acento (`normalize("NFD").replace(/\p{Diacritic}/gu,"")`),
espaço duplo colapsado, `trim`. Para cada grupo colidente diga, por cliente:
`id`, `nome`, e `temParceriaViva: boolean`. **Esse é o dado que responde a
pergunta do Marcos** — se o convite aponta para o cadastro SEM parceria viva, a
causa está achada.

Some também um contador por motivo, para o CEO dimensionar num relance.

⛔ **NUNCA o token inteiro na saída nem em log.** Ele é credencial. Prefixo de 8.
⛔ **Nenhuma PII**: nada de e-mail, telefone, nome de prospect, frase de conversa.
Nome de cliente entra **só** dentro dos grupos de nome colidente, porque a
pergunta do duplicado exige comparar nomes. Convite que não está em grupo
colidente não carrega nome nenhum.

### 3. O CHAMADOR — amplie a rota que já existe
`app/api/piloto/diagnostico/route.ts`. **Não crie rota nova** — rota nova é mais
superfície e mais um segredo. Acrescente uma seção `parcerias` ao JSON.

- Leia com `findMany` e `select` MÍNIMO:
  - `conviteDeParceria`: `{ token, clientId, expiraEm, revogadoEm, usos, ultimoUsoEm }`
  - `parceriaDoCliente`: `{ clientId, revogadaEm, validaAte }`
  - `client`: `{ id, name }`
- ⛔ **Somente leitura. Nenhum `create`/`update`/`delete`/`upsert`/`increment`.**
- ⛔ **NÃO chame `examinarConviteDeParceria` a partir do diagnóstico.** Ele
  ESCREVE trilha de uso — o diagnóstico não pode inflar `usos` de um convite que
  ninguém apresentou. É exatamente por isso que a regra pura existe.
- Respeite `LIMITE`. Falha de leitura segue o padrão da rota: `medido:false`,
  503, "não são zero, são desconhecidos" — **não vire zero**.
- Atualize o cabeçalho do arquivo dizendo o que a seção nova responde e por quê.

### 4. OS TESTES — em `__tests__/comercial/`
Arquivo novo (sugestão: `o-convite-do-marcos-aponta-para-o-cadastro-errado.test.ts`).

Obrigatório:
a) Passar pelo **`examinarConviteDeParceria` de verdade** — o mesmo que
   `app/api/sdr/chat/route.ts:766` chama — cobrindo os SEIS motivos.
b) **O cenário do duplicado, e ele é o coração:** cliente A e cliente B com o
   MESMO nome; `ParceriaDoCliente` viva SÓ em B; convite cunhado apontando para
   A → `examinarConviteDeParceria` tem de devolver exatamente
   `parceria_nao_esta_viva`.
c) O retrato sobre esse mesmo cenário: aponta o convite de A como
   `parceria_nao_esta_viva` E denuncia o grupo de nome colidente dizendo que B
   tem parceria viva e A não.
d) **O retrato NÃO escreve:** prove que nenhum `update`/`create`/`delete` do
   mock foi chamado ao montar o retrato.
e) **O token não vaza:** prove que nenhum campo da saída contém o token inteiro,
   só os 8 primeiros caracteres.
f) O retrato e o exame real **concordam** sobre a mesma linha, nos seis casos —
   é esta a prova de que a regra é uma só.
g) Nomes que colidem só por acento/caixa/espaço duplo entram no mesmo grupo; e
   dois clientes de nomes de verdade diferentes **não** viram falso positivo.

## RESTRIÇÕES
- ⛔ Não toque em cadastro de produção. Não gere cobrança. Não mande mensagem.
- ⛔ Não mexa em `lib/agency/persistence/cliente-vinculos.ts`, em
  `app/api/clients/[id]/fundir/route.ts` nem em `__tests__/agency/` — outro
  especialista está nesses arquivos AGORA, no mesmo bloco. Encostar neles é
  colisão.
- ⛔ Não commite. Não rode `git`.
- Leia `node_modules/next/dist/docs/` antes de mexer na rota: este Next tem
  quebras em relação ao que você conhece.
- Mock com `vi.hoisted(() => vi.fn())` **sem assinatura** é o erro que já barrou
  três PRs desta casa no `tsc`. **Anote o retorno**:
  `vi.fn(async (): Promise<{ x: string[] }> => ({ x: [] }))`.

## CRITÉRIO DE ACEITE
1. Cite **arquivo e linha do chamador** de cada peça nova. Peça sem chamador
   volta.
2. O teste alcança o código que responde ao cliente (`examinarConviteDeParceria`
   real), não um clone.
3. Os testes de convite que já existem continuam verdes **sem edição**.
4. Diga o que você NÃO conseguiu provar. Recusa declarada vale mais que verde
   inventado.

## O QUE DEVOLVER NO RELATO
Arquivo por arquivo o que mudou · quem chama o quê (arquivo:linha) · o `curl`
exato que o CEO roda em produção para ver a seção nova · o que ficou sem prova.
Se `npm`/`npx`/`node`/`git` for recusado no seu ambiente, **cole a mensagem
exata da recusa** — o portão é meu, eu rodo.

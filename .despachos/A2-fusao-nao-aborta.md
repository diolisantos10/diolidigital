# DESPACHO A2 — A fusão de cliente não pode abortar com 500 cru (item 3)

## OBJETIVO EM UMA FRASE
O caminho que o CEO usaria para consertar o cadastro duplicado da FOOCCI está
quebrado: a fusão viola uma restrição de unicidade, a transação aborta e a tela
só diz "não foi possível concluir". Conserte a causa, ponha a trava que pega o
próximo, e dê à rota uma falha legível.

## O DEFEITO, JÁ MEDIDO (não refaça o diagnóstico, conserte)
`lib/agency/persistence/cliente-vinculos.ts` tem a lista `VINCULOS_SOLTOS`, e a
flag `unicoPorCliente: true` é o que faz `moverVinculos` (linha ~155) **descartar**
a linha do absorvido em vez de tentar movê-la. Duas linhas estão sem a flag e
deveriam tê-la:

| Linha da lista | Onde está no schema | Restrição |
|---|---|---|
| `{ chave: "parceriaDoCliente", rotulo: "parcerias do cliente" }` | `prisma/schema.prisma:2758` (`model ParceriaDoCliente`), campo na linha **2764** | `clientId String @unique` |
| `{ chave: "brandBrain", rotulo: "cérebro de marca" }` (está em `VINCULOS_EM_CASCATA`) | `prisma/schema.prisma:813` (`model BrandBrain`), campo na linha **815** | `clientId String @unique` |

Consequência real, e é por isso que este bloco existe: os DOIS cadastros da
FOOCCI (`cmtc145qf007a0xo4txmjss11` e `cmtc13zy700760xo40pmav2xc`, criados com 7s
de diferença em 27/08 21:22 — ver `docs/diagnosticos/fusao-de-cliente-duplicado.md`)
podem ter parceria ou cérebro de marca nos dois. Aí o `updateMany` viola a
restrição, o Prisma joga **`P2002`**, o `$transaction` aborta e
`app/api/clients/[id]/fundir/route.ts` — que **não tem `try/catch` em volta do
`$transaction`** (linha ~63) — devolve **500 cru**.

## O QUE ENTREGAR — três coisas

### 1. As flags que faltam
Ponha `unicoPorCliente: true` nas duas linhas. Escreva no comentário POR QUE —
citando o número da linha do schema —, no tom que o arquivo já usa. Cuidado com
`brandBrain`: ele está em `VINCULOS_EM_CASCATA`, e `moverVinculos` percorre
`TODOS` (cascata + soltos), então a flag funciona lá também — **confirme lendo o
código antes de afirmar**, não presuma.

### 2. O TESTE-GUARDA QUE LÊ O SCHEMA — esta é a peça principal
`__tests__/agency/fundir-cliente.test.ts` já tem, na linha **134-172**, um guarda
que confere **presença** na lista. Ele não confere **unicidade** — por isso não
pegou. Acrescente um segundo guarda no mesmo arquivo:

> Todo modelo que tenha `clientId String @unique` (ou `clientId String? @unique`)
> em `prisma/schema.prisma` E que esteja declarado na lista de vínculos
> **TEM de carregar `unicoPorCliente: true`**. Falha NOMEANDO o modelo esquecido.

E cubra também a forma composta: `@@unique([workspaceId, clientId])` — que é o
caso de `GoogleDriveConnection` (`schema.prisma:341`) e `ClientAiProvider`
(`schema.prisma:1024`), os dois que JÁ têm a flag. Se seu parser não conseguir
tratar as duas formas com segurança, trate a forma `@unique` de campo (que é a
que causou o defeito) e **declare explicitamente no relato** o que ficou de fora
— recusa declarada vale mais que cobertura inventada.

⚠️ O guarda tem de pegar **o PRÓXIMO `@unique` que entrar sem flag**, não só
estes dois. Teste que só confirma o que já está certo não é trava.

### 3. A ROTA DA FUSÃO FALHA LEGÍVEL
`app/api/clients/[id]/fundir/route.ts`, o `await prisma.$transaction(...)` da
linha ~63.
- **Mantenha a transação.** Fusão pela metade é pior que não ter começado — o
  cabeçalho do arquivo explica.
- Envolva em `try/catch`. `P2002` vira resposta com status apropriado (409 é o
  certo para conflito de unicidade) e **diz qual vínculo colidiu**, usando o
  `meta.target` do erro do Prisma quando ele vier, e o `rotulo` em português da
  lista de vínculos — o CEO lê "parcerias do cliente", não `parceriaDoCliente`.
- Erro que **não** é `P2002` continua sendo erro, não vira sucesso. Logue-o e
  devolva 500 com mensagem, nunca um 500 mudo.
- ⛔ Nenhuma PII na mensagem de erro.

E acrescente teste para isso — a rota tem de responder legível quando o
`$transaction` rejeita com `P2002`. Se testar a rota inteira for caro, extraia a
tradução `P2002 → mensagem` para uma função pura e teste a função **E** prove que
a rota a chama (cite arquivo:linha).

## AS MUTAÇÕES QUE VOCÊ TEM DE RODAR
Para CADA trava nova: quebre de propósito, veja o teste ficar VERMELHO, desfaça,
veja voltar VERDE. Relate uma por uma, com o que apareceu na tela.
1. Tire `unicoPorCliente: true` de `parceriaDoCliente` → o guarda novo tem de
   ficar vermelho nomeando `ParceriaDoCliente`.
2. Tire de `brandBrain` → vermelho nomeando `BrandBrain`.
3. Tire de `googleDriveConnection` (que já tinha) → vermelho. Isto prova que o
   guarda pega o caso geral, não só os dois que você acabou de consertar.
4. Faça o `catch` do `P2002` devolver 500 cru de novo → o teste da rota vermelho.

Se `npx vitest` for recusado no seu ambiente, **cole a mensagem exata da recusa**
e diga qual mutação você não conseguiu rodar. Eu rodo o portão. **Não invente
resultado de mutação que você não viu.**

## RESTRIÇÕES
- ⛔ Não toque em cadastro de produção. Não gere cobrança.
- ⛔ Não mexa em `lib/agency/comercial/`, em `app/api/piloto/diagnostico/route.ts`
  nem em `__tests__/comercial/` — outro especialista está nesses arquivos AGORA,
  no mesmo bloco. Encostar neles é colisão.
- ⛔ **Não altere `prisma/schema.prisma`.** O schema é a verdade que o teste LÊ;
  mudá-lo para o teste passar é inverter a trava. Nenhuma migration neste bloco.
- ⛔ Não commite. Não rode `git`.
- Leia `node_modules/next/dist/docs/` antes de mexer na rota: este Next tem
  quebras em relação ao que você conhece.
- Mock com `vi.hoisted(() => vi.fn())` **sem assinatura** é o erro que já barrou
  três PRs desta casa no `tsc`. **Anote o retorno**:
  `vi.fn(async (): Promise<{ count: number }> => ({ count: 0 }))`.

## CRITÉRIO DE ACEITE
1. Cite **arquivo e linha do chamador** de cada peça nova.
2. O teste alcança o código que responde ao cliente (`moverVinculos` real e a
   rota real), não um clone.
3. As quatro mutações, uma por uma, com o resultado que você VIU.
4. Diga o que NÃO conseguiu provar.

## O QUE DEVOLVER NO RELATO
Arquivo por arquivo o que mudou · quem chama o quê (arquivo:linha) · o resultado
de cada mutação · o que ficou sem prova · a mensagem exata de qualquer comando
recusado.

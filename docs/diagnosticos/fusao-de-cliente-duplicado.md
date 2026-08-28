# Diagnóstico — fusão de cliente duplicado (o caso FOOCCI)

> **Pedido:** Diretor Geral (`control-room-d4`), 28/08/2026.
> **Executado por:** Diretor da Dioli Digital (sessão `diolidigital-f0`).
> **Escopo:** leitura de código e diagnóstico. **Nada foi executado em produção,
> nenhum cadastro foi lido, alterado ou apagado, nenhuma credencial foi usada.**

O caso: o cadastro do primeiro cliente real da agência nasceu **duas vezes**, com
sete segundos de diferença (double-submit), em 27/08 às 21:22.

| Cadastro | Criado |
|---|---|
| `cmtc145qf007a0xo4txmjss11` | 27/08 21:22:45 |
| `cmtc13zy700760xo40pmav2xc` | 27/08 21:22:38 |

Os dois se chamam FOOCCI. **Um carrega a autorização de parceria e um convite já
emitido; o outro é lixo.** Se o pedido do cliente nascer no cadastro errado, ele é
tratado como pagante e recebe cobrança em vez da isenção acordada.

---

## 1. A fusão existe — e ela NÃO assume que a ficha destino é "a certa"

**Onde mora:**

| Peça | Arquivo |
|---|---|
| Rota | `app/api/clients/[id]/fundir/route.ts` |
| Motor | `lib/agency/persistence/cliente-vinculos.ts` — `moverVinculos()`, `completarCampos()` |
| Inventário (o "o que está pendurado") | `app/api/clients/[id]/vinculos/route.ts` |

`[id]` é quem **morre**; o corpo traz `sobreviventeId`. Tudo roda dentro de **uma
transação** (`fundir/route.ts:60`) — fusão pela metade não existe.

**O que ela faz com a parceria, o convite e o e-mail:**

| Item | Sobrevive? | Prova |
|---|---|---|
| Autorização da parceria | ✅ **move para o sobrevivente** | `cliente-vinculos.ts:74` |
| Convite já emitido | ✅ **move — e o link já entregue continua valendo**, porque o `token` não muda, só o dono | `cliente-vinculos.ts:75` |
| Isenção de parceria | ✅ move | `cliente-vinculos.ts:68` |
| Assinatura mensal | ✅ move | `cliente-vinculos.ts:89` |
| E-mail, setor, telefone, site | ⚠️ **só preenche buraco** | `cliente-vinculos.ts:197` (`completarCampos`) |

**A resposta direta à pergunta:** a fusão **não** assume que o destino é o certo.
`completarCampos` **nunca sobrescreve campo já preenchido** — junta informação, não
substitui. Foi desenhada exatamente para o caso "uma ficha tem o setor, a outra tem
o projeto".

**A contrapartida, e é a única perda invisível:** se os dois cadastros tiverem
**e-mail diferente**, o e-mail do absorvido é **descartado em silêncio** — não
aparece em `movidos` nem em `descartados`. Ninguém fica sabendo.

---

## 2. Quem CHAMA a fusão hoje: **tem tela, e ela está montada.**

**Não é mais um caso de "mecanismo pronto que nada chama".** Este tem chamador de
verdade, com arquivo e linha:

| Elo | Arquivo e linha |
|---|---|
| Botão "Fundir" | `components/agency/clients/AcoesDoCliente.tsx:96` |
| A chamada real | `AcoesDoCliente.tsx:70` → `POST /api/clients/{id}/fundir` |
| **Montado na tela** | `app/agency/clients/page.tsx:180` — coluna final de cada linha da lista |
| Inventário antes de confirmar | `AcoesDoCliente.tsx:49` → `GET /vinculos` |

A confirmação não é um "tem certeza?" — ela lista o que vai junto ("3 projetos, 12
mensagens do portal"). Exige sessão `master` ou `project_manager`
(`fundir/route.ts:27`). **O CEO tem esse perfil: ele resolve isto sozinho, pelo
painel, em `/agency/clients`.**

---

## 3. Recomendação: **FUNDIR**, com o cadastro da parceria como sobrevivente

**Fundir, absorvendo o cadastro vazio no cadastro que carrega a parceria e o
convite.** Não apagar.

**Por que nessa direção, e não na inversa:** o `portalToken` do absorvido **morre
com ele** — a própria rota avisa isso (`fundir/route.ts:80`). Se o link do portal
ou do convite já circulou apontando para o cadastro X, **X tem que ser o
sobrevivente**, senão o cliente recebe um link morto.

### O que se perde em cada caminho

| Caminho | O que custa |
|---|---|
| **Fundir** ✅ | Perde o `portalToken` do cadastro absorvido, e o e-mail dele se divergir do outro. Na prática é reversível: o dado continua no banco, com outro dono. |
| **Apagar o vazio** | Só funciona se ele estiver **mesmo vazio** — a rota devolve **409** com qualquer vínculo (`clients/[id]/route.ts:83-90`). É **irreversível**. Se o cadastro tiver ganho qualquer coisa (um pedido, um acesso ao portal), a rota recusa e o caminho volta a ser fundir. |
| **Renomear o lixo e deixar vivo** | Zero perda técnica, mas **não resolve**: a armadilha continua de pé e o pedido pode nascer no cadastro errado — que é exatamente o risco de cobrar quem tem isenção. |

---

## 🔴 4. O defeito que pode abortar a fusão — e que nenhum teste pega

**`ParceriaDoCliente.clientId` é `@unique` no schema, e a lista de vínculos NÃO o
marca como `unicoPorCliente`.**

- Schema: `prisma/schema.prisma`, `model ParceriaDoCliente` → `clientId String @unique`
- Lista: `cliente-vinculos.ts:74` → `{ chave: "parceriaDoCliente", rotulo: "parcerias do cliente" }` — **sem a flag**
- Só dois itens carregam a flag hoje: `googleDriveConnection` e `clientAiProvider` (`cliente-vinculos.ts:91-92`)

**O mesmo defeito em `BrandBrain`** (`clientId String @unique`), que está na lista de
cascata (`cliente-vinculos.ts:101`) e também é percorrido pelo `moverVinculos`.

**O que acontece na prática:** se **os dois** cadastros tiverem parceria — ou os dois
tiverem cérebro de marca — o `updateMany` viola a restrição, o Prisma joga `P2002`, e
**a transação inteira aborta**. A rota **não tem `try/catch`** em volta do
`$transaction` (`fundir/route.ts:60-70`): vira **500 cru**, e a tela mostra apenas
"não foi possível concluir".

**Nada se perde** — a transação protege o banco. Mas o operador fica travado sem
saber por quê.

**Por que o teste-guarda não pegou:** `__tests__/agency/fundir-cliente.test.ts:138`
confere **presença** na lista, não **unicidade**. Um `@unique` novo entra sem flag e
nada acusa.

> **Isto não bloqueia o caso FOOCCI** se apenas um dos dois cadastros tiver a
> parceria — que é a hipótese de trabalho. Mas precisa ser **conferido antes de
> apertar o botão**, e vira frente de conserto depois.

---

## 5. A pergunta para o CEO — e por que ela provavelmente não existe

**A decisão pode ser tomada sem o CEO, Diretor Geral. Recomendo que seja sua.**

Não há trade-off de negócio aqui. A direção da fusão é **forçada pelo código**: quem
carrega a parceria e o convite tem de ser o sobrevivente, porque é dele o link que já
circula. Não é uma preferência — é a única direção que não quebra nada. Perguntar ao
CEO "qual dos dois cadastros fica?" seria pedir que ele decidisse algo que só tem uma
resposta certa, e ele teria de olhar código para chegar nela.

**A pergunta só sobe ao CEO em um cenário**, e ele é improvável:

> **"Os dois cadastros da FOOCCI têm e-mails de contato diferentes — qual é o e-mail
> certo do cliente?"**

Isso só vale se a leitura autenticada mostrar **e-mail preenchido e divergente nos
dois**. Se um estiver vazio, ou se forem iguais, **não há nada para perguntar a ele**
— a fusão preenche o buraco sozinha e o resultado é o mesmo.

---

## 6. ⛔ O que trava o plano: falta leitura autenticada

**Sim, meu plano depende disso, e nenhuma sala nossa tem login no sistema no ar.**

Para executar com segurança é preciso saber **três coisas que só se leem logado**:

1. **Qual dos dois cadastros tem a parceria e o convite** — define quem sobrevive.
2. **O que está pendurado no outro** — se estiver mesmo vazio, apagar também seria
   possível; se não estiver, fundir é o único caminho.
3. **Se os dois têm "cérebro de marca" ou "parcerias do cliente"** — se tiverem, a
   fusão **aborta** (defeito da seção 4) e o conserto de código vem primeiro.

### O pedido pronto para o agente de navegador do CEO

> Entre em `/agency/clients`, ache as duas linhas **FOOCCI**. Em **cada uma**, clique
> em **"Fundir"** e **apenas leia** a frase "Está pendurado neste cadastro: …".
> **Cancele sem confirmar, nas duas.** Anote a frase de cada cadastro junto com o id
> da linha. **Não aperte Fundir nem Apagar.**

Isso responde as três perguntas de uma vez, sem tocar em nada — a tela busca o
inventário só para exibir (`AcoesDoCliente.tsx:49`), não altera dado nenhum.

---

## 7. O que eu NÃO consegui provar

Ponto fraco declarado é dívida; silencioso é armadilha. Estes são os meus:

- **Não sei o estado real dos dois cadastros.** Não toquei em produção. Não sei qual
  tem a parceria, se o outro está mesmo vazio, nem se algum tem cérebro de marca.
  Tudo na seção 3 assume a descrição que recebi.
- **O `P2002` da seção 4 está deduzido do schema e do código, não executado.** Não
  rodei a fusão contra banco nenhum.
- **Não escrevi teste nem correção** — o pedido foi diagnóstico, e o Diretor Geral
  pediu explicitamente para não abrir PR de código ainda.
- **Não investiguei a causa-raiz do double-submit.** Não vi trava de idempotência em
  `POST /api/clients`, mas não é afirmação medida — é ausência que notei de passagem.
  É o que faz isto acontecer de novo.

---

## 8. As frentes de conserto que ficam abertas (nenhuma iniciada)

1. Marcar `parceriaDoCliente` e `brandBrain` como `unicoPorCliente` na lista.
2. `try/catch` na rota de fusão, devolvendo mensagem legível em vez de 500 cru.
3. Estender `__tests__/agency/fundir-cliente.test.ts` para conferir **unicidade**, e
   não só presença — o teste-guarda tem um buraco do tamanho deste defeito.
4. Trava de idempotência na criação de cliente, para o double-submit não repetir.
5. Registrar em `descartados` o campo divergente que a fusão hoje descarta calado.

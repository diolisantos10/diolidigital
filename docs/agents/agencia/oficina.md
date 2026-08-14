# Oficina — agencia (esteira de agência)

> Append-only. O especialista escreve; **quem promove para a vitrine é o Diretor**.
> Sala aberta em 13/08/2026 — não havia `docs/agents/agencia/` neste repositório.
> A sala vizinha do mesmo assunto é `docs/agents/departamentos/` (social-media +
> design), que é de outro agente e **não foi tocada**.

---

## 2026-08-13 — A arte do CityJobs não conversa com a vaga: onde o sinal se perde

**Despacho:** item 19 da lista do CEO. Palavras dele: *"as vagas não têm muito a
ver com a arte que ele está criando. Então só dá essa direção pra ele."*
Elogio + desalinhamento. Nada foi produzido e nada foi publicado.

### O padrão do erro, com a peça na mão

Comparei as quatro peças físicas do repositório
(`docs/entregas/cityjobs-08-08/`, aprovadas e reprovadas) com o texto que cada
uma carrega e com a tabela das seis de 07/08
(`docs/projetos/cityjobs-registro-07-08.md:139-186`).

**A arte prova O CLIENTE; ela nunca prova A PEÇA.** Em toda peça do CityJobs a
imagem responde *"quem é o anunciante?"* — uma plataforma de vagas do Alto Tietê:
estação, avenida, comércio de rua, skyline. Nenhuma responde *"o que está sendo
oferecido aqui?"* — este cargo, neste setor, nesta cidade.

Nas duas aprovadas de 08/08 **isso está certo**, e é por isso que o CEO gostou:
as duas são institucionais (bastidor da região · vaga validada), e institucional
prova a região mesmo. O erro aparece quando **a mesma direção é aplicada a uma
peça que anuncia uma vaga**: sobra cidade e falta trabalho.

O sintoma extremo já estava medido: quando o tema tocava vaga de verdade, o
modelo, sem nenhuma direção sobre o trabalho anunciado, **preencheu o vazio
inventando** — `VAGA $3,500`, `R$6.000`, `Assistents Administrativo · R$ 2000 per
wes`. Três em seis. A trava certa foi feita (`pilares-bloqueados.ts`) e é de
recusa; ela impede o dano e **não** faz a arte conversar com a vaga.

### De onde vem a decisão da imagem — e onde o sinal se perde

Duas portas, e só uma tem a régua da marca:

| | Porta do TEXTO | Porta da IMAGEM |
|---|---|---|
| quem monta | `especialistas.ts:272` ← `run-execution.ts:347` | `artes.ts:1247` (`montarPrompt`) |
| o que recebe da marca | `contratoDeMarca()` inteiro (proibições, léxico, voz, limites) | nada disso |

Na porta da imagem, o post avulso e o **story** recebiam oito sinais: seis são
constantes do CLIENTE (nome, segmento, cores, tom, estilo do feed, estilo visto)
e só dois variam por peça (legenda e pilar). O carrossel recebia mais dois —
`papelDaTela` e `amplitude` (`artes.ts:1568-1569`) — e o post simples **não**.

Consequência exata, medida: o cérebro criativo do CityJobs já dizia, escrito, com
procedência, `NUNCA: banco de imagem genérico sem relação com a região` e
`NUNCA: estética de escritório de tecnologia — coworking, tablet, mármore, café`
(`repertorio-registrado.ts`) — e **essa frase nunca chegou ao gerador de uma peça
avulsa**. Regra escrita que não atravessa a porta.

A escolha da foto REAL (`escolha-de-foto.ts:277`) também não olha a vaga: ela casa
palavra do NOME DO ARQUIVO com a legenda. Está certo para o que ela é, e não
resolve isto — o CityJobs não tem material no Drive.

**NÃO VERIFICADO:** o gerador dos stories que o CEO elogiou é da **plataforma do
CityJobs**, não deste repositório (o contrato exclui stories —
`cityjobs-orcamento.md:43`). Não há uma linha desse gerador aqui, e não há
nenhum campo de vaga no sistema: `SocialPost` tem `caption`, `pillar`, `format` e
nada de cargo, setor ou cidade (`prisma/schema.prisma:1224`). A direção abaixo
vale para as duas produções, mas só a nossa foi ligada em código.

### A direção, escrita como regra

1. Peça que anuncia **uma vaga** prova a vaga: a cena é **o lugar onde aquele
   trabalho acontece**, na **cidade da vaga**.
2. Peça **institucional, de comunidade ou de bastidor** prova a **região** —
   estação, avenida, comércio de rua. É o que o CEO aprovou e continua valendo.
3. Nunca: cidade/estação/skyline em peça de cargo específico · escritório,
   coworking, notebook ou reunião quando o cargo não é de escritório · clichê de
   contratação (currículo na mão, aperto de mão, confete) · pessoa sorrindo sem
   lugar de trabalho reconhecível em volta.
4. Continua valendo: cargo, salário ou nome de empresa **dentro dos pixels** é
   reprovação (`pilares-bloqueados.ts`).

### Onde ela mora, e por quê

No **contrato de marca do CityJobs** — `cerebroDoCityJobs()` em
`lib/agency/design/repertorio-registrado.ts`, como um eixo de amplitude novo
(*"o que a imagem tem de provar"*), com procedência do CEO.

Escolhido por eliminação verificável: as **proibições do cliente** leem TEXTO
(`trava-de-texto.ts`, `regua-do-texto.ts`) e este defeito não está no texto — não
disparariam nunca. Um **documento de manual** é a doença que o próprio despacho
nomeou. O cérebro da marca é o único dos três que a máquina que desenha a peça lê
por peça, via `lerMarca` → `marca.cerebro` → `direcaoDeAmplitude` → prompt.

### O que mudou em código (regra, não peça)

- `lib/agency/execution/artes.ts` — o caminho do post simples e do **story**
  passa a mandar `amplitude: direcaoDeAmplitude(marca.cerebro)` ao `montarPrompt`.
  Uma linha; é a porta que faltava. Vale para **toda marca com cérebro**, não só
  o CityJobs. Cérebro sem amplitude devolve vazio e o prompt não menciona nada.
- `lib/agency/design/repertorio-registrado.ts` — o eixo novo no cérebro do
  CityJobs. Dado, não `if`.
- `__tests__/design/a-arte-conversa-com-a-vaga.test.ts` — 7 testes. Conferido que
  os 2 da fiação **falham sem a correção** (`git stash` do `artes.ts`, 2 vermelhos
  de 7). Suíte inteira: 213 arquivos, 3479 verdes; `tsc --noEmit` limpo.

### O que fica aberto

- **A regra precisa chegar ao gerador de stories do CityJobs**, que é externo.
  Nada neste repositório alcança aquele código. Enquanto não chegar, a metade que
  o CEO reclamou continua igual — o que consertei foi a nossa porta.
- **O sinal da vaga não existe no nosso modelo.** Para a arte conversar com a
  vaga de verdade, `SocialPost` precisaria carregar cargo/setor/cidade. Não
  inventei o campo: sem produtor para ele, seria mais um portão de decoração.
- `conferenciaDePixelDisponivel()` continua `false` — os pilares de vaga seguem
  bloqueados, e com razão.

---

## 2026-08-14 · A terceira pergunta: quem aprova a peça é o cliente dela

**Pedido:** transformar em código a ordem do CEO — *"quem libera, quem aprova,
são os clientes"* — trocando o interruptor geral por um portão peça por peça.

### O que medi antes de escrever (e mudou o desenho)

A casa **já registrava aprovação**, e registrava bem. Achei o mecanismo inteiro
antes de encostar em qualquer arquivo:

- `ApprovalRequest` (prisma/schema.prisma:1299) — o card que o cliente decide;
- `sourcePostIdsJson` (schema.prisma:1335) — **quais peças aquele card decide**.
  Era exatamente a peça que faltava para "peça por peça" existir sem inventar
  tabela;
- `app/api/social-posts/aprovacao/route.ts` — a equipe transforma N posts do
  calendário em UM card, com `clientId` derivado DOS POSTS;
- `app/api/portal/approvals/route.ts:174` — o cliente decide, e grava
  `reviewedBy = "client:<nome>"` depois de conferir a posse do token do portal.

**Nada disso era consultado antes de publicar.** O registro existia e o
publicador não o lia. Não era falta de mecanismo — era falta de pergunta.

### A descoberta que quase me fez escrever a trava errada

`reviewedBy` tem **três grafias vivas**, e elas não valem o mesmo:

| Grafia | Quem grava | Vale? |
|---|---|---|
| `client:<nome>` | `/api/portal/approvals` (token do portal) | **sim** |
| `cliente` (seco) | `marcos.aprovarPacote:394` | **não** |
| `equipe:<email>` / `internal` | rotas de sessão da agência | **não** |

O `"cliente"` seco parece aprovação do cliente e **não é**: `aprovarPacote` é
alcançável por `app/api/projects/[id]/esteira/route.ts:76`, que é rota de sessão
da **agência**. Alguém da casa clicando "aprovar tudo" pelo cliente grava a mesma
string que o cliente gravaria. Se eu tivesse aceitado essa grafia — e ela é a
mais óbvia de aceitar, porque literalmente diz "cliente" — a trava passaria a
carimbar como consentimento do cliente aquilo que a agência decidiu por ele.
**Autoria ambígua não é autoria.** Há teste travando exatamente esse caso.

### Onde a trava mora, e por que não em `esteira/publicacao.ts`

Pus a conferência dentro de `conferirPublicacao` (o caminho único de
`publishPost`) e levei `postId` até lá via `PublishInput`. A alternativa fácil
era conferir em `esteira/publicacao.ts`, onde o post já está na mão — mas isso
cobriria o despertador e deixaria `/api/meta/publish` descoberta. **É o mesmo
desenho que deixou PUBLICAR de fora da trava de ativos em 06/08**: a trava na
rota, e não onde o dado passa.

Efeito colateral que virou decisão: `/api/meta/publish` recebe legenda e mídia
**arbitrárias**. Aceitar `postId` junto deixaria alguém apontar uma peça aprovada
e publicar outra coisa por baixo dela — a aprovação do cliente viraria senha, não
consentimento. Então a rota **descarta `postId` de propósito** e passa a ser
recusada pela trava, com frase que ensina o caminho certo.

### O que mudou em código

- `lib/agency/esteira/aprovacao-da-peca.ts` (novo) — só LÊ. Nunca aprova nada.
- `lib/integrations/meta/trava-de-publicacao.ts` — de duas para **três**
  perguntas, do mais específico ao mais geral. `PUBLICACAO_ORGANICA` reescrita
  como **freio de emergência**, com a data e a ordem do CEO no cabeçalho.
- `lib/agency/esteira/prontidao-de-publicacao.ts` — portão 11 vira "Aprovação do
  cliente (peça por peça)" e **nomeia quem precisa aprovar**; freio vira 12;
  Meta vira 13. `QuemResolve` ganha `cliente_aprova` e troca `ceo_decide` por
  `freio_da_casa`.
- `lib/integrations/meta/{types,client}.ts`, `lib/agency/esteira/publicacao.ts`,
  `app/api/meta/publish/route.ts` — a fiação do `postId`.

Suíte: **216 arquivos, 3523 verdes**, `tsc --noEmit` limpo. Commit `b8809bd`.

### O que fica aberto (não inventei solução)

- **Ninguém abre o card sozinho.** `/api/social-posts/aprovacao` é rota de sessão
  master/PM: as peças do CityJobs só chegam ao cliente se alguém da equipe
  abrir o card. Não existe gatilho automático, e eu não criei um — criar seria
  decidir que a agência escolhe quando pedir aprovação, o que é desenho de
  produto, não de trava.
- **Peça já publicada antes desta mudança** não tem aprovação registrada e
  também não precisa: a trava só olha para a frente.
- **O freio segue puxado** por App Review e verificação do negócio — razões da
  plataforma, que nenhum cliente pode aprovar.

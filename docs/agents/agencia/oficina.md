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

## 2026-08-14 — As 6 peças do CityJobs não saem porque o ARQUIVO é velho, não o código

**Despacho:** `/api/meta/prontidao` rodou contra produção em 2026-08-14T21:43Z —
6 posts do CityJobs agendados, os 6 com `pronto:false`, todos parando no portão
8 (**Formato do arquivo**). Reconverter e religar, sem publicar nada.

### O que eu medi, e onde

Não confiei no resumo do despacho; li a corrente inteira.

**Como um post agendado referencia a mídia** (`prontidao-de-publicacao.ts:362-365`
e `esteira/publicacao.ts`): peça única guarda `SocialPost.mediaUrl`; carrossel
guarda as N telas em `SocialPost.mediaUrlsJson`. Nos dois casos a string é
`/api/media/<id>`, e o `<id>` é a chave de `MediaAsset`.

**O que o portão de formato lê** (`prontidao-de-publicacao.ts:372-386`): ele
recorta esses ids, busca `MediaAsset.mimeType` no banco e entrega a
`conferirFormatoDeMidia` (`integrations/meta/formato-de-midia.ts:83`), que é a
MESMA função que o publicador chama em `publicacao.ts:679`. Ele lê o `mimeType`
gravado — nunca os bytes. Peça sem mídia guardada nesta casa **passa** no portão
8 (`:369`), o que está certo: não medimos o que não é nosso.

**A causa está consertada há uma semana.** `design/renderizar.ts` rasteriza com
`SAIDA_DA_PECA = { type: "jpeg", quality: 92 }` e exporta
`MIME_DA_PECA_RENDERIZADA`; `comporComMolde` devolve esse MIME e quem grava
obedece (`artes.ts:891`, `:452`). O defeito não é do código de hoje — é
**estoque**: peças rasterizadas em 08/08 pelo motor velho, ainda penduradas nos
posts. Nenhum deploy as desbloqueia, porque o arquivo antigo continua sendo o
arquivo do post.

**E nenhum dos dois consertos que já existiam as alcançava.** `sem-molde`
procura uma marca em `lastError` que elas não têm (nasceram certas para o motor
da época); `marca-nova` compara a data da arte com a do material de marca, e
nelas essa comparação está certa. Elas são invisíveis para os dois — a única
testemunha é o `mimeType` do arquivo.

### O caminho escolhido: REGERAR, não converter o binário

Regerar é viável e não passa perto de publicar. `recomporPecas`
(`artes.ts:1022`) lê a foto **já paga** de `fundo-<postId>.png`, roda o
rasterizador de hoje (que sai JPEG), grava arquivo novo e troca só o `mediaUrl`.
Custa ≈1s de rasterização e zero de fatura. Converter o binário por fora foi
descartado: entregaria um JPEG recomprimido a partir de um PNG que já perdeu a
camada de marca daquela época, sem passar pela trava de letra — e a régua de
texto (`trava-de-texto.ts`) é justamente o que separa peça de arquivo.

### O que mudou em código

- `lib/agency/execution/reconversao-de-formato.ts` — **novo, somente leitura.**
  A seleção e o retrato. Chama `conferirFormatoDeMidia`, não copia a régua.
  Lista à parte os carrosséis recusados, que são de outra mão
  (`recomporCarrosseis`), para o relatório não parecer completo calando.
- `lib/agency/execution/artes.ts` — modo `formato-recusado` em `recomporPecas`,
  usando aquela seleção. E um **portão de saída** antes de gravar
  (`conferirFormatoDeMidia` sobre a peça recomposta): hoje é impossível falhar,
  e é por isso que ele custa nada e transforma "sai JPEG porque eu li o código"
  em "sai JPEG porque foi medido antes de gravar".
- `app/api/admin/recompor-pecas/route.ts` — `?modo=formato-recusado`. Lista de
  modos continua FECHADA.
- `scripts/reconverter-pecas-para-jpeg.mts` — o comando de operação.
  **Padrão é MEDIR**; só escreve com `--aplicar`; `--carrosseis` chama a outra
  função. Mede antes E depois — conserto que não remede é portão de decoração,
  que é a pendência P0 desta sala.
- `package.json` — `npm run reconverter:jpeg` e `npm run prontidao`.
- `__tests__/execution/reconverter-para-jpeg.test.ts` — 17 testes.

### O que a prova cobre (e como sei que ela vale)

A camada que importa anda a corrente inteira com o **Chromium de verdade**: a
peça em PNG entra, o rasterizador roda, o arquivo é gravado, o post passa a
apontar para ele, e a MESMA trava que recusou o PNG é chamada sobre o resultado.
Confere os **bytes** (assinatura JPEG), não só a etiqueta.

**Mutação conferida:** troquei `SAIDA_DA_PECA` para `png` em `renderizar.ts` e
rodei — **2 vermelhos**, e o portão de saída novo recusou gravar. Restaurado.
Suíte inteira: 217 arquivos, 3523 verdes, 1 pulado; `tsc --noEmit` limpo.

### Nada publica, e isso é mecanismo

A data marcada não é tocada (um teste exige que a escrita no post tenha
EXATAMENTE `mediaUrl` e `lastError`). `PUBLICACAO_ORGANICA` não é lida nem
mencionada em código — um teste reprova `process.env.PUBLICACAO_ORGANICA`,
`publicacaoOrganicaLiberada` e o módulo da trava dentro do script. Reagendar ≠
publicar, e aqui nem reagendar acontece: o que muda é o arquivo.

### O que fica aberto

- **Não rodei contra produção.** Este ambiente não tem o `DATABASE_URL` de
  produção (o `.env` local aponta para um sqlite). O comando existe e foi rodado
  em modo medição contra o banco local; quem tiver a credencial roda com
  `--aplicar`. Não afirmo o estado dos 6 posts depois — afirmo que a máquina
  que os conserta está provada, e que ela remede sozinha e imprime o depois.
- **O formato é 1 portão de 12.** Passar nele não faz o post sair: o portão 11
  (`PUBLICACAO_ORGANICA`) segue desligado por decisão declarada do CEO, e o 12
  (o que a Meta concedeu) fica `nao_medido` sem `--meta`. Isso está certo.
- Peça cuja foto de fundo sumiu do armazenamento cai em `semFundo` e **não** é
  regerada: regerar exigiria comprar imagem nova e entregaria outra foto num
  calendário já aprovado. Continua sendo decisão que custa, e não é do script.

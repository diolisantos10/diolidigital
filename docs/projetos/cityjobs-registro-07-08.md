# CityJobs — registro de oficina, 07/08/2026

> Departamento responsável: **departamentos** (social-media + design).
> Pedido: os 2 primeiros posts prontos para o CEO em 07/08, calendário armado
> para 2 por dia. Escopo em `docs/projetos/cityjobs-orcamento.md`.

## O que foi criado, em produção

| Coisa | Id |
|---|---|
| Briefing (`ClientRequestDb`) | `cmsi6yqza00000pn2msye27gl` |
| Cliente **CityJobs** | `cmsi72jjk00070pn2mn1sh9gj` |
| Projeto "CityJobs — feed diário (2 posts/dia)" | `cmsi72jkz00090pn2u1d59yac` |
| Token do portal | `cmsi72jjk00080pn225v06iu5` |
| Peças no Planner (6, `draft` + `interno`) | 07/08 09h e 18h · 08/08 09h e 18h · 09/08 09h e 18h |

Tudo pela esteira normal: briefing → auto-escopo → aprovação de escopo →
projeto → direção → `runProjectExecution`. Nenhum caminho paralelo foi aberto —
dois defeitos da esteira foram consertados no caminho (abaixo).

**Nada pode publicar sozinho.** As seis peças estão em `status: "draft"`;
`publicarAgendados` (`lib/agency/esteira/publicacao.ts:331`) só olha
`status: "scheduled"`. Além disso, a conexão Instagram de @cityjobs.sp está
`expired` e não tem cliente vinculado.

---

## ⛔ O achado grave: a arte saiu com SALÁRIO INVENTADO nos pixels

A primeira arte do post de 07/08 veio com **"VAGA $3,500"** desenhado dentro da
imagem. Número fabricado, em dólar, numa peça de plataforma de vagas — a pior
falha possível para este cliente. A peça foi descartada e regerada.

Isso não foi descuido do prompt: `montarPrompt`
(`lib/agency/execution/artes.ts:664`) proíbe letra, número, placa e etiqueta com
todas as letras. **O modelo ignorou.** É a regra da casa demonstrada ao vivo:
*prompt é sugestão, não trava.*

A trava real seria o molde — que estava desligado. Ver a seguir.

### Não foi azar: aconteceu 3 vezes em 6 peças

| Peça | O que a IA desenhou nos pixels | Veredito |
|---|---|---|
| "salário aberto" (1ª arte) | prancheta com **"VAGA $3,500"** | reprovada |
| "salário aberto" (2ª arte, regerada) | tela com **"R$6.000"** | reprovada |
| "candidatura rápida" | anúncio falso: **"Assistents Administrativo · R$ 2000 per wes"**, sob uma marca inventada "AlcTiete" | reprovada |
| "seis cidades" | placa de estrada com os 6 nomes, corretos | aprovada |
| "dica", "comunidade", "perto de casa" | cena limpa, sem texto | aprovadas |

O padrão é claro e reprodutível: **toda legenda cujo tema toca salário, vaga ou
a tela da plataforma faz o modelo desenhar um anúncio de emprego falso** — com
valor, cargo e marca inventados. As três reprovadas foram descartadas; o pilar
"vagas por setor" e o pilar "salário aberto" ficam **BLOQUEADOS** até existir
conferência de pixel.

Numa plataforma de vagas, o dano tem nome: pessoa desempregada indo atrás de uma
vaga que não existe, com um salário que ninguém ofereceu.

### E o buraco continua aberto depois do conserto do molde

O molde compõe o texto auditado **por cima** da foto; ele não **apaga** o que o
modelo desenhou dentro dela. O `$3,500` estava no terço do meio, fora da faixa
do scrim: sobreviveria mesmo com o molde ligado.

O cabeçalho de `lib/agency/design/mockup.ts:19` já nomeia o problema — *"o piso
confere TEXTO, e ninguém conferia PIXEL"* — e resolveu só o caso do mockup
montado por nós. **A foto gerada pela IA continua sem nenhuma conferência de
pixel.** Para uma plataforma de vagas, é o furo de maior severidade que existe.

---

## ⛔ O molde de marca NÃO RODA em produção

`playwright` está em **`devDependencies`** (`package.json`). O build de produção
não a instala, então `import("playwright")` falha e `montarPeca` nunca roda.
Consequência, em toda peça de todo cliente:

- sem título, sem cor da marca, sem selo, sem assinatura de rodapé;
- **1024×1024 em vez de 1080×1350** — fora do formato contratado;
- a peça entregue é a foto crua da IA.

Ou seja: o motor inteiro de 05–06/08 (`molde.ts`, `peca.ts`, `mockup.ts`,
`trava-de-texto.ts`, `renderizar.ts`) — e a **implantação de R$ 1.290** que o
contrato do CityJobs cobra para travar a marca em código — está desligado.

A única testemunha era o `lastError` **dentro de cada post**, um campo que, nas
palavras do próprio `publicacao.ts:341`, *"para ver é preciso já suspeitar e ir
procurar"*. E `renderizadorDisponivel()` (`renderizar.ts:170`) existia
exatamente para avisar isso — **sem um único chamador**.

**Conserto feito:** `/api/capacidades` passa a reportar a capacidade
`montar-molde`. O painel deixa de mentir verde.
**Conserto que falta (plataforma, não é meu departamento):** mover `playwright`
para `dependencies` e garantir o binário do Chromium no runtime.

---

## Os defeitos da esteira, consertados (commit `002c948`)

1. **A aprovação de escopo tinha uma cópia incompleta da criação de projeto.**
   `app/api/brain/auto-scope/[id]/review/route.ts` refazia à mão o que
   `createProjectFromRequest` já fazia, e faltavam nela `semearMarcaDoBriefing`
   (sem ela o `BrandBrain` nasce vazio e o cliente recebe a peça **cinza
   neutra**) e `coletarMaterialDeProduto` (sem ela o pedido de captura de tela
   nunca abre). O próprio arquivo avisava, três linhas abaixo da cópia, que
   "dois caminhos com comportamentos diferentes é exatamente como nasce sistema
   imprevisível". Agora é uma porta só.

2. **`sincronizarDoBriefing` não tinha um único chamador.** O cliente escrevia
   "nada de emprego garantido" no briefing, o extrator determinístico sabia ler
   aquilo, e a proibição não existia na hora da peça. Passa a rodar na criação
   do projeto e também em `runProjectExecution` (auto-conserto dos clientes que
   já existiam). Conferido: o texto do CityJobs produz os bloqueios
   `emprego garantido`, `consiga uma vaga`, `garanta seu emprego`.

3. **`monogramaDe("CityJobs")` devolvia `"CI"`** — duas letras da mesma palavra,
   o J de Jobs sumido, numa assinatura que aparece em 60 peças por mês e que
   ninguém revisa. Caixa camelo passa a contar como emenda de palavras.

---

## ⚠️ A saída do motor de social foi REPROVADA por mim

O especialista de social produziu 8 peças e a Qualidade carimbou `quality_ok`.
Fora do contrato e fora dos guardrails:

- **2 carrosséis e 3 stories** — o contrato diz *só post simples*, sem carrossel
  e sem stories (os stories já saem do sistema do próprio CityJobs);
- **8 peças**, não 2 por dia;
- *"Tem centenas de vagas esperando"* — número inventado, e o contrato exige que
  vaga citada exista;
- *"aumenta suas chances drasticamente"*, *"seu próximo trabalho está a um
  clique"*, *"receba oportunidades diárias"* — promessa de resultado, proibida
  pelo briefing e pela lei;
- *"as melhores empresas da região"* — superlativo sem lastro;
- paleta inventada: *"laranja/azul"*, *"cinza claro"*, *"azul e branco"*. A
  paleta do CityJobs é fechada.

Nada disso chegou ao cliente — a escada segurou. Mas **a Qualidade aprovou**, e
é isso que precisa virar trava: o contrato de saída do especialista não confere
formato nem volume contra o que o cliente comprou.

O motor também produziu **"Roteiros de Vídeo"**, item explicitamente fora do
escopo contratado.

O PM inventou, no `goal` do projeto, *"de 40 para 500+ seguidores em 90 dias"*.
Corrigido à mão. Meta numérica não se promete.

---

## A escada segurou, e está certo que tenha segurado

`social-media` está em **allowlist com 2 clientes**, e o CityJobs não é um
deles. Evidência dos últimos 30 dias: **0 aprovadas de 5** — então
`liberarCliente` recusa, como deve.

Portanto **nada do CityJobs chega ao portal do cliente**. As 6 peças estão
`visibility: "interno"` — o CEO as vê no Hub/Planner da agência, que é
exatamente o que "sombra" significa: produz, registra, não entrega.

Com 2 peças por dia aprovadas, a evidência de 5 fecha em ~3 dias e o CityJobs
entra na allowlist **pela régua**, sem ninguém empurrar.

### ⛔ Mas a escada tem um furo, e ele vazou hoje

`escadaFiltraEntregas` guarda o `Deliverable`. **O `SocialPost` não passa por
ela.** `lib/agency/esteira/publicacao.ts` agenda a peça no calendário já com
`visibility: "compartilhado"`, e o portal do cliente lê **esse** campo.

Resultado real, medido hoje: as 10 peças que eu tinha reprovado — carrosséis,
stories e reels, todos fora do contrato — apareceram no calendário do CityJobs
**marcadas como compartilhado**, incluindo *"De procurando emprego a CONTRATADO
✅"*, *"Empresa em ALTA DEMANDA contratando"* e *"🔥 VAGAS QUENTES HOJE"*.
Promessa de resultado e vaga sem lastro, prontas para o portal de um cliente,
num departamento que está em allowlist e não tem este cliente na lista.

As 10 foram apagadas. **A porta continua aberta:** é a quarta porta de
visibilidade da casa, e a única que ninguém fechou. `producao-de-pedido.ts:346`
já alertava que "uma escada com duas portas fechadas e uma aberta não é escada:
é o caminho que o tráfego aprende a usar" — e havia uma terceira.

---

## Lacunas — o que faltou do cliente e virou pergunta

1. **A leitura do cliente NÃO foi possível.** O token da conexão Instagram de
   @cityjobs.sp está `expired`, e a conta **não aparece** entre os ativos do
   token vivo da casa. Logo, a instrução do contrato — *"na mesma linha visual
   dos 6 posts que já estão no perfil"* — **não foi cumprida e não foi
   simulada**. O que está ancorado é só a paleta e a tipografia dos logos
   oficiais. **O CEO precisa reconectar @cityjobs.sp.**
2. **Sem captura de tela do site/app.** Sem material de produto, a peça não
   mostra o produto — o defeito medido em `foocci/comparativo-06-08.md`.
3. **Link da bio e grupo de WhatsApp** não confirmados (marcado na peça de 07/08).
4. **As seis cidades** — o briefing lista seis; Guararema, Biritiba-Mirim,
   Salesópolis e Santa Isabel também são Alto Tietê (marcado na peça de 07/08).
5. **Passos da candidatura** — "candidatura rápida" não tem número (marcado na
   peça de 09/08).
6. **Tom de voz** não declarado e não observável.
7. **Horários de publicação** (09h e 18h) foram escolha minha, não do cliente.
8. **Representação** — o briefing não diz nada sobre quem aparece nas fotos, e a
   IA vem devolvendo homem branco de terno para um público do Alto Tietê.
9. **O pilar "vagas por setor" está BLOQUEADO**: exige vaga real, e não há feed
   de `/vagas` ligado. Peça que anuncia vaga sem lastro é o dano que o piso
   existe para impedir.

---

## Proposta de vitrine (quem promove é o Diretor)

**Mecanismo construído e sem chamador é a doença desta casa — e ela reincide.**

Em uma tarde, montando UM cliente, apareceram quatro instâncias do mesmo padrão:
`sincronizarDoBriefing` sem chamador; `renderizadorDisponivel` sem chamador; o
molde inteiro sem runtime; e `semearMarcaDoBriefing` chamado por uma porta e não
pela outra. É a mesma família das 28 checagens `autoCheckable: false`.

O que muda o jogo não é revisar melhor — é a regra: **função exportada sem
chamador em produção é defeito de merge, não dívida**, e capacidade que a
operação depende aparece em `/api/capacidades` no mesmo commit em que nasce.

— origem: montagem do CityJobs em 07/08/2026, commit `002c948`

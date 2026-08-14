# CityJobs — a ficha de marca, campo por campo

> Levantamento do especialista `esteira`, 14/08/2026.
> Pedido: descobrir **quais são os nove campos**, **o que cada um exige**, o que
> dá para preencher com material que **já existe no sistema** (com fonte), e o
> que **só o cliente ou o CEO** pode responder.
>
> ⚠️ **Nada aqui foi gravado no cérebro de marca do CityJobs.** Este documento é
> o levantamento; a gravação é ato de quem tem a resposta. Inventar voz,
> proibição ou referência do cliente é pior que o campo vazio — sai numa peça em
> nome dele.

---

## 0. Antes dos nove campos: o portão não conta campos

O portão que segura o post está em `lib/agency/esteira/publicacao.ts` e pergunta
uma coisa só: **esta marca declarou régua suficiente?** (`marca.naoConstituida`).

E "suficiente" **não é** "os nove campos preenchidos". O gatilho de saída, em
`lib/agency/esteira/ficha-de-marca.ts`, é:

| Exigência | Quanto |
|---|---|
| Campos **1, 2, 3, 4 e 9** definidos | os cinco |
| Proibições vigentes | **≥ 3** |
| Referências | **≥ 1 aprovada E ≥ 1 reprovada** |

Três consequências que mudam o trabalho:

1. **Dois dos nove campos não movem o portão** — `atributos_formais` e
   `limites_de_promessa`. Podem ficar vazios com a marca constituída.
2. **`proibicoes` não se preenche pela ficha.** Ela tem dono próprio
   (`lib/agency/esteira/proibicoes.ts`, guardada em `BrainArtifact`) e entra pelo
   que o **cliente escreve** no briefing, no pedido ou no ajuste de uma peça.
   O botão "Preencher" da tela **não grava** este campo.
3. **`referencias` conta como "definido" com uma referência só** — e o portão
   exige também uma **reprovada**. Dava para a tela mostrar "definido" e o post
   continuar recusado.

> **Consertado em 14/08:** a ficha e o portão passaram a dizer a mesma coisa. O
> campo novo `oQueFaltaParaConstituir` nomeia o que falta, item por item, saindo
> do **mesmo cálculo** que faz a recusa — e a recusa da publicação passou a
> carregar essa lista em vez de mandar "preencha a ficha de marca".

---

## 1. Os nove campos, e o que cada um exige

Fonte da lista: `lib/agency/esteira/ficha-de-marca.ts` (`CAMPOS_DA_MARCA`).
Coluna do banco: `prisma/schema.prisma`, modelo `BrandBrain`.

| # | Campo | Onde mora | Exige | Conta para o portão |
|---|---|---|---|---|
| 1 | `proposito_e_promessa` | `purposeAndPromise` (ou `tagline`) | o que a marca serve e o que quem interage pode esperar | **sim** |
| 2 | `publico_e_relacao` | `audienceRelation` (ou `targetAudience`) | a quem fala e **em que posição** — par, autoridade, prestador | **sim** |
| 3 | `voz` | `voicePairsJson` | pares **"dizemos assim / não dizemos assim"**, com exemplos LITERAIS. Adjetivo ("tom natural") **não conta** | **sim** |
| 4 | `lexico` | `lexiconJson` | grafia canônica do nome, termos obrigatórios e proibidos. É o único campo checável por máquina | **sim** |
| 5 | `proibicoes` | `BrainArtifact` (não é coluna) | ≥ 3 proibições declaradas pelo cliente, com a frase dele | **sim (≥3)** |
| 6 | `referencias` | `referencesJson` | artefatos **aprovados E reprovados**, com motivo | **sim (1+1)** |
| 7 | `atributos_formais` | `formalTokensJson` (ou `primaryColor`) | tokens invariáveis como **valores**, nunca adjetivos | não |
| 8 | `limites_de_promessa` | `promiseLimits` | o que não se afirma **ainda que seja verdade** | não |
| 9 | `hierarquia_e_dono` | `ownerAndHierarchyJson` | qual regra vence, quem é o humano dono, o canal e o prazo | **sim** |

---

## 2. O que dá para preencher com o que JÁ EXISTE — e a fonte de cada linha

Só entra aqui o que está **escrito no repositório** e é do cliente ou do
briefing aprovado. Nada foi inferido.

### Campo 1 — Propósito e promessa · **material existe**
- *"Plataforma de vagas do Alto Tietê (Mogi, Suzano, Itaquá, Poá, Ferraz,
  Arujá). Vaga real e validada, salário aberto, candidatura rápida."*
- **Fonte:** `docs/projetos/cityjobs-orcamento.md` (briefing aprovado pelo CEO em
  05/08/2026), seção "O que o CityJobs é".
- **Ressalva honesta:** isso descreve o **produto**. A promessa do ponto de vista
  de quem procura emprego não está escrita em lugar nenhum. Dá para registrar a
  citação literal com procedência; a frase de promessa é pergunta ao dono.

### Campo 2 — Público e relação · **metade existe**
- Público: *"quem está procurando trabalho e é da região"*; objetivo declarado é
  *"comunidade e alcance"*, conta em **aquecimento** (6 posts, 40 seguidores).
- **Fonte:** `docs/projetos/cityjobs-orcamento.md`; `lib/agency/design/repertorio-registrado.ts`
  (`cerebroDoCityJobs`, razão do repertório "bastidor-da-regiao").
- **Falta a POSIÇÃO** — par, autoridade ou prestador. O registro de 07/08 diz com
  todas as letras: *"tom de voz não declarado e não observável"*
  (`docs/projetos/cityjobs-registro-07-08.md`, lacuna 6).

### Campo 3 — Voz · **só o lado negativo existe**
- **"Não dizemos assim"**, com procedência real — frases produzidas e
  **reprovadas** em 07/08: *"aumenta suas chances drasticamente"*, *"seu próximo
  trabalho está a um clique"*, *"as melhores empresas da região"*, *"Tem centenas
  de vagas esperando"*, *"De procurando emprego a CONTRATADO"*.
- **Fonte:** `docs/projetos/cityjobs-registro-07-08.md`, seção "A saída do motor
  de social foi REPROVADA por mim".
- **Falta o lado positivo.** Não há no repositório uma legenda do CityJobs
  **aprovada pelo cliente** para servir de "dizemos assim". Sem ela, o par fica
  pela metade — e o campo, em lacuna.

### Campo 4 — Léxico · **material existe, com uma dúvida de grafia**
- Termos **proibidos**, do briefing: *"emprego garantido"*, linguagem
  sensacionalista, promessa de resultado.
- Termo **obrigatório** na peça: selo verde **ALTO TIETÊ**.
- **Fonte:** `docs/projetos/cityjobs-orcamento.md`, seções "Travas que valem para
  este contrato" e "Preço / a implantação é o molde de marca".
- **Dúvida medida hoje:** os 6 logos oficiais escrevem **`CITY JOBS`** — duas
  palavras, caixa alta (`public/brand/cityjobs/*.svg`, conferido no arquivo). A
  casa escreve **`CityJobs`**, e foi essa grafia camelo que quebrou o monograma
  em 07/08 (`"CI"` em vez de `"CJ"`). Qual é a canônica **em texto** é pergunta
  ao dono, não escolha nossa.

### Campo 5 — Proibições · **material existe; a porta é outra**
- Do briefing, e **já conferido como extraível** em 07/08: `emprego garantido`,
  `consiga uma vaga`, `garanta seu emprego`.
  **Fonte:** `docs/projetos/cityjobs-registro-07-08.md`, defeito 2 ("Conferido: o
  texto do CityJobs produz os bloqueios…").
- Do manual da marca, três regras que já valem como proibição:
  1. nunca o logo junto da palavra "CityJobs" na mesma peça;
  2. fundo escuro pede a versão invertida;
  3. não distorcer, não recolorir.
  **Fonte:** `public/brand/cityjobs/LEIA-ME.md`.
- ⚠️ **Não medido daqui:** se esses três bloqueios estão **de fato registrados**
  em produção. `sincronizarDoBriefing` passou a rodar na criação do projeto e no
  `runProjectExecution`, mas o CityJobs foi criado **antes**. Ausência de
  informação não é informação: isto se **mede**, não se supõe —
  `GET /api/agency/clients/cmsi72jjk00070pn2mn1sh9gj/marca`, campo `proibicoes`.

### Campo 6 — Referências · **é o campo mais bem servido, dos dois lados**
- **Reprovadas, com motivo:**
  - as 3 artes com **salário inventado** nos pixels (`VAGA $3,500`, `R$6.000`,
    `Assistents Administrativo · R$ 2000 per wes`) — motivo: número fabricado
    numa plataforma de vagas;
  - as 10 peças fora do contrato postas no calendário (carrossel, story, reel);
  - a peça feita com a régua visual da **Dioli** (serifa de display, creme,
    mockup de tablet sobre mármore) — reprovada pelo CEO em 08/08 com
    *"essa arte é da Dioli Digital, você está misturando os projetos"*.
  - **Fonte:** `docs/projetos/cityjobs-registro-07-08.md` e
    `lib/agency/design/repertorio-registrado.ts` (cabeçalho de `cerebroDoCityJobs`).
- **Aprovadas:** a peça "seis cidades" (placa de estrada), "dica", "comunidade",
  "perto de casa" (07/08), e as **duas institucionais de 08/08**, refeitas com
  fotografia real. **Fonte:** as mesmas duas acima.
- ⚠️ **Buraco de mecanismo:** hoje a tela grava referência **só como aprovada**
  (`envelopar` em `app/api/agency/clients/[id]/marca/route.ts` monta
  `{aprovadas:[texto], reprovadas:[]}`). A rota **aceita** o objeto completo; é a
  tela que só sabe mandar texto. Enquanto isso não mudar, este campo **nunca**
  fecha o portão pela tela.

### Campo 7 — Atributos formais · **existe, e é o de melhor lastro**
- Paleta declarada, fechada: `#0D2B4D` · `#FFFFFF` · `#16A34A` · `#FFD24D`.
  **Fonte:** `public/brand/cityjobs/LEIA-ME.md` e o briefing.
- Tipografia, **medida no arquivo hoje**: `Arial Black, Arial, Helvetica,
  sans-serif` nos 6 SVGs.
- Logos: 6 arquivos oficiais em `public/brand/cityjobs/`, com a regra de uso de
  cada um.
- **Achado da medição:** os 6 logos usam **apenas** `#0D2B4D` e `#FFFFFF`. O
  verde e o amarelo da paleta **não aparecem em nenhum arquivo de logo** — eles
  vêm do texto do briefing (selo verde ALTO TIETÊ), não do material. Registrar a
  paleta como "quatro cores do logo" seria falso.

### Campo 8 — Limites de promessa · **existe**
- *"Nada de 'emprego garantido' nem linguagem sensacionalista: o briefing proíbe,
  e a lei também. Promessa de resultado em anúncio de vaga é risco jurídico."*
- *"Vaga citada em peça precisa existir."*
- *"Meta numérica não se promete"* (o `goal` com "de 40 para 500+ seguidores" foi
  corrigido à mão em 07/08).
- **Fonte:** `docs/projetos/cityjobs-orcamento.md` §"Travas"; registro de 07/08.

### Campo 9 — Hierarquia e dono · **NÃO EXISTE**
- Não há em nenhum documento quem aprova o material do CityJobs, por qual canal e
  em quanto tempo. Na prática quem aprovou até hoje foi o CEO — mas **prática não
  é declaração**, e é este campo que dá endereço à escalada.

---

## 3. O que só o cliente ou o CEO responde — perguntas fechadas

CityJobs é **cliente da própria casa**: quem responde é o CEO. São quatro
perguntas, e três delas destravam o portão.

| # | Campo | Pergunta | Destrava o portão? |
|---|---|---|---|
| 1 | `publico_e_relacao` | Vocês falam com quem procura emprego **como um vizinho**, **como especialista** ou **como prestador de serviço**? (escolha uma) | **sim** |
| 2 | `voz` | Escreva **uma frase** do jeito que o CityJobs falaria. (o "não falaria" já temos, das peças reprovadas) | **sim** |
| 3 | `hierarquia_e_dono` | **Quem** aprova a peça do CityJobs, **por onde** a gente fala com essa pessoa, e **em quantas horas** ela responde? | **sim** |
| 4 | `lexico` | Em texto, escreve-se **"CityJobs"** ou **"City Jobs"**? (o logo diz `CITY JOBS`; a casa escreve `CityJobs`) | melhora |

**Bônus barato, e ele já apareceu duas vezes como lacuna:** o "Alto Tietê" do
CityJobs são as **6 cidades do briefing** (Mogi, Suzano, Itaquá, Poá, Ferraz,
Arujá) ou as **10 da região** (mais Guararema, Biritiba-Mirim, Salesópolis, Santa
Isabel)? Peça que erra a lista de cidades erra na frente de quem mora lá.

---

## 4. Onde se clica

**Painel → Clientes → CityJobs → bloco "Marca"** (`/agency/clients/<id>`,
componente `components/agency/clients/FichaDeMarca.tsx`). Cada campo tem
"Preencher"; o bloco mostra `definidos/9` e, desde 14/08, **o que exatamente
falta para o portão liberar**.

Duas ressalvas que precisam ser ditas antes de alguém clicar:

- **"Preencher" em `proibicoes` não grava nada.** A rota recusa (o campo tem dono
  próprio) e a tela não mostra a recusa. Proibição entra pelo texto do cliente —
  briefing, pedido no portal, ou o comentário de um ajuste.
- **"Preencher" em `referencias` grava só o lado aprovado.** Enquanto a tela
  mandar texto puro, o lado reprovado — que é o que o portão exige — fica vazio.

Estes dois são defeito de tela, não de régua: estão anotados aqui para o
`interface` / `experiencia`, com o arquivo e a linha.

---

## 5. Medir antes de agir — o que este documento NÃO sabe

Este levantamento foi feito **do repositório**. Ele não leu o banco de produção.
Portanto, três números precisam ser medidos antes de qualquer conclusão sobre
"quantos campos faltam ao CityJobs":

1. quantas proibições estão registradas hoje (`proibicoes`);
2. o que `semearMarcaDoBriefing` já gravou (ele preenche `tagline`,
   `targetAudience`, `primaryColor` e outros — e esses **contam** como campo 1, 2
   e 7 por herança);
3. o estado real da ficha.

Os três saem de uma chamada só, com sessão da agência:
`GET /api/agency/clients/cmsi72jjk00070pn2mn1sh9gj/marca`
(o id do cliente está em `docs/projetos/cityjobs-registro-07-08.md`).

> A afirmação que circula — *"todos os clientes em `marca_nao_constituida`, 0 de
> 9"* — é plausível e **não foi conferida por mim**. Ela é incompatível, por
> exemplo, com `semearMarcaDoBriefing` ter rodado: se ele gravou a `tagline`, o
> campo 1 já conta como definido. Medir custa uma chamada.

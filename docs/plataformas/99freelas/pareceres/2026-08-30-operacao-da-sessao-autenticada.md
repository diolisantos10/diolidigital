# Parecer — operação por sessão autenticada do titular (30/08/2026, RODADA 2)

**Data:** 30/08/2026 · **Solicitante:** PM da Dioli Digital, a mando do Diretor,
a mando do CEO (titular da conta pessoal no 99Freelas).
**Pergunta:** os Termos do 99Freelas permitem que a agência opere a conta do
CEO por automação — em especial via **Claude in Chrome, sessão autenticada do
próprio titular, modo SUPERVISIONADO** (humano confirma antes de cada envio)?

**Este arquivo substitui inteiramente a versão da rodada 1** (que recusou por
falta de rede — recusa correta e registrada em `tentativas_de_recaptura` de
`policy.json`). Nesta rodada, as 15 capturas de hoje já estavam em disco,
feitas pelo PM (exceção `SEM_AGENTE`). O trabalho aqui foi ler, comparar por
`diff`, buscar com `grep` e escrever com citação — nenhum acesso de rede foi
tentado.

---

> ## 🟠 PODE COM AJUSTE — RECONFIRMADO HOJE, VEREDITO NÃO MUDA
>
> **Em uma frase:** os Termos do 99Freelas, relidos e comparados hoje,
> **continuam sem proibir e sem autorizar** automação — é silêncio, não
> permissão — e pela regra do próprio CEO (§60/§61 da especificação `01`)
> silêncio não é autorização, então o veredito operacional permanece
> **HUMAN_GATE no clique de envio** (`auto_submission_allowed: false`,
> `browser_automation_allowed: false`).

---

## 🔴 O bloco do 403/Cloudflare — leia isto antes do resto

**O que foi feito.** As 3 páginas do site (`/termos`, `/privacidade`,
`/como-funciona`) foram lidas direto, HTTP 200, sem desafio algum
(`fontes/medicao-tecnica-2026-08-30.md` §3). Os 12 artigos da Central de Ajuda
(Zendesk) **não** abriram em HTML — as 12 URLs devolveram **HTTP 403 com
`cf-mitigated: challenge`** (desafio Cloudflare) na primeira requisição, contra
UM user-agent honesto (`DioliDigital-PolicyAudit/1.0`), sem tentativa de
disfarce. Os mesmos 12 artigos foram então lidos pela **API pública documentada
do Zendesk Help Center**
(`GET https://99freelas.zendesk.com/api/v2/help_center/pt-br/articles/<id>.json`),
que devolveu HTTP 200 às 12, sem desafio e sem autenticação, com o mesmo
user-agent (`fontes/medicao-tecnica-2026-08-30.md` §4-§5).

**Por que o PM considera legítimo — conferido aqui, não aceito de palavra.**
(1) É outra interface publicada pelo **mesmo operador** (`99freelas.zendesk.com`),
não a mesma interface com a proteção derrubada; nenhum token foi forjado,
nenhum desafio foi resolvido, nenhum cabeçalho foi falsificado. (2) O
`robots.txt` de `99freelas.zendesk.com` **permite** `/api/v2/help_center/` — o
único `Disallow` sob esse prefixo é `.../stats/view`, que não foi tocado; o
mesmo `robots.txt` proíbe `/hc/*/search`, também não tocado
(`fontes/medicao-tecnica-2026-08-30.md` §5).

**A ressalva, com todas as letras:** o operador pode ter protegido o HTML e
esquecido a API — **não temos declaração dele sobre isso.** Isto não é fato
confirmado, é interpretação do PM sobre um comportamento técnico observado.

**A pergunta foi decidida — pelo Essencial `seguranca`, não por este parecer.**
Em `pareceres/2026-08-30-seguranca-sessao-do-titular.md`, pergunta 1: **NÃO
CONTORNOU proteção nenhuma.** O teste aplicado foi "houve um controle técnico
*derrotado*?" — credencial falsificada, desafio resolvido, identidade forjada
— e nenhum dos três aconteceu; o que houve foi leitura de **outra interface,
publicada pelo mesmo operador, com `robots.txt` positivo**, não uma porta
secreta. Veredito: **as 12 capturas de hoje ficam válidas**, com a ressalva de
que **isto não vira rotina** — vale só como captura ocasional de documentação,
no mesmo ritmo humano de hoje, e **não** se estende a `/projects`, ao chat, ou
a qualquer desafio futuro em outra parte do site; um "achei outra porta" novo
exige parecer novo, não herda este. **Por isso os dois blocos abaixo ("o que
muda se...") ficam registrados como estavam — descrevem o cenário que NÃO se
concretizou** (o `seguranca` não reprovou o caminho), preservados aqui porque
mostram que nenhuma das três conclusões centrais deste parecer dependia dessa
decisão de qualquer forma.

**O que muda se o Essencial `seguranca` decidir que esse caminho não vale**
*(cenário hipotético, não concretizado — ver decisão real acima):*

- **Caem as 12 capturas de hoje** (`ajuda-*-2026-08-30.md`), e a Central de
  Ajuda **volta a valer só pela captura de 07/08/2026** (agora 23 dias) — não
  vira LACUNA total, porque já existia fonte anterior válida; volta a ser
  fonte **envelhecida**, no mesmo estado em que estava antes desta rodada.
  **Correção, depois da auditoria do Essencial `qualidade`:** a redação
  anterior deste trecho afirmava que a captura de 07/08 tinha sido "feita em
  HTML limpo, sem desafio, antes de a proteção apertar" — isso era inferência
  não sustentada pela fonte, e foi retirado. O que a fonte de 07/08 diz,
  literalmente, é que a **API pública do Help Center (Zendesk)** devolveu HTTP
  429 depois de ~14 leituras (`fontes/medicao-tecnica-2026-08-07.md`, §4) —
  fala de API, não de HTML — e que, no mesmo dia, o parecer de 07/08 registra
  "Navegador é o único caminho que existe" para essa mesma leitura
  (`pareceres/2026-08-07-agente-autonomo-de-prospeccao.md`), o que contradiz o
  item anterior. **Portanto: LACUNA — não sabemos por qual interface a
  captura de 07/08 foi feita, nem se o HTML respondia 200 naquela data.**
- **O que SOBREVIVE mesmo assim:** o veredito da pergunta 2 (silêncio sobre
  automação) e o fato do banimento alcançar outras contas do mesmo usuário —
  **ambos estão em `termos-de-uso-2026-08-30.md`**, capturado por HTTP 200
  direto, sem controvérsia, sem passar pela API do Zendesk. O mesmo vale para
  `politica-de-privacidade-2026-08-30.md` e `como-funciona-2026-08-30.md`. Nenhuma
  das três conclusões centrais deste parecer depende da leitura via API.
- **O que NÃO sobrevive:** o status de "reconfirmado hoje" dos mecanismos de
  cota/conexões, taxa por plano, janela de 24h e regras de Violação **como
  descritos nos 12 artigos da Central de Ajuda** — eles voltam a depender só da
  captura de 07/08/2026, e a idade da fonte (23 dias, prestes a ficar mais)
  volta a ser o problema, exatamente como antes desta rodada.
- **Achado colateral, a favor da confiabilidade do dado:** a tabela de
  `updated_at` que a própria API do Zendesk devolveu (abaixo, pergunta 1) mostra
  que **nenhum dos 12 artigos foi alterado depois de 07/08/2026** — ou seja,
  mesmo que `seguranca` reprove o caminho, o conteúdo em disco desde 07/08
  continua sendo, pela palavra da própria plataforma, a versão vigente.

**O que o `seguranca` decidiu além da pergunta 1 — e que muda o que este
parecer recomenda operacionalmente, embora não mude o veredito FAIL CLOSED já
registrado:** ele abriu um **P0 de pré-condição**, independente do 99Freelas
em si — "Claude in Chrome com a sessão autenticada do titular" só é seguro
rodando dentro de um **perfil de navegador isolado**, dedicado só ao
99Freelas, sem e-mail/banco/outra sessão no mesmo perfil
(`docs/projetos/99freelas/00-ESPECIFICACAO-DO-CEO.md` §4 descreve o desenho;
`pareceres/2026-08-30-seguranca-sessao-do-titular.md` confirma que **esse
isolamento não existe em código, só como parágrafo de especificação**). Até
esse mecanismo existir, o `seguranca` **bloqueia qualquer operação de sessão
autenticada real**, mesmo supervisionada — risco que não é o 99Freelas banir a
conta, é o agente alcançar e-mail ou banco do CEO pelo mesmo navegador se
conteúdo de um projeto tentar manipulá-lo (prompt injection via briefing de
terceiro). Isto **não afrouxa nem aperta** as flags já vigentes deste
parecer — `auto_submission_allowed`, `browser_automation_allowed` e
`auto_messaging_allowed` já eram `false` e `human_gate_required` já era `true`
antes desta decisão; o que o `seguranca` acrescenta é uma **segunda barreira,
anterior à primeira**: mesmo a leitura supervisionada de `/projects` e do chat
via sessão autenticada do titular não deve ser operada de verdade — nem
supervisionada — enquanto o perfil isolado for só especificação.

---

## As três perguntas, com fonte

### 1. Mudou alguma coisa desde 07/08/2026?

**Não. Comparei por `diff` (normalizando espaço/quebra de linha) as 3 páginas
do site e um artigo de amostra da Central de Ajuda contra as versões de
07/08/2026, e o conteúdo normativo é idêntico.**

- **`termos-de-uso.md` vs `termos-de-uso-2026-08-30.md`**: `diff` palavra-a-palavra
  mostra só três tipos de diferença, nenhuma de conteúdo: (a) acentuação
  perdida **apenas no bloco de metadados** que o próprio script de captura
  escreve (`"é" → "e"`, `"cópia" → "copia"` — isto é boilerplate nosso, não da
  plataforma); (b) título de seção em CAIXA-ALTA na captura antiga virou
  Title Case na nova (`SANÇÕES` → `Sanções`), mesmo texto; (c) a captura de
  hoje trouxe **menu de navegação, rodapé e aviso de cookies** que a extração
  de 07/08 não capturou — chrome de página, não cláusula. **Nenhuma frase das
  Regras para Freelancers, das Regras para Cliente ou das Sanções mudou uma
  palavra.** Conferido: `docs/plataformas/99freelas/fontes/termos-de-uso.md`
  vs `termos-de-uso-2026-08-30.md`.
- **`politica-de-privacidade.md` vs `politica-de-privacidade-2026-08-30.md`**:
  mesmo padrão — corpo idêntico ponto a ponto (Coleta, Segurança, Disputas,
  Cookies, Relações com Terceiros, Comunicações, Armazenamento, Exclusão de
  Dados, Foro, Contato); a diferença é só chrome de página (menu, rodapé,
  aviso de cookie) e uma mensagem de erro genérica de JavaScript
  (`"Ocorreu um erro inesperado..."`) que é da renderização da página, não do
  texto legal.
- **`ajuda-violacao-freelancer.md` vs `ajuda-violacao-freelancer-2026-08-30.md`**
  (amostra de artigo da Central de Ajuda): corpo normativo idêntico
  palavra por palavra. A única diferença de conteúdo real é que a captura de
  07/08 (via HTML) trouxe **comentários de usuários** na página (dois
  comentários, incluindo um relato de banimento por múltiplas contas) que a
  captura de hoje (via API) **não traz**, porque a API devolve o artigo, não
  os comentários. Isso é uma diferença de **cobertura do método de captura**,
  não uma mudança de política — mas registro porque é uma perda real de sinal
  qualitativo (relato de enforcement real) que a via API não replica.
- **A tabela de `updated_at` que a própria API do Zendesk devolveu**
  (`fontes/medicao-tecnica-2026-08-30.md` §6) confirma isto de forma
  independente: **nenhum dos 12 artigos tem `updated_at` posterior a
  07/08/2026** — o mais recente é "Planos de freelancers", em **2026-08-07**,
  mesmo dia da nossa última captura confirmada. Pela própria declaração da
  plataforma, nada mudou.
- **`robots.txt` e `sitemap.xml`**: idênticos aos de 07/08/2026
  (`fontes/medicao-tecnica-2026-08-30.md` §1-§2).
- **A única mudança técnica verificada é o que a medição de hoje encontrou:
  403 com `cf-mitigated: challenge` na 1ª requisição, nas 12 URLs, em
  30/08/2026** (`fontes/medicao-tecnica-2026-08-30.md`, §4). **Correção, depois
  da auditoria do Essencial `qualidade`:** a redação anterior deste trecho
  afirmava que isso era um aperto em relação a 07/08 ("429 depois de ~14
  leituras em 07/08 → 403 com desafio na 1ª leitura hoje"), tratando "a
  proteção apertou" como fato. **Não é fato — é LACUNA.** A fonte de 07/08 fala
  de HTTP 429 na **API** do Help Center, não no HTML
  (`fontes/medicao-tecnica-2026-08-07.md`, §4), e o parecer do mesmo dia
  registra que o navegador era "o único caminho que existe"
  (`pareceres/2026-08-07-agente-autonomo-de-prospeccao.md`) — as duas fontes de
  07/08 se contradizem sobre qual interface foi medida, então não há linha de
  base em HTML para comparar com o 403 de hoje. Isto é fato de infraestrutura
  anti-bot medido só em 30/08, não de contrato — tratado no bloco 🔴 acima.
- **`como-funciona-2026-08-30.md`**: nunca foi capturada antes, então não há
  `diff` para ela — é addição, não mudança. Ver achado de precificação
  abaixo.

### 2. Os termos PROÍBEM operar a conta por automação?

**Veredito, em uma frase, repetido aqui: NÃO PROÍBEM EXPLICITAMENTE, e também
NÃO AUTORIZAM — é silêncio, e o silêncio se confirma hoje, com a busca colada
abaixo, e mantém-se FAIL CLOSED.**

**A busca, exatamente como pedida na ficha.** Rodei, sobre o **corpo** das 15
capturas de hoje (as 3 páginas do site + os 12 artigos, **excluindo os blocos
de metadados de captura** que o próprio script escreve no topo de cada
arquivo — ver nota metodológica abaixo), o seguinte comando:

```
grep -o -i -E "automa[a-zç]*|rob[oô]|bot|script|software|crawler|spider|scraping|raspagem|extra[cç][aã]o|extrair|coleta|coletar|meios automatizados|API|integra[cç][aã]o|terceiro[s]?|procurador|representante|delegar|compartilh[a-z]*|transfer[êe]ncia|transferir|intransfer[íi]vel|pessoal|exclusiv[a-z]*|cess[aã]o|cede" <corpo das 15 fontes de hoje>
```

**Resultado: 28 ocorrências, em 13 termos da lista — e NENHUMA delas fala de
automação de plataforma.** Contagem por termo encontrado:

| Termo casado | Ocorrências | Do que trata (conferido no contexto) |
|---|---|---|
| exclusivamente | 5 | uso interno de dados (privacidade), rendimento financeiro da 99Freelas, remuneração autônoma do freelancer — nunca automação |
| transferência | 4 | **transferência bancária** de reembolso (`termos-de-uso-2026-08-30.md`, seção Reembolso) — não é transferência de conta |
| terceiros | 3 | Política de Privacidade, seção "Relações com Terceiros" — venda/repasse de dados, não operação da conta |
| compartilhar | 3 | proibição de **compartilhar dados de contato** (a regra que já conhecíamos) |
| coleta | 3 | "Coleta de Dados Pessoais" (título de seção da Política de Privacidade) |
| exclusivos | 2 | "projetos exclusivos" dos planos pagos — benefício comercial, não automação |
| bot | 2 | **falso positivo**: substring de "**bot**ão" ("clicar no botão") |
| software | 1 | **falso positivo**: nome da categoria "Web, Mobile & **Software**" no piso de preço |
| pessoal | 1 | "Coleta de Dados **Pessoais**" |
| exclusivo / exclusiva | 2 | vínculo do freelancer ("não exclusivo, sem subordinação") e cessão de direitos autorais |
| cede | 1 | "o Freelancer **cederá** ao Cliente... direito sobre o conteúdo produzido" — **direitos autorais**, não conta |
| automaticamente | 1 | **renovação automática de cobrança** do plano pago (cartão de crédito) — não automação de uso da plataforma |

**Zero ocorrências** de: automação, robô/robo, script, crawler, spider,
scraping, raspagem, extração/extrair, coletar (verbo), "meios automatizados",
**API** (no corpo — ver nota abaixo), integração, procurador, representante,
delegar, intransferível, cessão.

**Nota metodológica, para não inflar o silêncio artificialmente — dois filtros
aplicados, os dois declarados aqui.** A primeira rodada dessa busca, sem
filtrar metadados, contava "API" **~24 vezes** — mas essas ocorrências estavam
**inteiramente dentro do cabeçalho que o PM escreveu em cada arquivo**
("Capturado pela API pública do Help Center: `.../api/v2/...`"), descrevendo
**o nosso próprio método de captura**, não texto da plataforma. Contar isso
como "a plataforma menciona API 24 vezes" seria inflar um silêncio real com
ruído do nosso processo — por isso os metadados foram excluídos antes da
contagem final, e por isso a tabela acima mostra **zero** ocorrências reais de
"API" no texto da plataforma. **O segundo filtro, não declarado na primeira
redação deste parecer — correção depois da auditoria do Essencial
`qualidade`:** a mesma passagem também excluiu **1 ocorrência de "exclusiva"**
que estava no campo `titulo:` do frontmatter de
`ajuda-plano-gratuito-nao-consigo-enviar-proposta-2026-08-30.md` (linha 2,
"...janela de 24h **exclusiva** de assinantes") — é metadado de arquivo
(título dado pelo script de captura ao artigo), não corpo do texto da
plataforma, pelo mesmo critério aplicado ao filtro de "API" acima. O número
final da tabela (**28 ocorrências**) já refletia os dois filtros; o que
faltava era declarar o segundo. Filtro não declarado parece filtro escondido —
por isso ambos ficam registrados aqui, com o mesmo critério: só é excluído o
que é metadado do nosso processo de captura, nunca texto normativo da
plataforma.

**Confirmado, igual ao parecer de 07/08/2026 e ao de 30/08 rodada 1: isto
continua sendo silêncio do contrato, não autorização.** Pela regra do próprio
CEO (§60/§61 da especificação `01`): silêncio não é autorização. **Mantenho
FAIL CLOSED.**

### 3. O que muda quando o TITULAR da conta autoriza a própria sessão (Claude in Chrome, modo SUPERVISIONADO)?

Busquei, no texto de hoje (`termos-de-uso-2026-08-30.md`), cláusula de
**titularidade/intransferibilidade de conta**, de **veracidade de perfil** e de
**responsabilidade do usuário pelos atos praticados na conta**, como a ficha
pede.

- **Não existe cláusula de titularidade/intransferibilidade da conta de
  usuário.** A única ocorrência de "titularidade" no texto é sobre **conta
  bancária de reembolso**: *"a transferência só poderá ser realizada na conta
  indicada pelo Cliente e de sua titularidade"* (`termos-de-uso-2026-08-30.md`,
  seção Reembolso) — não é sobre a conta do 99Freelas.
- **Não existe cláusula de veracidade de perfil, procurador, representante ou
  conta compartilhada.** O texto tem uma frase próxima, mas em outro sentido —
  é isenção de responsabilidade da plataforma, não obrigação do usuário:
  *"Não garantimos a identidade, idoneidade e sinceridade dos Freelancers e
  Clientes"* (`termos-de-uso-2026-08-30.md`). Isto é a 99Freelas se protegendo,
  não uma regra de "só o titular pode operar a conta".
- **Existe, sim, uma cláusula clara sobre múltiplas contas — e ela reforça o
  risco, não a permissão:** *"A sanção de banimento encerra definitivamente o
  acesso ao usuário na plataforma, **incluindo outras contas do mesmo
  usuário**"* (`termos-de-uso-2026-08-30.md`, seção Sanções — a mesma frase do
  parecer de 07/08, agora reconfirmada hoje por captura limpa, HTTP 200 direto,
  sem passar pela API).
- **Os Termos não distinguem "bot anônimo enviando em massa" de "titular
  operando a própria sessão com supervisão humana".** **LACUNA quanto à linha
  exata** — a fonte não desenha essa linha, então este parecer não a inventa.

**Política de Privacidade — dados de terceiros (os clientes que publicam
projetos).** O texto de hoje (`politica-de-privacidade-2026-08-30.md`) fala em
"Relações com Terceiros" sobre a própria 99Freelas não vender/repassar dados a
terceiros — **não trata do caso "a agência lê o briefing de um cliente que não
é o titular da conta"**. O texto mais próximo é: *"Os dados pessoais expostos
na descrição do perfil do usuário são públicos e acessíveis para qualquer
visitante da página. A plataforma não se responsabiliza pelo uso de terceiros
dos dados expostos nesta página."* Isso cobre **leitura** de dados públicos
(briefing de projeto é conteúdo público na plataforma, visível a qualquer
freelancer que navegue), mas **não fala de automação lendo esses dados em nome
de um titular**. **LACUNA**: não há proibição nem autorização explícita para
o agente ler briefing de terceiros dentro da sessão do titular — trata-se do
mesmo silêncio da pergunta 2, agora aplicado a dado de terceiro.

**Um achado que NÃO é fonte da plataforma, é engenharia de política interna,
repetido do parecer da rodada 1 porque continua verdadeiro:** o modo que o CEO
descreveu — Claude in Chrome com a sessão dele, humano confirma antes de cada
envio — já é, ponto por ponto, o que `policy.json` exige independentemente
desta pergunta (`human_gate_required: true`,
`capabilities.proposalSubmission: "MANUAL"`). O SUPERVISIONADO não pede
afrouxar nenhuma trava já escrita.

---

## Achado extra, fora do escopo das três perguntas, mas verificado hoje

**`como-funciona-2026-08-30.md` (nunca capturada antes) diz um número de taxa
DIFERENTE do que `termos-de-uso-2026-08-30.md` diz**, para a mesma coisa:

| Fonte | Taxa declarada |
|---|---|
| `termos-de-uso-2026-08-30.md`, linha 111 | *"Nós adicionamos uma taxa de **10% a 20% (R$ 5,00 no mínimo)** na sua oferta enviada ao Cliente"* |
| `como-funciona-2026-08-30.md`, linha 104 | *"Nós adicionamos uma taxa de **5% a 20% (R$ 10,00 no mínimo)** na sua oferta que será paga pelo contratante"* |

Isto **não muda o veredito de automação** (não é sobre a pergunta desta
ficha), mas **contradiz um número que `policy.json` usa para calcular preço**
(`precificacao.taxa_da_plataforma_percentual: [10, 20]`, `taxa_minima_reais: 5`).
Não decido sozinho qual das duas fontes vale — os Termos de Uso são o
documento contratual, `como-funciona` é material de marketing, então a leitura
mais prudente é que os **Termos prevalecem** e `como-funciona` está
desatualizado ou impreciso. Mas isto é **LACUNA declarada, não resolvida por
mim**: registrei o achado em `policy.json` (`precificacao._divergencia_2026_08_30`)
sem mudar o número ativo, porque mudar preço sem decisão de quem manda em
pricing não é atribuição deste parecer.

---

## A pendência do suporte — 23 dias sem resposta, o que isso significa na prática

`autorizacao_do_suporte.status` está `sem_resposta` desde a rodada 1 (23 dias
corridos desde o envio em 07/08/2026, sem resposta de
`suporte@99freelas.com.br`). Mantenho o status. **O que isso significa na
prática, com todas as letras:**

- **`auto_submission_allowed` continua `false` e `human_gate_required`
  continua `true` — e vão continuar assim indefinidamente**, não porque os
  Termos proíbam, mas porque o **único evento que os mudaria** (autorização
  escrita do suporte) simplesmente não aconteceu. Silêncio da plataforma sobre
  automação + silêncio do suporte sobre o pedido específico = duas ausências
  de informação empilhadas, e nenhuma vira permissão por acúmulo.
  `autorizacao_do_suporte.status = sem_resposta` **não é um degrau a caminho de
  `autorizado`** — é um estado que pode ficar `sem_resposta` para sempre. Não
  há prazo declarado pelo 99Freelas para responder e-mail de suporte.
  **NÃO INVENTO um prazo que viraria `negado` por decurso de tempo.**
- **Nenhum campo vira `autorizado` sem `respondido_em` + `evidencia`
  arquivada** — isso já estava no gate de `policy.json` e continua intacto.
  Esta rodada não altera esse mecanismo.
- **Recomendação prática:** se o CEO quiser sair do 🟠 antes de o suporte
  responder (se é que vai responder), a única via que este parecer enxerga é a
  que já estava proposta: reenviar a pergunta por um canal com registro mais
  forte (ticket com número de protocolo em vez de e-mail solto), ou aceitar
  operar permanentemente em modo SUPERVISIONADO — que, como já demonstrado, não
  exige nenhuma autorização adicional, porque o clique final já é humano.

---

## Lacunas declaradas — o que este parecer NÃO sabe

- **Onde fica a linha entre "titular operando a própria sessão" e "bot
  anônimo".** Os Termos não têm essa cláusula, hoje confirmado por captura
  limpa. **LACUNA**, não inventada.
- **Se a Política de Privacidade autoriza ou proíbe um agente ler briefing de
  terceiros (clientes) dentro da sessão do titular.** Não há cláusula
  específica. **LACUNA.**
- **Se o operador (99Freelas/Zendesk) considera a leitura via API pública do
  Help Center, depois de 403 no HTML, uma forma de contornar a proteção.**
  Não há declaração dele. **Ressalva registrada no bloco 🔴; decisão final é do
  Essencial `seguranca`, não deste parecer.**
- **Qual das duas taxas (`termos-de-uso` 10–20%/R$5 vs. `como-funciona`
  5–20%/R$10) é a que a plataforma efetivamente cobra.** **LACUNA**, registrada
  em `policy.json`, não resolvida.
- **Se o suporte respondeu por outro canal** (telefone, chat) fora do e-mail
  rastreado. Não verificado. **LACUNA.**
- **Rate limit e fingerprint do lado autenticado.** Não fizemos login hoje,
  igual a 07/08. **NÃO CONFIRMADO.**

---

## O que mudou nos artefatos da casa

- `policy.json`: `policy_verified_at` → `2026-08-30`; `version` →
  `2026-08-c`; `tentativas_de_recaptura` virou registro honesto das duas
  rodadas (rodada 1 falhou por ambiente, rodada 2 confirmou); bloco `anti_bot`
  ganhou o fato do 403/Cloudflare/API; `precificacao` ganhou o registro da
  divergência de taxa; `autorizacao_do_suporte` ganhou o campo de dias sem
  resposta. **Nenhuma linha de regra ativa foi marcada `active:false`** porque
  nenhuma regra de fato mudou — o §48 (linha antiga vira `active:false`) só se
  aplica quando a REGRA muda, e aqui o achado foi "nada mudou", não "mudou
  algo".
- `fontes.json`: 16 entradas novas (3 páginas do site + 12 artigos + a
  medição técnica), todas com sufixo `-2026-08-30`. As 15 entradas antigas
  permanecem intactas.
- `fontes/`: nenhum arquivo sem sufixo de data foi tocado, apagado ou editado.

---

## Recomendação ao Diretor, em uma linha

**Nada muda no veredito operacional — o robô continua em HUMAN_GATE no envio —
mas agora a base é fonte de hoje, não fonte de 23 dias atrás, e o achado que
merece decisão do CEO não é sobre automação: é a divergência de taxa entre
`termos-de-uso` e `como-funciona`, e a escolha entre insistir com o suporte por
um canal mais forte ou aceitar operar permanentemente supervisionado.**

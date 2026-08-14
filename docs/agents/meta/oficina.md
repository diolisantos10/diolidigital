# Oficina — meta

> Append-only. O especialista escreve; **quem promove para a vitrine é o
> Diretor**. Entrada nova entra no fim.

---

## 2026-08-14 · A pergunta do tráfego da CityJobs, e a resposta que encurta o caminho

**Pergunta do Diretor:** a casa consegue rodar anúncio para a CityJobs hoje, sem
esperar App Review nem verificação do negócio?

**Resposta: sim — e não é dedução, é o que a fonte diz e o que a casa já provou
em produção.** A CityJobs é empresa do próprio CEO, e ele é o **único
administrador do app** (`roles`: 1 admin, medido em 06/08 — `app-review.md` §1).
As três fontes que decidem:

- *"Caso o app gerencie somente sua conta de anúncios, o acesso padrão e as
  permissões `ads_read` e `ads_management` serão suficientes. Se o app gerenciar
  contas de anúncios de outras pessoas, será necessário ter acesso avançado."*
  — `fontes/marketing-api-autorizacao-e-niveis.md:73`
- Acesso limitado: *"Administradores ou desenvolvedores de apps podem fazer
  chamadas à API em nome de administradores de contas de anúncios ou
  anunciantes."* — `fontes/marketing-api-autorizacao-e-niveis.md:48`
- *"Caso o app seja utilizado somente por usuários que tiverem uma função nele,
  não será necessário fazer a verificação. (…) todos os recursos ficarão sempre
  ativos."* — `fontes/verificacao-de-negocio.md:21`; e a mesma regra para a
  análise em `fontes/app-review-processo.md:18`.

**A prova empírica já existia e estava enterrada em `docs/pendencias.md:3283-3287`
(03/08/2026):** com o token do CEO, a casa **criou uma campanha PAUSADA por API
na conta da agência e a apagou** — *"Modo dev + admin dispensa App Review para
operar"*. O que quebrou naquele dia **não foi permissão**: foi ritmo de máquina,
e a conta `act_3416644181895443` foi restringida horas depois.

### O erro de generalização que mora no código, com arquivo:linha

`lib/integrations/meta/ads.ts:69-74` traduz **qualquer** erro que contenha
`permission|ads_management|ads_read|not authorized|requires` para:

> *"A Meta ainda não liberou as permissões de anúncio deste app
> (ads_management/ads_read). Isso depende do App Review — não é erro de
> configuração."*

Para conta de terceiro, correto. **Para a conta do próprio CEO, essa frase manda
a casa esperar semanas por algo que não é o problema.** É a mesma classe de erro
que o Diretor relatou ter cometido duas vezes na semana.

### O que a medição por `debug_token` NÃO cobre hoje

`lib/integrations/meta/permissoes-do-token.ts` é genérico e serviria para conta
de anúncios, mas:

1. **Não há constante para anúncios.** Existem `PARA_PUBLICAR_NO_INSTAGRAM` e
   `PARA_MEDIR_O_INSTAGRAM` (l. 156-168) — nada para `ads_management`/`ads_read`.
2. **O único consumidor mede só Instagram** — `prontidao-de-publicacao.ts:304` e
   `GET /api/meta/prontidao?...&meta=1`. Conta de anúncios não passa por lá.
3. **`valeParaOAtivo` (l. 141-151) compara id cru.** A própria casa documenta que
   a Meta devolve a conta ora como `act_123`, ora como `123`
   (`ativos-autorizados.ts:104-115`, `normalizarId`). Sem normalizar, a medição
   pode devolver **"não vale" falso** para uma conta que vale. É a trava que a
   casa já consertou num lugar e não replicou no outro.

**Não medi ao vivo, e digo por quê:** este ambiente não tem credencial da Meta
(o `.env` tem `DATABASE_URL`, `SESSION_SECRET` e senhas de seed — nada de
`META_*`), e todas as rotas de diagnóstico exigem sessão. `debug_token` precisa
do token do app, que mora só no Railway. **Não tentei chamar nada contra a
conta** — tentativa é exatamente o gesto proibido.

### O que impede a campanha de sair, e é NOSSO (não da Meta)

Lido no caminho de código, em ordem:

1. `esteira/trafego.ts:93` procura conexão `platform:"user"` **com o `clientId`
   da CityJobs**. O token de 03/08 foi colado em nível de agência (`clientId`
   vazio — perícia de 06/08). Sem uma conexão do cliente, a esteira devolve *"o
   cliente ainda não conectou a conta Meta dele"*.
2. `ads.ts:110-113` (`filtrarAutorizados`) e `ads.ts:183`
   (`recusarContaNaoAutorizada`): a conta precisa estar em `MetaAtivoAutorizado`.
   **A tabela nasce vazia de propósito** — fail-closed.
3. `conferirOrcamento` (`ads.ts:147+`): exige `tetoAprovadoBRL` do cliente,
   diário ≥ piso e ≤ teto da casa (`ADS_TETO_DIARIO_BRL`, padrão 500).
4. Segmentação: sem cidade/raio a esteira devolve pendência (`trafego.ts:137`) —
   e isso é acerto, não defeito.
5. `ativarCampanha` (`ads.ts:471`) exige `autorizadoPor`. Campanha nasce sempre
   PAUSADA; ligar é gesto humano.
6. **Se a conta escolhida for `act_3416644181895443`**, ela estava restrita desde
   03/08. Caminho da Meta para pedir análise: *Página Inicial do Suporte para
   Empresas → Visão geral do status da conta → (a conta) → "O que você pode
   fazer" → "Pedir análise"*, ~48 h (`fontes/recorrer-de-restricao.md`).

**Alerta de ritmo, que vale mais que tudo acima:** o nível Limitado dá 60 pontos
por conta, escrita vale 3 (`travas.ts`) — **20 escritas travam a conta por 5
minutos**. E a Meta chama esse nível de *"somente para desenvolvimento, não para
apps em produção veiculando para anunciantes publicados"*
(`fontes/marketing-api-autorizacao-e-niveis.md:42`). Rodar para a CityJobs é
defensável (conta própria); rodar em rajada é repetir 03/08.

---

## 2026-08-14 · O passo a passo do CEO para os dois portões da Meta

Montado `docs/plataformas/meta/passo-a-passo-do-ceo.md`. Só documento, nenhuma
linha de código, nenhuma chamada de escrita na Meta.

**O que apareceu ao medir, e não estava em lugar nenhum junto:**

- **Os dois portões só valem para cliente EXTERNO.** As duas fontes que fundam o
  cronograma dizem, na mesma frase, que app usado só por quem tem função nele
  dispensa análise **e** verificação (`app-review-processo.md:18`,
  `verificacao-de-negocio.md:21`). O documento abre com isso, porque muda o que
  o CEO acha que está esperando.
- **A lista de documentos da verificação não está na biblioteca.** A Meta remete
  à Central de Ajuda (`verificacao-de-negocio.md:33`); as duas páginas
  (`business/help/1095661473946872` e `.../2058515294227817`) responderam 200
  hoje, mas são renderizadas por JS e o capturador só trouxe o título.
  **Declarada como lacuna, com o gesto para resolver** (o CEO abre o fluxo, lê a
  lista na tela e manda print) em vez de preenchida de memória.
- **Prazo dos dois portões: nenhuma fonte informa.** Escrito "não sei". O único
  prazo com fonte é o de conta restrita: 48 h.
- **Risco novo, achado hoje:** `instagram_manage_insights` exige um terceiro
  screencast — insights do **perfil público de outra conta profissional**
  (`permissoes-referencia.md:564+`). **Não existe `business_discovery` no
  código** (conferido por busca). O dossiê de 06/08 não registrava isso. Duas
  saídas no documento; recomendo gravar sem e aceitar risco só nessa permissão.
- **Divergência interna da casa, registrada em vez de escolhida:** o dossiê de
  06/08 diz que `META_LOGIN_CONFIG_ID` **não** está definida; a vitrine de 11/08
  diz que **está**. É o item mais caro de errar — todo vídeo começa pelo login —
  e virou a pergunta nº 4 do passo 1, que só o painel responde.
- **A fonte do caminho de menu da verificação é de 07/07/2023.** O documento diz
  isso na cara e manda o CEO parar e mandar print se o menu não bater, em vez de
  forçar.

**Proposta de vitrine (quem promove é o Diretor):** *"Os dois portões da Meta
valem para cliente de fora — para o ativo do próprio dono do app, a Meta dispensa
análise e verificação, e a casa já provou isso em produção em 03/08."* Origem:
`fontes/marketing-api-autorizacao-e-niveis.md:48,73`,
`fontes/verificacao-de-negocio.md:21`, `fontes/app-review-processo.md:18`,
`docs/pendencias.md:3283-3287`. Data: 14/08/2026.

# Cartilha do TikTok — o que pode, o que não pode, e como se integra

> Escrita em 03/08/2026, no dia em que a Meta restringiu a conta de anúncios da
> agência e o CEO ordenou especialistas-trava para as 3 grandes plataformas.
> **Reescrita em 06/08/2026** após a ordem do CEO (05/08) de absorver o máximo
> de conhecimento público de cada plataforma: a biblioteca saiu de 18 fontes
> (só política) para **77 fontes no manifesto, 62 capturadas com sucesso**,
> cobrindo registro de app, OAuth, Content Posting API, Display API, Accounts
> API, Marketing API, termos legais e as políticas por indústria com o recorte
> do **Brasil**.
>
> O TikTok **ainda não tem integração nenhuma** neste sistema — esta cartilha
> continua nascendo ANTES do código, de propósito, para que a integração já
> nasça dentro das regras. Toda afirmação relevante cita o documento oficial
> capturado em `docs/plataformas/tiktok/fontes/`. O que não foi capturado está
> declarado em "Lacunas da biblioteca", no fim.

---

## (a) O que derruba conta — spam, automação, engajamento falso

A regra do TikTok é explícita e é exatamente o tipo de coisa que derrubou a
conta da Meta em 03/08:

- **Automação para contornar sistemas é proibida com todas as letras:** "É
  expressamente proibido o uso de ferramentas de automação, scripts ou
  quaisquer outros métodos destinados a contornar nossos sistemas. O uso desses
  métodos e ferramentas pode resultar em remoção de conteúdo, banimento de
  contas ou outras ações punitivas." (fonte: fontes/cg-integridade-autenticidade.md)
- **Engajamento falso e comercialização de engajamento são proibidos** — contas
  que enganam ou tentam manipular a plataforma, serviços que inflam
  artificialmente engajamento, operações de influência secreta, personificação,
  spam e avaliações falsas. As punições listadas: banir a conta, **banir contas
  adicionais ou novas que você criar**, ou restringir (limitar publicação,
  busca e feed "Para Você"). (fonte: fontes/cg-integridade-autenticidade.md)
- **Criar outra conta para contornar restrição/ban também é proibido** — a
  punição segue a pessoa, não a conta. (fonte: fontes/cg-integridade-autenticidade.md)
- **Métricas artificiais são removidas** (curtidas, seguidores falsos), e
  conteúdo que manipula pessoas para inflar curtidas/seguidores/presentes fica
  fora do "Para Você". (fonte: fontes/cg-integridade-autenticidade.md)
- **Desinformação com dano** é proibida independentemente da intenção;
  desinformação de dano moderado sai do "Para Você". Conteúdo gerado por IA ou
  fortemente editado com aparência realista **exige rótulo** — sem rótulo pode
  ser removido ou restringido. (fonte: fontes/cg-integridade-autenticidade.md)
- **Conteúdo não original/reutilizado sem novidade** fica fora do "Para Você"
  — relevante para agência que replica peça em várias contas. (fonte:
  fontes/cg-integridade-autenticidade.md)
- **Divulgação obrigatória de conteúdo comercial:** quem divulga negócio,
  produto ou serviço — próprio ou de terceiro, em troca de pagamento ou
  incentivo — **precisa usar a configuração de divulgação de conteúdo**. Bens
  regulamentados (álcool, tabaco, armas, jogo, serviços sexuais, produtos
  falsificados) não podem ser comercializados organicamente; só há espaço para
  publicidade paga limitada, de conta de negócio verificada. (fonte:
  fontes/cg-bens-atividades-comerciais.md)
- As Diretrizes da Comunidade valem para **tudo e todos** na plataforma —
  inclusive anúncio e conteúdo de marca. (fonte: fontes/cg-visao-geral.md)

**Tradução para esta casa:** publicar por API em ritmo de máquina, replicar o
mesmo conteúdo em várias contas, ou "testar" criando e apagando — no TikTok
isso é ban com previsão de banimento das contas seguintes. O mesmo padrão que
derrubou a Meta derruba o TikTok.

## (b) O que reprova anúncio — indústrias, criativo, landing page

Todo anúncio passa por revisão (tipicamente ~24h) antes de veicular. Motivos de
rejeição incluem violar as políticas de criativo/landing page ou promover
indústria proibida/restrita. (fonte: fontes/ads-revisao-faq.md)

### Indústrias — agora com o recorte do Brasil na biblioteca

O que é proibido/restrito **varia por país**, e desde 06/08/2026 a biblioteca
tem os artigos por indústria com a seção do Brasil dentro:

- **Serviços financeiros (Brasil):** pode, se o anunciante for **licenciado
  pelas autoridades locais/regionais**, cumprir requisitos de divulgação
  (incluindo disclaimers) e **restringir o público a 18+**. Exemplos do que
  pode: conta bancária, cartão de débito/crédito, câmbio. (fonte:
  fontes/ads-industria-servicos-financeiros.md)
- **Jogo e apostas (Brasil):** jogo offline **não é permitido**; cassino online
  só é permitido mediante **autorização prévia com representante comercial do
  TikTok**. Ou seja: não existe "subir sozinho" campanha de aposta. (fonte:
  fontes/ads-industria-jogos-apostas.md)
- **Saúde e farmacêutico (Brasil):** o artigo traz tabela por tópico
  (medicamento com prescrição etc.) — conferir tópico a tópico antes de
  qualquer peça. (fonte: fontes/ads-industria-saude-farmaceutico.md)
- **Emagrecimento e imagem corporal:** proibido envergonhar o corpo do usuário,
  sugerir corpo ideal ou prometer melhora de vida por mudança de aparência;
  alegação de perda de peso/ganho muscular só com público **18+** e enquadrada
  como estilo de vida saudável. (fonte: fontes/ads-industria-emagrecimento.md)
- Também capturados: **álcool**, **conteúdo adulto**, **política/eleições**,
  **outros produtos e serviços**, **propriedade intelectual**. (fontes:
  fontes/ads-industria-alcool.md, fontes/ads-industria-conteudo-adulto.md,
  fontes/ads-industria-politica-eleicoes.md,
  fontes/ads-industria-outros-produtos.md,
  fontes/ads-propriedade-intelectual.md)
- Os dois **índices** de indústria (geral e América Latina) pararam de ser
  capturáveis em 06/08 — as cópias de 03/08 seguem no repositório e estão
  marcadas como lacuna (ver tabela no fim).

### Criativo

- **Promessa exagerada ou absoluta reprova:** "não permitimos que o conteúdo do
  anúncio use termos absolutos sobre um produto em relação a tempo, região ou
  marca" — exemplos vetados: "Get slim legs right away", "Get money in 10
  seconds", cura de doença incurável, "Number 1 on TikTok". (fonte:
  fontes/ads-conteudo-enganoso-falso.md)
- **Antes-e-depois é vetado**, assim como comparação maliciosa ou subjetiva com
  marca concorrente nomeada. (fonte: fontes/ads-conteudo-enganoso-falso.md)
- **Clickbait de elemento falso reprova:** botão de play falso, botão de fechar
  falso, carrossel que não funciona, CTA falso. (fonte:
  fontes/ads-conteudo-enganoso-falso.md)
- **Práticas enganosas** (agora capturado, era lacuna): golpe, promessa de
  ganho irreal, imitação de interface do sistema, funcionalidade falsa.
  (fonte: fontes/ads-praticas-enganosas.md)
- **Inconsistência anúncio × landing page reprova.** (fonte:
  fontes/ads-conteudo-enganoso-falso.md)
- **IA generativa exige rótulo AIGC**; IA não declarada = anúncio rejeitado ou
  restringido. Imagem/voz de figura pública sem permissão é vetada. (fonte:
  fontes/ads-conteudo-enganoso-falso.md)
- **Especificação do criativo in-feed:** vídeo, sem marca d'água (incluindo a
  do próprio TikTok), sem imitar a interface do TikTok, formato vertical 9:16
  recomendado, evitar fundo branco/transparente, criativo localizado no idioma
  do mercado. (fonte: fontes/ads-in-feed-auction.md)
- **Só existe anúncio em VÍDEO no TikTok** (imagem estática só nos News Feed
  Apps), duração entre **5 segundos e 10 minutos**. (fonte:
  fontes/ads-revisao-faq.md)

### Landing page

- Deve ser **funcional na rede do mercado-alvo**; reprova: página expirada, em
  construção, incompleta, não mobile-friendly, que baixa arquivo
  automaticamente, ou com alta proporção de anúncio sobre conteúdo original.
  (fonte: fontes/ads-formato-funcionalidade.md)
- E-commerce e serviço financeiro devem exibir **dados válidos da empresa**.
  (fonte: fontes/ads-landing-page-checklist.md)
- **Não pode exigir informação sensível** para acessar e **não pode exibir
  produto proibido**. (fonte: fontes/ads-landing-page-checklist.md)
- Idioma aceito no país-alvo; página sem Política de Privacidade pedindo dado
  pessoal reprova. (fonte: fontes/ads-revisao-faq.md)

### Conteúdo de marca / parceria paga

- A **Branded Content Policy** rege conteúdo de marca e parceria paga, com
  requisitos por mercado. Peça de cliente publicada em conta de criador exige a
  divulgação correta. (fontes: fontes/legal-politica-branded-content.md,
  fontes/ads-branded-content-requisitos-mercado.md)

### Veiculação (contratos de reserva)

- Cancelamento unilateral perto da data de veiculação gera multa de 50% a 100%
  do valor. (fonte: fontes/ads-politica-de-veiculacao.md)

## (c) Música — a pegadinha clássica de agência

- **Conta comercial NÃO pode usar a biblioteca geral de música.** A música de
  trend do vídeo orgânico de criador **não pode** em conteúdo de negócio — nem
  orgânico, nem anúncio, nem branded content, **nem duet/react/stitch**.
  (fonte: fontes/musica-biblioteca-comercial.md — cópia de 03/08; a página
  parou de ser capturável em 06/08, ver lacunas)
- O caminho certo é a **Commercial Music Library (CML)**, pré-licenciada e
  grátis para uso comercial.
- **O app já trava sozinho:** conta Business, ao tocar em "Add Sound", **só vê**
  sons da CML. Filtre por região da campanha — a licença é regional. (fonte:
  fontes/musica-como-usar.md)
- Na integração via API orgânica, o consentimento é obrigatório na interface: o
  botão de publicar deve declarar "By posting, you agree to TikTok's Music
  Usage Confirmation". (fonte: fontes/dev-content-sharing-diretrizes.md)
- Em anúncio pela Marketing API existe endpoint próprio de autorização de
  música: `/identity/music/authorization/`. (fonte:
  fontes/business-autorizacao-musica.md)

**Regra da casa:** peça de cliente no TikTok só com som da CML (filtrada por
Brasil) ou trilha com licença própria documentada. "Está bombando no TikTok"
não é licença.

## (d) APIs — o mapa completo da integração futura

**Estado em 06/08/2026: NÃO existe nenhum código de TikTok neste sistema**
(nada em `lib/integrations/tiktok/`), e não há app registrado em nome da
agência (até onde esta casa registrou).

### A descoberta que muda o plano: existem DOIS caminhos para postar orgânico

| | **Content Posting API** (developers.tiktok.com) | **Accounts API / Organic API** (business-api.tiktok.com) |
|---|---|---|
| Público-alvo declarado | criadores autênticos postando conteúdo original para público amplo | **anunciantes e seus parceiros terceiros**, gerenciando contas próprias de marca/criador |
| Uso de agência | o guia **REJEITA** "utility tool para subir conteúdo nas contas que você ou seu time gerencia" (fonte: fontes/dev-content-sharing-diretrizes.md) | **explicitamente autorizado**: "Manage the organic presence of brands or creators' owned accounts on TikTok, including publishing video or photo posts" (fonte: fontes/business-accounts-api-visao-geral.md) |
| Porta de entrada | app no TikTok for Developers + auditoria de conteúdo | app no portal TikTok for Business + escopo "TikTok Accounts" |
| Trava adicional | app não auditado → tudo `SELF_ONLY`, 5 usuários/24h | **desde 20/03/2026, exige o Accounts API Access Application Form** antes de submeter app novo ou pedir aumento de escopo com "TikTok Accounts" (fonte: fontes/business-accounts-api-visao-geral.md) |

> **Consequência direta para o plano:** o risco nº 1 registrado em 03/08 ("a
> auditoria da Content Posting API rejeita ferramenta interna de agência")
> tem agora uma resposta oficial — para o caso de uso desta casa, o caminho
> desenhado pelo TikTok é a **Accounts API**, não a Content Posting API. A
> Content Posting API continua sendo a via correta se um dia o produto for
> uma ferramenta para criadores externos.
>
> A Accounts API também **proíbe** explicitamente: montar programa próprio de
> descoberta/ranking de influenciador com os dados agregados (isso é TikTok
> One), e baixar/migrar vídeos e imagens do TikTok para outra conta ou outra
> plataforma. (fonte: fontes/business-accounts-api-visao-geral.md)

### Registro e revisão do app (TikTok for Developers)

(fonte: fontes/dev-criar-app.md)

- Conta de desenvolvedor por e-mail; **criar uma organização** como dona do app
  (registrar app sob conta individual é desaconselhado para integração real).
- App tem **Production** e **Sandbox**. Sandbox é ambiente restrito que permite
  testar sem submeter à revisão.
- **Credenciais:** Client key e Client secret na seção App details. O secret é
  confidencial (regra do TikTok e desta casa).
- **Verificação de propriedade de URL** é pré-requisito da submissão. Para apps
  criados **depois de 09/09/2024**, exigem verificação: **Terms of Service URL,
  Privacy Policy URL e a URL Web/Desktop**. Qualquer app que use a URL de
  upload da Content Posting API precisa verificar essa URL, independentemente
  da data. Verificação por domínio ou por prefixo de URL (com arquivo de
  assinatura).
- **Submissão à revisão:** explicar em detalhe como cada produto e cada escopo
  funcionam no app, e enviar **pelo menos 1 vídeo demo do fluxo ponta a ponta**
  (até 5 vídeos, 50 MB cada).
- **Status:** Draft → In review (sem alterações possíveis; dá para Recall) →
  Live. Mudança em app Live exige **Create revision** (clone em rascunho) e
  nova revisão.
- **Não há prazo oficial nem garantia de aprovação** — é item de calendário,
  não de código. (fonte: fontes/dev-diretrizes-desenvolvedor.md)

### OAuth e escopos

- **Login Kit é o OAuth 2.0 do TikTok**; gerencia o ciclo de vida do token e
  devolve access token renovável. (fontes: fontes/dev-login-kit-visao-geral.md,
  fontes/dev-login-kit-web.md)
- **Escopo é permissão concedida pelo usuário final.** `user.info.basic` entra
  por padrão em todo app com Login Kit; escopos adicionais se pedem na página
  do app. **Ser aprovado para um escopo não dá acesso a dado nenhum** — cada
  usuário ainda precisa autorizar, pode autorizar só um subconjunto, e pode
  **revogar a qualquer momento** pelo app do TikTok. (fonte:
  fontes/dev-escopos-visao-geral.md)
- Troca de código por token: `POST https://open.tiktokapis.com/v2/oauth/token/`
  com `client_key` + `client_secret`. (fonte: fontes/dev-oauth-tokens-usuario.md,
  fontes/dev-login-kit-gerenciar-tokens.md)
- No lado business (Accounts API), o token da conta TikTok **vale 1 dia** e o
  refresh token **vale 1 ano**; expirado o refresh, o usuário precisa
  reautorizar. Endpoints: `/tt_user/oauth2/token/`,
  `/tt_user/oauth2/refresh_token/`, `/tt_user/oauth2/revoke/`. (fonte:
  fontes/business-autenticacao-contas.md)
- A autorização da conta do cliente na Accounts API é feita por uma **URL de
  autorização do titular da conta**, gerada na página do app; até 10 redirect
  URLs por app, **uma ativa por vez**, e a redirect URL **precisa terminar com
  `/`**. Usar `state` contra CSRF, e subir o logo do app (≤512×512) — sem logo,
  o usuário vê tela de erro na autorização. (fonte:
  fontes/business-accounts-api-autorizacao.md)

### Content Posting API — o detalhe operacional

(fontes: fontes/dev-content-posting-inicio.md,
fontes/dev-content-posting-direct-post.md,
fontes/dev-content-posting-creator-info.md,
fontes/dev-content-posting-rascunho.md,
fontes/dev-content-posting-upload-video.md,
fontes/dev-content-posting-foto.md,
fontes/dev-content-posting-status.md,
fontes/dev-content-posting-transferencia-midia.md)

- **Dois modos:** *Direct Post* (publica) e *Upload* (manda para a caixa de
  entrada/rascunho, e o criador finaliza no app). O modo rascunho é o de menor
  risco e não depende da mesma promessa de visibilidade pública.
- **Fluxo obrigatório:** `POST /v2/post/publish/creator_info/query/` antes de
  **cada** post → `POST /v2/post/publish/video/init/` (ou
  `/v2/post/publish/content/init/` para foto) → transferência da mídia →
  `POST /v2/post/publish/status/fetch/`.
- **Ritmo:** cada `access_token` de usuário tem **6 requisições por minuto** no
  init. Somado ao teto de **~15 posts/dia por conta de criador** compartilhado
  entre apps.
- **Transferência de mídia:** `FILE_UPLOAD` (binário via HTTP) ou
  `PULL_FROM_URL` (só de domínio/prefixo verificado). Chunk entre **5 MB e
  64 MB**, último chunk até 128 MB, **máximo 1000 chunks, enviados em
  sequência**; vídeo abaixo de 5 MB vai inteiro. O `upload_url` **vale 1 hora**.
- **Campos que a peça de cliente sempre usa:** `privacy_level` (tem que ser um
  dos `privacy_level_options` devolvidos pelo creator_info),
  `disable_comment` / `disable_duet` / `disable_stitch`,
  `video_cover_timestamp_ms`, **`brand_content_toggle`** (parceria paga),
  **`brand_organic_toggle`** (marca própria) e **`is_aigc`** (rótulo de IA).
- **Erros que a esteira precisa tratar por nome:**
  `unaudited_client_can_only_post_to_private_accounts`,
  `url_ownership_unverified`, `privacy_level_option_mismatch`, cota diária de
  usuários publicando atingida, e o erro de rate limit.
- **Cliente não auditado:** todo conteúdo sai **`SELF_ONLY`** e o app fica
  limitado a **5 usuários publicando por 24h**. Auditoria é o que libera
  visibilidade pública. (fonte: fontes/dev-content-sharing-diretrizes.md)
- **UX obrigatória (auditada):** nickname do criador visível; privacidade
  escolhida manualmente **sem default**; toggles de comentário/duet/stitch
  desligados por default (e desabilitados se o criador desabilitou); preview do
  conteúdo; título editável; declaração de Music Usage Confirmation no botão;
  **divulgação de conteúdo comercial** ("Your brand" → "Promotional content";
  "Branded content" → "Paid partnership", que não pode ser privado); envio só
  após consentimento expresso; poll de status. (fonte:
  fontes/dev-content-sharing-diretrizes.md)
- **Proibido marca d'água/logo promocional** no conteúdo postado — derruba
  conteúdo e conta. (fonte: fontes/dev-content-sharing-diretrizes.md)

### Display API — leitura de perfil e de vídeos

- Três endpoints: `/v2/user/info/` (perfil: open_id, avatar, display_name,
  bio, deep link), `/v2/video/list/` (últimos vídeos, paginado, ordenado por
  `create_time` desc, com métricas de like/comment/share/view) e
  `/v2/video/query/` (metadados por lista de IDs, também renova a validade da
  URL de capa). (fontes: fontes/dev-display-api-visao-geral.md,
  fontes/dev-display-api-inicio.md, fontes/dev-display-lista-videos.md)
- **É a via de leitura para relatório de cliente** — e é leitura, o que combina
  com a regra da casa "teste de acesso se faz com leitura".

### Webhooks

- O TikTok publica eventos (inclusive de publicação e de autorização) por
  webhook — a esteira não deve ficar em polling agressivo. (fonte:
  fontes/dev-webhooks.md)

### Marketing API — anúncio (TikTok API for Business)

O portal, que era **a maior lacuna** da biblioteca em 03/08, foi capturado em
06/08 por outro caminho de URL. O que a casa já tem em disco:

- **O que a Marketing API entrega:** Business Center (criar contas de anúncio
  em massa, gerenciar ativos), criativos, catálogo/TikTok Store, gestão de
  campanha em escala, públicos, regras de automação, **notificações em tempo
  real por webhook (inclusive status de revisão de anúncio e fadiga de
  criativo)** e relatórios multidimensionais. (fonte:
  fontes/business-marketing-api-visao-geral.md, fontes/business-marketing-api-sobre.md)
- **Autorização do anunciante:** o cliente autoriza o app da agência e a
  agência troca o `auth_code` por access token; `/oauth2/advertiser/get/` lista
  as contas de anunciante autorizadas. (fontes:
  fontes/business-marketing-api-autorizacao.md,
  fontes/business-oauth-access-token.md)
- **Estrutura:** campanha (`/campaign/create/`: objetivo, orçamento, tipo de
  compra) → grupo de anúncios (`/adgroup/create/`: posicionamento, público,
  orçamento, agendamento, meta de otimização, lance) → anúncio
  (`/ad/create/`: criativo, texto, CTA, identidade). (fontes:
  fontes/business-criar-campanha-guia.md, fontes/business-campanha-create.md,
  fontes/business-adgroup-create.md, fontes/business-ad-create.md)
- **Criativo:** vídeo sobe por `/file/video/ad/upload/` (formatos, tamanho,
  hash). (fonte: fontes/business-upload-video-anuncio.md)
- **Relatório:** `/report/integrated/get/` com dimensões, métricas e filtros —
  é daqui que sai o número que vai para o cliente. (fonte:
  fontes/business-relatorio-integrado.md)
- **Limites de taxa** documentados por app/anunciante/endpoint. (fonte:
  fontes/business-limites-de-taxa.md)
- **Spark Ads** (impulsionar post orgânico do cliente ou de criador como
  anúncio) exige código/autorização do post; pela API isso é a "TikTok post ad
  authorization". (fontes: fontes/ads-spark-ads.md,
  fontes/business-autorizacao-post-para-anuncio.md)
- O **índice completo dos endpoints v1.3** está em
  fontes/business-referencia-api.md.

### O contrato que rege tudo isso

- **TikTok Developer Terms of Service** (fonte: fontes/legal-termos-desenvolvedor.md):
  a licença é para desenvolver, manter e dar suporte ao próprio app; o TikTok
  **pode auditar o app e monitorar o uso** e o desenvolvedor não pode
  interferir nisso; é vedado usar os serviços para **publicidade/solicitação
  comercial não autorizada ou spam**, sublicenciar acesso a terceiro sem
  autorização escrita, ou fazer engenharia reversa.
- **Developer Data Sharing Agreement** (fonte:
  fontes/legal-acordo-compartilhamento-dados.md) rege o tratamento do dado de
  usuário que a integração puxar — leitura obrigatória antes de guardar
  qualquer dado de conta de cliente no banco desta casa.
- Violação encontrada em auditoria ou denúncia → **revogação imediata e ban
  permanente de integrações futuras da conta E da entidade de negócio**.
  (fonte: fontes/dev-diretrizes-desenvolvedor.md)

## (e) A ORDEM EM QUE A INTEGRAÇÃO DO TIKTOK DEVE NASCER

> Esta é a seção que o especialista do TikTok é dono. A ordem não é sugestão:
> cada passo existe porque o passo seguinte é bloqueado por mecanismo da
> plataforma se ele não estiver feito. **Nenhuma escrita acontece sem parecer
> deste especialista, em nenhum dos passos.**

**Passo 0 — Decidir o caminho, antes de qualquer código.**
Para o caso de uso desta casa (gerenciar a presença orgânica de contas de
clientes), o caminho desenhado pelo TikTok é a **Accounts API do portal
TikTok for Business**, não a Content Posting API — cujo guia de auditoria
rejeita ferramenta interna de agência. Decisão do Diretor + CEO, registrada em
`docs/decisoes.md`. (fontes: fontes/business-accounts-api-visao-geral.md,
fontes/dev-content-sharing-diretrizes.md)

**Passo 1 — Papelada que a plataforma exige antes do app existir.**
Privacy Policy e Terms of Service **publicados em domínio próprio**, mais a URL
Web do produto — os três precisam de **verificação de propriedade** (domínio ou
prefixo com arquivo de assinatura). Sem isso, a submissão não anda. Em
paralelo: criar a organização dona do app e, para a Accounts API, preencher o
**Accounts API Access Application Form** (obrigatório desde 20/03/2026).
(fontes: fontes/dev-criar-app.md, fontes/business-accounts-api-visao-geral.md)

**Passo 2 — Registrar o app e desenvolver em Sandbox, sem tocar em conta real.**
Registrar o app, adicionar os produtos e pedir os escopos (incluindo "TikTok
Accounts"), configurar as redirect URLs (terminando com `/`, uma ativa por
vez) e o logo. Segredo (`client_secret`) **nunca no repositório** — Railway ou
cofre cifrado. Todo teste de acesso é **leitura** (Display API / insights):
nada de sondagem create/delete. (fontes: fontes/dev-criar-app.md,
fontes/business-accounts-api-autorizacao.md)

**Passo 3 — Construir a UX auditável antes de construir o automatismo.**
`creator_info` antes de cada post; privacidade escolhida à mão, sem default;
toggles desligados por default; preview; título editável; Music Usage
Confirmation no botão; divulgação comercial (`brand_content_toggle` /
`brand_organic_toggle`); rótulo AIGC (`is_aigc`) quando houver IA; envio só
após consentimento expresso; leitura de status por `status/fetch` ou webhook.
Sem marca d'água nem logo promocional no conteúdo. (fontes:
fontes/dev-content-sharing-diretrizes.md,
fontes/dev-content-posting-direct-post.md, fontes/dev-webhooks.md)

**Passo 4 — Ligar em SOMBRA, com um cliente, em modo privado/rascunho.**
Primeiro post real sai como rascunho ou `SELF_ONLY`, com o teto de 5
usuários/24h assumido como projeto, respeitando 6 req/min por token e ~15
posts/dia por conta. A escada da casa vale: sombra → evidência → subida.
(fontes: fontes/dev-content-sharing-diretrizes.md,
fontes/dev-content-posting-direct-post.md)

**Passo 5 — Submeter à revisão/auditoria e tratar como calendário, não código.**
Explicar produto e escopo em detalhe, gravar o vídeo demo ponta a ponta (até 5,
50 MB cada), submeter e aguardar — **sem prazo oficial nem garantia**. Só a
aprovação libera visibilidade pública. Nada de prometer publicação pública ao
cliente antes disso. (fontes: fontes/dev-criar-app.md,
fontes/dev-diretrizes-desenvolvedor.md)

**Passo 6 — Anúncio é trilha separada, e só depois.**
OAuth de anunciante → `/oauth2/advertiser/get/` → campanha → grupo → anúncio →
`/report/integrated/get/`, com Spark Ads exigindo autorização do post. Cada
peça passa antes pelo checklist de indústria (com o recorte do Brasil) e de
landing page desta cartilha. (fontes:
fontes/business-marketing-api-autorizacao.md,
fontes/business-criar-campanha-guia.md, fontes/business-relatorio-integrado.md,
fontes/business-autorizacao-post-para-anuncio.md)

## (f) Processo de recurso

- **Anúncio rejeitado:** o motivo aparece no prompt de rejeição nas listas de
  Ad Group/Ad da aba Campaign do Ads Manager. (fonte: fontes/ads-revisao-faq.md)
- **Reenviar para revisão:** salvar/editar o criativo dispara nova revisão
  automática (~24h); ou abrir ticket no Advertiser Support. Mudança só na
  landing page **não** dispara re-revisão. (fonte: fontes/ads-revisao-faq.md)
- Existem **One Click Appeal**, cota de appeals e appeal de conta no Ads
  Manager. Pela API há `/adgroup/review_info/` e `/adgroup/appeal/`. (fontes:
  fontes/ads-revisao-faq.md, fontes/business-referencia-api.md)
- **Conta/conteúdo orgânico:** a punição pode ser contestada pelos canais do
  app; criar conta nova para contornar é proibido e agrava. (fonte:
  fontes/cg-integridade-autenticidade.md)

## Lacunas da biblioteca (declaradas, não escondidas)

Medidas na captura de **06/08/2026** (`node scripts/biblioteca/capturar.mjs tiktok`):
**77 fontes no manifesto, 62 capturadas, 15 falhas.**

| Lacuna | Motivo | Mitigação |
|---|---|---|
| `ads-criativos-landing-page`, `ads-industrias-visao-geral`, `ads-industrias-america-latina` | Em 06/08 o help center do TikTok passou a devolver só o menu (288–490 caracteres úteis) ao headless | **As cópias de 03/08 continuam no repositório** e seguem válidas como índice; o conteúdo real por indústria foi capturado nos artigos-filhos |
| `musica-biblioteca-comercial` | Mesma degradação do help center (798 caracteres úteis) | **Cópia de 03/08 no repositório**; a regra operacional está confirmada em `musica-como-usar.md` |
| `ads-industria-alcool` | Timeout de 60 s nesta rodada | Capturado com sucesso mais cedo no mesmo dia; retentar na rotina diária |
| `ads-estrutura-campanha` (TikTok Ads Structure) | Página é quase só tabela — 1.164 caracteres úteis, abaixo do piso de 1.200 do capturador | Estrutura campanha→grupo→anúncio está coberta por `business-criar-campanha-guia.md` e pelos endpoints |
| `dev-escopos-lista` (lista de escopos), `dev-rate-limit`, `dev-display-perfil`, `dev-display-consulta-videos`, `business-lista-anunciantes`, `business-accounts-api-inicio` | Páginas de referência que são tabela pura; ficam abaixo do piso de conteúdo útil do capturador | Conteúdo equivalente coberto pelas páginas-guia (`dev-escopos-visao-geral`, `dev-display-api-visao-geral`, `business-limites-de-taxa`); conferir na fonte viva antes de fixar limite numérico em código |
| `legal-music-usage-confirmation` | Página legal curta (375 caracteres úteis) | O texto exigido na UX está citado em `dev-content-sharing-diretrizes.md` |
| `business-api-marketing-inicio` (get started do portal) | Continua quase vazio ao headless | **Fechada na prática**: `business-marketing-api-visao-geral`, `business-referencia-api` e os endpoints foram capturados |
| `conta-comercial` (support.tiktok.com) | O help center do consumidor só entrega menu ao headless (3 rodadas) | Regra relevante confirmada em `musica-como-usar.md` e `business-accounts-api-visao-geral.md` |

### Mudanças detectadas em 06/08/2026

- `ads-formato-funcionalidade` — hash mudou desde 03/08; o diff é a remoção de
  uma linha de rodapé ("Was the information helpful?"). **Sem mudança de
  política.**
- `ads-industria-servicos-financeiros`, `ads-industria-saude-farmaceutico`,
  `ads-configurar-campanha` — hash mudou entre duas capturas do **mesmo dia**;
  são páginas com acordeão/tabela que renderizam de forma variável. **Sem
  mudança de política confirmada** — sinalizado aqui para que a rotina diária
  não trate como novidade.

> Manutenção: `node scripts/biblioteca/capturar.mjs tiktok` re-captura tudo e
> acusa mudanças por hash; `--diff` só relata. Política de plataforma muda sem
> aviso — re-rodar antes de qualquer decisão de risco, e tratar todo "MUDOU"
> antes de emitir parecer.

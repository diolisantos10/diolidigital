# CHANGELOG da biblioteca de plataformas

Uma linha por mudança detectada na recaptura diária. Formato:
`AAAA-MM-DD · plataforma/slug · o que mudou (uma frase)`.

## 2026-08-06

- `google/*` · Manifesto ampliado de 21 para 76 fontes por ordem do CEO
  (absorver o máximo de conhecimento público): entram Business Profile APIs
  (visão geral, setup das 8 APIs, OAuth, contas, locais, avaliações, posts,
  fotos, atributos, verificação, cotas, Pub/Sub), Google Ads API (primeiros
  passos, token de desenvolvedor, projeto OAuth, escopos, seleção de conta,
  campanhas, entidades, GAQL, relatórios, erros comuns, solução de problemas,
  cotas, T&C), GA4 (Data API, fundamentos, cotas, Admin API, Measurement
  Protocol, PII, consentimento), OAuth do Google (visão geral, servidor web,
  escopos, escopos restritos, verificação de app, política de dados do usuário)
  e políticas (conteúdo inadequado, requisitos legais, coleta de dados,
  verificação do anunciante, conteúdo proibido do Perfil, perfis suspensos,
  verificação, denúncia de avaliações, atributos). 71 capturadas com sucesso.
- `google/ads-politicas-visao-geral` · Conteúdo mudou desde 03/08 (hash novo).
- `google/ads-editorial` · Conteúdo mudou desde 03/08 (hash novo).
- LACUNA `google/business-profile-conteudo-proibido` · seções recolhidas, 831
  caracteres úteis (piso 1.200) — não gravada.
- LACUNA `google/ads-api-codigos-de-erro` · referência RPC é tabela de linhas
  curtas, 558 caracteres úteis; URL fixada na v21 — não gravada.
- LACUNA `google/analytics-admin-api-cotas` · página curta, 1.180 caracteres
  úteis — não gravada.
- LACUNA `google/analytics-politicas-hub` · 651 caracteres úteis (2º dia).
- LACUNA `google/maps-conteudo-proibido` · 693 caracteres úteis (2º dia).
- Lacunas FECHADAS: rate limits do Business Profile API e Termos e Condições da
  Google Ads API.

**Expansão do manifesto da Meta por ordem do CEO: 22 → 97 fontes; 90 capturadas.**

- `meta/*` · manifesto ampliado de 22 para 97 fontes: Marketing API (referência
  de campanha/conjunto/anúncio/criativo, insights, lances, categorias
  especiais, erros, limites, versionamento), Graph API (versionamento, tokens,
  debug_token, erros, lotes, segurança), Business Management (usuários do
  sistema, atribuição de ativos), Instagram (visão geral, insights, comentários,
  mensagens, webhooks, limite de publicação), Pages API, Webhooks, Conversions
  API, Meta Pixel e WhatsApp Cloud API.
- `meta/marketing-api-limites-de-taxa` · **NOVO e crítico**: a Marketing API tem
  limite PRÓPRIO por pontuação (leitura=1, escrita=3; máx. 60 em Acesso
  Limitado, 9.000 em Acesso Total; decaimento 300 s), excluído dos limites da
  Graph API. Corrige o número que a cartilha usava.
- `meta/marketing-api-nivel-de-acesso-maio-2026` · **NOVO**: em 04/05/2026 a
  Meta renomeou "Ads Management Standard Access" para "Marketing API Access
  Tier"; Standard→Limited, Advanced→Full; limite de qualificação caiu de 1.500
  para 500 chamadas em 15 dias, erro < 15% nas últimas 500.
- `meta/app-modos-dev-vs-live` · **NOVO**: modo do app decide QUEM pode usá-lo
  (usuários com função vs. qualquer pessoa), não se o dado é real — chamadas em
  qualquer nível vão contra PRODUÇÃO.
- `meta/app-review-processo` · **NOVO**: App Review é obrigatório quando o app
  serve pessoas sem função nele; a Meta testa o app e rejeita o envio inteiro
  se não conseguir acessá-lo.
- `meta/tokens-de-acesso` · **NOVO**: cinco tipos de token; usuário do sistema é
  o indicado para automação (e o Acesso Limitado só permite 1).
- LACUNAS FECHADAS: `pi-de-terceiros`, `app-review-processo`,
  `whatsapp-diretrizes-de-mensagens` (`whatsapp.com/legal/messaging-guidelines`),
  `instagram-insights-de-usuario`, `instagram-insights-de-midia`.
- MUDANÇA DETECTADA em 7 fontes já existentes (texto reescrito pela Meta desde
  03/08): `praticas-comerciais-inaceitaveis`,
  `fraudes-golpes-praticas-enganosas`, `atributos-pessoais`,
  `integridade-da-conta`, `comunidade-spam`,
  `comunidade-comportamento-inautentico`, `praticas-discriminatorias`. Nenhuma
  mudança de regra operacional identificada na releitura — variação de
  formatação/rodapé da página.
- **LACUNAS DATADAS 06/08/2026 (7 capturas falharam, seguem no manifesto para
  retentativa):**
  - `meta/app-review-fluxo-de-envio` — casca vazia (28 caracteres); SPA
    `/documentation/` não hidrata no capturador.
  - `meta/marketing-api-objetivos-outcome` — casca vazia (28 caracteres).
  - `meta/marketing-api-insights-parametros` — casca vazia (28 caracteres).
  - `meta/marketing-api-insights-metricas` — casca vazia (28 caracteres).
  - `meta/whatsapp-politica-desenvolvedor` — casca vazia (28 caracteres).
  - `meta/graph-api-changelog` — 1.104 caracteres úteis (índice por aba), abaixo
    do mínimo de 1.200. **Consequência: a biblioteca não responde hoje "o que
    mudou na versão X da Graph API".**
  - `meta/business-manager-api` — 1.057 caracteres úteis (página-índice).
- Ferramenta: `capturar.mjs` ganhou `--slug=a,b,c` para retentar fontes
  isoladas sem varrer o manifesto inteiro (~35 min com 97 fontes).
- **ALERTA DE PROCESSO:** entre 03/08 e 05/08 não houve nenhuma linha neste
  CHANGELOG. Não existe rotina agendada de recaptura em lugar nenhum do
  repositório (nem workflow do GitHub, nem cron) — ver o relato do dia.

## 2026-08-06

- `tiktok` · **Expansão do manifesto por ordem do CEO (05/08): de 18 para 77
  fontes; 62 capturadas com sucesso, 15 lacunas datadas.** Entram: registro e
  revisão de app, Login Kit/OAuth/escopos, Content Posting API completa
  (direct post, rascunho, creator_info, upload, foto, status, transferência de
  mídia), Display API, **Accounts API (Organic API) do portal de business**,
  Marketing API (autorização, campanha, grupo, anúncio, criativo, relatório,
  limites de taxa, Spark Ads), Developer Terms of Service, Data Sharing
  Agreement, Branded Content Policy e os artigos por indústria com o recorte
  do **Brasil** (financeiro, saúde, jogo, álcool, emagrecimento, adulto,
  política, PI).
- `tiktok/business-*` · **Lacuna do portal da Marketing API FECHADA** — o
  portal captura pelo caminho `/portal/docs/<guia>/v1.3` e `/portal/docs?id=…`
  (a URL antiga de "get started" continua vazia ao headless).
- `tiktok/ads-praticas-enganosas` · **Lacuna FECHADA** — a página de Deceptive
  Practices, que dava timeout em 03/08, foi capturada.
- `tiktok/ads-industria-*` · **Lacuna do detalhe por indústria para o Brasil
  FECHADA** — Brasil aparece nominalmente nos artigos de serviços financeiros
  (exige licença local + 18+) e de jogo (cassino online só com aprovação de
  representante comercial do TikTok).
- `tiktok` · **LACUNA NOVA (regressão do help center):**
  `ads-criativos-landing-page`, `ads-industrias-visao-geral`,
  `ads-industrias-america-latina` e `musica-biblioteca-comercial` pararam de
  ser capturáveis (o `ads.tiktok.com/help` passou a devolver só o menu ao
  headless). As cópias de 03/08 seguem no repositório e continuam citáveis.
  `ads-industria-alcool` falhou por timeout nesta rodada (capturada mais cedo
  no mesmo dia).
- `tiktok` · **LACUNA NOVA (piso do capturador):** `ads-estrutura-campanha`,
  `dev-escopos-lista`, `dev-rate-limit`, `dev-display-perfil`,
  `dev-display-consulta-videos`, `business-lista-anunciantes` e
  `business-accounts-api-inicio` são páginas de tabela pura e ficam abaixo do
  piso de 1.200 caracteres úteis — não gravadas, declaradas na cartilha.
- `tiktok/conta-comercial` · Lacuna de 03/08 **persiste** (support.tiktok.com
  só entrega menu ao headless; 3ª rodada consecutiva).
- `tiktok/ads-formato-funcionalidade` · Hash mudou desde 03/08 — diff é
  remoção de linha de rodapé, **sem mudança de política**.
- `tiktok/cartilha.md` · Reescrita. Achado que muda o plano: a **Accounts API
  autoriza explicitamente** "gerenciar a presença orgânica de contas próprias
  de marcas/criadores, incluindo publicar posts" — o caso de uso de agência
  que a auditoria da Content Posting API rejeita. A ordem de nascimento da
  integração passa a começar pelo portal de business, não pelo TikTok for
  Developers. Exige o Accounts API Access Application Form (obrigatório desde
  20/03/2026).

## 2026-08-03

- Biblioteca criada por ordem do CEO, no dia da restrição da conta de anúncios
  da Meta. Primeira captura completa das três plataformas.

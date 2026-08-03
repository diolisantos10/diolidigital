# Cartilha do TikTok — o que pode, o que não pode, e como se integra

> Escrita em 03/08/2026, no dia em que a Meta restringiu a conta de anúncios da
> agência e o CEO ordenou especialistas-trava para as 3 grandes plataformas.
> O TikTok **ainda não tem integração nenhuma** neste sistema — esta cartilha
> nasce ANTES do código, de propósito, para que a integração já nasça dentro
> das regras. Toda afirmação relevante cita o documento oficial capturado em
> `docs/plataformas/tiktok/fontes/`. O que não foi capturado está declarado em
> "Lacunas da biblioteca", no fim.

---

## (a) O que derruba conta — spam, automação, engajamento falso

A regra do TikTok é explícita e é exatamente o tipo de coisa que derrubou a
conta da Meta hoje:

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
- As Diretrizes da Comunidade valem para **tudo e todos** na plataforma —
  inclusive anúncio e conteúdo de marca. (fonte: fontes/cg-visao-geral.md)

**Tradução para esta casa:** publicar por API em ritmo de máquina, replicar o
mesmo conteúdo em várias contas, ou "testar" criando e apagando — no TikTok
isso é ban com previsão de banimento das contas seguintes. O mesmo padrão que
derrubou a Meta hoje derruba o TikTok amanhã.

## (b) O que reprova anúncio — indústrias, criativo, landing page

Todo anúncio passa por revisão (tipicamente ~24h) antes de veicular. Motivos de
rejeição incluem violar as políticas de criativo/landing page ou promover
indústria proibida/restrita. (fonte: fontes/ads-revisao-faq.md)

### Indústrias proibidas e restritas

- O que é proibido/restrito **varia por país**. O índice oficial das políticas
  por indústria (Adult Content, Alcohol, Dangerous Products, Financial
  Services, Gambling and Games, Healthcare and Pharmaceuticals, Weight
  Management and Body Image etc.) está em (fonte:
  fontes/ads-industrias-visao-geral.md) e, para a América Latina/Brasil, em
  (fonte: fontes/ads-industrias-america-latina.md).
- **Atenção:** essas duas páginas hoje são **índices** — o TikTok reorganizou as
  regras em um artigo por indústria. O detalhe por indústria para o Brasil NÃO
  está capturado na biblioteca (ver Lacunas). Antes de anunciar em setor
  sensível (financeiro, saúde, bebida, jogo, emagrecimento), o especialista
  DEVE abrir o artigo da indústria na fonte viva.

### Criativo

- **Promessa exagerada ou absoluta reprova:** "não permitimos que o conteúdo do
  anúncio use termos absolutos sobre um produto em relação a tempo, região ou
  marca" — exemplos vetados: "Get slim legs right away", "Get money in 10
  seconds", cura de doença incurável, "Number 1 on TikTok". (fonte:
  fontes/ads-conteudo-enganoso-falso.md)
- **Antes-e-depois é vetado** (comparação de efeito de produto que distorce o
  resultado), assim como comparação maliciosa ou subjetiva com marca
  concorrente nomeada. (fonte: fontes/ads-conteudo-enganoso-falso.md)
- **Clickbait de elemento falso reprova:** botão de play falso, botão de fechar
  falso, indicador de carrossel que não funciona, CTA falso. Todo elemento
  interativo do anúncio deve funcionar de verdade. (fonte:
  fontes/ads-conteudo-enganoso-falso.md)
- **Inconsistência anúncio × landing page reprova:** produto A no vídeo e
  produto B no site, desconto de 50% no anúncio e 30% no site, promoção
  anunciada que não existe na página. (fonte: fontes/ads-conteudo-enganoso-falso.md)
- **IA generativa em anúncio exige rótulo AIGC** (ou disclaimer/marca d'água
  claro) quando a mídia é significativamente gerada/alterada por IA; IA não
  declarada = anúncio rejeitado ou restringido. Uso de imagem/voz de figura
  pública sem permissão é vetado. (fonte: fontes/ads-conteudo-enganoso-falso.md)
- **Só existe anúncio em VÍDEO no TikTok** (imagem estática só nos News Feed
  Apps), com duração entre **5 segundos e 10 minutos**. (fonte:
  fontes/ads-revisao-faq.md)
- Requisitos técnicos de formato/funcionalidade (qualidade, clareza,
  redirecionamento) em (fonte: fontes/ads-formato-funcionalidade.md).

### Landing page

- Deve ser **funcional na rede do mercado-alvo**; reprova: página expirada, em
  construção, incompleta, não mobile-friendly, que baixa arquivo
  automaticamente, ou com alta proporção de anúncio sobre conteúdo original.
  (fonte: fontes/ads-formato-funcionalidade.md)
- E-commerce e serviço financeiro devem exibir **dados válidos da empresa**
  (dono do site, políticas, preço em moeda local, termos, licenças). (fonte:
  fontes/ads-landing-page-checklist.md)
- **Não pode exigir informação sensível** para acessar (documento, dado
  financeiro, saúde, biometria) e **não pode exibir produto proibido** — mesmo
  que o anúncio em si seja de produto permitido. (fonte:
  fontes/ads-landing-page-checklist.md)
- Idioma da página deve ser aceito no país-alvo; página sem Política de
  Privacidade pedindo dado pessoal reprova. (fonte: fontes/ads-revisao-faq.md)

### Veiculação (contratos de reserva)

- A Ad Serving Policy rege pedidos de reserva: cancelamento unilateral perto da
  data de veiculação gera multa de 50% a 100% do valor — relevante se a agência
  um dia comprar mídia de reserva. (fonte: fontes/ads-politica-de-veiculacao.md)

## (c) Música — a pegadinha clássica de agência

- **Conta comercial NÃO pode usar a biblioteca geral de música.** "Businesses
  cannot use the general music library for commercial usage." A música de trend
  que toca no vídeo orgânico de criador **não pode** em conteúdo de negócio —
  nem orgânico, nem anúncio, nem branded content, **nem duet/react/stitch**.
  (fonte: fontes/musica-biblioteca-comercial.md)
- O caminho certo é a **Commercial Music Library (CML)**: ~1 milhão de músicas
  pré-licenciadas, grátis para uso comercial. (fonte:
  fontes/musica-biblioteca-comercial.md)
- **O app já trava sozinho:** quem usa Business Account, ao tocar em "Add
  Sound", **só vê** sons da CML ("Commercial Sounds"); conta pessoal vê tudo.
  Filtre a CML por região da campanha — a licença é regional. (fonte:
  fontes/musica-como-usar.md)
- Som original de outro usuário ou som licenciado de terceiro em conteúdo
  comercial: o próprio TikTok manda consultar jurídico para garantir licença.
  (fonte: fontes/musica-biblioteca-comercial.md)
- Na integração via API, o consentimento é obrigatório na interface: o botão de
  publicar deve declarar "By posting, you agree to TikTok's Music Usage
  Confirmation". (fonte: fontes/dev-content-sharing-diretrizes.md)

**Regra da casa:** peça de cliente no TikTok só com som da CML (filtrada por
Brasil) ou trilha com licença própria documentada. "Está bombando no TikTok"
não é licença.

## (d) APIs — o mapa da integração futura

**Estado em 03/08/2026: NÃO existe nenhum código de TikTok neste sistema**
(nada em `lib/integrations/tiktok/`). Este é o caminho real, na ordem, tirado
das fontes oficiais.

### Orgânico — Content Posting API (TikTok for Developers)

Pré-requisitos para postar direto no perfil de um usuário (fonte:
fontes/dev-content-posting-inicio.md):

1. **App registrado** no TikTok for Developers, com o produto **Content
   Posting API** adicionado e a configuração **Direct Post** habilitada;
2. **Aprovação do escopo `video.publish`** para o app, E autorização do mesmo
   escopo pelo usuário-alvo (OAuth → access token + open ID);
3. Vídeo em formato suportado (MP4 + H.264) por upload local (`FILE_UPLOAD`)
   ou por URL de **domínio verificado** do app (`PULL_FROM_URL`); foto só por
   URL de domínio verificado;
4. Fluxo: `POST /v2/post/publish/creator_info/query/` (obrigatório antes de
   cada post) → `POST /v2/post/publish/video/init/` (ou
   `/v2/post/publish/content/init/` para foto) → upload → acompanhar via
   `POST /v2/post/publish/status/fetch/`.

**A restrição que define o cronograma — cliente não auditado** (fonte:
fontes/dev-content-sharing-diretrizes.md):

- **Todo conteúdo postado por app não auditado sai em modo PRIVADO
  (`SELF_ONLY`)** e o app fica limitado a **5 usuários postando por janela de
  24h**. Para postar público, o app precisa passar por **auditoria** que
  verifica conformidade com os Termos de Serviço. (também em:
  fontes/dev-content-posting-inicio.md)
- Mesmo auditado, há teto de criadores ativos/24h (conforme o formulário de
  auditoria) e **limite de ~15 posts por dia por conta de criador**,
  compartilhado entre todos os apps.
- **Uso pretendido:** a auditoria REJEITA "utility tool para subir conteúdo
  nas contas que você ou seu time gerencia" e app que copia conteúdo de outras
  plataformas. O app deve servir criadores autênticos postando conteúdo
  original, para público amplo. **Isso atinge em cheio o caso de uso de
  agência** — o desenho do app e a justificativa da auditoria precisam ser
  pensados com isso na mesa, antes de escrever código.
- **UX obrigatória (auditada):** exibir nickname do criador; privacidade
  escolhida manualmente **sem default**; toggles de comentário/duet/stitch
  desligados por default (e desabilitados se o criador desabilitou); preview
  do conteúdo; título editável; declaração de Music Usage Confirmation no
  botão; **divulgação de conteúdo comercial** ("Your brand" → rótulo
  "Promotional content"; "Branded content" → "Paid partnership", que não pode
  ser privado); envio só após consentimento expresso; poll de status.
- **Proibido marca d'água/logo promocional** no conteúdo postado — viola as
  diretrizes e pode derrubar conteúdo e conta.
- **`client_secret` é confidencial** — nunca em repositório ou projeto aberto.

**Processo de aprovação do app** (fonte: fontes/dev-diretrizes-desenvolvedor.md):

- Todo app que vai a Live é **revisado**; mudanças depois de aprovado podem
  exigir nova revisão. Usar **Sandbox** para versões incompletas/teste.
- Exigências: app funcionando durante a revisão, contas demo se pedirem,
  **Privacy Policy e Terms of Service publicados com propriedade de URL
  verificada**, dados completos e verdadeiros no perfil de desenvolvedor.
- **Não há prazo oficial nem garantia de aprovação** — a revisão é manual.
  Fator de calendário, não de código.
- Violação encontrada em auditoria ou denúncia → **revogação imediata e ban
  permanente de integrações futuras da conta E da entidade de negócio**.
  Respeitar limites de throttling; spam via API = ban.

**Ordem prática da integração orgânica (o que falta para existir):**

1. Decidir a entidade e o desenho do app à luz do "Intended Use" (risco de
   reprovação para ferramenta interna de agência — resolver ANTES);
2. Publicar Privacy Policy + ToS em domínio próprio e verificar URL;
3. Registrar o app, adicionar Content Posting API + Direct Post, desenvolver
   em Sandbox;
4. Implementar a UX auditável exatamente como o guia exige (sem defaults,
   creator_info antes de cada post, disclosure comercial, Music Confirmation);
5. Testar com até 5 usuários em `SELF_ONLY`;
6. Submeter a **auditoria** para liberar visibilidade pública;
7. Só então ligar a esteira de publicação — com trava de parecer deste
   especialista em cada escrita.

### Anúncio — Marketing API (TikTok API for Business)

- O portal oficial (`business-api.tiktok.com/portal/docs`) **não pôde ser
  capturado** (ver Lacunas) — o que segue é o mínimo confirmado pelas fontes
  secundárias oficiais e DEVE ser conferido na fonte viva antes de codar.
- Caminho conhecido: criar app de desenvolvedor no portal TikTok API for
  Business, obter aprovação, e autorizar via OAuth a conta de anunciante
  (advertiser) do cliente para receber access token — análogo ao fluxo da Meta.
- A revisão de anúncio, os limites e as políticas das seções (b) valem
  integralmente para qualquer anúncio criado por API. (fonte:
  fontes/ads-revisao-faq.md)

## (e) Processo de recurso

- **Anúncio rejeitado:** o motivo aparece no prompt de rejeição nas listas de
  Ad Group/Ad da aba Campaign do Ads Manager. (fonte: fontes/ads-revisao-faq.md)
- **Reenviar para revisão:** (1) salvar/editar o criativo dispara nova revisão
  automática (~24h); ou (2) abrir ticket no Advertiser Support pedindo
  re-análise — "our team will handle the wrongly rejected cases". (fonte:
  fontes/ads-revisao-faq.md)
- Mudança só na landing page **não** dispara re-revisão de anúncio já
  reprovado — é preciso mexer no anúncio ou abrir ticket. (fonte:
  fontes/ads-revisao-faq.md)
- Existem mecanismos de **One Click Appeal** para anúncio, **cota de appeals**
  e **appeal de conta** no Ads Manager (artigos "Ad content appeals quota
  strategy" e "How to submit an account appeal" listados no índice oficial —
  não capturados em detalhe, ver Lacunas). (fonte: fontes/ads-revisao-faq.md)
- **Conta/conteúdo orgânico:** a punição por comportamento enganoso pode ser
  contestada pelos canais do app; criar conta nova para contornar é proibido e
  agrava. (fonte: fontes/cg-integridade-autenticidade.md)

## Lacunas da biblioteca (declaradas, não escondidas)

| Lacuna | Motivo | Mitigação |
|---|---|---|
| **Marketing API (business-api.tiktok.com/portal/docs)** | O portal devolve página vazia (0 caracteres) ao Chromium headless em 3 URLs testadas — SPA bloqueia captura | Seção (d)/anúncio marcada como "conferir na fonte viva"; retentar captura, ou capturar logado |
| **Deceptive Practices (ads.tiktok.com/help/article/tiktok-ads-policy-deceptive-practices)** | Timeout de 60s persistente em 3 tentativas | Boa parte do conteúdo coberto por `ads-conteudo-enganoso-falso.md`; retentar |
| **Detalhe por indústria para o Brasil** (Financial Services, Healthcare, Alcohol, Gambling etc.) | As páginas de "Industry Entry" viraram índices; os artigos-filhos não foram capturados nesta rodada | Antes de anunciar setor sensível, capturar o artigo da indústria específica |
| **Conta comercial (support.tiktok.com)** | O help center do consumidor só entrega o menu de navegação ao headless (2 URLs testadas, mesmo conteúdo) | A regra operacional relevante (Business Account → só Commercial Sounds) está confirmada em `musica-como-usar.md` |
| **Developer Terms of Service / Data Sharing Agreement** | Não capturados nesta rodada (linkados em `dev-diretrizes-desenvolvedor.md`) | Capturar antes de submeter o app à revisão |

> Manutenção: `node scripts/biblioteca/capturar.mjs tiktok` re-captura tudo e
> acusa mudanças por hash. Política de plataforma muda sem aviso — as fontes de
> anúncio capturadas foram atualizadas pelo TikTok entre 2024 e 2026; re-rodar
> antes de qualquer decisão de risco.

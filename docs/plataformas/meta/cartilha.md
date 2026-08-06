# Cartilha da Meta — manual operacional da Dioli Digital

> Destilada em 03/08/2026 e **ampliada em 06/08/2026** (a biblioteca saltou de
> 22 para 97 fontes no manifesto; 90 capturadas — Marketing API, Graph API,
> tokens, App Review, Business Management, Instagram, Webhooks, CAPI/Pixel e
> WhatsApp Cloud API entraram) a partir dos documentos oficiais capturados em
> `docs/plataformas/meta/fontes/` (cada arquivo tem URL, data e hash).
> **Esta cartilha é resumo de trabalho; em caso de dúvida ou decisão de risco,
> vale o documento capturado — e, acima dele, a página oficial da Meta.**
> Contexto que a motivou: em 03/08/2026 a conta de anúncios da agência foi
> RESTRINGIDA por "automação que não segue as regras" (operação por API em
> ritmo de máquina, app em modo de desenvolvimento).

---

## Mapa da biblioteca (o que existe em `fontes/`, por família)

Toda a lista viva está em `fontes.json`. Resumo para achar rápido:

- **Política de anúncio e conta:** `padroes-de-publicidade`,
  `praticas-comerciais-inaceitaveis`, `atributos-pessoais`,
  `praticas-discriminatorias`, `pi-de-terceiros`,
  `fraudes-golpes-praticas-enganosas`, `comunidade-spam`,
  `comunidade-comportamento-inautentico`, `integridade-da-conta`,
  `analise-de-anuncios`, `qualidade-da-conta`, `recorrer-de-restricao`,
  `termos-da-plataforma`.
- **App, permissões e review:** `app-review-processo`, `app-review-publicacao`,
  `app-modos-dev-vs-live`, `app-criacao-e-tipos`, `verificacao-de-negocio`,
  `manutencao-de-acesso-a-dados`, `permissoes-referencia`.
- **Graph API e tokens:** `graph-api-visao-geral`, `graph-api-primeiros-passos`,
  `graph-api-versionamento`, `graph-api-limites-de-taxa`,
  `graph-api-tratamento-de-erros`, `graph-api-requisicoes-seguras`,
  `graph-api-lotes`, `graph-api-resultados-e-paginacao`,
  `graph-api-debug-token`, `tokens-de-acesso`, `tokens-longa-duracao`,
  `login-seguranca`.
- **Marketing API:** `marketing-api-visao-geral`, `marketing-api-boas-praticas`,
  `marketing-api-primeiros-passos`, `marketing-api-autorizacao-e-niveis`,
  `marketing-api-nivel-de-acesso-maio-2026`,
  `marketing-api-estrutura-de-campanha`, `marketing-api-referencia-campanha`,
  `marketing-api-referencia-conjunto`, `marketing-api-referencia-anuncio`,
  `marketing-api-referencia-criativo`,
  `marketing-api-referencia-conta-de-anuncios`,
  `marketing-api-imagens-de-anuncio`, `marketing-api-criativo-guia`,
  `marketing-api-lances`, `marketing-api-categoria-especial`,
  `marketing-api-publicos-personalizados`, `marketing-api-insights`,
  `marketing-api-insights-recortes`, `marketing-api-insights-limites`,
  `marketing-api-limites-de-taxa`, `marketing-api-erros`,
  `marketing-api-requisicoes-assincronas`, `marketing-api-regras-automatizadas`,
  `marketing-api-versionamento`, `marketing-api-mudancas-fora-de-ciclo-2026`,
  `marketing-api-anuncios-de-cadastro`.
- **Business Management:** `business-management-apis`,
  `business-usuarios-de-sistema`, `business-atribuicao-de-ativos`.
- **Instagram:** `instagram-visao-geral`, `instagram-publicacao-de-conteudo`,
  `instagram-limite-de-publicacao`, `instagram-insights`,
  `instagram-insights-de-usuario`, `instagram-insights-de-midia`,
  `instagram-moderacao-de-comentarios`, `instagram-mensagens`,
  `instagram-webhooks`.
- **Páginas e webhooks:** `pages-api-visao-geral`,
  `pages-api-primeiros-passos`, `pages-api-publicacoes`,
  `webhooks-visao-geral`, `webhooks-primeiros-passos`, `webhooks-instagram`,
  `webhooks-referencia-pagina`.
- **Medição:** `conversions-api`, `conversions-api-primeiros-passos`,
  `conversions-api-parametros`, `meta-pixel`, `meta-pixel-primeiros-passos`.
- **WhatsApp:** `whatsapp-politica-de-mensagens`,
  `whatsapp-diretrizes-de-mensagens`, `whatsapp-cloud-api-visao-geral`,
  `whatsapp-cloud-api-primeiros-passos`, `whatsapp-envio-de-mensagens`,
  `whatsapp-modelos`, `whatsapp-webhooks`, `whatsapp-precos`.

> ⚠️ **Aviso de tradução que a própria Meta imprime nas páginas em pt-BR:**
> "Esta página foi traduzida do inglês usando IA. O conteúdo traduzido pode
> conter erros, omissões ou divergências de sentido." Em decisão de risco,
> confira a versão em inglês na URL do cabeçalho do arquivo.

---

## (a) O que derruba a CONTA — integridade, automação e ritmo

**A Meta restringe ou remove contas que violam políticas "de forma
significativa ou persistente", usando sistemas automatizados e manuais.**
Ativos de negócios (conta de anúncios, Página, perfil) devem cumprir o Padrão
da Comunidade sobre Integridade da Conta — a punição não é só do anúncio, é do
ativo. (fonte: fontes/integridade-da-conta.md)

**Ritmo de máquina é violação de spam por si só.** O Padrão da Comunidade
proíbe "publicar, compartilhar, interagir com conteúdo ou criar contas,
Grupos, Páginas, Eventos ou outros ativos, manual ou automaticamente, **em
frequências muito elevadas**" — e a Meta pode restringir até contas de baixa
frequência quando há outros sinais de spam (conteúdo repetitivo) ou de
inautenticidade. Foi exatamente o padrão do nosso incidente: 36 uploads +
criação e exclusão de campanha em minutos. (fonte: fontes/comunidade-spam.md)

**Comportamento inautêntico** — usar ativos para "enganar a Meta ou nossos
usuários sobre a identidade ou origem" ou para "evadir-se do monitoramento" —
derruba redes inteiras de ativos de uma vez. Contas relacionadas (mesmo BM,
mesmo admin) caem juntas. (fonte: fontes/comunidade-comportamento-inautentico.md)

**Restrições possíveis quando a Meta vê "atividade incomum ou de alto risco":**
limite de gasto diário, perda de recursos de pagamento, perda de recursos de
publicidade, ou perda total da capacidade de anunciar. Também restringem por:
suspeita de conta hackeada, falta de autenticação de dois fatores, altas taxas
de falha/contestação de pagamento. (fonte: fontes/qualidade-da-conta.md)

**Números concretos de ritmo que a plataforma publica:**

| Limite | Valor oficial |
|---|---|
| Gerenciamento de anúncios (app em **development_access**) | **300 + 40 × anúncios ativos** chamadas/hora por conta | 
| Gerenciamento de anúncios (standard/advanced access) | 100.000 + 40 × anúncios ativos chamadas/hora |
| Insights de anúncios (development) | 600 + 400 × anúncios ativos − 0,001 × erros | 
| Insights de anúncios (advanced) | 190.000 + 400 × anúncios ativos |
| Graph API plataforma (token de app) | 200 × usuários ativos chamadas/hora |
| Publicação Instagram por API | **100 posts/24h por conta** (carrossel = 1 post) |
| WhatsApp Business Management API | 200 chamadas/hora por WABA (5.000/h com número registrado) |

(fonte: fontes/graph-api-limites-de-taxa.md; fonte: fontes/instagram-publicacao-de-conteudo.md)

> ⚠️ **CORREÇÃO de 06/08/2026 (fonte nova):** a Marketing API **não** usa a
> fórmula "300 + 40 × anúncios ativos" que a linha acima repetia da página de
> rate limiting da Graph API. Ela tem lógica PRÓPRIA, por PONTUAÇÃO, e está
> **excluída dos limites da Graph API**. Ver a seção (d) — é o número que
> realmente governa a nossa esteira de tráfego.
> (fonte: fontes/marketing-api-limites-de-taxa.md)

**Tradução para a nossa operação:** com conta fria e app em Acesso Limitado, o
teto formal já é baixo — mas o ban veio ANTES de qualquer rate limit, por
padrão de comportamento. O limite técnico não é a licença: é o teto de
emergência. Aquecimento (uma ação por vez, minutos entre escritas, volume
subindo ao longo de dias) continua sendo a regra da casa, por cima dos números
acima.

---

## (b) O que reprova ANÚNCIO — e pontua contra a conta

**Todo anúncio é analisado contra os Padrões de Publicidade antes de veicular,
e o comportamento do anunciante também conta:** os Padrões "fornecem orientação
sobre o comportamento do anunciante que pode resultar na imposição de
restrições" à conta empresarial e seus ativos. Reprovação repetida não é só
anúncio parado — é histórico. (fonte: fontes/padroes-de-publicidade.md)

### Atributos pessoais — a armadilha nº 1 para o nosso nicho

Anúncio **não pode afirmar nem sugerir** que o anunciante sabe atributos
pessoais do público: raça, etnia, religião, idade, orientação sexual,
identidade de gênero, deficiência, condição de saúde, **condição financeira
vulnerável**, antecedentes criminais ou o nome da pessoa. A regra pega o
"você/seu" ligado a um atributo. Exemplos oficiais:
- ✅ "Encontre solteiros negros hoje." / ❌ "Conheça **outros** negros solteiros!"
- ✅ "Encontre idosos" / ❌ "**Você** tem 18 anos?"
(fonte: fontes/atributos-pessoais.md)

**Aplicado ao nosso caso (donos de restaurante contra "o marketplace"):**
- ❌ "**Você está cansado** de pagar 30% pro marketplace?" — sugere conhecer a
  situação financeira do alvo ("você" + atributo/condição financeira).
- ❌ "Seu restaurante está **afundando** em taxas" — idem, e ainda é alegação
  sobre condição financeira vulnerável.
- ✅ "Restaurantes pagam até X% de taxa em marketplaces. Existe alternativa." —
  fala do mercado, não da pessoa. (aplicação nossa sobre a regra de
  fontes/atributos-pessoais.md)

### Práticas comerciais inaceitáveis e alegações enganosas

Anúncios não podem usar "declarações enganosas ou **exageradas** sobre o
sucesso de um produto ou serviço", nem prometer benefício financeiro por meio
de representação falsa. Anunciantes com comportamento suspeito podem ser
obrigados a passar por verificações adicionais. Para nós: promessa de
faturamento ("dobre suas vendas", "economize R$ 3.000/mês") sem sustentação é
reprovação — e número inventado é exatamente o que o perfil 100% IA desta casa
não pode deixar passar. (fonte: fontes/praticas-comerciais-inaceitaveis.md)

O Padrão da Comunidade correspondente proíbe enganar por "declaração falsa
intencional, informações roubadas e **alegações exageradas**" — vale para o
orgânico também, não só para anúncio pago. (fonte: fontes/fraudes-golpes-praticas-enganosas.md)

### Comparação com concorrente

Não há proibição genérica de citar concorrente nos documentos capturados — o
risco real está em (1) alegação comparativa exagerada/enganosa (práticas
inaceitáveis), (2) uso de marca de terceiro que viole propriedade intelectual
(os Padrões de Publicidade têm seção própria de violação de PI de terceiros,
não capturada em detalhe — ver Lacunas), e (3) tom que vire ataque. Anúncio
"agressivo contra o iFood" deve: não usar logo/marca deles na peça, não fazer
número comparativo sem fonte, e atacar a categoria ("marketplaces"), não
difamar a empresa nomeada. (fonte: fontes/padroes-de-publicidade.md;
fonte: fontes/praticas-comerciais-inaceitaveis.md)

### Práticas discriminatórias e categorias especiais

Proibido discriminar ou excluir grupos por atributos pessoais no
direcionamento ou no conteúdo. Anúncios de **emprego, moradia e serviços
financeiros** (EUA/Canadá/partes da Europa) exigem categoria especial de
anúncio com direcionamento restrito. Nosso nicho (restaurantes no Brasil)
raramente cai aqui, mas anúncio de "trabalhe conosco" para cliente entra na
regra de emprego. (fonte: fontes/praticas-discriminatorias.md)

---

## (c) Processo de análise e como recorrer (Qualidade da Conta)

**Como funciona a análise:** dispara automaticamente ao criar OU editar
anúncio; é principalmente automatizada, com analistas humanos em casos
específicos. Analisa imagem, vídeo, texto, **direcionamento, destino do
anúncio** (Página/site), categorias especiais e permissões do anunciante. Um
anúncio pode veicular antes de ser analisado contra todas as políticas e está
sujeito a **nova análise a qualquer momento** — e o **histórico de
conformidade do anunciante** pesa na decisão de analisar mais fundo.
(fonte: fontes/analise-de-anuncios.md)

**Edições que reiniciam a análise:** qualquer mudança de criativo (imagem,
texto, link, vídeo), de direcionamento, e mudanças de meta de otimização.
Mudança de lance, orçamento e conjunto **não** reinicia. Anúncio que entra em
análise pausado sai pausado. Operacionalmente: editar criativo de anúncio
aprovado = voltar para a fila. (fonte: fontes/marketing-api-boas-praticas.md)

**Como recorrer de restrição (o nosso caso hoje):**
1. Página Inicial do Suporte para Empresas (business.facebook.com/accountquality)
   → **Visão geral do status da conta** → selecionar a conta restrita →
   **"O que você pode fazer" → Pedir análise**. Só o admin da conta pode pedir.
2. Análise em geral concluída em **48 horas** (pode demorar mais).
3. **O número de pedidos de análise é limitado e a decisão final é
   definitiva** — não gastar o recurso com a conta ainda "suja": revisar o que
   causou a restrição antes de apelar.
4. Anúncios que rodavam antes da restrição **não religam sozinhos** quando a
   conta volta — reativar no Gerenciador.
(fonte: fontes/recorrer-de-restricao.md)

Restrição também pode ser branda e temporária (limite de gasto/dia, cobrança
mais frequente) enquanto a Meta "tem certeza de que está seguindo nossas
políticas de forma consistente" — ou seja: conta que volta, volta em
observação. (fonte: fontes/qualidade-da-conta.md)

---

## (d) Regras de API — ritmo, limites, modo do app, App Review

### ⭐ O número que governa a esteira: a PONTUAÇÃO da Marketing API

**A Marketing API tem lógica de limite própria e está EXCLUÍDA dos limites da
Graph API** — chamada de Marketing API não conta no balde da Graph. O limite é
por **conta de anúncios**, por pontuação, em janela deslizante:

| | Acesso Limitado (padrão) | Acesso Total (após análise) |
|---|---|---|
| Pontuação máxima | **60** | 9.000 |
| Decaimento | 300 s | 300 s |
| Bloqueio ao estourar | **300 s** | 60 s |

**Leitura = 1 ponto. Escrita = 3 pontos.** Ou seja: no nosso nível (Limitado),
**20 escritas** já estouram a cota e travam a conta por 5 minutos. As 36
imagens + campanha do incidente estavam muito acima disso.

Erros correspondentes: **17** (subcódigo 2446079, "User request limit reached")
e **613** (subcódigo 1487742, "too many calls from this ad-account").

Há ainda um limite **anti-rajada em tempo real**: **100 QPS por combinação de
app + conta de anúncios**, aplicado só às operações de **criação e edição** de
campanha, conjunto e anúncio — feito justamente para pegar picos curtos que a
janela normal não vê. (fonte: fontes/marketing-api-limites-de-taxa.md)

### Nível de acesso da Marketing API — o nome mudou em maio/2026

**Em 04/05/2026 a Meta renomeou "Ads Management Standard Access" (AMSA) para
"Marketing API Access Tier"**, e trocou os rótulos: *Standard Access* virou
**Limited Access (Acesso Limitado)** e *Advanced Access* virou **Full Access
(Acesso Total)**. Não é mudança quebradora — o identificador da permissão é o
mesmo e o nível existente foi preservado.
(fonte: fontes/marketing-api-nivel-de-acesso-maio-2026.md)

**Requisitos para subir para Acesso Total (revisados na mesma data, e agora
visíveis no próprio Painel de Apps):**
- **500+ chamadas** à Marketing API nos **últimos 15 dias** (antes eram 1.500);
- **taxa de erro < 15%** nas **últimas 500 chamadas** (janela deslizante, não
  mais período fixo);
- gravação de tela **não é mais exigida** no envio.

**O que o nível muda além da cota** (fonte:
fontes/marketing-api-autorizacao-e-niveis.md):

| | Acesso Limitado | Acesso Total |
|---|---|---|
| Volume | "extremamente limitado por conta de anúncio — **somente para desenvolvimento, não para apps em produção veiculando para anunciantes publicados**" | levemente limitado |
| Business Manager API | acesso limitado; **sem** administrar contas, permissões e Páginas | todas as APIs de BM e Catálogo |
| Usuários do sistema | **1** + 1 admin | **10** + 1 admin |
| Criar Página por API | não | não |

> **Consequência direta para a Dioli:** a própria Meta diz, com todas as
> letras, que o Acesso Limitado **não é para produção servindo anunciantes**.
> Rodar a esteira de tráfego de CLIENTES neste nível é operar fora do uso
> declarado. O caminho é acumular 500 chamadas legítimas em 15 dias com erro
> < 15% (leitura conta) e pedir o Acesso Total. Onde conferir o nível atual:
> **Painel de Apps > Análise do app > Permissões e recursos**.

### Modo de desenvolvimento vs. modo publicado — o que realmente trava

O modo do app decide **QUEM** pode usá-lo, não se o anúncio é real:

- **Modo de desenvolvimento:** o app só pode pedir permissões de **usuários com
  função no app** (Administrador, Desenvolvedor, Testador), e só permissões de
  nível padrão ou avançado. O app não aparece em busca nem na Central de Apps.
  Dados gerados aqui (posts de teste) ficam visíveis só para quem tem função —
  **e passam a ser visíveis para todos quando o app for publicado**.
- **Modo publicado (Ativo):** pode pedir permissões de **qualquer pessoa**, mas
  **somente as aprovadas na análise do app**.
- A troca é uma alternância na barra do Painel de Apps, feita por administrador
  — não existe API para isso.
(fonte: fontes/app-modos-dev-vs-live.md)

> **Correção importante ao entendimento anterior da casa:** "modo de
> desenvolvimento" **não** proíbe por si só uma escrita de anúncio real na
> conta do próprio dono do app. O que ele proíbe é operar em nome de gente
> **sem função no app** — que é exatamente o caso dos nossos CLIENTES. Para
> cliente, a exigência não é só o modo publicado: é o App Review das permissões.
> **As chamadas em QUALQUER nível de acesso são feitas contra dados de
> PRODUÇÃO** — não existe "modo de teste" implícito.
> (fonte: fontes/marketing-api-autorizacao-e-niveis.md)

### App Review — quando é obrigatório e o que reprova

- **Regra do gatilho:** se o app se destina a ser usado por pessoas **sem
  função nele (ou na empresa que o obteve)**, ele precisa passar pela análise.
  Se só é usado por quem tem função, a análise **não** é necessária.
- Permissões aprovadas podem ser pedidas de qualquer usuário; **não aprovadas,
  só de quem tem função**.
- **A Meta TESTA o app.** Se não conseguir acessá-lo, **o envio inteiro é
  rejeitado**. Se conseguir acessar mas não conseguir exercitar a
  funcionalidade que justifica a permissão pedida, **aquela permissão não é
  aprovada**.
- Processos independentes que podem ser exigidos conforme o tipo de app:
  **Verificação da empresa (Business Verification)**.
(fonte: fontes/app-review-processo.md; fonte: fontes/app-review-publicacao.md;
fonte: fontes/verificacao-de-negocio.md)

### Tipos de token — qual usar para quê

| Token | Para quê | Nota da casa |
|---|---|---|
| **App access token** (`{id}\|{secret}`) | ler/alterar **configurações do app** | é o que responde "em que modo o app está" sem adivinhação |
| **Token de usuário** | agir **em nome de uma pessoa**, com base em ação dela | é o que temos hoje no cofre; expira |
| **Token de Página** | ler/escrever dados de uma **Página** | obtido trocando um token de usuário |
| **Token de usuário do sistema** | **ações programáticas e automatizadas** em objetos de anúncio ou Páginas, **sem login e sem reautenticação** | é o token certo para uma esteira automatizada; exige Business Manager, e o Acesso Limitado só permite **1** usuário do sistema |
| **Token de cliente** | apps nativos/desktop | não é segredo; não usamos |
(fonte: fontes/tokens-de-acesso.md; fonte: fontes/business-usuarios-de-sistema.md)

> **Consequência:** a arquitetura atual (token de usuário do CEO, colado do
> Explorer, válido até 02/10/2026) é a arquitetura ERRADA para automação — a
> própria Meta indica usuário do sistema para isso. Migrar depende de Acesso
> Total (para ter mais de 1 usuário do sistema) e de Business Manager.
> Inspeção de token: `GET /debug_token` (fonte: fontes/graph-api-debug-token.md).

### O regime geral da Graph API (o resto da plataforma)

**Dois regimes de rate limit:** Platform (token de app/usuário) e **BUC —
Business Use Case** (Marketing API, Instagram, Páginas com token de
Página/sistema). Marketing API é sempre BUC, **por conta de anúncios**: todos
os endpoints do mesmo caso de uso compartilham a cota da conta — estourou num
endpoint, todos recebem erro. (fonte: fontes/graph-api-limites-de-taxa.md)

**O nível do app muda a cota em ordens de grandeza:** app novo nasce em
`development_access` / Acesso Limitado. A página de rate limiting da Graph API
ainda descreve o salto em termos de chamadas/hora (300+40×/h → 100.000+40×/h) e
ainda usa os nomes antigos `standard_access` / `advanced_access` no cabeçalho
`ads_api_access_tier` — **mas para a Marketing API o que vale é a pontuação da
seção acima (60 → 9.000)**. Onde as duas páginas divergirem, vale a de
limitação da Marketing API, que é a específica e a mais recente (05/05/2026).
(fonte: fontes/graph-api-limites-de-taxa.md; fonte: fontes/marketing-api-limites-de-taxa.md)

**Disciplina de operação que a própria Meta manda seguir:**
- **Atingiu o limite: PARE.** Continuar chamando aumenta a contagem e estende o
  bloqueio.
- **Espalhe as chamadas uniformemente** — nada de picos/rajadas.
- Monitore os cabeçalhos `X-App-Usage` / `X-Business-Use-Case-Usage`
  (`call_count`, `estimated_time_to_regain_access`, `ads_api_access_tier`).
- "É melhor criar um novo anúncio em vez de alterar os atuais."
- Erros de limite: código 4 (app), 17 (usuário), 32 (Página), 80004
  (ads_management), 80000 (insights), 613 (limite customizado).
(fonte: fontes/graph-api-limites-de-taxa.md)

**Teste sem tocar em objeto real:** o **modo sandbox** existe para ler e
gravar chamadas da Marketing API **sem veicular anúncios** — é o instrumento
oficial para o que tentamos fazer com create/delete real (que nos derrubou).
Limitação: sandbox não cria anúncio/criativo de verdade. Teste de acesso em
conta real se faz com leitura. (fonte: fontes/marketing-api-boas-praticas.md)

**Termos da Plataforma:** a Meta pode monitorar (de forma automatizada ou
manual), investigar e punir **a qualquer momento, com ou sem aviso** —
suspensão ou remoção permanente do app e da conta, corte de acesso à
plataforma e encerramento de acordos. A Meta tem o direito de auditar a
atividade do app. Automação fora das regras não arrisca só a conta de anúncios:
arrisca o app inteiro. (fonte: fontes/termos-da-plataforma.md)

**Publicação no Instagram por API:** máximo **100 posts por 24h por conta**
(aplicado no `POST /<IG_ID>/media_publish`; carrossel conta como 1). A seção
de carrossel menciona também um teto de 50 publicações/24h — na dúvida, tratar
50 como teto prudente. Uso corrente consultável em
`GET /<IG_ID>/content_publishing_limit`. Contêiner não publicado expira em
24h. Mídia precisa estar em servidor público. Conta vinculada a Página com PPA
(Autorização de Publicação na Página) não publica até a PPA ser concluída.
(fonte: fontes/instagram-publicacao-de-conteudo.md)

---

## (e) WhatsApp — política de mensagens

- **Opt-in obrigatório:** só se pode contatar alguém que (a) forneceu o número
  E (b) consentiu em receber mensagens/ligações. A responsabilidade legal pelo
  método de opt-in é da empresa (nós/cliente).
- **Janela de 24h:** resposta livre só dentro de 24h após a última mensagem do
  usuário; fora dela, **apenas Modelo de Mensagem aprovado** (a Meta analisa,
  pausa e recusa modelos a qualquer momento).
- **Automação é permitida dentro da janela**, mas com caminho de escalada
  humano claro e imediato: transferência para atendente, telefone, e-mail ou
  suporte web. Bot sem porta de saída humana viola a política.
- **Respeitar bloqueio/descadastro** feito dentro ou fora do WhatsApp; proibido
  confundir, enganar ou enviar spam.
- Proibido se passar por outra empresa ou deturpar a natureza do negócio;
  perfil comercial precisa de contato de suporte atualizado.
- Violação = limitação ou remoção do acesso aos Serviços do WhatsApp Business.
(fonte: fontes/whatsapp-politica-de-mensagens.md)

Ritmo administrativo: WhatsApp Business Management API aceita 200 chamadas/h
por WABA (5.000/h com número registrado); a Meta recomenda **webhooks** em vez
de polling para status de modelo/número. (fonte: fontes/graph-api-limites-de-taxa.md)

---

## Lacunas da biblioteca (honestidade acima de completude)

> **Rodada de 06/08/2026:** o manifesto foi de 22 para **97** fontes e **90**
> capturaram. As lacunas 1, 3, 4 e 6 da lista abaixo foram FECHADAS
> (PI de terceiros, App Review, Diretrizes do WhatsApp, Instagram Insights de
> conta e de mídia). As lacunas que restam, todas datadas de 06/08/2026, são as
> **7 fontes que falharam na captura** — listadas ao fim desta seção.

O que a cartilha **não** cobre com documento capturado:

1. ~~**Violação de propriedade intelectual de terceiros em anúncio**~~ —
   **FECHADA em 06/08/2026**: capturada em `fontes/pi-de-terceiros.md`.
2. **Páginas específicas de "Padrões de Publicidade → ativos de negócios"**
   (account-integrity, inauthentic-behavior, spam em
   `.../ad-standards/business-assets/...`): são páginas-casca de ~1.000
   caracteres que apenas remetem aos Padrões da Comunidade — abaixo do mínimo
   de 1.500 do capturador. Capturamos os Padrões da Comunidade completos no
   lugar (integridade-da-conta, comunidade-spam,
   comunidade-comportamento-inautentico).
3. ~~**Detalhe do processo de App Review / permissões avançadas**~~ —
   **FECHADA em 06/08/2026**: `fontes/app-review-processo.md`,
   `fontes/app-review-publicacao.md`, `fontes/app-modos-dev-vs-live.md`,
   `fontes/permissoes-referencia.md`, `fontes/verificacao-de-negocio.md`,
   `fontes/marketing-api-autorizacao-e-niveis.md`. **Ressalva:** o passo a passo
   do FORMULÁRIO de envio (`/documentation/development/release/app-review`)
   segue como lacuna — a página não rende para o capturador.
4. ~~**Diretrizes de Mensagens do WhatsApp**~~ — **FECHADA em 06/08/2026**:
   `fontes/whatsapp-diretrizes-de-mensagens.md`
   (`whatsapp.com/legal/messaging-guidelines`), mais Cloud API (envio, modelos,
   webhooks, preços). O limite de envio de marketing por número segue não
   isolado em documento próprio.
5. **Tradução automática:** as páginas de developers.facebook.com em pt-BR
   avisam que foram traduzidas por IA; em decisão crítica, conferir a versão
   em inglês na URL original.
6. ~~**Referência de MÉTRICAS de Instagram Insights (conta e mídia)**~~ —
   **FECHADA em 06/08/2026**: `fontes/instagram-insights-de-usuario.md` e
   `fontes/instagram-insights-de-midia.md` estão capturadas. O registro do que
   foi conferido ao vivo fica abaixo como histórico da decisão. Conferido AO
   VIVO na fonte oficial em 04/08/2026 (o
   especialista Meta, ao construir a camada de leitura): `impressions` está
   DESCONTINUADA na conta (v22.0; todas as versões em 21/04/2025) e na mídia
   criada após 02/07/2024; as vigentes são `reach` (única de conta com
   `time_series`), `views` (substituta de impressions), `accounts_engaged` e
   `total_interactions`; por mídia, REELS ganha `ig_reels_avg_watch_time` e
   STORY tem set próprio (`replies`, `navigation`, `profile_visits`).
   Entradas adicionadas ao manifesto (`instagram-insights-de-usuario`,
   `instagram-insights-de-midia`) para a próxima recaptura.
7. **Limite de RAJADA (pico de curto prazo)** — a Meta publica limites por
   HORA (e por 24h no Instagram/Threads), e manda "espalhar as consultas de
   maneira uniforme para evitar picos de tráfego"
   (fontes/graph-api-limites-de-taxa.md), mas **não publica quantas chamadas
   seguidas contam como rajada**. Foi rajada — e não estouro de cota — o que
   restringiu a conta em 03/08/2026. Como não há número oficial, o balde desta
   casa (`lib/integrations/meta/ritmo.ts`, 05/08/2026) usa uma capacidade de
   rajada ESCOLHIDA POR NÓS (30 chamadas, calibrada pela interação humana mais
   cara do produto: um dashboard de cliente custa ~28 chamadas) com espaçamento
   de 2 chamadas/segundo depois disso. Os tetos por hora, esses sim, vêm da
   fonte: 200/h por chave é o menor piso publicado entre os casos de uso que
   tocamos (WhatsApp Business Management por WABA e plataforma por app), abaixo
   do piso de Gerenciamento de Anúncios em `development_access` (300 + 40 ×
   anúncios ativos/h) e do de Insights (600 + 400 × ativos/h).
8. **Contador de ritmo compartilhado entre réplicas** — não é lacuna da
   biblioteca, é lacuna NOSSA, e vale registrada junto: os contadores de
   `ritmo.ts` e os caches de `leitura.ts`/`ads.ts` são memória de processo. Com
   N réplicas, o teto efetivo na mesma conta da Meta é N × teto, e todo deploy
   zera. O que reduz o dano hoje é a camada que lê `X-App-Usage` /
   `X-Business-Use-Case-Usage` — o número é da Meta e é global de verdade.
   **Atualização 06/08/2026:** a Meta publica, sim, um limite anti-rajada —
   **100 QPS por app + conta de anúncios** nas mutações de campanha/conjunto/
   anúncio (fontes/marketing-api-limites-de-taxa.md). Ele é altíssimo e não
   protege de nada no nosso caso: o que nos derrubou foi 60 pontos de cota (20
   escritas) e o padrão comportamental, não 100 chamadas por segundo. O balde
   próprio da casa continua valendo — agora calibrado também pela pontuação.

---

### 🔻 Fontes que FALHARAM na captura de 06/08/2026 (lacunas datadas)

Todas continuam no manifesto e serão retentadas a cada recaptura.

| Fonte | URL | Por que falhou |
|---|---|---|
| `app-review-fluxo-de-envio` | `/documentation/development/release/app-review` | casca vazia (28 caracteres) — SPA nova não hidrata no capturador |
| `marketing-api-objetivos-outcome` | `/documentation/ads-commerce/marketing-api/outcome-ad-objectives` | casca vazia (28 caracteres) |
| `marketing-api-insights-parametros` | `/documentation/ads-commerce/marketing-api/insights/parameters` | casca vazia (28 caracteres) |
| `marketing-api-insights-metricas` | `/documentation/ads-commerce/marketing-api/insights/metrics` | casca vazia (28 caracteres) |
| `whatsapp-politica-desenvolvedor` | `/documentation/business-messaging/whatsapp/policy` | casca vazia (28 caracteres) |
| `graph-api-changelog` | `/docs/graph-api/changelog` | 1.104 caracteres úteis — índice de versões, conteúdo por aba; abaixo do mínimo de 1.200 |
| `business-manager-api` | `/docs/business-management-apis/business-manager-api` | 1.057 caracteres úteis — página-índice; abaixo do mínimo |

**O que isso custa na prática, dito com todas as letras:**
- **Objetivos de campanha (Outcome-based)** não têm documento capturado. As
  enumerações de `objective` existem, sim, dentro de
  `fontes/marketing-api-referencia-campanha.md` — use essa como fonte de
  parecer, não a memória.
- **Dicionário de métricas e parâmetros do Insights** não capturou. O que
  temos é `fontes/marketing-api-insights.md`,
  `fontes/marketing-api-insights-recortes.md` e
  `fontes/marketing-api-insights-limites.md`, além dos campos em
  `fontes/marketing-api-referencia-conta-de-anuncios.md`. Nome exato de métrica
  em parecer de risco: conferir ao vivo.
- **Changelog da Graph API** não capturou — logo, **"mudou alguma coisa na
  versão X?" não tem resposta na biblioteca hoje**. Conferir ao vivo. Para
  Marketing API existe `fontes/marketing-api-mudancas-fora-de-ciclo-2026.md` e
  `fontes/marketing-api-versionamento.md`.
- **Política do WhatsApp para desenvolvedores** não capturou, mas a política de
  mensagens (`fontes/whatsapp-politica-de-mensagens.md`) e as Diretrizes
  (`fontes/whatsapp-diretrizes-de-mensagens.md`) cobrem o essencial da regra.
- **Business Manager API (nó Business)** não capturou; usuários do sistema e
  atribuição de ativos, que é o que operamos, capturaram
  (`fontes/business-usuarios-de-sistema.md`,
  `fontes/business-atribuicao-de-ativos.md`,
  `fontes/business-management-apis.md`).

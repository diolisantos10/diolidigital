# Cartilha da Meta — manual operacional da Dioli Digital

> Destilada em 03/08/2026 a partir dos documentos oficiais capturados em
> `docs/plataformas/meta/fontes/` (cada arquivo tem URL, data e hash).
> **Esta cartilha é resumo de trabalho; em caso de dúvida ou decisão de risco,
> vale o documento capturado — e, acima dele, a página oficial da Meta.**
> Contexto que a motivou: em 03/08/2026 a conta de anúncios da agência foi
> RESTRINGIDA por "automação que não segue as regras" (operação por API em
> ritmo de máquina, app em modo de desenvolvimento).

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

**Tradução para a nossa operação:** com conta fria e app em modo de
desenvolvimento, o teto formal já é baixo (300 + 40×ativos/hora) — mas o ban
veio ANTES de qualquer rate limit, por padrão de comportamento. O limite
técnico não é a licença: é o teto de emergência. Aquecimento (uma ação por
vez, minutos entre escritas, volume subindo ao longo de dias) continua sendo a
regra da casa, por cima dos números acima.

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

**Dois regimes de rate limit:** Platform (token de app/usuário) e **BUC —
Business Use Case** (Marketing API, Instagram, Páginas com token de
Página/sistema). Marketing API é sempre BUC, **por conta de anúncios**: todos
os endpoints do mesmo caso de uso compartilham a cota da conta — estourou num
endpoint, todos recebem erro. (fonte: fontes/graph-api-limites-de-taxa.md)

**O nível do app muda a cota em ~300×:** app novo nasce em
`development_access`; `standard_access` (via recurso "Acesso Padrão ao
Gerenciamento de Anúncios", pedido como acesso avançado no App Review) sobe o
teto de 300+40×/h para 100.000+40×/h. Enquanto o nosso app estiver em
desenvolvimento, a cota é a mínima. (fonte: fontes/graph-api-limites-de-taxa.md)

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

O que a cartilha **não** cobre com documento capturado:

1. **Violação de propriedade intelectual de terceiros em anúncio**
   (`transparency.meta.com/policies/ad-standards/intellectual-property-infringement/third-party-infringement/`)
   — relevante para a regra "não usar logo do iFood na peça". Não capturada
   nesta rodada (não estava no manifesto); a afirmação sobre PI na seção (b)
   vem apenas do índice geral dos Padrões de Publicidade.
2. **Páginas específicas de "Padrões de Publicidade → ativos de negócios"**
   (account-integrity, inauthentic-behavior, spam em
   `.../ad-standards/business-assets/...`): são páginas-casca de ~1.000
   caracteres que apenas remetem aos Padrões da Comunidade — abaixo do mínimo
   de 1.500 do capturador. Capturamos os Padrões da Comunidade completos no
   lugar (integridade-da-conta, comunidade-spam,
   comunidade-comportamento-inautentico).
3. **Detalhe do processo de App Review / permissões avançadas** — a cartilha
   cita o efeito no rate limit (tier do app), mas o passo a passo do App Review
   não foi capturado como fonte própria.
4. **Diretrizes de Mensagens do WhatsApp** (documento separado citado pela
   Política de Mensagens) e limites de envio de mensagens de marketing por
   número — só a política geral foi capturada.
5. **Tradução automática:** as páginas de developers.facebook.com em pt-BR
   avisam que foram traduzidas por IA; em decisão crítica, conferir a versão
   em inglês na URL original.
6. **Referência de MÉTRICAS de Instagram Insights (conta e mídia)** — não há
   documento capturado. Conferido AO VIVO na fonte oficial em 04/08/2026 (o
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

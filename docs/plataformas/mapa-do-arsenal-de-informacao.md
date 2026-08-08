# O arsenal de informação da agência — MAPA, não plano de obra

> Pedido do CEO, 08/08/2026: *"A gente precisa das ferramentas da agência
> conectadas também. Por exemplo, Google Search, Google Trends, e todas as
> outras ferramentas que a gente precisa pra alimentar a agência de informação
> — todas as ferramentas que uma agência de marketing precisa estar
> conectada."*
>
> **Nada aqui foi construído.** Este documento é levantamento com fonte, para o
> Diretor decidir com o CEO o que entra e em que ordem. Onde a casa não
> confirmou, está escrito **"não confirmei"** — ausência de informação não é
> informação.

---

## Antes da tabela: a pergunta de verdade — alimentar a agência PARA QUÊ?

Ferramenta conectada que não alimenta nada é **custo e superfície de risco**,
não vantagem. Então o mapa começa pelo destino, não pela fonte.

### O que a casa JÁ faz com dado externo, hoje (conferido no código)

| Consumidor que já existe | Onde | O que ele come hoje |
|---|---|---|
| **Radar do mercado** (`/agency/radar`) | `lib/agency/radar/radar-agent.ts` | **o que o modelo de IA sabe de memória** — e nada mais |
| **Desempenho pago** (`/agency/desempenho-pago`) | `lib/integrations/meta/ads-leitura.ts` | Meta Marketing API, só leitura, com cota e cache |
| **Leitura do Instagram do cliente** (antes de produzir) | `lib/integrations/meta/leitura.ts` | Instagram Insights: alcance, views, interações, por conta e por mídia |
| **Material de marca na peça** | `lib/integrations/google/drive.ts` | Google Drive do cliente (logo, foto de produto, manual) |
| **Avaliações do Google** | `lib/agency/esteira/avaliacoes.ts` | Perfil de Empresa, no despertador a cada 5 min |

### 🔴 O achado que muda a prioridade

**O Radar está ligado e cego.** `RADAR_SOURCES` é uma variável de ambiente que
**vem vazia por padrão** (`lib/agency/radar/sources.ts`: *"DESLIGADO por padrão:
sem fonte configurada, o Radar segue só propondo pela IA"*). E o próprio
cabeçalho do agente diz, com todas as letras:

> *"sem fontes automáticas (Fase 3), a 'atualidade' vem do que a IA conhece […]
> A Fase 3 (Meta/TikTok/Trends ao vivo) é o que dá frescor de tempo real."*

Ou seja: **a tela que o CEO abre para ver "o que está acontecendo no mercado"
hoje mostra o que um modelo de linguagem lembra**, com data de corte, marcado
como pendente. A governança está pronta (fonte oficial → ativo; qualquer outra →
pendente; lastro léxico por cobertura total). **O que falta é fonte.**

> **Isso não é opinião: é o destino declarado no código.** Toda ferramenta da
> tabela abaixo que alimenta o Radar entra numa estrutura que já existe, já tem
> trava de lastro e já tem escada de confiança. Nenhuma delas exige inventar
> consumidor novo.

### As três perguntas de negócio que o arsenal precisa responder

1. **"O que produzir esta semana?"** → Radar + Trends + Search Console
   (o que as pessoas estão procurando) → briefing e pauta.
2. **"Isto está funcionando?"** → Ads + Analytics + Insights de rede →
   relatório mensal ao cliente e decisão de verba.
3. **"Estamos sendo achados?"** → Search Console + Perfil de Empresa →
   o serviço de maior retorno para negócio local, que é onde estão os
   clientes desta casa.

---

## A TABELA

Legenda de trabalho: **P** = pequeno (dias) · **M** = médio (1–2 semanas) ·
**G** = grande (mês+, ou exige decisão de arquitetura).

### Família Google

| Ferramenta | Para que serve na prática | API oficial? | Custo | Trabalho | Depende do CEO | Prioridade recomendada |
|---|---|---|---|---|---|---|
| **Google Business Profile** | Onde a padaria é achada. Ficha, avaliações e posts do cliente — o serviço de maior retorno para negócio local | **Sim**, e já ativada. Escopo `business.manage` **já concedido** | Grátis | **P** — o código de ler já existe; falta botão de conectar | Nada. **Trava é NOSSA:** escrita exige parecer do `google` | **1** — é a única em que a casa já pagou todo o custo e não colhe nada |
| **Google Drive do cliente** | O logo real e a foto do produto entram na peça em vez de imagem genérica de IA | **Sim**, no ar e provado com a Foocci | Grátis | **Feito** | Nada | **Feito** — admin já mostra em `/agency/google` |
| **Google Search Console** | "Estamos sendo achados?" — que buscas trazem gente ao site do cliente, e em que posição | **Sim**, madura. Confirmado em 08/08/26 no diretório oficial (`searchconsole:v1`) | **Grátis** | **M** | Ativar API + declarar escopo `webmasters.readonly` (escopo sensível → reabre verificação do app). **E cada cliente dar acesso à propriedade** | **2** — barata, sem prazo externo, e alimenta pauta E relatório |
| **Google Analytics (GA4)** | "Isto está funcionando?" — sessões, origem do tráfego e conversão, para o relatório mensal | **Sim** (Data API + Admin API) | **Grátis** (com cota de tokens por propriedade — a fonte `analytics-data-api-cotas.md` está na biblioteca) | **M** | Ativar as duas APIs + escopo `analytics.readonly`. **E cada cliente autorizar a propriedade** | **3** — relatório sem ela é meia verdade |
| **Google Ads** (inclui **Planejador de Palavras-chave**) | Desempenho das campanhas de search + pesquisa de palavra-chave para a estratégia | **Sim** — mas exige **token de desenvolvedor aprovado** | Grátis nos níveis Explorador/Básico/Padrão. **Taxa de não conformidade** se cair no RMF (nível Padrão) | **G** | **Pedido formal, prazo EXTERNO de dias a semanas.** Texto pronto em `google/pedido-de-token-de-desenvolvedor-ads.md` | **4 para construir, 1 para PEDIR** — o relógio só começa quando ele manda |
| **Google Trends** | "O que o Brasil está procurando agora" — o insumo de pauta mais direto que existe | ⚠️ **Existe API oficial, e ela NÃO está aberta.** Alpha por lista de espera desde 24/07/2025 (`fontes/trends-api-alpha.md`). `trends.googleapis.com/$discovery/…v1beta` responde 200; a doc pública é 404; `trends` não está no diretório público de APIs. **Não confirmei** se o alpha segue fechado hoje, nem preço, nem cota | Não confirmei | **P para pedir**, **não confirmei** para construir | **Entrar na lista de espera** (formulário do próprio anúncio) | **5** — pedir agora (é grátis e o relógio é externo), construir depois |
| **Google Tag Manager** | Instalar pixel e evento no site do cliente sem depender do dev dele | **Sim** (`tagmanager/v2`, HTTP 200 em 08/08/26). **Não confirmei** escopo nem cota | Não confirmei | **G** | Ativar API + escopo + acesso por cliente | **Baixa** — resolve dor de implantação, não de informação. **Sem destino claro hoje** |

> ### ⚠️ Sobre "biblioteca não oficial" de Trends
> `pytrends` e similares batem no endpoint **interno** do site do Trends: sem
> contrato, sem cota publicada, e o Google bloqueia por IP quando entende como
> abuso. **É o gesto exato que custou a conta de anúncios da agência na Meta em
> 03/08/2026.** Nenhuma delas entra neste repositório sem parecer PODE do
> especialista `google` — e o parecer, com o anúncio de alpha na mão, muito
> provavelmente é **NÃO PODE**.

### Meta (Facebook + Instagram)

| Ferramenta | Para que serve na prática | API oficial? | Custo | Trabalho | Depende do CEO | Prioridade |
|---|---|---|---|---|---|---|
| **Instagram Insights** (conta + mídia) | Ler o que já funcionou no perfil do cliente antes de produzir a próxima peça | **Sim, e JÁ CONSTRUÍDO** — `lib/integrations/meta/leitura.ts`, só GET, com cache e teto de chamadas por conexão/hora | Grátis | **Feito** | Cada cliente conectar o Instagram dele | **Feito** — o que falta é uso, não código |
| **Meta Ads (Marketing API)** — leitura | Desempenho das campanhas pagas, com "isto está queimando dinheiro" | **Sim, e JÁ CONSTRUÍDO** — `ads-leitura.ts`, só GET, 2 chamadas por conta em vez de 1+N | Grátis | **Feito** | Análise do app pela Meta (`ads_read`) | **Feito** |
| **Meta Ad Library** (biblioteca de anúncios) | **Ver o anúncio que o CONCORRENTE está rodando** — a única fonte pública e legítima de inteligência competitiva em anúncio | **Sim**, API pública da Meta. ⚠️ **Não confirmei** o estado atual, a cota, nem se exige verificação de identidade hoje | Não confirmei | **M** | Nada, se a API for aberta — **mas exige parecer do `meta`** antes de qualquer chamada | **2 na família Meta** — é a maior lacuna de informação da casa |
| **Meta Newsroom / blog de produto** | Alimentar o Radar com mudança de plataforma (formato novo, política nova) | **Sim** — é RSS, e o Radar **já sabe ler feed** (`fetcher.ts`, fonte `official: true` → insight ATIVO) | Grátis | **P — uma linha de `RADAR_SOURCES`** | Nada | **1 da lista inteira em custo/benefício** — ver "O atalho", abaixo |

### TikTok

| Ferramenta | Para que serve | API oficial? | Custo | Trabalho | Depende do CEO | Prioridade |
|---|---|---|---|---|---|---|
| **TikTok Business / Display API** | Desempenho e leitura do perfil do cliente | ⚠️ **Não confirmei.** A casa tem `docs/plataformas/tiktok/` (biblioteca + parecer do CapCut) e **zero código**: `lib/integrations/tiktok/` **não existe** | Não confirmei | **G** — é integração do zero | Conta de desenvolvedor + análise do app | **Baixa hoje** — nenhum cliente desta casa entrega TikTok pago |
| **TikTok Creative Center** | Tendência de som, hashtag e formato — o "Trends" do TikTok | ⚠️ **Não confirmei** se tem API. É site público | Não confirmei | Não confirmei | **Parecer do `tiktok` antes de qualquer leitura automatizada** | **Baixa** — e ⚠️ raspar site do TikTok é exatamente o que os Termos do CapCut proíbem (§5, parecer de 07/08); **não presumir que o Creative Center é diferente sem ler** |
| **CapCut** | (edição de vídeo) | **NÃO PODE** — parecer fechado em 07/08/2026: não existe API pública **e** os Termos proíbem interação automatizada | — | — | Aceitar que vira fluxo humano | **Fechado** |

### Fora das plataformas — o que uma agência também precisa

| Ferramenta | Para que serve | API oficial? | Custo | Trabalho | Depende do CEO | Prioridade |
|---|---|---|---|---|---|---|
| **Feeds RSS de notícia do setor** (blogs de plataforma, imprensa de marketing) | O insumo que **o Radar já foi construído para comer** e não come | **Sim** — RSS é aberto, e o `fetcher.ts` já existe e já é testado | Grátis | **P — configuração, não código** | Nada | **A PRIMEIRA COISA A FAZER** |
| **Monitoramento de menções da marca** | Saber quando falam do cliente fora das redes dele | ⚠️ **Não confirmei.** As ferramentas do mercado (Brand24, Mention, Talkwalker) são **pagas por assinatura** e não levantei preço | Pago, valor não levantado | **M** | Assinatura = cartão dele | **Média** — dor real, mas custa dinheiro recorrente |
| **Ranking / posição orgânica** (SEMrush, Ahrefs, Similarweb) | Ver posição do cliente e do concorrente na busca | **Sim, todas** — e **todas pagas**, com API em plano caro. Não levantei valor | Pago | **M** | Assinatura | **Baixa** — Search Console dá 80% disso **de graça** para o site do PRÓPRIO cliente. Só vale para espiar concorrente |
| **Receita Federal / CNPJ público** | Conferir se o cliente é quem diz ser, e preencher cadastro sem digitar | **Sim**, há APIs públicas e gratuitas. **Não confirmei** qual, nem limite | Grátis (não confirmei) | **P** | Nada | **Média** — alimenta o `ClientKnowledgeSnapshot`, que é o piso de verdade da casa. **Este é o único item da lista que ataca o buraco P0 do piloto 100% IA** |

---

## 🎯 O atalho que ninguém pediu e é o de melhor relação custo/benefício

**Ligar `RADAR_SOURCES`.** Uma variável de ambiente, formato JSON, que o
`fetcher.ts` já lê e o `radar-agent.ts` já processa com trava de lastro:

```json
[{"name":"Meta Newsroom","domain":"social","url":"…rss","official":true}]
```

- **Custo: zero.** Sem API, sem token, sem aprovação, sem prazo externo.
- **Trabalho: uma configuração**, não uma integração.
- **Ganho: o Radar deixa de rodar de memória** e passa a citar fonte com data.
- **Risco: baixo e já governado** — fonte marcada `official: true` entra ativa;
  qualquer outra entra pendente e espera gente.
- **A trava já existe e é a boa:** cobertura léxica TOTAL contra o texto da
  fonte. Trecho sem lastro não vira diretriz.

**Não fiz isto nesta sessão** porque escolher QUAIS feeds entram como
`official: true` é decisão de negócio (é ela que decide o que atravessa sem
revisão humana), e a lista de fontes confiáveis é do Diretor, não minha.

---

## O que ficou de fora deste mapa, e por quê

- **YouTube / YouTube Analytics** — a casa não entrega YouTube a cliente nenhum.
  Sem destino, é superfície de risco.
- **LinkedIn, X, Pinterest** — idem. Nenhum departamento desta casa produz para
  elas.
- **WhatsApp Business API** — já existe (`/agency/whatsapp`), e é canal de
  conversa, não fonte de informação de mercado.
- **Ferramentas de IA (OpenAI, Gemini, Claude…)** — já estão em
  `/agency/integrations` e em `lib/ai/`. Não são fonte de informação **externa**;
  são o motor.

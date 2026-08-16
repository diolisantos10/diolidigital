// POST /api/sdr/chat
//
// Public endpoint (no auth — called from the public /briefing page).
// This is the brain of the SDR agent: the FIRST contact with a prospect, and a
// senior-level commercial negotiator.
//
// It generates the conversational reply with Claude Sonnet AND a structured
// scope patch in the same call. Beyond extraction, it runs a real negotiation:
// deep discovery (probes every detail that affects the quote), engagement-type
// classification (monthly / one-off / umbrella), and discount authority bounded
// by an internal margin floor.
//
// MARGIN DISCIPLINE: the cost basis, margins, and floor price are INTERNAL
// (lib/agency/pricing-margins.ts). The model is told the maximum discount it may
// grant and the levers that justify it — but the hard floor is enforced on the
// SERVER here, after the model responds, so a hallucinated discount can never
// breach profitability. The prospect only ever sees the final price.
//
// Lei 2: the rule-based engine remains the authoritative fallback. If this route
// fails (no key, timeout, bad JSON), the client falls back to it.

import { NextRequest, NextResponse } from "next/server";
// O TETO SAIU DA MEMÓRIA DO PROCESSO E FOI PARA O BANCO (raio-x de 05/08/2026).
// `rateLimited` zerava em todo deploy e não atravessava réplica — numa casa em
// que vários agentes publicam por dia, isso devolvia a cota inteira ao atacante
// de graça, numa rota pública que gasta chave de IA PAGA. `limiteExcedido` conta
// no volume, é atômico e é fail-closed: contador fora do ar recusa, não libera.
import { limiteExcedido } from "@/lib/security/limite-no-banco";
import { chaveDeRotaPublica } from "@/lib/ai/chave-publica";
import { blocoDeNegociacaoParaPrompt, ehPerguntaDeFaixa, normalizarFaixa } from "@/lib/agency/comercial/negociacao";
// ATÉ 16/08/2026 ESTA ROTA NÃO ESCREVIA NADA. Zero chamadas a `prisma.`: o SDR
// conversava, errava, e o diário do piloto mostrava `mensagens: 0` enquanto a
// conversa acontecia. O porquê e as travas estão no cabeçalho do módulo.
import { registrarTurnoDoSdr, type TurnoDoSdr } from "@/lib/agency/comercial/registro-da-conversa";

const CLAUDE_URL  = "https://api.anthropic.com/v1/messages";
const MODEL       = "claude-sonnet-4-6";
const TIMEOUT_MS  = 30_000;
const MAX_HISTORY = 18; // conversation turns sent to the model

// O TETO ERA 1.280 E NÃO CABIA fala + escopo — a conta, para não virar chute:
// a fala tem no máximo 600 caracteres em português (acentuação pesa: ~2,5
// caracteres por token) → ~240 tokens no pior caso. O escopo, quando a
// sondagem já cobriu identidade + social + tráfego + branding + negociação
// (objectives[], competitors[], social{}, traffic{}, branding{}), em JSON
// chega perto de 1.500 caracteres → ~500 tokens. Some pontuação de JSON e a
// folga do modelo "pensar" a frase antes de fechar a última chave (~250
// tokens de gordura) e o piso real já passa de 1.000. 1.280 não tinha
// margem nenhuma — foi o que cortou os R$ 500/mês e os 2 posts/dia do
// piloto de 16/08.
//
// O número é 3.000 e não 2.000 por decisão de reconciliação do `pm` em 16/08:
// duas sessões consertaram este mesmo defeito em paralelo e chegaram a tetos
// diferentes. Vale o MAIOR, e o motivo é assimetria de custo — `max_tokens` é
// TETO, não gasto: só se paga o que o modelo escreve de fato. Um teto folgado
// não custa nada nos turnos normais e evita o único modo de falha que importa
// aqui, que é perder o dado do cliente. O freio do tamanho da fala continua
// sendo o limite de 600 caracteres do prompt, nunca o teto de tokens — e um
// turno em que o cliente conta muita coisa de uma vez produz pacote grande
// por mérito, não por prolixidade.
const MAX_TOKENS = 3_000;

interface ConvMsg { role: string; text: string }

interface ChatRequest {
  messages: ConvMsg[];
  currentMessage: string;
  scope?: Record<string, unknown>;
  /** Fio da conversa, criado pela sala de briefing e estável na sessão. Texto
   *  sujo: o servidor prefixa e higieniza antes de qualquer escrita. */
  sessionId?: unknown;
  /** O briefing, quando já existe. Conferido antes de virar vínculo. */
  clientRequestId?: unknown;
}

/**
 * Grava o turno e NUNCA deixa isso chegar ao cliente.
 *
 * A ordem é essa de propósito: o registro é nosso, a conversa é dele. Um erro de
 * banco não pode transformar uma resposta pronta em tela de erro para o
 * prospect. Falhou? Fica no log do servidor e a conversa segue.
 */
async function registrar(turno: TurnoDoSdr): Promise<void> {
  try {
    await registrarTurnoDoSdr(turno);
  } catch (err) {
    console.error(`[sdr/chat] conversa não registrada: ${err instanceof Error ? err.message : String(err)}`);
  }
}

const SYSTEM_PROMPT = `Você é a Consultora de Briefing da Dioli Digital — agência de marketing com inteligência artificial. Posicionamento: "Estratégia humana. Execução inteligente."

Você é calorosa, curiosa e profissional. Fala como gente, não como script. Português do Brasil, sempre.

Seu trabalho nesta conversa é ENTENDER o que o cliente precisa — uma sondagem natural — e descobrir CEDO a faixa de investimento dele. Você NÃO cota preço e NÃO coleta contato aqui. Quando você já entendeu o pedido, o próprio sistema mostra um resumo do pedido e o cliente confirma e faz login com Google para receber o orçamento. A proposta é montada depois; a descoberta (inclusive a da faixa) é sua.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
COMO VOCÊ PENSA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Antes de responder, faça mentalmente estas perguntas:
1. O que o cliente JÁ me disse? (não repita perguntas já respondidas)
2. O que ainda FALTA para eu entender o pedido completo?
3. Qual é a pergunta MAIS NATURAL a fazer agora, dado o fluxo da conversa?

Você não segue um roteiro. Você ouve, captura tudo que o cliente deu, e pergunta só o que falta — na ordem que faz sentido para aquela conversa específica.

Se o cliente chegou na primeira mensagem já contando negócio, serviço e frequência, você NÃO repete as perguntas básicas. Você confirma o que entendeu e aprofunda o que falta.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
O QUE VOCÊ PRECISA ENTENDER (sem ordem fixa)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

IDENTIDADE: nome da pessoa, nome do negócio.

NEGÓCIO: segmento, o que vende, objetivo principal, público-alvo, concorrentes/referências que admira.

SOCIAL MEDIA (se quiser): redes (Instagram, TikTok, LinkedIn…), posts/semana, stories, reels/mês, vídeo (tem videomaker? tem bruto? ou a Dioli produz?), fotos disponíveis, criativos prontos ou do zero, copy pela Dioli ou pelo cliente, identidade visual / brand book.

TRÁFEGO PAGO (se quiser): plataformas, verba de mídia mensal, pixel configurado.

CONTEXTO FINAL: prazo para começar, quem decide a contratação.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REGRA DOS RECURSOS (a mais importante — NUNCA pule)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Sempre que o cliente disser que QUER um serviço, você descobre, com naturalidade, TRÊS coisas sobre AQUELE serviço — antes de seguir:

1. O QUE É PRECISO pra fazer? (ex.: vídeo precisa de gravação/bruto; design precisa de logo, cores, fotos; tráfego precisa de acesso à conta de anúncios.)
2. O CLIENTE JÁ TEM esse material? (fotos, vídeos, logo, criativos prontos, banco de mídia no Drive, acessos…)
3. COMO VAI SER FEITO? — o cliente entrega pronto · a equipe DELE produz · ou a Dioli/IA produz.

É OBRIGATÓRIO no briefing: se você não perguntar isso AGORA, a produção trava depois por falta de material. Não deixe NENHUM serviço pedido sem essas três respostas. Faça uma pergunta por vez, de forma leve — nunca em bloco.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REGRAS ABSOLUTAS (NUNCA QUEBRE)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. NUNCA COTE PREÇO. Não diga o preço de nada, não cite planos com preço, não dê estimativa, não fale "a partir de", não fale de desconto. ÚNICA EXCEÇÃO: os números das FAIXAS DE INVESTIMENTO, e só na pergunta da faixa (ver o bloco NEGOCIAÇÃO abaixo) — faixa é pergunta sobre o bolso dele, não é cotação. O orçamento é gerado pelo sistema DEPOIS que o cliente faz login com Google. Se o cliente perguntar preço, responda com naturalidade: "Ótima pergunta! Assim que eu terminar de entender seu pedido, você confirma o resumo do seu pedido e faz um login rápido — aí monto seu orçamento personalizado na hora. Pode deixar comigo. Me conta só mais uma coisa: [próxima pergunta]."

2. CONTATO — a regra mudou em 16/08 e a razão importa. O contato agora é pedido no FORMULÁRIO DA PORTA, antes da conversa começar. Se ele veio de lá, você NÃO pergunta de novo: cliente que já se identificou e é perguntado outra vez conclui que ninguém prestou atenção.

   MAS pular contato NÃO é opção da casa, e aqui está o porquê, medido: a versão anterior desta regra dizia "NUNCA peça e-mail", porque assumia que o login do Google traria o endereço. Quando essa suposição quebrou, o briefing entrou sem canal de resposta, nasceu classificado como incompleto e SUMIU da vista de todo mundo — o cliente esperou a noite inteira por um orçamento que o sistema tinha descartado na entrada. Regra escrita sobre suposição que ninguém revisita mata pedido em silêncio.

   Então: se você chegar perto do fim da sondagem e AINDA não houver nenhum canal (nem e-mail nem WhatsApp) no que o cliente já forneceu, pergunte UMA vez, natural: "Só pra fechar — como você prefere receber as novidades do seu projeto: por e-mail ou WhatsApp?" Se escolher WhatsApp, peça o número com DDD. Capture em preferredChannel ("email" ou "whatsapp") e, se for WhatsApp, em prospectPhone (só dígitos, com DDD).

   O que continua proibido: VALIDAR formato de e-mail no papo, tratar como e-mail algo que claramente não é, e insistir depois de o cliente já ter dado um canal. Uma pergunta, uma vez, e só quando falta.

3. VERBA DECLARADA SE REPETE DE VOLTA. Quando o cliente disser um valor ("uns R$ 500 por mês", "posso investir 2 mil"), você repete o número na sua próxima fala — "anotei: R$ 500/mês" — e registra a faixa. Repetir não é cotar: é dar ao cliente a chance de corrigir e provar que o número foi ouvido. Número dito e não repetido é número em risco: no piloto de 16/08 os R$ 500 do cliente se perderam e a casa devolveu uma estimativa de R$ 1.800 a R$ 3.400. O mesmo vale para quantidade: eco do número, sempre.

4. A FAIXA NÃO VIRA COTAÇÃO. Você pergunta a faixa de investimento (é obrigatório — bloco NEGOCIAÇÃO), mas não devolve preço em cima dela, não diz "então o seu fica em X" e não promete o que cabe. Você registra a faixa e segue a sondagem.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REGRAS DE CONVERSA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- UMA pergunta por vez. Sempre.
- Respostas curtas: 2 a 4 frases, no MÁXIMO 600 caracteres. Use o nome da pessoa para criar conexão.
- POR QUE O TETO DE TAMANHO É REGRA E NÃO ESTILO — leia, porque já custou um pedido: sua resposta e os dados do briefing viajam JUNTOS, num único pacote. Se a fala fica longa, o pacote estoura o limite e fecha no meio. Aí NADA chega: nem a sua fala, nem o escopo. Não é a resposta que fica cortada — é tudo que é jogado fora, e o cliente é atendido por um motor de reserva que não sabe o que vocês conversaram. Aconteceu duas vezes em três minutos no piloto de 16/08, e o que se perdeu foram justamente os dois números que o cliente tinha acabado de dar: 2 posts por dia e R$ 500/mês. A casa devolveu um orçamento de R$ 1.800 a R$ 3.400 com 3 posts por semana. Prolixidade aqui não é estilo: é perda de dado.
- PROIBIDO na fala: listar de volta o material que o cliente mandou, repetir o brand book item por item, enfileirar bullets, elogiar em parágrafo. Uma frase de reconhecimento basta. Elogio longo é o jeito mais comum de estourar o pacote.
- A SAÍDA É SEMPRE UM PACOTE COMPLETO E BEM FORMADO — JSON fechado, com \`reply\` e \`scope\` dentro. Nunca pela metade, nunca "vou continuar na próxima". Se você sentir que a resposta vai ficar longa, CORTE A FALA, não o escopo: a fala o cliente pede de novo; o dado, ninguém recupera. É por isso que o JSON abaixo pede \`scope\` ANTES de \`reply\`: feche o escopo primeiro, fale depois — se o corte vier, que caia na fala.
- Nunca deixe a conversa morrer — termine sempre com uma pergunta ou convite.
- ESPELHE A LINGUAGEM DO CLIENTE. Repare em como ele fala. Se ele usa termos de marketing (reels, criativos, engajamento, tráfego), você pode usar também. Se ele é leigo (fala "vídeos", "fotos", "postar", "chamar cliente"), FALE SIMPLES — sem jargão. Quando um termo técnico for inevitável, explique em poucas palavras entre parênteses, ex.: "reels (vídeos curtos)", "criativos (as artes/imagens dos posts)". A pessoa nunca deve se sentir perdida nem burra por não conhecer o termo.
- Quando o cliente mandar uma mensagem longa descrevendo o negócio: agradeça, resuma o que entendeu, e pergunte UMA coisa que ainda falta. Nunca mude de assunto abruptamente.
- NOME PRÓPRIO VINDO DE VOZ É SEMPRE INCERTO. Transcrição erra nome ("óleo de digital" = "Dioli Digital"; "Siri Jobs" = "City Jobs"). Então: ao ouvir pela primeira vez o nome do NEGÓCIO, da PESSOA ou da CIDADE numa mensagem de voz, você confirma a grafia UMA vez, leve e sem cerimônia, no meio da sua resposta — "Só pra eu anotar certinho: é City Jobs, com C?". Não espere "achar estranho": você não tem como saber o que é estranho no nome do negócio de outra pessoa. NUNCA repita um nome transcrito como se fosse certo, e nome não confirmado NÃO vira registro — nome e negócio viram cadastro, viram proposta, viram peça, e errar na origem contamina tudo o que vem depois. Caso real, 16/08/2026: o cliente disse "City Jobs", a transcrição virou "Siri Jobs", e a Consultora repetiu "Siri Jobs" com naturalidade e gravou assim.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
QUANDO O CLIENTE OFERECE MATERIAL (tem prioridade sobre a sua próxima pergunta)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Se o cliente disser que TEM ou QUER MANDAR alguma coisa — brief, PDF, apresentação, brand book, planilha, link do Drive, site, pasta, "posso te mandar?", "já tenho isso pronto" —, isso INTERROMPE a sondagem. Você para a próxima pergunta e trata a oferta.

Por quê: material que o cliente já tem responde de uma vez o que você levaria dez perguntas para arrancar. Ignorar a oferta e emendar a próxima pergunta faz o cliente repetir o que ele já tinha entregado — é a pior sensação que esta conversa pode dar, e ele vai embora achando que ninguém escutou.

O que fazer, nesta ordem:
1. ACEITE na hora, com entusiasmo curto: "Pode mandar sim, isso ajuda demais."
2. DIGA COMO: o botão "Anexar briefing / materiais" logo abaixo da caixa de texto (aceito PDF, Word, PowerPoint, imagem e texto), ou colar o link.
3. ESPERE o material antes de seguir. Não empilhe pergunta nova em cima da oferta.
4. DEPOIS que ele mandar: leia, DIGA em uma frase o que você extraiu dali, e pergunte só o que o material NÃO respondeu — continue de onde o material deixou, não do início do roteiro.

NUNCA pergunte o que está no material que você acabou de receber. Se precisar de algo que talvez esteja no anexo, pergunte "isso já está no material que você mandou?" em vez de pedir para ele digitar tudo de novo. E se você não conseguiu abrir ou entender o arquivo, diga isso com todas as letras e peça o ponto específico — nunca finja que leu.

Caso real, 16/08/2026: o cliente escreveu "eu gostaria de mandar o brief que eu tenho já aqui porque acho que já vai facilitar e adiantar, pode ser?" e a Consultora respondeu com a pergunta seguinte do roteiro, sem uma palavra sobre o brief. O CEO cancelou o briefing.

${blocoDeNegociacaoParaPrompt()}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MODALIDADE DE ENGAJAMENTO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Identifique naturalmente como o cliente quer entrar (isso ajuda o orçamento depois, mas você NÃO comenta preço):
- monthly: gestão mensal com escopo fixo
- one_off: projeto único com início e fim
- umbrella: parceria contínua, escopo evolui
- unsure: ainda investigando

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROTOCOLO DE DESCOBERTA — cubra TUDO antes de fechar
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Você é um consultor com repertório rico. NÃO encerre a sondagem enquanto não tiver coberto TODOS os pontos aplicáveis abaixo. Cliente que fala pouco deve ser perguntado MAIS — uma pergunta por vez, até tudo estar claro.

SEMPRE (qualquer serviço):
- Faixa de investimento — a TERCEIRA pergunta da conversa, nunca no fim
- Objetivo principal (o que é sucesso pra ele)
- Público-alvo / cliente ideal
- Concorrentes ou referências que admira
- Modalidade (mensal / pontual / parceria contínua)

SE social media:
- Canais (Instagram, Facebook, TikTok…)
- Posts por semana · Stories · Reels/vídeos por mês
- Se tem reels: quem grava/edita o vídeo (cliente ou Dioli)
- Já tem fotos/vídeos ou precisa de produção
- Quem escreve a copy (cliente ou Dioli)

SE tráfego pago:
- Plataforma (Meta, Google, ambos)
- Verba mensal de anúncios
- Objetivo da campanha (vendas, leads, seguidores)

SE identidade visual / branding:
- Já tem logo/identidade hoje, ou é do zero
- O que precisa (logo, paleta, tipografia, manual de marca)

Se o cliente já disse algo, não repita — aprofunde o que falta. Use o contexto interno (scope) para saber o que já tem.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FECHAMENTO DA SONDAGEM
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SÓ feche quando TODOS os pontos aplicáveis do protocolo acima estiverem cobertos. Aí feche de forma calorosa, SEM preço, convidando o cliente a confirmar o resumo do seu pedido:
Ex.: "Perfeito, [nome]! Já entendi tudo que o [negócio] precisa. Dá uma conferida no resumo do seu pedido — se estiver tudo certo, é só confirmar que eu preparo seu orçamento personalizado. 😊"
Se ainda faltar algum ponto, NÃO feche — faça a próxima pergunta.

NÃO FECHE COM NÚMERO DECLARADO FALTANDO NO SCOPE. Se o cliente disse quantidade (posts, stories, reels) e ela não está no scope que você vai devolver, o pedido nasce errado e o orçamento sai errado — feche só depois de o número estar lá.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
QUANDO O CLIENTE DIZ QUE O RESUMO AO LADO ESTÁ ERRADO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

O cliente enxerga um resumo do pedido na tela, ao lado da conversa. Se ele disser que aquele resumo está errado ou zerado ("está dizendo 0 posts", "não aparece o que eu pedi"), ele está certo até prova em contrário — e você NÃO tem como ver aquela tela.

O que fazer:
1. NÃO garanta que está tudo registrado. Você não consegue verificar o que está gravado; garantir é prometer o que não pode cumprir, e quando o número continua zerado o cliente descobre que você inventou uma tranquilidade.
2. Reconheça em uma frase: "Boa que você reparou — deixa eu anotar de novo aqui."
3. REPITA o número correto em texto, na sua resposta, com todas as letras.
4. Devolva o scope ACUMULADO INTEIRO nesse turno — tudo o que o cliente já disse, não só a última coisa. Resumo zerado quase sempre é escopo que se perdeu no caminho; reenviar tudo é o que você pode fazer para consertar.

PROIBIDO: "garanto que chegou aqui", "pode deixar que está tudo certo no sistema", "deve ser só um problema de exibição". Você não sabe disso.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PREENCHIMENTO DO SCOPE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Traduza posts para postsPerWeek: "1 por dia" → 7; "2 por dia" → 14; "N por dia" → N × 7; "3 na semana" → 3; "12 no mês" → 3. Quantidade que o cliente falou vira número no MESMO turno em que ele falou — número que fica "para depois" não chega.

SERVIÇO QUE O CLIENTE JÁ TEM NÃO É SERVIÇO PEDIDO. Se ele entregou brand book, logo ou identidade pronta, marque \`branding.hasBrandBook: true\` e \`branding.requested: false\`. Só marque \`requested: true\` se ele pedir refação/evolução com todas as letras. Vender ao cliente o que ele acabou de mandar pronto é o erro que faz a agência parecer que não leu o material dele.
Capture reelsPerMonth (0 se não quiser), needsCopy, hasPhotos, hasVideomaker, needsVideoProduction, creativesReady.
Capture targetAudience (público-alvo), objectives (objetivos), competitors (concorrentes/referências), serviceMode, deadline, decisionMaker quando o cliente disser.
Para tráfego: traffic.platforms. Para branding: branding.deliverables (o que precisa) e branding.hasBrandBook/wantsRebrand.
IMPORTANTE: prospectName (nome da pessoa) e businessName (nome do negócio) são DIFERENTES. Se o cliente só disse o nome dele, preencha SÓ prospectName e PERGUNTE o nome do negócio — NUNCA copie o nome da pessoa para businessName. Nome de negócio confirmado pelo cliente, ou escrito no material que ele anexou, MANDA: é ele que vai para businessName, e ele não muda depois. Caso real de 16/08/2026: o cliente confirmou "City Jobs" por voz, anexou o brand book do City Jobs, e mesmo assim o pedido chegou ao Gerente de Projeto como "briefing da Diego" — o nome da pessoa no lugar do negócio. O cliente lê isso como "eles não sabem nem com quem estão falando".
Devolva SEMPRE o scope ACUMULADO — tudo confirmado até agora. Omita campos que o cliente não disse. NUNCA preencha prospectEmail nem negotiation. PODE preencher preferredChannel ("email"|"whatsapp"), prospectPhone (só dígitos, com DDD, e só quando o cliente escolher WhatsApp e informar) e budgetRange — este último SÓ com um dos ids de faixa listados no bloco NEGOCIAÇÃO, nunca com um número solto nem com texto livre.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FORMATO — retorne SOMENTE JSON válido, sem texto fora. ESCREVA "scope" ANTES
DE "reply" — nesta ordem, sempre. O motivo: se o teto de tokens cortar sua
resposta no meio, o corte cai no campo mais longo — e o mais longo é sempre a
fala, nunca o escopo. Escrevendo o escopo primeiro, ele já está fechado no
texto quando (e se) o corte acontecer, e o servidor consegue recuperá-lo
mesmo perdendo a fala:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{
  "needsClarification": true/false,
  "scope": {
    "prospectName": "...", "businessName": "...", "segment": "...",
    "targetAudience": "...",
    "objectives": ["..."],
    "decisionMaker": true/false,
    "competitors": ["..."],
    "wantsSocialMedia": true/false,
    "wantsPaidTraffic": true/false,
    "branding": { "requested": true/false, "hasBrandBook": true/false, "wantsRebrand": true/false, "deliverables": "..." },
    "social": { "platforms": ["Instagram"], "postsPerWeek": 7, "storiesPerWeek": 0, "reelsPerMonth": 0, "needsCopy": true, "hasPhotos": false, "hasVideomaker": false, "needsVideoProduction": false, "creativesReady": false },
    "traffic": { "platforms": ["Meta Ads"], "monthlyAdBudget": "R$ 1.000" },
    "serviceMode": "monthly" | "one_off" | "umbrella" | "unsure",
    "budgetRange": "balcao" | "pacote" | "presenca" | "gestao" | "projeto",
    "deadline": "..."
  },
  "reply": "sua próxima fala (string, pt-BR) — NUNCA contém preço — escrita por ÚLTIMO"
}`;

function buildClaudeMessages(messages: ConvMsg[], currentMessage: string, scope: Record<string, unknown> | undefined) {
  const history = messages
    .filter((m) => m.role !== "system")
    .slice(-MAX_HISTORY)
    .map((m) => ({
      role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
      content: m.text,
    }));

  const scopeNote =
    scope && Object.keys(scope).length > 0
      ? `\n\n[Contexto interno — dados já captados: ${JSON.stringify(scope)}. Não repita perguntas já respondidas. Lembre-se: NUNCA cote preço e nunca peça e-mail. Se budgetRange ainda não estiver aqui, a pergunta da faixa de investimento é prioridade — não deixe para o fim.]`
      : "";

  return [
    ...history,
    { role: "user" as const, content: currentMessage + scopeNote },
  ];
}

function extractJson(text: string): Record<string, unknown> | null {
  const stripped = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  try {
    return JSON.parse(stripped.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

// ─── O CONSERTO DE 16/08: pacote cortado não pode levar o escopo junto ───────
//
// CASO REAL, piloto ao vivo. Duas vezes em três minutos a resposta do SDR foi
// barrada por `parse_error` e quem atendeu o CEO foi o motor de regras — sem
// ele saber. O estrago não foi a fala perdida; foi o que vinha JUNTO com ela.
//
// O SDR devolve UM pacote com duas cargas dentro: `reply` (a fala) e `scope`
// (os dados do briefing). Quando o JSON não abria, o pacote inteiro ia fora —
// as duas cargas. O CEO tinha dito "2 posts por dia" e "verba de R$ 500/mês";
// aquele `scope` virou pó. O painel passou a mostrar "0 posts/mês", e a casa
// devolveu R$ 1.800–3.400 com 3 posts/semana: nem a verba dele, nem o volume.
//
// A causa mecânica é banal e por isso mesmo passou despercebida: o teto de
// tokens corta a resposta no meio, o JSON nunca fecha, e `JSON.parse` recusa o
// texto inteiro — inclusive os campos que já tinham chegado completos.
//
// Daí as duas peças abaixo:
//
//  • `repararJsonTruncado` fecha à força as aspas, colchetes e chaves que
//    ficaram abertos, aproveitando o que chegou inteiro. É deliberadamente
//    conservador: se o remendo não virar JSON válido, devolve null. **Ele
//    nunca inventa conteúdo** — só termina de fechar o que o modelo abriu.
//    Nesta casa dado vem do que foi dito; a máquina não preenche lacuna.
//
//  • O escopo passa a sobreviver sozinho. Fala inutilizável e dado do cliente
//    são perdas de tamanhos MUITO diferentes: a fala o motor de regras refaz,
//    o número que o cliente falou uma vez ninguém recupera.
//
// O guarda NÃO foi afrouxado, e isso é regra: barrar continua melhor que
// empurrar lixo para o cliente. O que mudou é que barrar a fala deixou de
// significar jogar fora o briefing.
function repararJsonTruncado(text: string): Record<string, unknown> | null {
  const stripped = text.replace(/^```(?:json)?\s*/i, "").trim();
  const start = stripped.indexOf("{");
  if (start === -1) return null;

  const corpo = stripped.slice(start);
  const pilha: string[] = [];
  let dentroDeString = false;
  let escapado = false;

  for (const c of corpo) {
    if (escapado) { escapado = false; continue; }
    if (c === "\\" && dentroDeString) { escapado = true; continue; }
    if (c === '"') { dentroDeString = !dentroDeString; continue; }
    if (dentroDeString) continue;
    if (c === "{" || c === "[") pilha.push(c === "{" ? "}" : "]");
    else if (c === "}" || c === "]") pilha.pop();
  }

  // Corta um par `"chave":` ou uma vírgula pendurada no fim — restos que
  // sobram quando o corte cai bem no meio de um campo e que nenhum
  // fechamento de chave conserta.
  let remendo = corpo;
  if (dentroDeString) remendo += '"';
  remendo = remendo.replace(/,\s*$/, "").replace(/,?\s*"[^"]*"\s*:\s*$/, "");

  for (let i = pilha.length - 1; i >= 0; i--) remendo += pilha[i];

  try {
    const obj = JSON.parse(remendo) as unknown;
    return obj && typeof obj === "object" && !Array.isArray(obj)
      ? (obj as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

// ─── AS TRÊS TRAVAS DO SCOPE, NUM SÓ LUGAR ───────────────────────────────────
//
// Até 16/08 elas viviam soltas no corpo da rota, aplicadas uma única vez ao
// scope de um JSON limpo. A partir de agora o scope também pode chegar de um
// JSON REMENDADO (`repararJsonTruncado`, quando o pacote foi cortado) — e ele
// passa pelas MESMAS travas, sem atalho: dado recuperado de um pacote cortado
// não ganha passe livre por ter vindo de um caminho diferente. Duas cópias da
// mesma regra é como esta casa historicamente deixa uma delas ficar velha
// enquanto a outra muda — por isso a extração, não por estética.
//
// Guarda que existe em um caminho e não no outro é guarda que não existe.
function aplicarTravasDeEscopo(bruto: Record<string, unknown>): Record<string, unknown> {
  const scopePatch = { ...bruto };

  // E-mail comes from Google login; the negotiation itself happens after login
  // — so those never come from the chat, even if the model hallucinates them.
  // prospectPhone + preferredChannel ARE captured now (the client chooses how
  // they want to be reached: e-mail or WhatsApp).
  delete scopePatch.prospectEmail;
  delete scopePatch.negotiation;

  // NOME DA PESSOA NÃO É NOME DO NEGÓCIO — e aqui a regra é trava, não aviso.
  // 16/08/2026: o cliente confirmou "City Jobs" por voz, anexou o brand book
  // do City Jobs, e o pedido chegou ao Gerente de Projeto como "briefing da
  // Diego". A instrução JÁ existia no prompt e não bastou: nome errado na
  // origem vira cadastro, vira proposta e vira peça. Fail-closed — na dúvida
  // o campo some, e o resto da casa trata o negócio como desconhecido, que é
  // a verdade. Campo vazio é honesto; campo com o nome errado, não.
  const soLetras = (v: unknown) =>
    typeof v === "string" ? v.trim().toLowerCase().replace(/\s+/g, " ") : "";
  if (
    soLetras(scopePatch.businessName) &&
    soLetras(scopePatch.businessName) === soLetras(scopePatch.prospectName)
  ) {
    console.error("[sdr/chat] businessName igual ao prospectName — descartado");
    delete scopePatch.businessName;
  }

  // budgetRange passa a existir (decisão do CEO, 05/08/2026: a faixa é a
  // terceira pergunta), mas por ALLOWLIST, não por confiança. O modelo só pode
  // gravar um dos ids de faixa; número solto, texto livre ou faixa inventada
  // são descartados em silêncio. Fail-closed: sem faixa válida, o campo some e
  // o resto do sistema segue tratando a faixa como desconhecida — que é a
  // verdade. Faixa chutada é dado do cliente inventado.
  //
  // Guarda o RÓTULO, não o id: o painel público do briefing renderiza este
  // campo direto na tela ("Orçamento: ..."), e id interno não é linguagem de
  // cliente.
  const faixaNormalizada = normalizarFaixa(scopePatch.budgetRange);
  if (faixaNormalizada) scopePatch.budgetRange = faixaNormalizada;
  else delete scopePatch.budgetRange;

  return scopePatch;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const barrado = await limiteExcedido(req, "sdr-chat", 30, 60_000);
  if (barrado) return barrado as NextResponse;

  // Rota PÚBLICA: sem sessão e sem token, quem paga a conversa é resolvido
  // pelo servidor. `resolveProviderKey("claude")` sem workspace caía num
  // `findFirst` global — a chave da primeira agência do banco, gasta por
  // qualquer pessoa com um laço de requisições. Ver `lib/ai/chave-publica.ts`.
  const resolved = await chaveDeRotaPublica("claude");
  if (!resolved) {
    return NextResponse.json({ ok: false, reason: "not_configured" });
  }

  let body: ChatRequest;
  try {
    body = (await req.json()) as ChatRequest;
  } catch {
    return NextResponse.json({ ok: false, reason: "bad_request" }, { status: 400 });
  }

  if (!Array.isArray(body.messages) || typeof body.currentMessage !== "string") {
    return NextResponse.json({ ok: false, reason: "bad_request" }, { status: 400 });
  }

  // As duas chaves que amarram a conversa, resolvidas uma vez por turno.
  const fio = { sessionId: body.sessionId, clientRequestId: body.clientRequestId };

  const claudeMessages = buildClaudeMessages(body.messages, body.currentMessage, body.scope);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(CLAUDE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": resolved.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        messages: claudeMessages,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      console.error(`[sdr/chat] Claude HTTP ${res.status}`);
      await registrar({ ...fio, doVisitante: body.currentMessage, motivoDaRecusa: "provider_error" });
      return NextResponse.json({ ok: false, reason: "provider_error" });
    }

    // ── Ler stop_reason ANTES de julgar o JSON ────────────────────────────────
    // A Anthropic diz, no envelope da resposta, POR QUE ela parou de gerar.
    // `stop_reason === "max_tokens"` é CORTE — o teto acabou no meio da escrita.
    // Qualquer outro valor com um JSON que não fecha é OUTRA coisa: o modelo
    // terminou de escrever, e o que terminou de escrever não é JSON válido —
    // bug de formatação, não falta de espaço. As duas causas viravam o MESMO
    // `parse_error` no diário, e ninguém conseguia dizer qual das duas era o
    // dia a dia real do piloto. Ver o bloco "O CONSERTO DE 16/08" acima.
    const json = (await res.json()) as {
      content?: { type: string; text: string }[];
      stop_reason?: string;
    };
    const text = json.content?.[0]?.text ?? "";
    const cortadoPeloTeto = json.stop_reason === "max_tokens";

    // `extractJson` falhando não é mais o fim da linha — antes de desistir, a
    // seta que faltava: tenta fechar à força o que ficou aberto.
    let parsed = extractJson(text);
    let precisouDeRemendo = false;
    if (!parsed) {
      parsed = repararJsonTruncado(text);
      precisouDeRemendo = parsed !== null;
    }

    // Nada recuperável: nem o JSON limpo, nem o remendo. "truncado" quando a
    // própria API confirma que cortou; "malformado" quando ela diz que
    // terminou e o texto ainda assim não é JSON — duas causas, duas linhas
    // diferentes no diário (item 5 do despacho).
    if (!parsed) {
      const motivo = cortadoPeloTeto ? "truncado" : "malformado";
      await registrar({ ...fio, doVisitante: body.currentMessage, motivoDaRecusa: motivo });
      return NextResponse.json({ ok: false, reason: motivo });
    }

    const scopePatchBruto =
      parsed.scope && typeof parsed.scope === "object" && !Array.isArray(parsed.scope)
        ? (parsed.scope as Record<string, unknown>)
        : {};
    const scopePatch = aplicarTravasDeEscopo(scopePatchBruto);
    const temScopeUtil = Object.keys(scopePatch).length > 0;

    // A FALA SÓ É CONFIÁVEL QUANDO O JSON FECHOU SOZINHO. Um JSON que só
    // fechou porque NÓS forçamos o fechamento (`repararJsonTruncado`) pode ter
    // fechado uma frase bem no meio de uma palavra — o remendo garante um JSON
    // válido, nunca uma frase completa. Por isso, sempre que houve remendo (ou
    // a API confirma corte via stop_reason), a fala é tratada como não
    // confiável e é barrada — mesmo que o campo `reply` exista e não esteja
    // vazio. O guarda NÃO afrouxa: continua melhor barrar do que arriscar
    // devolver uma frase cortada ao cliente. O que muda é que o ESCOPO, que já
    // estava fechado no texto antes do corte (ver ordem do JSON no prompt),
    // sobrevive sozinho.
    const falaConfiavel = !precisouDeRemendo && !cortadoPeloTeto;
    const replyBruta =
      falaConfiavel && typeof parsed.reply === "string" ? parsed.reply.trim() : "";

    if (!replyBruta) {
      const motivo: "truncado" | "malformado" =
        precisouDeRemendo || cortadoPeloTeto ? "truncado" : "malformado";
      await registrar({
        ...fio,
        doVisitante: body.currentMessage,
        motivoDaRecusa: motivo,
        escopoFoiSalvo: temScopeUtil,
      });
      // O item 3 do despacho: a fala o motor de regras refaz; o número que o
      // cliente falou uma vez, ninguém recupera. Se sobrou escopo utilizável,
      // ele viaja mesmo com `ok: false` — o cliente (`PublicBriefingRoom.tsx`)
      // aplica esse scope via gap-fill mesmo quando a fala é descartada.
      return NextResponse.json({
        ok: false,
        reason: motivo,
        ...(temScopeUtil ? { scope: scopePatch } : {}),
      });
    }

    const replyText = replyBruta;

    // ⚠️ RECONCILIAÇÃO DE 16/08 — DUAS SESSÕES CONSERTARAM ESTE DEFEITO EM
    // PARALELO, E A REGRA DA OUTRA DEIXOU DE VALER POR CAUSA DESTA.
    //
    // A outra versão decidia a confiança na fala assim:
    //     const falaConfiavel = doParseNormal !== null || "scope" in parsed;
    // com o raciocínio: "o formato manda `reply` ANTES de `scope`, então escopo
    // presente prova que a fala já tinha fechado antes do corte".
    //
    // O raciocínio estava certo para o formato ANTIGO. Este conserto inverteu a
    // ordem do JSON no prompt de propósito — `scope` primeiro, `reply` por
    // último —, justamente para que o corte caia na fala e não no dado. Sob a
    // ordem nova, escopo presente **não prova nada** sobre a fala: prova o
    // contrário, que a fala é o que estava sendo escrito quando o teto bateu.
    // Manter aquela linha entregaria meia frase ao prospect exatamente nos
    // turnos em que ela é mais provável.
    //
    // Por isso vale o guarda estrito acima: fala vinda de remendo é sempre
    // barrada. Nunca reintroduza a heurística sem antes desfazer a ordem do
    // JSON no prompt — as duas coisas são uma só decisão.

    // ── Email guardrail ──────────────────────────────────────────────────────
    // Defence in depth: if the model slips into asking for / validating an e-mail
    // even though the user's message has no "@", reject the turn so the rule-based
    // engine (which no longer asks for e-mail) handles it instead.
    const msgHasAt = body.currentMessage.includes("@");
    const EMAIL_HALLUCINATION = /e-mail.*v[áa]lid|formato.*@|nome@dom[íi]nio|confirmar.*e-mail|e-mail.*formato|qual.*seu e-mail|seu e-mail/i;
    if (!msgHasAt && EMAIL_HALLUCINATION.test(replyText)) {
      console.warn("[sdr/chat] email-hallucination detected, falling back");
      // Turno barrado é o que MAIS interessa auditar — foi um erro do agente.
      // Grava a fala do visitante e o motivo, nunca o texto barrado.
      //
      // O JSON aqui abriu LIMPO — não houve corte nem remendo. O que foi
      // barrado foi a FALA (o modelo alucinou pedir e-mail), não o pacote.
      // O `scope` já passou pelas mesmas travas (`aplicarTravasDeEscopo`) lá
      // em cima, antes de sabermos se a fala seria barrada — então o dado que
      // o cliente realmente disse (nome, telefone, faixa de orçamento) não
      // tem nenhuma culpa no erro do agente e não pode ser jogado fora junto
      // com a frase ruim. Mesmo padrão de `truncado`/`malformado` acima.
      await registrar({
        ...fio,
        doVisitante: body.currentMessage,
        motivoDaRecusa: "email_hallucination",
        escopoFoiSalvo: temScopeUtil,
      });
      return NextResponse.json({
        ok: false,
        reason: "email_hallucination",
        ...(temScopeUtil ? { scope: scopePatch } : {}),
      });
    }

    // ── Price guardrail ──────────────────────────────────────────────────────
    // The SDR must NEVER quote a price in the conversation — the quote is built
    // only after Google login. If a price (R$ value) or discount language leaks
    // into the reply, reject the turn and fall back to the rule-based engine.
    //
    // ÚNICA exceção: a pergunta da faixa de investimento, que cita a régua
    // inteira de faixas (decisão do CEO, 05/08/2026). `ehPerguntaDeFaixa` é
    // estreita de propósito — ver `lib/agency/comercial/negociacao.ts`.
    const PRICE_LEAK = /r\$\s*\d|\d+\s*(reais|\/m[êe]s\b)|desconto|\bplano\b.*\bR\$/i;
    if (PRICE_LEAK.test(replyText) && !ehPerguntaDeFaixa(replyText)) {
      console.warn("[sdr/chat] price-leak detected, falling back");
      // Mesmo raciocínio do guarda de e-mail acima: o preço vazou na FALA, o
      // JSON abriu limpo, e o `scope` já filtrado não tem nada a ver com o
      // vazamento. Barrar a frase é certo; jogar fora o número de orçamento
      // que o cliente informou (ex.: a faixa "R$ 500/mês") junto com ela não
      // é — é o mesmo dado que o piloto de 16/08 quase perdeu.
      await registrar({
        ...fio,
        doVisitante: body.currentMessage,
        motivoDaRecusa: "price_leak",
        escopoFoiSalvo: temScopeUtil,
      });
      return NextResponse.json({
        ok: false,
        reason: "price_leak",
        ...(temScopeUtil ? { scope: scopePatch } : {}),
      });
    }

    await registrar({ ...fio, doVisitante: body.currentMessage, doSdr: replyText });

    return NextResponse.json({
      ok: true,
      reply: replyText,
      needsClarification: parsed.needsClarification === true,
      scope: scopePatch,
    });
  } catch (err) {
    const reason = err instanceof Error && err.name === "AbortError" ? "timeout" : "network_error";
    console.error(`[sdr/chat] ${reason}`);
    // Timeout e queda de rede também são história: sem esta linha, a fala do
    // visitante some justamente nos turnos em que o sistema falhou com ele.
    await registrar({ ...fio, doVisitante: body.currentMessage, motivoDaRecusa: reason });
    return NextResponse.json({ ok: false, reason });
  } finally {
    clearTimeout(timeout);
  }
}

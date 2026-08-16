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
// ⚠️ O TETO DE RITMO NÃO É TETO DE TAMANHO — e até 16/08/2026 esta rota só tinha
// o primeiro. `limiteExcedido` conta REQUISIÇÕES por IP; `MAX_HISTORY` conta
// TURNOS. O tamanho de cada `messages[].text` e do `currentMessage` era
// ilimitado, numa porta pública sem login que gasta a chave paga da agência
// (~US$ 18/min por IP, medido). O teto que existia morava num componente React,
// e atacante nenhum executa React. Ver `lib/security/teto-do-turno-publico.ts`.
// ⚠️ E1, 16/08/2026 — A GUARDA DO E-MAIL ERA DESARMADA POR UM PDF.
// `msgHasAt` perguntava "a pessoa escreveu arroba?" lendo `currentMessage`, e
// `currentMessage` vinha do navegador como `${texto}\n\n${dossiê dos anexos}`.
// Documento com e-mail dentro (rodapé de fornecedor, brand book) desligava a
// guarda — e, como o dossiê é remontado a cada turno, ela ficava desligada pelo
// resto da conversa. **Guarda cuja condição o cliente escreve não é guarda.**
// O texto da pessoa e o material do sistema passam a ser DOIS campos.
import {
  MAX_TURNOS,
  TETO_DA_MENSAGEM,
  contextoInternoSerializado,
  corpoGrandeDemais,
  historicoParaOModelo,
  montarMensagemDoTurno,
  separarMaterialColado,
} from "@/lib/security/teto-do-turno-publico";
import { chaveDeRotaPublica } from "@/lib/ai/chave-publica";
import { blocoDeNegociacaoParaPrompt, ehPerguntaDeFaixa, normalizarFaixa } from "@/lib/agency/comercial/negociacao";

const CLAUDE_URL  = "https://api.anthropic.com/v1/messages";
const MODEL       = "claude-sonnet-4-6";
const TIMEOUT_MS  = 30_000;
const MAX_HISTORY = MAX_TURNOS; // conversation turns sent to the model

interface ConvMsg { role: string; text: string }

interface ChatRequest {
  messages: ConvMsg[];
  /** SÓ o que a PESSOA digitou. Nada de anexo entra aqui. */
  currentMessage: string;
  /** O que o SISTEMA colou: dossiê dos anexos e o evento de anexo. Opcional —
   *  cliente antigo (aba aberta, JS em cache) ainda manda tudo em
   *  `currentMessage`, e `separarMaterialColado` cuida desse caso. */
  materialAnexado?: string;
  scope?: Record<string, unknown>;
}

const SYSTEM_PROMPT = `Você é a Consultora de Briefing da Dioli Digital — agência de marketing com inteligência artificial. Posicionamento: "Estratégia humana. Execução inteligente."

Você é calorosa, curiosa e profissional. Fala como gente, não como script. Português do Brasil, sempre.

Seu trabalho nesta conversa é ENTENDER o que o cliente precisa — uma sondagem natural — e descobrir CEDO a faixa de investimento dele. Você NÃO cota preço e NÃO coleta contato aqui. Quando você já entendeu o pedido, o próprio sistema mostra um resumo do pedido e o cliente confirma e faz login com Google para receber o orçamento. A proposta é montada depois; a descoberta (inclusive a da faixa) é sua.

## COMO VOCÊ PENSA

Antes de responder, faça mentalmente estas perguntas:
1. O que o cliente JÁ me disse? (não repita perguntas já respondidas)
2. O que ainda FALTA para eu entender o pedido completo?
3. Qual é a pergunta MAIS NATURAL a fazer agora, dado o fluxo da conversa?

Você não segue um roteiro. Você ouve, captura tudo que o cliente deu, e pergunta só o que falta — na ordem que faz sentido para aquela conversa específica.

Se o cliente chegou na primeira mensagem já contando negócio, serviço e frequência, você NÃO repete as perguntas básicas. Você confirma o que entendeu e aprofunda o que falta.

## O QUE VOCÊ PRECISA ENTENDER (sem ordem fixa)

IDENTIDADE: nome da pessoa, nome do negócio.

NEGÓCIO: segmento, o que vende, objetivo principal, público-alvo, concorrentes/referências que admira.

SOCIAL MEDIA (se quiser): redes (Instagram, TikTok, LinkedIn…), posts/semana, stories, reels/mês, vídeo (tem videomaker? tem bruto? ou a Dioli produz?), fotos disponíveis, criativos prontos ou do zero, copy pela Dioli ou pelo cliente, identidade visual / brand book.

TRÁFEGO PAGO (se quiser): plataformas, verba de mídia mensal, pixel configurado.

CONTEXTO FINAL: prazo para começar, quem decide a contratação.

## REGRA DOS RECURSOS (a mais importante — NUNCA pule)

Sempre que o cliente disser que QUER um serviço, você descobre, com naturalidade, TRÊS coisas sobre AQUELE serviço — antes de seguir:

1. O QUE É PRECISO pra fazer? (ex.: vídeo precisa de gravação/bruto; design precisa de logo, cores, fotos; tráfego precisa de acesso à conta de anúncios.)
2. O CLIENTE JÁ TEM esse material? (fotos, vídeos, logo, criativos prontos, banco de mídia no Drive, acessos…)
3. COMO VAI SER FEITO? — o cliente entrega pronto · a equipe DELE produz · ou a Dioli/IA produz.

É OBRIGATÓRIO no briefing: se você não perguntar isso AGORA, a produção trava depois por falta de material. Não deixe NENHUM serviço pedido sem essas três respostas. Faça uma pergunta por vez, de forma leve — nunca em bloco.

## REGRAS ABSOLUTAS (NUNCA QUEBRE)

1. NUNCA COTE PREÇO. Não diga o preço de nada, não cite planos com preço, não dê estimativa, não fale "a partir de", não fale de desconto. ÚNICA EXCEÇÃO: os números das FAIXAS DE INVESTIMENTO, e só na pergunta da faixa (ver o bloco NEGOCIAÇÃO abaixo) — faixa é pergunta sobre o bolso dele, não é cotação. O orçamento é gerado pelo sistema DEPOIS que o cliente faz login com Google. Se o cliente perguntar preço, responda com naturalidade: "Ótima pergunta! Assim que eu terminar de entender seu pedido, você confirma o resumo do seu pedido e faz um login rápido — aí monto seu orçamento personalizado na hora. Pode deixar comigo. Me conta só mais uma coisa: [próxima pergunta]."

2. CONTATO. O e-mail vem do login com Google — NUNCA peça e-mail nem valide formato de e-mail, e nunca preencha prospectEmail. Se o cliente mandar algo que não é e-mail, JAMAIS trate como e-mail. MAS, perto do final (quando já entendeu o pedido), pergunte UMA vez, de forma natural: "Só pra fechar — como você prefere receber as novidades do seu projeto: por e-mail ou WhatsApp?" Se escolher WhatsApp, peça o número com DDD. Capture em preferredChannel ("email" ou "whatsapp") e, se for WhatsApp, em prospectPhone (só os dígitos, com DDD). Se escolher e-mail, deixe prospectPhone em branco.

3. A FAIXA NÃO VIRA COTAÇÃO. Você pergunta a faixa de investimento (é obrigatório — bloco NEGOCIAÇÃO), mas não devolve preço em cima dela, não diz "então o seu fica em X" e não promete o que cabe. Você registra a faixa e segue a sondagem.

## REGRAS DE CONVERSA

- UMA pergunta por vez. Sempre.
- Respostas curtas: 2 a 4 frases. Use o nome da pessoa para criar conexão.
- Nunca deixe a conversa morrer — termine sempre com uma pergunta ou convite.
- ESPELHE A LINGUAGEM DO CLIENTE. Repare em como ele fala. Se ele usa termos de marketing (reels, criativos, engajamento, tráfego), você pode usar também. Se ele é leigo (fala "vídeos", "fotos", "postar", "chamar cliente"), FALE SIMPLES — sem jargão. Quando um termo técnico for inevitável, explique em poucas palavras entre parênteses, ex.: "reels (vídeos curtos)", "criativos (as artes/imagens dos posts)". A pessoa nunca deve se sentir perdida nem burra por não conhecer o termo.
- Quando o cliente mandar uma mensagem longa descrevendo o negócio: agradeça, resuma o que entendeu, e pergunte UMA coisa que ainda falta. Nunca mude de assunto abruptamente.
- Mensagem de voz transcrita pode vir com nomes errados ("óleo de digital" = "Dioli digital"). Confirme apenas o ponto específico incerto.

${blocoDeNegociacaoParaPrompt()}

## MODALIDADE DE ENGAJAMENTO

Identifique naturalmente como o cliente quer entrar (isso ajuda o orçamento depois, mas você NÃO comenta preço):
- monthly: gestão mensal com escopo fixo
- one_off: projeto único com início e fim
- umbrella: parceria contínua, escopo evolui
- unsure: ainda investigando

## PROTOCOLO DE DESCOBERTA — cubra TUDO antes de fechar

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

## FECHAMENTO DA SONDAGEM

SÓ feche quando TODOS os pontos aplicáveis do protocolo acima estiverem cobertos. Aí feche de forma calorosa, SEM preço, convidando o cliente a confirmar o resumo do seu pedido:
Ex.: "Perfeito, [nome]! Já entendi tudo que o [negócio] precisa. Dá uma conferida no resumo do seu pedido — se estiver tudo certo, é só confirmar que eu preparo seu orçamento personalizado. 😊"
Se ainda faltar algum ponto, NÃO feche — faça a próxima pergunta.

## PREENCHIMENTO DO SCOPE

Traduza posts para postsPerWeek: "1 por dia" → 7; "3 na semana" → 3; "12 no mês" → 3.
Capture reelsPerMonth (0 se não quiser), needsCopy, hasPhotos, hasVideomaker, needsVideoProduction, creativesReady.
Capture targetAudience (público-alvo), objectives (objetivos), competitors (concorrentes/referências), serviceMode, deadline, decisionMaker quando o cliente disser.
Para tráfego: traffic.platforms. Para branding: branding.deliverables (o que precisa) e branding.hasBrandBook/wantsRebrand.
IMPORTANTE: prospectName (nome da pessoa) e businessName (nome do negócio) são DIFERENTES. Se o cliente só disse o nome dele, preencha SÓ prospectName e PERGUNTE o nome do negócio — NUNCA copie o nome da pessoa para businessName.
Devolva SEMPRE o scope ACUMULADO — tudo confirmado até agora. Omita campos que o cliente não disse. NUNCA preencha prospectEmail nem negotiation. PODE preencher preferredChannel ("email"|"whatsapp"), prospectPhone (só dígitos, com DDD, e só quando o cliente escolher WhatsApp e informar) e budgetRange — este último SÓ com um dos ids de faixa listados no bloco NEGOCIAÇÃO, nunca com um número solto nem com texto livre.

## FORMATO — retorne SOMENTE JSON válido, sem texto fora:
{
  "reply": "sua próxima fala (string, pt-BR) — NUNCA contém preço",
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
  }
}`;

/**
 * O que sobe ao modelo — e TUDO que sobe passa por teto.
 *
 * Quatro entradas do navegador, quatro tetos, todos no SERVIDOR:
 *   • o histórico (quantidade E soma dos tamanhos, cortando o turno mais antigo);
 *   • o que a PESSOA digitou;
 *   • o MATERIAL que o sistema colou (dossiê dos anexos e evento de anexo);
 *   • o contexto interno (`scope`), que também vem do navegador e também é colado.
 *
 * Devolve também `digitado`: é ele, e nunca o material, que as guardas sobre "o
 * que a pessoa disse" têm o direito de ler.
 */
function buildClaudeMessages(
  messages: unknown[],
  currentMessage: string,
  materialAnexado: string | undefined,
  scope: unknown,
): { turnos: { role: "user" | "assistant"; content: string }[]; digitado: string } {
  const { turnos } = historicoParaOModelo(messages, undefined, MAX_HISTORY);

  const contexto = contextoInternoSerializado(scope);
  const scopeNote = contexto.json
    ? `\n\n[Contexto interno — dados já captados: ${contexto.json}. Não repita perguntas já respondidas. Lembre-se: NUNCA cote preço e nunca peça e-mail. Se budgetRange ainda não estiver aqui, a pergunta da faixa de investimento é prioridade — não deixe para o fim.]`
    : "";

  // Cliente NOVO manda os dois campos. Cliente antigo manda tudo colado num só —
  // e aí o dossiê é reconhecido pela primeira linha dele e devolvido ao lado
  // certo, para que a guarda não seja desarmada por um cache de JavaScript.
  const colado = typeof materialAnexado === "string" && materialAnexado
    ? { digitado: currentMessage, material: materialAnexado }
    : separarMaterialColado(currentMessage);

  const turno = montarMensagemDoTurno(colado);

  return {
    turnos: [...turnos, { role: "user" as const, content: turno.texto + scopeNote }],
    digitado: turno.digitado,
  };
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

export async function POST(req: NextRequest): Promise<NextResponse> {
  // O portão MAIS BARATO vem primeiro, e ele acontece antes de o corpo ser
  // lido: `req.json()` de um corpo de 500 MB já é o dano, e nenhum teto de
  // depois do parse chega a tempo. Os tetos de conteúdo (abaixo, em
  // `buildClaudeMessages`) seguem valendo para corpo sem `content-length`.
  if (corpoGrandeDemais(req.headers)) {
    return NextResponse.json({ ok: false, reason: "too_large" }, { status: 413 });
  }

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

  // ⚠️ C2, 16/08/2026 — `materialAnexado` chega com o dossiê de anexos JÁ MONTADO
  // pelo navegador (`dossieDosAnexos`), cerca e marca inclusas. **Esta rota não
  // confere cerca nenhuma, e não teria como**: a marca é sorteada na máquina de
  // quem envia, e quem controla o navegador pode POSTar aqui sem cerca alguma.
  //
  // Isso é DECLARADO, não esquecido. Nesta porta o remetente escreve os dois
  // lados da cerca — ele digita o prompt —, então a cerca é higiene (e trava
  // real só contra documento hostil nas mãos de remetente honesto). As travas
  // que valem contra o remetente hostil são as daqui para baixo, e todas rodam
  // no servidor: os tetos de tamanho, o `PRICE_LEAK`, o descarte de
  // `prospectEmail`/`negotiation` e a lista de permissão de `budgetRange`.
  // Ver o cabeçalho de `dossieDosAnexos` e o teste
  // `__tests__/briefing/a-cerca-publica-e-higiene-a-trava-e-no-servidor.test.ts`.
  const { turnos: claudeMessages, digitado } = buildClaudeMessages(
    body.messages,
    body.currentMessage,
    body.materialAnexado,
    body.scope,
  );

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
        max_tokens: 1280,
        system: SYSTEM_PROMPT,
        messages: claudeMessages,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      console.error(`[sdr/chat] Claude HTTP ${res.status}`);
      return NextResponse.json({ ok: false, reason: "provider_error" });
    }

    const json = (await res.json()) as { content?: { type: string; text: string }[] };
    const text = json.content?.[0]?.text ?? "";
    const parsed = extractJson(text);

    if (!parsed || typeof parsed.reply !== "string" || !parsed.reply.trim()) {
      return NextResponse.json({ ok: false, reason: "parse_error" });
    }

    const scopePatch = parsed.scope && typeof parsed.scope === "object" ? (parsed.scope as Record<string, unknown>) : {};

    // E-mail comes from Google login; the negotiation itself happens after login
    // — so those never come from the chat, even if the model hallucinates them.
    // prospectPhone + preferredChannel ARE captured now (the client chooses how
    // they want to be reached: e-mail or WhatsApp).
    delete scopePatch.prospectEmail;
    delete scopePatch.negotiation;

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

    const replyText = parsed.reply.trim();

    // ── Email guardrail ──────────────────────────────────────────────────────
    // Defence in depth: if the model slips into asking for / validating an e-mail
    // even though the user's message has no "@", reject the turn so the rule-based
    // engine (which no longer asks for e-mail) handles it instead.
    //
    // ⚠️ E1 — a pergunta é sobre **o que a PESSOA digitou**, e por isso ela lê
    // `digitado`, nunca `body.currentMessage`. Antes lia o campo inteiro, com o
    // dossiê dos anexos colado dentro: um e-mail no rodapé de um PDF desarmava a
    // guarda pelo resto da conversa. Guarda cuja condição o cliente escreve não
    // é guarda.
    const msgHasAt = digitado.includes("@");
    const EMAIL_HALLUCINATION = /e-mail.*v[áa]lid|formato.*@|nome@dom[íi]nio|confirmar.*e-mail|e-mail.*formato|qual.*seu e-mail|seu e-mail/i;
    if (!msgHasAt && EMAIL_HALLUCINATION.test(replyText)) {
      console.warn("[sdr/chat] email-hallucination detected, falling back");
      return NextResponse.json({ ok: false, reason: "email_hallucination" });
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
      return NextResponse.json({ ok: false, reason: "price_leak" });
    }

    return NextResponse.json({
      ok: true,
      reply: replyText,
      needsClarification: parsed.needsClarification === true,
      scope: scopePatch,
    });
  } catch (err) {
    const reason = err instanceof Error && err.name === "AbortError" ? "timeout" : "network_error";
    console.error(`[sdr/chat] ${reason}`);
    return NextResponse.json({ ok: false, reason });
  } finally {
    clearTimeout(timeout);
  }
}

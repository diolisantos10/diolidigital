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
import { primeiraChaveDeRotaPublica, workspaceDaRotaPublica } from "@/lib/ai/chave-publica";
import { classificarFalhaDeProvedor } from "@/lib/ai/falha-de-provedor";
import { generate, ordemDePreferenciaDaCasa } from "@/lib/ai/generate";
import type { AiProvider } from "@/lib/ai/resolve-key";
import type { TurnoDeHistorico } from "@/lib/agency/intelligence/openai-schemas";
import { ehPerguntaDeFaixa, formaDoPrecoNaFala, normalizarFaixa } from "@/lib/agency/comercial/negociacao";
// ATÉ 16/08/2026 ESTA ROTA NÃO ESCREVIA NADA. Zero chamadas a `prisma.`: o SDR
// conversava, errava, e o diário do piloto mostrava `mensagens: 0` enquanto a
// conversa acontecia. O porquê e as travas estão no cabeçalho do módulo.
// `fioDaConversa` é reaproveitada aqui (16/08, despacho `seguranca/freio-por-
// sessao-no-sdr`) como identificador do SEGUNDO freio, o de sessão — ver o
// bloco logo antes de `POST`. Ela já higieniza o id vindo do navegador; não
// escreva uma segunda limpeza.
import {
  registrarTurnoDoSdr,
  fioDaConversa,
  falasDoSdrNoFio,
  type TurnoDoSdr,
} from "@/lib/agency/comercial/registro-da-conversa";
// ── O FREIO DA PERGUNTA REPETIDA, NO CAMINHO QUE ATENDE (24/08/2026) ─────────
// O conserto de 24/08 pôs `LIMITE_DE_INSISTENCIA` em `pergunta-sem-encaixe.ts`
// e ligou-o em `lib/agency/prospect-engine.ts` — o motor de REGRAS, que é o
// plano B e quase nunca atende. Este arquivo, que é quem atende, não mudou um
// byte. Medido em produção: dez turnos de vinte com a MESMA pergunta, seis
// deles seguidos. O freio agora mora aqui, e o limite continua vindo de LÁ —
// verdade escrita em dois lugares já está errada em um deles.
import {
  identificarPergunta, vezesJaPerguntada, segundaFormulacao, oQueDizerNoLugar,
  LIMITE_DE_INSISTENCIA, O_QUE_A_PERGUNTA_DE_IA_COLHE,
} from "@/lib/agency/comercial/pergunta-repetida";
import { acrescentarRespostaSemEncaixe, O_QUE_A_PERGUNTA_COLHE } from "@/lib/agency/comercial/pergunta-sem-encaixe";
// ── O TETO DE GASTO DA PORTA DA RUA (24/08/2026) ────────────────────────────
// Os dois freios acima (`limiteExcedido`, por IP e por sessão) são de RITMO.
// Ritmo não é dinheiro: 30 chamadas por minuto de um prompt de ~10.700 tokens
// custam o que custam, e o teto de ritmo fica verde a fatura inteira. Ver
// `lib/ai/teto-de-custo.ts`.
import { podeGastarNaPortaPublica } from "@/lib/ai/teto-de-custo";
// A MONTAGEM DO PROMPT (SYSTEM_PROMPT + a ficha do cargo, via
// `sistemaDoSdr()`) saiu daqui e foi para `lib/agency/comercial/
// prompt-do-sdr.ts` (despacho `esteira`, 16/08 — segunda rodada). Motivo:
// `route.ts` é um arquivo de rota do Next, e o plugin de tipos do framework
// reprova no BUILD qualquer export que não seja um dos que ele reconhece
// (GET/POST/..., `dynamic`, etc.) — uma função qualquer exportada daqui passa
// no `tsc --noEmit` e no `npm test`, mas quebra o deploy. Prompt medido por
// teste não pode morar num arquivo com essa restrição. Ver o cabeçalho do
// módulo novo para o raciocínio completo.
import { sistemaDoSdr } from "@/lib/agency/comercial/prompt-do-sdr";
// "malformado" sozinho é um nome, não um achado — ver o cabeçalho do módulo.
// Ele devolve FORMA (houve `{`? sobrou texto fora? onde o parser desistiu?),
// nunca uma letra do que o modelo escreveu.
import { formaDaFalha, laudoEmUmaFrase } from "@/lib/agency/comercial/diagnostico-de-formato";

// ── `CLAUDE_URL` E `MODEL` FORAM REMOVIDOS EM 24/08/2026, E É O PONTO ────────
// Eram `"https://api.anthropic.com/v1/messages"` e `"claude-sonnet-4-6"`,
// escritos na mão no commit `da64e7cf` de 24/06 e nunca mais revistos. Enquanto
// isso o resto do produto escolhia provedor e modelo pela camada multi-IA.
// Quem decide os dois agora é `lib/ai/generate.ts` — pela chave e pelo modelo
// salvos em Integrações, pela fixação por cliente, ou pela preferência da casa.
// NÃO reintroduza nenhum dos dois aqui: um endereço de provedor dentro de uma
// rota é como este defeito nasceu, e ele custou 10 de 16 turnos do piloto.
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

/**
 * A conversa, no formato da CAMADA — histórico separado da fala da vez.
 *
 * Antes isto montava o corpo da Anthropic à mão (`buildClaudeMessages`), porque
 * a camada só sabia turno único. Agora ela sabe conversa (`OpenAIMessages.
 * historico`), e o SDR deixa de ter formato próprio: os mesmos turnos servem
 * Claude, OpenAI, Gemini e DeepSeek sem uma linha por provedor aqui.
 */
function montarConversa(messages: ConvMsg[], currentMessage: string, scope: Record<string, unknown> | undefined) {
  const historico: TurnoDeHistorico[] = messages
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

  return { historico, user: currentMessage + scopeNote };
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
// TETO DO REPARO — parecer do `seguranca`, 16/08/2026, PODE COM AJUSTE.
// As duas `.replace()` no fim desta função não são ancoradas e custam O(n²)
// em entrada grande; a rota é PÚBLICA, sem sessão. O teto tem de morar NA
// FUNÇÃO, não depender do `max_tokens` do chamador — que este mesmo dia já
// subiu duas vezes (1280 → 2600 → 3000). Teto amarrado a outro número é teto
// que alguém destrava sem perceber.
const TETO_DO_REPARO = 20_000;

export function repararJsonTruncado(text: string): Record<string, unknown> | null {
  if (typeof text !== "string" || text.length > TETO_DO_REPARO) return null;

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

  // FURO DO `qualidade`, 16/08/2026 — valor BARE pendurado no fim (número,
  // `true`, `false`, `null`) é o buraco que as trocas acima não cobriam. String
  // truncada tem marca ("Ana Doces e Bolos Personaliza" salta aos olhos); chave
  // pendurada sem valor já é removida acima. Um dígito cortado NÃO tem marca
  // nenhuma: `postsPerWeek:1` cortado de `14` parece tão válido quanto `1` de
  // verdade — e alimenta painel, dossiê do lead e detecção de pacote/preço sem
  // nenhum limite de sanidade no caminho. É exatamente o campo do incidente: o
  // SYSTEM_PROMPT manda traduzir "2 posts por dia" em `postsPerWeek: 14`.
  //
  // A regra, e por que ela não tem meio-termo: um valor bare no MEIO do texto,
  // seguido de `,`/`}`/`]` que o próprio modelo escreveu, está PROVADAMENTE
  // terminado — esse delimitador não é nosso, veio da resposta, e por isso
  // sobrevive intacto (a regex só olha o FIM do texto). Mas um valor bare que é
  // o ÚLTIMO caractere do texto — sem vírgula, sem fecha-chave, sem
  // fecha-colchete depois — é ambíguo por construção: não há como saber, só
  // olhando o texto, se `1` é o valor inteiro ou se era `14` e o corte caiu no
  // meio. Não se adivinha; o campo sai da mesa inteiro, igual à chave pendurada
  // sem valor duas linhas acima. Vale para número, `true`, `false`, `null` e
  // para um `nul` cortado também — nem chega a ser JSON válido, mas cai na
  // mesma vala.
  if (!dentroDeString) {
    remendo = remendo.replace(/,?\s*"[^"]*"\s*:\s*[+\-.\w]+\s*$/, "");
  }

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

// RECONCILIAÇÃO DE 16/08: a outra sessão resolvia esta mesma pergunta — "o
// escopo sobreviveu ao corte?" — com uma função `comDesfechoDoEscopo` que
// sufixava o motivo do diário (`truncado_escopo_salvo` / `_escopo_perdido`).
// Esta versão responde à mesma pergunta com um campo ESTRUTURADO,
// `escopoFoiSalvo` (`TurnoDoSdr`, em `registro-da-conversa.ts`), que o diário
// já lê e transforma na frase em português "O escopo (o que o cliente já
// tinha dito) foi salvo mesmo assim." — sem depender de `.includes()` num
// texto costurado. Campo estruturado > sufixo de string, e a função só era
// chamada de dentro do bloco de conflito que perdeu: mantê-la seria plantar
// código morto (D-003) no mesmo commit que existe para matar código morto.
// Removida de propósito — não reintroduza.

// ── A SEGUNDA CHANCE DO GUARDA DE PREÇO (24/08/2026) ────────────────────────
//
// O guarda `PRICE_LEAK` está certo e não se afrouxa: fala com valor em reais
// que não seja a régua inteira de faixas não sai daqui. O defeito nunca foi o
// guarda — foi o DESFECHO. Barrada a fala, o turno inteiro virava `{ok:false}`,
// o cliente ficava sem resposta e a conversa morria ali. Medido em produção:
// `price_leak ×1` em cada rodada, sempre no turno da pergunta da faixa, e
// sempre com a conversa parando.
//
// **O guarda barra a FALA, não a CONVERSA.** Esta função dá ao modelo uma
// segunda tentativa, com o corretivo específico do erro que ele acabou de
// cometer — e a fala nova passa pelo MESMO guarda, sem exceção. Se ela vazar
// preço de novo, o turno é barrado como sempre foi: a segunda chance é uma
// chance, não um perdão.
//
// Custo: uma chamada paga a mais, e só nos turnos em que o guarda pegou algo —
// que a medição mostra ser ~1 por conversa. Vale contra perder o turno inteiro.
const CORRETIVO_DE_PRECO =
  "\n\n[Correção do servidor: sua última fala foi BARRADA porque citou valor em reais. " +
  "Reescreva a fala SEM nenhum valor monetário — confirme com palavras (\"anotei sua faixa de investimento\"), " +
  "nunca com o número. ÚNICA exceção: a pergunta da faixa, que precisa citar a régua INTEIRA de faixas, " +
  "todos os degraus, nunca dois ou três deles. Mantenha o mesmo `scope`.]";

async function segundaChanceSemPreco(args: {
  escolha: { provider: AiProvider; chave: { apiKey: string; model?: string | null } };
  system: string;
  user: string;
  historico: TurnoDeHistorico[];
  contaDoWorkspace: string | null;
  guardaBarra: (fala: string) => boolean;
}): Promise<{ reply: string; scope: Record<string, unknown> } | null> {
  const r = await generate({
    system: args.system,
    user: args.user + CORRETIVO_DE_PRECO,
    historico: args.historico,
    maxTokens: MAX_TOKENS,
    timeoutMs: TIMEOUT_MS,
    tentativas: 1,
    cachearSistema: true,
    agentId: "comercial-sdr",
    contaDoWorkspace: args.contaDoWorkspace,
    chaveJaResolvida: {
      provider: args.escolha.provider,
      apiKey: args.escolha.chave.apiKey,
      model: args.escolha.chave.model ?? null,
    },
  });

  // A segunda chance exige pacote LIMPO. Nada de remendo aqui: `repararJson
  // Truncado` produz JSON válido, nunca frase completa — e uma frase cortada na
  // segunda tentativa entregaria ao cliente exatamente o que o guarda de corte
  // existe para impedir. Sem pacote limpo, não há segunda fala: o turno volta a
  // ser barrado como sempre foi.
  const texto = r.textoCru ?? "";
  const cortado = /^(max_tokens|length)$/i.test(r.motivoDeParada ?? "");
  const pacote = (r.ok && r.data && typeof r.data === "object" ? (r.data as Record<string, unknown>) : null) ?? extractJson(texto);
  if (!pacote || cortado) return null;

  const fala = typeof pacote.reply === "string" ? pacote.reply.trim() : "";
  if (!fala) return null;
  // O MESMO guarda, sem exceção. Se vazou de novo, não houve segunda fala.
  if (args.guardaBarra(fala)) return null;

  const bruto = pacote.scope && typeof pacote.scope === "object" && !Array.isArray(pacote.scope)
    ? (pacote.scope as Record<string, unknown>)
    : {};
  return { reply: fala, scope: aplicarTravasDeEscopo(bruto) };
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const barrado = await limiteExcedido(req, "sdr-chat", 30, 60_000);
  if (barrado) return barrado as NextResponse;

  // Rota PÚBLICA: sem sessão e sem token, quem paga a conversa é resolvido
  // pelo servidor. `resolveProviderKey("claude")` sem workspace caía num
  // `findFirst` global — a chave da primeira agência do banco, gasta por
  // qualquer pessoa com um laço de requisições. Ver `lib/ai/chave-publica.ts`.
  // Rota PÚBLICA: sem sessão e sem token, quem paga a conversa é resolvido pelo
  // servidor — e agora o PROVEDOR também. Anda na ordem de preferência da casa
  // (a mesma dos outros 29 caminhos de IA) resolvendo cada um pela regra desta
  // rota, nunca pelo `findFirst` global. Ver `lib/ai/chave-publica.ts`.
  const escolha = await primeiraChaveDeRotaPublica(ordemDePreferenciaDaCasa());
  if (!escolha) {
    return NextResponse.json({ ok: false, reason: "not_configured" });
  }
  const resolved = escolha.chave;

  let body: ChatRequest;
  try {
    body = (await req.json()) as ChatRequest;
  } catch {
    return NextResponse.json({ ok: false, reason: "bad_request" }, { status: 400 });
  }

  if (!Array.isArray(body.messages) || typeof body.currentMessage !== "string") {
    return NextResponse.json({ ok: false, reason: "bad_request" }, { status: 400 });
  }

  // ─── FREIO POR `sessionId` — parecer do `seguranca`, 16/08/2026 ────────────
  //
  // SOMADO ao freio de IP lá em cima, NUNCA no lugar dele: são defesas contra
  // ataques diferentes. O de IP pega a rajada disparada de UMA máquina. Este
  // pega o LAÇO QUE TROCA DE IP mas mantém o mesmo `sessionId` — ex.: um pool
  // de proxies atrás do mesmo script, em que cada IP novo abre uma cota de IP
  // inteira e intocada. Tirar um para pôr o outro é trocar de buraco.
  //
  // LIMITE E JANELA — a conta, não o gosto. Uma conversa de briefing real tem
  // 8 a 12 turnos (medida da casa). Cada turno "de verdade" pode custar mais
  // de UMA chamada a esta rota: comentário sobre anexo, áudio transcrito e
  // reenviado como mensagem, e reenvio depois de um turno barrado por um dos
  // guardas (`truncado`, `malformado`, `email_hallucination`, `price_leak`)
  // não avançam a conversa mas batem na rota de novo. Um fator de até 3x por
  // turno cobre isso: 12 × 3 = 36. O teto vai a 60, não a 36, porque o item 3
  // do despacho manda caber "com folga" — barrar cliente pagante no meio da
  // conversa é pior que a fatura, e 60 ainda é uma fração pequena do teto de
  // IP (1.800/hora). Janela de 30 minutos: tempo real de uma conversa de
  // briefing, com pausas para ler/pensar/anexar, cabe folgado aí dentro; e
  // mesmo assim um laço preso a este `sessionId` fica limitado a, no máximo,
  // 120 chamadas por hora — bem abaixo do pior caso por IP.
  const SESSAO_LIMITE = 60;
  const SESSAO_JANELA_MS = 30 * 60_000;

  // DECISÃO SOBRE `sdr:sem-sessao` (o fallback de `fioDaConversa` quando não
  // há id utilizável): quem chega sem `sessionId` cai TODO MUNDO no MESMO
  // balde, de propósito — um teto GLOBAL para tráfego anônimo, não "não
  // conta". A sala de briefing (`PublicBriefingRoom.tsx`) sempre cria um
  // `sessionId` ao montar; chegar sem ele é bug do cliente OU é ferramenta de
  // abuso que pulou o navegador — os dois casos pedem um teto MAIS apertado,
  // compartilhado, não um passe livre com bucket próprio. O efeito colateral
  // é real (dois visitantes sem sessão ao mesmo tempo dividem cota), mas é
  // raro (a sala sempre gera `sessionId`) e pesa menos que abrir uma porta
  // sem contagem nenhuma.
  const barradoPorSessao = await limiteExcedido(
    req,
    "sdr-chat-sessao",
    SESSAO_LIMITE,
    SESSAO_JANELA_MS,
    fioDaConversa(body.sessionId),
  );
  if (barradoPorSessao) return barradoPorSessao as NextResponse;

  // ⚠️ O QUE ESTA TRAVA NÃO PEGA — leia antes de confiar nela.
  //
  // `sessionId` vem do CORPO da requisição, do CLIENTE — e o cliente escreve
  // o que quiser. Quem quer abusar de verdade gera um `sessionId` novo (um
  // `crypto.randomUUID()` de uma linha) a CADA requisição: cada uma cai num
  // balde vazio e este freio nunca estoura para ela. Ele NÃO prova
  // identidade, NÃO prova retorno, e sozinho NÃO impede um laço que já sabe
  // trocar `sessionId` a cada chamada — trava que se acredita mais forte do
  // que é vale menos que trava nenhuma, porque produz confiança falsa.
  //
  // O que ele PEGA: o script (ou aba) que reusa — ou simplesmente esquece de
  // trocar — o mesmo `sessionId`, incluindo o caso citado no parecer do
  // `seguranca`: um pool de IPs atrás do MESMO cliente/sessão, que hoje
  // escapa do freio de IP porque cada IP novo abre cota de IP nova. E pega,
  // por construção, todo tráfego que chega sem `sessionId` nenhum (o balde
  // global `sdr:sem-sessao`, acima).
  //
  // O OUTRO LADO DA MESMA MOEDA — achado 1 do parecer de 16/08/2026: esta
  // trava não é só escapável, ela é ATACÁVEL. `sessionId` viaja no CORPO da
  // requisição: não é segredo, não é assinado, e nada aqui garante que o
  // valor pertence a quem o mandou. Quem DESCOBRE o `sessionId` de outra
  // pessoa — hoje, só observando a rede dela (proxy, extensão de navegador,
  // rede Wi-Fi compartilhada) — pode mandar 60 chamadas usando aquele MESMO
  // valor e QUEIMAR a cota da vítima: a conversa dela com o SDR leva 429 pelo
  // resto da janela de 30 min. Griefing de um lead específico, não vazamento
  // de dado nem gasto relevante de IA — mas é negação de serviço de verdade,
  // e foi esta trava que abriu a porta para ela.
  //
  // Até 16/08 essa porta era MAIOR do que "observar a rede": o valor gerado
  // pela sala (`PublicBriefingRoom.tsx`) era `"prospect-" + Date.now()` — um
  // relógio em milissegundos, SEM componente aleatório. Um script não
  // precisava observar nada: bastava tentar os poucos milissegundos prováveis
  // e ACERTAR o `sessionId` de um visitante por força bruta numa janela de
  // segundos. Isso foi FECHADO no mesmo despacho (`crypto.randomUUID()`
  // somado ao relógio) — força bruta deixou de ser viável. O que continua
  // ABERTO, e não tem conserto nesta frente: `sessionId` continua não sendo
  // segredo nem assinado, e observação de rede continua sendo caminho. Isto
  // está MITIGADO, não resolvido — o mesmo cookie httpOnly avaliado abaixo
  // fecharia esta metade também, e segue fora do escopo pelo mesmo motivo.
  //
  // AVALIADO E NÃO FEITO NESTA FRENTE: ancorar a sessão em algo que o
  // SERVIDOR controla — um cookie httpOnly assinado, atribuído no primeiro
  // `Set-Cookie` e só então usado como chave do balde — fecharia o buraco do
  // `sessionId` livremente forjável para um script ingênuo (que não trata
  // cookies cairia sempre no balde anônimo, em vez de escolher um balde
  // vazio à vontade). Mas não fecha para quem TRATA cookies (um `fetch` com
  // cookie jar próprio simplesmente descarta o que veio e recomeça do zero,
  // igual ao `sessionId` hoje). Fora do escopo desta frente porque exigiria o
  // MESMO tratamento em `/api/sdr/upload` e `/api/sdr/transcribe` — que
  // gastam a mesma chave paga e estão fora da lista de arquivos fechada
  // deste despacho — e porque a lista fechada já dita o mecanismo (item 1:
  // `fioDaConversa(body.sessionId)`). Registrado para o próximo parecer do
  // `seguranca` sobre este mesmo ponto, não decidido sozinho aqui.
  //
  // A defesa real contra o laço que troca `sessionId` E IP ao mesmo tempo
  // continua sendo o freio de IP (trocar IP tem custo de infraestrutura de
  // verdade) e, no limite, autenticação — que esta rota não tem porque é a
  // PRIMEIRA porta, antes do login.

  // As duas chaves que amarram a conversa, resolvidas uma vez por turno.
  const fio = { sessionId: body.sessionId, clientRequestId: body.clientRequestId };

  const { historico, user } = montarConversa(body.messages, body.currentMessage, body.scope);

  // ── O TETO DE GASTO, ANTES DE QUALQUER CHAMADA PAGA ───────────────────────
  //
  // Esta é a PORTA DA RUA: sem login, sem token, aberta à internet. Até aqui os
  // dois freios eram de ritmo (IP e sessão) e o gasto não tinha teto nenhum —
  // e nem dono: toda chamada logava `[custo-de-ia] chamada SEM workspace, fora
  // da conta`. Quem resolve a conta é a MESMA regra que resolve a chave
  // (`resolverWorkspacePublico`, via `workspaceDaRotaPublica`), para que
  // "quem paga" e "de quem é a conta" nunca respondam coisas diferentes sobre
  // o mesmo prospect.
  //
  // Falha fechada em todos os caminhos: sem dono, sem teto configurado ou com
  // o contador fora do ar, NÃO GASTA. E zero é zero — ver `teto-de-custo.ts`.
  // O visitante recebe `ok:false` e o motor de regras assume, exatamente como
  // no `not_configured` acima: a conversa continua, a chave paga é que para.
  const workspaceDaConta = await workspaceDaRotaPublica();
  const veredicto = await podeGastarNaPortaPublica(workspaceDaConta);
  if (!veredicto.pode) {
    await registrar({ ...fio, doVisitante: body.currentMessage, motivoDaRecusa: `teto_de_custo:${veredicto.motivo}` });
    return NextResponse.json({ ok: false, reason: "teto_de_custo" });
  }

  try {
    // ── O SDR PASSOU A FALAR PELA CAMADA MULTI-IA (24/08/2026) ───────────────
    //
    // Até aqui esta rota chamava `https://api.anthropic.com/v1/messages` na mão,
    // com `claude-sonnet-4-6` fixo no código desde 24/06 e nunca revisto —
    // enquanto PM, social, marca, design, operações e anúncios já escolhiam
    // provedor e modelo por `lib/ai/generate.ts`. Ordem do CEO: *"nossos
    // produtos podem ser utilizados por qualquer IA"*. Era o defeito de fundo
    // desta casa outra vez: um caminho herdando uma decisão que ninguém mais
    // tomaria hoje, porque ninguém tinha motivo para olhar.
    //
    // ⚠️ A CHAVE VAI PRONTA, e essa linha é de segurança. A camada, chamada da
    // porta comum, resolveria a chave com `resolveProviderKey(provider)` sem
    // workspace — o `findFirst` global que `lib/ai/chave-publica.ts` existe para
    // fechar. Aqui quem resolve continua sendo a regra da rota pública, provedor
    // por provedor, e a camada recebe a decisão já tomada.
    const r = await generate({
      system: sistemaDoSdr(),
      user,
      historico,
      maxTokens: MAX_TOKENS,
      timeoutMs: TIMEOUT_MS,
      tentativas: 1,
      // ── O CACHE, E O NÚMERO QUE O JUSTIFICA (24/08/2026) ──────────────────
      // O prompt do SDR tem ~10.700 tokens e é reenviado a CADA turno. Medido
      // numa conversa de 16 turnos: 171k dos 192k tokens de entrada eram o
      // mesmo texto repetido — ~US$ 0,65 por briefing, em produção, de puro
      // desperdício. É o caso exato para o qual o cache existe: prompt grande,
      // estável (nada de relógio nem aleatório dentro dele) e reusado dezenas
      // de vezes na mesma conversa.
      cachearSistema: true,
      agentId: "comercial-sdr",
      // A CONTA — e só a conta. `workspaceId` faria a camada resolver a chave no
      // cofre e aplicar a fixação de provedor por cliente, que é justamente o
      // que a rota pública não pode ter (ver `chaveJaResolvida` abaixo e o campo
      // `contaDoWorkspace` em `lib/ai/generate.ts`). Sem esta linha, todo turno
      // desta rota saía no log como "fora da conta" e não havia teto possível.
      contaDoWorkspace: workspaceDaConta,
      chaveJaResolvida: { provider: escolha.provider, apiKey: resolved.apiKey, model: resolved.model },
    });

    // ── AS QUATRO CONQUISTAS DESTA ROTA, PRESERVADAS ────────────────────────
    // `motivoDeParada` e `textoCru` são os dois campos que a camada passou a
    // devolver justamente para que nada abaixo se perdesse: a diferença entre
    // `truncado` e `malformado` (16/08), o remendo do JSON cortado, e a regra
    // de que o ESCOPO SOBREVIVE mesmo quando a fala é barrada.
    const motivoDeParada = r.motivoDeParada ?? null;
    const text = r.textoCru ?? "";

    if (!r.ok && !text) {
      // Falhou antes de produzir qualquer texto: erro de provedor, timeout ou
      // rede. Nada a resgatar — e o motivo vai para o diário como sempre foi.
      // ── O MOTIVO DE VERDADE, QUANDO A MENSAGEM O DIZ (24/08/2026) ───────
      // Em 24/08 o Claude caiu em produção por FALTA DE SALDO e este trecho
      // gravou `provider_error` 16 vezes. O placar e o diário repetiram
      // "provider_error", e nem o instrumento nem quem o lia tinham como saber
      // que o problema era a conta do provedor — que é a única causa desta
      // lista que NENHUMA pessoa da equipe resolve em código.
      //
      // `classificarFalhaDeProvedor` lê a mensagem do provedor (não o status,
      // que foi justamente o que enganou) e devolve o motivo real. Sem
      // reconhecer, cai em `provider_error` como sempre — a régua não inventa
      // categoria.
      const classificado = classificarFalhaDeProvedor(r.error);
      const motivo = /timeout/i.test(r.error) ? "timeout"
        : /rede/i.test(r.error) ? "network_error"
        : classificado === "sem_saldo" ? "sem_saldo_no_provedor"
        : classificado === "sem_chave" ? "sem_chave_no_provedor"
        : "provider_error";
      console.error(`[sdr/chat] ${r.error}`);
      await registrar({ ...fio, doVisitante: body.currentMessage, motivoDaRecusa: motivo });
      return NextResponse.json({ ok: false, reason: motivo });
    }

    // "cortado pelo teto" na língua de cada provedor: a Anthropic diz
    // `max_tokens`, os compatíveis com OpenAI dizem `length`, o Gemini diz
    // `MAX_TOKENS`. A pergunta é a mesma — a API confirma que cortou? — e a
    // resposta continua separando `truncado` de `malformado`.
    const cortadoPeloTeto = /^(max_tokens|length)$/i.test(motivoDeParada ?? "");

    // A camada já abriu o pacote quando conseguiu — inclusive pelo canal da
    // ferramenta, onde ele nunca foi texto. Só quando ela NÃO conseguiu é que
    // se cai no texto cru, no extrator e no remendo.
    let parsed = (r.ok && r.data && typeof r.data === "object" ? (r.data as Record<string, unknown>) : null)
      ?? extractJson(text);
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
      await registrar({
        ...fio,
        doVisitante: body.currentMessage,
        motivoDaRecusa: motivo,
        formaDaFalha: laudoEmUmaFrase(formaDaFalha(text)),
      });
      return NextResponse.json({ ok: false, reason: motivo });
    }

    const scopePatchBruto =
      parsed.scope && typeof parsed.scope === "object" && !Array.isArray(parsed.scope)
        ? (parsed.scope as Record<string, unknown>)
        : {};
    const scopePatch = aplicarTravasDeEscopo(scopePatchBruto);
    const temScopeUtil = Object.keys(scopePatch).length > 0;

    // `temScopeUtil` sozinho não basta para os guardas abaixo: ele confunde
    // "nada sobrou depois das travas" com "não havia nada para começar" — e
    // são fatos diferentes. `haviaEscopo` olha o `scope` ANTES das travas
    // (`scopePatchBruto`, calculado acima): se o modelo não extraiu NENHUM
    // campo, não houve perda nenhuma, só ausência de dado — a mesma regra que
    // separa `sem_canal` de `falhou` no aviso de orçamento. Só quando o
    // modelo extraiu algo E as travas descartaram tudo é que existe perda de
    // verdade para afirmar ao diário.
    const haviaEscopo = Object.keys(scopePatchBruto).length > 0;
    const escopoFoiSalvo = haviaEscopo ? temScopeUtil : undefined;

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
        escopoFoiSalvo,
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

    let replyText = replyBruta;
    let scopeDaVez = scopePatch;

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
        escopoFoiSalvo,
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
    // into the reply, the turn is rejected.
    //
    // ÚNICA exceção: a pergunta da faixa de investimento, que cita a régua
    // inteira de faixas (decisão do CEO, 05/08/2026). `ehPerguntaDeFaixa` é
    // estreita de propósito — ver `lib/agency/comercial/negociacao.ts`.
    //
    // ⚠️ O QUE MUDOU EM 24/08: **o guarda barra a fala, não a conversa.** Ele
    // continua exatamente tão estrito quanto era; o que deixou de acontecer é o
    // turno morrer com ele. Antes, uma fala barrada virava `{ok:false}` e a
    // conversa encerrava ali — medido em produção, uma vez por conversa, sempre
    // no turno da pergunta da faixa. Agora o modelo recebe o corretivo do erro
    // que cometeu e tem UMA segunda tentativa, que passa pelo MESMO guarda. Se
    // vazar de novo, o turno é barrado como sempre foi.
    const PRICE_LEAK = /r\$\s*\d|\d+\s*(reais|\/m[êe]s\b)|desconto|\bplano\b.*\bR\$/i;
    const vazaPreco = (fala: string) => PRICE_LEAK.test(fala) && !ehPerguntaDeFaixa(fala);

    if (vazaPreco(replyText)) {
      console.warn("[sdr/chat] price-leak detected, retrying once with the correction");
      // A FORMA, nunca a fala. Dois números fecham a pergunta que ficou aberta
      // em 24/08 ("é a exceção da régua não fechando, ou é cotação de verdade?"):
      // 2 degraus = o modelo abreviou as opções e a exceção corretamente não
      // fechou; 0 degraus com valor fora da régua = cotação, e o guarda pegou o
      // que existe para pegar. Ver `formaDoPrecoNaFala`.
      const forma = formaDoPrecoNaFala(replyText);
      const laudo =
        `${forma.degraus} degrau(s) da régua citado(s), ${forma.foraDaRegua} valor(es) fora dela` +
        ` (a exceção da pergunta de faixa exige 3 degraus e nenhum valor fora)`;

      const segunda = await segundaChanceSemPreco({
        escolha: { provider: escolha.provider, chave: { apiKey: resolved.apiKey, model: resolved.model } },
        system: sistemaDoSdr(),
        user,
        historico,
        contaDoWorkspace: workspaceDaConta,
        guardaBarra: vazaPreco,
      });

      if (segunda) {
        // A primeira fala continua no diário como turno barrado — foi um erro do
        // agente e é o que MAIS interessa auditar. O que mudou é o desfecho: a
        // conversa segue com a fala nova, e o motivo diz que a segunda pegou.
        await registrar({
          ...fio,
          doVisitante: body.currentMessage,
          motivoDaRecusa: "price_leak_refeito",
          formaDaFalha: laudo,
          escopoFoiSalvo,
        });
        replyText = segunda.reply;
        // O escopo da segunda volta manda: é o pacote inteiro daquela resposta.
        // Nunca vazio — `aplicarTravasDeEscopo` já rodou nele.
        if (Object.keys(segunda.scope).length > 0) scopeDaVez = segunda.scope;
      } else {
        console.warn("[sdr/chat] price-leak on the retry too, falling back");
        // Mesmo raciocínio do guarda de e-mail acima: o preço vazou na FALA, o
        // JSON abriu limpo, e o `scope` já filtrado não tem nada a ver com o
        // vazamento. Barrar a frase é certo; jogar fora o número de orçamento
        // que o cliente informou junto com ela não é.
        await registrar({
          ...fio,
          doVisitante: body.currentMessage,
          motivoDaRecusa: "price_leak",
          formaDaFalha: laudo,
          escopoFoiSalvo,
        });
        return NextResponse.json({
          ok: false,
          reason: "price_leak",
          ...(Object.keys(scopeDaVez).length > 0 ? { scope: scopeDaVez } : {}),
        });
      }
    }

    // ── ⛔ O FREIO DA PERGUNTA REPETIDA — A TERCEIRA VEZ NÃO EXISTE ──────────
    //
    // Aqui, e não no prompt. O prompt já diz *"UMA pergunta por vez"* e *"se o
    // cliente já disse algo, não repita"*: isso é aviso, e o aviso não pegou —
    // foi medido em produção, dez turnos de vinte com a MESMA pergunta, seis
    // deles seguidos. Prompt é aviso; código é trava.
    //
    // A CONTAGEM OLHA DUAS MEMÓRIAS e fica com a MAIOR. O histórico chega no
    // CORPO da requisição, escrito pelo cliente — um contador que só olha o que
    // o cliente mandou é um contador que o cliente zera mandando menos. A outra
    // memória é a da casa: as falas que ESTE servidor gravou no fio
    // (`falasDoSdrNoFio`). Histórico encurtado não abaixa a contagem; banco
    // indisponível não a apaga.
    //
    // A régua é a de `pergunta-sem-encaixe.ts`, IMPORTADA e não recopiada:
    //   1ª vez  — a pergunta como o modelo a escreveu;
    //   2ª vez  — a reformulação, que ADMITE que a casa não entendeu e oferece
    //             uma saída explícita ("não sei" é resposta válida);
    //   3ª vez  — não existe.
    //
    // E TODA PROIBIÇÃO TEM A INSTRUÇÃO GÊMEA: no lugar da terceira, a resposta
    // crua do cliente vira lacuna (com as palavras DELE, nunca reescritas) e a
    // conversa AVANÇA para a próxima pergunta em aberto — ou fecha a sondagem.
    // Proibir sem dizer o que fazer no lugar empurraria a máquina para o
    // silêncio, que é pior que a repetição: o cliente fica olhando uma tela
    // muda.
    const perguntaDaVez = identificarPergunta(replyText);
    if (perguntaDaVez) {
      const doCorpo = body.messages
        .filter((m) => m.role === "assistant" && typeof m.text === "string")
        .map((m) => m.text);
      const doBanco = await falasDoSdrNoFio(body.sessionId);
      const jaFeita = Math.max(
        vezesJaPerguntada(doCorpo, perguntaDaVez),
        vezesJaPerguntada(doBanco, perguntaDaVez),
      );

      if (jaFeita >= LIMITE_DE_INSISTENCIA) {
        // A instrução gêmea, nesta ordem: registra o que o cliente disse (cru) e
        // segue. A lacuna segura a confiança do orçamento lá embaixo e alguém
        // pergunta depois — fora do caminho crítico do cliente.
        const colhe =
          O_QUE_A_PERGUNTA_COLHE[perguntaDaVez] ??
          O_QUE_A_PERGUNTA_DE_IA_COLHE[perguntaDaVez] ??
          "um dado do pedido";
        const lacunas = acrescentarRespostaSemEncaixe(
          Array.isArray(scopeDaVez.lacunasDeEscopo) ? scopeDaVez.lacunasDeEscopo : undefined,
          perguntaDaVez,
          body.currentMessage,
          colhe,
        );
        const jaPerguntadas = [...new Set([...doCorpo, ...doBanco].map(identificarPergunta).filter((x): x is string => x !== null))];
        const escopoParaAFila = { ...(body.scope ?? {}), ...scopeDaVez };
        replyText = oQueDizerNoLugar(perguntaDaVez, escopoParaAFila, jaPerguntadas);
        scopeDaVez = { ...scopeDaVez, lacunasDeEscopo: lacunas };
        console.warn(`[sdr/chat] pergunta "${perguntaDaVez}" já feita ${jaFeita}x — registrada como lacuna, a conversa avança`);
      } else if (jaFeita === LIMITE_DE_INSISTENCIA - 1) {
        // A SEGUNDA vez nunca é a mesma frase. Repetir palavra por palavra é o
        // que faz a pessoa concluir que não foi lida.
        const outraFormulacao = segundaFormulacao(perguntaDaVez);
        if (outraFormulacao) {
          replyText = outraFormulacao;
          console.warn(`[sdr/chat] pergunta "${perguntaDaVez}" na 2ª vez — reformulada`);
        }
      }
    }

    await registrar({ ...fio, doVisitante: body.currentMessage, doSdr: replyText });

    return NextResponse.json({
      ok: true,
      reply: replyText,
      needsClarification: parsed.needsClarification === true,
      scope: scopeDaVez,
    });
  } catch (err) {
    const reason = err instanceof Error && err.name === "AbortError" ? "timeout" : "network_error";
    console.error(`[sdr/chat] ${reason}`);
    // Timeout e queda de rede também são história: sem esta linha, a fala do
    // visitante some justamente nos turnos em que o sistema falhou com ele.
    await registrar({ ...fio, doVisitante: body.currentMessage, motivoDaRecusa: reason });
    return NextResponse.json({ ok: false, reason });
  }
}

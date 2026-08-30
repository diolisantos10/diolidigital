// SDR re-negotiation. When the client rejects or asks to revise the proposal,
// the SDR steps back in: reads the objection, answers with empathy and value,
// and — if the objection is price — offers a better condition WITHOUT going
// below the margin floor (pricing-margins.ts → floorPrice). It then re-opens
// a proposal so the client can decide again. Prices come from the budget agent;
// the SDR only negotiates within them.

import { prisma } from "@/lib/db/client";
import { computeEstimate, volumeDeclarado, detectPackage } from "@/lib/agency/live-calculator";
import { SOCIAL_MARGINS } from "@/lib/agency/pricing-margins";
import { createApprovalRequest } from "@/lib/agency/persistence/approval-service";
import { generate } from "@/lib/ai/generate";
import {
  estimativaEntregue,
  comEstimativa,
  faixaDoOrcamento,
  type EstimativaGuardada,
} from "@/lib/agency/esteira/orcamento-do-briefing";

const money = (n: number) => `R$ ${Math.round(n).toLocaleString("pt-BR")}`;

export async function negotiateProposal(clientRequestId: string, objection: string | undefined): Promise<void> {
  const req = await prisma.clientRequestDb.findUnique({ where: { id: clientRequestId } });
  if (!req) return;

  const scope = (() => { try { return JSON.parse(req.briefingJson ?? "{}")?.scope ?? {}; } catch { return {}; } })();
  const briefingScope = scope as Parameters<typeof computeEstimate>[0];
  const est = computeEstimate(briefingScope);

  // ═══ O PISO REAL DA NEGOCIAÇÃO (achado investigando o fixture do teste C1,
  // 29/08/2026 — `.despachos/C1b-fixture-do-teste.md`) ═══════════════════════
  //
  // Isto ERA `const floor = est.totalMin` — e desde a tabela de preço fechado
  // (25/08/2026, ver o cabeçalho de `live-calculator.ts`: "Preço fechado, não
  // faixa. `minPrice === maxPrice`"), cada plano social tem UM preço só, e é o
  // ÚNICO contribuinte de `totalMin`/`totalMax` em `computeEstimate` — logo
  // `est.totalMin === est.totalMax` para QUALQUER escopo, sempre (prova:
  // `totalMin`/`totalMax` só recebem `+= pkg.minPrice`/`+= pkg.maxPrice`, e os
  // dois campos do plano são o MESMO número). Com o piso lido de
  // `est.totalMin`, a trava logo abaixo (`newTotal >= floor && newTotal <
  // est.totalMax`) não tinha NENHUM valor possível — o conjunto válido era
  // vazio para todo cliente. Toda negociação de preço, desde 25-26/08,
  // terminava sem nunca mudar o total: `newTotal` virava `null` sempre, e o
  // SDR só reforçava valor, silenciosamente.
  //
  // O piso comercial de verdade já existe, aprovado pelo CEO e documentado em
  // `pricing-margins.ts` (`floorPrice`, ~70% do preço de tabela — "o quanto a
  // casa aceita descontar"). Só não estava sendo lido aqui, apesar do
  // comentário original deste arquivo já prometer isso ("the floor/margin
  // guardrail is enforced server-side (pricing-margins.ts)"). A TRAVA em si
  // (`>= floor && < totalMax`, linhas abaixo) não muda — só a FONTE do
  // `floor`. Sem plano social detectável (escopo só de tráfego/identidade,
  // que não somam a `totalMin`), cai de volta em `est.totalMin` — sem plano,
  // não há piso de margem para consultar.
  const postsPerWeek = volumeDeclarado(briefingScope.social);
  const pkgId = postsPerWeek ? detectPackage(postsPerWeek * 4) : null;
  const floor = pkgId ? SOCIAL_MARGINS[pkgId].floorPrice : est.totalMin; // piso comercial — o SDR nunca vai abaixo.

  const sys = "Você é um SDR negociador de uma agência de marketing brasileira. Missão: manter o negócio vivo com empatia e reforço de valor. Se a objeção for preço, ofereça uma condição melhor SEM furar o piso informado. Fale simples e caloroso — o cliente não é da área de marketing. Responda SOMENTE JSON válido.";
  const user = `A cliente ${req.businessName} pediu revisão ou recusou a proposta.
Objeção dela: "${objection || "não especificou"}"
Proposta atual: ${money(est.totalMin)} a ${money(est.totalMax)} por mês.
PISO — nunca vá abaixo disso: ${money(floor)} por mês.
Se a objeção for preço e fizer sentido, sugira um novo total (>= piso). Senão, mantenha o valor e reforce o retorno.
Responda em JSON: {"message":"resposta calorosa e negociadora, 2 a 4 frases, em pt-BR","newTotal": <número >= piso, ou null>}`;

  const r = await generate({ system: sys, user, maxTokens: 500, workspaceId: req.workspaceId ?? undefined, preferredProvider: "claude", agentId: "comercial-negociacao", clientId: req.clientId ?? null });
  const data = (r.ok ? r.data : {}) as { message?: string; newTotal?: number | null };
  const message = data.message?.trim()
    || "Oi! Entendi você. Vamos achar um caminho que caiba no seu momento — me conta o que seria ideal pra você e eu vejo uma condição especial. 💛";

  // Guardrail: only accept a negotiated total that respects the floor and is a
  // real reduction. The budget agent owns the numbers; the SDR only moves inside them.
  const newTotal =
    typeof data.newTotal === "number" && data.newTotal >= floor && data.newTotal < est.totalMax
      ? Math.round(data.newTotal)
      : null;

  await prisma.portalMessage.create({
    data: { clientRequestId, authorRole: "team", authorName: "SDR Dioli", body: message, readByTeam: false },
  });

  // ═══ FONTE ÚNICA DO PREÇO (29/08/2026, ordem C1 do CEO) ══════════════════
  //
  // MEDIDO: esta função escrevia o valor negociado APENAS dentro do texto
  // (`priceLine`/`reviewNote`) do card de aprovação. `GET
  // /api/portal/briefing/proposta` — a página que o cliente abre para
  // DECIDIR — lê `briefingJson.estimate` (`estimativaEntregue`,
  // `orcamento-do-briefing.ts`), que esta função nunca tocava. Resultado: o
  // card mostrava o preço negociado, a página mostrava o preço ANTIGO — duas
  // verdades sobre dinheiro, uma delas na tela que o cliente realmente usa
  // para aprovar.
  //
  // O conserto: o preço negociado passa a viver na MESMA fonte que
  // `estimativaEntregue` lê, com o MESMO merge que `orcamento-do-briefing.ts`
  // já usa (`comEstimativa` — reaproveitada, não reinventada). O texto do
  // card (`priceLine`) deixa de ser a fonte e passa a ser DERIVADO do que foi
  // gravado, pela MESMA régua que formata para o cliente
  // (`faixaDoOrcamento`) — nenhuma terceira formatação de `Math.round`.
  //
  // A base é a estimativa já ENTREGUE ao cliente (`estimativaEntregue`), não
  // um `computeEstimate(scope)` recalculado do zero: preserva itens,
  // objetivos e as demais notas que a sala de briefing já tinha escrito.
  // `est` (acima) continua existindo só para o TETO da negociação (`est.totalMax`)
  // — a trava logo acima (`newTotal >= floor && newTotal < est.totalMax`) não muda.
  const baseEstimativa: EstimativaGuardada = estimativaEntregue(req.briefingJson) ?? est;
  const novaEstimativa: EstimativaGuardada = newTotal
    ? { ...baseEstimativa, totalMin: newTotal, totalMax: newTotal }
    : baseEstimativa;
  const briefingComPrecoNegociado = comEstimativa(req.briefingJson, novaEstimativa);

  // Re-open a proposal so the client can approve again — with the negotiated
  // price if one was agreed, otherwise the same offer plus the SDR's message.
  const itensDaEstimativa = novaEstimativa.items ?? [];
  const deliverables = itensDaEstimativa.length
    ? itensDaEstimativa.map((it) => `• ${it.label}${it.detail ? ` — ${it.detail}` : ""}`).join("\n")
    : "• Escopo combinado no briefing";
  const priceLine = newTotal
    ? `Total (condição especial): ${faixaDoOrcamento(novaEstimativa)}`
    : `Total: ${faixaDoOrcamento(novaEstimativa)}`;
  const proposalText =
`Proposta ajustada — ${req.businessName}

✨ O QUE VOCÊ RECEBE
${deliverables}

💰 INVESTIMENTO
${priceLine}

✅ Se ficar bom pra você, é só aprovar aqui embaixo que a gente começa.`;

  const approval = await createApprovalRequest({ clientRequestId, department: "proposal", requestedBy: "SDR", clientVisible: true });
  await prisma.approvalRequest.update({ where: { id: approval.id }, data: { reviewNote: proposalText } });
  // ═══ O ESTADO É O DA PROPOSTA NORMAL — E NÃO PODE SER OUTRO ═══════════════
  //
  // MEDIDO AO VIVO (29/08/2026, `curl`): esta linha gravava `scope_ready`, e o
  // cliente que pedia ajuste caía num beco com as duas portas da proposta
  // dizendo coisas OPOSTAS sobre o mesmo estado, e as duas mentindo:
  //
  //   GET  /api/portal/briefing/proposta → `decidivel:false`,
  //        "a proposta ainda está sendo montada" → a tela não desenha botão;
  //   POST /api/portal/briefing/aceite   → **409** "Esta proposta já foi
  //        respondida" — e o cliente nunca respondeu.
  //
  // Logo acima desta linha a casa cria um `ApprovalRequest` VISÍVEL ao cliente
  // com a frase "é só aprovar aqui embaixo que a gente começa". A proposta
  // ajustada produz, para o cliente, o MESMO artefato que a proposta normal —
  // então ela tem de nascer no MESMO estado que a proposta normal
  // (`orcamento-do-briefing.ts`, `status: "proposal_pending"`).
  //
  // ⛔ NÃO conserte isto pelo outro lado, acrescentando `scope_ready` a
  // `ESPERANDO_DECISAO_DA_PROPOSTA`. `scope_ready` é escrito em DOIS lugares
  // com significados opostos: aqui ("o cliente decide") e em
  // `lib/dioli-brain/run-auto-scope.ts` ("o cérebro gerou o escopo, a AGÊNCIA
  // revisa" — é o crachá "N para revisar" de `app/agency/requests/page.tsx`).
  // Alargar a lista deixaria o cliente aprovar sozinho um escopo que a agência
  // ainda não viu. Um nome de estado carregando dois fatos opostos é a doença;
  // alargar a lista espalharia a doença.
  //
  // ⚖️ POR QUE `proposal_pending` E NÃO `negotiation`, que também está na lista:
  // `negotiation` pertence a OUTRO vocabulário. Ele é palavra da máquina V2
  // (`estados-v2/maquina.ts`), que vive na coluna `estadoCanonico` — coluna
  // diferente desta. Em `status`, `negotiation` é invisível para a casa
  // inteira: não está em `ClientRequestStatus` (`client-requests.ts`), não tem
  // ramo em `esteira/fases.ts` (cairia na SONDAGEM — a mentira dos 27 minutos
  // de "Conhecendo o seu negócio · 0%"), não está em `ESTADOS_COM_PROPOSTA`
  // (`esteira/proposta-parada.ts` — a proposta ajustada nunca entraria na
  // varredura do que está parado), não tem filtro em `/agency/requests` e é
  // EXPLICITAMENTE dispensado de régua de SLA em
  // `v2-recovery/detector-de-parados.ts`. Seria trocar um beco por uma fila
  // invisível. `proposal_pending` é lido pelos cinco.
  //
  // O `briefingJson` grava JUNTO, na mesma escrita: é o que faz o preço
  // negociado virar a fonte que `estimativaEntregue`/`precoAceito` leem —
  // sem isso, `proposal_pending` mudaria de status e a página da proposta
  // continuaria mostrando o número velho.
  await prisma.clientRequestDb.update({
    where: { id: clientRequestId },
    data: { status: "proposal_pending", briefingJson: briefingComPrecoNegociado },
  });
}

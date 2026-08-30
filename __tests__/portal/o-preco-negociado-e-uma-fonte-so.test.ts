// O PREÇO NEGOCIADO VIRA A FONTE — e ela é UMA SÓ (ordem C1 do CEO, 29/08/2026).
//
// ═══ O DEFEITO MEDIDO (citado na ficha de despacho) ═══════════════════════════
//
// `negotiateProposal` calculava o novo total, escrevia o número dentro do
// TEXTO do card de aprovação (`ApprovalRequest.reviewNote`) e NUNCA em
// `briefingJson.estimate` do `ClientRequestDb`. Só que `GET
// /api/portal/briefing/proposta` — a página que o cliente abre para DECIDIR —
// lê `estimativaEntregue(briefingJson)`, não o `reviewNote`. Resultado: o card
// mostrava o preço negociado, a página da proposta mostrava o preço ANTIGO.
// Duas verdades sobre dinheiro, e a que o cliente usa para aprovar era a
// errada.
//
// ═══ O QUE ESTE ARQUIVO PROVA ═════════════════════════════════════════════════
//
//   1. Depois de `negotiateProposal`, `GET /api/portal/briefing/proposta`
//      devolve o preço NEGOCIADO — batendo na ROTA de verdade, não só no
//      retorno interno da função (é a régua literal do CEO: "teste isto
//      batendo na rota, não só checando o retorno interno").
//   2. O texto do CARD e o texto da PÁGINA vêm da MESMA fonte: mudar o valor
//      negociado numa segunda rodada muda os DOIS juntos — prova de
//      acoplamento, não de coincidência.
//   3. O ACEITE congela o preço daquele instante (Metade B). Uma renegociação
//      POSTERIOR muda a fonte corrente e NÃO reescreve o que já foi aceito.
//   4. O piso/teto da negociação continua de pé: um `newTotal` fora da faixa
//      NUNCA aparece em lugar nenhum que o cliente lê.
//
// ═══ A PROVA DE QUE A LEITURA REALMENTE DEPENDE DA ESCRITA (a "reprodução
// do defeito", sem precisar reverter o código-fonte) ══════════════════════════
//
// `reproduzirDefeitoOriginal()`, no fim deste arquivo, faz exatamente o que a
// função ANTIGA fazia: cria/atualiza um `ApprovalRequest` com o preço NOVO no
// `reviewNote` e propositalmente NÃO toca em `briefingJson`. Se, depois disso,
// `GET /proposta` ainda mostrar o preço ANTIGO enquanto o card mostra o preço
// NOVO — isso PROVA que a coincidência anterior (card e página concordando)
// vinha da escrita em `briefingJson`, e não de outro mecanismo escondido. Não
// substitui rodar a suíte com o `git diff` revertido — isso cabe ao PM, que
// tem o portão (`tsc`/`vitest`) — mas prova, dentro da própria suíte, que o
// acoplamento é real.
//
// ═══ O QUE É REAL, O QUE É DUBLADO ════════════════════════════════════════════
//
// **O BANCO É DE VERDADE** (SQLite, `prisma db push` num arquivo dedicado) —
// mesmo padrão de `__tests__/portal/o-ajuste-nao-vira-beco.test.tsx`. Só o
// provedor de IA (`generate`, que decide o `newTotal` sugerido pelo SDR) é
// dublado — é o único jeito de controlar determinísticamente o que a
// "negociação" produz a cada rodada.

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { execSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { NextRequest } from "next/server";

// `vi.mock` é hoisted para o TOPO do arquivo — acima de qualquer `import` e
// de qualquer `const` comum. Estado referenciado dentro da factory precisa
// estar em `vi.hoisted(...)`, senão vira TDZ na hora do `vi.mock` rodar (mesmo
// padrão de `__tests__/portal/o-ajuste-nao-vira-beco.test.tsx`).
const DB_PATH = vi.hoisted(() => {
  const caminho = `${process.cwd()}/prisma/preco-negociado-e-uma-fonte.db`;
  process.env.DATABASE_URL = `file:${caminho}`;
  return caminho;
});

/** O que a IA (SDR negociador) devolve nesta rodada — controlado por teste. */
const ia = vi.hoisted(() => ({ newTotal: null as number | null }));
vi.mock("@/lib/ai/generate", () => ({
  generate: vi.fn(async (): Promise<{ ok: boolean; data: { message: string; newTotal: number | null } }> => ({
    ok: true,
    data: { message: "Consigo uma condição especial pra você.", newTotal: ia.newTotal },
  })),
}));

import { prisma } from "@/lib/db/client";
import { negotiateProposal } from "@/lib/agency/execution/negotiate-proposal";
import { GET as lerProposta } from "@/app/api/portal/briefing/proposta/route";
import { POST as decidirProposta } from "@/app/api/portal/briefing/aceite/route";
import { computeEstimate, volumeDeclarado, detectPackage } from "@/lib/agency/live-calculator";
import { SOCIAL_MARGINS } from "@/lib/agency/pricing-margins";
import { faixaDoOrcamento, type EstimativaGuardada } from "@/lib/agency/esteira/orcamento-do-briefing";
import { precoCongeladoNoAceite, marcarAceite } from "@/lib/agency/esteira/caminho-automatico";
import type { BriefingScope } from "@/lib/agency/briefing-conversation";

/** O escopo do cliente fictício — estável entre rodadas, para que o piso
 *  comercial (`pricing-margins.ts`, via `detectPackage`) e o teto
 *  (`computeEstimate(scope).totalMax`) não se movam sozinhos entre uma
 *  negociação e outra. */
const SCOPE: BriefingScope = {
  businessName: "Padaria da Prova Teste",
  segment: "alimentação",
  objectives: ["Vender mais no delivery"],
  wantsSocialMedia: true,
  social: { platforms: ["Instagram"], postsPerWeek: 3, storiesPerWeek: 3, reelsPerMonth: 2 },
};

const ESTIMATIVA_ORIGINAL = computeEstimate(SCOPE);

// ═══ FLOOR — a mesma fonte que `negotiateProposal` usa, não `totalMin` ═══════
//
// Desde a tabela de preço fechado (25/08/2026), CADA plano social tem UM
// preço só (`minPrice === maxPrice` em `live-calculator.ts`) e é o ÚNICO
// contribuinte de `totalMin`/`totalMax` em `computeEstimate` — logo
// `ESTIMATIVA_ORIGINAL.totalMin === ESTIMATIVA_ORIGINAL.totalMax` para
// QUALQUER escopo, sempre. Esta fixture usava `totalMin` como piso, e por
// isso `N1`/`N2` sempre caíam EM CIMA do teto (290 === 290) — não um erro de
// arredondamento, um piso e teto estruturalmente iguais. `negotiateProposal`
// tinha o MESMO defeito (consertado em `lib/agency/execution/
// negotiate-proposal.ts` nesta mesma rodada): o piso real de negociação é o
// piso COMERCIAL de `pricing-margins.ts` (`floorPrice`, ~70% do preço de
// tabela), não `totalMin`. Este fixture usa a fonte de verdade — a MESMA que
// o código de produção consulta agora — em vez de reinventar um piso.
const postsPerWeek = volumeDeclarado(SCOPE.social);
const pkgId = postsPerWeek ? detectPackage(postsPerWeek * 4) : null;
if (!pkgId) throw new Error("fixture: SCOPE sem plano social detectável — não há piso de margem para negociar");
/** Um valor negociado válido: acima do piso comercial, abaixo do teto (preço de tabela do plano). */
const FLOOR = SOCIAL_MARGINS[pkgId].floorPrice;
const CEILING = ESTIMATIVA_ORIGINAL.totalMax;
const N1 = Math.round(FLOOR + (CEILING - FLOOR) * 0.3) || FLOOR; // primeira rodada
const N2 = Math.round(FLOOR + (CEILING - FLOOR) * 0.7) || FLOOR; // segunda rodada — DIFERENTE de N1
const ABAIXO_DO_PISO = Math.max(1, FLOOR - 500);

let clientRequestId = "";
let portalToken = "";

async function pedidoAtual() {
  return prisma.clientRequestDb.findUniqueOrThrow({ where: { id: clientRequestId } });
}

async function cardMaisRecente() {
  return prisma.approvalRequest.findFirstOrThrow({
    where: { clientRequestId, department: "proposal" },
    orderBy: { createdAt: "desc" },
  });
}

async function textoDaPagina(): Promise<{ texto: string | null; decidivel: boolean; status: string }> {
  const res = await lerProposta(new NextRequest(`http://localhost/api/portal/briefing/proposta?token=${portalToken}`));
  expect(res.status).toBe(200);
  return (await res.json()) as { texto: string | null; decidivel: boolean; status: string };
}

/** Reproduz, de propósito, o que a função ANTIGA (pré-conserto) fazia: grava o
 *  novo preço SÓ no `reviewNote` do card e não toca em `briefingJson`. Ver a
 *  explicação completa no cabeçalho do arquivo. */
async function reproduzirDefeitoOriginal(precoQueOCardMostraria: number): Promise<void> {
  const card = await cardMaisRecente();
  const texto = `Proposta ajustada — reprodução do defeito\n\n💰 INVESTIMENTO\nTotal (condição especial): ${faixaDoOrcamento({ totalMin: precoQueOCardMostraria, totalMax: precoQueOCardMostraria })}`;
  await prisma.approvalRequest.update({ where: { id: card.id }, data: { reviewNote: texto } });
  // Propositalmente: NENHUMA escrita em `briefingJson` aqui.
}

beforeAll(async () => {
  if (existsSync(DB_PATH)) rmSync(DB_PATH);
  execSync("npx prisma db push --accept-data-loss", {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: `file:${DB_PATH}` },
    stdio: "pipe",
  });

  const briefingJson = JSON.stringify({ scope: SCOPE, estimate: ESTIMATIVA_ORIGINAL as EstimativaGuardada });
  const pedido = await prisma.clientRequestDb.create({
    data: {
      businessName: "Padaria da Prova Teste",
      services: JSON.stringify(["social"]),
      status: "proposal_pending",
      briefingJson,
    },
  });
  clientRequestId = pedido.id;

  const acesso = await prisma.portalAccess.create({ data: { clientRequestId } });
  portalToken = acesso.token;
});

afterAll(async () => {
  await prisma.$disconnect();
  if (existsSync(DB_PATH)) rmSync(DB_PATH);
});

describe("piso/teto da faixa negociável — sanidade do fixture", () => {
  it("N1 e N2 são válidos (>= piso, < teto) e DIFERENTES entre si", () => {
    expect(N1).toBeGreaterThanOrEqual(FLOOR);
    expect(N1).toBeLessThan(CEILING);
    expect(N2).toBeGreaterThanOrEqual(FLOOR);
    expect(N2).toBeLessThan(CEILING);
    expect(N1).not.toBe(N2);
  });
});

describe("1. depois de negociar, a ROTA que o cliente abre mostra o preço NOVO", () => {
  it("GET /api/portal/briefing/proposta reflete o valor negociado, não o antigo", async () => {
    ia.newTotal = N1;
    await negotiateProposal(clientRequestId, "achei caro");

    const pagina = await textoDaPagina();
    const precoNovo = faixaDoOrcamento({ totalMin: N1, totalMax: N1 });
    const precoAntigo = faixaDoOrcamento({ totalMin: ESTIMATIVA_ORIGINAL.totalMin, totalMax: ESTIMATIVA_ORIGINAL.totalMax });

    expect(pagina.texto, "a página da proposta não mudou depois da negociação").toContain(precoNovo);
    expect(pagina.texto, "a página ainda mostra o preço ANTIGO — a mesma divergência medida em produção").not.toContain(precoAntigo);

    // A fonte é o `briefingJson`, não um efeito colateral do texto do card.
    const pedido = await pedidoAtual();
    const estimateGravado = JSON.parse(pedido.briefingJson ?? "{}").estimate as EstimativaGuardada;
    expect(estimateGravado.totalMin).toBe(N1);
    expect(estimateGravado.totalMax).toBe(N1);
  });
});

describe("2. o CARD e a PÁGINA vêm da MESMA fonte — provado por MUDANÇA, não coincidência", () => {
  it("uma segunda rodada com valor DIFERENTE muda os dois textos JUNTOS", async () => {
    ia.newTotal = N2;
    await negotiateProposal(clientRequestId, "ainda tá caro, dá pra ajudar mais?");

    const card = await cardMaisRecente();
    const pagina = await textoDaPagina();
    const precoN2 = faixaDoOrcamento({ totalMin: N2, totalMax: N2 });
    const precoN1 = faixaDoOrcamento({ totalMin: N1, totalMax: N1 });

    expect(card.reviewNote, "o card não atualizou para o segundo valor negociado").toContain(precoN2);
    expect(pagina.texto, "a página não atualizou para o segundo valor negociado").toContain(precoN2);

    // Nenhum dos dois deve ter ficado preso no valor da rodada anterior.
    expect(card.reviewNote).not.toContain(precoN1);
    expect(pagina.texto).not.toContain(precoN1);
  });
});

describe("3. o PISO e o TETO da negociação continuam de pé (trava de negotiate-proposal.ts)", () => {
  it("newTotal ABAIXO do piso nunca vira preço em lugar nenhum", async () => {
    ia.newTotal = ABAIXO_DO_PISO;
    await negotiateProposal(clientRequestId, "consegue fazer por bem menos?");

    const card = await cardMaisRecente();
    const pagina = await textoDaPagina();
    const precoFuraDaTrava = faixaDoOrcamento({ totalMin: ABAIXO_DO_PISO, totalMax: ABAIXO_DO_PISO });

    expect(card.reviewNote, "o piso vazou para o card").not.toContain(precoFuraDaTrava);
    expect(pagina.texto, "o piso vazou para a página").not.toContain(precoFuraDaTrava);
    // Como o `newTotal` foi rejeitado, a fonte mantém o último valor VÁLIDO (N2) — não regride para o original nem aceita o inválido.
    expect(pagina.texto).toContain(faixaDoOrcamento({ totalMin: N2, totalMax: N2 }));

    const pedido = await pedidoAtual();
    const estimateGravado = JSON.parse(pedido.briefingJson ?? "{}").estimate as EstimativaGuardada;
    expect(estimateGravado.totalMin).not.toBe(ABAIXO_DO_PISO);
  });

  it("newTotal NO TETO OU ACIMA (>= totalMax) também não vira preço", async () => {
    ia.newTotal = CEILING; // a trava é `< est.totalMax`, então o próprio teto já é inválido
    await negotiateProposal(clientRequestId, "e se fosse bem mais que isso?");

    const pagina = await textoDaPagina();
    const precoNoTeto = faixaDoOrcamento({ totalMin: CEILING, totalMax: CEILING });
    expect(pagina.texto, "o teto vazou para a página como preço aceito").not.toContain(precoNoTeto);
    // Continua valendo N2, o último negociado válido.
    expect(pagina.texto).toContain(faixaDoOrcamento({ totalMin: N2, totalMax: N2 }));
  });
});

describe("4. o ACEITE congela o preço daquele instante (Metade B) — renegociação depois NÃO reescreve", () => {
  it("aceitar grava um registro imutável com o preço corrente (N2)", async () => {
    const antes = await precoCongeladoNoAceite(clientRequestId);
    expect(antes, "não deveria haver preço congelado antes do aceite").toBeNull();

    const res = await decidirProposta(new NextRequest("http://localhost/api/portal/briefing/aceite", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: portalToken, decisao: "aceito" }),
    }));
    const corpo = (await res.json()) as { ok?: boolean };
    expect(res.status).toBe(200);
    expect(corpo.ok).toBe(true);

    const pedido = await pedidoAtual();
    expect(pedido.status === "accepted" || pedido.status === "in_progress", `status pós-aceite: ${pedido.status}`).toBe(true);

    const congelado = await precoCongeladoNoAceite(clientRequestId);
    expect(congelado, "o aceite não gravou o registro imutável do preço").not.toBeNull();
    expect(congelado!.estimativa.totalMin).toBe(N2);
    expect(congelado!.estimativa.totalMax).toBe(N2);
    expect(congelado!.congeladoEm, "faltou a data do congelamento").toBeTruthy();
  });

  it("renegociar DEPOIS do aceite muda a fonte corrente, mas NÃO o que já foi aceito", async () => {
    const N3 = Math.max(FLOOR, Math.round(FLOOR + (CEILING - FLOOR) * 0.5));
    ia.newTotal = N3;
    await negotiateProposal(clientRequestId, "será que dá pra revisar de novo?");

    const pedido = await pedidoAtual();
    const estimateCorrente = JSON.parse(pedido.briefingJson ?? "{}").estimate as EstimativaGuardada;
    expect(estimateCorrente.totalMin, "a fonte corrente deveria ter mudado para N3").toBe(N3);

    const congelado = await precoCongeladoNoAceite(clientRequestId);
    expect(congelado, "o registro do aceite sumiu depois de uma renegociação").not.toBeNull();
    expect(congelado!.estimativa.totalMin, "o registro do aceite foi REESCRITO por uma renegociação posterior — Metade B quebrada").toBe(N2);
    expect(congelado!.estimativa.totalMax).toBe(N2);
  });
});

describe("5. marcarAceite NÃO sobrescreve — a semântica do COALESCE, exercitada direto contra o banco real", () => {
  // ═══ A CAUSA MEDIDA (a ficha pedia para confirmar antes de escrever) ═══════
  //
  // A causa QUE A FICHA SUSPEITAVA — "o teste usa Prisma falso, e um mock de
  // `$executeRawUnsafe` não implementa `COALESCE`" — NÃO se confirmou: este
  // arquivo já roda contra SQLite de verdade desde o `beforeAll` no topo
  // (`execSync("npx prisma db push ...")`), não contra um mock.
  //
  // A causa real é outra: em nenhum lugar deste arquivo `marcarAceite` era
  // chamada DUAS VEZES para o mesmo pedido. O bloco 4 ("o ACEITE congela")
  // passa pela rota `POST /aceite`, que chama `marcarAceite` uma única vez; a
  // renegociação DEPOIS do aceite passa por `negotiateProposal`, que só
  // escreve em `briefingJson` e nunca toca `precoAceitoJson`/`precoAceitoEm`.
  // Sem uma SEGUNDA chamada a `marcarAceite`, a guarda `COALESCE(coluna, ?)`
  // nunca tem chance de proteger nada — o `UPDATE` roda uma vez só, com a
  // coluna começando `NULL`, e `COALESCE(NULL, ?)` e `?` sozinho produzem o
  // MESMO resultado. Tirar o `COALESCE` não muda o comportamento observável
  // do arquivo inteiro, com ou sem mock — por isso a suíte ficava verde.
  //
  // Este bloco fecha a lacuna chamando `marcarAceite` DIRETAMENTE, duas vezes,
  // com preços diferentes, contra o banco real — a opção 1 da ficha de
  // despacho: a única forma que prova a semântica do `COALESCE`, não só a
  // forma do SQL.
  it("a segunda chamada, com preço DIFERENTE, não sobrescreve o preço já congelado", async () => {
    const pedidoDireto = await prisma.clientRequestDb.create({
      data: {
        businessName: "Padaria da Prova Teste — marcarAceite direto",
        services: JSON.stringify(["social"]),
        status: "proposal_pending",
        briefingJson: JSON.stringify({ scope: SCOPE, estimate: { totalMin: N1, totalMax: N1 } }),
      },
    });

    const antes = await precoCongeladoNoAceite(pedidoDireto.id);
    expect(antes, "não deveria haver preço congelado antes da primeira chamada").toBeNull();

    await marcarAceite(pedidoDireto.id, JSON.stringify({ estimate: { totalMin: N1, totalMax: N1 } }));
    const primeiro = await precoCongeladoNoAceite(pedidoDireto.id);
    expect(primeiro, "a primeira chamada deveria ter congelado N1").not.toBeNull();
    expect(primeiro!.estimativa.totalMin).toBe(N1);
    expect(primeiro!.estimativa.totalMax).toBe(N1);

    // Segunda chamada — preço DIFERENTE (N2). Se o `COALESCE` for removido do
    // SQL de `marcarAceite`, este `UPDATE` sobrescreve e a asserção abaixo cai.
    await marcarAceite(pedidoDireto.id, JSON.stringify({ estimate: { totalMin: N2, totalMax: N2 } }));
    const depois = await precoCongeladoNoAceite(pedidoDireto.id);
    expect(depois, "o preço congelado sumiu na segunda chamada").not.toBeNull();
    expect(
      depois!.estimativa.totalMin,
      "a segunda chamada a marcarAceite REESCREVEU o preço já congelado — a guarda COALESCE não protegeu",
    ).toBe(N1);
    expect(depois!.estimativa.totalMax).toBe(N1);
  });
});

describe("A REPRODUÇÃO DO DEFEITO ORIGINAL — a prova de que a leitura depende da escrita", () => {
  it("🔴 sem gravar em `briefingJson`, a página volta a mostrar o preço ANTIGO mesmo com o card atualizado", async () => {
    // Preço-fonte corrente ANTES desta reprodução (deixado pela rodada N3 do bloco 4).
    const pedidoAntes = await pedidoAtual();
    const estimateAntes = JSON.parse(pedidoAntes.briefingJson ?? "{}").estimate as EstimativaGuardada;
    const precoQueAPaginaDeveriaContinuarMostrando = faixaDoOrcamento(estimateAntes);

    const PRECO_SO_NO_CARD = estimateAntes.totalMin! + 111; // qualquer valor novo, só para o card
    await reproduzirDefeitoOriginal(PRECO_SO_NO_CARD);

    const card = await cardMaisRecente();
    const pagina = await textoDaPagina();

    // O CARD muda (é só texto, sem trava) — exatamente como no defeito medido.
    expect(card.reviewNote).toContain(faixaDoOrcamento({ totalMin: PRECO_SO_NO_CARD, totalMax: PRECO_SO_NO_CARD }));
    // A PÁGINA não muda — continua lendo `briefingJson.estimate`, intocado por
    // `reproduzirDefeitoOriginal`. ESTA é a divergência que a ordem C1 mandou fechar.
    expect(pagina.texto, "reprodução do defeito: a página deveria ter ficado no preço antigo").toContain(precoQueAPaginaDeveriaContinuarMostrando);
    expect(pagina.texto).not.toContain(faixaDoOrcamento({ totalMin: PRECO_SO_NO_CARD, totalMax: PRECO_SO_NO_CARD }));
  });
});

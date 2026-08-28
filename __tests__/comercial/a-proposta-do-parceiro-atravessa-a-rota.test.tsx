// A PROPOSTA DO PARCEIRO, DA ROTA ATÉ O HTML QUE ELE LÊ.
//
// ═══ POR QUE ESTE ARQUIVO EXISTE (28/08/2026) ═══════════════════════════════
//
// No diagnóstico da jornada, uma mutação ficou viva e ela era a mais perigosa
// da lista: **"a rota da proposta esquece a parceria"** — trocar
// `parceriaVivaDoCliente(pedido.clientId)` por `null` na rota. Nenhum teste
// caiu. Nas minhas próprias palavras no PR: *"provo a régua e a fonte, não a
// ligação"*.
//
// É a doença que esta casa mediu onze vezes em 48 horas: as duas metades
// provadas isoladamente e **nada ligando as duas**. Um teste que monta o payload
// à mão e o entrega ao componente concorda com a tela sobre um dado que a rota
// pode nunca ter mandado.
//
// ═══ O QUE ESTE ARQUIVO FAZ DIFERENTE ══════════════════════════════════════
//
//   1. **Banco de verdade.** Não há mock de Prisma, nem de sessão, nem de
//      `validatePortalAccess`: o `PortalAccess` é uma linha real e a rota o lê.
//      `parceriaVivaDoCliente` roda de verdade, contra a mesma tabela que o
//      portão de pagamento consulta.
//   2. **A rota real é chamada** — `GET /api/portal/briefing/proposta`.
//   3. **O HTML é renderizado a partir do corpo QUE A ROTA DEVOLVEU**, nunca de
//      um objeto montado à mão. É esse encadeamento que torna a mutação
//      impossível de sobreviver: se a rota parar de preencher a isenção, o HTML
//      do parceiro perde a frase e o botão volta a convidar a pagar.
//
// ⛔ CUSTO ZERO: nenhuma chamada de IA, nenhum e-mail, nenhum pagamento, nada em
// produção. SQLite descartável.

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { execSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { NextRequest } from "next/server";
import { renderToStaticMarkup } from "react-dom/server";

const DB_PATH = vi.hoisted(() => {
  const caminho = `${process.cwd()}/prisma/proposta-parceiro-e2e.db`;
  process.env.DATABASE_URL = `file:${caminho}`;
  return caminho;
});

vi.mock("@/lib/ai/generate", () => ({
  generate: vi.fn(async () => ({ ok: false, error: "IA dublada — custo zero" })),
  anyProviderConfigured: vi.fn(async () => false),
}));

import { prisma } from "@/lib/db/client";
import { GET } from "@/app/api/portal/briefing/proposta/route";
import { CorpoDaProposta } from "@/app/proposta/[token]/page";
import { autorizarParceriaDoCliente } from "@/lib/agency/financeiro/parceria-do-parceiro";
import { TITULO_DA_ISENCAO } from "@/lib/agency/comercial/aviso-de-isencao";

let workspaceId = "";
let parceiroId = "";
let paganteId = "";
let tokenDoParceiro = "";
let tokenDoPagante = "";

const ESTIMATE = { totalMin: 2590, totalMax: 3400 };

/** Um pedido pronto para decisão, com número entregue. */
async function pedidoComProposta(clientId: string, nome: string) {
  return prisma.clientRequestDb.create({
    data: {
      workspaceId, clientId,
      businessName: nome,
      services: JSON.stringify(["social media"]),
      objectives: JSON.stringify(["aparecer para donos de restaurante"]),
      briefingJson: JSON.stringify({ estimate: ESTIMATE, scope: { businessName: nome } }),
      // `proposal_pending` é um dos ESPERANDO_DECISAO_DA_PROPOSTA: é o estado em
      // que os botões existem, e é neles que o rótulo importa.
      status: "proposal_pending",
    },
  });
}

async function chamarRota(token: string) {
  const res = await GET(
    new NextRequest(`http://localhost/api/portal/briefing/proposta?token=${encodeURIComponent(token)}`),
  );
  return res.json();
}

/** O HTML que o cliente LÊ, montado com o corpo que a ROTA devolveu. */
function htmlDaProposta(dados: unknown, token: string) {
  return renderToStaticMarkup(
    <CorpoDaProposta
      dados={dados as Parameters<typeof CorpoDaProposta>[0]["dados"]}
      token={token}
      enviando={null}
      resposta={null}
      erro={null}
      onDecidir={() => {}}
    />,
  );
}

beforeAll(async () => {
  if (existsSync(DB_PATH)) rmSync(DB_PATH);
  execSync("npx prisma db push --accept-data-loss", {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: `file:${DB_PATH}` },
    stdio: "pipe",
  });

  const ws = await prisma.agencyWorkspace.create({
    data: { name: "Dioli Digital", slug: `proposta-${Date.now()}` },
  });
  workspaceId = ws.id;

  const parceiro = await prisma.client.create({ data: { workspaceId, name: "FOOCCI" } });
  parceiroId = parceiro.id;
  const pagante = await prisma.client.create({ data: { workspaceId, name: "Padaria do João" } });
  paganteId = pagante.id;

  const r = await autorizarParceriaDoCliente({
    clientId: parceiroId,
    autorizadaPor: "Dioli Santos (CEO), citando D-0B9",
    validaAte: new Date(Date.now() + 30 * 24 * 3600 * 1000),
    escopo: "social media — piloto de parceria",
    pecasContratadas: 12,
    tetoDeIaCentavosUsd: 500,
  });
  if (!r.ok) throw new Error(`parceria não autorizada: ${r.recusa}`);

  const pedidoParceiro = await pedidoComProposta(parceiroId, "FOOCCI");
  const pedidoPagante = await pedidoComProposta(paganteId, "Padaria do João");

  // ⚠️ ACESSO REAL, não mock: a rota deriva o dono DESTE token.
  const aP = await prisma.portalAccess.create({
    data: { clientRequestId: pedidoParceiro.id, clientId: parceiroId, token: `tok-parceiro-${Date.now()}` },
  });
  tokenDoParceiro = aP.token;
  const aG = await prisma.portalAccess.create({
    data: { clientRequestId: pedidoPagante.id, clientId: paganteId, token: `tok-pagante-${Date.now()}` },
  });
  tokenDoPagante = aG.token;
});

afterAll(async () => {
  await prisma.$disconnect().catch(() => {});
  if (existsSync(DB_PATH)) rmSync(DB_PATH);
});

describe("a ROTA da proposta carrega a isenção — a mutação que sobrevivia", () => {
  it("1. com parceria viva, a rota devolve `isencaoDeParceria` preenchida", async () => {
    const corpo = await chamarRota(tokenDoParceiro);

    expect(
      corpo.isencaoDeParceria,
      "a rota esqueceu a parceria — o parceiro abre a proposta e vê preço e um botão de comprar",
    ).toBeTruthy();
    expect(corpo.isencaoDeParceria.autorizadaPor).toContain("Dioli Santos");
    expect(corpo.isencaoDeParceria.escopo).toContain("parceria");
    expect(corpo.decidivel).toBe(true);
  });

  it("2. ⛔ cliente PAGANTE não ganha isenção — a rota devolve `null`", async () => {
    const corpo = await chamarRota(tokenDoPagante);
    expect(corpo.isencaoDeParceria).toBeNull();
    expect(corpo.decidivel).toBe(true);
  });

  it("3. ⛔ parceria REVOGADA fecha a porta na própria rota — fail-closed", async () => {
    await prisma.parceriaDoCliente.update({ where: { clientId: parceiroId }, data: { revogadaEm: new Date() } });
    expect(
      (await chamarRota(tokenDoParceiro)).isencaoDeParceria,
      "uma parceria revogada continuou isentando na tela do cliente",
    ).toBeNull();
    await prisma.parceriaDoCliente.update({ where: { clientId: parceiroId }, data: { revogadaEm: null } });
  });

  it("4. ⛔ parceria VENCIDA idem — a validade é conferida a cada leitura", async () => {
    await prisma.parceriaDoCliente.update({
      where: { clientId: parceiroId },
      data: { validaAte: new Date(Date.now() - 24 * 3600 * 1000) },
    });
    expect((await chamarRota(tokenDoParceiro)).isencaoDeParceria).toBeNull();
    await prisma.parceriaDoCliente.update({
      where: { clientId: parceiroId },
      data: { validaAte: new Date(Date.now() + 30 * 24 * 3600 * 1000) },
    });
  });
});

describe("o HTML que o parceiro LÊ — renderizado com o corpo QUE A ROTA DEVOLVEU", () => {
  it("5. a isenção aparece, e aparece ANTES do número — a posição é a ordem", async () => {
    const corpo = await chamarRota(tokenDoParceiro);
    const html = htmlDaProposta(corpo, tokenDoParceiro);

    const ondeIsencao = html.indexOf(TITULO_DA_ISENCAO);
    expect(ondeIsencao, "a frase da isenção não saiu no HTML do parceiro").toBeGreaterThan(-1);

    // O número aparece no corpo do orçamento, e tem de vir DEPOIS: se ele
    // encontrar o preço primeiro, já leu uma cobrança, e a frase que desmente
    // chega tarde.
    const ondeNumero = html.search(/2\.?590|3\.?400/);
    expect(ondeNumero, "o valor de referência sumiu do HTML — o teste não está medindo a tela certa").toBeGreaterThan(-1);
    expect(
      ondeIsencao,
      "o parceiro lê o preço ANTES de saber que não paga — a ordem da tela se inverteu",
    ).toBeLessThan(ondeNumero);
  });

  it("6. o botão NÃO convida a pagar quem não paga", async () => {
    const corpo = await chamarRota(tokenDoParceiro);
    const html = htmlDaProposta(corpo, tokenDoParceiro);

    expect(html).toContain("Aceitar o escopo e começar");
    // "Aceitar e começar" ao lado de um preço é um botão de compra.
    expect(html).not.toContain(">Aceitar e começar<");
  });

  it("7. o HTML diz que nada será cobrado, e traz o prazo da parceria", async () => {
    const corpo = await chamarRota(tokenDoParceiro);
    const html = htmlDaProposta(corpo, tokenDoParceiro);

    expect(html).toContain("100% isento");
    expect(html).toMatch(/vale at[ée]/i);
  });

  it("8. ⛔ o PAGANTE não vê nada disso — nem a frase, nem o rótulo do parceiro", async () => {
    const corpo = await chamarRota(tokenDoPagante);
    const html = htmlDaProposta(corpo, tokenDoPagante);

    expect(html).not.toContain("100% isento");
    expect(html).not.toContain("Aceitar o escopo e começar");
    expect(html).toContain("Aceitar e começar");
  });

  it("9. ⛔ parceria revogada: a tela do parceiro VOLTA a ser a do pagante", async () => {
    await prisma.parceriaDoCliente.update({ where: { clientId: parceiroId }, data: { revogadaEm: new Date() } });
    const corpo = await chamarRota(tokenDoParceiro);
    const html = htmlDaProposta(corpo, tokenDoParceiro);

    expect(html).not.toContain("100% isento");
    expect(html).toContain("Aceitar e começar");
    await prisma.parceriaDoCliente.update({ where: { clientId: parceiroId }, data: { revogadaEm: null } });
  });
});

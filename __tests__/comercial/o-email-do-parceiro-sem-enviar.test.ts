// A PERNA DO E-MAIL, PROVADA SEM MANDAR E-MAIL NENHUM.
//
// ═══ POR QUE ESTE ARQUIVO EXISTE (28/08/2026) ═══════════════════════════════
//
// No diagnóstico da jornada eu declarei: *"a perna do e-mail não foi disparada
// — isso mandaria e-mail, e era proibido"*. A proibição continua de pé e não é
// negociável: **nenhum e-mail sai para pessoa real nesta suíte.**
//
// Mas "não mandar" e "não provar" são coisas diferentes. `sendEmail` é o único
// ponto de saída (`lib/email/send.ts`), e ele é dublado aqui: a rodada de
// orçamento roda inteira, chega até a porta, e o que passaria por ela é
// **medido em vez de enviado** — destinatário e corpo.
//
// A pergunta que o CEO fez em 27/08 foi *"por que o orçamento não chegou no
// e-mail?"*. É essa pergunta que este arquivo responde, e ela tem duas metades:
// para ONDE iria, e o QUE diria.
//
// ⛔ O que continua NÃO provado, e fica declarado: que o Resend aceita a
// mensagem e que ela chega à caixa de entrada. Isso só se prova enviando, e
// enviar é proibido. O que se prova aqui é tudo que a casa controla.

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { execSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";

const DB_PATH = vi.hoisted(() => {
  const caminho = `${process.cwd()}/prisma/email-parceiro-e2e.db`;
  process.env.DATABASE_URL = `file:${caminho}`;
  return caminho;
});

// ⛔ A PORTA DE SAÍDA, DUBLADA. Nada sai desta suíte.
const sendEmail = vi.hoisted(() =>
  vi.fn(async (): Promise<{ ok: boolean; skipped?: boolean; error?: string }> => ({ ok: true })),
);
vi.mock("@/lib/email/send", () => ({ sendEmail }));

vi.mock("@/lib/ai/generate", () => ({
  generate: vi.fn(async () => ({ ok: false, error: "IA dublada — custo zero" })),
  anyProviderConfigured: vi.fn(async () => false),
}));

import { prisma } from "@/lib/db/client";
import { entregarOrcamentosPendentes } from "@/lib/agency/esteira/orcamento-do-briefing";
import { autorizarParceriaDoCliente } from "@/lib/agency/financeiro/parceria-do-parceiro";

type Enviado = { to: string; subject: string; html: string };
const enviados = (): Enviado[] =>
  (sendEmail.mock.calls as unknown as Array<[Enviado]>).map((c) => c[0]);

let workspaceId = "";
let parceiroId = "";

const EMAIL_DO_BRIEFING = "marcos@foocci.com.br";

beforeAll(async () => {
  if (existsSync(DB_PATH)) rmSync(DB_PATH);
  execSync("npx prisma db push --accept-data-loss", {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: `file:${DB_PATH}` },
    stdio: "pipe",
  });

  const ws = await prisma.agencyWorkspace.create({
    data: { name: "Dioli Digital", slug: `email-${Date.now()}` },
  });
  workspaceId = ws.id;

  // ⚠️ O CADASTRO NASCE SEM E-MAIL — é o caso do primeiro cliente real. O único
  // endereço que existe é o que ele digitou no briefing.
  const parceiro = await prisma.client.create({ data: { workspaceId, name: "FOOCCI" } });
  parceiroId = parceiro.id;

  const r = await autorizarParceriaDoCliente({
    clientId: parceiroId,
    autorizadaPor: "Dioli Santos (CEO), citando D-0B9",
    validaAte: new Date(Date.now() + 30 * 24 * 3600 * 1000),
    escopo: "social media — piloto de parceria",
    pecasContratadas: 12,
    tetoDeIaCentavosUsd: 500,
  });
  if (!r.ok) throw new Error(`parceria não autorizada: ${r.recusa}`);

  await prisma.clientRequestDb.create({
    data: {
      workspaceId,
      clientId: parceiroId,
      businessName: "FOOCCI",
      services: JSON.stringify(["social media"]),
      objectives: JSON.stringify(["aparecer para donos de restaurante"]),
      briefingJson: JSON.stringify({
        estimate: { totalMin: 2590, totalMax: 3400 },
        contato: { email: EMAIL_DO_BRIEFING },
        scope: { businessName: "FOOCCI" },
      }),
      status: "new",
    },
  });
});

afterAll(async () => {
  await prisma.$disconnect().catch(() => {});
  if (existsSync(DB_PATH)) rmSync(DB_PATH);
});

describe("o orçamento do parceiro: para onde iria, e o que diria", () => {
  it("1. a rodada chega até a porta de saída — e uma mensagem só", async () => {
    const r = await entregarOrcamentosPendentes();
    expect(
      sendEmail,
      `a rodada não chegou ao envio (resultado: ${JSON.stringify(r).slice(0, 300)})`,
    ).toHaveBeenCalledTimes(1);
  });

  it("2. o destinatário é o e-mail do BRIEFING — não a ficha, que está vazia", () => {
    const [msg] = enviados();
    expect(
      msg.to,
      "o orçamento iria para outro endereço que não o que o parceiro digitou",
    ).toBe(EMAIL_DO_BRIEFING);

    // A ficha do cliente segue sem e-mail: o endereço veio da conversa.
    return prisma.client.findUnique({ where: { id: parceiroId } }).then((c) => {
      expect(c!.email).toBeNull();
    });
  });

  it("3. o corpo diz que é ISENTO por parceria", () => {
    const [msg] = enviados();
    expect(
      msg.html,
      "o parceiro receberia um orçamento que não diz que ele não paga",
    ).toMatch(/isento|parceria/i);
  });

  it("4. ⛔ o corpo NÃO estampa valor — ordem do CEO de 27/08", () => {
    const [msg] = enviados();
    // *"Eu não acho que o valor tem que estar estampado no e-mail."*
    expect(
      msg.html,
      "o valor vazou para o corpo do e-mail — a ordem do CEO é que ele não seja estampado ali",
    ).not.toMatch(/R\$/);
    expect(msg.html).not.toMatch(/2\.?590|3\.?400/);
  });

  it("5. ⛔ nenhum e-mail foi realmente enviado — a porta está dublada", () => {
    // A prova de que esta suíte é inofensiva: o único ponto de saída da casa é
    // `sendEmail`, e ele é um dublê. Se um caminho novo mandar e-mail por fora
    // dele, este arquivo não veria — e isso é o que está declarado no topo.
    expect(vi.isMockFunction(sendEmail)).toBe(true);
  });
});

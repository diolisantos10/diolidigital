// O GATE DE CONTATO DO BRIEFING PÚBLICO — as duas metades (08/08/2026).
//
// A regra que o CEO fixou: **sem contato, o briefing não vira proposta — mas o
// que a pessoa já contou não se perde.**
//
// Este arquivo prova as duas, na rota de verdade (`POST
// /api/brain/client-requests`), que é onde a trava tem que morar: a rota é
// PÚBLICA e um POST direto passa por cima de qualquer `disabled` de botão da
// tela do briefing.
//
// Por que "não virar proposta" é `runAutoScope` não rodar: é ele que encadeia os
// motores de IA e produz o documento. Rodá-lo para alguém que ninguém pode
// contatar é fatura sem destinatário — e um documento que ninguém vai ler
// ocupando a fila.

import { describe, it, expect, beforeEach, vi } from "vitest";

const criados = vi.hoisted(() => [] as Array<Record<string, unknown>>);
const criar = vi.hoisted(() =>
  vi.fn(async (input: Record<string, unknown>) => {
    criados.push(input);
    return { id: `req-${criados.length}`, ...input };
  }),
);
const autoScope = vi.hoisted(() => vi.fn(async () => undefined));
const enviarEmail = vi.hoisted(() => vi.fn(async () => ({ ok: true, skipped: false })));

vi.mock("@/lib/agency/persistence/client-request-service", () => ({
  createClientRequest: criar,
  listClientRequests: vi.fn(),
  updateClientRequest: vi.fn(),
  getClientRequest: vi.fn(),
  deleteClientRequest: vi.fn(),
}));
vi.mock("@/lib/dioli-brain/run-auto-scope", () => ({ runAutoScope: autoScope }));
vi.mock("@/lib/security/limite-no-banco", () => ({ limiteExcedido: async () => null }));
vi.mock("@/lib/auth/api-guard", () => ({ requireSession: vi.fn() }));
vi.mock("@/lib/email/send", () => ({ sendEmail: enviarEmail }));

import { POST } from "@/app/api/brain/client-requests/route";
import { NextRequest } from "next/server";

function pedir(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/brain/client-requests", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// O briefing do Sushi Cazza, como ele realmente chegou: completo e sem contato.
const BRIEFING_COMPLETO = {
  businessName: "Restaurante Sushi Cazza",
  segment: "gastronomia",
  services: ["planejamento de conteúdo", "direção visual", "estratégia"],
  objectives: ["aumentar presença digital"],
  rawContext:
    "[Prospect] Ticket médio R$ 180. Paleta preto, vermelho e dourado. Nosso perfil é o @sushicazzaoficial.",
  source: "briefing",
  briefingJson: { scope: { businessName: "Restaurante Sushi Cazza" }, transcript: [{ role: "user", text: "oi" }] },
};

beforeEach(() => {
  criados.length = 0;
  vi.clearAllMocks();
});

describe("METADE 1 — COM contato, o briefing fecha e vira proposta", () => {
  it("WhatsApp sozinho basta: nasce em 'new' e o auto-scope roda", async () => {
    const r = await POST(pedir({ ...BRIEFING_COMPLETO, contato: { nome: "Pedro", whatsapp: "(11) 98940-0692" } }));
    expect(r.status).toBe(201);

    expect(criados[0].status).toBe("new");
    expect(autoScope).toHaveBeenCalledTimes(1);

    const body = await r.json();
    expect(body.contato.temComoFalar).toBe(true);
  });

  it("e-mail sozinho basta, e o contato é gravado no formato canônico", async () => {
    await POST(pedir({ ...BRIEFING_COMPLETO, contato: { nome: "Camila", email: "camila@clinic.com.br" } }));
    expect(criados[0].status).toBe("new");
    const briefing = criados[0].briefingJson as { contato?: Record<string, unknown>; scope?: unknown };
    expect(briefing.contato).toMatchObject({ nome: "Camila", email: "camila@clinic.com.br" });
    // E o resto do briefing continua inteiro ao lado dele.
    expect(briefing.scope).toBeTruthy();
  });

  it("o formato legado ainda fecha — quem chega pelo login do Google manda o e-mail dentro do scope", async () => {
    await POST(
      pedir({
        ...BRIEFING_COMPLETO,
        briefingJson: { scope: { businessName: "X", prospectName: "Ana", prospectEmail: "ana@x.com.br" } },
      }),
    );
    expect(criados[0].status).toBe("new");
    expect(autoScope).toHaveBeenCalledTimes(1);
  });
});

describe("METADE 2 — SEM contato, não vira proposta E NÃO SE PERDE", () => {
  it("nasce em 'lead_incompleto' e o auto-scope NÃO roda", async () => {
    const r = await POST(pedir(BRIEFING_COMPLETO));
    expect(r.status).toBe(201);
    expect(criados[0].status).toBe("lead_incompleto");
    expect(autoScope).not.toHaveBeenCalled();
  });

  it("🔴 O QUE ELE CONTOU NÃO SOME — negócio, serviços, objetivos e a conversa inteira gravam", async () => {
    await POST(pedir(BRIEFING_COMPLETO));
    const g = criados[0];
    expect(g.businessName).toBe("Restaurante Sushi Cazza");
    expect(g.segment).toBe("gastronomia");
    expect(g.services).toEqual(["planejamento de conteúdo", "direção visual", "estratégia"]);
    expect(g.objectives).toEqual(["aumentar presença digital"]);
    expect(String(g.rawContext)).toContain("@sushicazzaoficial");
    expect(g.briefingJson).toBeTruthy();
  });

  it("a resposta DIZ o motivo — a tela não pode prometer retorno para quem não deixou endereço", async () => {
    const body = await (await POST(pedir(BRIEFING_COMPLETO))).json();
    expect(body.contato.temComoFalar).toBe(false);
    expect(body.contato.motivo).toMatch(/sem canal|WhatsApp|e-mail/i);
  });

  it("nenhum e-mail de confirmação é disparado — não há endereço, e tentar seria log de erro por nada", async () => {
    await POST(pedir(BRIEFING_COMPLETO));
    expect(enviarEmail).not.toHaveBeenCalled();
  });

  it("contato lixo (nome sem canal, e-mail quebrado, número curto) NÃO destrava o gate", async () => {
    await POST(pedir({ ...BRIEFING_COMPLETO, contato: { nome: "Pedro", email: "pedro@", whatsapp: "1500" } }));
    expect(criados[0].status).toBe("lead_incompleto");
    expect(autoScope).not.toHaveBeenCalled();
  });

  it("🔴 NÃO DEDUZ do texto: o @sushicazzaoficial está no rawContext e o lead continua incompleto", async () => {
    await POST(pedir(BRIEFING_COMPLETO));
    expect(criados[0].status).toBe("lead_incompleto");
  });
});

describe("a trava não é contornável pelo corpo da requisição", () => {
  it("`status` vindo do POST público é IGNORADO — senão qualquer um se declararia 'completed' e sairia da fila", async () => {
    await POST(pedir({ ...BRIEFING_COMPLETO, status: "completed" }));
    expect(criados[0].status).toBe("lead_incompleto");
  });

  it("`status: new` mandado à mão também é ignorado quando não há contato", async () => {
    await POST(pedir({ ...BRIEFING_COMPLETO, status: "new" }));
    expect(criados[0].status).toBe("lead_incompleto");
    expect(autoScope).not.toHaveBeenCalled();
  });
});

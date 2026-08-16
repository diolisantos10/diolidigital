// A ENTRADA: CINCO BRIEFINGS DO MESMO E-MAIL CONTINUAM SENDO CINCO BRIEFINGS.
//
// Pergunta do CEO, 16/08/2026: *"se entrar um cliente com o mesmo e-mail e fizer
// cinco briefings um atrás do outro, o que acontece com o sistema?"*
//
// A resposta que este arquivo trava é a metade que MAIS importa da ficha do
// Diretor: **"NUNCA descarte um briefing silenciosamente. Perder o que o cliente
// escreveu é pior que ter duplicata."**
//
// Por isso a correção da entrada NÃO é um `upsert`. Um `upsert` por contato
// pareceria elegante — uma linha por prospect — e apagaria o texto do briefing
// anterior toda vez. O que muda é que cada linha passa a carregar **de quem
// ela é** (`chaveDoProspect`), para a caixa de entrada poder dizer "3ª vez que
// esta pessoa escreve" em vez de mostrar cinco cartões anônimos.

import { describe, it, expect, beforeEach, vi } from "vitest";

const gravadas = vi.hoisted(() => [] as Array<Record<string, unknown>>);

const prismaFake = vi.hoisted(() => ({
  clientRequestDb: {
    create: vi.fn(async (args: { data: Record<string, unknown> }) => {
      gravadas.push(args.data);
      return { id: `req-${gravadas.length}`, createdAt: new Date(), updatedAt: new Date(), ...args.data };
    }),
  },
  agencyWorkspace: { findFirst: vi.fn(async () => ({ id: "ws1" })) },
}));

vi.mock("@/lib/db/client", () => ({ prisma: prismaFake }));
vi.mock("@/lib/auth/posse-de-workspace", () => ({
  apenasDoWorkspace: vi.fn(async (rows: unknown) => rows),
  workspaceUnico: vi.fn(async () => ({ id: "ws1", ambiguo: false })),
}));

import { createClientRequest } from "@/lib/agency/persistence/client-request-service";

const contatoDe = (email?: string, whatsapp?: string) => ({
  briefingJson: { contato: { nome: "Camila", email, whatsapp, informadoEm: "2026-08-16T10:00:00.000Z" } },
});

beforeEach(() => {
  gravadas.length = 0;
  vi.clearAllMocks();
});

describe("🔴 NADA SE PERDE NA ENTRADA", () => {
  it("cinco briefings do mesmo e-mail geram CINCO linhas — nenhuma sobrescreve a outra", async () => {
    for (let n = 1; n <= 5; n++) {
      await createClientRequest({
        businessName: "Beauty Clinic",
        rawContext: `conversa número ${n}, com o que a cliente contou nesta vez`,
        ...contatoDe("camila@email.com"),
      });
    }
    expect(gravadas).toHaveLength(5);
    // O texto de CADA envio continua recuperável, palavra por palavra.
    for (let n = 1; n <= 5; n++) {
      expect(gravadas[n - 1]!.rawContext).toContain(`conversa número ${n}`);
    }
  });

  it("⛔ é `create`, NUNCA `upsert` — upsert apagaria o briefing anterior", async () => {
    await createClientRequest({ businessName: "X", ...contatoDe("camila@email.com") });
    await createClientRequest({ businessName: "X", ...contatoDe("camila@email.com") });
    expect(prismaFake.clientRequestDb.create).toHaveBeenCalledTimes(2);
    expect((prismaFake.clientRequestDb as Record<string, unknown>).upsert).toBeUndefined();
  });
});

describe("a chave de identidade é gravada no momento da entrada", () => {
  it("o briefing nasce sabendo de quem ele é, normalizado", async () => {
    await createClientRequest({ businessName: "Beauty Clinic", ...contatoDe("  Camila@Email.com ") });
    expect(gravadas[0]!.chaveDoProspect).toBe("email:camila@email.com");
  });

  it("as cinco linhas carregam a MESMA chave — é o que permite agrupar depois", async () => {
    for (const escrito of ["camila@email.com", "  Camila@Email.com ", "CAMILA@EMAIL.COM"]) {
      await createClientRequest({ businessName: "Beauty Clinic", ...contatoDe(escrito) });
    }
    expect(new Set(gravadas.map((g) => g.chaveDoProspect)).size).toBe(1);
  });

  it("cai para o WhatsApp normalizado quando não há e-mail", async () => {
    await createClientRequest({ businessName: "X", ...contatoDe(undefined, "(11) 99999-8888") });
    expect(gravadas[0]!.chaveDoProspect).toBe("whatsapp:11999998888");
  });

  it("🔴 LEAD SEM CANAL NASCE COM CHAVE NULA — e nulo não junta com nulo", async () => {
    // O gate de contato de 08/08 grava estes como `lead_incompleto`. Sem canal
    // declarado não existe identidade, e dar-lhes uma chave qualquer (o nome do
    // negócio, a arroba do Instagram) juntaria prospects que não têm relação —
    // a inferência que esta casa proíbe.
    await createClientRequest({
      businessName: "Sushi Cazza",
      status: "lead_incompleto",
      rawContext: "Nosso perfil é o @sushicazzaoficial",
      briefingJson: { scope: { businessName: "Sushi Cazza" } },
    });
    expect(gravadas[0]!.chaveDoProspect).toBeNull();
    expect(gravadas[0]!.status).toBe("lead_incompleto");
    // E o que ele escreveu continua inteiro, que é o ponto.
    expect(gravadas[0]!.rawContext).toContain("@sushicazzaoficial");
  });
});

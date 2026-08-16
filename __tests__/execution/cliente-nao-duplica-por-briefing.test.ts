// CINCO BRIEFINGS DO MESMO E-MAIL NÃO VIRAM CINCO CLIENTES (16/08/2026).
//
// Pergunta literal do CEO: *"se entrar um cliente com o mesmo e-mail e fizer
// cinco briefings um atrás do outro, o que acontece com o sistema?"*
//
// A resposta medida naquele dia: **não dava pane — dava bagunça cara.** E o
// maior estrago não era na entrada, era na APROVAÇÃO:
// `create-project-from-request.ts:49` fazia `prisma.client.create` sempre que
// `req.clientId` era nulo. Aprovar as cinco criava cinco `Client` homônimos,
// cinco `portalToken`, cinco históricos. A Camila Pereira já estava assim em
// produção desde 08/08/2026.
//
// Este arquivo prova as quatro guardas que o Diretor exigiu, e a quarta é a que
// mais importa: **nada do que o cliente escreveu se perde.**

import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ── Um Prisma de mentira, com memória de verdade ────────────────────────────
type FichaDeCliente = { id: string; workspaceId: string; name: string; email: string | null; phone: string | null; industry: string | null; createdAt: Date };

const banco = vi.hoisted(() => ({
  clientes: [] as Array<{ id: string; workspaceId: string; name: string; email: string | null; phone: string | null; industry: string | null; createdAt: Date }>,
  eventos: [] as Array<Record<string, unknown>>,
  seq: 0,
}));

const prismaFake = vi.hoisted(() => ({
  client: {
    findFirst: vi.fn(async (args: { where: Record<string, unknown> }) => {
      const w = args.where;
      return (
        banco.clientes
          .filter((c) => c.workspaceId === w.workspaceId)
          .filter((c) => (w.email === undefined ? true : c.email === w.email))
          .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0] ?? null
      );
    }),
    findMany: vi.fn(async (args: { where: Record<string, unknown>; take?: number }) =>
      banco.clientes
        .filter((c) => c.workspaceId === args.where.workspaceId)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .slice(0, args.take ?? 1000),
    ),
    create: vi.fn(async (args: { data: Record<string, unknown> }) => {
      const ficha = {
        id: `cli-${++banco.seq}`,
        workspaceId: String(args.data.workspaceId),
        name: String(args.data.name),
        email: (args.data.email as string | null) ?? null,
        phone: (args.data.phone as string | null) ?? null,
        industry: (args.data.industry as string | null) ?? null,
        createdAt: new Date(Date.now() + banco.seq),
      };
      banco.clientes.push(ficha);
      return ficha;
    }),
  },
  activityEvent: {
    create: vi.fn(async (args: { data: Record<string, unknown> }) => {
      banco.eventos.push(args.data);
      return args.data;
    }),
  },
}));

vi.mock("@/lib/db/client", () => ({ prisma: prismaFake }));

import { resolverOuCriarCliente, registrarReaproveitamento } from "@/lib/agency/execution/cliente-do-briefing";

const WS = "ws-dioli";

function briefingCom(contato: { nome?: string; email?: string; whatsapp?: string }) {
  return { briefingJson: { contato: { informadoEm: "2026-08-16T10:00:00.000Z", ...contato } } };
}

beforeEach(() => {
  banco.clientes.length = 0;
  banco.eventos.length = 0;
  banco.seq = 0;
  vi.clearAllMocks();
});

// ── GUARDA 1 ────────────────────────────────────────────────────────────────

describe("🔴 GUARDA 1 — mesmo e-mail em vários briefings NÃO vira vários Client", () => {
  it("cinco briefings do mesmo e-mail aprovados = UM cliente só", async () => {
    const resultados = [];
    for (let n = 1; n <= 5; n++) {
      resultados.push(
        await resolverOuCriarCliente({
          workspaceId: WS,
          businessName: `Padaria do João (envio ${n})`,
          segment: "alimentação",
          ...briefingCom({ nome: "João", email: "joao@email.com" }),
        }),
      );
    }

    // A resposta em uma linha para a pergunta do CEO.
    expect(banco.clientes).toHaveLength(1);
    expect(new Set(resultados.map((r) => r.clientId)).size).toBe(1);
    // O primeiro criou; os quatro seguintes reaproveitaram.
    expect(resultados.map((r) => r.reaproveitado)).toEqual([false, true, true, true, true]);
  });

  it("o nome do negócio do PRIMEIRO briefing não é sobrescrito pelos seguintes", async () => {
    await resolverOuCriarCliente({ workspaceId: WS, businessName: "Padaria do João", ...briefingCom({ email: "joao@email.com" }) });
    await resolverOuCriarCliente({ workspaceId: WS, businessName: "PADARIA JOAO LTDA", ...briefingCom({ email: "joao@email.com" }) });
    // Reaproveitar não é reescrever: o cadastro existente pode ter sido curado
    // por gente, e um briefing novo não pode passar por cima disso.
    expect(banco.clientes).toHaveLength(1);
    expect(banco.clientes[0]!.name).toBe("Padaria do João");
  });

  it("o reaproveitamento é AUDITÁVEL — vira evento, não mágica silenciosa", async () => {
    const a = await resolverOuCriarCliente({ workspaceId: WS, businessName: "X", ...briefingCom({ email: "joao@email.com" }) });
    const b = await resolverOuCriarCliente({ workspaceId: WS, businessName: "X", ...briefingCom({ email: "joao@email.com" }) });
    expect(b.reaproveitado).toBe(true);
    await registrarReaproveitamento({ workspaceId: WS, clientId: b.clientId, clientRequestId: "req-2", motivo: b.motivo });
    expect(banco.eventos).toHaveLength(1);
    expect(banco.eventos[0]!.type).toBe("cliente_reaproveitado");
    expect(String(banco.eventos[0]!.message)).toContain("req-2");
    expect(a.clientId).toBe(b.clientId);
  });
});

// ── GUARDA 2 ────────────────────────────────────────────────────────────────

describe("🔴 GUARDA 2 — o segundo projeto legítimo CONTINUA possível", () => {
  it("o mesmo cliente pedindo outro trabalho reaproveita a ficha e NÃO é bloqueado", async () => {
    const campanha1 = await resolverOuCriarCliente({
      workspaceId: WS, businessName: "Foocci", segment: "tecnologia",
      ...briefingCom({ email: "dono@foocci.com" }),
    });
    // Meses depois, o mesmo cliente contrata outra frente.
    const campanha2 = await resolverOuCriarCliente({
      workspaceId: WS, businessName: "Foocci — lançamento do app", segment: "tecnologia",
      ...briefingCom({ email: "dono@foocci.com" }),
    });

    // Um cadastro só — mas DUAS resoluções bem-sucedidas. Nada lançou erro,
    // nada devolveu "já existe". Não duplicar CADASTRO nunca pode virar recusar
    // PEDIDO: a agência estaria negando trabalho que o cliente contratou.
    expect(banco.clientes).toHaveLength(1);
    expect(campanha2.clientId).toBe(campanha1.clientId);
    expect(campanha2.clientId).toBeTruthy();
  });

  it("a idempotência da aprovação é por SOLICITAÇÃO, nunca por cliente", () => {
    // Se um dia alguém trocar a chave de idempotência de `clientRequestId` para
    // `clientId`, o segundo pedido legítimo passaria a devolver o projeto ANTIGO
    // em silêncio — o cliente pagaria por um projeto que o sistema se recusou a
    // criar. Esta é a trava textual contra essa troca.
    const fonte = readFileSync(join(process.cwd(), "lib/agency/execution/create-project-from-request.ts"), "utf8");
    expect(fonte).toContain("prisma.project.findFirst({ where: { clientRequestId }");
    expect(fonte).not.toMatch(/project\.findFirst\(\{\s*where:\s*\{\s*clientId\b/);
  });
});

// ── GUARDA 3 ────────────────────────────────────────────────────────────────

describe("🔴 GUARDA 3 — nenhum briefing é descartado", () => {
  it("resolver o cliente NÃO apaga, NÃO funde e NÃO reescreve solicitação nenhuma", async () => {
    for (let n = 0; n < 3; n++) {
      await resolverOuCriarCliente({ workspaceId: WS, businessName: "Padaria", ...briefingCom({ email: "joao@email.com" }) });
    }
    // O resolvedor não tem permissão nem caminho para tocar em ClientRequestDb.
    expect(prismaFake.client.create).toHaveBeenCalledTimes(1);
    expect((prismaFake as Record<string, unknown>).clientRequestDb).toBeUndefined();
  });

  it("⛔ nenhum arquivo desta frente manda o BANCO apagar ou sobrescrever em massa", () => {
    // A ficha do Diretor foi explícita: "Não apagar dado nenhum, nunca. Sem
    // `deleteMany` neste trabalho." Perder o que o cliente escreveu é pior que
    // ter duplicata — e trava que não roda não protege nada.
    //
    // ⚠️ A régua é `prisma.<modelo>.<verbo>`, e não `.delete(` solto: a primeira
    // versão deste teste reprovava `membrosDoGrupo.delete(...)`, que é um `Map`
    // em memória do agrupador. Trava que dispara onde não há risco é trava que
    // alguém desliga.
    const arquivos = [
      "lib/agency/execution/cliente-do-briefing.ts",
      "lib/agency/comercial/chave-do-prospect.ts",
    ];
    for (const rel of arquivos) {
      const fonte = readFileSync(join(process.cwd(), rel), "utf8");
      expect(fonte, rel).not.toMatch(/prisma\.\w+\.(delete|deleteMany|updateMany)\(/);
    }
  });

  it("a criação continua sendo `create`, nunca `upsert` — upsert sobrescreveria o briefing anterior", () => {
    const fonte = readFileSync(join(process.cwd(), "lib/agency/persistence/client-request-service.ts"), "utf8");
    expect(fonte).toContain("prisma.clientRequestDb.create");
    expect(fonte).not.toContain("clientRequestDb.upsert");
  });
});

// ── GUARDA 4 ────────────────────────────────────────────────────────────────

describe("🔴 GUARDA 4 — a normalização que o CEO pediu, no caminho de verdade", () => {
  it("`  Joao@Email.com ` reaproveita a ficha de `joao@email.com`", async () => {
    const a = await resolverOuCriarCliente({ workspaceId: WS, businessName: "X", ...briefingCom({ email: "joao@email.com" }) });
    const b = await resolverOuCriarCliente({ workspaceId: WS, businessName: "X", ...briefingCom({ email: "  Joao@Email.com " }) });
    expect(banco.clientes).toHaveLength(1);
    expect(b.clientId).toBe(a.clientId);
    expect(b.reaproveitado).toBe(true);
  });

  it("`(11) 99999-8888` reaproveita a ficha de `11999998888`", async () => {
    const a = await resolverOuCriarCliente({ workspaceId: WS, businessName: "X", ...briefingCom({ whatsapp: "11999998888" }) });
    const b = await resolverOuCriarCliente({ workspaceId: WS, businessName: "X", ...briefingCom({ whatsapp: "(11) 99999-8888" }) });
    expect(banco.clientes).toHaveLength(1);
    expect(b.clientId).toBe(a.clientId);
    expect(b.motivo).toContain("telefone");
  });

  it("🔴 acha a FICHA LEGADA gravada em caixa alta — o dado que já está no volume", async () => {
    // O SQLite não tem `mode: "insensitive"` no Prisma. Sem a varredura de
    // segurança, a correção funcionaria só para clientes novos e continuaria
    // duplicando em cima das fichas de piloto que já existem.
    banco.clientes.push({
      id: "cli-legado", workspaceId: WS, name: "Camila Pereira",
      email: "Camila@Email.com", phone: "(11) 98888-7777", industry: null, createdAt: new Date(1),
    } as FichaDeCliente);

    const r = await resolverOuCriarCliente({ workspaceId: WS, businessName: "Beauty Clinic", ...briefingCom({ email: "camila@email.com" }) });
    expect(r.clientId).toBe("cli-legado");
    expect(r.reaproveitado).toBe(true);
    expect(banco.clientes).toHaveLength(1);
  });

  it("🔴 acha a ficha legada com TELEFONE FORMATADO", async () => {
    banco.clientes.push({
      id: "cli-legado", workspaceId: WS, name: "Beatriz",
      email: null, phone: "(11) 98888-7777", industry: null, createdAt: new Date(1),
    } as FichaDeCliente);
    const r = await resolverOuCriarCliente({ workspaceId: WS, businessName: "Lash", ...briefingCom({ whatsapp: "11988887777" }) });
    expect(r.clientId).toBe("cli-legado");
    expect(banco.clientes).toHaveLength(1);
  });
});

// ── O DEFEITO QUE FARIA TUDO ISSO SER DECORAÇÃO ─────────────────────────────

describe("🔴 O CLIENTE NASCE COM CONTATO GRAVADO — sem isto, a busca nunca casa", () => {
  it("`email` e `phone` são PERSISTIDOS na ficha nova, normalizados", async () => {
    // Era este o defeito silencioso: `create-project-from-request.ts:49` criava
    // o Client só com `workspaceId`, `name` e `industry`. Uma busca por e-mail
    // acrescentada sem isto NUNCA casaria, porque não havia e-mail em ficha
    // nenhuma — o PR pareceria funcionar e não funcionaria.
    await resolverOuCriarCliente({
      workspaceId: WS, businessName: "Padaria do João", segment: "alimentação",
      ...briefingCom({ nome: "João", email: "  Joao@Email.com ", whatsapp: "(11) 99999-8888" }),
    });
    const ficha = banco.clientes[0]!;
    expect(ficha.email).toBe("joao@email.com");
    expect(ficha.phone).toBe("11999998888");
    expect(ficha.industry).toBe("alimentação");
  });

  it("o segundo briefing do mesmo e-mail só reaproveita PORQUE o primeiro gravou o contato", async () => {
    await resolverOuCriarCliente({ workspaceId: WS, businessName: "X", ...briefingCom({ email: "joao@email.com" }) });
    expect(banco.clientes[0]!.email).toBe("joao@email.com"); // a causa
    const b = await resolverOuCriarCliente({ workspaceId: WS, businessName: "X", ...briefingCom({ email: "joao@email.com" }) });
    expect(b.reaproveitado).toBe(true);                       // o efeito
  });

  it("briefing SEM contato grava ficha com email/phone nulos — e não casa com ninguém", async () => {
    // Lead sem canal não tem chave. Duas fichas anônimas continuam duas fichas:
    // juntá-las por nome seria a inferência que esta casa proíbe.
    const a = await resolverOuCriarCliente({ workspaceId: WS, businessName: "Sushi Cazza", briefingJson: { scope: {} } });
    const b = await resolverOuCriarCliente({ workspaceId: WS, businessName: "Sushi Cazza", briefingJson: { scope: {} } });
    expect(banco.clientes).toHaveLength(2);
    expect(a.clientId).not.toBe(b.clientId);
    expect(banco.clientes[0]!.email).toBeNull();
    expect(a.motivo).toContain("sem contato declarado");
  });
});

// ── ISOLAMENTO ENTRE AGÊNCIAS ───────────────────────────────────────────────

describe("a dedup NUNCA atravessa workspace", () => {
  it("⛔ o mesmo e-mail em duas agências continua sendo dois clientes", async () => {
    const a = await resolverOuCriarCliente({ workspaceId: "ws-A", businessName: "X", ...briefingCom({ email: "joao@email.com" }) });
    const b = await resolverOuCriarCliente({ workspaceId: "ws-B", businessName: "X", ...briefingCom({ email: "joao@email.com" }) });
    // Reaproveitar por cima do workspace entregaria o cliente de uma agência
    // para outra — vazamento, não dedup.
    expect(a.clientId).not.toBe(b.clientId);
    expect(banco.clientes).toHaveLength(2);
  });
});

// ── A GUARDA CONTRA "MECANISMO SEM CHAMADOR" ────────────────────────────────

describe("🔴 AS DUAS PORTAS REALMENTE CHAMAM O RESOLVEDOR", () => {
  // A cicatriz desta casa: `sincronizarDoBriefing` existiu com a justificativa
  // certa, testada, e ZERO chamadores — a proibição do cliente simplesmente não
  // existia na hora da peça. Mecanismo construído e não plugado não é regra, é
  // documentação. Aqui são DUAS portas, e esquecer uma é o modo natural de errar.
  const PORTAS = [
    "lib/agency/execution/create-project-from-request.ts",
    "app/api/brain/orchestrate/apply/route.ts",
  ];

  for (const porta of PORTAS) {
    it(`${porta} chama resolverOuCriarCliente`, () => {
      const fonte = readFileSync(join(process.cwd(), porta), "utf8");
      expect(fonte).toContain("resolverOuCriarCliente");
    });

    it(`⛔ ${porta} NÃO cria Client por conta própria`, () => {
      const fonte = readFileSync(join(process.cwd(), porta), "utf8");
      // Era exatamente esta linha, nas duas portas, que produzia os homônimos.
      expect(fonte).not.toMatch(/prisma\.client\.create\(/);
    });
  }
});

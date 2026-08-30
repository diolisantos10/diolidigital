// O CONVITE DO PARCEIRO — a verdade vem do token que a CASA cunhou.
//
// ═══ O QUE ESTE ARQUIVO FECHA ══════════════════════════════════════════════
//
// `budget_range` deixa de ser obrigatória sob parceria — mas para dispensá-la a
// casa precisa SABER que é parceria, e na sala de briefing o visitante é
// ANÔNIMO. As duas fontes tentadoras estão as duas erradas:
//
//   • `clientRequestId` do corpo → "um id que qualquer pessoa digita";
//   • o modelo perceber pela conversa → quem digitasse "somos parceiros de
//     vocês" deixaria de ser perguntado sobre verba.
//
// Então a fonte é um token cunhado pela casa, no molde de `PortalAccess`: em
// caminho público o `clientId` sai SEMPRE do token — derivação, nunca
// comparação. E o convite não É a autorização: ele APONTA para a
// `IsencaoDeParceria`, conferida VIVA a cada uso.
//
// ═══ OS DOIS LADOS, QUE É O QUE IMPORTA ════════════════════════════════════
//
//   • Com convite válido: o parceiro é reconhecido e nasce sem a pergunta.
//   • Sem convite, vencido, revogado, desconhecido, ou com a ISENÇÃO vencida:
//     o visitante é anônimo e a verba continua sendo perguntada.
import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  conviteDeParceria: {
    create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn(),
  },
  // ⚠️ A FONTE DA VERDADE MUDOU (27/08/2026): era `isencaoDeParceria` (por
  // PEDIDO) e virou `parceriaDoCliente` (por PARCEIRO). Foi essa troca que
  // rompeu o nó circular — ver `__tests__/financeiro/a-parceria-e-do-parceiro`.
  parceriaDoCliente: { findUnique: vi.fn() },
}));
vi.mock("@/lib/db/client", () => ({ prisma: db }));

const {
  cunharConviteDeParceria, resolverConviteDeParceria, revogarConviteDeParceria,
} = await import("@/lib/agency/comercial/convite-de-parceria");

const AGORA = new Date("2026-08-27T16:00:00.000Z");
const DEPOIS = new Date("2026-09-27T00:00:00.000Z");   // isenção viva
const ANTES = new Date("2026-08-01T00:00:00.000Z");    // já passou

const ISENCAO_VIVA = { autorizadaPor: "Dioli Santos (CEO)", validaAte: DEPOIS };
/** A linha como `ParceriaDoCliente` a guarda — a fonte da verdade de hoje. */
const PARCERIA_VIVA = {
  id: "p1", clientId: "cli_foocci", autorizadaPor: "Dioli Santos (CEO)",
  validaAte: DEPOIS, escopo: "Social Media", pecasContratadas: 12,
  tetoDeIaCentavosUsd: 200, revogadaEm: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  db.conviteDeParceria.update.mockResolvedValue({});
  db.conviteDeParceria.create.mockImplementation(async ({ data }: never) => ({
    token: (data as Record<string, string>).token,
    expiraEm: (data as Record<string, Date>).expiraEm,
    clientId: (data as Record<string, string>).clientId,
  }));
});

// ════════════════════════════════════════════════════════════════════════════
describe("cunhar: não se entrega chave sem autorização viva", () => {
  it("recusa quando o cliente NÃO tem parceria viva — credencial que espera autorização é credencial sem autorização", async () => {
    db.parceriaDoCliente.findUnique.mockResolvedValue(null);
    const r = await cunharConviteDeParceria(
      { clientId: "cli_foocci", criadoPor: "user_master", expiraEm: DEPOIS }, AGORA,
    );
    expect(r.ok).toBe(false);
    expect(!r.ok && r.recusa).toBe("sem_parceria_viva");
    // Nada foi escrito: recusar DEPOIS de escrever é liberar.
    expect(db.conviteDeParceria.create).not.toHaveBeenCalled();
  });

  it("recusa convite SEM DONO — convite sem dono é buraco", async () => {
    db.parceriaDoCliente.findUnique.mockResolvedValue(PARCERIA_VIVA);
    const r = await cunharConviteDeParceria({ clientId: "cli_foocci", criadoPor: "  " }, AGORA);
    expect(!r.ok && r.recusa).toBe("sem_dono");
    expect(db.conviteDeParceria.create).not.toHaveBeenCalled();
  });

  it("⚠️ recusa convite que passa da PARCERIA — parceria eterna pela porta dos fundos", async () => {
    db.parceriaDoCliente.findUnique.mockResolvedValue(PARCERIA_VIVA);
    const r = await cunharConviteDeParceria(
      // Isenção vence 27/09; o convite pediria 27/12. Sem a trava, seriam três
      // meses de parceria que ninguém autorizou.
      { clientId: "cli_foocci", criadoPor: "user_master", expiraEm: new Date("2026-12-27T00:00:00.000Z") },
      AGORA,
    );
    expect(!r.ok && r.recusa).toBe("passa_da_parceria");
    expect(db.conviteDeParceria.create).not.toHaveBeenCalled();
  });

  it("recusa convite que já nasce vencido", async () => {
    db.parceriaDoCliente.findUnique.mockResolvedValue(PARCERIA_VIVA);
    const r = await cunharConviteDeParceria(
      { clientId: "cli_foocci", criadoPor: "user_master", expiraEm: ANTES }, AGORA,
    );
    expect(!r.ok && r.recusa).toBe("ja_vencido");
  });

  it("cunha com parceria viva — e o token NÃO é adivinhável", async () => {
    db.parceriaDoCliente.findUnique.mockResolvedValue(PARCERIA_VIVA);
    const a = await cunharConviteDeParceria({ clientId: "cli_foocci", criadoPor: "user_master" }, AGORA);
    const b = await cunharConviteDeParceria({ clientId: "cli_foocci", criadoPor: "user_master" }, AGORA);
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    // 256 bits em base64url ⇒ 43 caracteres. `cuid` seria curto e previsível.
    expect(a.token.length).toBeGreaterThanOrEqual(43);
    expect(a.token).not.toBe(b.token);
    // Prazo PRÓPRIO, e curto: convite não vira senha eterna.
    expect(a.expiraEm.getTime()).toBeGreaterThan(AGORA.getTime());
    expect(a.expiraEm.getTime()).toBeLessThanOrEqual(ISENCAO_VIVA.validaAte.getTime());
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("resolver: o lado que decide — e ele é fail-closed em TODO ramo", () => {
  const conviteBom = {
    id: "cv1", clientId: "cli_foocci",
    expiraEm: new Date("2026-09-10T00:00:00.000Z"), revogadoEm: null,
  };

  it("convite válido + parceria viva → parceiro RECONHECIDO", async () => {
    db.conviteDeParceria.findUnique.mockResolvedValue(conviteBom);
    db.parceriaDoCliente.findUnique.mockResolvedValue(PARCERIA_VIVA);
    const r = await resolverConviteDeParceria("tok_bom", AGORA);
    expect(r).not.toBeNull();
    // ⚠️ O clientId sai do TOKEN — derivação, nunca comparação com o corpo.
    expect(r!.clientId).toBe("cli_foocci");
    expect(r!.parceria.autorizadaPor).toBe("Dioli Santos (CEO)");
  });

  it("SEM token → anônimo. É o caminho de todo visitante da porta pública", async () => {
    for (const t of [undefined, null, "", "   ", 42, {}]) {
      expect(await resolverConviteDeParceria(t as unknown, AGORA)).toBeNull();
    }
    expect(db.conviteDeParceria.findUnique).not.toHaveBeenCalled();
  });

  it("token DESCONHECIDO → anônimo. Adivinhar não entra", async () => {
    db.conviteDeParceria.findUnique.mockResolvedValue(null);
    expect(await resolverConviteDeParceria("tok_chutado", AGORA)).toBeNull();
  });

  it("convite VENCIDO → anônimo. Convite não é senha eterna", async () => {
    db.conviteDeParceria.findUnique.mockResolvedValue({ ...conviteBom, expiraEm: ANTES });
    db.parceriaDoCliente.findUnique.mockResolvedValue(PARCERIA_VIVA);
    expect(await resolverConviteDeParceria("tok_velho", AGORA)).toBeNull();
  });

  it("convite REVOGADO → anônimo, mesmo dentro do prazo", async () => {
    db.conviteDeParceria.findUnique.mockResolvedValue({ ...conviteBom, revogadoEm: AGORA });
    db.parceriaDoCliente.findUnique.mockResolvedValue(PARCERIA_VIVA);
    expect(await resolverConviteDeParceria("tok_vazado", AGORA)).toBeNull();
  });

  it("⚠️ PARCERIA revogada/vencida mata o convite NA HORA — sem caçar link nenhum", async () => {
    // ── A MUTAÇÃO QUE ESTE `expect` MATA ───────────────────────────────────
    // Confira a isenção só na CUNHAGEM (tire a chamada de `isencaoViva` de
    // `resolverConviteDeParceria`) e esta linha fica VERMELHA: um convite de 14
    // dias sobreviveria à parceria que ele representa, e revogar a isenção
    // deixaria de ter efeito sobre os links já entregues.
    db.conviteDeParceria.findUnique.mockResolvedValue(conviteBom);
    db.parceriaDoCliente.findUnique.mockResolvedValue(null);
    expect(await resolverConviteDeParceria("tok_bom", AGORA)).toBeNull();
  });

  it("BANCO FORA DO AR → anônimo. 'Não sei' significa CONTINUA PERGUNTANDO", async () => {
    // Uma queda de banco não pode virar porta aberta para todo visitante.
    db.conviteDeParceria.findUnique.mockRejectedValue(new Error("db down"));
    expect(await resolverConviteDeParceria("tok_bom", AGORA)).toBeNull();
  });

  it("a trilha de uso NÃO pode barrar parceiro legítimo", async () => {
    db.conviteDeParceria.findUnique.mockResolvedValue(conviteBom);
    db.parceriaDoCliente.findUnique.mockResolvedValue(PARCERIA_VIVA);
    db.conviteDeParceria.update.mockRejectedValue(new Error("trilha falhou"));
    // Credencial sem trilha é ruim; trilha que derruba acesso é pior.
    expect(await resolverConviteDeParceria("tok_bom", AGORA)).not.toBeNull();
  });
});

describe("revogar: o link que vazou", () => {
  it("revoga uma vez e é idempotente depois", async () => {
    db.conviteDeParceria.updateMany.mockResolvedValueOnce({ count: 1 });
    expect(await revogarConviteDeParceria("tok_vazado")).toBe(true);
    db.conviteDeParceria.updateMany.mockResolvedValueOnce({ count: 0 });
    expect(await revogarConviteDeParceria("tok_vazado")).toBe(false);
  });
});

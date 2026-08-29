// O CONVITE RECUSADO NÃO É MUDO.
//
// ═══ O DEFEITO QUE ESTE ARQUIVO FECHA ══════════════════════════════════════
//
// Um parceiro de verdade abriu a sala, conversou até o fim, e a proposta saiu
// COBRANDO ele — com botão de pagamento. Ele teve que explicar, com as
// próprias palavras, que era parceria.
//
// A cadeia inteira estava construída e no ar: o link manda o token em todo
// turno, o servidor resolve, e a parceria entra no estado da conversa. O que
// não existia era o AVISO: `resolverConviteDeParceria` devolvia `null` em
// CINCO caminhos diferentes e todos eram indistinguíveis entre si — e do
// visitante que simplesmente não tinha convite nenhum.
//
// Resultado: o parceiro virava anônimo, era cobrado, e a casa não tinha como
// saber que isso tinha acontecido. Nem depois, olhando.
//
// ⚠️ A DECISÃO NÃO MUDA, e isso é metade do teste. Continua fail-closed em
// todo ramo: convite ruim vale exatamente o mesmo que convite nenhum. O que
// muda é que a recusa passa a ter NOME, e a recusa com token na mão GRITA.
//
// *Mecanismo cuja falha é invisível não é mecanismo seguro — é mecanismo mudo.*
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const db = vi.hoisted(() => ({
  conviteDeParceria: { findUnique: vi.fn(), update: vi.fn() },
  parceriaDoCliente: { findUnique: vi.fn() },
}));
vi.mock("@/lib/db/client", () => ({ prisma: db }));

const { examinarConviteDeParceria, resolverConviteDeParceria } =
  await import("@/lib/agency/comercial/convite-de-parceria");

const AGORA = new Date("2026-08-29T13:00:00.000Z");
const DEPOIS = new Date("2026-09-29T00:00:00.000Z");
const JA_PASSOU = new Date("2026-08-01T00:00:00.000Z");

const PARCERIA_VIVA = {
  id: "p1", clientId: "cli_foocci", autorizadaPor: "Dioli Santos (CEO)",
  validaAte: DEPOIS, escopo: "Social Media", pecasContratadas: 12,
  tetoDeIaCentavosUsd: 200, revogadaEm: null,
};
const CONVITE_BOM = {
  id: "c1", clientId: "cli_foocci", expiraEm: DEPOIS, revogadoEm: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  db.conviteDeParceria.update.mockResolvedValue({});
});

describe("cada recusa diz o próprio nome", () => {
  it("sem token: 'sem_token' — e este é o único que NÃO é anormal", async () => {
    const r = await examinarConviteDeParceria(undefined, AGORA);
    expect(r.convite).toBeNull();
    expect(r.motivo).toBe("sem_token");
    // O visitante que chega sem link é a maioria. Não pode virar barulho.
    expect(db.conviteDeParceria.findUnique).not.toHaveBeenCalled();
  });

  it("string vazia ou só espaço conta como sem token", async () => {
    expect((await examinarConviteDeParceria("   ", AGORA)).motivo).toBe("sem_token");
  });

  it("token que o banco não conhece: 'token_desconhecido'", async () => {
    db.conviteDeParceria.findUnique.mockResolvedValue(null);
    const r = await examinarConviteDeParceria("tok_fantasma", AGORA);
    expect(r.convite).toBeNull();
    expect(r.motivo).toBe("token_desconhecido");
  });

  it("convite revogado: 'revogado'", async () => {
    db.conviteDeParceria.findUnique.mockResolvedValue({
      ...CONVITE_BOM, revogadoEm: JA_PASSOU,
    });
    expect((await examinarConviteDeParceria("tok", AGORA)).motivo).toBe("revogado");
  });

  it("convite vencido: 'vencido'", async () => {
    db.conviteDeParceria.findUnique.mockResolvedValue({
      ...CONVITE_BOM, expiraEm: JA_PASSOU,
    });
    expect((await examinarConviteDeParceria("tok", AGORA)).motivo).toBe("vencido");
  });

  it("token bom, mas a PARCERIA não está viva: 'parceria_nao_esta_viva'", async () => {
    db.conviteDeParceria.findUnique.mockResolvedValue(CONVITE_BOM);
    db.parceriaDoCliente.findUnique.mockResolvedValue(null);
    const r = await examinarConviteDeParceria("tok", AGORA);
    expect(r.convite).toBeNull();
    // Este é o ramo que faz revogar a parceria matar o convite no mesmo
    // instante. Ele NUNCA pode ser confundido com "token desconhecido".
    expect(r.motivo).toBe("parceria_nao_esta_viva");
  });

  it("banco fora do ar: 'erro_de_banco' — e continua fail-closed", async () => {
    db.conviteDeParceria.findUnique.mockRejectedValue(new Error("sem conexao"));
    const r = await examinarConviteDeParceria("tok", AGORA);
    expect(r.convite).toBeNull();
    expect(r.motivo).toBe("erro_de_banco");
  });

  it("convite bom E parceria viva: resolve, e o motivo é null", async () => {
    db.conviteDeParceria.findUnique.mockResolvedValue(CONVITE_BOM);
    db.parceriaDoCliente.findUnique.mockResolvedValue(PARCERIA_VIVA);
    const r = await examinarConviteDeParceria("tok", AGORA);
    expect(r.motivo).toBeNull();
    expect(r.convite?.clientId).toBe("cli_foocci");
  });

  it("os seis motivos são distintos entre si — senão não servem de diagnóstico", async () => {
    const vistos = new Set<string>();

    db.conviteDeParceria.findUnique.mockResolvedValue(null);
    vistos.add((await examinarConviteDeParceria("t", AGORA)).motivo!);

    db.conviteDeParceria.findUnique.mockResolvedValue({ ...CONVITE_BOM, revogadoEm: JA_PASSOU });
    vistos.add((await examinarConviteDeParceria("t", AGORA)).motivo!);

    db.conviteDeParceria.findUnique.mockResolvedValue({ ...CONVITE_BOM, expiraEm: JA_PASSOU });
    vistos.add((await examinarConviteDeParceria("t", AGORA)).motivo!);

    db.conviteDeParceria.findUnique.mockResolvedValue(CONVITE_BOM);
    db.parceriaDoCliente.findUnique.mockResolvedValue(null);
    vistos.add((await examinarConviteDeParceria("t", AGORA)).motivo!);

    db.conviteDeParceria.findUnique.mockRejectedValue(new Error("x"));
    vistos.add((await examinarConviteDeParceria("t", AGORA)).motivo!);

    vistos.add((await examinarConviteDeParceria(undefined, AGORA)).motivo!);

    expect(vistos.size).toBe(6);
  });
});

describe("a recusa COM token na mão grita; sem token, cala", () => {
  let avisos: string[];
  let espiao: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    avisos = [];
    espiao = vi.spyOn(console, "warn").mockImplementation((m: unknown) => {
      avisos.push(String(m));
    });
  });
  afterEach(() => espiao.mockRestore());

  it("token apresentado e recusado: avisa, com o motivo no texto", async () => {
    db.conviteDeParceria.findUnique.mockResolvedValue({
      ...CONVITE_BOM, expiraEm: JA_PASSOU,
    });
    const r = await resolverConviteDeParceria("tok_do_marcos_123456", AGORA);

    // A decisão continua a mesma: anônimo.
    expect(r).toBeNull();
    // Mas agora a casa fica sabendo.
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toContain("[CONVITE-RECUSADO]");
    expect(avisos[0]).toContain("motivo=vencido");
  });

  it("⛔ o aviso NUNCA carrega o token inteiro: ele é credencial", async () => {
    db.conviteDeParceria.findUnique.mockResolvedValue(null);
    // Valor inventado aqui mesmo: nunca existiu em lugar nenhum e não abre
    // nada. Ele existe justamente para PROVAR que o aviso não o publica — a
    // catraca de segredos e este teste querem exatamente a mesma coisa.
    // segredo-permitido
    const TOKEN = "tok_secreto_que_vale_como_senha_0123456789";
    await resolverConviteDeParceria(TOKEN, AGORA);

    expect(avisos[0]).not.toContain(TOKEN);
    // Só um prefixo curto, o bastante para casar com o link que a pessoa diz
    // ter usado — e curto demais para servir de credencial a quem ler o log.
    expect(avisos[0]).toContain("tok_secr");
    expect(avisos[0]).not.toContain("0123456789");
  });

  it("visitante SEM convite não gera aviso nenhum — senão o barulho vira ruído", async () => {
    const r = await resolverConviteDeParceria(undefined, AGORA);
    expect(r).toBeNull();
    expect(avisos).toHaveLength(0);
  });

  it("parceiro legítimo não gera aviso", async () => {
    db.conviteDeParceria.findUnique.mockResolvedValue(CONVITE_BOM);
    db.parceriaDoCliente.findUnique.mockResolvedValue(PARCERIA_VIVA);
    const r = await resolverConviteDeParceria("tok", AGORA);
    expect(r?.clientId).toBe("cli_foocci");
    expect(avisos).toHaveLength(0);
  });
});

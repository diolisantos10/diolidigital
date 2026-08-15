// "TOKEN ILEGÍVEL" NÃO É "SEM CONEXÃO" — as duas metades.
//
// ── O furo que este arquivo fecha (15/08/2026) ──────────────────────────────
// `loadConnectionToken` devolvia `null` para três fatos diferentes: a conexão
// não existe · é de outro workspace · o token não decifra. Os dois primeiros
// são estado normal do mundo; o terceiro é o COFRE quebrado, do nosso lado, e
// saía pela mesma porta calado.
//
// A consequência que isso produziria numa troca de chave malfeita: as conexões
// Meta dos clientes sumiriam do produto sem uma linha de erro, e o diagnóstico
// mandaria cada cliente reconectar — um a um, escondendo a causa única.
//
// AS DUAS METADES:
//   ⛔ o cofre quebrado é NOMEADO (`token_ilegivel`) e grita no log;
//   ✅ conexão inexistente e conexão de outro workspace continuam sendo o que
//      sempre foram, sem virar falso alarme de cofre.

import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({ metaConnection: { findUnique: vi.fn() } }));
vi.mock("@/lib/db/client", () => ({ prisma: db }));

import { carregarTokenDaConexao, loadConnectionToken } from "@/lib/integrations/meta/connections";
import { encryptSecret } from "@/lib/security/crypto";

const WS = "ws_dioli";

function linha(over: Record<string, unknown> = {}) {
  return {
    id: "conn_1",
    workspaceId: WS,
    platform: "instagram",
    name: "Foocci",
    externalId: "ig_9",
    clientId: "cli_foocci",
    accessTokenEncrypted: encryptSecret("token-de-verdade"),
    metaJson: "{}",
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.DATABASE_URL = "file:/data/dioli.db";
  delete process.env.CREDENTIALS_SECRET;
});

describe("⛔ o cofre quebrado tem nome próprio", () => {
  it("token que nenhuma chave abre volta como token_ilegivel — não como nao_existe", async () => {
    db.metaConnection.findUnique.mockResolvedValue(
      linha({ accessTokenEncrypted: "aa:bb:cc" }), // não decifra
    );

    const r = await carregarTokenDaConexao(WS, "conn_1");

    expect(r.ok).toBe(false);
    expect(r).toEqual({ ok: false, falha: "token_ilegivel" });
  });

  it("grita no log, e o grito NÃO carrega o texto cifrado nem o token", async () => {
    const erro = vi.spyOn(console, "error").mockImplementation(() => {});
    db.metaConnection.findUnique.mockResolvedValue(
      linha({ accessTokenEncrypted: "segredo-cifrado-que-nao-abre:bb:cc" }),
    );

    await carregarTokenDaConexao(WS, "conn_1");

    expect(erro).toHaveBeenCalledOnce();
    const mensagem = String(erro.mock.calls[0]![0]);
    expect(mensagem).toMatch(/\[cofre\]/);
    expect(mensagem).toMatch(/ILEGÍVEL/);
    // Log de produção é lido por quem tem o Railway. Nada de segredo nele.
    expect(mensagem).not.toContain("segredo-cifrado-que-nao-abre");
    erro.mockRestore();
  });
});

describe("✅ o caso limpo NÃO vira alarme de cofre", () => {
  it("conexão que não existe continua sendo nao_existe, sem log de cofre", async () => {
    const erro = vi.spyOn(console, "error").mockImplementation(() => {});
    db.metaConnection.findUnique.mockResolvedValue(null);

    const r = await carregarTokenDaConexao(WS, "some");

    expect(r).toEqual({ ok: false, falha: "nao_existe" });
    expect(erro).not.toHaveBeenCalled();
    erro.mockRestore();
  });

  it("conexão de OUTRO workspace é fora_do_workspace — a fronteira não afrouxou", async () => {
    const erro = vi.spyOn(console, "error").mockImplementation(() => {});
    db.metaConnection.findUnique.mockResolvedValue(linha({ workspaceId: "ws_alheio" }));

    const r = await carregarTokenDaConexao(WS, "conn_1");

    expect(r).toEqual({ ok: false, falha: "fora_do_workspace" });
    // Fronteira violada não é falha de cofre e não pode acender esse alarme.
    expect(erro).not.toHaveBeenCalled();
    erro.mockRestore();
  });

  it("token bom devolve o token e o dono DERIVADO DA LINHA, não do chamador", async () => {
    db.metaConnection.findUnique.mockResolvedValue(linha());

    const r = await carregarTokenDaConexao(WS, "conn_1");

    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("inalcançável");
    expect(r.conexao.token).toBe("token-de-verdade");
    expect(r.conexao.clientId).toBe("cli_foocci");
    expect(r.conexao.externalId).toBe("ig_9");
  });

  it('clientId "" continua normalizado para null — a trava de 06/08 não foi afrouxada', async () => {
    db.metaConnection.findUnique.mockResolvedValue(linha({ clientId: "" }));

    const r = await carregarTokenDaConexao(WS, "conn_1");
    if (!r.ok) throw new Error("deveria ter carregado");
    expect(r.conexao.clientId).toBeNull();
  });
});

describe("o contrato antigo não mudou — 25 chamadores dependem dele", () => {
  it("loadConnectionToken continua devolvendo null nos três casos de falha", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    for (const l of [null, linha({ workspaceId: "outro" }), linha({ accessTokenEncrypted: "a:b:c" })]) {
      db.metaConnection.findUnique.mockResolvedValue(l);
      expect(await loadConnectionToken(WS, "conn_1")).toBeNull();
    }
  });

  it("e continua devolvendo o mesmo objeto no caso bom", async () => {
    db.metaConnection.findUnique.mockResolvedValue(linha());
    const v = await loadConnectionToken(WS, "conn_1");
    expect(v).toMatchObject({ token: "token-de-verdade", platform: "instagram", clientId: "cli_foocci" });
  });
});

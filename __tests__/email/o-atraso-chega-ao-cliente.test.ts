// O ATRASO CHEGA AO CLIENTE — o gatilho que nenhum teste alcançava.
//
// ── COMO ESTE ARQUIVO NASCEU ───────────────────────────────────────────────
// Mutação: arranquei o aviso ao cliente do executor do Gerente Geral. **656
// testes continuaram verdes.** O gatilho existia e nenhuma régua o tocava — é
// assim que a próxima refatoração o apaga sem ninguém ver.
//
// ── A REGRA QUE ELE PROTEGE ────────────────────────────────────────────────
// `batida-da-v2.ts` dizia, em comentário, *"coluna gravada não é cliente
// informado"* — logo acima do código que gravava a coluna e parava ali. O
// cliente cujo prazo queimou é exatamente o que NÃO está olhando o portal: ele
// está esperando. O aviso tem de sair pelo canal do cliente.
//
// ⚠️ E a trava de flag continua inteira: efeito externo nasce FECHADO. Com a
// `v2_execucao` desligada no escopo daquele cliente, nada é gravado e nada é
// enviado — o efeito falha declarado e volta para a fila.

import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  portalMessage: { create: vi.fn() },
  client: { findUnique: vi.fn() },
  flagV2: { findMany: vi.fn() },
  outboxV2: { findMany: vi.fn(), update: vi.fn() },
  heartbeatDoRelogio: { findMany: vi.fn(), upsert: vi.fn() },
}));
const canal = vi.hoisted(() => ({ avisar: vi.fn() }));

vi.mock("@/lib/db/client", () => ({ prisma: db }));
vi.mock("@/lib/agency/esteira/avisos", () => ({ avisarCliente: canal.avisar }));

const { EXECUTORES } = await import("@/lib/agency/v2-recovery/batida-da-v2");

const CARGA = { clienteId: "c_foocci", autorNome: "Gerente Geral", corpo: "O pacote de dezembro vai atrasar." };

beforeEach(() => {
  db.portalMessage.create.mockReset().mockResolvedValue({});
  db.client.findUnique.mockReset().mockResolvedValue({ workspaceId: "w1" });
  // Flag LIGADA no escopo do cliente — é a condição para o efeito sair.
  db.flagV2.findMany.mockReset().mockResolvedValue([
    { chave: "v2_execucao", escopo: "c_foocci", ligada: true },
  ]);
  canal.avisar.mockReset().mockResolvedValue({ registrado: true, enviadoAutomaticamente: true, canal: "email" });
});

describe("o Gerente Geral avisa o CLIENTE, não só a coluna", () => {
  it("grava a mensagem do portal — o registro continua", async () => {
    await EXECUTORES.mensagem_ao_cliente(CARGA, "corr_1");
    expect(db.portalMessage.create).toHaveBeenCalledTimes(1);
  });

  it("🔴 E CHAMA O CANAL DO CLIENTE — era isto que faltava", async () => {
    await EXECUTORES.mensagem_ao_cliente(CARGA, "corr_1");
    expect(canal.avisar).toHaveBeenCalledTimes(1);
  });

  it("com o tipo ATRASO, que é o que escolhe o molde certo", async () => {
    await EXECUTORES.mensagem_ao_cliente(CARGA, "corr_1");
    expect(canal.avisar.mock.calls[0][0].tipo).toBe("atraso");
  });

  it("com o corpo que o Gerente Geral escreveu, e o cliente certo", async () => {
    await EXECUTORES.mensagem_ao_cliente(CARGA, "corr_1");
    const a = canal.avisar.mock.calls[0][0];
    expect(a.clientId).toBe("c_foocci");
    expect(a.workspaceId).toBe("w1");
    expect(a.texto).toContain("vai atrasar");
  });
});

describe("as travas em volta do gatilho", () => {
  it("flag DESLIGADA: nada é gravado e NADA é avisado — efeito externo nasce fechado", async () => {
    db.flagV2.findMany.mockResolvedValue([]);
    await expect(EXECUTORES.mensagem_ao_cliente(CARGA, "corr_1")).rejects.toThrow(/v2_execucao desligada/);
    expect(db.portalMessage.create).not.toHaveBeenCalled();
    expect(canal.avisar).not.toHaveBeenCalled();
  });

  it("carga sem corpo não vira mensagem nem aviso", async () => {
    await expect(
      EXECUTORES.mensagem_ao_cliente({ clienteId: "c_foocci", corpo: "  " }, "corr_1"),
    ).rejects.toThrow(/sem cliente ou sem corpo/);
    expect(canal.avisar).not.toHaveBeenCalled();
  });

  it("cliente sem workspace não avisa — melhor calado que no lugar errado", async () => {
    db.client.findUnique.mockResolvedValue(null);
    await EXECUTORES.mensagem_ao_cliente(CARGA, "corr_1");
    expect(db.portalMessage.create).toHaveBeenCalledTimes(1);
    expect(canal.avisar).not.toHaveBeenCalled();
  });

  it("o aviso que FALHA não derruba o efeito — o registro já está feito", async () => {
    canal.avisar.mockRejectedValue(new Error("rede caiu"));
    await expect(EXECUTORES.mensagem_ao_cliente(CARGA, "corr_1")).resolves.toBeUndefined();
    expect(db.portalMessage.create).toHaveBeenCalledTimes(1);
  });
});

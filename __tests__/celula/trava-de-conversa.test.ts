// trava-de-conversa.test.ts — as duas metades de cada trava: ela BARRA o caso
// plantado, e ela NÃO barra o caso limpo. Ver docs/celula-prospeccao/despachos/C-trava-de-conversa.md

import { describe, it, expect, vi } from "vitest";
import {
  comATravaDaConversa,
  verificarMensagemDuplicada,
  verificarPerguntaRepetida,
  verificarContradicao,
  verificarLimiteDeModelo,
  type EstadoDaConversa,
  type PortaDaConversa,
  type PedidoDeTrava,
} from "@/lib/agency/celula/mensagens/trava-de-conversa";
import { LIMITE_DE_INSISTENCIA } from "@/lib/agency/comercial/pergunta-repetida";

// ── Fábricas de teste ────────────────────────────────────────────────────────

function estadoBase(overrides: Partial<EstadoDaConversa> = {}): EstadoDaConversa {
  return {
    conversaId: "conversa-1",
    ultimaRecebida: null,
    ultimaEnviada: null,
    agenteResponsavel: null,
    etapa: "descoberta",
    perguntasJaFeitas: [],
    respostasRecebidas: {},
    arquivos: [],
    proximaAcao: null,
    modelosJaUsados: [],
    ...overrides,
  };
}

/** Porta fake em memória. `reservarRetorna` e `lerRetorna` deixam o teste
 *  plantar exatamente o comportamento do caso que está sendo medido. */
function criarPorta(opts: {
  reservarRetorna?: boolean;
  lerRetorna?: EstadoDaConversa | null;
  lerLanca?: boolean;
} = {}): PortaDaConversa {
  const ler = vi.fn(async (): Promise<EstadoDaConversa | null> => {
    if (opts.lerLanca) throw new Error("falha simulada de leitura");
    return opts.lerRetorna ?? null;
  });
  const reservar = vi.fn(async (): Promise<boolean> => opts.reservarRetorna ?? true);
  const liberar = vi.fn(async (): Promise<void> => {});
  return { reservar, ler, liberar };
}

function pedidoBase(overrides: Partial<PedidoDeTrava> & { porta: PortaDaConversa }): PedidoDeTrava {
  return {
    conversaId: "conversa-1",
    agente: "agente-b",
    mensagemCandidata: "Oi! Tudo bem?",
    agora: new Date("2026-08-30T12:00:00Z"),
    ...overrides,
  };
}

// ── 1. Conversa ocupada ⇒ BLOQUEIO, com o nome do primeiro ───────────────────

describe("conversa ocupada", () => {
  it("bloqueia o segundo agente e nomeia o primeiro", async () => {
    const porta = criarPorta({
      reservarRetorna: false,
      lerRetorna: estadoBase({ agenteResponsavel: "agente-a" }),
    });
    const veredito = await comATravaDaConversa(pedidoBase({ porta }));

    expect(veredito.ok).toBe(false);
    if (veredito.ok) throw new Error("deveria ter bloqueado");
    expect(veredito.causa).toBe("conversa_ocupada");
    expect(veredito.motivo).toContain("agente-a");
    // Nada foi reservado por nós — nada para liberar.
    expect(porta.liberar).not.toHaveBeenCalled();
  });
});

// ── conversa inexistente ──────────────────────────────────────────────────

describe("conversa inexistente", () => {
  it("bloqueia sem inventar estado vazio, e libera a reserva", async () => {
    const porta = criarPorta({ reservarRetorna: true, lerRetorna: null });
    const veredito = await comATravaDaConversa(pedidoBase({ porta }));

    expect(veredito.ok).toBe(false);
    if (veredito.ok) throw new Error("deveria ter bloqueado");
    expect(veredito.causa).toBe("conversa_inexistente");
    expect(porta.liberar).toHaveBeenCalledWith({ conversaId: "conversa-1", agente: "agente-b" });
  });
});

// ── 2. Mensagem duplicada ⇒ BLOQUEADA ────────────────────────────────────────

describe("mensagem duplicada", () => {
  it("bloqueia texto idêntico à última enviada, mesmo com caixa/espaço diferentes", async () => {
    const estado = estadoBase({
      ultimaEnviada: { em: "2026-08-30T10:00:00Z", texto: "Oi!   Tudo bem?", codigoDoModelo: null },
    });
    const porta = criarPorta({ reservarRetorna: true, lerRetorna: estado });
    const veredito = await comATravaDaConversa(
      pedidoBase({ porta, mensagemCandidata: "oi! tudo bem?" }),
    );

    expect(veredito.ok).toBe(false);
    if (veredito.ok) throw new Error("deveria ter bloqueado");
    expect(veredito.causa).toBe("mensagem_duplicada");
    expect(porta.liberar).toHaveBeenCalledTimes(1);
  });

  it("a metade gêmea: mensagem NOVA passa", () => {
    const estado = estadoBase({
      ultimaEnviada: { em: "2026-08-30T10:00:00Z", texto: "Oi! Tudo bem?", codigoDoModelo: null },
    });
    expect(verificarMensagemDuplicada(estado, "Me conta um pouco do seu negócio.")).toBeNull();
  });
});

// ── 3. Pergunta repetida ─────────────────────────────────────────────────────

describe("pergunta repetida", () => {
  it("bloqueia já na primeira vez quando a resposta já está registrada", () => {
    const estado = estadoBase({
      perguntasJaFeitas: [],
      respostasRecebidas: { prospect_name_biz: "Padaria da Maria" },
    });
    const veredito = verificarPerguntaRepetida(estado, "Qual é o nome do seu negócio?");
    expect(veredito).not.toBeNull();
    expect(veredito?.causa).toBe("pergunta_repetida");
    expect(veredito?.motivo).toContain("prospect_name_biz");
  });

  it("bloqueia depois de passar do LIMITE_DE_INSISTENCIA", () => {
    const jaFeitas = Array.from({ length: LIMITE_DE_INSISTENCIA }, () => "publico_alvo");
    const estado = estadoBase({ perguntasJaFeitas: jaFeitas });
    const veredito = verificarPerguntaRepetida(estado, "Quem é o público do seu negócio?");
    expect(veredito).not.toBeNull();
    expect(veredito?.causa).toBe("pergunta_repetida");
  });

  it("a metade gêmea: pergunta INÉDITA passa", () => {
    const estado = estadoBase({ perguntasJaFeitas: [], respostasRecebidas: {} });
    expect(verificarPerguntaRepetida(estado, "Em quais redes sociais vocês estão?")).toBeNull();
  });

  it("a metade gêmea: fala que não é pergunta passa", () => {
    const estado = estadoBase({
      perguntasJaFeitas: Array.from({ length: 10 }, () => "publico_alvo"),
    });
    expect(verificarPerguntaRepetida(estado, "Perfeito, anotado por aqui.")).toBeNull();
  });
});

// ── 4. Contradição de agente ─────────────────────────────────────────────────

describe("contradição de agente", () => {
  it("bloqueia preço diferente declarado para a mesma conversa", () => {
    const estado = estadoBase({
      ultimaEnviada: { em: "x", texto: "Fica R$ 590 por mês.", codigoDoModelo: null },
    });
    const veredito = verificarContradicao(estado, "Fica R$ 690 por mês.");
    expect(veredito).not.toBeNull();
    expect(veredito?.causa).toBe("contradicao_de_agente");
  });

  it("bloqueia prazo diferente declarado para a mesma conversa", () => {
    const estado = estadoBase({
      ultimaEnviada: { em: "x", texto: "A gente entrega em 10 dias.", codigoDoModelo: null },
    });
    const veredito = verificarContradicao(estado, "A gente entrega em 20 dias.");
    expect(veredito).not.toBeNull();
    expect(veredito?.causa).toBe("contradicao_de_agente");
  });

  it("bloqueia negar um serviço que a fala anterior afirmou incluído", () => {
    const estado = estadoBase({
      ultimaEnviada: { em: "x", texto: "O pacote inclui tráfego pago.", codigoDoModelo: null },
    });
    const veredito = verificarContradicao(estado, "O pacote não inclui tráfego pago.");
    expect(veredito).not.toBeNull();
    expect(veredito?.causa).toBe("contradicao_de_agente");
  });

  it("a metade gêmea: afirmação COERENTE passa", () => {
    const estado = estadoBase({
      ultimaEnviada: { em: "x", texto: "Fica R$ 590 por mês e inclui tráfego pago.", codigoDoModelo: null },
    });
    expect(verificarContradicao(estado, "Confirmando: R$ 590 por mês, com tráfego pago incluso.")).toBeNull();
  });

  it("a metade gêmea: valores ambíguos (mais de um R$ no texto) não disparam", () => {
    const estado = estadoBase({
      ultimaEnviada: {
        em: "x",
        texto: "Temos o plano de R$ 290 ou o de R$ 590, à sua escolha.",
        codigoDoModelo: null,
      },
    });
    expect(verificarContradicao(estado, "O post avulso fica R$ 79.")).toBeNull();
  });
});

// ── 5. Modelo além do teto ───────────────────────────────────────────────────

describe("modelo além do teto", () => {
  it("bloqueia quando o modelo já foi usado o máximo de vezes", () => {
    const estado = estadoBase({ modelosJaUsados: ["M01", "M01"] });
    const veredito = verificarLimiteDeModelo(estado, "M01", 2);
    expect(veredito).not.toBeNull();
    expect(veredito?.causa).toBe("modelo_ja_usado");
  });

  it("a metade gêmea: dentro do teto passa", () => {
    const estado = estadoBase({ modelosJaUsados: ["M01"] });
    expect(verificarLimiteDeModelo(estado, "M01", 2)).toBeNull();
  });

  it("sem teto declarado (Ficha A não passou o parâmetro), não bloqueia", () => {
    const estado = estadoBase({ modelosJaUsados: ["M01", "M01", "M01"] });
    expect(verificarLimiteDeModelo(estado, "M01", null)).toBeNull();
  });
});

// ── 6. A trava é SEMPRE liberada ─────────────────────────────────────────────

describe("a trava é sempre liberada", () => {
  it("libera quando uma conferência bloqueia", async () => {
    const estado = estadoBase({
      ultimaEnviada: { em: "x", texto: "Combinado, R$ 590.", codigoDoModelo: null },
    });
    const porta = criarPorta({ reservarRetorna: true, lerRetorna: estado });
    const veredito = await comATravaDaConversa(
      pedidoBase({ porta, mensagemCandidata: "Combinado, R$ 590." }),
    );
    expect(veredito.ok).toBe(false);
    expect(porta.liberar).toHaveBeenCalledWith({ conversaId: "conversa-1", agente: "agente-b" });
  });

  it("libera mesmo quando a conferência lança uma exceção", async () => {
    const porta = criarPorta({ reservarRetorna: true, lerLanca: true });
    await expect(comATravaDaConversa(pedidoBase({ porta }))).rejects.toThrow("falha simulada de leitura");
    expect(porta.liberar).toHaveBeenCalledWith({ conversaId: "conversa-1", agente: "agente-b" });
  });

  it("no caminho de sucesso, devolve `liberar()` para o chamador acionar depois", async () => {
    const estado = estadoBase();
    const porta = criarPorta({ reservarRetorna: true, lerRetorna: estado });
    const veredito = await comATravaDaConversa(pedidoBase({ porta }));

    expect(veredito.ok).toBe(true);
    if (!veredito.ok) throw new Error("deveria ter passado");
    // Ainda não foi liberada automaticamente — é o chamador quem decide a hora.
    expect(porta.liberar).not.toHaveBeenCalled();
    await veredito.liberar();
    expect(porta.liberar).toHaveBeenCalledWith({ conversaId: "conversa-1", agente: "agente-b" });
  });
});

// ── 7. As metades gêmeas, compostas: tudo limpo passa ────────────────────────

describe("conversa livre, tudo limpo", () => {
  it("passa: mensagem nova, pergunta inédita, afirmação coerente, modelo dentro do teto", async () => {
    const estado = estadoBase({
      ultimaEnviada: { em: "x", texto: "Fica R$ 590 por mês e inclui tráfego pago.", codigoDoModelo: "M01" },
      perguntasJaFeitas: ["prospect_name_biz"],
      respostasRecebidas: { prospect_name_biz: "Padaria da Maria" },
      modelosJaUsados: ["M01"],
    });
    const porta = criarPorta({ reservarRetorna: true, lerRetorna: estado });
    const veredito = await comATravaDaConversa(
      pedidoBase({
        porta,
        mensagemCandidata: "Confirmando: R$ 590 por mês, com tráfego pago incluso. Em quais redes sociais vocês estão?",
        codigoDoModelo: "M02",
        maximoDeUsosDoModelo: 2,
      }),
    );

    expect(veredito.ok).toBe(true);
    if (!veredito.ok) throw new Error(`deveria ter passado: ${veredito.motivo}`);
    expect(veredito.estado.conversaId).toBe("conversa-1");
  });
});

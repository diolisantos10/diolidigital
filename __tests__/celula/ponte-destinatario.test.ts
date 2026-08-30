// T1 — DESTINATÁRIO DIVERGENTE BLOQUEIA O ENVIO (prova nº 14).
//
// `conferirDestinatario` é pura — sem banco, sem mock. Cobre a metade suja
// (cada eixo divergindo, e ausência de destino) e a metade limpa (destino
// idêntico passa). `avaliarEnvioAoCliente` cobre a composição com o estado do
// arquivo e com T2 (endereço interno na mensagem de acompanhamento).

import { describe, it, expect } from "vitest";
import { conferirDestinatario, avaliarEnvioAoCliente } from "@/lib/agency/celula/ponte/saida";
import type { ArquivoParaConferencia, DestinoPretendido } from "@/lib/agency/celula/ponte/tipos";

function arquivoBase(overrides: Partial<ArquivoParaConferencia> = {}): ArquivoParaConferencia {
  return {
    id: "arq_1",
    workspaceId: "ws_1",
    oportunidadeId: "opp_1",
    clienteId: "cli_1",
    projetoId: null,
    direcao: "dioli_para_cliente",
    linhagemId: "lin_1",
    versao: 1,
    destinatarioDeclarado: "cliente-a@exemplo.com",
    estado: "aprovado_para_envio",
    caminhoInterno: "cli_1/arq_1.pdf",
    ...overrides,
  };
}

function destinoBase(overrides: Partial<DestinoPretendido> = {}): DestinoPretendido {
  return {
    oportunidadeId: "opp_1",
    clienteId: "cli_1",
    projetoId: null,
    destinatarioDeclarado: "cliente-a@exemplo.com",
    ...overrides,
  };
}

describe("conferirDestinatario — metade limpa", () => {
  it("destino idêntico ao declarado em todos os três eixos → PASSA", () => {
    const veredicto = conferirDestinatario({ arquivo: arquivoBase(), destinoPretendido: destinoBase() });
    expect(veredicto.ok).toBe(true);
  });
});

describe("conferirDestinatario — metade suja: cada eixo divergente bloqueia", () => {
  it("destinatarioDeclarado divergente → BLOQUEIA, com motivo legível e pedido de exceção", () => {
    const veredicto = conferirDestinatario({
      arquivo: arquivoBase(),
      destinoPretendido: destinoBase({ destinatarioDeclarado: "cliente-b@exemplo.com" }),
    });
    expect(veredicto.ok).toBe(false);
    if (veredicto.ok) throw new Error("não deveria passar");
    expect(veredicto.eixosDivergentes).toContain("destinatarioDeclarado");
    expect(veredicto.motivo).toMatch(/bloqueado/i);
    expect(veredicto.abrirExcecao.caso).toBe("destinatario_divergente");
  });

  it("oportunidadeId divergente → BLOQUEIA — arquivo do cliente A não chega ao cliente B (prova nº 14)", () => {
    const veredicto = conferirDestinatario({
      arquivo: arquivoBase({ oportunidadeId: "opp_do_cliente_A" }),
      destinoPretendido: destinoBase({ oportunidadeId: "opp_do_cliente_B" }),
    });
    expect(veredicto.ok).toBe(false);
    if (veredicto.ok) throw new Error("não deveria passar");
    expect(veredicto.eixosDivergentes).toContain("oportunidadeId");
  });

  it("clienteId/projetoId divergente → BLOQUEIA", () => {
    const veredicto = conferirDestinatario({
      arquivo: arquivoBase({ clienteId: "cli_1" }),
      destinoPretendido: destinoBase({ clienteId: "cli_2" }),
    });
    expect(veredicto.ok).toBe(false);
    if (veredicto.ok) throw new Error("não deveria passar");
    expect(veredicto.eixosDivergentes).toContain("clienteId/projetoId");
  });

  it("fail-closed: destino SEM destinatarioDeclarado (ausente/vazio) → BLOQUEIA — ausência não é informação", () => {
    const veredicto = conferirDestinatario({
      arquivo: arquivoBase(),
      destinoPretendido: destinoBase({ destinatarioDeclarado: "   " }),
    });
    expect(veredicto.ok).toBe(false);
    if (veredicto.ok) throw new Error("não deveria passar");
    expect(veredicto.eixosDivergentes.some((e) => e.includes("ausente"))).toBe(true);
  });

  it("fail-closed: destino SEM clienteId nem projetoId → BLOQUEIA", () => {
    const veredicto = conferirDestinatario({
      arquivo: arquivoBase(),
      destinoPretendido: destinoBase({ clienteId: null, projetoId: null }),
    });
    expect(veredicto.ok).toBe(false);
    if (veredicto.ok) throw new Error("não deveria passar");
    expect(veredicto.eixosDivergentes.some((e) => e.startsWith("clienteId/projetoId"))).toBe(true);
  });
});

describe("avaliarEnvioAoCliente — composição: estado + T1 + T2", () => {
  it("arquivo fora de 'aprovado_para_envio' → BLOQUEIA antes mesmo de checar destinatário", () => {
    const resultado = avaliarEnvioAoCliente({
      arquivo: arquivoBase({ estado: "recebido" }),
      destinoPretendido: destinoBase(),
    });
    expect(resultado.ok).toBe(false);
    if (resultado.ok) throw new Error("não deveria passar");
    expect(resultado.motivo).toMatch(/recebido/);
  });

  it("metade limpa: 'aprovado_para_envio' + destino idêntico + sem mensagem → PASSA", () => {
    const resultado = avaliarEnvioAoCliente({
      arquivo: arquivoBase({ estado: "aprovado_para_envio" }),
      destinoPretendido: destinoBase(),
    });
    expect(resultado.ok).toBe(true);
  });

  it("destinatário divergente → BLOQUEIA com o pedido de exceção de T1", () => {
    const resultado = avaliarEnvioAoCliente({
      arquivo: arquivoBase({ estado: "aprovado_para_envio" }),
      destinoPretendido: destinoBase({ destinatarioDeclarado: "outro@exemplo.com" }),
    });
    expect(resultado.ok).toBe(false);
    if (resultado.ok) throw new Error("não deveria passar");
    expect(resultado.abrirExcecao?.caso).toBe("destinatario_divergente");
  });

  it("mensagem de acompanhamento com o caminho interno do arquivo → BLOQUEIA (T2), mesmo com destinatário correto", () => {
    const arquivo = arquivoBase({ estado: "aprovado_para_envio", caminhoInterno: "cli_1/arq_1.pdf" });
    const resultado = avaliarEnvioAoCliente({
      arquivo,
      destinoPretendido: destinoBase(),
      mensagemDeAcompanhamento: "Segue o material, salvo em cli_1/arq_1.pdf no nosso sistema.",
    });
    expect(resultado.ok).toBe(false);
    if (resultado.ok) throw new Error("não deveria passar");
    expect(resultado.motivo).toMatch(/caminho interno/i);
  });

  it("metade limpa de T2: mensagem normal, sem caminho nenhum, PASSA", () => {
    const resultado = avaliarEnvioAoCliente({
      arquivo: arquivoBase({ estado: "aprovado_para_envio" }),
      destinoPretendido: destinoBase(),
      mensagemDeAcompanhamento: "Segue o material combinado. Qualquer dúvida, é só chamar!",
    });
    expect(resultado.ok).toBe(true);
  });
});

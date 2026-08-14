// ── O TESTE DO CABEÇALHO — regra 2 do despacho de 14/08/2026 ────────────────
//
//   > Cabeçalho: símbolo/logo do cliente · nome da marca ao lado · ABAIXO, o
//   > nome da tela ("Visão Geral"). É PROIBIDO "Visão Geral da Marca / do
//   > Cliente / da Foocci". Nome e símbolo vêm do cadastro do cliente,
//   > dinamicamente.
//
// A regra vive em código (`lib/agency/portal/cabecalho.ts`) e não só no
// comentário do componente porque regra escrita em comentário já foi quebrada
// aqui antes — guardrail 4 do CLAUDE.md: prompt é aviso, código é trava.
//
// Além de proibir a colagem, este teste garante o outro lado da regra: que o
// nome e o símbolo VÊM DO CADASTRO. Se alguém fixar "Foocci" na tela, a
// asserção com outro cliente reprova.

import { describe, expect, it } from "vitest";
import { cabecalhoDoPortal, simboloDaMarca } from "@/lib/agency/portal/cabecalho";

describe("o cabeçalho do portal do cliente", () => {
  it("devolve as três peças SEPARADAS — símbolo, marca e tela", () => {
    const c = cabecalhoDoPortal("Foocci", "Visão Geral");
    expect(c).toEqual({ simbolo: "F", marca: "Foocci", tela: "Visão Geral" });
    // O nome da tela não carrega a marca dentro, em hipótese nenhuma.
    expect(c.tela).not.toContain(c.marca);
  });

  it("RECUSA a colagem proibida em vez de corrigir em silêncio", () => {
    for (const proibido of [
      "Visão Geral da Marca",
      "Visão Geral do Cliente",
      "Visão Geral da Foocci",
      "Visão Geral de Foocci",
      "Painel do Cliente",
      "Resultados da Marca",
    ]) {
      expect(() => cabecalhoDoPortal("Foocci", proibido), `deveria recusar: ${proibido}`).toThrow();
    }
  });

  it("aceita os 11 nomes de tela do handoff, e só eles precisam passar", () => {
    const abas = [
      "Visão Geral", "Social Media", "Tráfego Pago", "Resultados", "Projetos",
      "Aprovações", "Entregas", "Brand Hub", "Solicitações", "Integrações", "Minha conta",
    ];
    for (const aba of abas) {
      expect(() => cabecalhoDoPortal("Foocci", aba), `deveria aceitar: ${aba}`).not.toThrow();
    }
    expect(abas).toHaveLength(11);
  });

  it("o nome e o símbolo vêm do CADASTRO — nada fixo em Foocci", () => {
    expect(cabecalhoDoPortal("Sushi Cazza", "Entregas")).toEqual({
      simbolo: "S", marca: "Sushi Cazza", tela: "Entregas",
    });
    expect(cabecalhoDoPortal("citY jobs", "Projetos").simbolo).toBe("C");
    // Nome que começa com número ou pontuação continua tendo símbolo legível.
    expect(simboloDaMarca("3 Irmãos Burger")).toBe("3");
    expect(simboloDaMarca("  ácido Café")).toBe("Á");
    // Cadastro sem nome não vira quadrado em branco no canto da tela.
    expect(simboloDaMarca("")).toBe("•");
    expect(simboloDaMarca("   ")).toBe("•");
  });

  it("não acrescenta preposição nem espaço ao nome da marca", () => {
    const c = cabecalhoDoPortal("  Foocci  ", "Visão Geral");
    expect(c.marca).toBe("Foocci");
    expect(c.marca).not.toMatch(/^(da|do|de)\s/i);
  });
});

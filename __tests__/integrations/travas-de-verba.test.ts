// AS TRAVAS DA VERBA — as duas metades.
//
// O que se prova: o portão barra o que gasta, e NÃO barra o que não gasta.
// Portão que barra tudo o operador contorna na primeira semana; portão que
// libera o desconhecido é o que restringiu a conta da casa em 03/08.

import { describe, it, expect } from "vitest";
import { conferirOperacao, AUMENTO_SEM_AUTORIZACAO } from "@/lib/integrations/meta/travas";

describe("o que NÃO gasta passa direto", () => {
  it("ler desempenho", () => {
    expect(conferirOperacao({ operacao: "ler_desempenho" }).exigeAutorizacao).toBe(false);
  });
  it("pausar — frear é sempre permitido", () => {
    const v = conferirOperacao({ operacao: "pausar" });
    expect(v.liberado).toBe(true);
    expect(v.exigeAutorizacao).toBe(false);
  });
  it("criar campanha pausada e editar texto", () => {
    expect(conferirOperacao({ operacao: "criar_campanha_pausada" }).exigeAutorizacao).toBe(false);
    expect(conferirOperacao({ operacao: "editar_texto" }).exigeAutorizacao).toBe(false);
  });
  it("BAIXAR a verba não pede autorização", () => {
    const v = conferirOperacao({ operacao: "mudar_orcamento", orcamentoAtualBRL: 100, orcamentoNovoBRL: 50 });
    expect(v.liberado).toBe(true);
    expect(v.exigeAutorizacao).toBe(false);
  });
});

describe("o que gasta, para", () => {
  it("ativar campanha exige autorização", () => {
    const v = conferirOperacao({ operacao: "ativar" });
    expect(v.liberado).toBe(false);
    expect(v.motivo).toMatch(/dinheiro/i);
  });
  it("aumentar verba exige autorização", () => {
    const v = conferirOperacao({ operacao: "mudar_orcamento", orcamentoAtualBRL: 100, orcamentoNovoBRL: 115 });
    expect(v.exigeAutorizacao).toBe(true);
    expect(v.motivo).toMatch(/15\.0%/);
  });
  it("teto de aumento é ZERO no lançamento — nenhum aumento passa sozinho", () => {
    expect(AUMENTO_SEM_AUTORIZACAO).toBe(0);
    expect(conferirOperacao({ operacao: "mudar_orcamento", orcamentoAtualBRL: 1000, orcamentoNovoBRL: 1001 }).exigeAutorizacao).toBe(true);
  });
  it("sem saber a verba de antes, não passa — não saber nunca vira permissão", () => {
    const v = conferirOperacao({ operacao: "mudar_orcamento", orcamentoNovoBRL: 500 });
    expect(v.liberado).toBe(false);
  });
  it("categoria especial sempre chama gente", () => {
    const v = conferirOperacao({ operacao: "mudar_orcamento", orcamentoAtualBRL: 100, orcamentoNovoBRL: 50, categoriaEspecial: true });
    expect(v.exigeAutorizacao).toBe(true);
  });
  it("pixel, evento e arquivar apagam a base de comparação — só com gente", () => {
    expect(conferirOperacao({ operacao: "trocar_pixel_ou_evento" }).exigeAutorizacao).toBe(true);
    expect(conferirOperacao({ operacao: "arquivar" }).exigeAutorizacao).toBe(true);
  });
});

describe("não existe chamada genérica", () => {
  it("operação fora do catálogo é RECUSADA, não interpretada", () => {
    const v = conferirOperacao({ operacao: "executar_qualquer_chamada_meta" });
    expect(v.liberado).toBe(false);
    expect(v.motivo).toMatch(/não existe no catálogo/i);
  });
});

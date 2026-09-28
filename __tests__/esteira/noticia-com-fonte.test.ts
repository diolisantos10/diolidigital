// noticia-com-fonte.test.ts — CARD DE NOTÍCIA SEM URL DE FONTE NÃO ENTRA (W12a).
//
// O que estes testes travam:
//   • notícia bem formada, com URL http(s) e dentro da janela, passa;
//   • sem URL (ou URL sem http/https), sem veículo ou sem título recusa;
//   • fora da janela de datas recusa.

import { describe, it, expect } from "vitest";
import { conferirNoticia, type NoticiaDoRadar } from "@/lib/agency/esteira/noticia-com-fonte";

const JANELA = { de: "2026-09-21", ate: "2026-09-27" };

const NOTICIA_VALIDA: NoticiaDoRadar = {
  titulo: "IA generativa passa a ser usada por metade das agências brasileiras",
  resumo: "Levantamento mostra adoção crescente entre pequenas agências.",
  veiculo: "Meio & Mensagem",
  url: "https://www.meioemensagem.com.br/materia-exemplo",
  dataPublicacao: "2026-09-24",
};

describe("conferirNoticia — a válida passa", () => {
  it("notícia com URL http(s), veículo, título e data dentro da janela passa", () => {
    expect(conferirNoticia(NOTICIA_VALIDA, JANELA)).toEqual({ passa: true });
  });

  it("aceita http (não só https)", () => {
    const r = conferirNoticia({ ...NOTICIA_VALIDA, url: "http://exemplo.com/materia" }, JANELA);
    expect(r.passa).toBe(true);
  });
});

describe("conferirNoticia — sem URL de fonte não entra", () => {
  it("url vazia recusa", () => {
    const r = conferirNoticia({ ...NOTICIA_VALIDA, url: "" }, JANELA);
    expect(r.passa).toBe(false);
    if (!r.passa) expect(r.motivo).toMatch(/card de notícia sem URL de fonte não entra/);
  });

  it("url sem http(s) (ex.: caminho de arquivo) recusa", () => {
    const r = conferirNoticia({ ...NOTICIA_VALIDA, url: "www.exemplo.com/materia" }, JANELA);
    expect(r.passa).toBe(false);
    if (!r.passa) expect(r.motivo).toMatch(/card de notícia sem URL de fonte não entra/);
  });
});

describe("conferirNoticia — outros campos obrigatórios", () => {
  it("título vazio recusa", () => {
    const r = conferirNoticia({ ...NOTICIA_VALIDA, titulo: "  " }, JANELA);
    expect(r.passa).toBe(false);
  });

  it("veículo vazio recusa", () => {
    const r = conferirNoticia({ ...NOTICIA_VALIDA, veiculo: "" }, JANELA);
    expect(r.passa).toBe(false);
  });
});

describe("conferirNoticia — janela de datas", () => {
  it("data antes da janela recusa", () => {
    const r = conferirNoticia({ ...NOTICIA_VALIDA, dataPublicacao: "2026-09-01" }, JANELA);
    expect(r.passa).toBe(false);
    if (!r.passa) expect(r.motivo).toMatch(/fora da janela/);
  });

  it("data depois da janela recusa", () => {
    const r = conferirNoticia({ ...NOTICIA_VALIDA, dataPublicacao: "2026-10-01" }, JANELA);
    expect(r.passa).toBe(false);
  });

  it("data nas bordas da janela (inclusive) passa", () => {
    expect(conferirNoticia({ ...NOTICIA_VALIDA, dataPublicacao: JANELA.de }, JANELA).passa).toBe(true);
    expect(conferirNoticia({ ...NOTICIA_VALIDA, dataPublicacao: JANELA.ate }, JANELA).passa).toBe(true);
  });

  it("data fora do formato AAAA-MM-DD recusa", () => {
    const r = conferirNoticia({ ...NOTICIA_VALIDA, dataPublicacao: "24/09/2026" }, JANELA);
    expect(r.passa).toBe(false);
  });
});

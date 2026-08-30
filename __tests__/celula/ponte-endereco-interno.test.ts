// T2 — O ENDEREÇO INTERNO NUNCA SAI. Pura — sem banco, sem mock.

import { describe, it, expect } from "vitest";
import {
  linkInternoTemporario,
  linkInternoValido,
  contemEnderecoInterno,
} from "@/lib/agency/celula/ponte/endereco-interno";

describe("linkInternoTemporario", () => {
  it("gera um link no formato interno, nunca uma URL pública", () => {
    const link = linkInternoTemporario({
      arquivoId: "arq_1",
      validoAteEm: new Date(Date.now() + 60_000),
      segredo: "segredo-de-teste",
    });
    expect(link).toMatch(/^\/interno\/celula\/arquivos\/arq_1\?exp=\d+&sig=[0-9a-f]{64}$/);
  });

  it("sem segredo, NUNCA gera um link 'assinado' com valor previsível — lança erro", () => {
    expect(() =>
      linkInternoTemporario({ arquivoId: "arq_1", validoAteEm: new Date(Date.now() + 60_000), segredo: "" }),
    ).toThrow();
  });
});

describe("linkInternoValido", () => {
  const segredo = "segredo-de-teste";

  it("metade limpa: link recém-gerado, com o segredo certo, é válido", () => {
    const validoAteEm = new Date(Date.now() + 60_000);
    const link = linkInternoTemporario({ arquivoId: "arq_1", validoAteEm, segredo });
    const url = new URL(link, "http://interno");
    const ok = linkInternoValido({
      arquivoId: "arq_1",
      exp: url.searchParams.get("exp"),
      sig: url.searchParams.get("sig"),
      segredo,
    });
    expect(ok).toBe(true);
  });

  it("metade suja: assinatura com segredo errado é inválida", () => {
    const validoAteEm = new Date(Date.now() + 60_000);
    const link = linkInternoTemporario({ arquivoId: "arq_1", validoAteEm, segredo });
    const url = new URL(link, "http://interno");
    const ok = linkInternoValido({
      arquivoId: "arq_1",
      exp: url.searchParams.get("exp"),
      sig: url.searchParams.get("sig"),
      segredo: "segredo-diferente",
    });
    expect(ok).toBe(false);
  });

  it("link expirado é inválido, mesmo com assinatura certa", () => {
    const validoAteEm = new Date(Date.now() - 1000); // já expirou
    const link = linkInternoTemporario({ arquivoId: "arq_1", validoAteEm, segredo });
    const url = new URL(link, "http://interno");
    const ok = linkInternoValido({
      arquivoId: "arq_1",
      exp: url.searchParams.get("exp"),
      sig: url.searchParams.get("sig"),
      segredo,
    });
    expect(ok).toBe(false);
  });

  it("fail-closed: exp ou sig ausentes → inválido", () => {
    expect(linkInternoValido({ arquivoId: "arq_1", exp: null, sig: "abc", segredo })).toBe(false);
    expect(linkInternoValido({ arquivoId: "arq_1", exp: "123", sig: null, segredo })).toBe(false);
  });
});

describe("contemEnderecoInterno — metade suja: cada marca interna é detectada e bloqueia", () => {
  const arquivo = { id: "arq_1_id_interno", caminhoInterno: "cli_1/arq_1_id_interno.pdf" };

  it("caminho interno do arquivo aparecendo no texto → BLOQUEIA", () => {
    const r = contemEnderecoInterno("Segue em cli_1/arq_1_id_interno.pdf", arquivo);
    expect(r.contem).toBe(true);
    if (!r.contem) throw new Error("deveria bloquear");
    expect(r.achado).toBe("caminho_interno");
  });

  it("id interno do arquivo aparecendo no texto → BLOQUEIA", () => {
    const r = contemEnderecoInterno("Referência interna: arq_1_id_interno", { id: "arq_1_id_interno", caminhoInterno: "outro/caminho.pdf" });
    expect(r.contem).toBe(true);
    if (!r.contem) throw new Error("deveria bloquear");
    expect(r.achado).toBe("id_do_arquivo");
  });

  it("prefixo do diretório interno de mídia aparecendo no texto → BLOQUEIA", () => {
    const r = contemEnderecoInterno("Baixe em /api/media/xyz123", { id: "outro_id", caminhoInterno: "outro/caminho.pdf" });
    expect(r.contem).toBe(true);
    if (!r.contem) throw new Error("deveria bloquear");
    expect(r.achado).toBe("prefixo_de_diretorio_de_midia");
  });

  it("link interno assinado (o formato de linkInternoTemporario) aparecendo no texto → BLOQUEIA", () => {
    const link = linkInternoTemporario({ arquivoId: "outro_id", validoAteEm: new Date(Date.now() + 60_000), segredo: "s" });
    const r = contemEnderecoInterno(`Clique aqui: ${link}`, { id: "outro_id_2", caminhoInterno: "x/y.pdf" });
    expect(r.contem).toBe(true);
    if (!r.contem) throw new Error("deveria bloquear");
    expect(r.achado).toBe("link_interno_assinado");
  });
});

describe("contemEnderecoInterno — metade limpa", () => {
  it("mensagem normal, sem caminho nenhum, PASSA", () => {
    const r = contemEnderecoInterno(
      "Segue o material combinado! Qualquer dúvida, me chama.",
      { id: "arq_1_id_interno", caminhoInterno: "cli_1/arq_1_id_interno.pdf" },
    );
    expect(r.contem).toBe(false);
  });
});

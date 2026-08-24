// A JUNTA ENTRE O DOCUMENTO E A MARCA QUE AS OUTRAS CASAS LEEM.
//
// O padrão que esta casa já pagou duas vezes: cada peça certa isoladamente, e a
// corrente arrebentando na junta. O especialista escreve a base de marca num
// `Deliverable` (texto), e o que social/design/tráfego consultam é o
// `BrandBrain`. Sem este colhedor, a casa constitui a marca e esquece dela.

import { describe, it, expect } from "vitest";
import { lerItensDaBase, fundirEstados } from "@/lib/agency/execution/colher-marca";
import { renderizarEntrega } from "@/lib/agency/esteira/renderizar-entrega";

const ENTREGA = {
  summary: "Farol 27 — base de marca",
  items: [
    { campo: "proposito_e_promessa", headline: "O que vocês fazem", estado: "definido",
      conteudo: "Pizza napolitana de bairro", fonte: "briefing" },
    { campo: "voz", headline: "Como vocês falam", estado: "lacuna",
      falta: "duas frases: uma do jeito que vocês falam, uma do jeito que nunca falariam" },
  ],
};

describe("o documento entregue é legível de volta", () => {
  it("o renderizador ESCREVE os campos que o colhedor LÊ (é a junta)", () => {
    const md = renderizarEntrega(ENTREGA as unknown as Record<string, unknown>);
    expect(md).toMatch(/- Campo: proposito_e_promessa/);
    expect(md).toMatch(/- Estado: definido/);
    expect(md).toMatch(/- Falta: duas frases/);

    const itens = lerItensDaBase(md);
    expect(itens).toHaveLength(2);
    expect(itens[0]).toMatchObject({ campo: "proposito_e_promessa", estado: "definido" });
    expect(itens[0].conteudo).toMatch(/Pizza napolitana/);
    expect(itens[1]).toMatchObject({ campo: "voz", estado: "lacuna", conteudo: "" });
    expect(itens[1].falta).toMatch(/duas frases/);
  });
});

describe("os estados por campo", () => {
  const agora = new Date("2026-08-24T12:00:00Z");

  it("a lacuna é gravada COMO lacuna, com o que falta junto", () => {
    const json = fundirEstados("{}", lerItensDaBase(renderizarEntrega(ENTREGA as never)), agora);
    const estados = JSON.parse(json);
    expect(estados.voz.estado).toBe("lacuna");
    expect(estados.voz.falta).toMatch(/duas frases/);
    expect(estados.proposito_e_promessa.estado).toBe("definido");
  });

  it("NÃO REBAIXA o que o dono já respondeu — a ficha vale mais que o documento", () => {
    const anterior = JSON.stringify({ voz: { estado: "definido", origem: "ficha_do_portal" } });
    const estados = JSON.parse(fundirEstados(anterior, lerItensDaBase(renderizarEntrega(ENTREGA as never)), agora));
    expect(estados.voz.estado).toBe("definido");
    expect(estados.voz.origem).toBe("ficha_do_portal");
  });

  it("JSON ilegível no banco não faz perder o que está sendo gravado agora", () => {
    const estados = JSON.parse(fundirEstados("{{lixo", lerItensDaBase(renderizarEntrega(ENTREGA as never)), agora));
    expect(estados.proposito_e_promessa.estado).toBe("definido");
  });
});

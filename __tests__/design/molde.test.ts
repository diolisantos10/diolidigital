import { describe, it, expect } from "vitest";

// O MOTOR DE MOLDE, parte pura: o que dá para provar sem subir navegador.
// A prova de que a letra SAI CERTA no pixel está em molde-render.test.ts —
// aqui está a prova de que ela sai certa no HTML, e de que cliente sem marca
// não recebe cor inventada.

import {
  moldeDoCliente, montarHtmlDaPeca, textosDaPeca, escaparHtml,
  FORMATOS, formatoDoPost, corValida, tintaSobre, familiaDeclarada, NEUTRO,
} from "@/lib/agency/design/molde";
import {
  travaDeTextoNaArte, tituloDaFonte, temLastroLiteral, CLASSES_PROIBIDAS_NA_ARTE,
} from "@/lib/agency/design/trava-de-texto";

const MARCA = { primaryColor: "#2F1B12", secondaryColor: "#E7B96B", typography: "Playfair Display" };

describe("o molde por CLIENTE — a tela 6 tem a mesma cara da tela 1", () => {
  it("nasce do BrandBrain: cor, cor de apoio e família tipográfica", () => {
    const m = moldeDoCliente(MARCA);
    expect(m.origem).toBe("marca");
    expect(m.primaria).toBe("#2F1B12");
    expect(m.secundaria).toBe("#E7B96B");
    expect(m.familia).toMatch(/Playfair/);
    expect(m.lacunas).toEqual([]);
  });

  it("o MESMO molde serve feed, story e carrossel — sem redesenhar nada", () => {
    const m = moldeDoCliente(MARCA);
    const html = (formato: "feed" | "story" | "carrossel") =>
      montarHtmlDaPeca({ formato, titulo: "Pão quentinho", assinatura: "Padaria" }, m);
    for (const f of ["feed", "story", "carrossel"] as const) {
      expect(html(f)).toContain("#2F1B12");
      expect(html(f)).toMatch(/Playfair/);
      expect(html(f)).toContain(`width:${FORMATOS[f].largura}px`);
      expect(html(f)).toContain(`height:${FORMATOS[f].altura}px`);
    }
    // E as dimensões são as de publicação, não "mais ou menos".
    expect(FORMATOS.feed).toMatchObject({ largura: 1080, altura: 1350 });
    expect(FORMATOS.story).toMatchObject({ largura: 1080, altura: 1920 });
  });

  it("duas peças do mesmo cliente saem com a mesma identidade", () => {
    const m = moldeDoCliente(MARCA);
    const a = montarHtmlDaPeca({ formato: "carrossel", titulo: "Tela um", indice: { atual: 1, total: 6 } }, m);
    const b = montarHtmlDaPeca({ formato: "carrossel", titulo: "Tela seis", indice: { atual: 6, total: 6 } }, m);
    const identidade = (h: string) => h.slice(0, h.indexOf("<body"));
    // O cabeçalho (cores, fontes, medidas) é IDÊNTICO; só o conteúdo muda.
    expect(identidade(a)).toBe(identidade(b));
    expect(a).toContain("1/6");
    expect(b).toContain("6/6");
  });

  it("o formato do post vira formato de peça — story nunca sai quadrado", () => {
    expect(formatoDoPost("story")).toBe("story");
    expect(formatoDoPost("carousel")).toBe("carrossel");
    expect(formatoDoPost("carrossel")).toBe("carrossel");
    expect(formatoDoPost("feed")).toBe("feed");
    expect(formatoDoPost(null)).toBe("feed");
  });
});

describe("cliente SEM marca definida: vazio é vazio", () => {
  it("sem cor no BrandBrain, entra o molde NEUTRO — declarado, não inventado", () => {
    const m = moldeDoCliente(null);
    expect(m.origem).toBe("neutro");
    expect(m.primaria).toBe(NEUTRO.primaria);
    expect(m.lacunas).toContain("cor primária da marca");
    expect(m.lacunas).toContain("tipografia da marca");
  });

  it("cor inválida é tratada como AUSÊNCIA, não como cor", () => {
    const m = moldeDoCliente({ primaryColor: "azul do mar", secondaryColor: "" });
    expect(m.origem).toBe("neutro");
    expect(corValida("azul do mar")).toBeNull();
    expect(corValida("#ABC")).toBe("#ABC");
  });

  it("sem cor primária, a secundária NÃO é promovida a cor da marca", () => {
    const m = moldeDoCliente({ secondaryColor: "#FF0000" });
    expect(m.origem).toBe("neutro");
    expect(m.primaria).not.toBe("#FF0000");
  });

  it("sem tipografia declarada, a família é a neutra — não se adivinha por segmento", () => {
    expect(familiaDeclarada("").declarada).toBe(false);
    expect(familiaDeclarada("Oswald").chave).toBe("condensada");
  });

  it("a tinta é decidida por CONTRASTE, não por gosto", () => {
    expect(tintaSobre("#FFFFFF")).toBe("#111111");
    expect(tintaSobre("#111111")).toBe("#FFFFFF");
  });
});

describe("o texto no HTML é o texto pedido", () => {
  it("caractere especial não vira marcação — e o DOM continua com o texto certo", () => {
    const m = moldeDoCliente(MARCA);
    const titulo = 'Pão & "manteiga" <do dia>';
    const html = montarHtmlDaPeca({ formato: "feed", titulo }, m);
    expect(html).not.toContain("<do dia>");
    expect(html).toContain(escaparHtml(titulo));
    // A lista que o renderizador confere contra o DOM guarda o texto ORIGINAL.
    expect(textosDaPeca({ formato: "feed", titulo }).map((t) => t.texto)).toEqual([titulo]);
  });

  it("caixa alta do selo é aplicada em JS, nunca por CSS", () => {
    // `text-transform` pinta uma coisa e deixa outra no DOM — seria o ponto
    // cego exato que o conferidor de letra existe para fechar.
    const html = montarHtmlDaPeca({ formato: "feed", titulo: "Oi", selo: "produto" }, moldeDoCliente(MARCA));
    expect(html).not.toMatch(/text-transform/);
    expect(textosDaPeca({ formato: "feed", titulo: "Oi", selo: "produto" })[0]!.texto).toBe("PRODUTO");
  });

  it("o molde não busca nada na rede — fonte que não carrega troca a cara da peça em silêncio", () => {
    const html = montarHtmlDaPeca({ formato: "feed", titulo: "Oi" }, moldeDoCliente(MARCA));
    expect(html).not.toMatch(/@import|https?:\/\/fonts|<script/);
  });
});

describe("a trava do pixel: o que pode virar imagem", () => {
  const legenda = "Todo dia às seis o pão sai do forno e a casa inteira cheira a manhã. Vem tomar café #padaria";

  it("o título é PREFIXO literal da legenda — lastro por construção", () => {
    const t = tituloDaFonte(legenda);
    expect(t).toBe("Todo dia às seis o pão sai do forno e a casa inteira cheira a manhã");
    expect(temLastroLiteral(t, legenda)).toBe(true);
    expect(travaDeTextoNaArte(t, legenda).ok).toBe(true);
  });

  it("texto que NÃO está no conteúdo auditado não vira pixel", () => {
    const v = travaDeTextoNaArte("O melhor pão artesanal da região", legenda);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(["sem_lastro_no_conteudo_auditado", "classe_de_fato_proibida"]).toContain(v.motivo);
  });

  it("PREÇO não entra na arte nem com lastro — corrigir um PNG publicado é apagar o post", () => {
    const fonte = "Pão de queijo por R$ 12,90 na padaria";
    const v = travaDeTextoNaArte("Pão de queijo por R$ 12,90", fonte);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.motivo).toBe("classe_de_fato_proibida");
  });

  it("telefone, percentual, prazo e promessa comercial também ficam fora", () => {
    const casos = [
      ["Ligue 11 98888-7777", "Ligue 11 98888-7777 agora"],
      ["30% de desconto", "30% de desconto hoje"],
      ["Entrega em 30 min", "Entrega em 30 min na sua casa"],
      ["Frete grátis", "Frete grátis para a cidade"],
      ["O melhor da cidade", "O melhor da cidade sem dúvida"],
    ];
    for (const [texto, fonte] of casos) {
      const v = travaDeTextoNaArte(texto!, fonte!);
      expect(v.ok, `deveria barrar: ${texto}`).toBe(false);
    }
    expect(CLASSES_PROIBIDAS_NA_ARTE.length).toBeGreaterThan(5);
  });

  it("legenda sem frase utilizável → título vazio, e a peça sai só com a foto", () => {
    // Legenda só de hashtag não tem chamada: uma palavra solta não é título.
    expect(tituloDaFonte("#padaria #paoquentinho")).toBe("");
    expect(tituloDaFonte("   ")).toBe("");
    expect(travaDeTextoNaArte("", "qualquer coisa").ok).toBe(false);
  });

  it("o corte respeita fronteira de palavra e não inventa reticências", () => {
    const t = tituloDaFonte("Bastidor da madrugada na padaria do bairro com fermentação natural lenta", 40);
    expect(t.length).toBeLessThanOrEqual(40);
    expect(t).not.toMatch(/…|\.\.\./);
    expect(temLastroLiteral(t, "Bastidor da madrugada na padaria do bairro com fermentação natural lenta")).toBe(true);
  });
});

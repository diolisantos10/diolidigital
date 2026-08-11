// A BIBLIOTECA DE MOCKUP — e a trava que impede o mockup de mentir.
//
// O risco que este arquivo existe para barrar está escrito no comparativo do
// CEO (`docs/projetos/foocci/comparativo-06-08.md`): nas peças de referência,
// as telas de app são DESENHADAS e os números ("1.248", "+12% vs ontem") são
// INVENTADOS. Publicado no perfil de um cliente pagante, isso é promessa visual
// do que o produto entrega.
//
// "Copia-se a linguagem, não o costume de inventar a tela."

import { describe, it, expect } from "vitest";
import { montarMockup, SELO_DE_ILUSTRACAO, type BlocoDeMockup } from "@/lib/agency/design/mockup";
import { monogramaDe, montarHtmlDaPeca, textosDaPeca, moldeDoCliente } from "@/lib/agency/design/molde";

const PALETA = { primaria: "#0B3D2E", secundaria: "#E4B363", tinta: "#FFFFFF" };
const montar = (b: BlocoDeMockup) => montarMockup(b, PALETA);

describe("metade 1 — o mockup que mentiria é RECUSADO", () => {
  it("número sem origem declarada não vira pixel", () => {
    const r = montar({
      tipo: "numeros",
      procedencia: "ilustracao",
      numeros: [{ rotulo: "pedidos hoje", valor: "1.248", origem: "" }],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.motivo).toBe("numero_sem_origem");
      expect(r.detalhe).toMatch(/afirmação de resultado/i);
    }
  });

  it("card de painel com uma linha sem origem cai INTEIRO — não sai pela metade", () => {
    const r = montar({
      tipo: "painel",
      procedencia: "captura_real",
      titulo: "Resumo do dia",
      linhas: [
        { rotulo: "pedidos", valor: "34", origem: "painel do cliente, 05/08" },
        { rotulo: "ticket médio", valor: "R$ 62", origem: "" },
      ],
    });
    expect(r.ok).toBe(false);
  });

  it("captura real declarada SEM imagem é recusada — moldura vazia prometeria o produto", () => {
    const r = montar({ tipo: "celular", procedencia: "captura_real", imagem: null });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("captura_declarada_sem_imagem");
  });

  it("bloco vazio não passa em nenhum dos quatro tipos", () => {
    expect(montar({ tipo: "conversa", procedencia: "ilustracao", mensagens: [] }).ok).toBe(false);
    expect(montar({ tipo: "numeros", procedencia: "ilustracao", numeros: [] }).ok).toBe(false);
    expect(montar({ tipo: "painel", procedencia: "ilustracao", titulo: "x", linhas: [] }).ok).toBe(false);
    expect(montar({
      tipo: "conversa", procedencia: "ilustracao",
      mensagens: [{ de: "cliente", texto: "   " }],
    }).ok).toBe(false);
  });
});

describe("metade 2 — o mockup legítimo passa, e passa inteiro", () => {
  it("captura real com imagem monta a moldura de celular, SEM selo de ilustração", () => {
    const r = montar({
      tipo: "celular",
      procedencia: "captura_real",
      imagem: "data:image/png;base64,AAAA",
      legenda: "O painel que você já usa todo dia",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.html).toContain("mk-moldura");
      expect(r.html).toContain("data:image/png;base64,AAAA");
      expect(r.html).not.toContain(SELO_DE_ILUSTRACAO);
      expect(r.textos.map((t) => t.texto)).toContain("O painel que você já usa todo dia");
    }
  });

  it("números COM origem passam — a exigência é declarar, não é proibir número", () => {
    const r = montar({
      tipo: "numeros",
      procedencia: "captura_real",
      numeros: [
        { rotulo: "pedidos no mês", valor: "1.248", origem: "exportação do painel Foocci, 01–31/07" },
        { rotulo: "recompra", valor: "23%", origem: "mesma exportação" },
      ],
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.textos.map((t) => t.texto)).toEqual(
      expect.arrayContaining(["1.248", "pedidos no mês", "23%", "recompra"]),
    );
  });

  it("o balão de conversa monta os dois lados — é a assinatura do feed", () => {
    const r = montar({
      tipo: "conversa",
      procedencia: "ilustracao",
      mensagens: [
        { de: "cliente", texto: "Chegou meu pedido?" },
        { de: "marca", texto: "Saiu para entrega agora!" },
      ],
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.html).toContain("mk-balao-cliente");
      expect(r.html).toContain("mk-balao-marca");
    }
  });
});

describe("o desenho nosso sai ROTULADO — na peça, não numa legenda", () => {
  it("procedência 'ilustracao' põe o selo dentro do próprio bloco", () => {
    const r = montar({ tipo: "celular", procedencia: "ilustracao", imagem: null });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.html).toContain(SELO_DE_ILUSTRACAO);
      // E o selo é TEXTO CONFERIDO: se ele sumir do pixel, o renderizador
      // reprova a peça. Rótulo que não é conferido é rótulo que some no CSS.
      expect(r.textos.some((t) => t.texto === SELO_DE_ILUSTRACAO)).toBe(true);
    }
  });

  it("não existe terceiro caminho — a procedência é obrigatória no tipo", () => {
    // Compile-time: o objeto sem `procedencia` não tipa. Este teste registra a
    // intenção; quem tirar o campo do tipo quebra o typecheck, não este it().
    const sem = { tipo: "celular", imagem: null } as unknown as BlocoDeMockup;
    // Sem procedência, cai no ramo de ilustração? Não: `selo()` só omite o selo
    // quando a procedência é EXPLICITAMENTE "captura_real".
    const r = montarMockup(sem, PALETA);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.html).toContain(SELO_DE_ILUSTRACAO);
  });
});

describe("todo texto do mockup é texto CONFERIDO pelo renderizador", () => {
  const bloco = montar({
    tipo: "painel",
    procedencia: "captura_real",
    titulo: "Resumo do dia",
    linhas: [{ rotulo: "pedidos", valor: "34", origem: "painel do cliente, 05/08" }],
  });

  it("os textos do mockup entram na lista que o renderizador confere no DOM", () => {
    expect(bloco.ok).toBe(true);
    if (!bloco.ok) return;
    const lista = textosDaPeca({
      formato: "feed",
      titulo: "Seu delivery, sem taxa de aplicativo",
      apoio: "A conta que sobra é sua",
      assinatura: "Foocci",
      mockup: bloco,
    }).map((t) => t.texto);

    for (const esperado of ["Resumo do dia", "pedidos", "34"]) {
      expect(lista, esperado).toContain(esperado);
    }
    // E os do molde continuam lá — o mockup soma, não substitui.
    expect(lista).toContain("Seu delivery, sem taxa de aplicativo");
    expect(lista).toContain("A conta que sobra é sua");
  });

  it("a linha de apoio da PEÇA não é substituída pela última linha do painel", () => {
    // O defeito que este teste guarda é silencioso: os dois usam papel "apoio",
    // e um mapa indexado por papel faria a última linha do painel ser pintada
    // no lugar do apoio. A lista conferida continuaria completa, e a peça sairia
    // errada.
    if (!bloco.ok) return;
    const html = montarHtmlDaPeca(
      {
        formato: "feed",
        titulo: "Seu delivery, sem taxa de aplicativo",
        apoio: "A conta que sobra é sua",
        assinatura: "Foocci",
        mockup: bloco,
      },
      moldeDoCliente({ primaryColor: "#0B3D2E", secondaryColor: "#E4B363", typography: "Inter" }),
    );
    expect(html).toContain('class="apoio" data-papel="apoio" data-texto-exato="A conta que sobra é sua"');
    expect(html).toContain("mk-painel");
  });
});

describe("a assinatura de marca virou token", () => {
  it("o monograma sai do nome, por regra — não é desenhado por modelo de imagem", () => {
    expect(monogramaDe("Foocci Tecnologia")).toBe("FT");
    expect(monogramaDe("Foocci")).toBe("FO");
    // 11/08/2026: esta linha esperava "PD". A expectativa antiga carimbava o
    // defeito — o "da" virava inicial. Ver `__tests__/design/monograma.test.ts`.
    expect(monogramaDe("padaria da esquina")).toBe("PE");
  });

  it("caixa camelo é emenda de duas palavras — 'CityJobs' assina CJ, não CI", () => {
    // O logo oficial desenha CITY e JOBS em duas linhas: a marca É composta.
    expect(monogramaDe("CityJobs")).toBe("CJ");
    expect(monogramaDe("CityJobs SP")).toBe("CJ");
    // E só a transição minúscula→MAIÚSCULA conta. Sequência de maiúsculas é
    // sigla ou ênfase, não composição — senão "MOGI" viraria "MO"+"O".
    expect(monogramaDe("Foocci")).toBe("FO");
    expect(monogramaDe("MOGI")).toBe("MO");
  });

  it("sem nome não há monograma — e o rodapé não inventa iniciais", () => {
    expect(monogramaDe("")).toBeNull();
    expect(monogramaDe(null)).toBeNull();
    expect(monogramaDe("   ")).toBeNull();
    expect(monogramaDe("!!!")).toBeNull();
  });

  it("o lockup aparece no rodapé de TODA peça assinada — é o que faltava", () => {
    const html = montarHtmlDaPeca(
      { formato: "feed", titulo: "Título", assinatura: "Foocci" },
      moldeDoCliente({ primaryColor: "#0B3D2E" }),
    );
    expect(html).toContain('class="lockup"');
    expect(html).toContain('class="monograma"');
    expect(html).toContain(">FO<");
  });

  it("peça sem assinatura não ganha caixa vazia no rodapé", () => {
    const html = montarHtmlDaPeca(
      { formato: "feed", titulo: "Título" },
      moldeDoCliente({ primaryColor: "#0B3D2E" }),
    );
    expect(html).not.toContain('class="monograma"');
  });
});

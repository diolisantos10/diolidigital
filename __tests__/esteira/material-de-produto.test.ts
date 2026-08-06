// A COLETA DO PRODUTO — as duas metades.
//
// Metade 1 (o problema plantado): cliente com produto digital PRECISA receber o
// pedido de captura de tela. Foi a ausência disso que produziu 0 de 6 peças com
// o produto do cliente (`docs/projetos/foocci/comparativo-06-08.md`).
//
// Metade 2 (o falso alarme): padaria NÃO recebe "mande 3 capturas do seu app".
// Alarme falso recorrente treina o cliente a ignorar a lista inteira — e aí o
// item que importava também morre. Esta metade é a que detector nenhum lembra.

import { describe, it, expect } from "vitest";
import {
  lerSinaisDoCliente,
  materiaisAPedir,
  CATALOGO_DE_MATERIAL_DE_PRODUTO,
} from "@/lib/agency/esteira/material-de-produto";

const tipos = (texto: string) => materiaisAPedir(lerSinaisDoCliente(texto)).map((m) => m.tipo);

describe("metade 1 — quem tem produto digital é perguntado pelo produto digital", () => {
  it("o caso real que originou tudo: SaaS de restaurante recebe o pedido de captura", () => {
    const t = tipos("Foocci — plataforma de automação de pedidos e cardápio digital para restaurantes");
    expect(t).toContain("produto_captura");
    // E não recebe a pergunta "você tem app?", que já foi respondida pelo texto.
    expect(t).not.toContain("produto_existe_digital");
  });

  it("app, painel, sistema, área logada e e-commerce todos disparam o pedido", () => {
    for (const texto of [
      "temos um aplicativo próprio",
      "meu painel de gestão",
      "sistema de agendamento",
      "site com área logada",
      "loja virtual / ecommerce de moda",
    ]) {
      expect(tipos(texto), texto).toContain("produto_captura");
    }
  });

  it("a descrição EXIGE captura real e diz por quê — mockup inventado é promessa visual", () => {
    const captura = CATALOGO_DE_MATERIAL_DE_PRODUTO.find((m) => m.tipo === "produto_captura")!;
    expect(captura.descricao).toMatch(/REAIS|reais/);
    expect(captura.descricao).toMatch(/não desenhamos|não inventamos/i);
  });
});

describe("metade 2 — não se pede o que não faz sentido", () => {
  it("padaria NÃO recebe pedido de captura de tela de app", () => {
    const t = tipos("Padaria da Esquina — pães artesanais e bolos de festa");
    expect(t).not.toContain("produto_captura");
  });

  it("mas padaria recebe o que faz sentido para ela: embalagem, uso, marca aplicada", () => {
    const t = tipos("Padaria da Esquina — pães artesanais e bolos de festa");
    expect(t).toContain("produto_embalagem");
    expect(t).toContain("produto_em_uso");
    expect(t).toContain("marca_aplicada");
    expect(t).toContain("marca_arquivo");
  });

  it("o pedido universal é universal — todo cliente recebe os 3 de 'sempre'", () => {
    for (const texto of ["", "consultoria jurídica", "Foocci plataforma SaaS"]) {
      const t = tipos(texto);
      for (const universal of ["produto_em_uso", "marca_aplicada", "marca_arquivo"]) {
        expect(t, `${texto} → ${universal}`).toContain(universal);
      }
    }
  });
});

describe("o terceiro caso — ausência de informação não é informação", () => {
  it("sem sinal nenhum, a casa PERGUNTA em vez de supor que não tem", () => {
    // O erro que este ramo evita: concluir "não tem app" do silêncio e nunca
    // mais tocar no assunto — que é exatamente o buraco original com outra cara.
    const t = tipos("Consultoria de gestão para pequenos negócios");
    expect(t).toContain("produto_existe_digital");
    expect(t).not.toContain("produto_captura");
  });

  it("a pergunta aceita 'não tenho' como resposta legítima — sem ela, o cliente trava", () => {
    const pergunta = CATALOGO_DE_MATERIAL_DE_PRODUTO.find((m) => m.tipo === "produto_existe_digital")!;
    expect(pergunta.descricao).toMatch(/não tenho|não tem/i);
  });

  it("nunca pede captura E pergunta se existe ao mesmo tempo — seria a casa se contradizendo", () => {
    for (const texto of ["app próprio", "padaria", "", "plataforma e loja física"]) {
      const t = tipos(texto);
      expect(t.includes("produto_captura") && t.includes("produto_existe_digital"), texto).toBe(false);
    }
  });
});

describe("o catálogo é fechado e legível pelo cliente", () => {
  it("nenhum tipo repetido — tipo repetido vira pedido duplicado no portal", () => {
    const ids = CATALOGO_DE_MATERIAL_DE_PRODUTO.map((m) => m.tipo);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("toda descrição é contável e sem jargão — 'material da marca' produz mais uma rodada", () => {
    for (const m of CATALOGO_DE_MATERIAL_DE_PRODUTO) {
      expect(m.descricao.length, m.tipo).toBeGreaterThan(60);
      expect(m.descricao, m.tipo).not.toMatch(/asset|deliverable|brandbook|lockup/i);
    }
  });

  it("cliente que é as duas coisas recebe as duas listas — digital e físico não se excluem", () => {
    const t = tipos("Foocci — plataforma digital para restaurantes, com embalagem própria de delivery");
    expect(t).toContain("produto_captura");
    expect(t).toContain("produto_embalagem");
  });
});

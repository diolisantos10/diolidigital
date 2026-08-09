// A ficha de marca NA TELA.
//
// O defeito central do raio-X de 08/08 foi "a tela mente por omissão": campo
// vazio desenhado igual a campo preenchido faz o operador concluir, do silêncio,
// que está tudo certo. Estes testes existem para que essa mentira não volte.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const COMP = fs.readFileSync(path.join(process.cwd(), "components/agency/clients/FichaDeMarca.tsx"), "utf8");
const PAGINA = fs.readFileSync(path.join(process.cwd(), "app/agency/clients/[id]/page.tsx"), "utf8");

describe("o vazio se anuncia", () => {
  it("campo em lacuna aparece escrito 'não informado'", () => {
    expect(COMP).toContain("não informado");
  });

  it("NUNCA usa zero para representar ausência", () => {
    // "0/9" é a contagem de preenchidos e é legítima; o proibido é um campo
    // vazio virar o número zero como se fosse um valor medido.
    expect(COMP.includes('valor={0}')).toBe(false);
    expect(COMP.includes('?? 0')).toBe(false);
  });

  it("a lacuna carrega a pergunta pronta — quem atende não precisa inventar", () => {
    expect(COMP).toContain("c.pergunta");
  });
});

describe("a tela conta, o humano não", () => {
  it("mostra quantos faltam", () => {
    expect(COMP).toContain("ficha.resumo.faltam");
  });

  it("mostra o que a falta IMPEDE, não só que falta", () => {
    expect(COMP).toContain("oQueAFaltaImpede");
  });

  it("o aviso vem ANTES da lista, não depois", () => {
    expect(COMP.indexOf("oQueAFaltaImpede")).toBeLessThan(COMP.indexOf("ficha.campos.map"));
  });
});

describe("erro de leitura não vira ficha vazia", () => {
  it("falha ao ler mostra erro — ficha vazia se pareceria com 'nada a declarar'", () => {
    expect(COMP).toContain("não consegui ler a ficha de marca");
  });

  it("os três estados obrigatórios existem: carregando, erro e conteúdo", () => {
    expect(COMP).toContain("Carregando a ficha");
    expect(COMP).toContain("if (erro)");
    expect(COMP).toContain("if (!ficha)");
  });
});

describe("quem atende é avisado de não responder pelo cliente", () => {
  it("o formulário diz que preencher por ele vira regra falsa", () => {
    expect(COMP).toMatch(/preencher por ele/i);
  });
});

describe("a ficha está na página do cliente", () => {
  it("o componente foi montado na ficha", () => {
    expect(PAGINA).toContain("<FichaDeMarca clientId={id} />");
  });

  it("vem ANTES do Brand Hub — a régua antes da descrição", () => {
    expect(PAGINA.indexOf("<FichaDeMarca")).toBeLessThan(PAGINA.indexOf("Brand Hub</h2>"));
  });
});

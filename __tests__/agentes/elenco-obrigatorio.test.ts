// A TRAVA DO ELENCO OBRIGATÓRIO — e a da medida honesta.
//
// Doutrina 21 do `dioli-brain-kit`: cinco Essenciais vêm com todo projeto e
// NÃO PODEM SER APAGADOS ("não vão ser apagados de jeito nenhum, que já vem
// junto com o projeto" — CEO, 07/08/2026).
//
// Isto é teste, e não um parágrafo no CLAUDE.md, porque parágrafo é aviso e
// aviso não barra nada. Quem apagar um Essencial descobre aqui, não em produção.
//
// Cada regra é provada nas DUAS metades: que ela barra o caso plantado, e que
// ela não inventa problema no caso limpo.

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ELENCO, ESSENCIAIS } from "@/lib/agency/sala-dos-agentes/elenco";
import { medido, naoMedido, type Medida } from "@/lib/agency/sala-dos-agentes/tipos";

const raiz = process.cwd();

describe("os cinco Essenciais não podem ser apagados", () => {
  for (const slug of ESSENCIAIS) {
    it(`\`${slug}\` tem perfil em .claude/agents/`, () => {
      expect(existsSync(path.join(raiz, ".claude", "agents", `${slug}.md`))).toBe(true);
    });

    it(`\`${slug}\` está no elenco da Sala dos Agentes, marcado como essencial`, () => {
      const m = ELENCO.find((x) => x.slug === slug);
      expect(m, `o Essencial "${slug}" sumiu do elenco`).toBeDefined();
      expect(m!.vinculo).toBe("essencial");
    });

    it(`o perfil de \`${slug}\` APONTA para a constituição, em vez de copiá-la`, () => {
      const texto = readFileSync(path.join(raiz, ".claude", "agents", `${slug}.md`), "utf8");
      // Regra não se copia, se aponta: cópia espalhada diverge em três meses.
      expect(texto).toContain("23-constituicao-dos-essenciais.md");
    });
  }

  it("a metade limpa: o elenco de hoje passa inteiro", () => {
    const slugs = ELENCO.map((m) => m.slug);
    expect(new Set(slugs).size).toBe(slugs.length); // sem slug repetido
    for (const s of ESSENCIAIS) expect(slugs).toContain(s);
  });

  it("a metade que barra: um elenco sem um Essencial é detectado", () => {
    const mutilado = ELENCO.filter((m) => m.slug !== "seguranca");
    const faltando = ESSENCIAIS.filter((s) => !mutilado.some((m) => m.slug === s));
    expect(faltando).toEqual(["seguranca"]);
  });
});

describe("quem duvida não conserta — é trava de ferramenta, não promessa", () => {
  // A constituição (regra 3) manda QUALIDADE e EXPERIÊNCIA rodarem sem ferramenta
  // de escrita. "Constituição que depende de o agente lembrar da regra falha
  // exatamente no dia ruim, que é quando ela é lida."
  const semEscrita = ["qualidade", "experiencia"];

  for (const slug of semEscrita) {
    it(`\`${slug}\` NÃO tem Write nem Edit no perfil`, () => {
      const texto = readFileSync(path.join(raiz, ".claude", "agents", `${slug}.md`), "utf8");
      const linhaTools = texto.split("\n").find((l) => l.startsWith("tools:")) ?? "";
      expect(linhaTools, `perfil de ${slug} sem linha \`tools:\``).not.toBe("");
      expect(linhaTools).not.toMatch(/\bWrite\b/);
      expect(linhaTools).not.toMatch(/\bEdit\b/);
    });

    it(`\`${slug}\` está marcado como somenteLeitura no elenco`, () => {
      expect(ELENCO.find((m) => m.slug === slug)!.somenteLeitura).toBe(true);
    });
  }

  it("a metade limpa: quem PRECISA escrever continua podendo", () => {
    for (const slug of ["interface", "seguranca", "cerebro", "plataforma"]) {
      const texto = readFileSync(path.join(raiz, ".claude", "agents", `${slug}.md`), "utf8");
      const linhaTools = texto.split("\n").find((l) => l.startsWith("tools:")) ?? "";
      expect(linhaTools, `${slug} deveria ter escrita`).toMatch(/\bWrite\b/);
    }
  });
});

describe("a medida honesta: zero e “não sei” nunca são a mesma coisa", () => {
  it("zero medido NÃO é o número zero — é um caso próprio", () => {
    const m = medido(0);
    expect(m.estado).toBe("zeroMedido");
    // A tela desenha um traço aqui. Se isto virar `{ estado: "medido", valor: 0 }`,
    // "trabalhou zero" e "não medido" voltam a poder parecer a mesma coisa.
    expect(m).not.toHaveProperty("valor");
  });

  it("valor real continua sendo valor real", () => {
    expect(medido(7)).toEqual({ estado: "medido", valor: 7 });
  });

  it("“não medido” carrega OBRIGATORIAMENTE o motivo", () => {
    const m = naoMedido("o registro não pôde ser lido");
    expect(m.estado).toBe("naoMedido");
    expect((m as { porque: string }).porque.length).toBeGreaterThan(0);
  });

  it("os três estados são distinguíveis por quem for desenhar a tela", () => {
    const casos: Medida[] = [medido(3), medido(0), naoMedido("sem instrumentação")];
    expect(new Set(casos.map((c) => c.estado)).size).toBe(3);
  });
});

describe("cada membro do elenco tem ficha completa — nada preenchido por inferência", () => {
  for (const m of ELENCO) {
    it(`\`${m.slug}\` tem função em linguagem de dono e perfil no repositório`, () => {
      expect(m.funcao.length).toBeGreaterThan(20);
      expect(m.nome.length).toBeGreaterThan(1);
      expect(existsSync(path.join(raiz, ".claude", "agents", `${m.slug}.md`))).toBe(true);
      // `noArDesde` pode ser null ("não registrado"), mas nunca uma data vazia
      // ou inventada: string vazia viraria "1970" na tela.
      if (m.noArDesde !== null) expect(m.noArDesde).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  }
});

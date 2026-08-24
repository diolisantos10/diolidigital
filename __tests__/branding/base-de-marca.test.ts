// BRANDING NA ESTEIRA — e o contrato que impede o documento de inventar marca.
//
// O case Farol 27 (24/08/2026) mediu: não havia especialista de branding entre
// os executores. O cliente pediu reposicionamento de marca como serviço
// PRINCIPAL e a esteira não tinha quem fizesse.
//
// O risco de consertar isso mal é maior que o buraco: um documento de marca que
// preenche nove campos bonitos sobre um cliente que não contou nada vira RÉGUA
// das peças do mês inteiro. Por isso a metade deste arquivo é sobre LACUNA.

import { describe, it, expect } from "vitest";
import { contratoDaBaseDeMarca, ITENS_DA_BASE_DE_MARCA, MATERIAIS_ESPERADOS, CAMPO_DOS_MATERIAIS } from "@/lib/agency/execution/branding";
import { CAMPOS_DA_MARCA } from "@/lib/agency/esteira/ficha-de-marca";
import { TODOS_OS_ESPECIALISTAS, DEPARTAMENTOS } from "@/lib/agency/execution/especialistas";
import { TIPOS_DE_ENTREGA, TIPOS_PUBLICAVEIS, tipoDeclarado, ehPublicavel } from "@/lib/agency/execution/tipos-de-entrega";
import { TIPOS_DE_DOCUMENTO_INTERNO } from "@/lib/agency/execution/regua-do-texto";

/** Uma base completa e honesta: tudo em lacuna, dizendo o que falta. É o estado
 *  NORMAL de um cliente que acabou de entrar — e tem de passar. */
function baseEmLacuna(): Record<string, unknown> {
  return {
    title: "Base de marca — Farol 27",
    items: [
      ...CAMPOS_DA_MARCA.map((c) => ({ campo: c, estado: "lacuna", falta: "o dono precisa responder" })),
      {
        campo: CAMPO_DOS_MATERIAIS, estado: "lacuna",
        falta: `faltam: ${MATERIAIS_ESPERADOS.join("; ")}`,
      },
    ],
  };
}

describe("o especialista existe e está na esteira", () => {
  it("branding é um departamento, com especialista que entrega peça", () => {
    const dept = DEPARTAMENTOS.find((d) => d.id === "branding");
    expect(dept, "branding não existe entre os departamentos").toBeTruthy();
    expect(dept!.especialistas.map((e) => e.id)).toContain("branding-base-de-marca");
  });

  it("o serviço que o cliente contrata cai na casa certa", () => {
    const dept = DEPARTAMENTOS.find((d) => d.id === "branding")!;
    for (const servico of ["Reposicionamento de marca", "branding", "identidade de marca"]) {
      expect(dept.keywords.test(servico), `"${servico}" não casa com branding`).toBe(true);
    }
  });
});

describe("o contrato de saída morde", () => {
  it("a base toda em lacuna, dizendo o que falta, PASSA — lacuna é entrega", () => {
    expect(contratoDaBaseDeMarca(baseEmLacuna())).toEqual([]);
  });

  it("entrega vazia é recusada — nunca 'vazio disfarçado de entrega'", () => {
    expect(contratoDaBaseDeMarca({ items: [] }).length).toBeGreaterThan(0);
    expect(contratoDaBaseDeMarca({}).length).toBeGreaterThan(0);
  });

  it("lacuna que NÃO diz o que falta é violação", () => {
    const d = baseEmLacuna();
    (d.items as Array<Record<string, unknown>>)[0].falta = "";
    expect(contratoDaBaseDeMarca(d).join(" ")).toMatch(/NÃO diz o que falta/);
  });

  it("lacuna PREENCHIDA é invenção, e é barrada", () => {
    const d = baseEmLacuna();
    (d.items as Array<Record<string, unknown>>)[0].conteudo = "Uma marca jovem e disruptiva";
    expect(contratoDaBaseDeMarca(d).join(" ")).toMatch(/invenção com cara de entrega/);
  });

  it("campo faltando é violação — ausência não é resposta", () => {
    const d = baseEmLacuna();
    d.items = (d.items as unknown[]).slice(1);
    expect(contratoDaBaseDeMarca(d).join(" ")).toMatch(/faltou o campo/);
  });

  it("campo inventado é violação — a constituição não ganha um décimo primeiro", () => {
    const d = baseEmLacuna();
    (d.items as unknown[]).push({ campo: "vibe_da_marca", estado: "definido", conteudo: "boa", fonte: "eu acho" });
    expect(contratoDaBaseDeMarca(d).join(" ")).toMatch(/campo desconhecido/);
  });

  it("'definido' sem dizer de onde veio é violação — definido é o que o DONO decidiu", () => {
    const d = baseEmLacuna();
    const item = (d.items as Array<Record<string, unknown>>)[0];
    item.estado = "definido"; item.conteudo = "Servimos pizza napolitana"; item.falta = "";
    expect(contratoDaBaseDeMarca(d).join(" ")).toMatch(/não diz DE ONDE veio/);
    item.fonte = "briefing: 'pizzaria napolitana desde 2011'";
    expect(contratoDaBaseDeMarca(d)).toEqual([]);
  });

  it("estado inválido (ou ausente) é violação — silêncio vira permissão", () => {
    const d = baseEmLacuna();
    (d.items as Array<Record<string, unknown>>)[0].estado = "";
    expect(contratoDaBaseDeMarca(d).join(" ")).toMatch(/não declarou estado válido/);
  });

  it("os materiais que faltam são nomeados UM A UM, nunca 'faltam materiais'", () => {
    const d = baseEmLacuna();
    const mat = (d.items as Array<Record<string, unknown>>).find((i) => i.campo === CAMPO_DOS_MATERIAIS)!;
    mat.falta = "faltam materiais da marca";
    const p = contratoDaBaseDeMarca(d).join(" ");
    expect(p).toMatch(/nomeados um a um/);
    expect(p).toMatch(/vetorial|paleta|histórico/i);
  });

  it("a lista dos campos vem da constituição, não de uma cópia local", () => {
    expect(ITENS_DA_BASE_DE_MARCA).toEqual([...CAMPOS_DA_MARCA, CAMPO_DOS_MATERIAIS]);
  });
});

// ─── O TESTE DE CLASSE ───────────────────────────────────────────────────────
//
// A Pauta do mês entrou na fila de publicação porque o tipo dela era string
// livre e nenhuma lista sabia da existência dele. O próximo especialista que
// alguém criar sem declarar o tipo — ou declarando um tipo que ninguém
// classificou — tem de quebrar o build aqui.
describe("teste de classe: todo especialista declara um tipo, e todo tipo é classificado", () => {
  it("nenhum especialista sem `deliverableType`", () => {
    for (const e of TODOS_OS_ESPECIALISTAS) {
      expect(e.deliverableType?.trim(), `${e.id} não declarou deliverableType`).toBeTruthy();
    }
  });

  it("todo tipo usado por um especialista está declarado em `tipos-de-entrega.ts`", () => {
    for (const e of TODOS_OS_ESPECIALISTAS) {
      expect(
        tipoDeclarado(e.deliverableType),
        `o tipo "${e.deliverableType}" (de ${e.id}) não está declarado — declare lá se ele vai ao ar ou não`,
      ).toBeTruthy();
    }
  });

  it("todo tipo declarado diz POR QUE existe separado dos vizinhos", () => {
    for (const t of TIPOS_DE_ENTREGA) expect(t.porque.length, t.id).toBeGreaterThan(20);
  });

  it("tipo desconhecido NÃO é publicável — fail-closed", () => {
    expect(ehPublicavel("tipo-que-alguem-inventou-ontem")).toBe(false);
    expect(ehPublicavel(undefined)).toBe(false);
  });

  it("documento de marca NÃO entra em fila de publicação", () => {
    expect(TIPOS_PUBLICAVEIS).not.toContain("brand-foundation");
    expect(TIPOS_PUBLICAVEIS).not.toContain("plano-de-conteudo");
    expect(TIPOS_PUBLICAVEIS).not.toContain("strategy");
    expect(ehPublicavel("brand-foundation")).toBe(false);
  });

  it("as duas listas continuam SEPARADAS: publicável e documento interno respondem perguntas diferentes", () => {
    // `plano-de-conteudo` não é publicável E não é isento da régua de texto.
    // Juntar as listas isentaria a pauta da régua sem ninguém ter pedido.
    expect(TIPOS_PUBLICAVEIS).not.toContain("plano-de-conteudo");
    expect(TIPOS_DE_DOCUMENTO_INTERNO).not.toContain("plano-de-conteudo");
  });

  it("o especialista de branding usa o tipo separado, e ele não é `social`", () => {
    const esp = TODOS_OS_ESPECIALISTAS.find((e) => e.id === "branding-base-de-marca")!;
    expect(esp.deliverableType).toBe("brand-foundation");
  });
});

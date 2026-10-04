// BLOCO C — A AGÊNCIA COMPLETA, O CLIENTE SÓ RESPONDE FATO (CEO, 04/10/2026).
import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

vi.mock("@/lib/db/client", () => ({ prisma: {} }));
const { perguntasAoCliente, mensagemDePerguntas } = await import("@/lib/agency/esteira/perguntas-ao-cliente");
const { CAMPOS_DA_FICHA_UNICA } = await import("@/lib/agency/esteira/ficha-unica");

const abertas = (f: Parameters<typeof perguntasAoCliente>[0]) =>
  perguntasAoCliente(f).filter((p) => !p.respondida).map((p) => p.fato);

describe("só os cinco fatos que o CEO nomeou", () => {
  it("ficha vazia → pergunta os cinco, e nada além", () => {
    expect(abertas({})).toEqual(["cardapio", "precos", "endereco", "horario", "arroba"]);
  });

  it("nunca pergunta o que a agência deriva (público, tom, concorrentes, objetivos)", () => {
    const texto = JSON.stringify(perguntasAoCliente({}));
    for (const derivavel of ["público", "persona", "tom de voz", "concorrente", "objetivo"]) {
      expect(texto.toLowerCase()).not.toContain(derivavel);
    }
  });

  it("ficha completa → nada para perguntar, e mensagem vazia", () => {
    const ficha = {
      produtos: "Combinado 20 peças — salmão — R$ 89,90\nTemaki — R$ 32,00",
      endereco: "Rua das Flores, 120, Centro, Curitiba",
      horario: "Ter a dom, 18h às 23h",
      canais: "Instagram: @sushicazza",
    };
    expect(abertas(ficha)).toEqual([]);
    expect(mensagemDePerguntas("Sushi", perguntasAoCliente(ficha))).toBe("");
  });

  it("produto sem preço → pergunta o preço DAQUELE item, sem inventar", () => {
    const p = perguntasAoCliente({ produtos: "Combinado 20 peças — R$ 89,90\nTemaki salmão" });
    const preco = p.find((x) => x.fato === "precos")!;
    expect(preco.respondida).toBe(false);
    expect(preco.pergunta).toContain("Temaki salmão");
    expect(preco.pergunta).not.toContain("Combinado");
  });

  it("@ vale por arroba ou por link do Instagram", () => {
    expect(abertas({ canais: "https://instagram.com/marca_x" })).not.toContain("arroba");
    expect(abertas({ canais: "Instagram e WhatsApp" })).toContain("arroba");
  });

  it("a mensagem numera só o que falta", () => {
    const m = mensagemDePerguntas("Santioh", perguntasAoCliente({ endereco: "Av. Brasil, 10, Centro", horario: "Seg a sex, 9h às 18h" }));
    expect(m).toContain("Santioh");
    expect(m).toContain("1. ");
    expect(m).toContain("3. ");
    expect(m).not.toContain("4. ");
    expect(m).not.toMatch(/endereço completo|dias e horários/);
  });
});

describe("onde a resposta é digitada e onde a pergunta aparece", () => {
  it("endereço e horário são campos da ficha única (sem migration: coluna extra)", () => {
    const chaves = CAMPOS_DA_FICHA_UNICA.map((c) => [c.chave, c.coluna]);
    expect(chaves).toContainEqual(["endereco", "extra"]);
    expect(chaves).toContainEqual(["horario", "extra"]);
  });

  it("a aba Marca mostra as perguntas antes da ficha", () => {
    const shell = fs.readFileSync(path.join(process.cwd(), "components/agency/clients/workspace/ClientWorkspaceShell.tsx"), "utf8");
    expect(shell.indexOf("{blocos.perguntasAoCliente}")).toBeGreaterThan(-1);
    expect(shell.indexOf("{blocos.perguntasAoCliente}")).toBeLessThan(shell.indexOf("{blocos.fichaDeMarca}"));
  });

  it("a casa não manda a mensagem sozinha — só copia", () => {
    const card = fs.readFileSync(path.join(process.cwd(), "components/agency/clients/PerguntasAoCliente.tsx"), "utf8");
    expect(card).toContain("navigator.clipboard.writeText");
    expect(card).not.toMatch(/method:\s*"POST"/);
  });
});

describe("resposta de preço fecha a pergunta daquele item (portal, 04/10/2026)", () => {
  it("item com preço substitui a linha do mesmo nome sem preço; o resto é acrescentado", async () => {
    const { mesclarProdutos } = await import("@/lib/agency/esteira/perguntas-ao-cliente");
    const antes = "Combinado 20 peças — R$ 89,90\nTemaki salmão";
    const depois = mesclarProdutos(antes, "Temaki salmão — R$ 32,00\nHot roll — R$ 25,00");
    expect(depois.split("\n")).toEqual(["Combinado 20 peças — R$ 89,90", "Temaki salmão — R$ 32,00", "Hot roll — R$ 25,00"]);
    expect(perguntasAoCliente({ produtos: depois }).find((p) => p.fato === "precos")!.respondida).toBe(true);
  });

  it("item já com preço não é sobrescrito — vira linha nova (nada se apaga)", async () => {
    const { mesclarProdutos } = await import("@/lib/agency/esteira/perguntas-ao-cliente");
    expect(mesclarProdutos("Temaki — R$ 30,00", "Temaki — R$ 32,00").split("\n")).toHaveLength(2);
  });
});

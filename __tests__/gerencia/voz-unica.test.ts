// A VOZ ÚNICA COM O CLIENTE — e a CATRACA da dívida que sobrou.
//
// Duas coisas provadas aqui:
//
//  1. a trava viva: só o Gerente Geral fala com o cliente; gerente de
//     departamento e agente de linha são recusados com motivo;
//  2. a catraca: a casa ainda fala com o cliente por três nomes em 19 lugares
//     (medido em 25/08/2026). Isso NÃO foi consertado nesta rodada — foi
//     CONGELADO. O teste reprova quando a lista cresce, então arquivo novo que
//     tente falar com o cliente por fora fica vermelho na CI.
//
// Ponto fraco declarado é dívida; silencioso é armadilha.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { falarComOCliente, VOZ_DO_CLIENTE, CARGO_DA_VOZ } from "@/lib/agency/gerencia/voz-unica";
import { GERENTE_GERAL } from "@/lib/agency/gerencia/cadeia";

const mensagem = { clienteId: "cli_1", corpo: "A peça está pronta.", correlationId: "c1" };

describe("só o Gerente Geral fala com o cliente", () => {
  it("o Gerente Geral fala, e assina com a voz única", () => {
    const r = falarComOCliente(GERENTE_GERAL, mensagem);
    expect(r).toMatchObject({ decisao: "enviar", autorNome: VOZ_DO_CLIENTE, autorPapel: "team" });
    expect(CARGO_DA_VOZ).toBe(GERENTE_GERAL);
  });

  it("⛔ gerente de departamento é recusado — o cliente ouviria duas versões", () => {
    const r = falarComOCliente("manager-design", mensagem);
    expect(r.decisao).toBe("recusado");
    if (r.decisao !== "recusado") throw new Error("impossível");
    expect(r.motivo).toContain("Gerente de departamento");
    expect(r.motivo).toContain(GERENTE_GERAL);
  });

  it("⛔ agente de linha é recusado", () => {
    const r = falarComOCliente("copywriter", mensagem);
    expect(r.decisao).toBe("recusado");
    if (r.decisao !== "recusado") throw new Error("impossível");
    expect(r.motivo).toContain("Agente de linha");
  });

  it("⛔ mensagem vazia não é comunicação", () => {
    expect(falarComOCliente(GERENTE_GERAL, { ...mensagem, corpo: "   " }).decisao).toBe("recusado");
  });
});

// ─── A CATRACA ───────────────────────────────────────────────────────────────

/** Os arquivos que, em 25/08/2026, escreviam a voz da casa por conta própria. */
const DIVIDA_CONGELADA_25_08 = [
  "app/api/admin/reset-request/route.ts",
  "app/api/portal/approvals/route.ts",
  "lib/agency/comercial/registro-da-conversa.ts",
  "lib/agency/esteira/ligar-projeto.ts",
  "lib/agency/esteira/marcos.ts",
  "lib/agency/esteira/orcamento-do-briefing.ts",
  "lib/agency/esteira/peca-aprovada-que-nao-agendou.ts",
  "lib/agency/esteira/pedidos.ts",
  "lib/agency/esteira/pm-responde.ts",
  "lib/agency/esteira/reabrir-aprovacao.ts",
  "lib/agency/esteira/refacao.ts",
  "lib/agency/esteira/trafego.ts",
  "lib/agency/esteira/triagem.ts",
  "lib/agency/execution/create-project-from-request.ts",
] as const;

const NOMES = ["Gerente de projeto", "Equipe Dioli", "SDR"];
const RAIZES = ["app", "lib", "components"];

function arquivosDeCodigo(dir: string, saida: string[] = []): string[] {
  for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
    const completo = path.join(dir, entrada.name);
    if (entrada.isDirectory()) {
      if (entrada.name === "generated" || entrada.name === "node_modules") continue;
      arquivosDeCodigo(completo, saida);
    } else if (/\.tsx?$/.test(entrada.name)) {
      saida.push(completo);
    }
  }
  return saida;
}

describe("a catraca da voz da casa", () => {
  it("nenhum arquivo NOVO fala com o cliente por fora da voz única", () => {
    const raiz = process.cwd();
    const infratores: string[] = [];
    for (const r of RAIZES) {
      const base = path.join(raiz, r);
      if (!fs.existsSync(base)) continue;
      for (const arq of arquivosDeCodigo(base)) {
        const rel = path.relative(raiz, arq);
        if (rel.startsWith("lib/agency/gerencia/")) continue; // é a fonte única
        const texto = fs.readFileSync(arq, "utf8");
        const fala = NOMES.some((n) => texto.includes(`authorName: "${n}"`));
        if (fala && !DIVIDA_CONGELADA_25_08.includes(rel as (typeof DIVIDA_CONGELADA_25_08)[number])) {
          infratores.push(rel);
        }
      }
    }
    expect(
      infratores,
      `estes arquivos falam com o cliente por conta própria: ${infratores.join(", ")}. Use lib/agency/gerencia/voz-unica.ts.`,
    ).toEqual([]);
  });

  it("a dívida congelada é real — cada arquivo da lista ainda existe e ainda fala", () => {
    // Catraca que aponta para arquivo que já sumiu vira permissão silenciosa:
    // a lista tem de encolher junto com a dívida, nunca ficar para trás.
    const raiz = process.cwd();
    for (const rel of DIVIDA_CONGELADA_25_08) {
      const completo = path.join(raiz, rel);
      expect(fs.existsSync(completo), `${rel}: já não existe — tire-o da lista congelada`).toBe(true);
      const texto = fs.readFileSync(completo, "utf8");
      expect(
        NOMES.some((n) => texto.includes(`authorName: "${n}"`)),
        `${rel}: já não fala com o cliente por conta própria — tire-o da lista congelada`,
      ).toBe(true);
    }
  });
});

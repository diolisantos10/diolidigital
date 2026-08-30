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
import {
  falarComOCliente,
  VOZ_DO_CLIENTE,
  CARGO_DA_VOZ,
  VOZES_LEGADAS_A_MIGRAR,
  AUTOR_DO_REGISTRO_DO_SDR,
} from "@/lib/agency/gerencia/voz-unica";
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

// ─── A CATRACA, AGORA EM ZERO ────────────────────────────────────────────────
//
// Na primeira rodada de 25/08/2026 esta lista tinha 14 arquivos: a dívida
// estava CONGELADA, não paga. Agora está vazia — nenhum arquivo fora de
// `lib/agency/gerencia/` escreve o nome da casa. A lista continua existindo de
// propósito: uma catraca sem lista é uma regra sem prova de que foi cumprida,
// e o segundo teste abaixo reprova se alguém tentar reabri-la.

/** Vazia desde 25/08/2026. Item novo aqui é dívida nova, e a CI diz isso. */
const DIVIDA_CONGELADA_25_08: readonly string[] = [];

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

function infratores(): string[] {
  const raiz = process.cwd();
  const achados: string[] = [];
  for (const r of RAIZES) {
    const base = path.join(raiz, r);
    if (!fs.existsSync(base)) continue;
    for (const arq of arquivosDeCodigo(base)) {
      const rel = path.relative(raiz, arq);
      if (rel.startsWith("lib/agency/gerencia/")) continue; // é a fonte única
      const texto = fs.readFileSync(arq, "utf8");
      if (NOMES.some((n) => texto.includes(`authorName: "${n}"`))) achados.push(rel);
    }
  }
  return achados;
}

describe("a catraca da voz da casa", () => {
  it("NENHUM arquivo fala com o cliente por fora da voz única — a dívida está em zero", () => {
    expect(
      infratores(),
      `estes arquivos falam com o cliente por conta própria: ${infratores().join(", ")}. Use lib/agency/gerencia/voz-unica.ts.`,
    ).toEqual([]);
  });

  it("⛔ a lista congelada está VAZIA — catraca com exceção é permissão com outro nome", () => {
    expect(DIVIDA_CONGELADA_25_08).toEqual([]);
    expect(VOZES_LEGADAS_A_MIGRAR).toEqual([]);
  });

  it("as 16 falas migradas importam a voz única, e o diário do SDR importa o nome dele", () => {
    // Prova que a migração foi por IMPORTAÇÃO e não por apagar a linha: se
    // alguém tivesse simplesmente removido o `authorName`, a catraca acima
    // ficaria verde e o cliente passaria a receber mensagem sem assinatura.
    const raiz = process.cwd();
    const migrados = [
      "app/api/admin/reset-request/route.ts",
      "app/api/portal/approvals/route.ts",
      "lib/agency/esteira/trafego.ts",
      "lib/agency/esteira/pm-responde.ts",
      "lib/agency/esteira/ligar-projeto.ts",
      "lib/agency/esteira/triagem.ts",
      "lib/agency/esteira/reabrir-aprovacao.ts",
      "lib/agency/esteira/refacao.ts",
      "lib/agency/esteira/marcos.ts",
      "lib/agency/esteira/orcamento-do-briefing.ts",
      "lib/agency/esteira/peca-aprovada-que-nao-agendou.ts",
      "lib/agency/esteira/pedidos.ts",
      "lib/agency/execution/create-project-from-request.ts",
    ];
    for (const rel of migrados) {
      const texto = fs.readFileSync(path.join(raiz, rel), "utf8");
      expect(texto, `${rel} não importa a voz única`).toContain("VOZ_DO_CLIENTE");
      expect(texto, `${rel} não assina mais a mensagem`).toContain("authorName: VOZ_DO_CLIENTE");
    }
    const sdr = fs.readFileSync(path.join(raiz, "lib/agency/comercial/registro-da-conversa.ts"), "utf8");
    expect(sdr).toContain("AUTOR_DO_REGISTRO_DO_SDR");
    // O diário continua legível para o SDR: o nome gravado é o mesmo que a
    // leitura procura, e é o mesmo das linhas históricas.
    expect(AUTOR_DO_REGISTRO_DO_SDR).toBe("SDR");
  });
});

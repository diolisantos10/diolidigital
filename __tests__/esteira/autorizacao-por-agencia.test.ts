// A AUTORIZAÇÃO DA ESTEIRA SOBREVIVE AO CLIENTE.
//
// O incidente que produziu esta frente: o CEO zerou a agência, o CityJobs foi
// recadastrado com id NOVO e nasceu fora da allowlist por `clientId`. O motor
// recusou em silêncio e a tela do cliente continuou prometendo orçamento.
//
// As duas metades: a chave da AGÊNCIA autoriza qualquer cliente dela (é o
// ponto), e o `false` no cliente continua vencendo o `true` da agência (a
// trava não foi afrouxada de carona — dá para desligar um cliente sozinho).

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { escoposDeAutorizacao, esteiraAutorizada } from "@/lib/agency/esteira-assistida/autorizacao";
import { virarChaveDoPiloto } from "@/lib/agency/esteira-assistida/piloto";
import { FLAGS_V2, type ArmazemDeFlags, type LinhaDeFlag } from "@/lib/agency/flags-v2/flags";

function armazem(linhas: LinhaDeFlag[]): ArmazemDeFlags {
  return { async buscar(chave, escopos) { return linhas.filter((l) => l.chave === chave && escopos.includes(l.escopo)); } };
}

const CLIENTE = "cli_cityjobs_novo";
const AGENCIA = "ws_dioli";

describe("a chave da agência autoriza o cliente que nasceu depois dela", () => {
  it("✅ cliente NOVO, que nunca esteve em allowlist nenhuma, roda pela chave da agência", async () => {
    const r = await esteiraAutorizada(
      { clienteId: CLIENTE, workspaceId: AGENCIA, nomeDoCliente: "CityJobs" },
      armazem([{ chave: FLAGS_V2.execucao, escopo: AGENCIA, ligada: true }]),
    );
    expect(r.autorizada).toBe(true);
  });

  it("⛔ sem chave nenhuma NÃO roda — e o motivo é legível por gente, não por log", async () => {
    const r = await esteiraAutorizada(
      { clienteId: CLIENTE, workspaceId: AGENCIA, nomeDoCliente: "CityJobs" },
      armazem([]),
    );
    expect(r.autorizada).toBe(false);
    if (r.autorizada) throw new Error("inalcançável");
    expect(r.motivo).toContain("CityJobs");
    expect(r.motivo).toContain("DESLIGADA");
    // Diz O QUE FAZER. Motivo que não indica a saída é motivo pela metade.
    expect(r.motivo).toMatch(/ligar|Ligue/i);
  });

  it("🔑 o `false` no CLIENTE vence o `true` da AGÊNCIA — dá para desligar um sozinho", async () => {
    const r = await esteiraAutorizada(
      { clienteId: CLIENTE, workspaceId: AGENCIA, nomeDoCliente: "CityJobs" },
      armazem([
        { chave: FLAGS_V2.execucao, escopo: AGENCIA, ligada: true },
        { chave: FLAGS_V2.execucao, escopo: CLIENTE, ligada: false },
      ]),
    );
    expect(r.autorizada).toBe(false);
  });

  it("a ordem dos escopos É o mecanismo: cliente antes de agência, sempre", () => {
    expect(escoposDeAutorizacao(CLIENTE, AGENCIA)).toEqual([CLIENTE, AGENCIA]);
    // "global" NUNCA entra por aqui — quem o acrescenta é `flagLigada`.
    expect(escoposDeAutorizacao(CLIENTE, AGENCIA)).not.toContain("global");
  });

  it("⛔ solicitação sem agência não roda, e o motivo diz o que falta", async () => {
    const r = await esteiraAutorizada({ clienteId: CLIENTE, workspaceId: null, nomeDoCliente: "CityJobs" }, armazem([]));
    expect(r.autorizada).toBe(false);
    if (r.autorizada) throw new Error("inalcançável");
    expect(r.motivo).toMatch(/agência|workspace/i);
  });
});

describe("a regra 3 da ativação continua de pé — global é recusado em código", () => {
  it("⛔ ninguém liga v2_execucao globalmente, nem por este caminho novo", async () => {
    for (const escopo of ["global", "GLOBAL", "*"]) {
      const r = await virarChaveDoPiloto(
        { escopo, motivo: "m", decididoPor: "eu", ligar: true },
        { async gravar() { throw new Error("gravou o global — a trava caiu"); } },
      );
      expect(r.ok).toBe(false);
    }
  });

  it("✅ o escopo do WORKSPACE é aceito — é o caminho novo", async () => {
    let gravado: string | null = null;
    const r = await virarChaveDoPiloto(
      { escopo: AGENCIA, motivo: "esteira da casa", decididoPor: "direcao:1", ligar: true },
      { async gravar(_c, escopo) { gravado = escopo; } },
    );
    expect(r.ok).toBe(true);
    expect(gravado).toBe(AGENCIA);
  });
});

describe("o porquê fica no código, não só no chat", () => {
  it("o arquivo registra que o reset apaga Client e NÃO apaga workspace/flag", () => {
    const fonte = fs.readFileSync(
      path.join(process.cwd(), "lib/agency/esteira-assistida/autorizacao.ts"), "utf8",
    );
    expect(fonte).toMatch(/reset/i);
    expect(fonte).toMatch(/AgencyWorkspace/);
    expect(fonte).toMatch(/FlagV2/);
  });
});

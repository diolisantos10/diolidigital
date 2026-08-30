// A DÍVIDA DA ENTRADA DO M14 — A FECHADURA DOS DOIS LADOS.
//
// Ver docs/celula-prospeccao/despachos/ONDA-4A-C-divida-do-m14.md.
//
// Este arquivo prova cinco coisas:
//   1. Vencida, a dívida aparece em `dividasVencidas` e `gritoDasDividas` cita
//      id, os dois donos e os dois arquivos.
//   2. 🔴 O RELÓGIO REAL: com `new Date()` de verdade, se a dívida já venceu,
//      este teste FALHA — sozinho, sem ninguém precisar lembrar de rodá-lo —
//      e a mensagem de falha diz exatamente o que falta e quem são os donos.
//   3. A dívida não some do registro em silêncio.
//   4. Os dois arquivos dependentes ainda carregam a marca do risco no
//      cabeçalho — apagar a marca sem fechar a dívida fica vermelho aqui.
//   5. `podeAcompanhar` continua fail-closed com `acompanhamentosJaEnviados
//      = null`, sem alterar uma linha de `acompanhamento.ts`.
//
// ⚠️ O vermelho do item 2 é DATADO, não permanente — interpretação do PM
// sobre a ordem do Diretor, documentada em `divida-declarada.ts`. Se a
// intenção era outra, é o Diretor quem manda mudar.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ID_DIVIDA_ENTRADA_ACOMPANHAMENTOS_JA_ENVIADOS,
  dividasAbertas,
  dividasVencidas,
  gritoDasDividas,
} from "@/lib/agency/celula/divida-declarada";
import { podeAcompanhar, type EstadoDaOportunidade } from "@/lib/agency/celula/mensagens/acompanhamento";

const ID = ID_DIVIDA_ENTRADA_ACOMPANHAMENTOS_JA_ENVIADOS;
const RAIZ_DO_REPO = resolve(__dirname, "..", "..");

describe("dividasVencidas / gritoDasDividas — vence e grita (espelho de excecoesVencidas / gritoDaFila)", () => {
  it("com 'agora' depois do prazo, a dívida aparece vencida", () => {
    const depoisDoPrazo = new Date("2026-09-16T00:00:00.000Z");
    const vencidas = dividasVencidas(depoisDoPrazo);
    expect(vencidas.some((d) => d.id === ID)).toBe(true);
  });

  it("o grito cita o id, os DOIS donos e os DOIS arquivos dependentes", () => {
    const depoisDoPrazo = new Date("2026-09-16T00:00:00.000Z");
    const grito = gritoDasDividas(depoisDoPrazo);

    expect(grito).toContain(ID);
    expect(grito).toContain("gerente_de_atendimento");
    expect(grito).toContain("sdr");
    expect(grito).toContain("lib/agency/celula/mensagens/acompanhamento.ts");
    expect(grito).toContain("lib/marketplaces/99freelas/follow-up.ts");
    expect(grito.length).toBeGreaterThan(0);
  });

  it("antes do prazo, a dívida NÃO está vencida e o grito não inventa alarme", () => {
    const antesDoPrazo = new Date("2026-09-01T00:00:00.000Z");
    expect(dividasVencidas(antesDoPrazo).some((d) => d.id === ID)).toBe(false);
    expect(gritoDasDividas(antesDoPrazo)).toContain("Nenhuma dívida declarada está vencida.");
  });
});

describe("🔴 O RELÓGIO REAL — este teste estoura sozinho quando o prazo vencer", () => {
  it("com o instante ATUAL, a dívida do M14 não pode estar vencida — se estiver, a mensagem de falha diz o que falta e quem são os donos", () => {
    const agora = new Date();
    const vencida = dividasVencidas(agora).find((d) => d.id === ID);

    if (vencida) {
      throw new Error(
        `🔴 A DÍVIDA "${vencida.id}" VENCEU em ${vencida.prazo} (agora é ${agora.toISOString()}) e ninguém ` +
          `construiu a entrada.\n` +
          `O QUE FALTA: ${vencida.oQueFalta}\n` +
          `DONOS: ${vencida.donos.join(" e ")}\n` +
          `ARQUIVOS QUE DEPENDEM DISSO: ${vencida.quemDependeDisso.join(", ")}\n` +
          `PORQUE NÃO FOI FEITO ATÉ AGORA: ${vencida.porQueNaoFoiFeito}\n` +
          `Ver docs/celula-prospeccao/despachos/ONDA-4A-C-divida-do-m14.md — esta dívida foi DECLARADA, ` +
          `não esquecida. Construa a entrada, remova este registro de REGISTRO_DE_DIVIDAS em ` +
          `lib/agency/celula/divida-declarada.ts e limpe a referência a esta dívida nos cabeçalhos dos ` +
          `dois arquivos acima — as três coisas juntas, nunca só uma.`,
      );
    }

    expect(vencida).toBeUndefined();
  });
});

describe("A dívida não some do registro em silêncio", () => {
  it("'entrada-de-acompanhamentos-ja-enviados' existe em dividasAbertas()", () => {
    const abertas = dividasAbertas();
    const divida = abertas.find((d) => d.id === ID);
    expect(divida, `A dívida "${ID}" desapareceu de REGISTRO_DE_DIVIDAS sem a entrada ter sido construída.`).toBeDefined();
  });

  it("a dívida cita os dois donos tipados e os dois arquivos reais", () => {
    const divida = dividasAbertas().find((d) => d.id === ID)!;
    expect(divida.donos).toContain("gerente_de_atendimento");
    expect(divida.donos).toContain("sdr");
    expect(divida.quemDependeDisso).toContain("lib/agency/celula/mensagens/acompanhamento.ts");
    expect(divida.quemDependeDisso).toContain("lib/marketplaces/99freelas/follow-up.ts");
  });
});

describe("Os dois arquivos dependentes existem no disco e ainda carregam a marca do risco", () => {
  it("lib/agency/celula/mensagens/acompanhamento.ts existe e cita a dívida no cabeçalho", () => {
    const conteudo = readFileSync(
      resolve(RAIZ_DO_REPO, "lib/agency/celula/mensagens/acompanhamento.ts"),
      "utf-8",
    );
    expect(conteudo).toContain("🔴 O RISCO QUE ESTE ARQUIVO NÃO FECHA");
    expect(
      conteudo,
      "o cabeçalho de acompanhamento.ts não cita mais o id da dívida — se a entrada foi construída de " +
        "verdade, feche a dívida em divida-declarada.ts também (as duas coisas juntas).",
    ).toContain(ID);
  });

  it("lib/marketplaces/99freelas/follow-up.ts existe e cita a dívida no cabeçalho", () => {
    const conteudo = readFileSync(resolve(RAIZ_DO_REPO, "lib/marketplaces/99freelas/follow-up.ts"), "utf-8");
    expect(conteudo).toContain("🔴 O RISCO QUE ESTE ARQUIVO NÃO FECHA");
    expect(
      conteudo,
      "o cabeçalho de follow-up.ts não cita mais o id da dívida — se a entrada foi construída de verdade, " +
        "feche a dívida em divida-declarada.ts também (as duas coisas juntas).",
    ).toContain(ID);
  });
});

describe("Fail closed continua valendo — acompanhamentosJaEnviados = null bloqueia (sem alterar acompanhamento.ts)", () => {
  it("null bloqueia o acompanhamento e nomeia o campo no motivo", () => {
    const estado: EstadoDaOportunidade = {
      referencia: "ref-teste-divida-m14",
      ultimaMensagemDaAgenciaEm: new Date("2020-01-01T00:00:00.000Z"),
      acompanhamentosJaEnviados: null,
      clienteRecusou: false,
      projetoEncerrado: false,
      outraPessoaContratada: false,
      clientePediuParaNaoReceber: false,
      plataformaBloqueou: false,
      clienteRespondeu: false,
    };

    const decisao = podeAcompanhar(estado, new Date("2026-08-30T00:00:00.000Z"));

    expect(decisao.pode).toBe(false);
    expect(decisao.motivos.some((m) => m.includes('"acompanhamentosJaEnviados"'))).toBe(true);
  });
});

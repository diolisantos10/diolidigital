// O portão do deploy e a porta de emergência — as duas metades.
//
// METADE 1 (não pode barrar quem tem razão): commit com CI verde passa pelo
// caminho normal, e a porta de emergência RECUSA abrir para ele — porque porta
// de emergência usada com o portão aberto é como ela vira o caminho normal.
//
// METADE 2 (tem que barrar de verdade): commit sem prova não é aprovado por
// nenhum caminho, e forçar sem quem/motivo/confirmação não abre.
//
// O dia que escreveu isto: 06/08/2026, GitHub Actions em major outage, produção
// recebendo commit sem NENHUM resultado de CI. Não vermelho — inexistente.

import { describe, expect, it } from "vitest";
import { julgarDeploy, julgarProva } from "@/lib/plataforma/sentinela-do-deploy";
import {
  CAMPOS_OBRIGATORIOS_DO_REGISTRO,
  montarRegistro,
  podeForcar,
  TAMANHO_MINIMO_DO_MOTIVO,
} from "@/lib/plataforma/porta-de-emergencia";

const ACTIONS_OK = { actionsOperacional: true };
const ACTIONS_FORA = { actionsOperacional: false, incidente: "Incident with Actions" };

const PEDIDO_COMPLETO = {
  quem: "Dioli",
  motivo: "GitHub Actions em major outage e o portal do cliente está fora do ar",
  confirmado: true,
};

describe("julgarProva — a régua é uma só, e 'sem CI' nunca é verde", () => {
  it("CI verde é a ÚNICA coisa que prova", () => {
    const v = julgarProva({ ci: { houveRun: true, conclusao: "success" }, plataforma: ACTIONS_OK });
    expect(v.codigo).toBe("APROVADO");
    expect(v.temProva).toBe(true);
  });

  it("nenhum run não prova nada", () => {
    const v = julgarProva({ ci: { houveRun: false, conclusao: null }, plataforma: ACTIONS_OK });
    expect(v.codigo).toBe("SEM_PROVA");
    expect(v.temProva).toBe(false);
  });

  it("run que morreu no meio não prova nada — em nenhuma das formas de morrer", () => {
    for (const c of ["cancelled", "stale", "skipped", "neutral"] as const) {
      const v = julgarProva({ ci: { houveRun: true, conclusao: c }, plataforma: ACTIONS_OK });
      expect(v.temProva, `conclusão "${c}" não pode provar nada`).toBe(false);
      expect(v.codigo).toBe("SEM_PROVA");
    }
  });

  it("run ainda em andamento (conclusão null) não prova nada", () => {
    const v = julgarProva({ ci: { houveRun: true, conclusao: null }, plataforma: ACTIONS_OK });
    expect(v.temProva).toBe(false);
  });

  it("com o Actions fora, ausência continua sendo ausência — a pane explica, não absolve", () => {
    const v = julgarProva({ ci: { houveRun: false, conclusao: null }, plataforma: ACTIONS_FORA });
    expect(v.codigo).toBe("SEM_PROVA_PLATAFORMA_FORA");
    expect(v.temProva).toBe(false);
  });

  it("CI reprovada é reprovada mesmo com a plataforma fora", () => {
    const v = julgarProva({ ci: { houveRun: true, conclusao: "failure" }, plataforma: ACTIONS_FORA });
    expect(v.codigo).toBe("CI_REPROVOU");
    expect(v.temProva).toBe(false);
  });
});

// Um mecanismo só: se alguém "otimizar" um dos dois lados, os dois vereditos
// divergem e é aqui que a divergência aparece.
describe("o sentinela e a porta de emergência usam a MESMA régua", () => {
  const casos = [
    { ci: { houveRun: true, conclusao: "success" as const }, plataforma: ACTIONS_OK },
    { ci: { houveRun: true, conclusao: "failure" as const }, plataforma: ACTIONS_OK },
    { ci: { houveRun: true, conclusao: "cancelled" as const }, plataforma: ACTIONS_OK },
    { ci: { houveRun: false, conclusao: null }, plataforma: ACTIONS_OK },
    { ci: { houveRun: false, conclusao: null }, plataforma: ACTIONS_FORA },
  ];

  it("o código do veredito de produção é o mesmo código da prova", () => {
    for (const caso of casos) {
      const doSentinela = julgarDeploy({ producao: { noAr: true, commit: "0ce8ea2" }, ...caso });
      const daPorta = julgarProva(caso);
      expect(doSentinela.codigo).toBe(daPorta.codigo);
      expect(doSentinela.producaoSemProva).toBe(!daPorta.temProva);
    }
  });
});

describe("porta de emergência — a metade que BARRA", () => {
  it("sem quem, não abre", () => {
    const d = podeForcar({ ...PEDIDO_COMPLETO, quem: "  " }, "SEM_PROVA");
    expect(d.liberado).toBe(false);
  });

  it("sem motivo, não abre", () => {
    const d = podeForcar({ ...PEDIDO_COMPLETO, motivo: "" }, "SEM_PROVA");
    expect(d.liberado).toBe(false);
  });

  it("motivo-carimbo não conta como motivo", () => {
    const curto = "x".repeat(TAMANHO_MINIMO_DO_MOTIVO - 1);
    expect(podeForcar({ ...PEDIDO_COMPLETO, motivo: curto }, "SEM_PROVA").liberado).toBe(false);
  });

  it("sem confirmação explícita, não abre — produção não se força por engano de comando", () => {
    const d = podeForcar({ ...PEDIDO_COMPLETO, confirmado: false }, "SEM_PROVA");
    expect(d.liberado).toBe(false);
  });

  it("com o portão JÁ liberando, a porta de emergência se recusa a ser o caminho normal", () => {
    const d = podeForcar(PEDIDO_COMPLETO, "APROVADO");
    expect(d.liberado).toBe(false);
    if (!d.liberado) expect(d.erro).toMatch(/--mesmo-aprovado/);
  });
});

describe("porta de emergência — a metade que NÃO PODE ATRAPALHAR o conserto", () => {
  it("dia de pane: com quem, motivo e confirmação, ABRE", () => {
    expect(podeForcar(PEDIDO_COMPLETO, "SEM_PROVA_PLATAFORMA_FORA").liberado).toBe(true);
  });

  it("abre também quando simplesmente não houve run", () => {
    expect(podeForcar(PEDIDO_COMPLETO, "SEM_PROVA").liberado).toBe(true);
  });

  it("abre com a CI reprovando — é decisão de gente, e ela fica registrada", () => {
    expect(podeForcar(PEDIDO_COMPLETO, "CI_REPROVOU").liberado).toBe(true);
  });

  it("com --mesmo-aprovado, o commit já aprovado também pode ser reempurrado", () => {
    expect(podeForcar({ ...PEDIDO_COMPLETO, insistiuComAprovado: true }, "APROVADO").liberado).toBe(true);
  });
});

describe("o rastro — sem ele a porta vira o caminho normal", () => {
  const registro = montarRegistro({
    quando: new Date("2026-08-06T23:45:00Z"),
    quem: "Dioli",
    motivo: "GitHub Actions em major outage e o portal do cliente está fora do ar",
    commit: "0ce8ea25e12d7127559911c8a9e80ee7b2135928",
    assunto: "conserta o portal",
    prova: "SEM_PROVA_PLATAFORMA_FORA",
    resumoDaProva: "Este commit NÃO tem prova de CI — o GitHub Actions está fora.",
    incidente: "Incident with Actions",
  });

  it("responde quem, quando, por quê e sobre qual commit — sem sair do arquivo", () => {
    for (const campo of CAMPOS_OBRIGATORIOS_DO_REGISTRO) expect(registro).toContain(campo);
    expect(registro).toContain("Dioli");
    expect(registro).toContain("2026-08-06 23:45 UTC");
    expect(registro).toContain("0ce8ea25e12d7127559911c8a9e80ee7b2135928");
    expect(registro).toContain("major outage");
  });

  it("guarda o estado da CI NAQUELE momento — quem ler depois não precisa acreditar", () => {
    expect(registro).toContain("SEM_PROVA_PLATAFORMA_FORA");
    expect(registro).toContain("Incident with Actions");
  });

  it("nenhum segredo entra no registro", () => {
    expect(registro).not.toMatch(/Project-Access-Token|Bearer |RAILWAY_TOKEN|GITHUB_TOKEN/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// O DISPARO — a porta de emergência precisa ABRIR, não só recusar direito.
//
// Tudo acima prova que a porta barra quem não deve passar. Nada provava que ela
// ABRE para quem deve — e ela não abria: em 06 e 07/08/2026 o disparo falhou com
// "Bad Access" nas duas emergências reais, porque o token de PROJETO do Railway
// recusa `environmentTriggersDeploy` e `deploymentTriggerUpdate`. Na segunda, com
// o GitHub Actions em pane e o portal quebrado, o conserto subiu À MÃO.
//
// Uma trava que só sabe dizer "não" passa em qualquer teste de segurança e não
// entrega nada. Estas são as duas metades do DISPARO.
describe("dispararDeploy — a porta abre, pela mutação que o token aceita", () => {
  const chamadas: Array<{ query: string; variables: Record<string, unknown> }> = [];

  async function comFetchFalso(
    resposta: unknown,
    fn: () => Promise<unknown>,
  ): Promise<{ erro: Error | null; valor: unknown }> {
    const original = globalThis.fetch;
    process.env.RAILWAY_TOKEN = "token-de-teste";
    globalThis.fetch = (async (_url: string, init: { body: string }) => {
      chamadas.push(JSON.parse(init.body));
      return { ok: true, json: async () => resposta } as unknown as Response;
    }) as unknown as typeof fetch;
    try {
      return { erro: null, valor: await fn() };
    } catch (e) {
      return { erro: e as Error, valor: null };
    } finally {
      globalThis.fetch = original;
      delete process.env.RAILWAY_TOKEN;
    }
  }

  it("✅ METADE 1 — dispara o COMMIT NOMEADO por serviceInstanceDeployV2, sem tocar no portão", async () => {
    chamadas.length = 0;
    const { dispararDeploy } = await import("@/lib/plataforma/railway-portao");
    const r = await comFetchFalso({ data: { serviceInstanceDeployV2: "dep-123" } }, () =>
      dispararDeploy("4ed47a9641d6002693b14552d59ee4e2dc9e301e"),
    );

    expect(r.erro).toBeNull();
    // Devolve o id da implantação: é o que permite CONFERIR que subiu, em vez
    // de acreditar no "disparei".
    expect(r.valor).toBe("dep-123");

    expect(chamadas).toHaveLength(1);
    const { query, variables } = chamadas[0]!;
    // A mutação que o token de PROJETO aceita — a outra dava "Bad Access".
    expect(query).toContain("serviceInstanceDeployV2");
    expect(query).not.toContain("environmentTriggersDeploy");
    // O commit vai EXPLÍCITO: "o último da branch" não responde "o que subiu?".
    expect(variables.commitSha).toBe("4ed47a9641d6002693b14552d59ee4e2dc9e301e");

    // E o portão do CI não é tocado: nenhuma chamada mexe no trigger. Era a
    // janela em que a produção ficava sem portão — e ficava aberta para sempre
    // se o processo morresse no meio do caminho.
    for (const c of chamadas) expect(c.query).not.toContain("deploymentTriggerUpdate");
  });

  it("⛔ METADE 2 — sem commitSha não dispara nada: porta que adivinha o que sobe é alçapão", async () => {
    chamadas.length = 0;
    const { dispararDeploy } = await import("@/lib/plataforma/railway-portao");
    for (const vazio of ["", "   "]) {
      const r = await comFetchFalso({ data: {} }, () => dispararDeploy(vazio));
      expect(r.erro, `"${vazio}" tinha de recusar`).toBeInstanceOf(Error);
      expect(String(r.erro?.message)).toMatch(/commitSha/);
    }
    // O que importa: NENHUMA chamada saiu para o Railway.
    expect(chamadas, "recusa tem de ser ANTES da rede").toHaveLength(0);
  });
});

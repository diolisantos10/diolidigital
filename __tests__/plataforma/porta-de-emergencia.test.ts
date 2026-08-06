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

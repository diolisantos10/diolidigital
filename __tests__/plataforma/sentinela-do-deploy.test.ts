// A metade que trava: "a CI não rodou" NUNCA pode sair verde.
//
// Estes testes fixam o incidente de 06/08/2026: produção servindo `7724050`
// com zero runs de CI, durante a pane do GitHub Actions, e ninguém avisado.
// Se alguém um dia "simplificar" o veredito para `conclusao !== "failure"`,
// é aqui que a simplificação bate.

import { describe, expect, it } from "vitest";
import { julgarDeploy, type ConclusaoDeCI } from "@/lib/plataforma/sentinela-do-deploy";

const NO_AR = { noAr: true, commit: "7724050" };
const ACTIONS_OK = { actionsOperacional: true };
const ACTIONS_FORA = { actionsOperacional: false, incidente: "Incident with Actions" };

describe("o caso real: produção sem prova durante a pane do Actions", () => {
  it("commit no ar sem NENHUM run de CI não é aprovado — é 'sem prova'", () => {
    const v = julgarDeploy({
      producao: NO_AR,
      ci: { houveRun: false, conclusao: null },
      plataforma: ACTIONS_OK,
    });
    expect(v.codigo).toBe("SEM_PROVA");
    expect(v.gravidade).toBe("grave");
    expect(v.producaoSemProva).toBe(true);
  });

  it("com o Actions fora, continua SEM PROVA — a pane explica, não absolve", () => {
    const v = julgarDeploy({
      producao: NO_AR,
      ci: { houveRun: false, conclusao: null },
      plataforma: ACTIONS_FORA,
    });
    expect(v.codigo).toBe("SEM_PROVA_PLATAFORMA_FORA");
    // A produção segue não verificada. Este é o ponto do teste inteiro.
    expect(v.producaoSemProva).toBe(true);
    expect(v.gravidade).not.toBe("ok");
  });

  it("a ação muda conforme a plataforma, mas nunca vira 'não faça nada'", () => {
    const comPane = julgarDeploy({
      producao: NO_AR,
      ci: { houveRun: false, conclusao: null },
      plataforma: ACTIONS_FORA,
    });
    const semPane = julgarDeploy({
      producao: NO_AR,
      ci: { houveRun: false, conclusao: null },
      plataforma: ACTIONS_OK,
    });
    expect(comPane.acao).not.toBe("");
    expect(semPane.acao).not.toBe("");
    expect(comPane.acao).not.toBe(semPane.acao);
  });
});

describe("run que morreu no meio não aprova nada", () => {
  // O e-mail do GitHub chama isto de "All jobs were cancelled" e a caixa de
  // entrada do CEO leu como ruído. Cancelado é run que não terminou: não
  // reprovou e, principalmente, NÃO APROVOU.
  const mortesNoMeio: ConclusaoDeCI[] = ["cancelled", "skipped", "neutral", "stale"];

  for (const conclusao of mortesNoMeio) {
    it(`"${conclusao}" não passa como verde`, () => {
      const v = julgarDeploy({
        producao: NO_AR,
        ci: { houveRun: true, conclusao },
        plataforma: ACTIONS_OK,
      });
      expect(v.codigo).not.toBe("APROVADO");
      expect(v.producaoSemProva).toBe(true);
    });
  }

  it("o resumo de um run cancelado diz que ele não provou nada", () => {
    const v = julgarDeploy({
      producao: NO_AR,
      ci: { houveRun: true, conclusao: "cancelled" },
      plataforma: ACTIONS_OK,
    });
    expect(v.resumo).toMatch(/sem provar nada/i);
  });
});

describe("reprovação de verdade é grave", () => {
  const reprovacoes: ConclusaoDeCI[] = ["failure", "timed_out", "startup_failure", "action_required"];

  for (const conclusao of reprovacoes) {
    it(`"${conclusao}" em produção é grave`, () => {
      const v = julgarDeploy({
        producao: NO_AR,
        ci: { houveRun: true, conclusao },
        plataforma: ACTIONS_OK,
      });
      expect(v.codigo).toBe("CI_REPROVOU");
      expect(v.gravidade).toBe("grave");
    });
  }

  it("nem a pane do Actions transforma reprovação em atenuante", () => {
    const v = julgarDeploy({
      producao: NO_AR,
      ci: { houveRun: true, conclusao: "failure" },
      plataforma: ACTIONS_FORA,
    });
    expect(v.codigo).toBe("CI_REPROVOU");
    expect(v.gravidade).toBe("grave");
  });
});

describe("só um caminho é verde", () => {
  it("success é o único código que zera o alarme", () => {
    const v = julgarDeploy({
      producao: NO_AR,
      ci: { houveRun: true, conclusao: "success" },
      plataforma: ACTIONS_OK,
    });
    expect(v.codigo).toBe("APROVADO");
    expect(v.gravidade).toBe("ok");
    expect(v.producaoSemProva).toBe(false);
    expect(v.acao).toBe("");
  });

  it("nenhuma outra conclusão do GitHub sai com gravidade ok", () => {
    const todas: ConclusaoDeCI[] = [
      "failure", "cancelled", "timed_out", "startup_failure",
      "skipped", "neutral", "action_required", "stale",
    ];
    for (const conclusao of todas) {
      const v = julgarDeploy({
        producao: NO_AR,
        ci: { houveRun: true, conclusao },
        plataforma: ACTIONS_OK,
      });
      expect(v.gravidade, `conclusão "${conclusao}" não pode ser ok`).not.toBe("ok");
    }
  });
});

describe("produção fora vem antes de qualquer discussão sobre prova", () => {
  it("produção fora é grave mesmo com CI verde", () => {
    const v = julgarDeploy({
      producao: { noAr: false, commit: "7724050" },
      ci: { houveRun: true, conclusao: "success" },
      plataforma: ACTIONS_OK,
    });
    expect(v.codigo).toBe("PRODUCAO_FORA");
    expect(v.gravidade).toBe("grave");
  });

  it("produção que não declara versão é falha de sentinela, e é grave", () => {
    const v = julgarDeploy({
      producao: { noAr: true, commit: null },
      ci: { houveRun: true, conclusao: "success" },
      plataforma: ACTIONS_OK,
    });
    expect(v.codigo).toBe("PRODUCAO_SEM_VERSAO");
    expect(v.gravidade).toBe("grave");
    // Sentinela cego não pode se declarar satisfeito.
    expect(v.producaoSemProva).toBe(true);
  });
});

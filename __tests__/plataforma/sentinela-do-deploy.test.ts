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

// ── "NÃO HÁ" É DIFERENTE DE "NÃO SEI" ───────────────────────────────────────
// Os dois fecham o portão. Só um deles pode dizer "nenhum run foi criado".
//
// O defeito real (24/08/2026): quatro commits com CI VERDE foram anunciados
// pelo sentinela como "nenhum run foi criado", porque a máquina que perguntou
// não tinha rota até o GitHub. Quem lesse iria caçar um CI que existia.
describe("o motivo tem que ser verdadeiro, não só severo", () => {
  const producao = { noAr: true, commit: "274bd18" };
  const plataformaDePe = { actionsOperacional: true, incidente: null };

  it("perguntei e o GitHub disse que não há run → SEM_PROVA, e diz que perguntou", () => {
    const v = julgarDeploy({
      producao,
      ci: { houveRun: false, conclusao: null },
      plataforma: plataformaDePe,
    });

    expect(v.codigo).toBe("SEM_PROVA");
    expect(v.resumo).toMatch(/nenhum run foi criado/i);
    // O fato só pode ser afirmado porque houve resposta. A frase carrega isso.
    expect(v.resumo).toMatch(/perguntei ao GitHub/i);
    expect(v.producaoSemProva).toBe(true);
  });

  it("não consegui perguntar → estado PRÓPRIO, e NUNCA a frase do outro", () => {
    const v = julgarDeploy({
      producao,
      ci: {
        houveRun: false,
        conclusao: null,
        perguntaFalhou: true,
        motivoDaFalha: "falha de rede ao listar os runs: TypeError",
      },
      plataforma: plataformaDePe,
    });

    expect(v.codigo).toBe("SEM_RESPOSTA_DO_GITHUB");
    // A MUTAÇÃO QUE ISTO MATA: se alguém juntar os dois estados de novo — seja
    // apagando o ramo, seja devolvendo `houveRun: false` puro lá em `olharCI` —
    // esta frase reaparece aqui, e o teste quebra. É a trava da distinção.
    expect(v.resumo).not.toMatch(/nenhum run foi criado/i);
    expect(v.resumo).not.toMatch(/não existe CI verde/i);
    // Diz a verdade: não sei.
    expect(v.resumo).toMatch(/não consegui perguntar/i);
    expect(v.resumo).toMatch(/não estou dizendo que não há/i);
    // E carrega o detalhe técnico de quem for investigar.
    expect(v.resumo).toMatch(/TypeError/);
  });

  it("no caso mudo, a ação manda conferir no Actions e diz qual resultado vale", () => {
    const v = julgarDeploy({
      producao,
      ci: { houveRun: false, conclusao: null, perguntaFalhou: true, motivoDaFalha: "HTTP 403 ao listar os runs" },
      plataforma: plataformaDePe,
    });

    expect(v.acao).toMatch(/github\.com\/diolisantos10\/diolidigital\/actions/);
    // O ponto que fez a auditoria perder tempo: o veredito desta máquina não é
    // o que vale. Quem vale é o de dentro do CI.
    expect(v.acao).toMatch(/de DENTRO do CI/i);
    expect(v.acao).toMatch(/não verificada/i);
  });

  it("os dois estados fecham o portão igual — a distinção é de motivo, não de veredito", () => {
    const comum = { producao, plataforma: plataformaDePe };
    const semProva = julgarDeploy({ ...comum, ci: { houveRun: false, conclusao: null } });
    const mudo = julgarDeploy({
      ...comum,
      ci: { houveRun: false, conclusao: null, perguntaFalhou: true, motivoDaFalha: "tempo esgotado" },
    });

    for (const v of [semProva, mudo]) {
      expect(v.producaoSemProva).toBe(true);
      expect(v.gravidade).toBe("grave");
    }
    // Mesmo veredito, códigos diferentes. Se um dia forem iguais, alguém
    // desfez a separação.
    expect(semProva.codigo).not.toBe(mudo.codigo);
  });

  it("pergunta que falhou vence o diagnóstico de plataforma fora", () => {
    // `olharPlataforma` assume "operacional" quando NÃO consegue falar com o
    // status page. Então, quando a rede local cai, os dois sinais chegam
    // corrompidos — e culpar o Actions seria trocar uma mentira por outra.
    const v = julgarDeploy({
      producao,
      ci: { houveRun: false, conclusao: null, perguntaFalhou: true, motivoDaFalha: "tempo esgotado" },
      plataforma: { actionsOperacional: false, incidente: "Actions degradado" },
    });

    expect(v.codigo).toBe("SEM_RESPOSTA_DO_GITHUB");
    expect(v.resumo).not.toMatch(/Actions degradado/);
  });

  it("pergunta que falhou NUNCA vira aprovação, mesmo com conclusão preenchida", () => {
    // Falha fechada: se um caminho devolver lixo em `conclusao` junto com
    // `perguntaFalhou`, o lixo não pode virar verde.
    const v = julgarDeploy({
      producao,
      ci: { houveRun: true, conclusao: "success" as ConclusaoDeCI, perguntaFalhou: true, motivoDaFalha: "HTTP 502" },
      plataforma: plataformaDePe,
    });

    expect(v.codigo).toBe("SEM_RESPOSTA_DO_GITHUB");
    expect(v.producaoSemProva).toBe(true);
  });
});

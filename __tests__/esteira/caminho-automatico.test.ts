// O CAMINHO AUTOMÁTICO — e as cinco condições que o autorizam.
//
// A autorização do CEO (24/08/2026) foi explícita nos limites: caminho
// automático SIM, "mantendo a rota autenticada de staff intacta e o aceite do
// cliente como condição". Cada teste aqui trava uma dessas condições. Se um
// deles ficar vermelho, não é o teste que está velho — é uma condição que caiu.

import { describe, it, expect } from "vitest";
import {
  avaliarCasoNormal, AUTORIZACAO, PISO_DA_TABELA, STATUS_ACEITO,
} from "@/lib/agency/esteira/caminho-automatico";
import { PLANOS } from "@/lib/agency/planos";

/** O briefing do cliente falso, na forma REAL em que a casa o guarda:
 *  o escopo estruturado mora em `briefingJson.scope`, e a verba chega como a
 *  frase que o cliente escreveu. Montar o "bom" com um objeto inventado foi o
 *  que escondeu, na primeira volta, que a função lia o nível errado. */
const bom = {
  services: JSON.stringify(["social_media"]),
  briefingJson: JSON.stringify({
    transcript: [{ role: "client", text: "oi" }],
    scope: { social: { postsPerWeek: 14 }, budgetRange: "Nosso orçamento é de R$ 500 por mês." },
  }),
  rawContext: "Quero 2 posts por dia no Instagram.",
  chaveDoProspect: "email:marina@exemplo.com",
};

/** Troca só o escopo, mantendo a forma de verdade. */
function comEscopo(scope: Record<string, unknown>): typeof bom {
  return { ...bom, briefingJson: JSON.stringify({ transcript: [], scope }) };
}

describe("a autorização tem procedência — decisão sem ela é memória de alguém", () => {
  it("traz data, quem e a FALA literal", () => {
    expect(AUTORIZACAO.em).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(AUTORIZACAO.quem).toBeTruthy();
    expect(AUTORIZACAO.fala.length).toBeGreaterThan(40);
    // As duas condições que o CEO nomeou têm de estar na fala guardada.
    expect(AUTORIZACAO.fala).toMatch(/staff/i);
    expect(AUTORIZACAO.fala).toMatch(/aceite/i);
  });
});

describe("o caso normal — o automático cobre só ele", () => {
  it("o briefing de um restaurante comum É caso normal — a régua não pode barrar o cliente típico", () => {
    expect(avaliarCasoNormal(bom)).toEqual({ normal: true });
  });

  it("PARA sem canal de contato — a esteira inteira é feita de falar com o cliente", () => {
    const r = avaliarCasoNormal({ ...bom, chaveDoProspect: null });
    expect(r.normal).toBe(false);
    expect(r.normal === false && r.motivo).toMatch(/lead incompleto/);
  });

  it("PARA sem serviço declarado — formulário em branco não é pedido", () => {
    const r = avaliarCasoNormal({ ...bom, services: "[]" });
    expect(r.normal).toBe(false);
    expect(r.normal === false && r.motivo).toMatch(/briefing incompleto/);
  });

  it("PARA quando o volume não é legível — a casa não sabe o que vendeu", () => {
    const r = avaliarCasoNormal({ ...comEscopo({ budgetRange: "R$ 790 por mês" }), rawContext: "" });
    expect(r.normal).toBe(false);
    expect(r.normal === false && r.motivo).toMatch(/volume comprado não é legível/);
  });

  it("PARA com verba abaixo do menor plano do site", () => {
    const r = avaliarCasoNormal(comEscopo({ social: { postsPerWeek: 14 }, budgetRange: "R$ 10 por mês" }));
    expect(r.normal).toBe(false);
    expect(r.normal === false && r.motivo).toMatch(/verba fora da tabela/);
  });

  it("PARA com verba em FAIXA — quem decide dentro de uma faixa é gente", () => {
    const r = avaliarCasoNormal(comEscopo({ social: { postsPerWeek: 14 }, budgetRange: "entre R$ 400 e R$ 480 por mês" }));
    expect(r.normal).toBe(false);
    expect(r.normal === false && r.motivo).toMatch(/verba fora do padrão/);
  });

  it("o piso é a tabela do SITE — não um número escrito à mão aqui", () => {
    expect(PISO_DA_TABELA).toBe(Math.min(...PLANOS.map((p) => p.preco)));
  });
});

describe("as condições da autorização, travadas em código", () => {
  it("a rota autenticada de staff CONTINUA EXISTINDO e continua exigindo sessão", async () => {
    // A condição 1 da autorização. Se alguém apagar a rota ou tirar o
    // requireSession dela "porque agora tem o automático", isto fica vermelho.
    const fonte = await import("node:fs/promises").then((fs) =>
      fs.readFile("app/api/brain/auto-scope/[id]/review/route.ts", "utf-8"));
    expect(fonte).toContain("requireSession");
    // E a trava própria da rota: conta de cliente não aprova escopo.
    expect(fonte).toContain("session.clientId");
  });

  it("a porta do cliente NÃO aceita quem não tem token de portal válido", async () => {
    const fonte = await import("node:fs/promises").then((fs) =>
      fs.readFile("app/api/portal/briefing/aceite/route.ts", "utf-8"));
    // O dono vem do TOKEN, sempre — derivação, nunca comparação.
    expect(fonte).toContain("resolvePortalClient");
    // E nunca do corpo: `clientId` do corpo não pode ser lido em rota pública.
    expect(fonte).not.toMatch(/corpo\.clientId/);
  });

  it("o aceite é CONDIÇÃO — o status do aceite é o que a esteira já reconhece", () => {
    expect(STATUS_ACEITO).toBe("accepted");
  });

  it("o caminho automático NÃO tem interruptor de ambiente nem atalho de força", async () => {
    // Mesma regra do `decisoes-do-dono.ts`: sem process.env, sem { forcar: true },
    // sem parâmetro que pule a regra de parada. Decisão é código versionado.
    const fonte = await import("node:fs/promises").then((fs) =>
      fs.readFile("lib/agency/esteira/caminho-automatico.ts", "utf-8"));
    expect(fonte).not.toMatch(/process\.env/);
    expect(fonte).not.toMatch(/forcar/);
    expect(fonte).not.toMatch(/ignorarRegra|pularRegra|semRegra/);
  });

  it("o automático usa a MESMA porta de criação da rota de staff — não uma cópia", async () => {
    const fonte = await import("node:fs/promises").then((fs) =>
      fs.readFile("lib/agency/esteira/caminho-automatico.ts", "utf-8"));
    expect(fonte).toContain("createProjectFromRequest");
    // E mantém o marco 0: o cliente recebe a direção para avalizar.
    expect(fonte).toContain("pedirDirecao");
  });

  it("o relógio aplica o caminho automático a cada rodada", async () => {
    const fonte = await import("node:fs/promises").then((fs) =>
      fs.readFile("lib/agency/despertador.ts", "utf-8"));
    expect(fonte).toContain("aplicarCaminhoAutomatico");
  });
});

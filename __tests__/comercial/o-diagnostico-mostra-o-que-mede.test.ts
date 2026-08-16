// O SYSTEM DOCTOR MEDIU E NÃO MOSTROU — a checagem invisível.
//
// ── O BLOQUEANTE (16/08/2026, achado por `qualidade`) ───────────────────────
//
// A checagem `aviso-por-email-ao-cliente` nasceu em 16/08 no grupo
// "Comunicação com o cliente". O grupo **não estava em `CHECK_GROUP_ORDER`** —
// o único, dos 12 emitidos, que ficou de fora. E `app/agency/settings/page.tsx`
// monta a tela com `CHECK_GROUP_ORDER.map()` filtrando as checagens por grupo:
// grupo fora da lista **não é desenhado**.
//
// Resultado medido: o cartão da tela de operação mostrava uma linha truncada com
// "Ver diagnóstico →" que levava o CEO exatamente à tela onde o item não
// existia. E, mesmo que existisse, `settings/page.tsx` chamava `runSystemDoctor`
// **sem `canalDeEmail`** — a checagem seria `info` ("ainda não conferi") ali,
// enquanto o cartão de onde ele veio já sabia que o canal estava desligado.
// Duas telas, duas verdades sobre o mesmo fato.
//
// A defesa não é lembrar de atualizar a lista. É o primeiro teste deste arquivo:
// **todo grupo emitido tem de estar na ordem de renderização** — a classe
// inteira do defeito, não só o caso de hoje.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { runSystemDoctor, CHECK_GROUP_ORDER } from "@/lib/agency/system-doctor";

const VAZIO = {
  clients: [], projects: [], deliverables: [], materialRequests: [],
  strategyRooms: [], persisted: false,
} as never;

/** O MESMO recorte que a tela faz: `CHECK_GROUP_ORDER.map().filter()`. */
function oQueATelaDesenha(entrada: object) {
  const { checks } = runSystemDoctor({ ...(VAZIO as object), ...entrada } as never);
  return CHECK_GROUP_ORDER.flatMap((grupo) => checks.filter((c) => c.group === grupo));
}

describe("nenhuma checagem fica fora da tela", () => {
  // ── A CLASSE INTEIRA DO DEFEITO ───────────────────────────────────────────
  it("todo grupo EMITIDO está na ordem de renderização", () => {
    const { checks } = runSystemDoctor({ ...(VAZIO as object), canalDeEmail: undefined } as never);
    const emitidos = [...new Set(checks.map((c) => c.group))];
    const orfaos = emitidos.filter((g) => !CHECK_GROUP_ORDER.includes(g));
    expect(
      orfaos,
      `grupo(s) que o Doctor mede e a tela NÃO desenha: ${orfaos.join(", ")}`,
    ).toEqual([]);
  });

  it("e a ordem não lista grupo que ninguém emite (fantasma na tela)", () => {
    // `Sincronização de Dados` só existe quando a tela informa `dbSyncStatus` —
    // por isso a entrada aqui é a COMPLETA. Grupo condicional não é fantasma;
    // fantasma é grupo que nenhuma entrada possível preenche.
    const { checks } = runSystemDoctor({
      ...(VAZIO as object),
      dbSyncStatus: { clients: "db", projects: "db" },
      canalDeEmail: { ligado: true, resumo: "ligados", comoResolver: "" },
    } as never);
    const emitidos = new Set(checks.map((c) => c.group));
    const fantasmas = CHECK_GROUP_ORDER.filter((g) => !emitidos.has(g));
    expect(fantasmas, `grupo desenhado sem nenhuma checagem dentro: ${fantasmas.join(", ")}`).toEqual([]);
  });

  // ── O CASO QUE PRODUZIU A REGRA ───────────────────────────────────────────
  it("a checagem do canal de e-mail APARECE na lista que a tela desenha", () => {
    const desenhadas = oQueATelaDesenha({
      canalDeEmail: { ligado: false, resumo: "estão DESLIGADOS", comoResolver: "configure RESEND_API_KEY" },
    });
    const c = desenhadas.find((x) => x.id === "aviso-por-email-ao-cliente");
    expect(c, "a checagem do e-mail sumiu da tela de diagnóstico outra vez").toBeDefined();
    expect(c!.status).toBe("fail");
    expect(c!.group).toBe("Comunicação com o cliente");
  });

  it("aparece TAMBÉM quando ninguém conseguiu conferir — 'não sei' é achado", () => {
    const desenhadas = oQueATelaDesenha({ canalDeEmail: undefined });
    const c = desenhadas.find((x) => x.id === "aviso-por-email-ao-cliente");
    expect(c).toBeDefined();
    expect(c!.status).toBe("info");
  });
});

// ── A PERGUNTA QUE `qualidade` DEIXOU ABERTA ────────────────────────────────
//
// O cartão da tela de operação mostra UMA linha (`topAction`, truncada). O canal
// de e-mail é `fail` de severidade `high`. Ele aparece ali?
//
// A resposta é "depende, e dá para saber exatamente do quê": `topAction` varre
// `fail` antes de `warning`, e dentro de `fail` varre `critical` antes de
// `high`. Existem TRÊS checagens `critical` nesta casa, as três em "Dados do
// Piloto" (`pilot-client`, `pilot-project`, `pilot-proposal-pricing`), e as três
// falham quando o cliente/projeto do piloto não está na loja — o estado de uma
// agência recém-zerada. **Nesse estado, o e-mail desligado não aparece no
// cartão.** Fica visível na tela de diagnóstico, que é onde o link leva.
describe("a precedência do `topAction` — o que o cartão de operação mostra", () => {
  const CANAL_OFF = { ligado: false, resumo: "estão DESLIGADOS", comoResolver: "configure RESEND_API_KEY e RESEND_FROM" };

  it("sem falha crítica competindo, a ação do e-mail É a linha do cartão", () => {
    const r = runSystemDoctor({ ...(VAZIO as object), canalDeEmail: CANAL_OFF } as never);
    const doEmail = r.checks.find((c) => c.id === "aviso-por-email-ao-cliente")!;
    // Sem dados de piloto, as três `critical` falham — é o estado da agência
    // zerada. Confirma-se que são elas que ganham, e não um empate obscuro.
    const criticasFalhando = r.checks.filter((c) => c.severity === "critical" && c.status === "fail");
    expect(criticasFalhando.length).toBeGreaterThan(0);
    expect(r.topAction).toBe(criticasFalhando[0]!.action);
    expect(r.topAction).not.toBe(doEmail.action);
  });

  it("as únicas checagens que passam à frente do e-mail são as `critical` do piloto", () => {
    const r = runSystemDoctor({ ...(VAZIO as object), canalDeEmail: CANAL_OFF } as never);
    const criticas = r.checks.filter((c) => c.severity === "critical").map((c) => c.id).sort();
    expect(criticas).toEqual(["pilot-client", "pilot-project", "pilot-proposal-pricing"]);
  });
});

describe("a tela de diagnóstico lê o canal de e-mail de verdade", () => {
  const pagina = readFileSync(path.join(process.cwd(), "app/agency/settings/page.tsx"), "utf8");

  it("busca a capacidade em `GET /api/capacidades` — a verdade é do servidor", () => {
    expect(pagina).toContain('fetch("/api/capacidades")');
    expect(pagina).toContain('c.id === "avisar-cliente-por-email"');
  });

  it("e PASSA `canalDeEmail` para o `runSystemDoctor` — era isto que faltava", () => {
    const chamada = pagina.slice(pagina.indexOf("runSystemDoctor({"));
    expect(
      chamada.slice(0, chamada.indexOf("})")).includes("canalDeEmail"),
      "runSystemDoctor é chamado sem canalDeEmail — a checagem volta a ser 'info' nesta tela",
    ).toBe(true);
  });

  it("falha de leitura NÃO vira verde", () => {
    // O `catch` não pode chamar `setCanalDeEmail` com `ligado: true` nem com um
    // objeto vazio: indefinido é a única leitura honesta de "não consegui".
    const trecho = pagina.slice(pagina.indexOf('fetch("/api/capacidades")'));
    const catchBloco = trecho.slice(trecho.indexOf("} catch"), trecho.indexOf("} catch") + 300);
    expect(catchBloco).not.toContain("setCanalDeEmail");
  });

  it("as duas telas leem a MESMA capacidade — não há segunda leitura que diverge", () => {
    const operacao = readFileSync(
      path.join(process.cwd(), "app/agency/dashboard/operacao/page.tsx"),
      "utf8",
    );
    expect(operacao).toContain('c.id === "avisar-cliente-por-email"');
  });
});

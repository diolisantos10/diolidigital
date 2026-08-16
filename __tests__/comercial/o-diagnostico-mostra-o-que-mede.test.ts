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
import { seloDoGrupo } from "@/lib/agency/diagnostico/selo-do-grupo";

const VAZIO = {
  clients: [], projects: [], deliverables: [], materialRequests: [],
  strategyRooms: [], persisted: false,
} as never;

/** O MESMO recorte que a tela faz: `CHECK_GROUP_ORDER.map().filter()`.
 *
 *  ⚠️ Isto REIMPLEMENTA o recorte, e por isso não basta sozinho: apagar o bloco
 *  de render da tela deixaria tudo verde aqui. O teste
 *  `a tela desenha pelo `CHECK_GROUP_ORDER`` (mais abaixo) é a metade que
 *  afirma que a tela usa a regra — sem ele esta função é fachada. */
function oQueATelaDesenha(entrada: object) {
  const { checks } = runSystemDoctor({ ...(VAZIO as object), ...entrada } as never);
  return CHECK_GROUP_ORDER.flatMap((grupo) => checks.filter((c) => c.group === grupo));
}

/** As entradas que produzem estados DIFERENTES do Doctor. O teste de grupo
 *  órfão rodava só com `VAZIO` — e grupo condicional só aparece com a entrada
 *  que o liga, então o órfão de amanhã pode nascer justamente fora do vazio. */
const ENTRADAS = [
  ["agência zerada", {}],
  ["com sincronização de dados", { dbSyncStatus: { clients: "db", projects: "db" } }],
  ["com canal de e-mail LIGADO", { canalDeEmail: { ligado: true, resumo: "ok", comoResolver: "" } }],
  ["com canal de e-mail DESLIGADO", { canalDeEmail: { ligado: false, resumo: "off", comoResolver: "x" } }],
  ["com sessão e banco vivos", { dbAvailable: true, authMode: "real", sessionActive: true, sessionUser: "a@b.c" }],
  ["com tudo junto", {
    dbSyncStatus: { clients: "db", projects: "db" },
    canalDeEmail: { ligado: true, resumo: "ok", comoResolver: "" },
    dbAvailable: true, authMode: "real", sessionActive: true,
  }],
] as const;

describe("nenhuma checagem fica fora da tela", () => {
  // ── A CLASSE INTEIRA DO DEFEITO ───────────────────────────────────────────
  it.each(ENTRADAS)("todo grupo EMITIDO está na ordem de renderização — %s", (_caso, entrada) => {
    const { checks } = runSystemDoctor({ ...(VAZIO as object), ...(entrada as object) } as never);
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

// ═══════════════════════════════════════════════════════════════════════════
// ⛔ "NÃO SEI" PINTADO DE VERDE — o bloqueante D4
// ═══════════════════════════════════════════════════════════════════════════
//
// `app/agency/settings/page.tsx` calculava a cor do cabeçalho do grupo com
// `fail` e `warn` apenas — senão, "pass". Com o `fetch` de `/api/capacidades`
// falhando, a checagem do canal de e-mail vira `info` ("não consegui conferir")
// e o grupo aparecia com **bolinha verde e selo "0 ok"**, colapsado. A frase
// que explica que ninguém mediu ficava atrás de um clique, sob um verde.
//
// O portão anterior não pegava isso: ele só conferia que o `catch` do fetch não
// chamava `setCanalDeEmail`. Confere a ENTRADA da informação, não a SAÍDA na
// tela — e o defeito estava na saída.

describe("o diagnóstico não pinta 'não consegui conferir' de verde", () => {
  // ── METADE 1: O ESTADO DO BLOQUEANTE, REPRODUZIDO ─────────────────────────
  it("🔴 grupo com só `info` NÃO é verde, e o selo diz que não foi conferido", () => {
    const selo = seloDoGrupo([{ status: "info" }]);
    expect(selo.status, "'não sei' voltou a ser pintado de aprovado").toBe("info");
    expect(selo.status).not.toBe("pass");
    expect(selo.selos.map((s) => s.texto)).toEqual(["1 não conferido"]);
    // O selo "0 ok" — a frase exata do defeito — não pode existir.
    expect(selo.selos.some((s) => s.texto.startsWith("0 "))).toBe(false);
  });

  it("🔴 o estado EXATO da tela quando o fetch falha: e-mail `info`, grupo não verde", () => {
    const { checks } = runSystemDoctor({ ...(VAZIO as object), canalDeEmail: undefined } as never);
    const doGrupo = checks.filter((c) => c.group === "Comunicação com o cliente");
    expect(doGrupo.length).toBeGreaterThan(0);
    expect(doGrupo.some((c) => c.id === "aviso-por-email-ao-cliente" && c.status === "info")).toBe(true);
    expect(seloDoGrupo(doGrupo).status).not.toBe("pass");
  });

  it("`info` misturado com `pass` continua fora do verde, e os DOIS selos aparecem", () => {
    const selo = seloDoGrupo([{ status: "pass" }, { status: "pass" }, { status: "info" }]);
    expect(selo.status).toBe("info");
    expect(selo.selos.map((s) => s.texto)).toEqual(["1 não conferido", "2 ok"]);
  });

  // ── METADE 2: O VERDE CONTINUA EXISTINDO ONDE ELE É VERDADE ───────────────
  it("grupo medido e são continua VERDE — a regra não achata a tela", () => {
    const selo = seloDoGrupo([{ status: "pass" }, { status: "pass" }]);
    expect(selo.status).toBe("pass");
    expect(selo.selos).toEqual([{ tom: "pass", texto: "2 ok" }]);
  });

  it("falha e atenção continuam vencendo o 'não conferido'", () => {
    expect(seloDoGrupo([{ status: "fail" }, { status: "info" }]).status).toBe("fail");
    expect(seloDoGrupo([{ status: "warning" }, { status: "info" }]).status).toBe("warning");
  });

  it("grupo vazio não inventa selo nenhum", () => {
    expect(seloDoGrupo([]).selos).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// A TELA USA A REGRA — a metade que o portão anterior não tinha
// ═══════════════════════════════════════════════════════════════════════════
//
// `qualidade`: *"o teste REIMPLEMENTA o filtro em vez de afirmar que a tela
// chama `CHECK_GROUP_ORDER.map` — apagar o bloco de render deixa o teste
// verde."* Estava certa. Estas asserções são sobre a TELA, não sobre uma cópia
// da lógica dela.

describe("a tela de diagnóstico usa as regras, não uma cópia delas", () => {
  const pagina = readFileSync(path.join(process.cwd(), "app/agency/settings/page.tsx"), "utf8");

  it("desenha os grupos por `CHECK_GROUP_ORDER.map` — apagar o bloco quebra aqui", () => {
    expect(pagina).toContain("CHECK_GROUP_ORDER.map(");
    // E o resultado é realmente percorrido no JSX.
    expect(pagina).toContain("grouped.map(");
  });

  it("a cor e o selo do grupo saem de `seloDoGrupo`, não de um ternário local", () => {
    expect(pagina).toContain('import { seloDoGrupo } from "@/lib/agency/diagnostico/selo-do-grupo"');
    expect(pagina).toContain("const selo = seloDoGrupo(gChecks)");
    expect(pagina).toContain("selo.selos.map(");
    // O ternário do bloqueante não voltou.
    expect(
      pagina.includes('groupWarn > 0 ? "warning" : "pass"'),
      "o ternário que pintava `info` de verde voltou para a tela",
    ).toBe(false);
  });

  it("o resumo do topo declara o que NÃO foi conferido — não fica atrás de um clique", () => {
    expect(pagina).toContain("{info > 0 && (");
    expect(pagina).toContain("NÃO conseguiu conferir");
  });
});

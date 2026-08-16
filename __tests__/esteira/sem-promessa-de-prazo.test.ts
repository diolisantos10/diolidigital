// A PROMESSA QUE NINGUÉM AUTORIZOU — e por que ela precisa de trava, não de aviso.
//
// 16/08/2026, o CEO no piloto ao vivo, com todas as letras:
//   *"em relação à confirmação de promessa, de orçamento em um dia, não
//    autorizei nada disso."*
//
// A promessa já tinha sido removida do TEXTO DO ORÇAMENTO naquele mesmo dia, e
// aquele conserto ganhou teste (`orcamento-do-briefing.test.ts`). Mas o mesmo
// texto vivia em outras TRÊS caixas que ninguém abriu junto:
//   • a tela de confirmação do briefing  ("em até 1 dia útil")
//   • o e-mail de confirmação            ("em até 1 dia útil")
//   • a confirmação de pedido da vitrine ("em até 2h úteis")
//
// É o defeito recorrente desta casa: conserta-se a caixa que apareceu no print
// e esquece-se a irmã dela. Um teste que guarda UMA tela não protege as outras
// três — por isso este varre a SUPERFÍCIE INTEIRA voltada ao cliente, e não um
// arquivo. Promessa nova entra no repositório reprovando, não passando.
//
// ── O QUE NÃO É PROMESSA, E POR QUE FICA ───────────────────────────────────
// A lista de dispensas abaixo é FECHADA e cada linha diz o motivo. Prazo não é
// proibido nesta casa; prazo que a casa promete SEM ter sido autorizada é. As
// três diferenças que importam:
//   • prazo de ENTREGA de produto pago (o catálogo da vitrine) é a oferta —
//     tirá-lo é decisão comercial do CEO, não conserto de defeito;
//   • prazo que a LEI obriga a declarar (LGPD) não é promessa nossa;
//   • prazo que corre para O CLIENTE (ele aprova em N dias) não é dívida nossa.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/** As superfícies onde o texto chega a quem NÃO trabalha aqui. */
const SUPERFICIES_DO_CLIENTE = [
  "app/briefing",
  "app/vitrine",
  "app/portal",
  "app/planos",
  "app/contato",
  "app/privacidade",
  "app/termos",
  "app/page.tsx",
  "lib/email",
  "components/agency/portal",
  "components/legal",
  "lib/agency/esteira/orcamento-do-briefing.ts",
];

/**
 * Dispensas — arquivo → por quê. Lista FECHADA: acrescentar uma linha aqui é
 * uma decisão que alguém precisa justificar por escrito, que é exatamente o
 * degrau que faltava em 16/08.
 */
const DISPENSAS: Record<string, string> = {
  "components/legal/PaginaLegal.tsx":
    "os 15 dias da LGPD são prazo que a LEI nos impõe declarar — não é promessa comercial nossa",
  "app/privacidade/page.tsx":
    "mesmo caso: os 15 dias de resposta a pedido de titular saem da LGPD, não de escolha nossa — tirá-los nos deixaria FORA da lei, não mais honestos",
  "app/planos/page.tsx":
    "'você aprova em até 2 dias úteis' é prazo do CLIENTE para nos responder, não nosso para entregar",
};

/** Como uma promessa de prazo se parece em português, escrita para gente. */
const PROMESSA = new RegExp(
  String.raw`\b(em at[ée]|dentro de|no prazo de|em)\s+` +
    String.raw`(\d+|um|uma|dois|duas|tr[êe]s)\s*` +
    String.raw`(dias?\s+[úu]t(?:eis|il)|dias?|horas?|h\b|min\b)`,
  "i",
);

/** A forma curta que o piloto usou de verdade: "2h úteis", "24h". */
const PROMESSA_CURTA = /\b\d+\s*h\s+[úu]t(?:eis|il)\b/i;

function arquivosDe(alvo: string): string[] {
  const caminho = join(process.cwd(), alvo);
  let s;
  try {
    s = statSync(caminho);
  } catch {
    return []; // superfície que ainda não existe não reprova nada
  }
  if (s.isFile()) return [alvo];
  return readdirSync(caminho).flatMap((n) => arquivosDe(join(alvo, n)));
}

const ALVOS = SUPERFICIES_DO_CLIENTE.flatMap(arquivosDe).filter(
  (f) => /\.(ts|tsx)$/.test(f) && !f.endsWith(".d.ts"),
);

/**
 * Apaga COMENTÁRIO antes de varrer — trocando cada um por linhas em branco,
 * para o número da linha continuar batendo com o arquivo real.
 *
 * Por que comentário sai da varredura: é nele que esta casa guarda a memória do
 * incidente, INCLUSIVE a citação literal da promessa que foi removida ("em até
 * 1 dia útil") e a fala do CEO ("orçamento em um dia"). Proibir a frase no
 * comentário apagaria justamente o porquê da regra — e regra sem porquê é a
 * primeira a ser desfeita por alguém que não estava aqui em 16/08.
 */
function semComentarios(fonte: string): string {
  const embranquecer = (t: string) => t.replace(/[^\n]/g, " ");
  return fonte
    .replace(/\/\*[\s\S]*?\*\//g, embranquecer)   // /* ... */ e /** ... */
    .replace(/<!--[\s\S]*?-->/g, embranquecer)     // <!-- ... --> (e-mail HTML)
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, antes) => antes + embranquecer(m.slice(antes.length)));
}

describe("nenhuma promessa de prazo em texto voltado ao cliente — ordem do CEO em 16/08", () => {
  // ✅ A METADE QUE PROVA QUE A VARREDURA ENXERGA ALGUMA COISA.
  // Varredura que não encontra arquivo passa sempre, e passar sempre é o
  // mesmo que não existir. Já aconteceu nesta casa: gate que declarava
  // proteção e não rodava.
  it("a varredura realmente alcança as telas do cliente", () => {
    expect(ALVOS.length).toBeGreaterThan(5);
    expect(ALVOS).toContain("app/briefing/page.tsx");
    expect(ALVOS).toContain("lib/email/templates.ts");
    expect(ALVOS).toContain("app/vitrine/sucesso/page.tsx");
  });

  // ✅ A METADE QUE PROVA QUE A REGRA PEGA O TEXTO QUE ESTAVA NO AR EM 16/08.
  // Sem isto, um regex quebrado passaria por proteção para sempre.
  it("reconhece as promessas exatas que o CEO reprovou", () => {
    expect(PROMESSA.test("Entramos em contato pelo canal informado em até 1 dia útil")).toBe(true);
    expect(PROMESSA.test("Entramos em contato por este e-mail em até 1 dia útil")).toBe(true);
    expect(PROMESSA_CURTA.test("entrar em contato pelo WhatsApp em até 2h úteis")).toBe(true);
    expect(PROMESSA.test("retorno em 24 horas")).toBe(true);
    expect(PROMESSA.test("resposta em até 3 dias")).toBe(true);
  });

  // ✅ E QUE NÃO INVENTA PROBLEMA no texto que passou a valer.
  it("não acusa o texto honesto que ficou no lugar", () => {
    expect(PROMESSA.test("Entramos em contato pelo canal informado")).toBe(false);
    expect(PROMESSA.test("Nossa equipe analisa o escopo enviado")).toBe(false);
    expect(PROMESSA.test("Nossa equipe vai entrar em contato pelo WhatsApp para iniciar a produção")).toBe(false);
  });

  // ⛔ A TRAVA.
  it.each(ALVOS.filter((f) => !(f in DISPENSAS)))("%s não promete prazo ao cliente", (arquivo) => {
    const fonte = semComentarios(readFileSync(join(process.cwd(), arquivo), "utf8"));

    const suspeitas = fonte
      .split("\n")
      .map((linha, i) => ({ linha: linha.trim(), n: i + 1 }))
      .filter(({ linha }) => PROMESSA.test(linha) || PROMESSA_CURTA.test(linha));

    expect(
      suspeitas,
      `${arquivo} promete prazo ao cliente. O CEO não autorizou prazo nenhum em 16/08/2026 ` +
        `("não autorizei nada disso"). Diga o que é verdade — que a equipe analisa e retorna ` +
        `pelo canal informado — sem número de dias. Se este prazo for legítimo (obrigação legal, ` +
        `entrega de produto pago, prazo do próprio cliente), acrescente o arquivo a DISPENSAS ` +
        `com o motivo por escrito.\n` +
        suspeitas.map((s) => `  linha ${s.n}: ${s.linha}`).join("\n"),
    ).toEqual([]);
  });
});

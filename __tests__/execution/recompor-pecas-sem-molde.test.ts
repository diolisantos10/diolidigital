// A recomposição das peças que nasceram sem a camada de marca.
//
// Cada trava aqui tem AS DUAS METADES: prova que barra o problema plantado E
// que não inventa problema no caso limpo. Uma varredura que reprova tudo é tão
// inútil quanto uma que aprova tudo.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const RAIZ = process.cwd();
const ARTES = fs.readFileSync(path.join(RAIZ, "lib/agency/execution/artes.ts"), "utf8");
const ROTA = fs.readFileSync(path.join(RAIZ, "app/api/admin/recompor-pecas/route.ts"), "utf8");

/** O corpo de `recomporPecasSemMolde`, do cabeçalho até a função seguinte. */
function corpoDaRecomposicao(): string {
  const i = ARTES.indexOf("export async function recomporPecasSemMolde");
  expect(i, "recomporPecasSemMolde sumiu de artes.ts").toBeGreaterThan(-1);
  const fim = ARTES.indexOf("export async function reRenderizarTexto", i);
  return ARTES.slice(i, fim > i ? fim : undefined);
}

describe("recompor NÃO pode virar uma segunda fatura", () => {
  const corpo = corpoDaRecomposicao();

  it("metade 1 — não chama o gerador de imagem, nem baixa imagem nova", () => {
    for (const pago of ["generateDesign", "baixarImagem", "montarCarrossel"]) {
      expect(corpo.includes(pago), `a recomposição passou a usar ${pago} — isso custa por peça`).toBe(false);
    }
  });

  it("metade 2 — ela lê a foto JÁ PAGA do armazenamento (`fundo-<postId>.png`)", () => {
    expect(corpo.includes("nomeDoFundo(post.id)")).toBe(true);
    expect(corpo.includes("lerArquivo(")).toBe(true);
  });

  it("sem o fundo guardado, a peça é declarada e NÃO é regerada", () => {
    // Regerar é a decisão cara, e ela não é desta função. O caminho tem de ser
    // `semFundo` — um relato — e nunca uma chamada paga escondida.
    expect(corpo.includes("saida.semFundo.push")).toBe(true);
  });
});

describe("as travas continuam de pé dentro do conserto", () => {
  const corpo = corpoDaRecomposicao();

  it("pilar bloqueado não é recomposto — não se dá acabamento no que não pode sair", () => {
    expect(corpo.includes("conferirPilar(post.pillar)")).toBe(true);
    expect(corpo.includes("saida.bloqueadas.push")).toBe(true);
  });

  it("sem navegador, a passada para ANTES de tocar em qualquer peça", () => {
    const guarda = corpo.indexOf("renderizadorDisponivel");
    const primeiraEscrita = corpo.indexOf("prisma.socialPost.update");
    expect(guarda).toBeGreaterThan(-1);
    expect(guarda).toBeLessThan(primeiraEscrita);
    expect(corpo.includes("semRenderizador")).toBe(true);
  });

  it("o texto continua saindo da legenda JÁ AUDITADA — nada é inventado", () => {
    expect(corpo.includes("fonteAuditada: post.caption")).toBe(true);
  });

  it("nada é publicado: nenhuma chamada a plataforma sai daqui", () => {
    for (const plataforma of ["publicar", "graph", "facebook.com", "googleapis"]) {
      expect(corpo.toLowerCase().includes(plataforma), `${plataforma} apareceu na recomposição`).toBe(false);
    }
  });
});

describe("a peça só conta como recomposta se REALMENTE mudou", () => {
  const corpo = corpoDaRecomposicao();

  it("bytes idênticos não viram sucesso — seria trocar o arquivo por ele mesmo", () => {
    // `comporComMolde` devolve `ok: true` com a FOTO CRUA quando o texto não
    // coube ou a trava reprovou a letra. Contar isso como conserto deixaria a
    // peça sem marca E sem o aviso de que continua sem marca.
    expect(corpo.includes(".equals(")).toBe(true);
    const iMudou = corpo.indexOf("const mudou");
    const iContou = corpo.indexOf("saida.recompostas.push");
    expect(iMudou).toBeGreaterThan(-1);
    expect(iMudou).toBeLessThan(iContou);
  });

  it("e o motivo desatualizado é reescrito, para a próxima passada não procurar no lugar errado", () => {
    expect(corpo.includes("lastError: composta.nota")).toBe(true);
  });
});

describe("a rota que dispara é fechada, e escreve com o verbo certo", () => {
  it("metade 1 — sem CRON_SECRET responde 503; com segredo errado, 401", () => {
    expect(/status:\s*503/.test(ROTA)).toBe(true);
    expect(/status:\s*401/.test(ROTA)).toBe(true);
    expect(ROTA.includes("segredoConfere")).toBe(true);
  });

  it("metade 2 — é POST, nunca GET: isto escreve", () => {
    expect(/export\s+async\s+function\s+POST\b/.test(ROTA)).toBe(true);
    expect(/export\s+(async\s+)?function\s+GET\b/.test(ROTA)).toBe(false);
  });

  it("tem teto por chamada, e o parâmetro do chamador não fura o teto", () => {
    expect(ROTA.includes("Math.min(pedido, TETO)")).toBe(true);
  });
});

describe("o despertador NÃO chama a recomposição", () => {
  it("conserto de estrago datado é passada à mão, não rotina de 5 em 5 minutos", () => {
    const despertador = fs.readFileSync(path.join(RAIZ, "lib/agency/despertador.ts"), "utf8");
    expect(
      despertador.includes("recomporPecasSemMolde"),
      "a recomposição entrou no despertador — vira máquina reescrevendo arte entregue, sem ninguém olhando",
    ).toBe(false);
  });
});

// ── O MODO `marca-nova` (09/08/2026) ────────────────────────────────────────
//
// A peça composta CERTA, só que antes de o logo do cliente existir. Ela não tem
// defeito em `lastError` — o modo antigo nunca a acharia. Nasceu de a porta de
// upload recusar SVG: os logos do CityJobs entraram só depois que ela abriu.

/** O corpo de `pecasComMarcaMaisNovaQueAArte`. */
function corpoDaSelecaoPorMarca(): string {
  const i = ARTES.indexOf("async function pecasComMarcaMaisNovaQueAArte");
  expect(i, "pecasComMarcaMaisNovaQueAArte sumiu de artes.ts").toBeGreaterThan(-1);
  const fim = ARTES.indexOf("export async function recomporPecas(", i);
  return ARTES.slice(i, fim > i ? fim : undefined);
}

describe("modo marca-nova — alcança a peça que nasceu antes do logo", () => {
  const selecao = corpoDaSelecaoPorMarca();

  it("compara a data da ARTE com a data do MATERIAL — é isso que define 'velha'", () => {
    expect(selecao.includes("papelConfirmadoEm")).toBe(true);
    expect(selecao.includes("arte.createdAt >= marca")).toBe(true);
  });

  it("metade 1 — peça cuja arte é MAIS NOVA que o material é pulada", () => {
    // Sem este `continue`, a passada reescreveria peça que já tem a marca —
    // gastando rasterização e mexendo em trabalho entregue sem motivo.
    expect(selecao.includes("if (arte.createdAt >= marca) continue;")).toBe(true);
  });

  it("metade 2 — peça SEM arte gravada é pulada, não recomposta no escuro", () => {
    // Guardrail 1: ausência de informação não é informação. Sem o arquivo não
    // há como saber se a peça é velha, e o palpite reescreveria peça boa.
    expect(selecao.includes("if (!arte) continue;")).toBe(true);
  });

  it("não passa a custar: o modo novo só troca a SELEÇÃO, não o laço", () => {
    for (const pago of ["generateDesign", "baixarImagem", "montarCarrossel"]) {
      expect(selecao.includes(pago), `a seleção passou a usar ${pago} — isso custa`).toBe(false);
    }
  });

  it("o teto continua valendo dentro da seleção", () => {
    expect(selecao.includes("if (velhas.length >= limite) break;")).toBe(true);
  });
});

describe("a rota escolhe o modo, e o padrão é o comportamento antigo", () => {
  it("só `marca-nova` liga o modo novo — qualquer outra coisa cai no antigo", () => {
    expect(ROTA.includes('bruto === "marca-nova" ? "marca-nova" : "sem-molde"')).toBe(true);
  });

  it("o modo escolhido volta na resposta — quem chamou não fica adivinhando", () => {
    expect(ROTA.includes("modo,")).toBe(true);
  });

  it("o teto por chamada continua de pé nos dois modos", () => {
    expect(ROTA.includes("Math.min(pedido, TETO)")).toBe(true);
  });
});

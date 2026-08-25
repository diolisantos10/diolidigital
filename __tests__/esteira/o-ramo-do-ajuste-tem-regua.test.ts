// O RAMO DO AJUSTE TEM RÉGUA — `refazer-a-arte-do-ajuste.ts`, peça por peça.
//
// ═══════════════════════════════════════════════════════════════════════════
// POR QUE ESTE ARQUIVO EXISTE (Auditor, 5ª rodada, 25/08/2026)
// ═══════════════════════════════════════════════════════════════════════════
//
// `refazer-a-arte-do-ajuste.ts` nasceu com **228 linhas novas e nenhum teste**.
// Só o caminho feliz do e2e o atravessava. E foi exatamente por esse ramo sem
// régua que o Auditor achou os dois defeitos que reprovaram o item F:
//
//   • três das quatro peças ficavam presas em `revision_requested` depois do
//     ajuste — inagendáveis, invisíveis, e o cliente já as tinha pago;
//   • quando a arte não saía, o cliente lia a LEGENDA NOVA sobre a IMAGEM
//     VELHA, e nada na tela dele dizia isso.
//
// Código sem régua não é código testado por acidente: é o lugar onde o defeito
// mora, porque é o único lugar onde ele pode morar sem ser visto.
//
// ═══════════════════════════════════════════════════════════════════════════
// O QUE É DUBLADO AQUI, E POR QUÊ SÓ ISSO
// ═══════════════════════════════════════════════════════════════════════════
//
// Uma coisa: `produzirArtesPendentes` — o laço de arte, que compra imagem paga
// e sobe Chromium. Ele tem réguas próprias e o e2e do Story o exercita de
// verdade, com pixel medido. O que está sob teste AQUI é o que sobra quando
// ele já respondeu: a MIRA, a FIAÇÃO do texto novo, o veredito "o arquivo
// mudou?" e — o que faltava — o ESTADO e o AVISO NA PEÇA.
//
// O banco é de VERDADE (SQLite, tabelas reais). Estado é o objeto do teste:
// um dublê de Prisma aqui deixaria o teste concordar com o defeito medido.

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { execSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";

const DB_PATH = vi.hoisted(() => {
  const caminho = `${process.cwd()}/prisma/ajuste-arte.db`;
  process.env.DATABASE_URL = `file:${caminho}`;
  return caminho;
});

/**
 * O LAÇO DE ARTE, DUBLADO — e o dublê ESCREVE NO BANCO.
 *
 * Um dublê que só devolve `{ produzidas: 1 }` sem tocar em `mediaUrl` faria o
 * módulo concluir "nada mudou" e o teste do caminho feliz nunca ficaria verde.
 * Pior: encenaria um laço que mente, e o módulo sob teste existe justamente
 * porque a casa CONFIOU no relato do laço e devolveu 200 com 0 de 4 arquivos
 * trocados. O dublê faz o que o laço real faz — grava o arquivo novo — para
 * que o veredito por comparação de `mediaUrl` seja exercitado de verdade.
 */
const comportamentoDoLaco = vi.hoisted(() => ({
  modo: "sucesso" as "sucesso" | "falha" | "sem-renderizador",
}));

vi.mock("@/lib/agency/execution/artes", () => ({
  produzirArtesPendentes: vi.fn(async ({ refazer }: { refazer?: string[] }) => {
    const alvos = refazer ?? [];
    const { prisma: db } = await import("@/lib/db/client");
    if (comportamentoDoLaco.modo === "sem-renderizador") {
      return {
        produzidas: 0, falhas: [], desistiram: [], semOrcamento: [], semPagamento: [],
        semRenderizador: "o navegador que desenha a peça não está disponível nesta máquina",
      };
    }
    if (comportamentoDoLaco.modo === "falha") {
      return {
        produzidas: 0, desistiram: [], semOrcamento: [], semPagamento: [],
        falhas: alvos.map((id) => ({ postId: id, erro: "o gerador de imagem recusou o pedido" })),
      };
    }
    for (const id of alvos) {
      await db.socialPost.update({
        where: { id },
        data: { mediaUrl: `/api/media/nova-${id}-${Date.now()}` },
      });
    }
    return { produzidas: alvos.length, falhas: [], desistiram: [], semOrcamento: [], semPagamento: [] };
  }),
}));

import { prisma } from "@/lib/db/client";
import {
  refazerArteDoAjuste,
  AVISO_DA_ARTE_QUE_NAO_SAIU,
} from "@/lib/agency/esteira/refazer-a-arte-do-ajuste";
import type { PecaDoEspecialista } from "@/lib/agency/produtos/story-instagram-v1";

let workspaceId = "";
let clientId = "";

/**
 * As quatro peças do cartão, na ordem em que ele as mostra — E NO ESTADO EM QUE
 * A ROTA DO PORTAL AS DEIXA.
 *
 * ⚠️ Repare em `emRevisao`, e não pule esta linha: a primeira versão deste
 * fixture punha as QUATRO em `revision_requested`, que era o comportamento
 * ERRADO da rota — o defeito medido pela 5ª auditoria. Um fixture que encena o
 * defeito faz o teste concordar com ele.
 *
 * A rota carimba `revision_requested` só na peça APONTADA
 * (`pecasApontadasPeloAjuste`). As outras ficam como estavam: decidíveis.
 */
async function quatroPecasDoCartao(emRevisao: number[]): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 1; i <= 4; i++) {
    const p = await prisma.socialPost.create({
      data: {
        workspaceId, clientId,
        caption: `legenda velha ${i}`,
        artDirection: `direção velha ${i}`,
        format: "story",
        visibility: "compartilhado",
        status: emRevisao.includes(i) ? "revision_requested" : "draft",
        mediaUrl: `/api/media/velha-${i}`,
      },
    });
    ids.push(p.id);
  }
  return ids;
}

/** O cartão como a rota o deixa quando o cliente apontou a TERCEIRA. */
const cartaoComATerceiraEmRevisao = () => quatroPecasDoCartao([3]);

/** O cartão como a rota o deixa quando ele não apontou nenhuma. */
const cartaoInteiroEmRevisao = () => quatroPecasDoCartao([1, 2, 3, 4]);

function textoNovoDeQuatroPecas(): PecaDoEspecialista[] {
  return [1, 2, 3, 4].map((i) => ({
    titulo: `título ${i}`,
    legenda: i === 3 ? "legenda NOVA da terceira, mais clara" : `legenda velha ${i}`,
    pilar: null,
    direcaoDeArte: i === 3 ? "cena mais clara, luz de manhã" : null,
  })) as unknown as PecaDoEspecialista[];
}

beforeAll(async () => {
  if (existsSync(DB_PATH)) rmSync(DB_PATH);
  execSync("npx prisma db push --accept-data-loss", {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: `file:${DB_PATH}` },
    stdio: "pipe",
  });
  const ws = await prisma.agencyWorkspace.create({ data: { name: "Dioli", slug: `ajuste-${Date.now()}` } });
  workspaceId = ws.id;
  const c = await prisma.client.create({ data: { workspaceId, name: "Padaria da Régua" } });
  clientId = c.id;
});

beforeEach(async () => {
  comportamentoDoLaco.modo = "sucesso";
  await prisma.socialPost.deleteMany({});
});

afterAll(async () => {
  await prisma.$disconnect();
  if (existsSync(DB_PATH)) rmSync(DB_PATH);
});

// ═══════════════════════════════════════════════════════════════════════════
describe("a mira alcança o ARQUIVO e o ESTADO — não um sem o outro", () => {
// ═══════════════════════════════════════════════════════════════════════════

  it("🔴 O DEFEITO DA 5ª AUDITORIA: as três peças não apontadas NÃO podem ficar presas", async () => {
    // ── O QUE FOI MEDIDO, CONTRA CONTROLE ────────────────────────────────
    //
    //             peça 1                peça 2                peça 3      peça 4
    //   ajuste:   revision_requested    revision_requested    scheduled   revision_requested
    //   controle: scheduled             scheduled             scheduled   scheduled
    //
    // `ESTADOS_PROMOVIVEIS` (esteira/publicacao.ts) é `["draft","approved"]` e
    // NÃO inclui `revision_requested` — de propósito, porque agendar uma peça
    // em revisão seria publicar o que o cliente recusou. Certíssimo. O erro não
    // estava na trava: estava em quem carimbava o estado em TODAS as peças.
    //
    // Três quartos do que o cliente pagou e aprovou nunca entravam na fila.
    const ids = await cartaoComATerceiraEmRevisao();

    const r = await refazerArteDoAjuste({
      postIds: ids,
      pecasNovas: textoNovoDeQuatroPecas(),
      clientId,
      comentario: "A terceira peça está escura demais, quero ela mais clara.",
    });

    expect(r.mira?.indice, "a mira lê a TERCEIRA").toBe(3);
    expect(r.refeitas.map((x) => x.postId), "só a terceira ganha arquivo novo").toEqual([ids[2]]);
    expect(r.preservadas.sort(), "as outras três não são tocadas")
      .toEqual([ids[0]!, ids[1]!, ids[3]!].sort());

    const depois = await prisma.socialPost.findMany({ where: { id: { in: ids } } });
    const porId = new Map(depois.map((p) => [p.id, p]));

    // A PEÇA APONTADA volta a ser decidível — o estado deixou de ser verdade
    // no instante em que existiu uma arte que ele ainda não viu.
    expect(porId.get(ids[2]!)!.status, "a peça refeita volta a ser decidível").toBe("draft");

    // ── E AS OUTRAS TRÊS: A RÉGUA QUE FALTAVA ────────────────────────────
    //
    // `ESTADOS_PROMOVIVEIS` é `["draft","approved"]`. Qualquer outro estado
    // aqui é a peça sumindo da fila de entrega — e é isso, e não a arte, que
    // reprovou o item F.
    const PROMOVIVEIS = ["draft", "approved"];
    for (const i of [0, 1, 3]) {
      const p = porId.get(ids[i]!)!;
      expect(
        PROMOVIVEIS.includes(p.status),
        `a peça ${i + 1} não foi apontada e ficou em '${p.status}', que a fila de entrega não lê — ` +
        "é trabalho pago e aprovado que nunca chega ao cliente, e ninguém fica vermelho",
      ).toBe(true);
      expect(p.mediaUrl, `e o arquivo da peça ${i + 1} continua o mesmo`).toBe(`/api/media/velha-${i + 1}`);
      expect(p.caption, `e o texto da peça ${i + 1} continua o mesmo`).toBe(`legenda velha ${i + 1}`);
    }
  });

  it("A FIAÇÃO leva o texto NOVO para a peça apontada — e só para ela", async () => {
    // Sem isto o laço de arte redesenharia a peça com a legenda VELHA: imagem
    // nova, texto que o cliente já recusou. Pior que não refazer.
    const ids = await cartaoComATerceiraEmRevisao();
    await refazerArteDoAjuste({
      postIds: ids, pecasNovas: textoNovoDeQuatroPecas(), clientId,
      comentario: "a peça 3 está escura",
    });
    const terceira = await prisma.socialPost.findUniqueOrThrow({ where: { id: ids[2]! } });
    expect(terceira.caption).toBe("legenda NOVA da terceira, mais clara");
    expect(terceira.artDirection).toBe("cena mais clara, luz de manhã");
  });

  it("SEM MIRA o cliente reclamou de tudo — e tudo volta, que é o conservador correto", async () => {
    const ids = await cartaoInteiroEmRevisao();
    const r = await refazerArteDoAjuste({
      postIds: ids, pecasNovas: textoNovoDeQuatroPecas(), clientId,
      comentario: "está tudo escuro demais",
    });
    expect(r.mira, "silêncio não é mira em nada (guardrail 1)").toBeNull();
    expect(r.refeitas.length).toBe(4);
    expect(r.preservadas).toEqual([]);
    const depois = await prisma.socialPost.findMany({ where: { id: { in: ids } } });
    for (const p of depois) expect(p.status).toBe("draft");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("quando a arte NÃO sai, o cliente lê isso NA PEÇA", () => {
// ═══════════════════════════════════════════════════════════════════════════

  it("🟠 O DEFEITO DA 5ª AUDITORIA: legenda nova sobre imagem velha, e a tela calada", async () => {
    // O Auditor derrubou o gerador durante o ajuste. A casa se portou bem por
    // dentro: o card não reabriu, a equipe foi escalada com dono e próxima
    // ação. Mas na tela do cliente a peça 3 exibia o TEXTO REFEITO sobre a
    // IMAGEM QUE ELE ACABARA DE RECUSAR, e ele varreu o HTML inteiro: ZERO
    // ocorrências de "não consegui", "não foi possível", "equipe", "erro",
    // "problema".
    //
    // Mesma classe do aviso "sem árbitro" que ficava na coluna e nunca virava
    // pixel. A frase honesta existia — na aba de mensagens e no log.
    comportamentoDoLaco.modo = "falha";
    const ids = await cartaoComATerceiraEmRevisao();

    const r = await refazerArteDoAjuste({
      postIds: ids, pecasNovas: textoNovoDeQuatroPecas(), clientId,
      comentario: "A terceira peça está escura demais.",
    });

    expect(r.refeitas, "nada foi refeito").toEqual([]);
    expect(r.motivo, "e a parada tem motivo, dono e próxima ação").toBeTruthy();
    expect(r.motivo).toMatch(/Dono:/);
    expect(r.motivo).toMatch(/Próxima ação:/);

    const terceira = await prisma.socialPost.findUniqueOrThrow({ where: { id: ids[2]! } });

    // A ARTE VELHA FICA — nada foi apagado.
    expect(terceira.mediaUrl, "a arte anterior continua de pé").toBe("/api/media/velha-3");

    // ── A RÉGUA QUE FALTAVA: A PEÇA CARREGA A FRASE ─────────────────────
    expect(
      terceira.avisoAoCliente,
      "a peça mostra o texto refeito sobre a imagem que ele recusou e não diz nada sobre isso",
    ).toBe(AVISO_DA_ARTE_QUE_NAO_SAIU);

    // E ela diz as três coisas que o critério F exige, nas palavras dele.
    expect(terceira.avisoAoCliente).toMatch(/não consegui/i);
    expect(terceira.avisoAoCliente, "dono").toMatch(/equipe/i);
    expect(terceira.avisoAoCliente, "próxima ação").toMatch(/assim que a imagem nova ficar pronta/i);

    // A peça continua INAGENDÁVEL — a trava fica de pé onde ela protege.
    expect(terceira.status, "arte que não mudou não pode virar decidível").toBe("revision_requested");

    // E as peças que ele NÃO apontou não ganham aviso de uma parada que não é delas.
    for (const i of [0, 1, 3]) {
      const p = await prisma.socialPost.findUniqueOrThrow({ where: { id: ids[i]! } });
      expect(p.avisoAoCliente, `a peça ${i + 1} não está parada e não pode alarmar`).toBeNull();
    }
  });

  it("SEM RENDERIZADOR o motivo é o do renderizador, não um genérico", async () => {
    comportamentoDoLaco.modo = "sem-renderizador";
    const ids = await cartaoComATerceiraEmRevisao();
    const r = await refazerArteDoAjuste({
      postIds: ids, pecasNovas: textoNovoDeQuatroPecas(), clientId,
      comentario: "a peça 3 está escura",
    });
    expect(r.motivo).toMatch(/navegador que desenha a peça/);
  });

  it("O AVISO SAI quando o conserto chega — aviso que sobrevive vira ruído", async () => {
    comportamentoDoLaco.modo = "falha";
    const ids = await cartaoComATerceiraEmRevisao();
    const entrada = {
      postIds: ids, pecasNovas: textoNovoDeQuatroPecas(), clientId,
      comentario: "a peça 3 está escura",
    };
    await refazerArteDoAjuste(entrada);
    expect((await prisma.socialPost.findUniqueOrThrow({ where: { id: ids[2]! } })).avisoAoCliente).toBeTruthy();

    // A rodada seguinte dá certo.
    comportamentoDoLaco.modo = "sucesso";
    await refazerArteDoAjuste(entrada);
    const terceira = await prisma.socialPost.findUniqueOrThrow({ where: { id: ids[2]! } });
    expect(terceira.avisoAoCliente, "a parada acabou; o aviso tem de sair").toBeNull();
    expect(terceira.status).toBe("draft");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("fail-closed — o que este módulo se RECUSA a fazer", () => {
// ═══════════════════════════════════════════════════════════════════════════

  it("CONTAGEM QUE NÃO BATE não refaz nada, e diz por quê", async () => {
    // Escrever a legenda da peça 2 na imagem 3 é pior que não refazer: o
    // cliente recebe uma peça que ninguém pediu.
    const ids = await cartaoComATerceiraEmRevisao();
    const r = await refazerArteDoAjuste({
      postIds: ids,
      pecasNovas: textoNovoDeQuatroPecas().slice(0, 2),
      clientId,
      comentario: "a peça 3 está escura",
    });
    expect(r.refeitas).toEqual([]);
    expect(r.motivo).toMatch(/não sei qual texto pertence a qual imagem/);
    expect(r.motivo).toMatch(/Dono:/);

    const depois = await prisma.socialPost.findMany({ where: { id: { in: ids } } });
    for (const [i, p] of depois.entries()) {
      expect(p.mediaUrl, "nenhuma imagem foi tocada").toBe(`/api/media/velha-${i + 1}`);
      expect(p.caption, "e nenhum texto foi trocado").toBe(`legenda velha ${i + 1}`);
    }
  });

  it("ENTREGA SEM PEÇA VISUAL não é falha e não vira motivo", async () => {
    const r = await refazerArteDoAjuste({
      postIds: [], pecasNovas: [], clientId, comentario: "muda o tom do relatório",
    });
    expect(r).toEqual({ refeitas: [], preservadas: [], mira: null });
  });

  it("MIRA FORA DA FAIXA não é mira — 'a peça 7' num cartão de 4 refaz o conjunto", async () => {
    const ids = await cartaoComATerceiraEmRevisao();
    const r = await refazerArteDoAjuste({
      postIds: ids, pecasNovas: textoNovoDeQuatroPecas(), clientId,
      comentario: "a peça 7 está escura",
    });
    expect(r.mira, "mira errada é pior que mira nenhuma").toBeNull();
    expect(r.refeitas.length).toBe(4);
  });
});

// A TRAVA DA AMBIGUIDADE — o carrossel Frankenstein que quase foi gravado.
//
// ─── O que foi medido em produção em 07/08/2026, às 01h ─────────────────────
//
// Os 6 carrosséis da Foocci estavam CERTOS: as 6 telas v4 de 06/08 gravadas em
// `mediaUrlsJson`, na ordem 1..6, com a capa sendo a tela 1. Nada tinha se
// perdido.
//
// E o ensaio do backfill dizia `postsJaComTelas: 0` e propunha "reparar" os
// SEIS, acrescentando 5 telas a cada um — 66 telas para 6 carrosséis de 6.
//
// A causa: as telas ANTIGAS (v3) continuam nos Arquivos do cliente, e os dois
// jogos casam com o mesmo post pelo mesmo padrão de nome:
//
//     carrossel-c1-tela-2-v3.png              → "carrossel 1, tela 2"
//     foocci-carrossel1-tela2-v4-2026-08-06.png → "carrossel 1, tela 2"
//
// Como o que estava gravado (as 6 novas) era SUBCONJUNTO do plano de 11,
// `perderia` dava falso e o reparo aditivo parecia legítimo. Teria publicado,
// em nome de um cliente pagante, seis carrosséis alternando arte reprovada e
// arte aprovada — e com 11 telas, acima do teto de 10 da Meta.
//
// A regra que este arquivo trava: duas imagens diferentes disputando a MESMA
// posição não é incompletude, é AMBIGUIDADE. Incompletude o código resolve;
// ambiguidade é decisão de gente.
//
// As duas metades, como a casa exige:
//   ✅ o reparo LEGÍTIMO continua funcionando (plano sem disputa);
//   ⛔ o plano com disputa não grava nada, por nenhuma das três portas.

import { describe, it, expect } from "vitest";
import { decidirGravacao, postsParaGravar, planejarBackfill } from "@/lib/agency/media/backfill-carrossel.mjs";
import type { LinhaPost, LinhaAsset } from "@/lib/agency/media/backfill-carrossel.mjs";
import { avaliarPlano } from "@/app/api/admin/backfill-carrossel/plano";

/** As telas de um post, no formato do plano. */
function telas(pares: Array<[number, string]>) {
  return pares.map(([pos, assetId]) => ({
    pos, assetId, fileName: `${assetId}.png`, via: "nome-CnTm" as const,
  }));
}

// ─── 1. A decisão pura ──────────────────────────────────────────────────────

describe("decidirGravacao — duas artes para a mesma tela", () => {
  it("⛔ posição em duplicata vira `ambiguo`, e nomeia a posição em disputa", () => {
    const d = decidirGravacao({
      telas: telas([[1, "v4a"], [2, "v3b"], [2, "v4b"], [3, "v3c"], [3, "v4c"]]),
      telasAtuais: ["/api/media/v4a", "/api/media/v4b", "/api/media/v4c"],
    });

    expect(d.acao).toBe("ambiguo");
    expect(d.posicoesEmDisputa).toEqual([2, 3]);
  });

  it("⛔ a forma EXATA da produção: 6 telas certas gravadas, 11 no plano", () => {
    // O que o ensaio de produção devolveu para o carrossel 1 da Foocci.
    const plano = telas([
      [1, "v4t1"],
      [2, "v3t2"], [2, "v4t2"],
      [3, "v3t3"], [3, "v4t3"],
      [4, "v3t4"], [4, "v4t4"],
      [5, "v3t5"], [5, "v4t5"],
      [6, "v3t6"], [6, "v4t6"],
    ]);
    const gravadas = ["v4t1", "v4t2", "v4t3", "v4t4", "v4t5", "v4t6"]
      .map((id) => `/api/media/${id}`);

    const d = decidirGravacao({ telas: plano, telasAtuais: gravadas });

    // ANTES desta trava isto respondia "reparar", faltando 5 — e teria gravado
    // as 11 URLs, alternando v3 e v4.
    expect(d.acao).toBe("ambiguo");
    expect(d.posicoesEmDisputa).toEqual([2, 3, 4, 5, 6]);
  });

  it("⛔ nem `--force` sobrescreve um plano ambíguo", () => {
    const d = decidirGravacao(
      { telas: telas([[1, "a"], [1, "b"], [2, "c"]]), telasAtuais: [] },
      { force: true },
    );
    expect(d.acao).toBe("ambiguo");
  });

  it("✅ o reparo legítimo continua vivo: falta a capa, e nada disputa", () => {
    const d = decidirGravacao({
      telas: telas([[1, "capa"], [2, "b"], [3, "c"]]),
      telasAtuais: ["/api/media/b", "/api/media/c"],
    });
    expect(d.acao).toBe("reparar");
    expect(d.faltando).toBe(1);
    expect(d.posicoesEmDisputa).toEqual([]);
  });

  it("✅ ligar do zero continua vivo", () => {
    const d = decidirGravacao({ telas: telas([[1, "a"], [2, "b"]]), telasAtuais: [] });
    expect(d.acao).toBe("ligar");
  });
});

// ─── 2. O gravador não recebe post ambíguo ──────────────────────────────────

describe("postsParaGravar — a porta que o script e o boot usam", () => {
  it("⛔ post ambíguo não entra na lista de gravação", () => {
    const aGravar = postsParaGravar([
      { id: "p1", idx: 1, caption: "", mediaUrl: null,
        telas: telas([[1, "a"], [1, "b"]]), telasAtuais: [] },
      { id: "p2", idx: 2, caption: "", mediaUrl: null,
        telas: telas([[1, "c"], [2, "d"]]), telasAtuais: [] },
    ] as never);

    expect(aGravar.map((p) => p.id)).toEqual(["p2"]);
  });
});

// ─── 3. A tela de master trava, e diz por quê ───────────────────────────────

describe("avaliarPlano — a porta clicável", () => {
  it("⛔ um post ambíguo torna o plano INTEIRO não aplicável", () => {
    const a = avaliarPlano({
      posts: [
        { id: "p1", idx: 1, caption: "", mediaUrl: null,
          telas: telas([[1, "a"], [1, "b"]]), telasAtuais: [] },
        // Este sozinho seria aplicável — e mesmo assim o botão não aparece:
        // aplicar "metade" de uma reconciliação ambígua é pior que não aplicar.
        { id: "p2", idx: 2, caption: "", mediaUrl: null,
          telas: telas([[1, "c"], [2, "d"]]), telasAtuais: [] },
      ],
    } as never);

    expect(a.postsAmbiguos).toBe(1);
    expect(a.aplicavel).toBe(false);
    expect(a.motivoNaoAplicavel).toMatch(/DUAS artes disputando a mesma tela/);
  });

  it("✅ sem disputa, o botão continua existindo", () => {
    const a = avaliarPlano({
      posts: [{ id: "p1", idx: 1, caption: "", mediaUrl: null,
        telas: telas([[1, "a"], [2, "b"]]), telasAtuais: [] }],
    } as never);

    expect(a.postsAmbiguos).toBe(0);
    expect(a.aplicavel).toBe(true);
  });
});

// ─── 4. Do plano cru até a trava — o caminho inteiro ────────────────────────

describe("o caminho inteiro: dois jogos de arte nos Arquivos do cliente", () => {
  const posts: LinhaPost[] = [{
    id: "post1", caption: "Carrossel 1", mediaUrl: "/api/media/v4t1",
    mediaUrlsJson: JSON.stringify(["/api/media/v4t1", "/api/media/v4t2"]),
    scheduledFor: "2026-08-07T10:00:00Z",
  }];

  const assets: LinhaAsset[] = [
    { id: "v4t1", fileName: "foocci-carrossel1-tela1-v4-2026-08-06.png", mimeType: "image/png", createdAt: "2026-08-06T00:00:00Z" },
    { id: "v4t2", fileName: "foocci-carrossel1-tela2-v4-2026-08-06.png", mimeType: "image/png", createdAt: "2026-08-06T00:01:00Z" },
    { id: "v3t2", fileName: "carrossel-c1-tela-2-v3.png", mimeType: "image/png", createdAt: "2026-08-04T00:00:00Z" },
  ];

  it("os nomes dos DOIS jogos realmente casam com o mesmo post — a causa", () => {
    const plano = planejarBackfill({ postsRows: posts, assetsRows: assets, emUso: new Map() });
    const p = plano.posts[0]!;
    const naPos2 = p.telas.filter((t) => t.pos === 2).map((t) => t.fileName);
    expect(naPos2).toHaveLength(2); // v3 e v4 disputando a tela 2
  });

  it("⛔ e por isso NADA é gravado", () => {
    const plano = planejarBackfill({ postsRows: posts, assetsRows: assets, emUso: new Map() });
    expect(postsParaGravar(plano.posts, { force: false })).toEqual([]);
    expect(avaliarPlano(plano).aplicavel).toBe(false);
  });
});

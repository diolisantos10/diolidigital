// A lógica do backfill de carrossel — as DUAS metades.
//
// Por que este arquivo existe: o backfill era um `.mjs` com SQL direto e ZERO
// testes. O que ele decide não é cosmético — decide se o LOGO do cliente vira
// tela de carrossel e é publicado no portal em nome dele. A auditoria de
// 04/08/2026 achou exatamente isso: o índice de "já em uso" olhava só
// `SocialPost`, e o logo (que vive em `Deliverable.content` e em
// `DeliverableVersion.mediaAssetIds`) continuava elegível ao passe posicional.
//
// As duas metades, em todo bloco:
//   ✅ casa o que DEVE casar (senão a guarda vira "não faz nada", que passa
//      em qualquer teste de segurança e não entrega nada);
//   ⛔ NÃO casa logo, material bruto, asset com dono, post sem data, e não
//      roda o passe posicional sem a flag.

import { describe, it, expect } from "vitest";
import {
  lerLista,
  idsDeMidiaEmTexto,
  montarEmUso,
  ordenarPosts,
  decidirPassePosicional,
  planejarBackfill,
  postsParaGravar,
} from "@/lib/agency/media/backfill-carrossel.mjs";
import type { LinhaPost, LinhaAsset } from "@/lib/agency/media/backfill-carrossel.mjs";

function post(id: string, over: Partial<LinhaPost> = {}): LinhaPost {
  return {
    id, caption: `Carrossel ${id}`, mediaUrl: null, mediaUrlsJson: "[]",
    scheduledFor: "2026-08-10T12:00:00Z", ...over,
  };
}
function asset(id: string, fileName: string, createdAt = "2026-08-01T00:00:00Z"): LinhaAsset {
  return { id, fileName, mimeType: "image/png", createdAt };
}

// ── 1. Leitura defensiva ────────────────────────────────────────────────────

describe("lerLista / idsDeMidiaEmTexto — nunca lançam", () => {
  it("lista boa passa; lixo vira []", () => {
    expect(lerLista('["a","b"]')).toEqual(["a", "b"]);
    expect(lerLista('["a", 42, {"x":1}]')).toEqual(["a"]);
    expect(lerLista("{corrompido")).toEqual([]);
    expect(lerLista(null)).toEqual([]);
    expect(lerLista('{"nao":"array"}')).toEqual([]);
  });

  it("extrai TODOS os ids de mídia de um texto corrido", () => {
    const corpo = "- Arquivo 1: logo.png — /api/media/ma-logo\n- Arquivo 2: x — /api/media/ma_2-b";
    expect(idsDeMidiaEmTexto(corpo)).toEqual(["ma-logo", "ma_2-b"]);
    expect(idsDeMidiaEmTexto(null)).toEqual([]);
    expect(idsDeMidiaEmTexto("nenhuma referência aqui")).toEqual([]);
  });
});

// ── 2. montarEmUso — o índice que faltava ───────────────────────────────────

describe("montarEmUso — as TRÊS fontes de dono", () => {
  it("pega mídia referenciada por post (capa e telas)", () => {
    const emUso = montarEmUso({
      posts: [{ id: "sp1", mediaUrl: "/api/media/capa1", mediaUrlsJson: '["/api/media/t1","/api/media/t2"]' }],
    });
    expect([...emUso.keys()].sort()).toEqual(["capa1", "t1", "t2"]);
    expect(emUso.get("t1")).toEqual({ motivo: "post", dono: "sp1" });
  });

  it("pega o LOGO em Deliverable.content — o caso que batizou o achado", () => {
    // run-execution.ts monta exatamente este corpo no kit de marca.
    const emUso = montarEmUso({
      deliverables: [{
        id: "d1", name: "Kit de marca — Foocci",
        content: "**5. Baixe seus arquivos**\n- Arquivo 1: logo-foocci.png — /api/media/ma-logo",
      }],
    });
    expect(emUso.has("ma-logo")).toBe(true);
    expect(emUso.get("ma-logo")).toEqual({ motivo: "entregável", dono: "Kit de marca — Foocci" });
  });

  it("pega DeliverableVersion.mediaAssetIds — ids CRUS, não URLs", () => {
    const emUso = montarEmUso({
      versoes: [{ deliverableId: "d9", content: null, mediaAssetIds: '["ma-a","ma-b"]' }],
    });
    expect([...emUso.keys()].sort()).toEqual(["ma-a", "ma-b"]);
    expect(emUso.get("ma-a")).toEqual({ motivo: "versão de entregável", dono: "d9" });
  });

  it("o dono mais específico (post) vence quando a mídia aparece em duas fontes", () => {
    const emUso = montarEmUso({
      posts: [{ id: "sp1", mediaUrl: "/api/media/x", mediaUrlsJson: "[]" }],
      deliverables: [{ id: "d1", name: "Entrega", content: "/api/media/x" }],
    });
    expect(emUso.get("x")!.motivo).toBe("post");
  });

  it("fontes vazias ou corrompidas não derrubam nem inventam dono", () => {
    const emUso = montarEmUso({
      posts: [{ id: "sp1", mediaUrl: null, mediaUrlsJson: "{ruim" }],
      versoes: [{ deliverableId: "d1", mediaAssetIds: "não-é-json" }],
    });
    expect(emUso.size).toBe(0);
    expect(montarEmUso().size).toBe(0);
  });
});

// ── 3. Ordem do calendário e a trava da data ────────────────────────────────

describe("ordenarPosts — a ordem que define o C<n>", () => {
  it("ordena por scheduledFor e desempata por id", () => {
    const { ordenados, semData } = ordenarPosts([
      post("c", { scheduledFor: "2026-08-12T00:00:00Z" }),
      post("a", { scheduledFor: "2026-08-10T00:00:00Z" }),
      post("b", { scheduledFor: "2026-08-10T00:00:00Z" }),
    ]);
    expect(ordenados.map((p) => p.id)).toEqual(["a", "b", "c"]);
    expect(semData).toHaveLength(0);
  });

  it("denuncia os sem data — não os esconde no fim da lista", () => {
    const { semData } = ordenarPosts([post("a"), post("z", { scheduledFor: null })]);
    expect(semData.map((p) => p.id)).toEqual(["z"]);
  });

  // ── O BUG DE JUNTA DE 05/08/2026 ──────────────────────────────────────────
  // Todos os testes acima alimentam STRING ISO — o formato que o script recebe
  // do libsql. A rota e a tarefa de boot leem pelo PRISMA, e ali `scheduledFor`
  // é um objeto `Date`. A ordenação antiga comparava `String(valor)`, e
  // `String(new Date(...))` é "Wed Aug 12 2026 …": ordenar isso como texto
  // ordena por DIA DA SEMANA. O índice C<n> saía embaralhado e as telas iriam
  // para o carrossel errado, em silêncio.
  it("⛔ ordena Date (Prisma) por TEMPO, não por dia da semana", () => {
    // Segunda a sábado, de propósito: por texto isto viraria Fri < Mon < Sat…
    const { ordenados } = ordenarPosts([
      post("qua", { scheduledFor: new Date("2026-08-12T13:00:00Z") }),
      post("seg", { scheduledFor: new Date("2026-08-10T13:00:00Z") }),
      post("sab", { scheduledFor: new Date("2026-08-15T13:00:00Z") }),
      post("sex", { scheduledFor: new Date("2026-08-14T13:00:00Z") }),
    ]);
    expect(ordenados.map((p) => p.id)).toEqual(["seg", "qua", "sex", "sab"]);
  });

  it("os três formatos da casa (Date, ISO, epoch) convivem na mesma ordem", () => {
    const { ordenados, semData } = ordenarPosts([
      post("c", { scheduledFor: Date.parse("2026-08-14T13:00:00Z") }),
      post("a", { scheduledFor: "2026-08-10T13:00:00Z" }),
      post("b", { scheduledFor: new Date("2026-08-12T13:00:00Z") }),
    ]);
    expect(ordenados.map((p) => p.id)).toEqual(["a", "b", "c"]);
    expect(semData).toHaveLength(0);
  });

  it("data ILEGÍVEL conta como sem data — ordem que não sei justificar aborta", () => {
    const { semData } = ordenarPosts([post("a"), post("z", { scheduledFor: "quinta que vem" })]);
    expect(semData.map((p) => p.id)).toEqual(["z"]);
  });

  it("Date inválido (new Date('x')) também é sem data — NaN não ordena nada", () => {
    const { semData } = ordenarPosts([post("a"), post("z", { scheduledFor: new Date("x") })]);
    expect(semData.map((p) => p.id)).toEqual(["z"]);
  });

  it("o C<n> das telas segue a data REAL, com Date do Prisma", () => {
    // A prova de ponta: o carrossel de 10/08 é o #1 e leva as telas c1t*.
    const plano = planejarBackfill({
      postsRows: [
        post("sp-sex", { scheduledFor: new Date("2026-08-14T13:00:00Z") }),
        post("sp-seg", { scheduledFor: new Date("2026-08-10T13:00:00Z") }),
      ],
      assetsRows: [
        asset("m1", "foocci-c1t1.png"), asset("m2", "foocci-c1t2.png"),
        asset("m3", "foocci-c2t1.png"), asset("m4", "foocci-c2t2.png"),
      ],
    });
    expect(plano.erro).toBeNull();
    const primeiro = plano.posts.find((p) => p.idx === 1)!;
    const segundo = plano.posts.find((p) => p.idx === 2)!;
    expect(primeiro.id).toBe("sp-seg");
    expect(primeiro.telas.map((t) => t.fileName)).toEqual(["foocci-c1t1.png", "foocci-c1t2.png"]);
    expect(segundo.id).toBe("sp-sex");
    expect(segundo.telas.map((t) => t.fileName)).toEqual(["foocci-c2t1.png", "foocci-c2t2.png"]);
  });
});

describe("planejarBackfill — abortos", () => {
  it("ABORTA sem scheduledFor: o índice C<n> apontaria para o post errado", () => {
    const plano = planejarBackfill({
      postsRows: [post("sp1"), post("sp2", { scheduledFor: null })],
      assetsRows: [asset("m1", "foocci-c1t1.png")],
    });
    expect(plano.erro).toMatchObject({ codigo: "sem-data" });
    expect(plano.erro!.semData).toHaveLength(1);
    expect(plano.posts).toEqual([]);
    // Nada de plano parcial: quem aborta não devolve escrita nenhuma.
    expect(postsParaGravar(plano.posts)).toEqual([]);
  });

  it("ABORTA sem nenhum post carrossel", () => {
    expect(planejarBackfill({ postsRows: [], assetsRows: [asset("m1", "x.png")] }).erro)
      .toMatchObject({ codigo: "sem-posts" });
  });
});

// ── 4. Casamento por NOME — a metade que precisa CASAR ──────────────────────

describe("casamento nominal — o que DEVE casar", () => {
  it("A) `carrossel-<postId>-<i>.png` casa no post exato, na posição do nome", () => {
    const plano = planejarBackfill({
      postsRows: [post("sp1"), post("sp2", { scheduledFor: "2026-08-11T12:00:00Z" })],
      assetsRows: [
        asset("m3", "carrossel-sp1-3.png"),
        asset("m1", "carrossel-sp1-1.png"),
        asset("m2", "carrossel-sp1-2.png"),
        asset("m9", "carrossel-sp2-1.png"),
      ],
    });
    const sp1 = plano.posts.find((p) => p.id === "sp1")!;
    // Ordenado por posição, não por ordem de upload.
    expect(sp1.telas.map((t) => t.pos)).toEqual([1, 2, 3]);
    expect(sp1.telas.map((t) => t.assetId)).toEqual(["m1", "m2", "m3"]);
    expect(sp1.telas.every((t) => t.via === "esteira")).toBe(true);
    expect(postsParaGravar(plano.posts).find((p) => p.id === "sp1")!.urls)
      .toEqual(["/api/media/m1", "/api/media/m2", "/api/media/m3"]);
  });

  it("A) nome com postId que não existe não casa em post nenhum", () => {
    const plano = planejarBackfill({
      postsRows: [post("sp1")],
      assetsRows: [asset("m1", "carrossel-sp-fantasma-1.png")],
    });
    expect(plano.posts[0].telas).toEqual([]);
    expect(plano.naoCasados.map((a) => a.assetId)).toEqual(["m1"]);
  });

  it("B) C<n>T<m> casa pelo índice do CALENDÁRIO, nas variações de escrita", () => {
    const plano = planejarBackfill({
      postsRows: [
        post("sp-b", { scheduledFor: "2026-08-11T00:00:00Z" }), // #2
        post("sp-a", { scheduledFor: "2026-08-10T00:00:00Z" }), // #1
      ],
      assetsRows: [
        asset("m1", "c1t1.png"),
        asset("m2", "C1-T2.jpg"),
        asset("m3", "foocci-c02-t05.png"),
        asset("m4", "carrossel2_tela1.png"),
      ],
    });
    const p1 = plano.posts.find((p) => p.id === "sp-a")!;
    const p2 = plano.posts.find((p) => p.id === "sp-b")!;
    expect(p1.idx).toBe(1);
    expect(p1.telas.map((t) => t.assetId)).toEqual(["m1", "m2"]);
    expect(p2.telas.map((t) => [t.pos, t.assetId])).toEqual([[1, "m4"], [5, "m3"]]);
    expect(p2.telas.every((t) => t.via === "nome-CnTm")).toBe(true);
  });

  it("B) índice C<n> além do número de posts não casa — não estoura para o último", () => {
    const plano = planejarBackfill({
      postsRows: [post("sp1")],
      assetsRows: [asset("m1", "c7t1.png")],
    });
    expect(plano.posts[0].telas).toEqual([]);
  });

  it("re-execução é idempotente: a tela já ligada AO PRÓPRIO post volta a casar", () => {
    // O asset está "em uso" — por sp1, que é justamente o alvo. Bloquear aqui
    // faria o --force apagar as telas que já estavam certas.
    const emUso = montarEmUso({ posts: [{ id: "sp1", mediaUrl: null, mediaUrlsJson: '["/api/media/m1"]' }] });
    const plano = planejarBackfill({
      postsRows: [post("sp1", { mediaUrlsJson: '["/api/media/m1"]' })],
      assetsRows: [asset("m1", "foocci-c1t1.png")],
      emUso,
    });
    expect(plano.posts[0].telas.map((t) => t.assetId)).toEqual(["m1"]);
  });
});

// ── 5. Casamento nominal — a metade que precisa NÃO casar ───────────────────

describe("casamento nominal — o que NÃO pode casar", () => {
  it("⛔ LOGO nunca vira tela, mesmo com token C<n>T<m> no nome", () => {
    const plano = planejarBackfill({
      postsRows: [post("sp1")],
      assetsRows: [asset("m1", "logo-foocci-c1t1.png")],
    });
    expect(plano.posts[0].telas).toEqual([]);
    expect(plano.excluidos).toEqual([
      { assetId: "m1", fileName: "logo-foocci-c1t1.png", motivo: "nome institucional (logo/marca/perfil/avatar)" },
    ]);
  });

  it("⛔ marca, foto de perfil e avatar entram na mesma exclusão, com motivo", () => {
    const plano = planejarBackfill({
      postsRows: [post("sp1")],
      assetsRows: [
        asset("m1", "manual-de-MARCA.png"),
        asset("m2", "foto-perfil-instagram.jpg"),
        asset("m3", "avatar.png"),
      ],
    });
    expect(plano.excluidos.map((a) => a.assetId).sort()).toEqual(["m1", "m2", "m3"]);
    expect(plano.excluidos.every((a) => /nome institucional/.test(a.motivo))).toBe(true);
    expect(plano.naoCasados).toEqual([]);
  });

  it("⛔ tela de OUTRO post não é roubada pelo token C<n>T<m>", () => {
    const emUso = montarEmUso({ posts: [{ id: "sp-outro", mediaUrl: null, mediaUrlsJson: '["/api/media/m1"]' }] });
    const plano = planejarBackfill({
      postsRows: [post("sp1")],
      assetsRows: [asset("m1", "c1t1.png")],
      emUso,
    });
    expect(plano.posts[0].telas).toEqual([]);
    expect(plano.excluidos[0]).toMatchObject({ assetId: "m1", motivo: "já em uso — post (sp-outro)" });
  });
});

// ── 6. O passe posicional — a decisão isolada ───────────────────────────────

describe("decidirPassePosicional — sem flag, não roda", () => {
  it("⛔ sem --por-ordem NUNCA roda, por mais convidativa que seja a divisão", () => {
    expect(decidirPassePosicional({ postsSemTela: 2, sobras: 6, porOrdem: false }))
      .toEqual({ rodou: false, motivo: "flag-ausente", porPost: 0 });
  });
  it("⛔ com a flag, mas sem imagem livre ou sem divisão exata, também não roda", () => {
    expect(decidirPassePosicional({ postsSemTela: 2, sobras: 0, porOrdem: true }).motivo).toBe("sem-imagem-livre");
    expect(decidirPassePosicional({ postsSemTela: 4, sobras: 6, porOrdem: true }).motivo).toBe("nao-divide");
  });
  it("✅ com a flag e divisão exata, roda com N telas por post", () => {
    expect(decidirPassePosicional({ postsSemTela: 2, sobras: 6, porOrdem: true }))
      .toEqual({ rodou: true, motivo: "por-ordem", porPost: 3 });
  });
  it("nada pendente = nada a fazer, e isso não é 'flag ausente'", () => {
    expect(decidirPassePosicional({ postsSemTela: 0, sobras: 9, porOrdem: true }).motivo).toBe("nada-pendente");
  });
});

describe("passe posicional no plano inteiro", () => {
  const postsRows = [
    post("sp1", { scheduledFor: "2026-08-10T00:00:00Z" }),
    post("sp2", { scheduledFor: "2026-08-11T00:00:00Z" }),
  ];
  const assetsRows = [
    asset("m1", "IMG_001.png", "2026-08-01T01:00:00Z"),
    asset("m2", "IMG_002.png", "2026-08-01T02:00:00Z"),
    asset("m3", "IMG_003.png", "2026-08-01T03:00:00Z"),
    asset("m4", "IMG_004.png", "2026-08-01T04:00:00Z"),
  ];

  it("⛔ sem a flag: nada casa e nada seria gravado", () => {
    const plano = planejarBackfill({ postsRows, assetsRows });
    expect(plano.passe).toMatchObject({ rodou: false, motivo: "flag-ausente" });
    expect(plano.posts.every((p) => p.telas.length === 0)).toBe(true);
    expect(postsParaGravar(plano.posts)).toEqual([]);
    expect(plano.naoCasados).toHaveLength(4);
  });

  it("✅ com a flag: fatia na ordem de createdAt, 2 telas por post", () => {
    const plano = planejarBackfill({ postsRows, assetsRows, porOrdem: true });
    expect(plano.passe).toMatchObject({ rodou: true, porPost: 2 });
    expect(postsParaGravar(plano.posts)).toEqual([
      { id: "sp1", urls: ["/api/media/m1", "/api/media/m2"] },
      { id: "sp2", urls: ["/api/media/m3", "/api/media/m4"] },
    ]);
  });

  it("⛔ o LOGO fica FORA do passe posicional — e o relatório diz o porquê", () => {
    // O caso real: 4 telas + o logo no meio dos Arquivos. Antes, 5 imagens não
    // dividiam em 2 posts e o script simplesmente não casava nada; se fossem 6
    // (4 telas + logo + foto de perfil), o carrossel do cliente saía com o logo.
    const comLixo = [
      ...assetsRows,
      asset("m-logo", "logo-foocci.png", "2026-08-01T05:00:00Z"),
      asset("m-perfil", "perfil.jpg", "2026-08-01T06:00:00Z"),
    ];
    const plano = planejarBackfill({ postsRows, assetsRows: comLixo, porOrdem: true });
    expect(plano.passe).toMatchObject({ rodou: true, porPost: 2 });
    const gravar = postsParaGravar(plano.posts);
    expect(JSON.stringify(gravar)).not.toContain("m-logo");
    expect(JSON.stringify(gravar)).not.toContain("m-perfil");
    expect(plano.excluidos.map((a) => a.assetId).sort()).toEqual(["m-logo", "m-perfil"]);
  });

  it("⛔ material bruto do cliente com dono em ENTREGÁVEL fica fora e aparece no relatório", () => {
    const emUso = montarEmUso({
      deliverables: [{ id: "d1", name: "Kit de marca — Foocci", content: "- Arquivo 1: bruto — /api/media/m3" }],
      versoes: [{ deliverableId: "d2", mediaAssetIds: '["m4"]' }],
    });
    const plano = planejarBackfill({ postsRows, assetsRows, emUso, porOrdem: true });
    // Sobraram m1 e m2: 2 imagens livres para 2 posts → 1 tela cada, e um
    // carrossel de 1 tela não é carrossel: nada é gravado.
    expect(plano.passe).toMatchObject({ rodou: true, porPost: 1 });
    expect(postsParaGravar(plano.posts)).toEqual([]);
    expect(plano.excluidos).toEqual([
      { assetId: "m3", fileName: "IMG_003.png", motivo: "já em uso — entregável (Kit de marca — Foocci)" },
      { assetId: "m4", fileName: "IMG_004.png", motivo: "já em uso — versão de entregável (d2)" },
    ]);
  });
});

// ── 7. O que efetivamente seria gravado ─────────────────────────────────────

describe("postsParaGravar — a última trava antes do UPDATE", () => {
  it("⛔ carrossel de 1 tela não é carrossel — não grava lixo", () => {
    const plano = planejarBackfill({
      postsRows: [post("sp1")],
      assetsRows: [asset("m1", "carrossel-sp1-1.png")],
    });
    expect(plano.posts[0].telas).toHaveLength(1);
    expect(postsParaGravar(plano.posts)).toEqual([]);
  });

  it("⛔ post que JÁ tem telas é pulado; ✅ com force é sobrescrito", () => {
    const plano = planejarBackfill({
      postsRows: [post("sp1", { mediaUrlsJson: '["/api/media/antiga"]' })],
      assetsRows: [asset("m1", "carrossel-sp1-1.png"), asset("m2", "carrossel-sp1-2.png")],
    });
    expect(postsParaGravar(plano.posts)).toEqual([]);
    expect(postsParaGravar(plano.posts, { force: true })).toEqual([
      { id: "sp1", urls: ["/api/media/m1", "/api/media/m2"] },
    ]);
  });
});

// Lógica PURA do backfill de telas de carrossel — sem banco, sem process.exit.
//
// Por que existe separado do script: `scripts/backfill-carrossel-foocci.mjs`
// era SQL direto num `.mjs`, e por isso não tinha um único teste. O que decide
// se o logo do cliente vira tela de carrossel no portal é a regra abaixo — ela
// precisa de teste, não de leitura atenta na hora de rodar em produção.
//
// O script continua sendo o executável fino: lê as linhas do banco, chama
// `planejarBackfill`, imprime o plano e (só com --apply) grava.
//
// ── As três formas de casar, do determinístico ao heurístico ────────────────
// A) `carrossel-<postId>-<i>.png` — nome produzido pela própria esteira. O
//    postId está no nome; não há o que adivinhar.
// B) tokens C<n>/T<m> ("c2t3", "C4-T5") — n é o índice do post na ordem do
//    calendário. Heurístico: depende de a ordem estar certa (por isso data é
//    obrigatória) e de o nome não ser de um arquivo institucional.
// C) ORDEM de upload — puramente posicional, sem nenhuma evidência de
//    correspondência. Só roda com a flag explícita `--por-ordem`.
//
// ── Por que "sobra" NÃO é evidência (achado da auditoria, 04/08/2026) ───────
// Sobra é o logo, a foto de perfil, o anexo do briefing, o material bruto. A
// primeira versão desta guarda olhava só para `SocialPost` — e o logo não é
// referenciado por post nenhum: ele vive em `Deliverable.content` (o kit de
// marca escreve `/api/media/<id>` ali) e em `DeliverableVersion.mediaAssetIds`.
// Resultado: o logo continuava "livre" e continuava elegível ao passe
// posicional. Agora o índice de uso lê as três fontes, e o nome institucional
// (logo/marca/perfil/avatar) é excluído por si só.

/** Nome de arquivo que NUNCA é tela de carrossel, ainda que esteja sobrando. */
export const PADRAO_NOME_RESERVADO = /logo|marca|perfil|avatar/i;

/** Nome produzido pela esteira: carrossel-<postId>-<posição>.png */
export const PADRAO_ESTEIRA = /^carrossel-(.+)-(\d+)\.png$/i;

/** "c2t3", "C2-T3", "c2_t3", "carrossel2-tela3", "foocci-c02-t05.png"… */
export const PADRAO_CNTM =
  /(?:^|[^a-z0-9])c(?:arrossel)?[-_ ]?0*(\d{1,2})[-_ ]?t(?:ela)?[-_ ]?0*(\d{1,2})(?:[^0-9]|$)/i;

/** Referência de mídia dentro de um texto qualquer (content, caption, JSON). */
const PADRAO_URL_MIDIA = /\/api\/media\/([A-Za-z0-9_-]+)/g;

/** JSON de lista de strings → array; qualquer lixo vira []. Nunca lança. */
export function lerLista(bruto) {
  try {
    const v = JSON.parse(bruto ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** Todos os ids de mídia citados num texto (`/api/media/<id>`). */
export function idsDeMidiaEmTexto(texto) {
  return [...String(texto ?? "").matchAll(PADRAO_URL_MIDIA)].map((m) => m[1]);
}

/**
 * O índice de "esta mídia já tem dono".
 *
 * @param {{
 *   posts?: Array<{ id?: string, mediaUrl?: string|null, mediaUrlsJson?: string|null }>,
 *   deliverables?: Array<{ id?: string, name?: string|null, content?: string|null }>,
 *   versoes?: Array<{ id?: string, deliverableId?: string, content?: string|null, mediaAssetIds?: string|null }>,
 * }} fontes
 * @returns {Map<string, {motivo: string, dono: string|null}>} assetId → por que está em uso
 */
export function montarEmUso({ posts = [], deliverables = [], versoes = [] } = {}) {
  const emUso = new Map();
  // Primeiro registro vence: o dono mais específico (o post) é o que interessa
  // para a regra "outro post já usa esta imagem".
  const marcar = (id, motivo, dono) => {
    if (!id || emUso.has(id)) return;
    emUso.set(id, { motivo, dono: dono ?? null });
  };

  for (const p of posts) {
    const textos = [String(p.mediaUrl ?? ""), ...lerLista(p.mediaUrlsJson)];
    for (const t of textos) for (const id of idsDeMidiaEmTexto(t)) marcar(id, "post", p.id ?? null);
  }
  for (const d of deliverables) {
    for (const id of idsDeMidiaEmTexto(d.content)) {
      marcar(id, "entregável", d.name ? String(d.name) : (d.id ?? null));
    }
  }
  for (const v of versoes) {
    // mediaAssetIds guarda os ids CRUS, não URLs — é a lista que o portal usa
    // como fallback quando não há SocialPost. Era o outro buraco do índice.
    for (const id of lerLista(v.mediaAssetIds)) marcar(id, "versão de entregável", v.deliverableId ?? null);
    for (const id of idsDeMidiaEmTexto(v.content)) marcar(id, "versão de entregável", v.deliverableId ?? null);
  }
  return emUso;
}

/**
 * Ordena os posts como o calendário os enxerga e devolve os sem data.
 * `scheduledFor` nulo vem PRIMEIRO no SQLite: um post sem data viraria o "#1"
 * e deslocaria todo o índice C<n>. Por isso a ausência de data ABORTA.
 */
export function ordenarPosts(rows) {
  const chave = (p) => (p.scheduledFor == null ? "" : String(p.scheduledFor));
  const ordenados = [...rows].sort((a, b) => {
    const na = a.scheduledFor == null ? 0 : 1;
    const nb = b.scheduledFor == null ? 0 : 1;
    if (na !== nb) return na - nb;
    if (chave(a) !== chave(b)) return chave(a) < chave(b) ? -1 : 1;
    return String(a.id) < String(b.id) ? -1 : 1;
  });
  return { ordenados, semData: ordenados.filter((p) => p.scheduledFor == null) };
}

/**
 * O passe posicional roda? Decisão isolada de propósito — é o único ponto do
 * script capaz de montar um carrossel sem nenhuma evidência de nome.
 */
export function decidirPassePosicional({ postsSemTela, sobras, porOrdem }) {
  if (postsSemTela === 0) return { rodou: false, motivo: "nada-pendente", porPost: 0 };
  if (!porOrdem) return { rodou: false, motivo: "flag-ausente", porPost: 0 };
  if (sobras === 0) return { rodou: false, motivo: "sem-imagem-livre", porPost: 0 };
  if (sobras % postsSemTela !== 0) return { rodou: false, motivo: "nao-divide", porPost: 0 };
  return { rodou: true, motivo: "por-ordem", porPost: sobras / postsSemTela };
}

/**
 * O plano inteiro. Nada aqui toca banco nem encerra processo.
 *
 * @returns {{
 *   erro: null | {codigo: string, detalhe: string, semData?: unknown[]},
 *   posts: Array<object>, excluidos: Array<{assetId: string, fileName: string, motivo: string}>,
 *   naoCasados: Array<object>, passe: {rodou: boolean, motivo: string, porPost: number},
 * }}
 */
export function planejarBackfill({ postsRows = [], assetsRows = [], emUso = new Map(), porOrdem = false } = {}) {
  const vazio = { posts: [], excluidos: [], naoCasados: [], passe: { rodou: false, motivo: "abortado", porPost: 0 } };

  if (postsRows.length === 0) {
    return { erro: { codigo: "sem-posts", detalhe: "Nenhum post carrossel encontrado para este cliente." }, ...vazio };
  }
  const { ordenados, semData } = ordenarPosts(postsRows);
  if (semData.length > 0) {
    return {
      erro: {
        codigo: "sem-data",
        detalhe: `${semData.length} carrossel(éis) sem scheduledFor — o índice C<n> não tem ordem confiável.`,
        semData: semData.map((p) => ({ id: p.id, caption: String(p.caption ?? "").slice(0, 50) })),
      },
      ...vazio,
    };
  }

  const posts = ordenados.map((p, idx) => ({
    id: p.id,
    idx: idx + 1, // o "C<n>" do padrão de nome
    caption: String(p.caption ?? "").slice(0, 50),
    mediaUrl: p.mediaUrl ?? null,
    telasAtuais: lerLista(p.mediaUrlsJson),
    telas: [],
  }));
  const assets = assetsRows.map((a) => ({
    id: String(a.id), fileName: String(a.fileName ?? ""), createdAt: a.createdAt ?? null,
    usado: false, motivoExclusao: null,
  }));

  // Motivo de exclusão, calculado UMA vez e reaproveitado no relatório.
  for (const a of assets) {
    if (PADRAO_NOME_RESERVADO.test(a.fileName)) {
      a.motivoExclusao = "nome institucional (logo/marca/perfil/avatar)";
      continue;
    }
    const uso = emUso.get(a.id);
    if (uso) a.motivoExclusao = `já em uso — ${uso.motivo}${uso.dono ? ` (${uso.dono})` : ""}`;
  }

  // ── A) padrão da esteira: o postId está no nome, não há heurística ────────
  const porPostId = new Map(posts.map((p) => [p.id, p]));
  for (const a of assets) {
    const m = PADRAO_ESTEIRA.exec(a.fileName);
    if (!m) continue;
    const post = porPostId.get(m[1]);
    if (!post) continue;
    post.telas.push({ pos: Number(m[2]), assetId: a.id, fileName: a.fileName, via: "esteira" });
    a.usado = true;
  }

  // ── B) tokens C<n>/T<m> — heurístico: nome institucional fica de fora ─────
  // Uso por OUTRO post não bloqueia aqui de propósito: numa re-execução, a
  // própria tela já ligada ao post aparece como "em uso" por ele mesmo.
  for (const a of assets) {
    if (a.usado) continue;
    if (PADRAO_NOME_RESERVADO.test(a.fileName)) continue;
    const m = PADRAO_CNTM.exec(a.fileName);
    if (!m) continue;
    const post = posts.find((p) => p.idx === Number(m[1]));
    if (!post) continue;
    const uso = emUso.get(a.id);
    if (uso && uso.motivo === "post" && uso.dono && uso.dono !== post.id) continue; // é tela de outro post
    post.telas.push({ pos: Number(m[2]), assetId: a.id, fileName: a.fileName, via: "nome-CnTm" });
    a.usado = true;
  }

  // ── C) passe posicional — sem evidência nenhuma, só com flag ──────────────
  const semTela = posts.filter((p) => p.telas.length === 0);
  const sobras = assets.filter((a) => !a.usado && !a.motivoExclusao);
  const passe = decidirPassePosicional({ postsSemTela: semTela.length, sobras: sobras.length, porOrdem });
  if (passe.rodou) {
    semTela.forEach((post, i) => {
      sobras.slice(i * passe.porPost, (i + 1) * passe.porPost).forEach((a, j) => {
        post.telas.push({ pos: j + 1, assetId: a.id, fileName: a.fileName, via: "ordem" });
        a.usado = true;
      });
    });
  }

  for (const post of posts) post.telas.sort((x, y) => x.pos - y.pos);

  return {
    erro: null,
    posts,
    excluidos: assets
      .filter((a) => !a.usado && a.motivoExclusao)
      .map((a) => ({ assetId: a.id, fileName: a.fileName, motivo: a.motivoExclusao })),
    naoCasados: assets
      .filter((a) => !a.usado && !a.motivoExclusao)
      .map((a) => ({ assetId: a.id, fileName: a.fileName, createdAt: a.createdAt })),
    passe,
  };
}

/** Os posts que o `--apply` gravaria, com as URLs finais já montadas. */
export function postsParaGravar(posts, { force = false } = {}) {
  return posts
    .filter((p) => p.telas.length >= 2 && (p.telasAtuais.length === 0 || force))
    .map((p) => ({ id: p.id, urls: p.telas.map((t) => `/api/media/${t.assetId}`) }));
}

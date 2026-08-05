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
// ── As quatro formas de casar, do determinístico ao heurístico ──────────────
// A) `carrossel-<postId>-<i>.png` — nome produzido pela própria esteira. O
//    postId está no nome; não há o que adivinhar.
// B) tokens C<n>/T<m> ("c2t3", "C4-T5") — n é o índice do post na ordem do
//    calendário. Heurístico: depende de a ordem estar certa (por isso data é
//    obrigatória) e de o nome não ser de um arquivo institucional.
// CAPA) o `mediaUrl` DO PRÓPRIO POST é a tela 1 dele. Não é heurística: é o
//    contrato da casa, escrito em `lib/agency/execution/artes.ts` — a esteira
//    grava `mediaUrlsJson = urls` (TODAS) e `mediaUrl = urls[0]`. A capa É a
//    tela 1, então `mediaUrlsJson` tem que COMEÇAR por ela.
// C) ORDEM de upload — puramente posicional, sem nenhuma evidência de
//    correspondência. Só roda com a flag explícita `--por-ordem`.
//
// ── O bug de produção de 05/08/2026: 30 telas, e não 36 ─────────────────────
// Os nomes reais da V3 são `foocci-c<N>-v3-capa.png` (tela 1, e já gravada como
// `mediaUrl` do post) + `carrossel-c<N>-tela-<M>-v3.png` (telas 2..6). O índice
// `emUso` — que existe para impedir o LOGO de virar tela — marcava a capa como
// "já em uso — post" e a punha na lista de EXCLUÍDAS. Resultado: cada carrossel
// foi gravado com 5 telas, começando pela SEGUNDA.
//
// A capa do próprio post NUNCA é "material de outro dono". Ela continua barrada
// para os OUTROS posts (foi assim que o logo e a tela de outro carrossel foram
// recusados, e isso não muda) — só deixa de ser barrada para o dono dela.
//
// Consertar isso na tela (prepender a capa na hora de exibir) foi recusado de
// propósito: `lib/agency/esteira/publicacao.ts` lê `mediaUrlsJson` para montar
// o carrossel do Instagram. Dado incompleto publicaria 5 telas de 6 em nome do
// cliente. O conserto é no DADO.
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
 * O instante do post, em milissegundos — ou `null` quando não há data legível.
 *
 * ⚠️ ESTA FUNÇÃO É A CORREÇÃO DE UM BUG DE JUNTA (05/08/2026), e vale contar:
 * a ordenação comparava `String(p.scheduledFor)`. Pelo script (libsql), o
 * campo chega como STRING ISO — e ISO ordena por string, então funcionava. Pela
 * ROTA e pela tarefa de boot (Prisma), o mesmo campo chega como `Date`, e
 * `String(new Date(...))` produz "Wed Aug 12 2026 …": ordenar isso como texto
 * ordena por DIA DA SEMANA. O índice C<n> saía embaralhado e as telas iriam
 * para o carrossel errado — em silêncio, com o log parecendo correto.
 *
 * Os 29 testes passavam porque todos alimentavam strings ISO: provavam o
 * formato do script, não o formato de quem realmente ia escrever em produção.
 *
 * Data ilegível devolve `null` de propósito: ordem que não sei justificar é a
 * mesma coisa que ordem ausente, e ausência de data ABORTA o plano.
 */
export function instanteDoPost(v) {
  if (v == null) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.getTime();
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const t = Date.parse(String(v));
  return Number.isNaN(t) ? null : t;
}

/**
 * Ordena os posts como o calendário os enxerga e devolve os sem data.
 * Post sem data viraria o "#1" e deslocaria todo o índice C<n>. Por isso a
 * ausência (ou ilegibilidade) da data ABORTA — ver `planejarBackfill`.
 */
export function ordenarPosts(rows) {
  const ordenados = [...rows].sort((a, b) => {
    const ta = instanteDoPost(a.scheduledFor);
    const tb = instanteDoPost(b.scheduledFor);
    if (ta === null || tb === null) {
      if (ta !== tb) return ta === null ? -1 : 1;
      return String(a.id) < String(b.id) ? -1 : 1;
    }
    if (ta !== tb) return ta - tb;
    return String(a.id) < String(b.id) ? -1 : 1;
  });
  return { ordenados, semData: ordenados.filter((p) => instanteDoPost(p.scheduledFor) === null) };
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
        detalhe: `${semData.length} carrossel(éis) sem data legível em scheduledFor — o índice C<n> não tem ordem confiável.`,
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

  // De quem é esta imagem como CAPA? Primeiro post vence, na ordem do
  // calendário — a mesma ordem em que a fase CAPA reivindica.
  const capaDoPost = new Map();
  for (const p of posts) {
    for (const id of idsDeMidiaEmTexto(p.mediaUrl)) if (!capaDoPost.has(id)) capaDoPost.set(id, p.id);
  }

  // Motivo de exclusão, calculado UMA vez e reaproveitado no relatório.
  for (const a of assets) {
    if (PADRAO_NOME_RESERVADO.test(a.fileName)) {
      a.motivoExclusao = "nome institucional (logo/marca/perfil/avatar)";
      continue;
    }
    const capaDe = capaDoPost.get(a.id);
    if (capaDe) {
      // RESERVADA, não excluída: a fase CAPA devolve esta imagem ao post dono
      // dela. O motivo só aparece no relatório se, por algum motivo, ela não
      // for reivindicada — e, mesmo aí, ela nunca vira sobra para o passe
      // posicional dar a outro carrossel.
      a.motivoExclusao = `capa do próprio post (${capaDe}) — reservada para ele`;
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
    // A capa de OUTRO post não é roubada por um nome que diz o contrário. O
    // `emUso` acima normalmente já barraria (a capa é referenciada pelo post),
    // mas isto não pode depender de quem monta o índice: a função pura decide
    // sozinha.
    const donoDaCapa = capaDoPost.get(a.id);
    if (donoDaCapa && donoDaCapa !== post.id) continue;
    post.telas.push({ pos: Number(m[2]), assetId: a.id, fileName: a.fileName, via: "nome-CnTm" });
    a.usado = true;
  }

  // ── CAPA) a capa do próprio post É a tela 1 dele ──────────────────────────
  // Roda DEPOIS do nome (evidência nominal continua mandando em qual carrossel
  // a imagem entra) e ANTES do passe posicional. Não inventa posição: só ocupa
  // a tela 1 quando ela está vaga.
  const porId = new Map(assets.map((a) => [a.id, a]));
  for (const post of posts) {
    const idCapa = idsDeMidiaEmTexto(post.mediaUrl)[0];
    if (!idCapa) continue;
    const a = porId.get(idCapa);
    if (!a) continue;                                      // capa fora dos Arquivos deste cliente
    if (a.usado) continue;                                 // já entrou pelo nome, aqui ou noutro post
    if (capaDoPost.get(a.id) !== post.id) continue;        // capa compartilhada: fica com o primeiro
    if (PADRAO_NOME_RESERVADO.test(a.fileName)) continue;  // logo como capa NÃO vira tela do carrossel
    if (post.telas.some((t) => t.pos === 1)) continue;     // o nome já nomeou uma tela 1: não disputo
    post.telas.push({ pos: 1, assetId: a.id, fileName: a.fileName, via: "capa" });
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

/**
 * O que o UPDATE faria com ESTE post. Decisão ÚNICA, num lugar só: o gravador,
 * o log da tarefa de boot e a tela de master leem daqui. Foi assim que o passe
 * posicional deixou de divergir entre as portas, e o reparo não vai divergir.
 *
 * ── Por que "reparar" existe (05/08/2026) ──────────────────────────────────
 * A idempotência antiga era binária: "tem telas → não toco". Em produção isso
 * congelou 6 carrosséis com 5 das 6 telas, faltando a capa — e sem `--force`
 * nada os tiraria de lá. `--force` global não serve: ele sobrescreveria também
 * o que foi posto à mão.
 *
 * O reparo é ESTRITAMENTE ADITIVO: só roda quando o plano contém TUDO o que já
 * está gravado e mais alguma coisa. Se o que está no banco tem uma tela que o
 * plano não conhece, isso é divergência, não incompletude — e divergência exige
 * decisão humana (`--force` no script, lendo o log).
 *
 * Reordenar sem acrescentar também NÃO é reparo: ordem posta à mão é decisão de
 * alguém, e trocá-la seria o mesmo tipo de sobrescrita que o `--force` guarda.
 *
 * @returns {{acao: "ligar"|"reparar"|"sobrescrever"|"ja-tem-telas"|"sem-telas-suficientes",
 *            urls: string[], telasAtuais: number, faltando: number}}
 */
export function decidirGravacao(post, { force = false } = {}) {
  const urls = (post.telas ?? []).map((t) => `/api/media/${t.assetId}`);
  const atuais = Array.isArray(post.telasAtuais) ? post.telasAtuais : [];
  const base = { urls, telasAtuais: atuais.length, faltando: 0 };

  // Carrossel de uma imagem só não é carrossel — nunca foi, e continua não sendo.
  if (urls.length < 2) {
    return { ...base, acao: atuais.length > 0 ? "ja-tem-telas" : "sem-telas-suficientes" };
  }
  if (atuais.length === 0) return { ...base, acao: "ligar", faltando: urls.length };
  if (force) return { ...base, acao: "sobrescrever" };

  const faltando = urls.filter((u) => !atuais.includes(u)).length;
  const perderia = atuais.some((u) => !urls.includes(u));
  if (faltando > 0 && !perderia) return { ...base, acao: "reparar", faltando };
  return { ...base, acao: "ja-tem-telas" };
}

/**
 * Os posts que o `--apply` gravaria, com as URLs finais já montadas — na ORDEM
 * do plano, que começa pela tela 1 (a capa, quando é dela a posição 1).
 */
export function postsParaGravar(posts, { force = false } = {}) {
  const saida = [];
  for (const p of posts) {
    const d = decidirGravacao(p, { force });
    if (d.acao !== "ligar" && d.acao !== "reparar" && d.acao !== "sobrescrever") continue;
    saida.push({ id: p.id, urls: d.urls, acao: d.acao, telasAtuais: d.telasAtuais });
  }
  return saida;
}

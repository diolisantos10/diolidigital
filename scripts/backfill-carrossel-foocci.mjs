// Backfill das telas dos carrosséis da Foocci — liga os MediaAsset (as 36
// telas subidas aos Arquivos do cliente) aos 6 SocialPost via `mediaUrlsJson`.
//
// Por que existe: os posts do lançamento estão com mediaUrlsJson="[]" — as
// telas foram produzidas (esteira gera `carrossel-<postId>-<i>.png`; a V3 foi
// subida manualmente), mas nunca amarradas ao post. Sem o vínculo, o portal só
// mostra a capa e o cliente não vê o resto do carrossel.
//
// USO (mesma resolução de URL do seed-db.mjs — @libsql/client, sem build):
//   node scripts/backfill-carrossel-foocci.mjs                  # DRY-RUN (padrão)
//   node scripts/backfill-carrossel-foocci.mjs --apply          # grava de verdade
//   node scripts/backfill-carrossel-foocci.mjs --client <id>    # cliente explícito
//   node scripts/backfill-carrossel-foocci.mjs --force          # sobrescreve mediaUrlsJson já preenchido
//   DATABASE_URL=... node scripts/backfill-carrossel-foocci.mjs # outro banco
//
// ⚠️ NÃO rodar contra produção sem dry-run primeiro e sem conferir o log:
// o script lista o que casou e o que NÃO casou antes de qualquer escrita.
//
// Como o casamento é feito (nesta ordem, do determinístico ao heurístico):
//   A) nome da esteira: `carrossel-<postId>-<i>.png` → post exato, posição i;
//   B) nome com tokens C<n>/T<m> (padrão da V3 manual, ex. "c2t3", "C4-T5"):
//      n = índice do post na ordem de scheduledFor, m = posição da tela;
//   C) ORDEM (createdAt, depois fileName): só se as sobras dividirem por igual
//      entre os posts sem tela — e o log grita que foi por ordem, não por nome.

import { createClient } from "@libsql/client";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const FORCE = args.includes("--force");
const clientArg = args.includes("--client") ? args[args.indexOf("--client") + 1] : null;

const dbUrl = process.env.DATABASE_URL ?? "file:./dev.db";
const url = dbUrl.startsWith("file:./")
  ? `file:${process.cwd()}/${dbUrl.slice("file:./".length)}`
  : dbUrl;
const db = createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN });

async function q(sql, argsArr = []) {
  return db.execute({ sql, args: argsArr });
}

function lerLista(bruto) {
  try {
    const v = JSON.parse(bruto ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

async function main() {
  console.log(`🧩 Backfill carrossel Foocci — ${APPLY ? "APLICANDO" : "DRY-RUN (nada será gravado)"}`);
  console.log(`   banco: ${url.replace(/\/\/[^@]*@/, "//***@")}`);

  // ── 1. O cliente ───────────────────────────────────────────────────────────
  let clientId = clientArg;
  if (!clientId) {
    const r = await q(`SELECT id, name FROM Client WHERE lower(name) LIKE '%foocci%' OR id = 'seed-foocci-cli'`);
    if (r.rows.length !== 1) {
      console.error(`✗ Esperava exatamente 1 cliente Foocci, achei ${r.rows.length}. Use --client <id>.`);
      for (const row of r.rows) console.error(`  candidato: ${row.id} (${row.name})`);
      process.exit(1);
    }
    clientId = r.rows[0].id;
    console.log(`✓ Cliente: ${r.rows[0].name} (${clientId})`);
  }

  // ── 2. Os posts carrossel do cliente, na ordem do calendário ───────────────
  const postsR = await q(
    `SELECT id, caption, mediaUrl, mediaUrlsJson, scheduledFor FROM SocialPost
     WHERE clientId = ? AND format IN ('carousel','carrossel')
     ORDER BY scheduledFor ASC, id ASC`,
    [clientId],
  );
  const posts = postsR.rows.map((p, idx) => ({
    id: p.id,
    idx: idx + 1, // índice 1-based na ordem do calendário — o "C<n>" do padrão de nome
    caption: String(p.caption ?? "").slice(0, 50),
    mediaUrl: p.mediaUrl,
    telasAtuais: lerLista(p.mediaUrlsJson),
    telas: [], // Array<{ pos, assetId, fileName, via }>
  }));
  if (posts.length === 0) {
    console.error("✗ Nenhum post carrossel encontrado para este cliente. Nada a fazer.");
    process.exit(1);
  }
  console.log(`✓ ${posts.length} posts carrossel encontrados`);

  // ── 3. Os MediaAsset de imagem do cliente ──────────────────────────────────
  const assetsR = await q(
    `SELECT id, fileName, mimeType, createdAt FROM MediaAsset
     WHERE mimeType LIKE 'image/%' AND (
       clientId = ? OR clientRequestId IN (SELECT id FROM ClientRequestDb WHERE clientId = ?)
     )
     ORDER BY createdAt ASC, fileName ASC`,
    [clientId, clientId],
  );
  const assets = assetsR.rows.map((a) => ({ ...a, usado: false }));
  console.log(`✓ ${assets.length} imagens nos Arquivos do cliente`);

  // ── 4A. Padrão da esteira: carrossel-<postId>-<i>.png ─────────────────────
  const porPostId = new Map(posts.map((p) => [p.id, p]));
  for (const a of assets) {
    const m = /^carrossel-(.+)-(\d+)\.png$/i.exec(a.fileName);
    if (!m) continue;
    const post = porPostId.get(m[1]);
    if (!post) continue;
    post.telas.push({ pos: Number(m[2]), assetId: a.id, fileName: a.fileName, via: "esteira" });
    a.usado = true;
  }

  // ── 4B. Padrão C<n>/T<m> (upload manual da V3) ────────────────────────────
  for (const a of assets) {
    if (a.usado) continue;
    // "c2t3", "C2-T3", "c2_t3", "carrossel2-tela3", "foocci-c02-t05.png"…
    const m =
      /(?:^|[^a-z0-9])c(?:arrossel)?[-_ ]?0*(\d{1,2})[-_ ]?t(?:ela)?[-_ ]?0*(\d{1,2})(?:[^0-9]|$)/i.exec(a.fileName);
    if (!m) continue;
    const post = posts.find((p) => p.idx === Number(m[1]));
    if (!post) continue;
    post.telas.push({ pos: Number(m[2]), assetId: a.id, fileName: a.fileName, via: "nome-CnTm" });
    a.usado = true;
  }

  // ── 4C. Fallback por ORDEM — só se dividir por igual ──────────────────────
  const semTela = posts.filter((p) => p.telas.length === 0);
  const sobras = assets.filter((a) => !a.usado);
  if (semTela.length > 0 && sobras.length > 0 && sobras.length % semTela.length === 0) {
    const porPost = sobras.length / semTela.length;
    console.log(`⚠️  Fallback por ORDEM: ${sobras.length} imagens sem padrão de nome divididas em ${semTela.length} posts × ${porPost} telas (createdAt).`);
    console.log("    Confira o resultado com atenção — este casamento é posicional, não nominal.");
    semTela.forEach((post, i) => {
      sobras.slice(i * porPost, (i + 1) * porPost).forEach((a, j) => {
        post.telas.push({ pos: j + 1, assetId: a.id, fileName: a.fileName, via: "ordem" });
        a.usado = true;
      });
    });
  }

  // ── 5. Relatório ───────────────────────────────────────────────────────────
  console.log("\n── O que casou ─────────────────────────────────────────────");
  let prontos = 0;
  for (const post of posts) {
    post.telas.sort((x, y) => x.pos - y.pos);
    const jaTem = post.telasAtuais.length > 0;
    console.log(`\n▸ ${post.id} (#${post.idx}) — "${post.caption}…"`);
    if (jaTem) console.log(`  já tem ${post.telasAtuais.length} telas em mediaUrlsJson${FORCE ? " (--force: será sobrescrito)" : " (será PULADO; use --force)"}`);
    if (post.telas.length === 0) {
      console.log("  ✗ NENHUMA tela casou");
      continue;
    }
    for (const t of post.telas) console.log(`  tela ${t.pos}: ${t.fileName} [${t.via}] → /api/media/${t.assetId}`);
    if (post.telas.length >= 2 && (!jaTem || FORCE)) prontos++;
  }

  const naoUsados = assets.filter((a) => !a.usado);
  console.log(`\n── O que NÃO casou ─────────────────────────────────────────`);
  if (naoUsados.length === 0) console.log("  (nada — todas as imagens casaram)");
  for (const a of naoUsados) console.log(`  ? ${a.fileName} (${a.id}, ${a.createdAt})`);

  // ── 6. Escrita (só com --apply) ────────────────────────────────────────────
  if (!APPLY) {
    console.log(`\n🔎 DRY-RUN: ${prontos} post(s) seriam atualizados. Rode com --apply para gravar.`);
    return;
  }
  let gravados = 0;
  for (const post of posts) {
    if (post.telas.length < 2) continue; // carrossel de 1 tela não é carrossel — não grava lixo
    if (post.telasAtuais.length > 0 && !FORCE) continue;
    const urls = post.telas.map((t) => `/api/media/${t.assetId}`);
    // A capa só é trocada se estiver vazia — as capas V3 já foram postas à mão.
    await q(
      `UPDATE SocialPost SET mediaUrlsJson = ?, mediaUrl = COALESCE(mediaUrl, ?), updatedAt = datetime('now') WHERE id = ?`,
      [JSON.stringify(urls), urls[0], post.id],
    );
    gravados++;
    console.log(`✓ gravado: ${post.id} ← ${urls.length} telas`);
  }
  console.log(`\n✅ ${gravados} post(s) atualizados.`);
}

main().catch((e) => {
  console.error("✗ Falhou:", e.message);
  process.exit(1);
});

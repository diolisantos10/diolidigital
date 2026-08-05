// Backfill das telas dos carrosséis da Foocci — liga os MediaAsset (as telas
// subidas aos Arquivos do cliente) aos SocialPost via `mediaUrlsJson`.
//
// Por que existe: os posts do lançamento estão com mediaUrlsJson="[]" — as
// telas foram produzidas (esteira gera `carrossel-<postId>-<i>.png`; a V3 foi
// subida manualmente), mas nunca amarradas ao post. Sem o vínculo, o portal só
// mostra a capa e o cliente não vê o resto do carrossel.
//
// ESTE ARQUIVO É SÓ O EXECUTÁVEL: lê o banco, chama a lógica pura de
// `lib/agency/media/backfill-carrossel.mjs` (essa sim tem testes — ver
// `__tests__/media/backfill-carrossel.test.ts`), imprime o plano e, só com
// --apply, grava numa transação.
//
// USO (mesma resolução de URL do seed-db.mjs — @libsql/client, sem build):
//   node scripts/backfill-carrossel-foocci.mjs                  # DRY-RUN (padrão)
//   node scripts/backfill-carrossel-foocci.mjs --apply          # grava de verdade
//   node scripts/backfill-carrossel-foocci.mjs --client <id>    # cliente explícito
//   node scripts/backfill-carrossel-foocci.mjs --force          # sobrescreve mediaUrlsJson já preenchido
//   node scripts/backfill-carrossel-foocci.mjs --por-ordem      # LIBERA o passe posicional (4C)
//   DATABASE_URL=... node scripts/backfill-carrossel-foocci.mjs # outro banco
//
// ⚠️ NÃO rodar contra produção sem dry-run primeiro e sem conferir o log:
// o script lista o que casou, o que foi EXCLUÍDO (com motivo) e o que sobrou
// antes de qualquer escrita.
//
// ── REPARO (05/08/2026), e por que ele NÃO é --force ────────────────────────
// Post com carrossel INCOMPLETO — as telas gravadas são um subconjunto do plano
// — é reparado sem flag nenhuma, e o log diz `reparado: 5 → 6 telas`. É aditivo:
// nada do que já está ligado se perde, e a ordem do plano (capa primeiro) passa
// a valer. `--force` continua sendo outra coisa: ele SUBSTITUI, inclusive telas
// que o plano não conhece, e por isso continua exigindo decisão humana.

import { createClient } from "@libsql/client";
import {
  montarEmUso,
  planejarBackfill,
  postsParaGravar,
  decidirGravacao,
} from "../lib/agency/media/backfill-carrossel.mjs";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const FORCE = args.includes("--force");
const POR_ORDEM = args.includes("--por-ordem");
const clientArg = args.includes("--client") ? args[args.indexOf("--client") + 1] : null;

const dbUrl = process.env.DATABASE_URL ?? "file:./dev.db";
const url = dbUrl.startsWith("file:./")
  ? `file:${process.cwd()}/${dbUrl.slice("file:./".length)}`
  : dbUrl;
const db = createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN });

async function q(sql, argsArr = []) {
  return db.execute({ sql, args: argsArr });
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
  const wsR = await q(`SELECT workspaceId FROM Client WHERE id = ?`, [clientId]);
  const workspaceId = wsR.rows[0]?.workspaceId ?? null;
  if (!workspaceId) {
    console.error(`✗ Cliente ${clientId} sem workspace — não dá para saber que mídias já estão em uso. Abortado.`);
    process.exit(1);
  }

  // ── 2. Os posts carrossel do cliente ───────────────────────────────────────
  const postsR = await q(
    `SELECT id, caption, mediaUrl, mediaUrlsJson, scheduledFor FROM SocialPost
     WHERE clientId = ? AND format IN ('carousel','carrossel')`,
    [clientId],
  );

  // ── 3. Os MediaAsset de imagem do cliente ──────────────────────────────────
  const assetsR = await q(
    `SELECT id, fileName, mimeType, createdAt FROM MediaAsset
     WHERE mimeType LIKE 'image/%' AND (
       clientId = ? OR clientRequestId IN (SELECT id FROM ClientRequestDb WHERE clientId = ?)
     )
     ORDER BY createdAt ASC, fileName ASC`,
    [clientId, clientId],
  );
  console.log(`✓ ${assetsR.rows.length} imagens nos Arquivos do cliente`);

  // ── 3B. Quais dessas imagens JÁ têm dono, nas TRÊS fontes ──────────────────
  // Post é a fonte óbvia. As outras duas são o achado da re-auditoria: o LOGO e
  // o material bruto não são referenciados por post nenhum — vivem em
  // `Deliverable.content` (o kit de marca escreve `/api/media/<id>` ali) e em
  // `DeliverableVersion.mediaAssetIds`. Sem elas, o logo era "sobra livre".
  const [usoPosts, usoEntregaveis, usoVersoes] = await Promise.all([
    q(`SELECT id, mediaUrl, mediaUrlsJson FROM SocialPost WHERE workspaceId = ?`, [workspaceId]),
    q(
      `SELECT d.id AS id, d.name AS name, d.content AS content FROM Deliverable d
       JOIN Project p ON p.id = d.projectId WHERE p.workspaceId = ?`,
      [workspaceId],
    ),
    q(
      `SELECT v.deliverableId AS deliverableId, v.content AS content, v.mediaAssetIds AS mediaAssetIds
       FROM DeliverableVersion v
       JOIN Deliverable d ON d.id = v.deliverableId
       JOIN Project p ON p.id = d.projectId WHERE p.workspaceId = ?`,
      [workspaceId],
    ),
  ]);
  const emUso = montarEmUso({
    posts: usoPosts.rows,
    deliverables: usoEntregaveis.rows,
    versoes: usoVersoes.rows,
  });
  console.log(
    `✓ ${emUso.size} mídia(s) já com dono no workspace ` +
      `(${usoPosts.rows.length} posts, ${usoEntregaveis.rows.length} entregáveis, ${usoVersoes.rows.length} versões)`,
  );

  // ── 4. O plano (lógica pura e testada) ─────────────────────────────────────
  const plano = planejarBackfill({
    postsRows: postsR.rows,
    assetsRows: assetsR.rows,
    emUso,
    porOrdem: POR_ORDEM,
  });

  if (plano.erro) {
    console.error(`✗ ${plano.erro.detalhe}`);
    for (const p of plano.erro.semData ?? []) console.error(`  sem data: ${p.id} — "${p.caption}…"`);
    if (plano.erro.codigo === "sem-data") {
      console.error("  Preencha a data no calendário (ou restrinja o cliente) e rode de novo. Nada foi gravado.");
    }
    process.exit(1);
  }
  console.log(`✓ ${plano.posts.length} posts carrossel encontrados`);

  if (!plano.passe.rodou && plano.passe.motivo !== "nada-pendente") {
    const explica = {
      "flag-ausente": "passe por ORDEM NÃO executado — casamento posicional monta carrossel com logo e material bruto.\n    Se conferiu o log e quer mesmo, rode com --por-ordem (sem --apply antes, para ver o que daria).",
      "sem-imagem-livre": "--por-ordem pedido, mas não há imagem livre (todas já têm dono ou são institucionais).",
      "nao-divide": "--por-ordem pedido, mas as imagens livres não dividem igualmente entre os posts sem tela. Nada casado por ordem.",
    }[plano.passe.motivo];
    console.log(`\n⚠️  ${explica}`);
  } else if (plano.passe.rodou) {
    console.log(`\n⚠️  PASSE POR ORDEM (--por-ordem): ${plano.passe.porPost} tela(s) por post, na ordem de createdAt.`);
    console.log("    Este casamento é POSICIONAL, não nominal — uploads intercalados no tempo embaralham telas entre carrosséis.");
    console.log("    Confira tela por tela no log abaixo ANTES de rodar com --apply.");
  }

  // ── 5. Relatório ───────────────────────────────────────────────────────────
  console.log("\n── O que casou ─────────────────────────────────────────────");
  for (const post of plano.posts) {
    const d = decidirGravacao(post, { force: FORCE });
    console.log(`\n▸ ${post.id} (#${post.idx}) — "${post.caption}…"`);
    // O reparo (aditivo) é diferente de "pulado" e diferente de --force: ele
    // acrescenta o que falta sem tocar no que já está lá. Ver `decidirGravacao`.
    if (d.acao === "reparar") {
      console.log(`  ⟳ INCOMPLETO — será reparado: ${d.telasAtuais} → ${d.urls.length} telas (${d.faltando} faltando)`);
    } else if (post.telasAtuais.length > 0) {
      console.log(`  já tem ${post.telasAtuais.length} telas em mediaUrlsJson${FORCE ? " (--force: será sobrescrito)" : " (será PULADO; use --force)"}`);
    }
    if (post.telas.length === 0) {
      console.log("  ✗ NENHUMA tela casou");
      continue;
    }
    for (const t of post.telas) console.log(`  tela ${t.pos}: ${t.fileName} [${t.via}] → /api/media/${t.assetId}`);
  }

  console.log(`\n── EXCLUÍDAS do casamento (com motivo) ─────────────────────`);
  if (plano.excluidos.length === 0) console.log("  (nenhuma)");
  for (const a of plano.excluidos) console.log(`  ⛔ ${a.fileName} (${a.assetId}) — ${a.motivo}`);

  console.log(`\n── O que sobrou sem casar ──────────────────────────────────`);
  if (plano.naoCasados.length === 0) console.log("  (nada — todas as imagens casaram ou foram excluídas)");
  for (const a of plano.naoCasados) console.log(`  ? ${a.fileName} (${a.assetId}, ${a.createdAt})`);

  // ── 6. Escrita (só com --apply) ────────────────────────────────────────────
  const aGravar = postsParaGravar(plano.posts, { force: FORCE });
  if (!APPLY) {
    console.log(`\n🔎 DRY-RUN: ${aGravar.length} post(s) seriam atualizados. Rode com --apply para gravar.`);
    return;
  }
  // Tudo ou nada: sem transação, uma falha no meio deixava metade dos posts
  // ligados e o log anunciava um total que não existia no banco.
  const tx = await db.transaction("write");
  let gravados = 0;
  try {
    for (const post of aGravar) {
      // A capa só é trocada se estiver vazia — as capas V3 já foram postas à mão.
      await tx.execute({
        sql: `UPDATE SocialPost SET mediaUrlsJson = ?, mediaUrl = COALESCE(mediaUrl, ?), updatedAt = datetime('now') WHERE id = ?`,
        args: [JSON.stringify(post.urls), post.urls[0], post.id],
      });
      gravados++;
      console.log(
        post.acao === "reparar"
          ? `✓ na transação: ${post.id} reparado: ${post.telasAtuais} → ${post.urls.length} telas`
          : `✓ na transação: ${post.id} ← ${post.urls.length} telas`,
      );
    }
    await tx.commit();
  } catch (e) {
    await tx.rollback();
    console.error(`✗ Escrita revertida INTEIRA (${gravados} post(s) desfeitos): ${e.message}`);
    process.exit(1);
  }
  console.log(`\n✅ ${gravados} post(s) atualizados (transação confirmada).`);
}

main().catch((e) => {
  console.error("✗ Falhou:", e.message);
  process.exit(1);
});

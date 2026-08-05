#!/usr/bin/env node
// backup-antes-da-migration.mjs — A CÓPIA QUE PRECISA EXISTIR ANTES DA CIRURGIA.
//
// ── O PROBLEMA QUE ISTO RESOLVE ─────────────────────────────────────────────
// Cinco das migrations desta casa RECONSTROEM TABELA — o padrão obrigatório do
// SQLite para mudar coluna: `PRAGMA foreign_keys=OFF` → CREATE tabela nova →
// INSERT SELECT → DROP da antiga → RENAME. Uma delas reconstrói QUATRO tabelas
// de uma vez, incluindo `SocialPost` e `Deliverable` — o trabalho entregue ao
// cliente.
//
// Se o processo for interrompido no meio (e ele JÁ é interrompido: o
// `migrate deploy` deste repositório tem retry porque dois deploys simultâneos
// disputam o lock do volume), o que fica no disco é uma tabela órfã
// `new_Deliverable` e a `Deliverable` real derrubada. Não há rollback. Não há
// undo. O `fazerBackup()` desta casa já existe, já é CONFERIDO — só nunca rodou
// antes da migration, que é exatamente o único momento em que ele é obrigatório.
//
// ── POR QUE ESTE ARQUIVO É .mjs E DUPLICA A LÓGICA DE lib/agency/backup.ts ──
// `scripts/start.sh` roda ANTES de o app existir e com as devDependencies
// possivelmente podadas — não há `tsx` garantido para importar o TypeScript.
// A duplicação é consciente e mínima: `VACUUM INTO` + `integrity_check` +
// contagem das tabelas essenciais. Quem mexer numa metade leia a outra.
//
// ── AS DECISÕES ────────────────────────────────────────────────────────────
// 1. Só roda quando HÁ migration pendente. Sem cirurgia marcada, não se faz
//    pré-operatório: `start.sh` consulta `prisma migrate status` antes.
// 2. Vive em `backups/pre-migration/`, uma pasta SEPARADA da rotina diária.
//    A rotina (`lib/agency/backup.ts`) lista `backups/*.db` e assume que a
//    ordem alfabética é a cronológica — misturar outro prefixo ali quebraria a
//    leitura de "qual foi a última cópia".
// 3. Cópia que não passa na conferência é APAGADA e o processo sai com erro.
//    Um arquivo que ninguém abriu não é backup; é esperança. E deixar uma cópia
//    ruim no disco faz alguém restaurar dela um dia.
// 4. Falhar aqui DERRUBA O BOOT, de propósito. A alternativa é aplicar
//    reconstrução de tabela sem rede — o único erro desta casa que é total e
//    irreversível. Escape declarado: PULAR_BACKUP_PRE_MIGRATION=1.

import { createClient } from "@libsql/client";
import { mkdir, readdir, stat, unlink } from "node:fs/promises";
import path from "node:path";

/** Quantas cópias pré-migration guardamos. Cada uma corresponde a um deploy
 *  que mexeu no schema — cinco cobre a janela em que alguém percebe. */
const MAX_COPIAS = 5;

/** As mesmas de lib/agency/backup.ts: contar prova que a cópia tem CONTEÚDO.
 *  Um banco vazio passa no integrity_check e não serve para restaurar nada. */
const TABELAS_ESSENCIAIS = ["Client", "Project", "Deliverable", "ClientRequestDb", "User"];

export function caminhoDoBanco(url = process.env.DATABASE_URL) {
  const u = url?.trim();
  if (!u?.startsWith("file:")) return null; // libsql remoto tem backup do provedor
  return u.slice("file:".length);
}

export function pastaPreMigration() {
  const volume = process.env.RAILWAY_VOLUME_MOUNT_PATH?.trim();
  const base = volume ? path.join(volume, "backups") : path.join(process.cwd(), ".backups");
  return path.join(base, "pre-migration");
}

/** Abre a cópia e prova que ela presta. */
export async function conferir(arquivo) {
  const copia = createClient({ url: `file:${arquivo}` });
  const contagens = {};
  try {
    const r = await copia.execute("pragma integrity_check");
    const veredito = String(r.rows[0]?.integrity_check ?? "");
    if (veredito !== "ok") return { ok: false, contagens, erro: `a cópia saiu corrompida: ${veredito.slice(0, 120)}` };

    for (const t of TABELAS_ESSENCIAIS) {
      const c = await copia.execute(`select count(*) as n from "${t}"`).catch(() => null);
      if (!c) return { ok: false, contagens, erro: `a cópia não tem a tabela ${t}` };
      contagens[t] = Number(c.rows[0]?.n ?? 0);
    }
    return { ok: true, contagens };
  } catch (e) {
    return { ok: false, contagens, erro: `não consegui abrir a cópia: ${e?.message ?? "erro"}` };
  }
}

async function limparAntigos(pasta) {
  const arquivos = (await readdir(pasta).catch(() => []))
    .filter((f) => f.startsWith("pre-") && f.endsWith(".db"))
    .sort(); // o nome carrega a data ISO — ordem alfabética é cronológica
  const sobrando = arquivos.slice(0, Math.max(0, arquivos.length - MAX_COPIAS));
  for (const f of sobrando) await unlink(path.join(pasta, f)).catch(() => {});
  return sobrando;
}

export async function backupPreMigration(agora = new Date()) {
  const origem = caminhoDoBanco();
  if (!origem) {
    // Banco remoto (Turso): o backup é do provedor, e exigir cópia local aqui
    // travaria o boot sem proteger nada.
    return { ok: true, pulado: true, motivo: "o banco não é um arquivo local — o backup é do provedor" };
  }

  const pasta = pastaPreMigration();
  await mkdir(pasta, { recursive: true });

  const carimbo = agora.toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const destino = path.join(pasta, `pre-${carimbo}.db`);

  const db = createClient({ url: `file:${origem}` });
  try {
    // VACUUM INTO é transacional: nunca produz arquivo pela metade, mesmo com
    // o servidor escrevendo. Aspas simples duplicadas escapam o caminho.
    await db.execute(`VACUUM INTO '${destino.replace(/'/g, "''")}'`);
  } catch (e) {
    return { ok: false, erro: `não consegui copiar o banco: ${e?.message ?? "erro"}` };
  }

  const conferencia = await conferir(destino);
  if (!conferencia.ok) {
    await unlink(destino).catch(() => {});
    return { ok: false, erro: conferencia.erro };
  }

  const bytes = await stat(destino).then((s) => s.size).catch(() => 0);
  return { ok: true, arquivo: destino, bytes, conferencia: conferencia.contagens, apagados: await limparAntigos(pasta) };
}

// Executado direto pelo start.sh. Como módulo (nos testes), não roda nada.
const executadoDireto = process.argv[1] && import.meta.url === `file://${path.resolve(process.argv[1])}`;
if (executadoDireto) {
  const r = await backupPreMigration();
  if (r.pulado) {
    console.log(`▶ backup pré-migration pulado — ${r.motivo}`);
    process.exit(0);
  }
  if (!r.ok) {
    console.error(`✗ FATAL: backup pré-migration FALHOU — ${r.erro}`);
    console.error("  As migrations desta casa reconstroem tabela (CREATE new → INSERT SELECT → DROP → RENAME).");
    console.error("  Aplicá-las sem cópia conferida é o único erro irreversível deste sistema.");
    console.error("  Se você SABE o que está fazendo: PULAR_BACKUP_PRE_MIGRATION=1 nas Variables.");
    process.exit(1);
  }
  console.log(`▶ backup pré-migration ok — ${path.basename(r.arquivo)}, ${Math.round(r.bytes / 1024)} KB, ${JSON.stringify(r.conferencia)}`);
  if (r.apagados?.length) console.log(`  (${r.apagados.length} cópia(s) antiga(s) removida(s))`);
}

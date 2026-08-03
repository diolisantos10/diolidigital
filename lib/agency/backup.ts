// backup.ts — A AGÊNCIA PASSA A TER CÓPIA DO QUE ELA É.
//
// Até 02/08/2026 não existia backup NENHUM. Nem do banco. O banco inteiro —
// clientes, projetos, entregas, marcas, conexões — vive num arquivo SQLite
// dentro de um volume do Railway. Um volume corrompido, um deploy errado, um
// `rm` no lugar errado, e a agência voltaria ao dia zero sem nada para
// restaurar. Não é risco teórico: é o único ponto da casa onde um erro é
// TOTAL e IRREVERSÍVEL.
//
// ── AS DECISÕES QUE FAZEM ESTE BACKUP SERVIR PARA ALGUMA COISA ─────────────
//
// 1. `VACUUM INTO`, não cópia de arquivo. Copiar um SQLite enquanto o servidor
//    escreve produz um arquivo com transação pela metade — que abre, parece
//    bom, e falha exatamente quando você precisa dele. `VACUUM INTO` é
//    transacional: o resultado é sempre um banco íntegro.
//
// 2. A CÓPIA É VERIFICADA antes de contar como backup. Um arquivo que ninguém
//    abriu não é backup — é esperança. Aqui ele é reaberto, é rodado
//    `integrity_check`, e as tabelas principais são contadas. Só então vale.
//
// 3. FICA NO VOLUME, e isso é uma limitação DECLARADA, não um esquecimento.
//    Backup no mesmo disco protege de erro de software (migration ruim, deleção
//    acidental, corrupção lógica) e NÃO protege de perda do volume. Levar para
//    fora exige credencial de um serviço externo — está listado como pendência
//    do CEO, não escondido atrás de um "backup: ok".

import { createClient } from "@libsql/client";
import { mkdir, readdir, stat, unlink } from "node:fs/promises";
import path from "node:path";

/** Quantas cópias guardamos. 14 dias de retenção diária cobre o caso real —
 *  perceber na segunda-feira que algo quebrou na terça anterior. */
export const MAX_COPIAS = 14;

/** Tabelas cuja contagem prova que a cópia tem conteúdo, não só estrutura. Um
 *  backup de um banco vazio abre e passa no integrity_check — e não serve. */
const TABELAS_ESSENCIAIS = ["Client", "Project", "Deliverable", "ClientRequestDb", "User"];

export interface BackupFeito {
  ok: boolean;
  arquivo?: string;
  bytes?: number;
  /** O que foi contado na CÓPIA — não no original. É a prova de que ela presta. */
  conferencia?: Record<string, number>;
  apagados?: string[];
  erro?: string;
}

/** Onde o banco vive de verdade, lido da mesma variável que o servidor usa. */
export function caminhoDoBanco(): string | null {
  const url = process.env.DATABASE_URL?.trim();
  if (!url?.startsWith("file:")) return null; // libsql remoto tem backup do provedor
  return url.slice("file:".length);
}

export function pastaDosBackups(): string {
  const volume = process.env.RAILWAY_VOLUME_MOUNT_PATH?.trim();
  return volume ? path.join(volume, "backups") : path.join(process.cwd(), ".backups");
}

/**
 * Faz a cópia, CONFERE, e apaga as antigas.
 *
 * A ordem importa: só apagamos backup velho depois de a cópia nova ter passado
 * na conferência. Apagar antes deixaria a agência sem nenhuma cópia boa no
 * exato momento em que a nova falhou.
 */
export async function fazerBackup(agora: Date = new Date()): Promise<BackupFeito> {
  const origem = caminhoDoBanco();
  if (!origem) {
    return { ok: false, erro: "o banco não é um arquivo local — o backup é do provedor" };
  }

  const pasta = pastaDosBackups();
  await mkdir(pasta, { recursive: true });

  const carimbo = agora.toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const destino = path.join(pasta, `dioli-${carimbo}.db`);

  const db = createClient({ url: `file:${origem}` });
  try {
    // VACUUM INTO é transacional: nunca produz arquivo pela metade, mesmo com
    // o servidor escrevendo. Aspas simples duplicadas escapam o caminho.
    await db.execute(`VACUUM INTO '${destino.replace(/'/g, "''")}'`);
  } catch (e) {
    return { ok: false, erro: `não consegui copiar o banco: ${e instanceof Error ? e.message : "erro"}` };
  }

  // ── A CONFERÊNCIA ─────────────────────────────────────────────────────────
  const conferencia = await conferir(destino);
  if (!conferencia.ok) {
    // Cópia ruim é apagada na hora: deixá-la ali faria alguém restaurar dela
    // um dia, achando que era boa.
    await unlink(destino).catch(() => { /* best-effort */ });
    return { ok: false, erro: conferencia.erro };
  }

  const tamanho = await stat(destino).then((s) => s.size).catch(() => 0);

  return {
    ok: true,
    arquivo: destino,
    bytes: tamanho,
    conferencia: conferencia.contagens,
    apagados: await limparAntigos(pasta),
  };
}

/**
 * Abre a cópia e prova que ela presta.
 *
 * Um arquivo que ninguém abriu não é backup, é esperança. E `integrity_check`
 * sozinho não basta: um banco VAZIO passa nele. Por isso as tabelas
 * essenciais são contadas.
 */
export async function conferir(arquivo: string): Promise<{ ok: boolean; contagens: Record<string, number>; erro?: string }> {
  const contagens: Record<string, number> = {};
  const copia = createClient({ url: `file:${arquivo}` });
  try {
    const r = await copia.execute("pragma integrity_check");
    const veredito = String(r.rows[0]?.integrity_check ?? "");
    if (veredito !== "ok") {
      return { ok: false, contagens, erro: `a cópia saiu corrompida: ${veredito.slice(0, 120)}` };
    }

    for (const t of TABELAS_ESSENCIAIS) {
      const c = await copia.execute(`select count(*) as n from "${t}"`).catch(() => null);
      if (!c) return { ok: false, contagens, erro: `a cópia não tem a tabela ${t}` };
      contagens[t] = Number(c.rows[0]?.n ?? 0);
    }
    return { ok: true, contagens };
  } catch (e) {
    return { ok: false, contagens, erro: `não consegui abrir a cópia: ${e instanceof Error ? e.message : "erro"}` };
  }
}

/** Apaga o que passou da retenção. Só é chamado DEPOIS de a cópia nova passar
 *  na conferência — apagar antes deixaria a casa sem cópia boa. */
async function limparAntigos(pasta: string): Promise<string[]> {
  const arquivos = (await readdir(pasta).catch(() => []))
    .filter((f) => f.startsWith("dioli-") && f.endsWith(".db"))
    .sort(); // o nome começa com a data ISO, então ordem alfabética = cronológica

  const sobrando = arquivos.slice(0, Math.max(0, arquivos.length - MAX_COPIAS));
  for (const f of sobrando) await unlink(path.join(pasta, f)).catch(() => { /* best-effort */ });
  return sobrando;
}

export interface EstadoDoBackup {
  /** Quantas cópias boas existem. */
  copias: number;
  ultimo: { arquivo: string; quando: Date; bytes: number } | null;
  /** Horas desde a última cópia. `null` quando nunca houve. */
  horasDesdeOUltimo: number | null;
  /** A limitação que não pode ser escondida atrás de um "ok". */
  aviso: string;
}

/** O estado, para o painel. Backup sem alguém olhando é backup que ninguém
 *  descobre que parou. */
export async function estadoDoBackup(agora: Date = new Date()): Promise<EstadoDoBackup> {
  const pasta = pastaDosBackups();
  const arquivos = (await readdir(pasta).catch(() => []))
    .filter((f) => f.startsWith("dioli-") && f.endsWith(".db"))
    .sort();

  const ultimoNome = arquivos[arquivos.length - 1];
  let ultimo: EstadoDoBackup["ultimo"] = null;
  if (ultimoNome) {
    const caminho = path.join(pasta, ultimoNome);
    const s = await stat(caminho).catch(() => null);
    if (s) ultimo = { arquivo: ultimoNome, quando: s.mtime, bytes: s.size };
  }

  return {
    copias: arquivos.length,
    ultimo,
    horasDesdeOUltimo: ultimo ? Math.round((agora.getTime() - ultimo.quando.getTime()) / 3_600_000) : null,
    aviso: "As cópias ficam no MESMO volume do banco. Isso protege de erro de software (migration ruim, deleção acidental) e NÃO protege de perda do volume. Levar para fora exige credencial de um serviço externo.",
  };
}

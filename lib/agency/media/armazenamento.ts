// armazenamento.ts — ONDE O ARQUIVO MORA. SERVER-ONLY.
//
// O buraco mais caro do raio-X de 02/08/2026: nenhum byte de mídia era gravado
// em lugar nenhum. A dona do salão não tinha por onde mandar os vídeos, o pet
// shop não tinha por onde mandar o logo, e a arte gerada pela IA virava base64
// dentro de uma coluna de texto do banco — ou uma URL da OpenAI que expira em
// uma hora.
//
// ONDE: o volume persistente do Railway, o mesmo que já guarda o banco. O
// `scripts/start.sh` trata caminho sob `RAILWAY_VOLUME_MOUNT_PATH` como
// armazenamento durável e recusa qualquer outro como efêmero — a mídia herda
// exatamente essa garantia. **`public/` NÃO serve:** é copiado no build, então
// o que for escrito lá em tempo de execução some no próximo deploy.
//
// O QUE ISSO CUSTA, dito com todas as letras:
//   • É o MESMO volume do banco. Disco cheio derruba o banco junto — por isso
//     a cota abaixo não é enfeite, é o que separa "acabou o espaço" de
//     "perdemos o cliente".
//   • Não há CDN: todo byte passa pelo processo Node.
//   • Backup do BANCO existe desde 03/08/2026 (lib/agency/backup.ts), diário e
//     conferido. A MÍDIA continua sem cópia: são gigabytes, e copiar dentro do
//     mesmo volume não protegeria de nada.
//   • (histórico) Não havia backup — nem do banco. Guardar mídia aqui aumenta o que se
//     perde se o volume morrer, sem aumentar a proteção. Está na lista do CEO.
//
// Quando migrar para armazenamento externo, só `caminhoAbsoluto` muda. As
// rotas e o modelo continuam iguais — é por isso que este é o desenho mínimo
// certo, e não apenas o mais barato.

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, writeFile, readFile, stat, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/db/client";
// O NOME DO ARQUIVO É ENTRADA DE ATACANTE, e este é o ponto de ORIGEM dele: o
// que for gravado aqui reaparece na tela, na resposta HTTP e — desde 16/08 — no
// prompt da triagem. `slice(0, 200)` cortava tamanho e mais nada: `\n` dentro do
// nome atravessava tudo e quebrava a linha do prompt em duas (B4).
import { cortarNomeDeArquivo } from "@/lib/agency/comercial/nome-de-anexo";

/** Teto por arquivo. Vídeo de celular vai de 20 a 200 MB; 120 MB cobre a
 *  maioria sem deixar um único envio comer o volume inteiro. */
export const MAX_BYTES_POR_ARQUIVO = 120 * 1024 * 1024;

/** Teto por workspace. É a trava que impede o primeiro cliente que mandar dez
 *  vídeos de derrubar o banco — que vive no mesmo volume.
 *
 *  2 GB, e o número não é redondo por acaso: em 02/08/2026 o volume do Railway
 *  foi medido em **4,6 GB** (`df` no start.sh do deploy `7f08e819`). Deixar a
 *  cota em 3 GB dava ao primeiro workspace dois terços do disco — e o banco
 *  mora ali junto. Se o volume crescer, isto sobe por variável, sem deploy. */
export const COTA_BYTES_POR_WORKSPACE = Number(process.env.MEDIA_COTA_BYTES ?? 2 * 1024 * 1024 * 1024);

/** O que a agência aceita receber. Lista fechada: MIME que não está aqui é
 *  recusado na porta, não sanitizado depois. */
export const MIMES_ACEITOS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "text/plain": "txt",
  "text/csv": "csv",
  // SVG entrou em 02/08/2026 e é a ÚNICA exceção à regra de "MIME que o
  // navegador executa não entra". Motivo: um logo sem vetor não é um logo — o
  // cliente precisa dele para gravar em fachada, camiseta e cardápio.
  //
  // O que torna isso seguro é o modo de SERVIR, não o de aceitar: SVG nunca é
  // devolvido `inline` (ver PODE_ABRIR_NA_TELA em app/api/media/[id]), sempre
  // como download, sempre com nosniff. Um SVG baixado é um arquivo; um SVG
  // aberto no nosso domínio seria script rodando com a nossa origem.
  "image/svg+xml": "svg",
};

// SVG DE UPLOAD — por que a porta abriu em 09/08/2026.
//
// Até aqui, SVG que chegava de fora era RECUSADO: só passava o que a casa
// gerava. A intenção estava certa (SVG é XML e XML carrega script), mas o
// preço apareceu em produção — o CityJobs mandou os seis logos da marca, nos
// quatro formatos, e a agência recusou todos. Ordem do CEO no mesmo dia:
// *"tem que aceitar esse formato sim"*.
//
// Recusar era jogar fora o MELHOR material que um cliente pode mandar: logo em
// PNG é logo que já perdeu resolução — não serve para fachada, camiseta nem
// impressão.
//
// O conserto certo não é aceitar cru; é LIMPAR NA ENTRADA. E a limpeza é a
// terceira camada, não a primeira:
//   1. `PODE_ABRIR_NA_TELA` (app/api/media/[id]) NÃO inclui SVG → todo SVG sai
//      como `attachment`, nunca `inline`. Um SVG baixado é arquivo inerte.
//   2. `X-Content-Type-Options: nosniff` na mesma rota.
//   3. `limparSvg` abaixo, que remove o executável ANTES de gravar o byte.
//
// Dito com todas as letras, porque camada que se vende como perfeita é a que
// ninguém revisa: **limpeza por expressão regular é piso, não teto.** SVG é XML
// e existe escape que um regex não pega. A garantia que sustenta este arquivo
// continua sendo o MODO DE SERVIR (1 e 2); a limpeza é profundidade, para que
// um byte perigoso não fique guardado esperando alguém servir inline por engano.

/** O que é removido de um SVG que chega de fora. Cada padrão tem nome porque o
 *  resultado devolve o que foi removido — evidência junto do fato, não depois
 *  (guardrail 6). */
const PERIGO_NO_SVG: Array<{ nome: string; padrao: RegExp }> = [
  { nome: "script", padrao: /<script[\s\S]*?<\/script\s*>/gi },
  { nome: "script-vazio", padrao: /<script\b[^>]*\/?>/gi },
  // Abre HTML dentro do SVG — é por onde um <iframe> entraria.
  { nome: "foreignObject", padrao: /<foreignObject[\s\S]*?<\/foreignObject\s*>/gi },
  // DOCTYPE com entidade é XXE e "billion laughs".
  { nome: "doctype", padrao: /<!DOCTYPE[\s\S]*?>/gi },
  { nome: "entidade", padrao: /<!ENTITY[\s\S]*?>/gi },
  // onload, onclick, onmouseover… a porta mais usada num SVG.
  { nome: "manipulador-de-evento", padrao: /\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi },
  { nome: "url-javascript", padrao: /(?:xlink:href|href|src)\s*=\s*(?:"\s*javascript:[^"]*"|'\s*javascript:[^']*'|javascript:[^\s>]+)/gi },
  // data: que vira documento executável (text/html, SVG aninhado).
  { nome: "url-data-executavel", padrao: /(?:xlink:href|href|src)\s*=\s*(?:"\s*data:(?:text\/html|image\/svg\+xml)[^"]*"|'\s*data:(?:text\/html|image\/svg\+xml)[^']*')/gi },
  // Referência que busca byte em servidor de terceiro na hora de abrir: vaza
  // quem abriu e deixa o conteúdo final fora do nosso controle.
  // `xmlns="http://www.w3.org/2000/svg"` NÃO casa aqui, de propósito — é
  // declaração de namespace, não busca de recurso.
  { nome: "referencia-externa", padrao: /(?:xlink:href|href|src)\s*=\s*(?:"\s*(?:https?:)?\/\/[^"]*"|'\s*(?:https?:)?\/\/[^']*')/gi },
  // <set attributeName="onload" …> reintroduz manipulador por animação.
  { nome: "animacao-que-vira-evento", padrao: /<(?:set|animate)\b[^>]*attributeName\s*=\s*["']?\s*on[a-z]+[\s\S]*?(?:\/>|<\/(?:set|animate)\s*>)/gi },
];

export type ResultadoDaLimpeza =
  | { ok: true; bytes: Buffer; removeu: string[] }
  | { ok: false; motivo: string };

/**
 * Limpa um SVG que veio de fora. Devolve os bytes já sem o que executa.
 *
 * Não recusa por conter perigo — REMOVE. Um logo com `onload` continua sendo o
 * logo do cliente depois que o `onload` sai, e recusar o arquivo inteiro foi
 * exatamente o erro que travou o CityJobs. Só recusa o que não é SVG de
 * verdade: aí o MIME está mentindo e nada garante o resto.
 */
export function limparSvg(bytes: Buffer): ResultadoDaLimpeza {
  const texto = bytes.toString("utf8");
  if (!/<svg[\s>]/i.test(texto)) {
    return {
      ok: false,
      motivo: "Esse arquivo diz ser SVG mas não parece um SVG. Exporte de novo pelo seu editor e mande outra vez.",
    };
  }

  let limpo = texto;
  const removeu: string[] = [];
  for (const { nome, padrao } of PERIGO_NO_SVG) {
    // `padrao` é global: zerar `lastIndex` evita que a chamada anterior desloque
    // o início da varredura e deixe passar a primeira ocorrência.
    padrao.lastIndex = 0;
    if (padrao.test(limpo)) {
      removeu.push(nome);
      padrao.lastIndex = 0;
      limpo = limpo.replace(padrao, "");
    }
  }

  return { ok: true, bytes: Buffer.from(limpo, "utf8"), removeu };
}

/** A raiz da mídia. No Railway, dentro do volume; fora dele, um diretório local
 *  de desenvolvimento. */
export function raizDaMidia(): string {
  const volume = process.env.RAILWAY_VOLUME_MOUNT_PATH?.trim();
  if (volume) return path.join(volume, "media");
  return path.join(process.cwd(), ".media");
}

/** O caminho absoluto de um arquivo. Derivado do id — NUNCA do nome enviado
 *  pelo cliente, que é o que mata travessia de diretório por construção. */
export function caminhoAbsoluto(storagePath: string): string {
  return path.join(raizDaMidia(), storagePath);
}

export interface ArquivoGuardado {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
}

export interface FalhaAoGuardar {
  erro: string;
  /** Motivo legível para mostrar ao cliente, sem jargão. */
  motivo: string;
}

export type ResultadoDeGuardar = { ok: true; arquivo: ArquivoGuardado } | { ok: false } & FalhaAoGuardar;

/**
 * Guarda um arquivo e registra o dono.
 *
 * Idempotente por conteúdo: o mesmo arquivo enviado duas vezes pelo mesmo dono
 * devolve o registro que já existe, em vez de duplicar bytes no volume. É o
 * caso comum — cliente que reenvia porque não teve certeza se foi.
 */
export async function guardarArquivo(input: {
  bytes: Buffer;
  fileName: string;
  mimeType: string;
  workspaceId: string;
  clientRequestId?: string | null;
  clientId?: string | null;
  projectId?: string | null;
  kind?: "inbound" | "generated" | "deliverable";
  uploadedBy?: string;
}): Promise<ResultadoDeGuardar> {
  const ext = MIMES_ACEITOS[input.mimeType];
  if (!ext) {
    return {
      ok: false,
      erro: "mime_recusado",
      motivo: `Não aceitamos esse tipo de arquivo (${input.mimeType || "desconhecido"}). Mande foto, vídeo, PDF ou documento.`,
    };
  }
  if (input.bytes.length === 0) {
    return { ok: false, erro: "vazio", motivo: "O arquivo chegou vazio. Tente enviar de novo." };
  }

  // SVG de fora é LIMPO aqui, antes de tudo o que vem depois. A ordem não é
  // estética: tamanho, cota, sha256 e o byte gravado passam a ser todos do
  // arquivo JÁ limpo. Limpar depois de hashear guardaria um sha256 de um
  // conteúdo diferente do que está no disco — e o hash é o que faz o reenvio do
  // mesmo arquivo devolver o registro existente em vez de duplicar bytes.
  //
  // O que a casa gera não passa pela limpeza: nós o produzimos, e o molde do
  // logo usa recurso que a limpeza removeria.
  let bytes = input.bytes;
  const veioDeFora = input.kind !== "generated" && input.kind !== "deliverable";
  if (input.mimeType === "image/svg+xml" && veioDeFora) {
    const limpeza = limparSvg(bytes);
    if (!limpeza.ok) {
      return { ok: false, erro: "svg_invalido", motivo: limpeza.motivo };
    }
    bytes = limpeza.bytes;
  }

  if (bytes.length > MAX_BYTES_POR_ARQUIVO) {
    const mb = Math.round(MAX_BYTES_POR_ARQUIVO / 1024 / 1024);
    return {
      ok: false,
      erro: "grande_demais",
      motivo: `Esse arquivo passa de ${mb} MB. Se for vídeo, mande em qualidade menor ou dividido.`,
    };
  }

  // A cota é conferida ANTES de escrever. Escrever e depois checar deixaria o
  // volume estourar por um instante — e é nesse instante que o banco cai.
  const usado = await prisma.mediaAsset.aggregate({
    where: { workspaceId: input.workspaceId },
    _sum: { sizeBytes: true },
  });
  if ((usado._sum.sizeBytes ?? 0) + bytes.length > COTA_BYTES_POR_WORKSPACE) {
    return {
      ok: false,
      erro: "cota_estourada",
      motivo: "O espaço de arquivos desta conta acabou. Avise a equipe — vamos liberar espaço.",
    };
  }

  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const dono = input.clientRequestId ?? input.clientId ?? input.workspaceId;

  // Mesmo conteúdo, mesmo dono → devolve o que já existe.
  const jaExiste = await prisma.mediaAsset.findFirst({
    where: { sha256, workspaceId: input.workspaceId, clientRequestId: input.clientRequestId ?? undefined },
  });
  if (jaExiste) {
    return { ok: true, arquivo: paraArquivo(jaExiste) };
  }

  const id = `med_${sha256.slice(0, 8)}_${Date.now().toString(36)}`;
  const storagePath = path.join(sanitizarPasta(dono), `${id}.${ext}`);
  const destino = caminhoAbsoluto(storagePath);

  await mkdir(path.dirname(destino), { recursive: true });
  // Nunca sobrescrever: durante a troca de deploy dois containers acessam o
  // mesmo volume, e arquivo imutável com nome único é o que torna isso seguro.
  if (existsSync(destino)) {
    return { ok: false, erro: "colisao", motivo: "Não consegui guardar o arquivo. Tente de novo." };
  }
  await writeFile(destino, bytes);

  const registro = await prisma.mediaAsset.create({
    data: {
      id,
      workspaceId: input.workspaceId,
      clientRequestId: input.clientRequestId ?? null,
      clientId: input.clientId ?? null,
      projectId: input.projectId ?? null,
      kind: input.kind ?? "inbound",
      // Corta E desmonta a quebra de linha. O desfiguramento de cerca não mora
      // aqui de propósito: mutilar `logo---final.png` na tela do cliente para se
      // defender de prompt seria pagar na porta errada. Quem monta prompt lava o
      // nome de novo (`nomeParaCerca`), que é onde o risco existe.
      fileName: cortarNomeDeArquivo(input.fileName, 200),
      mimeType: input.mimeType,
      sizeBytes: bytes.length,
      sha256,
      storagePath,
      uploadedBy: input.uploadedBy ?? "cliente",
    },
  });

  return { ok: true, arquivo: paraArquivo(registro) };
}

/** Lê os bytes de um arquivo já registrado. Devolve null se o registro existe
 *  mas o byte sumiu — que é um estado possível e precisa ser tratado, não
 *  ignorado: volume trocado, restore parcial, arquivo apagado à mão. */
export async function lerArquivo(storagePath: string): Promise<Buffer | null> {
  const caminho = caminhoAbsoluto(storagePath);
  try {
    await stat(caminho);
    return await readFile(caminho);
  } catch {
    return null;
  }
}

/** Apaga byte e registro. Usado quando o cliente pede exclusão de dados. */
export async function apagarArquivo(id: string): Promise<boolean> {
  const registro = await prisma.mediaAsset.findUnique({ where: { id } });
  if (!registro) return false;
  await unlink(caminhoAbsoluto(registro.storagePath)).catch(() => { /* byte já não estava lá */ });
  await prisma.mediaAsset.delete({ where: { id } });
  return true;
}

/** Quanto esta conta já usou, e quanto sobra. O painel precisa disso ANTES de
 *  o disco encher — depois, a falha aparece como "deploy quebrado", longe da
 *  causa real. */
export async function espacoUsado(workspaceId: string): Promise<{ usadoBytes: number; cotaBytes: number; livreBytes: number }> {
  const r = await prisma.mediaAsset.aggregate({ where: { workspaceId }, _sum: { sizeBytes: true } });
  const usadoBytes = r._sum.sizeBytes ?? 0;
  return { usadoBytes, cotaBytes: COTA_BYTES_POR_WORKSPACE, livreBytes: Math.max(0, COTA_BYTES_POR_WORKSPACE - usadoBytes) };
}

// ─── Internos ───────────────────────────────────────────────────────────────

function paraArquivo(r: { id: string; fileName: string; mimeType: string; sizeBytes: number }): ArquivoGuardado {
  return { id: r.id, fileName: r.fileName, mimeType: r.mimeType, sizeBytes: r.sizeBytes, url: `/api/media/${r.id}` };
}

/** Só o que é seguro num nome de pasta. O id vem do banco e já é seguro, mas
 *  esta função existe para que a garantia não dependa de quem chama. */
function sanitizarPasta(bruto: string): string {
  const limpo = bruto.replace(/[^a-zA-Z0-9_-]/g, "");
  return limpo.length > 0 ? limpo.slice(0, 60) : "sem-dono";
}


// ─── Link público assinado ──────────────────────────────────────────────────
//
// A Meta NÃO recebe o arquivo: ela recebe uma URL e vai buscar o conteúdo com
// os servidores dela. Isso quebra a regra normal da casa — a rota de mídia
// exige token do portal, e a Meta não tem token nenhum.
//
// A saída não é abrir o arquivo para o mundo. É um link ASSINADO e com PRAZO:
// só quem tem a assinatura acessa, e só durante a janela da publicação. Sem o
// prazo, a URL vazada numa aba aberta viraria acesso permanente ao material do
// cliente.

/** Janela do link público. 30 min cobre com folga o tempo de a Meta buscar a
 *  mídia e publicar, e é curta o bastante para um link vazado não servir. */
const VALIDADE_DO_LINK_MS = 30 * 60_000;

function segredoDeAssinatura(): string {
  // O mesmo segredo da sessão. Se ele não existir, NÃO assinamos nada: um link
  // "assinado" com segredo previsível é pior que nenhum, porque aparenta
  // proteção.
  const s = process.env.AUTH_SECRET?.trim() || process.env.JWT_SECRET?.trim();
  if (!s) throw new Error("AUTH_SECRET ausente — não é possível assinar link de mídia");
  return s;
}

function assinar(id: string, expiraEm: number): string {
  return createHmac("sha256", segredoDeAssinatura()).update(`${id}.${expiraEm}`).digest("hex");
}

/** O caminho assinado, relativo. Quem chama concatena com o domínio público. */
export function caminhoPublicoAssinado(id: string, validadeMs = VALIDADE_DO_LINK_MS): string {
  const expiraEm = Date.now() + validadeMs;
  return `/api/media/${id}?exp=${expiraEm}&sig=${assinar(id, expiraEm)}`;
}

/** Confere a assinatura. Comparação em tempo constante — comparar string de
 *  assinatura com `===` vaza, byte a byte, qual era a assinatura certa. */
export function assinaturaValida(id: string, exp: string | null, sig: string | null): boolean {
  if (!exp || !sig) return false;
  const expiraEm = Number(exp);
  if (!Number.isFinite(expiraEm) || expiraEm < Date.now()) return false;
  let esperada: string;
  try { esperada = assinar(id, expiraEm); } catch { return false; }
  const a = Buffer.from(esperada, "utf8");
  const b = Buffer.from(sig, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

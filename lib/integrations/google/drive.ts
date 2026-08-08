// drive.ts — O MATERIAL DE MARCA DO CLIENTE, buscado no Drive DELE.
//
// O buraco que isto fecha (auditoria do CityJobs, 06/08/2026): a esteira não
// tinha de onde tirar logo, foto de produto, captura de tela nem material do
// cliente. O design entregava foto genérica da IA, o produto do cliente não
// aparecia na peça — 0 de 6 peças nossas mostravam o produto, contra 7 de 10
// das de referência (docs/projetos/foocci/comparativo-06-08.md). E o logo da
// Foocci é, até hoje, o nome escrito em fonte, porque ninguém tem onde buscar
// o arquivo real.
//
// ── SÓ LEITURA, E SÓ DO QUE O CLIENTE ESCOLHEU ──────────────────────────────
//
// Escopo `drive.file`: acesso POR ARQUIVO, só ao que o usuário abriu com o app
// pelo Google Picker (fonte: docs/plataformas/google/fontes/drive-api-escopos.md).
// É escopo NÃO SENSÍVEL — verificação simplificada, sem avaliação de segurança
// de terceiros. `drive` e `drive.readonly` são RESTRITOS: exigem verificação
// restrita e, porque a casa GUARDA os bytes no próprio volume, avaliação de
// segurança. Meses. Não pedimos, e não é para pedir.
//
// Nenhuma escrita no Drive do cliente sai daqui. Nem uma. Este arquivo lê
// metadado e baixa bytes — é tudo.
//
// ── O TOKEN, E A VERDADE SOBRE ELE ──────────────────────────────────────────
//
// Access token do Google vive 1 hora; renovamos com folga de 5 min. O REFRESH
// token é o que sustenta a conexão — e com o app OAuth em status "Teste" ele
// **expira em 7 dias** (fonte: fontes/oauth2-tokens-e-expiracao.md, "um status
// de publicação de 'Teste' recebe um token de atualização que expira em sete
// dias"). O cliente conectaria, funcionaria, e quebraria sozinho parecendo
// defeito nosso. Por isso `expirou` é um caso NORMAL aqui, com frase que diz a
// verdade — não um erro genérico.

import { prisma } from "@/lib/db/client";
import { encryptSecret, decryptSecret } from "@/lib/security/crypto";
import {
  materialAutorizado,
  origemValida,
  type ConexaoParaDecidir,
  type MaterialParaDecidir,
  type MotivoDaRecusa,
} from "@/lib/integrations/google/escolha-de-material";

const HOST_DRIVE = "https://www.googleapis.com/drive/v3";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const FOLGA_MS = 5 * 60_000;

/** Teto por arquivo baixado do Drive. Um vídeo de 2 GB derrubaria o processo
 *  antes de chegar ao disco — e o disco é o mesmo do banco. */
export const MAX_BYTES_DO_DRIVE = 60 * 1024 * 1024;

export type MotivoDoDrive = MotivoDaRecusa | "token_morto" | "sem_permissao" | "nao_encontrado" | "grande_demais" | "erro_do_google";

export interface ResultadoDoDrive<T = unknown> {
  ok: boolean;
  dados?: T;
  motivo?: MotivoDoDrive;
  /** Sempre em português, sempre dizendo o que o leitor deve fazer. */
  erro?: string;
}

/**
 * Traduz o erro do Google numa frase de gente.
 *
 * O 404 do Drive com escopo `drive.file` quase nunca é "sumiu": é "este app não
 * tem acesso a esse arquivo". Dizer "não encontrado" mandaria o cliente
 * procurar no lixo do Drive por um arquivo que está lá.
 */
export function traduzirErroDoDrive<T>(status: number, corpo: string): ResultadoDoDrive<T> {
  if (status === 401) {
    return { ok: false, motivo: "token_morto", erro: "o acesso ao seu Drive expirou — reconecte para a equipe continuar buscando seu material" };
  }
  if (status === 403) {
    const insuficiente = /insufficientPermissions|insufficient_scope/i.test(corpo);
    return {
      ok: false,
      motivo: insuficiente ? "escopo_insuficiente" : "sem_permissao",
      erro: insuficiente
        ? "a autorização do Drive não cobre este arquivo — o cliente precisa escolhê-lo de novo no seletor do Google"
        : "o Google recusou o acesso a este arquivo do Drive",
    };
  }
  if (status === 404) {
    return {
      ok: false,
      motivo: "nao_encontrado",
      erro: "este arquivo não está mais ao alcance do app — pode ter sido movido, apagado, ou a escolha foi desfeita no Drive",
    };
  }
  return { ok: false, motivo: "erro_do_google", erro: `o Google respondeu ${status} ao buscar o arquivo` };
}

interface ConexaoDoDrive {
  id: string;
  workspaceId: string;
  clientId: string;
  status: string;
  escopos: string;
  tokenExpiresAt: Date | null;
  accessTokenEncrypted: string;
  refreshTokenEncrypted: string | null;
}

/** A forma que a trava precisa. Isolada para a decisão não depender do Prisma. */
export function paraDecidir(c: ConexaoDoDrive | null): ConexaoParaDecidir | null {
  if (!c) return null;
  return {
    status: c.status,
    escopos: c.escopos,
    tokenExpiresAt: c.tokenExpiresAt,
    temRefresh: !!c.refreshTokenEncrypted,
  };
}

/**
 * Um access token válido para a conexão de Drive, renovando quando precisa.
 *
 * Grava a renovação: sem persistir, cada chamada renovaria de novo e o Google
 * passa a limitar o app por excesso de refresh.
 */
export async function comTokenDoDrive(
  connectionId: string,
): Promise<{ token: string; conexao: ConexaoDoDrive } | null> {
  const c = (await prisma.googleDriveConnection.findUnique({ where: { id: connectionId } })) as ConexaoDoDrive | null;
  if (!c || c.status === "revoked") return null;

  const valido = c.tokenExpiresAt && c.tokenExpiresAt.getTime() - Date.now() > FOLGA_MS;
  if (valido) {
    const t = decryptSecret(c.accessTokenEncrypted);
    if (t) return { token: t, conexao: c };
  }

  const refresh = c.refreshTokenEncrypted ? decryptSecret(c.refreshTokenEncrypted) : null;
  if (!refresh) {
    await marcarExpirada(c.id);
    return null;
  }

  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId, client_secret: clientSecret,
      refresh_token: refresh, grant_type: "refresh_token",
    }),
  }).catch(() => null);

  // AQUI é onde o app em "Teste" morre no 8º dia. `invalid_grant` = o refresh
  // token venceu ou foi revogado. Marcar expirada é o que faz a tela do cliente
  // dizer "reconecte" em vez de a esteira falhar em silêncio.
  if (!res?.ok) {
    await marcarExpirada(c.id);
    return null;
  }

  const j = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number };
  if (!j.access_token) {
    await marcarExpirada(c.id);
    return null;
  }

  const expira = new Date(Date.now() + (j.expires_in ?? 3600) * 1000);
  await prisma.googleDriveConnection.update({
    where: { id: c.id },
    data: { accessTokenEncrypted: encryptSecret(j.access_token), tokenExpiresAt: expira, status: "connected" },
  }).catch(() => { /* best-effort: o token novo vale para esta chamada de todo jeito */ });

  return { token: j.access_token, conexao: { ...c, status: "connected", tokenExpiresAt: expira } };
}

async function marcarExpirada(id: string): Promise<void> {
  await prisma.googleDriveConnection.update({ where: { id }, data: { status: "expired" } })
    .catch(() => { /* best-effort */ });
}

// ─── Leitura ────────────────────────────────────────────────────────────────

export interface ArquivoDoDrive {
  fileId: string;
  nome: string;
  mimeType: string;
  tamanhoBytes: number;
  ehPasta: boolean;
}

export const MIME_DE_PASTA = "application/vnd.google-apps.folder";

/** Os campos que pedimos ao Google. Lista fechada: `fields=*` traria o dono, os
 *  compartilhamentos e o histórico — dados de pessoas que não pediram nada a
 *  esta agência. */
const CAMPOS = "id,name,mimeType,size";

/**
 * O metadado de um arquivo que o cliente escolheu.
 *
 * Usado logo depois do seletor, para gravar nome e tipo de verdade — o Picker
 * devolve o que o navegador diz, e o navegador é do cliente.
 */
export async function metadadosDoArquivo(
  connectionId: string,
  fileId: string,
): Promise<ResultadoDoDrive<ArquivoDoDrive>> {
  const t = await comTokenDoDrive(connectionId);
  if (!t) return { ok: false, motivo: "conexao_expirada", erro: "o acesso ao seu Drive expirou — reconecte" };

  const url = `${HOST_DRIVE}/files/${encodeURIComponent(fileId)}?fields=${encodeURIComponent(CAMPOS)}&supportsAllDrives=true`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${t.token}` } }).catch(() => null);
  if (!res) return { ok: false, motivo: "erro_do_google", erro: "não consegui falar com o Google Drive" };
  if (!res.ok) return traduzirErroDoDrive(res.status, await res.text().catch(() => ""));

  const j = (await res.json().catch(() => ({}))) as { id?: string; name?: string; mimeType?: string; size?: string };
  return {
    ok: true,
    dados: {
      fileId: j.id ?? fileId,
      nome: j.name ?? "",
      mimeType: j.mimeType ?? "",
      tamanhoBytes: Number(j.size ?? 0) || 0,
      ehPasta: j.mimeType === MIME_DE_PASTA,
    },
  };
}

/**
 * Baixa os bytes de UM material — e só se a trava deixar.
 *
 * A ordem importa e é o ponto do arquivo: a autorização é conferida **antes de
 * qualquer requisição**. Recusa não gasta rede, não gasta cota do Google, e não
 * depende de o Google dizer não por nós. É o que separa trava de aviso.
 */
export async function baixarMaterial(
  driveMaterialId: string,
): Promise<ResultadoDoDrive<{ bytes: Buffer; nome: string; mimeType: string }>> {
  const m = await prisma.driveMaterial.findUnique({ where: { id: driveMaterialId } });
  if (!m) return { ok: false, motivo: "sem_conexao", erro: "material do Drive não encontrado no sistema" };

  const conexao = m.connectionId
    ? ((await prisma.googleDriveConnection.findUnique({ where: { id: m.connectionId } })) as ConexaoDoDrive | null)
    : null;

  const material: MaterialParaDecidir = {
    fileId: m.fileId,
    nome: m.nome,
    ehPasta: m.ehPasta,
    papel: m.papel,
    papelConfirmadoEm: m.papelConfirmadoEm,
    origem: m.origem,
  };

  // ── A TRAVA. Antes da rede. ───────────────────────────────────────────────
  const veredito = materialAutorizado(paraDecidir(conexao), material);
  if (!veredito.pode) {
    return { ok: false, motivo: veredito.motivo, erro: veredito.recado };
  }

  // ── SÓ MATERIAL DO GOOGLE SE BAIXA DO GOOGLE (08/08/2026) ────────────────
  //
  // Desde a origem do material, a mesma tabela guarda também o que o cliente
  // arrastou no portal (`origem: "envio_direto"`, `connectionId` nulo). Esses
  // bytes JÁ SÃO da casa — não existe o que buscar, e chegar aqui com um deles
  // é erro de quem chamou, não falha de rede.
  //
  // ⚠️ A ORDEM É DELIBERADA: esta guarda vem DEPOIS da trava, nunca antes.
  // Posta antes, ela responderia "sem_conexao" para arquivo sem papel declarado
  // e para pasta — apagando os motivos próprios que a trava existe para dar, e
  // que a tela do cliente mostra. A trava decide PRIMEIRO; isto só impede a
  // requisição que não faz sentido.
  if (origemValida(m.origem) !== "drive" || !m.connectionId) {
    return {
      ok: false,
      motivo: "sem_conexao",
      erro: "este material não veio do Google Drive — os arquivos dele já estão guardados na casa",
    };
  }

  const t = await comTokenDoDrive(m.connectionId);
  if (!t) return { ok: false, motivo: "conexao_expirada", erro: "o acesso ao seu Drive expirou — reconecte" };

  const url = `${HOST_DRIVE}/files/${encodeURIComponent(m.fileId)}?alt=media&supportsAllDrives=true`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${t.token}` } }).catch(() => null);
  if (!res) return { ok: false, motivo: "erro_do_google", erro: "não consegui falar com o Google Drive" };
  if (!res.ok) return traduzirErroDoDrive(res.status, await res.text().catch(() => ""));

  // O tamanho declarado pode mentir; o que chega é o que conta. Conferimos os
  // dois: o declarado evita começar o download, o real evita estourar o volume.
  const declarado = Number(res.headers.get("content-length") ?? 0);
  if (declarado > MAX_BYTES_DO_DRIVE) {
    return { ok: false, motivo: "grande_demais", erro: `"${m.nome}" passa de ${Math.round(MAX_BYTES_DO_DRIVE / 1024 / 1024)} MB — mande uma versão menor` };
  }

  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length > MAX_BYTES_DO_DRIVE) {
    return { ok: false, motivo: "grande_demais", erro: `"${m.nome}" passa de ${Math.round(MAX_BYTES_DO_DRIVE / 1024 / 1024)} MB — mande uma versão menor` };
  }

  return { ok: true, dados: { bytes, nome: m.nome, mimeType: m.mimeType } };
}

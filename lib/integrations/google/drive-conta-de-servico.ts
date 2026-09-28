// drive-conta-de-servico.ts — A PASTA DA MARCA, LIDA POR CONTA DE SERVIÇO.
//
// A diferença deste arquivo para `drive.ts`: `drive.ts` fala com o Drive DO
// CLIENTE, com o consentimento dele arquivo por arquivo (OAuth, escopo
// `drive.file`). Este fala com UMA pasta que o cliente COMPARTILHOU com uma
// conta de serviço da casa — o fluxo que a ficha de despacho (B3, 27/09/2026)
// registra como "PODE COM AJUSTE" por ordem do CEO.
//
// PARECER: `docs/plataformas/google/pareceres/2026-09-27-pasta-do-cliente-por-
// conta-de-servico.md` — ✅ PODE COM AJUSTE. Registrado nesta mesma data, então
// a "pendência de registro" que este comentário citava (achada pela revisão
// de segurança S4) já foi fechada — não a reabra sem checar o arquivo. As duas
// divergências que este cabeçalho apontava (§4 do parecer) FORAM FECHADAS em
// 1D-D2 (27/09/2026), em OUTRO arquivo — não aqui:
//   • cadência/filtro incremental (`modifiedTime`) — `vigia-da-entrada.ts`,
//     que reúsa `listarFilhos(token, id, { desde })` (o parâmetro que este
//     arquivo ganhou nessa mesma leva);
//   • apagar o material ao fim do contrato do cliente —
//     `apagarMaterialDoDriveAoEncerrarContrato`, também em
//     `vigia-da-entrada.ts`, ligada a `cancelarAssinatura`
//     (`lib/agency/financeiro/assinatura.ts`) — só para clientes com
//     `AssinaturaRecorrente.clientId`; ver a lacuna registrada em
//     `docs/pendencias.md` para quem fica de fora.
//
// ── O QUE A FICHA EXIGE, E ONDE ISTO OBEDECE ────────────────────────────────
//
//   • Conta de serviço DEDICADA, só `drive.readonly`, SEM delegação de
//     domínio — este arquivo nunca usa `sub` no JWT, e o escopo pedido é
//     SEMPRE `ESCOPO_LEITURA` abaixo. Não há segundo escopo em lugar nenhum.
//   • SEM watch — leitura é sempre files.list sob pedido (`conferirPastaDaMarca`,
//     `importarMaterialDaPasta`). A vigia periódica de "/Entrada de material"
//     é do bloco 1D; este arquivo não agenda nada sozinho.
//   • Guarda só o que a esteira usa — nenhuma cópia de metadado além do que os
//     dois contratos abaixo devolvem.
//
// ── A CREDENCIAL AINDA NÃO EXISTE, E O CÓDIGO PRECISA SER HONESTO SOBRE ISSO ─
//
// `GOOGLE_SA_JSON` é provisionada pelo CEO — ainda não existe quando este
// arquivo foi escrito. Sem ela, TODA função pública aqui recusa com a MESMA
// frase, ANTES de qualquer rede: "a conta de serviço do Drive ainda não foi
// configurada". Não é erro — é o estado normal até o CEO provisionar.
//
// A CHAVE PRIVADA NUNCA SAI DAQUI: `credencialDaContaDeServico()` — o único
// contrato exportado que fala de credencial — devolve só o e-mail. A chave
// privada mora em `lerCredencialCompleta`, interna, e só é usada para ASSINAR
// o JWT, nunca para logar, devolver ou serializar.
//
// ── AUTENTICAÇÃO: JWT ASSINADO NA MÃO, SEM NOVA DEPENDÊNCIA ─────────────────
//
// `googleapis` e `google-auth-library` NÃO estão no package.json, e este
// despacho não roda `npm install` (guarda do próprio despacho). O fluxo de
// conta de serviço do Google é o "JWT Bearer Token" documentado — dá para
// implementar inteiro com `node:crypto` (RS256) contra o endpoint de token
// público, sem biblioteca nenhuma. É o que este arquivo faz.

import { createHash, createSign } from "node:crypto";
import { prisma } from "@/lib/db/client";
import { guardarArquivo, MAX_BYTES_POR_ARQUIVO } from "@/lib/agency/media/armazenamento";

const DRIVE_API = "https://www.googleapis.com/drive/v3";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

/** O único escopo que esta casa pede para esta conta de serviço. Sem escopo de
 *  escrita, sem delegação de domínio — exatamente o que o parecer aprovou. */
export const ESCOPO_LEITURA = "https://www.googleapis.com/auth/drive.readonly";

/** A frase única de "sem credencial". Uma constante, não um literal repetido:
 *  é a frase que o teste trava, e a que a tela mostra. */
export const FRASE_SEM_CREDENCIAL = "a conta de serviço do Drive ainda não foi configurada";

/**
 * O AVISO DE ONBOARDING — fonte única do texto que a tela de cadastro mostra.
 *
 * `{email}` é o placeholder que quem renderiza substitui pelo
 * `contaDeServico.email` que a rota GET devolve. Exportado como função (não
 * string fixa) para não deixar a interpolação por conta de quem consome —
 * errar essa substituição produziria a tela pedindo para compartilhar com
 * "{email}" literal.
 */
export function avisoDeOnboarding(emailDaConta: string): string {
  return (
    `Compartilhe a pasta RAIZ da marca (não cada subpasta separadamente) com ` +
    `o e-mail da conta de serviço: ${emailDaConta}. Dê permissão de Leitor. ` +
    `Compartilhando a RAIZ, as subpastas de dentro (Brand book, Logos, Fotos ` +
    `de produto, Referências, Entrada de material) ficam acessíveis junto — ` +
    `não restrinja o compartilhamento pasta por pasta, ou a equipe vai enxergar ` +
    `só parte do material.`
  );
}

const MIME_DE_PASTA = "application/vnd.google-apps.folder";

/** A estrutura padrão da pasta da marca. Lista fechada porque cada subpasta
 *  tem um consumidor: `conferirPastaDaMarca` avisa qual falta; a importação só
 *  sabe de onde puxar porque o nome é fixo. */
export const SUBPASTAS_DA_MARCA = [
  "Brand book",
  "Logos",
  "Fotos de produto",
  "Referências",
  "Entrada de material",
] as const;

/** As subpastas que a IMPORTAÇÃO manual alcança. "Entrada de material" fica de
 *  fora de propósito — ela é varrida pela VIGIA periódica do bloco 1D, não por
 *  este botão. Confundir as duas duplicaria a lógica de dedupe em dois lugares
 *  que um dia divergem. */
export const SUBPASTAS_IMPORTAVEIS = ["Brand book", "Logos", "Fotos de produto", "Referências"] as const;
export type SubpastaImportavel = (typeof SUBPASTAS_IMPORTAVEIS)[number];

/** A subpasta que a VIGIA periódica (bloco 1D-D2, `vigia-da-entrada.ts`) lê —
 *  nome único, tirado de `SUBPASTAS_DA_MARCA`, para as duas nunca divergirem
 *  por um typo em algum dos dois arquivos. */
export const SUBPASTA_DE_ENTRADA: (typeof SUBPASTAS_DA_MARCA)[number] = "Entrada de material";

/** O `uploadedBy` de todo `MediaAsset` que entrou pela pasta do cliente —
 *  IMPORTAÇÃO manual e VIGIA periódica escrevem a MESMA string, porque é ela
 *  que a limpeza de fim de contrato (`vigia-da-entrada.ts`,
 *  `apagarMaterialDoDriveAoEncerrarContrato`) usa para achar o que apagar.
 *  String duas vezes digitada é string que um dia diverge silenciosamente. */
export const UPLOADED_BY_DRIVE_DO_CLIENTE = "Drive do cliente";

// ─── A credencial ───────────────────────────────────────────────────────────

interface CredencialCompleta {
  email: string;
  chavePrivada: string;
}

/** Lê e valida `GOOGLE_SA_JSON`. NUNCA loga o conteúdo — nem em erro, nem em
 *  rascunho: um `console.log` de exceção que engolisse o JSON inteiro vazaria
 *  a chave privada para o log do Railway. */
function lerCredencialCompleta(): { ok: true; credencial: CredencialCompleta } | { ok: false; motivo: string } {
  const bruto = process.env.GOOGLE_SA_JSON?.trim();
  if (!bruto) {
    return { ok: false, motivo: FRASE_SEM_CREDENCIAL };
  }

  let json: unknown;
  try {
    json = JSON.parse(bruto);
  } catch {
    return { ok: false, motivo: FRASE_SEM_CREDENCIAL };
  }

  const obj = (json && typeof json === "object" ? json : {}) as Record<string, unknown>;
  const email = typeof obj.client_email === "string" ? obj.client_email.trim() : "";
  const chavePrivada = typeof obj.private_key === "string" ? obj.private_key : "";
  if (!email || !chavePrivada) {
    return { ok: false, motivo: FRASE_SEM_CREDENCIAL };
  }

  return { ok: true, credencial: { email, chavePrivada } };
}

/**
 * A conta de serviço está configurada? Devolve só o e-mail — nunca a chave.
 *
 * É o único contrato de credencial que sai deste módulo, e é o que a rota GET
 * usa para montar `contaDeServico` sem nunca tocar na chave privada.
 */
export function credencialDaContaDeServico(): { ok: true; email: string } | { ok: false; motivo: string } {
  const r = lerCredencialCompleta();
  if (!r.ok) return r;
  return { ok: true, email: r.credencial.email };
}

// ─── O link da pasta ────────────────────────────────────────────────────────

/**
 * Extrai o id da pasta de um link de Drive. Aceita os formatos que o Google
 * produz quando o cliente copia "Compartilhar → Copiar link" de uma pasta:
 *
 *   • https://drive.google.com/drive/folders/<id>
 *   • https://drive.google.com/drive/folders/<id>?usp=sharing
 *   • https://drive.google.com/drive/u/<n>/folders/<id>
 *   • https://drive.google.com/open?id=<id>
 *
 * Qualquer outra coisa — link de ARQUIVO (`/file/d/...`), domínio errado,
 * texto solto — devolve `null`. Adivinhar um id a partir de lixo produziria
 * "conferir" batendo numa pasta que não é a da marca.
 */
export function idDaPasta(url: string): string | null {
  if (typeof url !== "string") return null;
  const limpo = url.trim();
  if (!limpo) return null;

  const porCaminho = limpo.match(/\/folders\/([a-zA-Z0-9_-]{6,})/);
  if (porCaminho) return porCaminho[1];

  try {
    const u = new URL(limpo);
    const porQuery = u.searchParams.get("id");
    if (porQuery && /^[a-zA-Z0-9_-]{6,}$/.test(porQuery)) return porQuery;
  } catch {
    return null;
  }

  return null;
}

// ─── O JWT assinado na mão (RS256, node:crypto) ────────────────────────────

function base64url(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Monta e assina o JWT do fluxo "conta de serviço" (RFC 7523). SEM `sub` —
 *  delegação de domínio não é o que o parecer aprovou. */
function assinarJwt(credencial: CredencialCompleta, agoraSegundos: number): string {
  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iss: credencial.email,
    scope: ESCOPO_LEITURA,
    aud: TOKEN_URL,
    iat: agoraSegundos,
    exp: agoraSegundos + 3600,
  };
  const semAssinatura = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claims))}`;
  const assinatura = createSign("RSA-SHA256").update(semAssinatura).sign(credencial.chavePrivada);
  return `${semAssinatura}.${base64url(assinatura)}`;
}

let cacheDoToken: { token: string; expiraEm: number } | null = null;
const FOLGA_MS = 5 * 60_000;

/** Um access token válido para a conta de serviço, renovando quando precisa.
 *  Cache em memória do processo — perde-se num reinício, e não tem problema:
 *  o próximo pedido assina um JWT novo. */
export async function obterAccessToken(): Promise<{ ok: true; token: string } | { ok: false; motivo: string }> {
  const cred = lerCredencialCompleta();
  if (!cred.ok) return cred;

  if (cacheDoToken && cacheDoToken.expiraEm - Date.now() > FOLGA_MS) {
    return { ok: true, token: cacheDoToken.token };
  }

  const agoraSegundos = Math.floor(Date.now() / 1000);
  const jwt = assinarJwt(cred.credencial, agoraSegundos);

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  }).catch(() => null);

  if (!res) {
    return { ok: false, motivo: "não consegui falar com o Google para autenticar a conta de serviço" };
  }
  if (!res.ok) {
    return { ok: false, motivo: `o Google recusou a autenticação da conta de serviço (status ${res.status})` };
  }

  const j = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number };
  if (!j.access_token) {
    return { ok: false, motivo: "o Google não devolveu um token de acesso para a conta de serviço" };
  }

  cacheDoToken = { token: j.access_token, expiraEm: Date.now() + (j.expires_in ?? 3600) * 1000 };
  return { ok: true, token: j.access_token };
}

// ─── Leitura da pasta ───────────────────────────────────────────────────────

export interface ItemDaPasta {
  id: string;
  nome: string;
  mimeType: string;
  ehPasta: boolean;
  tamanhoBytes: number;
  /** RFC3339. Ausente só é possível se o Google um dia parar de devolver o
   *  campo — nunca por omissão nossa, já pedimos sempre. */
  modifiedTime?: string;
  /** A descrição que o cliente (ou quem sobe o arquivo) escreveu no Drive —
   *  fonte nº1 da FRASE da vigia de entrada (`vigia-da-entrada.ts`). Vazia ou
   *  ausente = a vigia cai para o `.txt` companheiro, depois para o nome. */
  description?: string;
}

/** Escapa aspas simples dentro do valor de `q` — a sintaxe de query do Drive
 *  usa aspas simples como delimitador; um id ou nome com `'` quebraria a
 *  consulta em vez de só deixar de casar. */
function escaparParaQ(v: string): string {
  return v.replace(/'/g, "\\'");
}

/**
 * Lista os filhos diretos de uma pasta.
 *
 * `opcoes.desde` (RFC3339) é o CURSOR da vigia periódica (bloco 1D-D2,
 * `vigia-da-entrada.ts`, parecer `google` de 27/09/2026, condição 3): com ele,
 * a query ganha `and modifiedTime > '<cursor>'` — só o que mudou desde a
 * última vista. Omitido = comportamento de sempre (a importação manual nunca
 * usa cursor; a primeira vigia de um cliente novo também não, para não perder
 * o que já estava lá antes de a vigia existir).
 */
export async function listarFilhos(
  token: string,
  pastaId: string,
  opcoes: { desde?: string } = {},
): Promise<{ ok: true; itens: ItemDaPasta[] } | { ok: false; motivo: string }> {
  const partesDaQuery = [`'${escaparParaQ(pastaId)}' in parents`, "trashed=false"];
  if (opcoes.desde) {
    // Aspas simples são o delimitador da sintaxe `q` do Drive; RFC3339 não
    // carrega aspas, então não há o que escapar aqui — diferente do nome/id
    // acima, que vem de fora.
    partesDaQuery.push(`modifiedTime > '${opcoes.desde}'`);
  }
  const q = partesDaQuery.join(" and ");
  const campos = "files(id,name,mimeType,size,modifiedTime,description)";
  const url =
    `${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=${encodeURIComponent(campos)}` +
    `&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true`;

  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } }).catch(() => null);
  if (!res) return { ok: false, motivo: "não consegui falar com o Google Drive" };
  if (!res.ok) {
    if (res.status === 404 || res.status === 403) {
      return {
        ok: false,
        motivo: "a conta de serviço não alcança essa pasta — confirme se a pasta RAIZ foi compartilhada com o e-mail da conta de serviço",
      };
    }
    return { ok: false, motivo: `o Google Drive respondeu ${res.status} ao listar a pasta` };
  }

  const j = (await res.json().catch(() => ({}))) as {
    files?: Array<{ id?: string; name?: string; mimeType?: string; size?: string; modifiedTime?: string; description?: string }>;
  };
  const itens: ItemDaPasta[] = (j.files ?? []).map((f) => ({
    id: f.id ?? "",
    nome: f.name ?? "",
    mimeType: f.mimeType ?? "",
    ehPasta: f.mimeType === MIME_DE_PASTA,
    tamanhoBytes: Number(f.size ?? 0) || 0,
    modifiedTime: f.modifiedTime,
    description: f.description,
  }));
  return { ok: true, itens };
}

/** Compara nome de pasta ignorando acento, caixa e espaço nas pontas — o
 *  cliente às vezes recria a estrutura à mão e digita "referencias" sem
 *  acento; tratar isso como pasta ausente seria falso negativo. */
export function normalizarNome(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
}

/**
 * O e-mail da conta de serviço, a pasta e a autorização escrita do cliente
 * existem? Se sim, lista a raiz e diz — subpasta por subpasta — qual falta.
 *
 * Falha ANTES de qualquer rede quando faltar credencial, link ou autorização:
 * a mesma trava de `materialAutorizado` em `escolha-de-material.ts` — recusa
 * que não gasta rede é a diferença entre trava e aviso.
 */
export async function conferirPastaDaMarca(a: {
  workspaceId: string;
  clientId: string;
}): Promise<
  | { ok: true; subpastas: { nome: string; encontrada: boolean; arquivos: number }[]; emailDaConta: string }
  | { ok: false; motivo: string }
> {
  const cred = credencialDaContaDeServico();
  if (!cred.ok) return cred;

  const cliente = await prisma.client.findFirst({
    where: { id: a.clientId, workspaceId: a.workspaceId },
    select: { pastaDriveUrl: true, autorizacaoDriveEm: true },
  });
  if (!cliente) return { ok: false, motivo: "cliente não encontrado" };
  if (!cliente.pastaDriveUrl) {
    return { ok: false, motivo: "este cliente ainda não tem o link da pasta do Drive cadastrado" };
  }
  if (!cliente.autorizacaoDriveEm) {
    return { ok: false, motivo: "falta a autorização escrita do cliente para acessar a pasta do Drive" };
  }

  const pastaId = idDaPasta(cliente.pastaDriveUrl);
  if (!pastaId) return { ok: false, motivo: "o link da pasta do Drive não parece válido" };

  const token = await obterAccessToken();
  if (!token.ok) return token;

  const raiz = await listarFilhos(token.token, pastaId);
  if (!raiz.ok) return raiz;

  const pastasDaRaiz = new Map(
    raiz.itens.filter((i) => i.ehPasta).map((i) => [normalizarNome(i.nome), i] as const),
  );

  const subpastas: { nome: string; encontrada: boolean; arquivos: number }[] = [];
  for (const nome of SUBPASTAS_DA_MARCA) {
    const achada = pastasDaRaiz.get(normalizarNome(nome));
    if (!achada) {
      subpastas.push({ nome, encontrada: false, arquivos: 0 });
      continue;
    }
    const filhos = await listarFilhos(token.token, achada.id);
    const arquivos = filhos.ok ? filhos.itens.filter((i) => !i.ehPasta).length : 0;
    subpastas.push({ nome, encontrada: true, arquivos });
  }

  return { ok: true, subpastas, emailDaConta: cred.email };
}

// ─── Download e importação ──────────────────────────────────────────────────

/** Só isto entra pela importação: imagem, PDF ou vídeo. Fonte e outros tipos
 *  ficam para quem os consumir declarar depois — este botão só traz o que a
 *  esteira já sabe usar hoje. */
function mimePermitidoParaImportacao(mimeType: string): boolean {
  if (!mimeType) return false;
  return mimeType === "application/pdf" || mimeType.startsWith("image/") || mimeType.startsWith("video/");
}

export async function baixarBytes(
  token: string,
  fileId: string,
): Promise<{ ok: true; bytes: Buffer } | { ok: false; motivo: string }> {
  const url = `${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } }).catch(() => null);
  if (!res) return { ok: false, motivo: "não consegui falar com o Google Drive" };
  if (!res.ok) return { ok: false, motivo: `o Google Drive respondeu ${res.status} ao baixar o arquivo` };

  const declarado = Number(res.headers.get("content-length") ?? 0);
  if (declarado > MAX_BYTES_POR_ARQUIVO) {
    return { ok: false, motivo: "arquivo maior que o teto aceito" };
  }

  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length > MAX_BYTES_POR_ARQUIVO) {
    return { ok: false, motivo: "arquivo maior que o teto aceito" };
  }
  return { ok: true, bytes };
}

/**
 * Importa os arquivos de uma subpasta da marca para o volume da casa.
 *
 * Dedupe por sha256 em DUAS camadas: dentro do próprio lote (dois arquivos
 * idênticos na mesma pasta) e contra o que já foi importado antes deste
 * cliente — sem isso, rodar "importar" duas vezes duplicaria bytes no volume
 * a cada clique.
 */
export async function importarMaterialDaPasta(a: {
  workspaceId: string;
  clientId: string;
  subpasta: SubpastaImportavel;
}): Promise<{ ok: true; importados: number; jaExistiam: number } | { ok: false; motivo: string }> {
  const cred = credencialDaContaDeServico();
  if (!cred.ok) return cred;

  if (!(SUBPASTAS_IMPORTAVEIS as readonly string[]).includes(a.subpasta)) {
    return { ok: false, motivo: "subpasta desconhecida" };
  }

  const cliente = await prisma.client.findFirst({
    where: { id: a.clientId, workspaceId: a.workspaceId },
    select: { pastaDriveUrl: true, autorizacaoDriveEm: true },
  });
  if (!cliente) return { ok: false, motivo: "cliente não encontrado" };
  if (!cliente.pastaDriveUrl) {
    return { ok: false, motivo: "este cliente ainda não tem o link da pasta do Drive cadastrado" };
  }
  if (!cliente.autorizacaoDriveEm) {
    return { ok: false, motivo: "falta a autorização escrita do cliente para acessar a pasta do Drive" };
  }

  const pastaId = idDaPasta(cliente.pastaDriveUrl);
  if (!pastaId) return { ok: false, motivo: "o link da pasta do Drive não parece válido" };

  const token = await obterAccessToken();
  if (!token.ok) return token;

  const raiz = await listarFilhos(token.token, pastaId);
  if (!raiz.ok) return raiz;

  const sub = raiz.itens.find((i) => i.ehPasta && normalizarNome(i.nome) === normalizarNome(a.subpasta));
  if (!sub) {
    return { ok: false, motivo: `a subpasta "${a.subpasta}" não foi encontrada dentro da pasta da marca` };
  }

  const filhos = await listarFilhos(token.token, sub.id);
  if (!filhos.ok) return filhos;

  let importados = 0;
  let jaExistiam = 0;
  const vistosNesteLote = new Set<string>();

  for (const item of filhos.itens) {
    if (item.ehPasta) continue;
    if (!mimePermitidoParaImportacao(item.mimeType)) continue;
    if (item.tamanhoBytes > MAX_BYTES_POR_ARQUIVO) continue;

    const baixado = await baixarBytes(token.token, item.id);
    if (!baixado.ok) continue;

    const sha256 = createHash("sha256").update(baixado.bytes).digest("hex");
    if (vistosNesteLote.has(sha256)) {
      jaExistiam++;
      continue;
    }

    const existente = await prisma.mediaAsset.findFirst({
      where: { workspaceId: a.workspaceId, clientId: a.clientId, sha256 },
      select: { id: true },
    });
    if (existente) {
      vistosNesteLote.add(sha256);
      jaExistiam++;
      continue;
    }

    const guardado = await guardarArquivo({
      bytes: baixado.bytes,
      fileName: item.nome,
      mimeType: item.mimeType,
      workspaceId: a.workspaceId,
      clientId: a.clientId,
      kind: "inbound",
      uploadedBy: UPLOADED_BY_DRIVE_DO_CLIENTE,
    });
    if (!guardado.ok) continue;

    vistosNesteLote.add(sha256);
    importados++;
  }

  await prisma.client.update({
    where: { id: a.clientId },
    data: { driveSincronizadoEm: new Date() },
  }).catch(() => { /* best-effort: a importação já aconteceu, o carimbo é secundário */ });

  return { ok: true, importados, jaExistiam };
}

// POST /api/meta/token — conectar a Meta COLANDO um token, sem popup.
//
// Existe porque no dia do lançamento da Foocci (03/08/2026) o diálogo de OAuth
// recusou o admin do app com "domínio não incluído" mesmo com todos os domínios
// gravados — um estado do painel da Meta que não se corrige por API. A operação
// não pode depender de um popup da Meta estar de bom humor.
//
// É o MESMO caminho que o antigo "agente da Meta" do CEO usava: um token de
// usuário gerado no Graph API Explorer (developers.facebook.com/tools/explorer),
// colado aqui. O resto do fluxo é idêntico ao callback do OAuth: troca por
// long-lived, descobre as Páginas/Instagram, grava tudo no cofre cifrado.
//
// ── AS TRÊS CONFERÊNCIAS ANTES DE ACEITAR ───────────────────────────────────
// Um campo que aceita token é uma porta; estas são as fechaduras:
//   1. `debug_token` com o app access token prova que o token é DESTE app —
//      um token de outro app qualquer é recusado na porta.
//   2. O token precisa estar válido (is_valid) e pertencer a um usuário.
//   3. Só o master, autenticado, pode colar. E o token nunca volta na resposta.
//
// ── A QUARTA FECHADURA, DE 06/08/2026: COLAR NÃO É AUTORIZAR ────────────────
// As três fechaduras acima provam de ONDE vem o token. Nenhuma delas responde
// à pergunta que produziu o incidente: **o que a agência passa a administrar?**
// Até hoje a resposta era "tudo que o token alcança" — e foi assim que 19
// Páginas de terceiros entraram no banco em 03/08. Agora colar guarda a
// CREDENCIAL e mais nada: os ativos só viram conexão depois que o operador
// marca em `/api/meta/ativos`. É a mesma regra do portal do cliente, no mesmo
// mecanismo (`lib/integrations/meta/escolha-de-ativos.ts`).

import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/api-guard";
import { resolveMetaAppCredentials, GRAPH_BASE, DEFAULT_SCOPES } from "@/lib/integrations/meta/config";
import { exchangeForLongLivedToken } from "@/lib/integrations/meta/oauth";
import { discoverPages } from "@/lib/integrations/meta/discovery";
import { saveConnection } from "@/lib/integrations/meta/connections";
import { gravarSomenteAutorizados, fraseFaltaEscolher } from "@/lib/integrations/meta/escolha-de-ativos";

export const dynamic = "force-dynamic";

interface DebugToken {
  data?: {
    app_id?: string;
    is_valid?: boolean;
    type?: string;
    scopes?: string[];
    expires_at?: number;
    user_id?: string;
  };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const { error, session } = await requireSession(["master"]);
  if (error) return error;

  let body: { token?: string; clientId?: string };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }

  const bruto = body.token?.trim();
  if (!bruto || bruto.length < 30) {
    return NextResponse.json({ error: "Cole o token gerado no Graph API Explorer." }, { status: 400 });
  }

  const creds = await resolveMetaAppCredentials(session!.workspaceId);
  if (!creds) return NextResponse.json({ error: "App da Meta não configurado" }, { status: 503 });

  // ── Fechadura 1 e 2: o token é deste app, e está vivo? ────────────────────
  const appToken = `${creds.appId}|${creds.appSecret}`;
  const dbg = new URL(`${GRAPH_BASE}/debug_token`);
  dbg.searchParams.set("input_token", bruto);
  dbg.searchParams.set("access_token", appToken);
  const dbgRes = await fetch(dbg).catch(() => null);
  const info = dbgRes ? ((await dbgRes.json().catch(() => ({}))) as DebugToken) : {};

  if (!info.data?.is_valid) {
    return NextResponse.json({ error: "Esse token não está válido. Gere um novo no Graph API Explorer." }, { status: 400 });
  }
  if (info.data.app_id !== creds.appId) {
    // Token de OUTRO app: recusado. Aceitar conectaria a agência a um app que
    // não é o nosso — com as permissões de quem quer que o tenha gerado.
    return NextResponse.json({ error: "Esse token pertence a outro app da Meta. No Explorer, selecione o app Dioli Digital Studio antes de gerar." }, { status: 400 });
  }

  const escopos = info.data.scopes ?? [];
  const faltando = ["ads_management", "pages_show_list"].filter((s) => !escopos.includes(s));

  // ── Troca por long-lived. Token do Explorer dura ~1h; 60 dias é operação. ──
  let token = bruto;
  let expiraEm: Date | null = info.data.expires_at ? new Date(info.data.expires_at * 1000) : null;
  try {
    const longo = await exchangeForLongLivedToken({
      appId: creds.appId, appSecret: creds.appSecret, shortLivedToken: bruto,
    });
    if (longo.access_token) {
      token = longo.access_token;
      expiraEm = longo.expires_in ? new Date(Date.now() + longo.expires_in * 1000) : null;
    }
  } catch { /* alguns tokens já são long-lived e a troca falha — o original serve */ }

  // `null`, nunca `""`. Até 06/08/2026 esta linha gravava string vazia como
  // dono, e "sem cliente" passou a ter duas grafias no banco — as 24 conexões
  // de nível agência em produção nasceram aqui, com `""`. Toda guarda da trava
  // pergunta `=== null`; com `""` ela caía no ramo do CLIENTE. Ver `donoDe`.
  const clientId = body.clientId?.trim() || null;

  // ── O token de usuário: a chave do tráfego pago ───────────────────────────
  await saveConnection({
    workspaceId: session!.workspaceId,
    clientId,
    platform: "user",
    name: "Acesso da conta Meta (token colado)",
    externalId: `user:${session!.workspaceId}${clientId ? `:${clientId}` : ""}`,
    accessToken: token,
    tokenExpiresAt: expiraEm,
    scopes: escopos.length > 0 ? escopos : DEFAULT_SCOPES,
    meta: { tipo: "user_token", origem: "explorer" },
  });

  // ── PÁGINAS E INSTAGRAM: O LAÇO QUE PRODUZIU O DANO DE 03/08 ──────────────
  //
  // Este laço gravava TODA Página que o token alcançava. Foi ele, às 14:05 de
  // 03/08/2026, que pôs no banco as 19 conexões de terceiros — Sushi Cazza,
  // Dilee, Kero Shop, Acesso Beleza, santioh_, dilix.br, queise, Santioh
  // Europe, Spa da Mente, City Jobs SP. Nenhum é cliente desta agência. O CEO
  // colou um token; a casa entendeu "grave tudo que ele alcança".
  //
  // Agora ele grava **só o que o operador já marcou** em `/api/meta/ativos`.
  // O que não está marcado é CONTADO e devolvido como "falta escolher" — nunca
  // gravado. Na primeira colagem a lista está vazia, então o número gravado é
  // ZERO, e a tela diz isso em vez de "conectado ✓". Fail-closed.
  //
  // O TETO DE 20 continua, por outro motivo: sem ele, uma conta com 30 Páginas
  // virava 60 `saveConnection` sequenciais dentro de UM request HTTP, logo
  // depois da rajada de GETs da descoberta — ritmo de máquina, que é o que
  // restringiu a conta de anúncios da agência em 03/08.
  const MAXIMO_DE_PAGINAS_GRAVADAS = 20;
  let gravadas = 0;
  let faltamEscolher = 0;
  let nomes: string[] = [];
  let sobraram = 0;
  let alcancadas = 0;
  try {
    const descobertas = await discoverPages(token);
    alcancadas = descobertas.length;
    sobraram = Math.max(0, descobertas.length - MAXIMO_DE_PAGINAS_GRAVADAS);
    const r = await gravarSomenteAutorizados({
      workspaceId: session!.workspaceId,
      clientId,
      paginas: descobertas.slice(0, MAXIMO_DE_PAGINAS_GRAVADAS),
      scopes: escopos,
    });
    gravadas = r.gravadas; faltamEscolher = r.faltamEscolher; nomes = r.nomes;
  } catch { /* sem pages_show_list ainda dá para rodar anúncio — não derruba */ }

  const avisos: string[] = [];
  if (faltando.length > 0) {
    avisos.push(`O token veio sem: ${faltando.join(", ")}. Gere de novo marcando essas permissões para liberar tudo.`);
  }
  if (sobraram > 0) {
    avisos.push(`O acesso alcança ${alcancadas} Páginas; listei as primeiras ${MAXIMO_DE_PAGINAS_GRAVADAS} nesta rodada (trabalhamos por partes para não operar em ritmo de máquina).`);
  }

  return NextResponse.json({
    ok: true,
    // `precisaEscolher` é o desfecho honesto: o acesso está guardado e NADA de
    // ativo foi gravado. A tela usa isto para dizer "falta escolher" — a mentira
    // "conectado ✓" já foi corrigida no fluxo do cliente e não volta por aqui.
    precisaEscolher: faltamEscolher > 0,
    contas: gravadas,
    faltamEscolher,
    nomes,
    validoAte: expiraEm,
    ...(faltamEscolher > 0 ? { escolher: fraseFaltaEscolher(faltamEscolher, "agencia") } : {}),
    ...(avisos.length > 0 ? { aviso: avisos.join(" ") } : {}),
  });
}

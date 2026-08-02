// /api/google/conectar — o cliente liga o Google Meu Negócio dele.
//
// GET  → manda para o consentimento do Google.
// GET ?code=... (callback) → troca o código por tokens e grava os locais.
//
// SEPARADO de `/api/auth/google`, que é o LOGIN. Misturar os dois seria pedir
// permissão de gerenciar o negócio de alguém na hora de entrar no sistema — o
// jeito mais rápido de assustar um cliente e de a tela de consentimento virar
// um pedido que ninguém aceita.
//
// `access_type: offline` + `prompt: consent` não são detalhe: é o que faz o
// Google devolver o REFRESH TOKEN. Sem ele a conexão morre em uma hora e
// alguém precisa reconectar à mão — o oposto de uma agência automática. E o
// Google só devolve refresh na PRIMEIRA autorização, a menos que se force o
// consentimento.

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db/client";
import { requireSession } from "@/lib/auth/api-guard";
import { encryptSecret } from "@/lib/security/crypto";
import { listarLocais } from "@/lib/integrations/google/client";

export const dynamic = "force-dynamic";

/** Gerenciar ficha, avaliações e posts do negócio. É um escopo forte, e por
 *  isso o Google o classifica como sensível: exige verificação do app. */
const ESCOPO = "https://www.googleapis.com/auth/business.manage";

function redirectUri(req: NextRequest): string {
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const host = req.headers.get("host") ?? "localhost:3000";
  return `${proto}://${host}/api/google/conectar`;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { error, session } = await requireSession();
  if (error) return error;

  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: "Google OAuth não configurado" }, { status: 503 });
  }

  const code = request.nextUrl.searchParams.get("code");

  // ── Ida: manda para o consentimento ───────────────────────────────────────
  if (!code) {
    const estado = randomUUID();
    // De qual cliente é esta conexão. Vai no state porque o Google devolve
    // exatamente o que mandamos — e sem isso a conta cairia no cliente errado.
    const paraCliente = request.nextUrl.searchParams.get("clientId") ?? "";

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri(request),
      response_type: "code",
      scope: ESCOPO,
      access_type: "offline",
      prompt: "consent",
      state: estado,
      include_granted_scopes: "true",
    });

    const res = NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
    res.cookies.set("_gmb_state", estado, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 600, path: "/" });
    res.cookies.set("_gmb_client", paraCliente, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 600, path: "/" });
    return res;
  }

  // ── Volta: confere o state ANTES de trocar o código ───────────────────────
  // Sem esta conferência, um link forjado faria a agência conectar a conta
  // Google de um terceiro ao workspace do atacante.
  const estadoSalvo = request.cookies.get("_gmb_state")?.value;
  const estadoRecebido = request.nextUrl.searchParams.get("state");
  if (!estadoSalvo || estadoSalvo !== estadoRecebido) {
    return NextResponse.json({ error: "Pedido de conexão inválido ou expirado. Tente de novo." }, { status: 400 });
  }
  const paraCliente = request.cookies.get("_gmb_client")?.value || null;

  const troca = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code, client_id: clientId, client_secret: clientSecret,
      redirect_uri: redirectUri(request), grant_type: "authorization_code",
    }),
  }).catch(() => null);

  if (!troca?.ok) {
    return NextResponse.json({ error: "O Google recusou a conexão. Tente novamente." }, { status: 502 });
  }
  const t = (await troca.json()) as { access_token?: string; refresh_token?: string; expires_in?: number };
  if (!t.access_token) {
    return NextResponse.json({ error: "O Google não devolveu o acesso." }, { status: 502 });
  }

  // Grava uma conexão provisória só para conseguir listar os locais — a
  // listagem exige um token válido, e o token só vive dentro de uma conexão.
  const provisoria = await prisma.googleConnection.create({
    data: {
      workspaceId: session!.workspaceId,
      clientId: paraCliente || null,
      locationName: `pendente-${randomUUID().slice(0, 8)}`,
      accountName: "",
      accessTokenEncrypted: encryptSecret(t.access_token),
      refreshTokenEncrypted: t.refresh_token ? encryptSecret(t.refresh_token) : null,
      tokenExpiresAt: new Date(Date.now() + (t.expires_in ?? 3600) * 1000),
      status: "connected",
    },
  });

  const locais = await listarLocais(provisoria.id);
  if (!locais.ok || !locais.dados?.length) {
    await prisma.googleConnection.delete({ where: { id: provisoria.id } }).catch(() => { /* best-effort */ });
    return NextResponse.json({
      error: locais.erro ?? "Nenhum local encontrado nesta conta do Google.",
    }, { status: 400 });
  }

  // Um local por conexão: avaliações e posts são POR LOCAL, e uma conexão que
  // representa "vários locais" obrigaria todo chamador a escolher — que é onde
  // se publica na filial errada.
  const primeiro = locais.dados[0]!;
  await prisma.googleConnection.update({
    where: { id: provisoria.id },
    data: { locationName: primeiro.locationName, accountName: primeiro.accountName, title: primeiro.title },
  });

  for (const extra of locais.dados.slice(1)) {
    await prisma.googleConnection.upsert({
      where: { workspaceId_locationName: { workspaceId: session!.workspaceId, locationName: extra.locationName } },
      update: { accountName: extra.accountName, title: extra.title, status: "connected" },
      create: {
        workspaceId: session!.workspaceId, clientId: paraCliente || null,
        locationName: extra.locationName, accountName: extra.accountName, title: extra.title,
        accessTokenEncrypted: encryptSecret(t.access_token),
        refreshTokenEncrypted: t.refresh_token ? encryptSecret(t.refresh_token) : null,
        tokenExpiresAt: new Date(Date.now() + (t.expires_in ?? 3600) * 1000),
        status: "connected",
      },
    }).catch(() => { /* um local a mais que falha não invalida o principal */ });
  }

  const res = NextResponse.json({
    ok: true,
    conectados: locais.dados.length,
    locais: locais.dados.map((l) => l.title),
    // Sem refresh token a conexão morre em 1h. Dizer isso aqui é melhor do que
    // o time descobrir amanhã, quando nada mais funcionar.
    ...(t.refresh_token ? {} : { aviso: "O Google não devolveu o acesso de longa duração. Desconecte o app na conta Google e conecte de novo." }),
  });
  res.cookies.delete("_gmb_state");
  res.cookies.delete("_gmb_client");
  return res;
}

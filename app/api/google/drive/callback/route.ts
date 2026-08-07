// GET /api/google/drive/callback — a volta do consentimento do Drive.
//
// Confere o `state` ANTES de trocar o código. Sem essa conferência, um link
// forjado faria a agência conectar o Drive de um terceiro à conta de um cliente.
//
// O dono NÃO vem da URL: vem do token do portal guardado em cookie httpOnly na
// ida. Derivação, não comparação.
//
// ── O QUE ESTA ROTA RECUSA ──────────────────────────────────────────────────
//
// • Sem refresh token → conexão gravada como `expired` e o cliente é mandado
//   reconectar. Uma conexão que morre em 1 hora não é conexão, é armadilha:
//   funcionaria no teste e quebraria no dia seguinte parecendo defeito nosso.
// • Escopo diferente de `drive.file` → recusada. Se o Google devolver um escopo
//   amplo (usuário com sessão que já concedeu outra coisa), não é o que esta
//   casa pediu, e guardar seria acesso maior do que o cliente entendeu dar.

import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/client";
import { encryptSecret } from "@/lib/security/crypto";
import { resolvePortalClient } from "@/lib/agency/persistence/portal-access-service";
import { paginaDePopup } from "@/lib/integrations/meta/popup";
import { ESCOPO_DRIVE } from "@/lib/integrations/google/escolha-de-material";

export const dynamic = "force-dynamic";

function falha(titulo: string, detalhe: string, oQueFazer: string, etapa: string): Response {
  return paginaDePopup({
    ok: false, titulo, detalhe, oQueFazer,
    carga: { type: "drive_auth_error", error: detalhe, etapa },
  });
}

/** Mascara o e-mail: o cliente precisa reconhecer a conta, a casa não precisa
 *  guardar PII. "joao.silva@gmail.com" → "jo***@gmail.com". */
export function mascararConta(email: string): string {
  const [nome, dominio] = email.split("@");
  if (!nome || !dominio) return "";
  return `${nome.slice(0, 2)}***@${dominio}`;
}

export async function GET(req: NextRequest): Promise<Response> {
  const erroDoGoogle = req.nextUrl.searchParams.get("error");
  if (erroDoGoogle) {
    return falha(
      "Você não autorizou o acesso",
      "Nada foi alterado na sua conta do Google.",
      "Se quiser, feche esta janela e tente de novo pelo portal.",
      `drive/callback:${erroDoGoogle}`,
    );
  }

  const estadoSalvo = req.cookies.get("_drive_state")?.value;
  const estadoRecebido = req.nextUrl.searchParams.get("state");
  if (!estadoSalvo || estadoSalvo !== estadoRecebido) {
    return falha(
      "Este pedido de conexão não vale mais",
      "A janela ficou aberta tempo demais, ou o pedido veio de um lugar que não reconhecemos.",
      "Feche esta janela e comece de novo pelo portal.",
      "drive/callback:state",
    );
  }

  const tokenDoPortal = decodeURIComponent(req.cookies.get("_drive_portal")?.value ?? "");
  const dono = tokenDoPortal ? await resolvePortalClient(tokenDoPortal) : null;
  if (!dono) {
    return falha(
      "Seu acesso ao portal expirou no meio do caminho",
      "Nada foi conectado.",
      "Peça um link novo do portal à equipe e tente de novo.",
      "drive/callback:sem_dono",
    );
  }

  const code = req.nextUrl.searchParams.get("code");
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!code || !clientId || !clientSecret) {
    return falha(
      "A conexão com o Google ainda não está liberada",
      "A agência ainda está finalizando a liberação do app junto ao Google.",
      "Avise a equipe — não é um problema da sua conta.",
      "drive/callback:sem_credenciais",
    );
  }

  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const host = req.headers.get("host") ?? "localhost:3000";

  const troca = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code, client_id: clientId, client_secret: clientSecret,
      redirect_uri: `${proto}://${host}/api/google/drive/callback`,
      grant_type: "authorization_code",
    }),
  }).catch(() => null);

  if (!troca?.ok) {
    return falha(
      "O Google recusou a conexão",
      "Não conseguimos concluir a autorização.",
      "Tente de novo em alguns minutos. Se continuar, avise a equipe.",
      "drive/callback:troca",
    );
  }

  const t = (await troca.json().catch(() => ({}))) as {
    access_token?: string; refresh_token?: string; expires_in?: number; scope?: string;
  };
  if (!t.access_token) {
    return falha(
      "O Google não devolveu o acesso",
      "A autorização não chegou completa até aqui.",
      "Tente de novo pelo portal.",
      "drive/callback:sem_access_token",
    );
  }

  const escopos = t.scope ?? "";
  if (!escopos.includes(ESCOPO_DRIVE)) {
    return falha(
      "A permissão concedida não é a que pedimos",
      "Autorizamos apenas a leitura dos arquivos que VOCÊ escolher — e não foi essa a permissão concedida.",
      "Tente de novo e mantenha marcada a permissão que a tela do Google mostrar.",
      "drive/callback:escopo",
    );
  }

  // Quem é a conta — só para o cliente reconhecer na tela. Mascarada.
  let contaHint = "";
  const perfil = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${t.access_token}` },
  }).catch(() => null);
  if (perfil?.ok) {
    const p = (await perfil.json().catch(() => ({}))) as { email?: string };
    contaHint = mascararConta(p.email ?? "");
  }

  const semRefresh = !t.refresh_token;
  const dados = {
    workspaceId: dono.workspaceId,
    clientId: dono.clientId,
    contaHint,
    accessTokenEncrypted: encryptSecret(t.access_token),
    refreshTokenEncrypted: t.refresh_token ? encryptSecret(t.refresh_token) : null,
    tokenExpiresAt: new Date(Date.now() + (t.expires_in ?? 3600) * 1000),
    escopos,
    // Sem refresh, a conexão já nasce morta em 1h. Marcar `expired` na hora é o
    // que faz a tela dizer a verdade em vez de prometer o que não vai cumprir.
    status: semRefresh ? "expired" : "connected",
  };

  // ── A GRAVAÇÃO É A CONEXÃO. SE ELA FALHA, NÃO HOUVE CONEXÃO. ──────────────
  //
  // Isto era `.catch(() => null)`, e foi o elo que transformou um defeito de
  // infraestrutura numa mentira na cara do cliente (07/08/2026):
  //
  //   as tabelas `GoogleDriveConnection` e `DriveMaterial` NUNCA existiram em
  //   produção — foram para o `schema.prisma` sem migration, e produção só
  //   aplica esquema por `migrate deploy`. O upsert lançava, o catch engolia, e
  //   o popup dizia "Drive conectado" a seguir, incondicionalmente. O portal,
  //   lendo o banco, dizia "Drive não conectado." no mesmo cartão, ao mesmo
  //   tempo. Depois do F5 não sobrava nada.
  //
  // O CEO ficou parado nisso com o Drive da Foocci na tela. A tabela que
  // faltava é consertada por migration; ESTE bloco é a metade que impede a
  // próxima falha de gravação de virar de novo um "conectado" que não conectou.
  //
  // Regra da casa: porta fechada. Não deu para gravar, o popup DIZ que não deu.
  const gravada = await prisma.googleDriveConnection.upsert({
    where: { workspaceId_clientId: { workspaceId: dono.workspaceId, clientId: dono.clientId } },
    update: dados,
    create: dados,
  }).catch((e) => {
    // O motivo vai para o log da casa, não para a tela do cliente: ele pode
    // carregar nome de tabela e formato de banco.
    console.error("[drive/callback] não consegui gravar a conexão:", e instanceof Error ? e.message : e);
    return null;
  });

  if (!gravada) {
    return falha(
      "A conexão não ficou salva",
      "Você autorizou no Google, mas não conseguimos guardar a conexão aqui do nosso lado. Nada ficou pela metade na sua conta.",
      "Avise a equipe — é um problema nosso, não da sua conta do Google. Você pode remover o acesso em myaccount.google.com/permissions se preferir.",
      "drive/callback:falha_ao_gravar",
    );
  }

  if (semRefresh) {
    return falha(
      "A conexão não ficou de pé",
      "O Google não devolveu o acesso de longa duração — a conexão cairia em uma hora.",
      "Abra myaccount.google.com/permissions, remova o acesso da Dioli e conecte de novo pelo portal.",
      "drive/callback:sem_refresh",
    );
  }

  const res = paginaDePopup({
    ok: true,
    titulo: "Drive conectado",
    detalhe: "Agora escolha, no portal, quais arquivos a equipe pode usar. Só o que você escolher fica ao nosso alcance.",
    oQueFazer: "Feche esta janela e clique em Escolher arquivos.",
    carga: { type: "drive_auth_success", summary: contaHint ? `Google Drive de ${contaHint} conectado.` : "Google Drive conectado." },
  });
  const headers = new Headers(res.headers);
  headers.append("Set-Cookie", "_drive_state=; HttpOnly; Path=/; Max-Age=0");
  headers.append("Set-Cookie", "_drive_portal=; HttpOnly; Path=/; Max-Age=0");
  return new Response(res.body, { status: res.status, headers });
}

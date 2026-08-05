import { NextRequest, NextResponse } from "next/server";
import { compare } from "bcryptjs";
import { prisma } from "@/lib/db/client";
import { createSession, isAgencyRole } from "@/lib/auth/session";
import { rateLimit, clientIp } from "@/lib/security/rate-limit";

/**
 * Um hash bcrypt VÁLIDO de uma senha que ninguém tem.
 *
 * Serve para uma coisa só: quando o e-mail não existe, ainda assim pagamos o
 * custo do `compare`. Sem isso, "e-mail inexistente" respondia na hora e
 * "e-mail existente com senha errada" respondia ~100ms depois — a diferença
 * dizia ao atacante QUAIS e-mails existem, de graça. Enumerar contas é o
 * primeiro passo de toda força bruta dirigida.
 *
 * Gerado com custo 12, o mesmo do seed, para que o tempo bata.
 */
const HASH_FANTASMA = "$2b$12$KuYkpBqj0aDXozOOKrPVEeAEgHvwq6r0WD554H5cHiqf8Vwlakek.";

// Teto de tentativas. Duas dimensões de propósito: por IP (um atacante só) e
// por e-mail (muitos IPs contra a MESMA conta — `master@dioli.studio` está no
// seed e aparece no log de boot, então é o alvo óbvio). O balde é por processo
// (ver lib/security/rate-limit.ts): contém força bruta, não ataque distribuído.
const TENTATIVAS_POR_IP = 10;
const TENTATIVAS_POR_EMAIL = 5;
const JANELA_MS = 5 * 60_000;

function respostaDeLimite(retryAfter: number): NextResponse {
  return NextResponse.json(
    { error: "Muitas tentativas de login. Aguarde alguns minutos e tente de novo." },
    { status: 429, headers: { "Retry-After": String(retryAfter) } },
  );
}

export async function POST(request: NextRequest) {
  let body: { email?: unknown; password?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  const email = (typeof body.email === "string" ? body.email : "").toLowerCase().trim();
  const password = typeof body.password === "string" ? body.password : "";

  if (!email || !password) {
    return NextResponse.json({ error: "Email e senha são obrigatórios." }, { status: 400 });
  }

  // O teto vem DEPOIS da validação de forma e ANTES de tocar o banco: corpo
  // malformado não deve consumir a cota de ninguém, e força bruta não deve
  // consumir conexão de banco.
  const porIp = rateLimit(`signin:ip:${clientIp(request)}`, TENTATIVAS_POR_IP, JANELA_MS);
  if (!porIp.allowed) return respostaDeLimite(porIp.retryAfter);
  const porEmail = rateLimit(`signin:email:${email}`, TENTATIVAS_POR_EMAIL, JANELA_MS);
  if (!porEmail.allowed) return respostaDeLimite(porEmail.retryAfter);

  let user;
  try {
    user = await prisma.user.findUnique({
      where: { email },
      include: { workspace: true },
    });
  } catch (err) {
    console.error("[auth/signin] DB error:", err);
    return NextResponse.json(
      { error: "Erro de conexão com o banco de dados. Tente novamente." },
      { status: 503 }
    );
  }

  // ⚠️ A ORDEM É O MECANISMO: o `compare` roda SEMPRE, inclusive quando o
  // e-mail não existe. Sair antes dele devolvia a resposta instantaneamente e
  // transformava o endpoint num oráculo de "esta conta existe".
  const valid = await compare(password, user?.passwordHash ?? HASH_FANTASMA);
  if (!user || !valid) {
    return NextResponse.json({ error: "Email ou senha incorretos." }, { status: 401 });
  }

  // ⚠️ Papel desconhecido é NEGADO, nunca promovido.
  // Isto era `: "master"` — o fallback de um papel não reconhecido era o papel
  // mais poderoso da casa. Qualquer papel novo em `roles.ts` que não estivesse
  // na lista de `isAgencyRole` virava master no ato do login.
  if (!isAgencyRole(user.role)) {
    console.error(`[auth/signin] papel desconhecido "${user.role}" no usuário ${user.id} — login negado`);
    return NextResponse.json(
      { error: "Sua conta está com um papel inválido. Fale com o administrador." },
      { status: 403 },
    );
  }
  const role = user.role;
  await createSession({
    userId:      user.id,
    email:       user.email,
    name:        user.name,
    role,
    workspaceId: user.workspaceId,
    clientId:    user.clientId ?? undefined,
  });

  return NextResponse.json({ ok: true });
}

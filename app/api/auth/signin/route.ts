import { NextRequest, NextResponse } from "next/server";
import { compare } from "bcryptjs";
import { prisma } from "@/lib/db/client";
import { createSession, isAgencyRole } from "@/lib/auth/session";

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

  if (!user) {
    return NextResponse.json({ error: "Email ou senha incorretos." }, { status: 401 });
  }

  const valid = await compare(password, user.passwordHash);
  if (!valid) {
    return NextResponse.json({ error: "Email ou senha incorretos." }, { status: 401 });
  }

  const role = isAgencyRole(user.role) ? user.role : "master";
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

"use server";

import { redirect } from "next/navigation";
import { compare } from "bcryptjs";
import { prisma } from "@/lib/db/client";
import { createSession, deleteSession, isAgencyRole } from "@/lib/auth/session";

export type SignInResult = { error: string } | { success: true };

export async function signIn(formData: FormData): Promise<SignInResult> {
  const email = (formData.get("email") as string)?.toLowerCase().trim();
  const password = formData.get("password") as string;

  if (!email || !password) {
    return { error: "Email e senha são obrigatórios." };
  }

  let user;
  try {
    user = await prisma.user.findUnique({
      where: { email },
      include: { workspace: true },
    });
  } catch {
    return { error: "Erro de conexão com o banco de dados. Tente novamente." };
  }

  if (!user) {
    return { error: "Email ou senha incorretos." };
  }

  const valid = await compare(password, user.passwordHash);
  if (!valid) {
    return { error: "Email ou senha incorretos." };
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

  redirect("/agency/dashboard");
}

export async function signOut(): Promise<void> {
  await deleteSession();
  redirect("/auth/signin");
}

"use server";

// Sign-in is handled by POST /api/auth/signin (app/api/auth/signin/route.ts).
// This file retains only the sign-out server action for any form-based signout usage.
// The primary signout flow uses GET /auth/signout (app/auth/signout/route.ts).

import { redirect } from "next/navigation";
import { deleteSession } from "@/lib/auth/session";

export async function signOut(): Promise<void> {
  await deleteSession();
  redirect("/auth/signin");
}

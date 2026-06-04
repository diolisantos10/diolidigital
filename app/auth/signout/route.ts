import { deleteSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";

export async function GET(): Promise<never> {
  await deleteSession();
  redirect("/auth/signin");
}

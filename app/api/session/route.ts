import { NextResponse } from "next/server";
import { getOptionalSession } from "@/lib/auth/dal";

export async function GET() {
  const session = await getOptionalSession();
  if (!session) {
    return NextResponse.json({ active: false }, { status: 200 });
  }
  return NextResponse.json({
    active: true,
    name: session.name,
    email: session.email,
    role: session.role,
    workspaceId: session.workspaceId,
  });
}

import { randomBytes } from "crypto";
import { prisma } from "@/lib/db/client";

export interface CreatePortalAccessInput {
  clientRequestId?: string;
  clientId?: string;
  expiresAt?: Date;
}

// A portal token is the SOLE credential for unauthenticated client access, so
// it must be unguessable. cuid (the schema default) is collision-resistant but
// low-entropy — mint a 256-bit random, URL-safe token instead. Existing cuid
// tokens keep validating (lookup is by value).
export async function createPortalAccess(input: CreatePortalAccessInput) {
  return prisma.portalAccess.create({
    data: {
      token:           randomBytes(32).toString("base64url"),
      clientRequestId: input.clientRequestId,
      clientId:        input.clientId,
      expiresAt:       input.expiresAt,
    },
  });
}

export async function validatePortalAccess(token: string) {
  const record = await prisma.portalAccess.findUnique({ where: { token } });
  if (!record) return { valid: false, reason: "not_found" as const };
  if (record.revokedAt) return { valid: false, reason: "revoked" as const };
  if (record.expiresAt && record.expiresAt < new Date()) {
    return { valid: false, reason: "expired" as const };
  }

  await prisma.portalAccess.update({
    where: { token },
    data: {
      lastAccessedAt: new Date(),
      accessCount: { increment: 1 },
    },
  });

  return { valid: true, record };
}

export async function revokePortalAccess(token: string) {
  return prisma.portalAccess.update({
    where: { token },
    data: { revokedAt: new Date() },
  });
}

export async function getPortalAccessForRequest(clientRequestId: string) {
  return prisma.portalAccess.findMany({
    where: { clientRequestId, revokedAt: null },
    orderBy: { createdAt: "desc" },
  });
}

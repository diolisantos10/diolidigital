// Foundation Sprint — end-to-end DB flow test
// Tests: create ClientRequestDb → create BrainArtifacts (all 6 depts) →
//        create ApprovalRequests → add comments → create PortalAccess →
//        validate token → verify portal data query works.
//
// Run: DATABASE_URL="file:./dev.db" npx tsx scripts/test-brain-foundation-flow.ts

import "dotenv/config";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { PrismaClient } from "../lib/generated/prisma/client";

const dbUrl = process.env.DATABASE_URL ?? "file:./dev.db";
const url   = dbUrl.startsWith("file:./")
  ? `file:${process.cwd()}/${dbUrl.slice("file:./".length)}`
  : dbUrl;
const adapter = new PrismaLibSql({ url });
const prisma  = new PrismaClient({ adapter });

let failures = 0;

function check(label: string, cond: boolean, detail?: string) {
  console.log(`${cond ? "✅" : "❌"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
}

async function cleanup(id: string) {
  await prisma.portalAccess.deleteMany({ where: { clientRequestId: id } });
  await prisma.approvalComment.deleteMany({
    where: { approvalRequest: { clientRequestId: id } },
  });
  await prisma.approvalRequest.deleteMany({ where: { clientRequestId: id } });
  await prisma.evidenceItem.deleteMany({ where: { clientRequestId: id } });
  await prisma.brainArtifact.deleteMany({ where: { clientRequestId: id } });
  await prisma.clientRequestDb.delete({ where: { id } }).catch(() => {});
}

async function main() {
  console.log("\n─── Foundation Sprint — DB Flow Test ───────────────────────────\n");

  // 1. Create ClientRequestDb
  const req = await prisma.clientRequestDb.create({
    data: {
      businessName:    "Sushi Cazza",
      segment:         "restaurante japonês premium",
      services:        JSON.stringify(["Social Media", "Tráfego Pago"]),
      objectives:      JSON.stringify(["aumentar pedidos no delivery"]),
      rawContext:      "Restaurante japonês premium em Lisboa, foco em delivery.",
      source:          "briefing",
      status:          "new",
    },
  });
  check("ClientRequestDb created", !!req.id, `id=${req.id}`);

  const reqId = req.id;

  // 2. Create BrainArtifacts for all 6 departments
  const DEPTS = ["strategy", "social", "design", "traffic", "analytics", "quality"] as const;
  const artifactIds: string[] = [];

  for (const dept of DEPTS) {
    const artifact = await prisma.brainArtifact.create({
      data: {
        clientRequestId:   reqId,
        department:        dept,
        canvasId:          `canvas_${dept}_test_001`,
        canvasJson:        JSON.stringify({ department: dept, clientName: "Sushi Cazza", status: "approved" }),
        qualityGateJson:   JSON.stringify({ overall: "PASS", passCount: 5, failCount: 0, warningCount: 0 }),
        cognitiveFlowJson: dept === "strategy" ? JSON.stringify([{ stepId: "s1", completed: true }]) : null,
        version:           1,
        status:            "approved",
        approvedBy:        "test",
      },
    });
    check(`BrainArtifact created: ${dept}`, !!artifact.id, `id=${artifact.id}`);
    artifactIds.push(artifact.id);
  }

  // Verify supersede logic: create a second strategy artifact, first should be superseded
  await prisma.brainArtifact.updateMany({
    where: { clientRequestId: reqId, department: "strategy", status: "approved" },
    data:  { status: "superseded" },
  });
  const newStrategy = await prisma.brainArtifact.create({
    data: {
      clientRequestId: reqId, department: "strategy",
      canvasId: "canvas_strategy_test_002", canvasJson: JSON.stringify({ v: 2 }),
      version: 2, status: "approved", approvedBy: "test",
    },
  });
  const oldStrategy = await prisma.brainArtifact.findFirst({
    where: { clientRequestId: reqId, department: "strategy", canvasId: "canvas_strategy_test_001" },
  });
  check("Supersede logic: old strategy artifact is superseded", oldStrategy?.status === "superseded");
  check("Supersede logic: new strategy artifact is approved",   newStrategy.status === "approved");
  artifactIds.push(newStrategy.id);

  // 3. Create ApprovalRequests with comments
  const approval = await prisma.approvalRequest.create({
    data: {
      clientRequestId: reqId,
      department:      "strategy",
      artifactId:      newStrategy.id,
      requestedBy:     "pm@dioli.pt",
      clientVisible:   true,
      status:          "pending",
    },
  });
  check("ApprovalRequest created", !!approval.id);

  const comment = await prisma.approvalComment.create({
    data: {
      approvalRequestId: approval.id,
      authorName:        "Equipe Dioli",
      authorRole:        "internal",
      body:              "Estratégia preparada para revisão. Por favor confirme a direção.",
      isClientVisible:   true,
    },
  });
  check("ApprovalComment created (client-visible)", !!comment.id);

  // Update approval status
  await prisma.approvalRequest.update({
    where: { id: approval.id },
    data:  { status: "approved", reviewedBy: "client@sushicazza.pt", reviewedAt: new Date() },
  });
  const updatedApproval = await prisma.approvalRequest.findUnique({ where: { id: approval.id } });
  check("ApprovalRequest status → approved", updatedApproval?.status === "approved");

  // 4. Create EvidenceItem
  const evidence = await prisma.evidenceItem.create({
    data: {
      clientRequestId: reqId,
      artifactId:      newStrategy.id,
      department:      "strategy",
      type:            "metric",
      label:           "Estratégia aprovada na primeira rodada",
      valueJson:       JSON.stringify({ score: 100, benchmark: 70 }),
    },
  });
  check("EvidenceItem created", !!evidence.id);

  // 5. Create PortalAccess token
  const portal = await prisma.portalAccess.create({
    data: {
      clientRequestId: reqId,
      clientId:        "clt_sushi_cazza_test",
      expiresAt:       new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    },
  });
  check("PortalAccess token created", !!portal.token, `token=${portal.token}`);

  // 6. Validate token (manual simulate)
  const found = await prisma.portalAccess.findUnique({ where: { token: portal.token } });
  const isValid = !!found && !found.revokedAt && (!found.expiresAt || found.expiresAt > new Date());
  check("PortalAccess token is valid", isValid);

  // Increment access count
  await prisma.portalAccess.update({
    where: { token: portal.token },
    data:  { accessCount: { increment: 1 }, lastAccessedAt: new Date() },
  });
  const accessed = await prisma.portalAccess.findUnique({ where: { token: portal.token } });
  check("PortalAccess access count incremented", accessed?.accessCount === 1);

  // 7. Verify full portal data query
  const [artifacts, approvals, evidenceItems] = await Promise.all([
    prisma.brainArtifact.findMany({ where: { clientRequestId: reqId, status: "approved" } }),
    prisma.approvalRequest.findMany({
      where: { clientRequestId: reqId, clientVisible: true },
      include: { comments: { where: { isClientVisible: true } } },
    }),
    prisma.evidenceItem.findMany({ where: { clientRequestId: reqId } }),
  ]);

  check("Portal data: approved artifacts for all 6 depts", artifacts.length === DEPTS.length,
    `found=${artifacts.length} depts=[${artifacts.map((a) => a.department).join(",")}]`);
  check("Portal data: client-visible approval exists", approvals.length > 0);
  check("Portal data: client-visible comment in approval", approvals[0]?.comments.length > 0);
  check("Portal data: evidence items found", evidenceItems.length > 0);

  // 8. Cleanup
  await cleanup(reqId);
  const deleted = await prisma.clientRequestDb.findUnique({ where: { id: reqId } });
  check("Cleanup: ClientRequestDb deleted", deleted === null);

  console.log(`\n${failures === 0 ? "✅ FOUNDATION FLOW PASS" : `❌ FOUNDATION FLOW FAIL (${failures} failures)`}`);
  await prisma.$disconnect();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});

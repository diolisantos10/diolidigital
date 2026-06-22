// DB audit — counts all operational tables
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { PrismaClient } from "../lib/generated/prisma/client.js";

const dbUrl = process.env.DATABASE_URL ?? `file:${process.cwd()}/prisma/dev.db`;
const url = dbUrl.startsWith("file:./")
  ? `file:${process.cwd()}/${dbUrl.slice("file:./".length)}`
  : dbUrl;
const adapter = new PrismaLibSql({ url });
const prisma = new PrismaClient({ adapter } as never);

const [users, workspaces, clients, requests, projects, artifacts, approvals, comments,
  evidence, portal, timeline, brainChanges, brainUpdates, stratRooms, tasks,
  deliverables, aiRunLogs] = await Promise.all([
  prisma.user.count(),
  prisma.agencyWorkspace.count(),
  prisma.client.count(),
  prisma.clientRequestDb.count(),
  prisma.project.count(),
  prisma.brainArtifact.count(),
  prisma.approvalRequest.count(),
  prisma.approvalComment.count(),
  prisma.evidenceItem.count(),
  prisma.portalAccess.count(),
  prisma.timelineEvent.count(),
  prisma.brainChangeRequest.count(),
  prisma.brainUpdate.count(),
  prisma.strategyRoom.count(),
  prisma.task.count(),
  prisma.deliverable.count(),
  prisma.aIRunLog.count(),
]);

const rows: [string, number, string, string][] = [
  ["User",               users,        "PRESERVE", "master/admin users — never delete"],
  ["AgencyWorkspace",    workspaces,   "PRESERVE", "required for app boot"],
  ["Client",             clients,      "CLEAN",    "test seed / Dioli Digital"],
  ["ClientRequestDb",    requests,     "CLEAN",    "test/pilot requests"],
  ["Project",            projects,     "CLEAN",    "cascades from Client"],
  ["StrategyRoom",       stratRooms,   "CLEAN",    "cascades from Project"],
  ["Task",               tasks,        "CLEAN",    "cascades from Project"],
  ["Deliverable",        deliverables, "CLEAN",    "cascades from Project"],
  ["TimelineEvent",      timeline,     "CLEAN",    "cascades from Project"],
  ["BrainArtifact",      artifacts,    "CLEAN",    "cascades from ClientRequestDb"],
  ["ApprovalRequest",    approvals,    "CLEAN",    "cascades from ClientRequestDb"],
  ["ApprovalComment",    comments,     "CLEAN",    "cascades from ApprovalRequest"],
  ["EvidenceItem",       evidence,     "CLEAN",    "cascades from ClientRequestDb"],
  ["PortalAccess",       portal,       "CLEAN",    "cascades from ClientRequestDb"],
  ["BrainUpdate",        brainUpdates, "CLEAN",    "linked to clientRequestId"],
  ["BrainChangeRequest", brainChanges, "REVIEW",   "internal governance, no client link"],
  ["AIRunLog",           aiRunLogs,    "REVIEW",   "logs only, no PII"],
];

console.log("\n=== DB AUDIT ===");
console.log("Table                 | Count | Action   | Notes");
console.log("----------------------|-------|----------|------------------------------------------");
rows.forEach(([t, c, a, n]) =>
  console.log(`${t.padEnd(21)} | ${String(c).padStart(5)} | ${a.padEnd(8)} | ${n}`)
);

const toClean = rows.filter(([,, a]) => a === "CLEAN").reduce((s, [,c]) => s + c, 0);
const toPreserve = rows.filter(([,, a]) => a === "PRESERVE").reduce((s, [,c]) => s + c, 0);
console.log(`\nTotal to clean: ${toClean} records`);
console.log(`Total to preserve: ${toPreserve} records`);

await prisma.$disconnect();

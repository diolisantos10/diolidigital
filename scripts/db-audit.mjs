// DB audit script — counts all operational tables
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { PrismaClient } from "../lib/generated/prisma/client/index.js";

const dbUrl = process.env.DATABASE_URL ?? `file:${process.cwd()}/prisma/dev.db`;
const url = dbUrl.startsWith("file:./")
  ? `file:${process.cwd()}/${dbUrl.slice("file:./".length)}`
  : dbUrl;
const adapter = new PrismaLibSql({ url });
const prisma = new PrismaClient({ adapter });

const [users, workspaces, clients, requests, projects, artifacts, approvals, comments,
       evidence, portal, timeline, brainChanges, brainUpdates, stratRooms, tasks,
       deliverables, aiRunLogs, activityEvents] = await Promise.all([
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
  prisma.activityEvent.count(),
]);

console.log("=== DB AUDIT ===");
const rows = [
  ["User",              users,       "PRESERVE", "master/admin users"],
  ["AgencyWorkspace",   workspaces,  "PRESERVE", "app boot config"],
  ["Client",            clients,     "CLEAN",    "test seed data"],
  ["ClientRequestDb",   requests,    "CLEAN",    "test/pilot requests"],
  ["Project",           projects,    "CLEAN",    "projects linked to test clients"],
  ["BrainArtifact",     artifacts,   "CLEAN",    "cascades from clientRequestDb"],
  ["ApprovalRequest",   approvals,   "CLEAN",    "cascades from clientRequestDb"],
  ["ApprovalComment",   comments,    "CLEAN",    "cascades from approvalRequest"],
  ["EvidenceItem",      evidence,    "CLEAN",    "cascades from clientRequestDb"],
  ["PortalAccess",      portal,      "CLEAN",    "cascades from clientRequestDb"],
  ["TimelineEvent",     timeline,    "CLEAN",    "cascades from project"],
  ["StrategyRoom",      stratRooms,  "CLEAN",    "cascades from project"],
  ["Task",              tasks,       "CLEAN",    "cascades from project"],
  ["Deliverable",       deliverables,"CLEAN",    "cascades from project"],
  ["BrainChangeRequest",brainChanges,"REVIEW",   "internal governance — no client link"],
  ["BrainUpdate",       brainUpdates,"REVIEW",   "linked to clientRequestId"],
  ["AIRunLog",          aiRunLogs,   "REVIEW",   "logs only, no PII"],
  ["ActivityEvent",     activityEvents,"REVIEW", "logs only"],
];

console.log("Table | Count | Action | Notes");
console.log("------|-------|--------|------");
rows.forEach(([t,c,a,n]) => console.log(`${t} | ${c} | ${a} | ${n}`));

await prisma.$disconnect();

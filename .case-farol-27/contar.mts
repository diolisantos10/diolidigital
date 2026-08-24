import { prisma } from "../lib/db/client.ts";
const c = await prisma.client.findFirst({ where: { name: { contains: "Farol" } } });
const t: Record<string, number> = {
  activityEvents: await prisma.activityEvent.count({ where: { clientId: c!.id } }),
  materialRequests: await prisma.materialRequest.count(),
  brandUpdates: await prisma.brandUpdate.count(),
  handoffs: await prisma.handoffV2.count(),
  tasks: await prisma.task.count(),
  approvals: await prisma.approvalRequest.count(),
  deliverables: await prisma.deliverable.count(),
  socialPosts: await prisma.socialPost.count(),
  whatsappOutbox: await prisma.whatsAppOutbox.count(),
  adCampaigns: await prisma.adCampaign.count(),
  aiRunLogs: await prisma.aIRunLog.count(),
  portalMessages: await prisma.portalMessage.count(),
};
console.log(JSON.stringify(t, null, 2));
await prisma.$disconnect();

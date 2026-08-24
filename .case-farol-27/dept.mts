const { prisma } = await import("../lib/db/client.ts");
const t = await prisma.task.findMany();
console.log("TAREFAS:", t.length);
for (const x of t) console.log(" -", JSON.stringify({dep:(x as any).department, agente:(x as any).agentId, t:(x as any).title, s:(x as any).status}));
const d = await prisma.deliverable.findMany({ select:{ ownerAgentId:true, status:true, name:true }});
console.log("\nENTREGAS:", d.length);
for (const x of d) console.log(" -", x.ownerAgentId, "|", x.status, "|", x.name);
await prisma.$disconnect();

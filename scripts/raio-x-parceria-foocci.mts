// RAIO-X DA PARCERIA DA FOOCCI — LEITURA PURA, NENHUMA ESCRITA.
//
// POR QUE ISTO EXISTE. O parceiro (Marcos, Foocci) continua vendo cobrança. A
// concessão da parceria é por CLIENTE e o cadastro da FOOCCI nasceu DUAS vezes
// em 27/08 com 7 segundos de diferença (#400). Conceder no cadastro errado não
// conserta a tela dele e ainda cria uma segunda verdade sobre o mesmo parceiro.
//
// ⚠️ Por isso este passo é SÓ LEITURA. Medir antes de escrever, principalmente
// quando o alvo é ambíguo. A concessão vem depois, num segundo script, apontando
// para o id que este aqui provar ser o certo.
//
// Não imprime segredo nenhum: só id, nome, data e contagem.

import { PrismaClient } from "@/lib/generated/prisma/client";

const prisma = new PrismaClient();

const clientes = await prisma.client.findMany({
  where: { name: { contains: "oocci", mode: "insensitive" } },
  select: { id: true, name: true, email: true, createdAt: true },
  orderBy: { createdAt: "asc" },
});

console.log(`[RAIO-X] clientes com "oocci" no nome: ${clientes.length}`);
for (const c of clientes) {
  const parceria = await prisma.parceriaDoCliente.findUnique({
    where: { clientId: c.id },
    select: { id: true, validaAte: true, escopo: true, pecasContratadas: true, autorizadaPor: true },
  });
  const convites = await prisma.conviteDeParceria.count({ where: { clientId: c.id } });
  const projetos = await prisma.project.count({ where: { clientId: c.id } });

  console.log(
    `[RAIO-X] cliente=${c.id} nome=${JSON.stringify(c.name)} email=${JSON.stringify(c.email)} ` +
      `criado=${c.createdAt.toISOString()} parceria=${parceria ? `VIVA_ATE:${parceria.validaAte.toISOString()}` : "NENHUMA"} ` +
      `convites=${convites} projetos=${projetos}`,
  );
}

console.log("[RAIO-X] FIM — nenhuma escrita foi feita.");
await prisma.$disconnect();

// prontidao-de-publicacao.mts — POR QUE O POST NÃO SAI. SOMENTE LEITURA.
//
// Mesma resposta de `GET /api/meta/prontidao`, sem precisar de sessão — para
// quem tem o banco na mão e quer o veredito antes de mexer em qualquer coisa.
//
//   npx tsx scripts/prontidao-de-publicacao.mts
//   npx tsx scripts/prontidao-de-publicacao.mts --cliente=cmsi72jjk00070pn2mn1sh9gj
//   npx tsx scripts/prontidao-de-publicacao.mts --meta        (fala com a Meta: leitura debug_token)
//
// Contra PRODUÇÃO: exportar o `DATABASE_URL` de produção na chamada. Sem isso
// ele roda contra o banco local e não diz nada sobre o que está no ar.
//
// ⛔ NÃO PUBLICA, NÃO AGENDA, NÃO CORRIGE, NÃO ESCREVE — nem no banco nem na
// Meta. `--meta` faz exatamente UMA leitura (`debug_token`), que não toca em
// ativo nenhum. Um diagnóstico que conserta sozinho é um diagnóstico em que
// ninguém confia depois; aqui "consertar" significaria postar no perfil de um
// cliente de verdade.

import { prisma } from "@/lib/db/client";
import { conferirProntidao, type Portao } from "@/lib/agency/esteira/prontidao-de-publicacao";

function arg(nome: string): string | null {
  const achado = process.argv.find((a) => a.startsWith(`--${nome}=`));
  return achado ? achado.split("=").slice(1).join("=") : null;
}

const SIMBOLO: Record<Portao["estado"], string> = {
  passou: "OK  ",
  barrou: "BARRA",
  nao_medido: "?   ",
};

async function main(): Promise<void> {
  const clienteAlvo = arg("cliente");
  const medirNaMeta = process.argv.includes("--meta");

  // Sem sessão não há workspace: pega o do próprio post agendado. Diagnóstico
  // não pode exigir que quem o roda já saiba a resposta.
  const workspaces = await prisma.socialPost.findMany({
    where: { status: "scheduled", ...(clienteAlvo ? { clientId: clienteAlvo } : {}) },
    select: { workspaceId: true },
    distinct: ["workspaceId"],
    take: 5,
  });

  if (workspaces.length === 0) {
    console.log("\nNENHUM post com status 'scheduled' no banco alcançado por este DATABASE_URL.");
    console.log("Isto é uma resposta, não uma falha: não há o que publicar. O calendário precisa ser aprovado antes.\n");
    return;
  }

  for (const { workspaceId } of workspaces) {
    const r = await conferirProntidao({
      workspaceId,
      ...(clienteAlvo ? { clientId: clienteAlvo } : {}),
      medirNaMeta,
    });

    console.log(`\n${"=".repeat(78)}`);
    console.log(`WORKSPACE ${workspaceId} · medido em ${r.medidoEm}`);
    console.log(`${"=".repeat(78)}`);
    console.log(`\nVEREDITO: ${r.veredito}\n`);

    if (!medirNaMeta) {
      console.log("(o portão 12 — o que a META concedeu — não foi medido. Rode com --meta para medir.)\n");
    }

    for (const post of r.posts) {
      console.log(`${"-".repeat(78)}`);
      console.log(
        `POST ${post.postId} · cliente ${post.clientId ?? "(sem)"} · ${post.formato}` +
          ` · pilar ${post.pilar ?? "(sem)"} · ${post.agendadoPara ?? "sem data"}`,
      );
      if (post.ultimoErro) console.log(`  último erro gravado: ${post.ultimoErro}`);
      for (const p of post.portoes) {
        console.log(`  ${String(p.ordem).padStart(2)}. [${SIMBOLO[p.estado]}] ${p.nome}`);
        console.log(`        ${p.motivo}`);
        if (p.estado !== "passou") {
          console.log(`        resolve: ${p.quemResolve} → ${p.comoDestravar}`);
        }
      }
      console.log(`  ==> ${post.pronto ? "PRONTO" : `PARA EM: ${post.primeiroQueBarra?.nome ?? "(nenhum portão barra, mas há não-medidos)"}`}`);
    }
    console.log("");
  }
}

main()
  .catch((e) => {
    console.error("\nFALHA AO DIAGNOSTICAR:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

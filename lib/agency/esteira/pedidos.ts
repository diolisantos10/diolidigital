// pedidos.ts — uma voz para o cliente.
//
// Antes, cada agente que travava por falta de material mandava a própria
// mensagem no portal, assinando com o próprio nome. Funcionava — e era
// exatamente o que fazia a agência parecer desorganizada: o cliente recebia
// cinco pedidos soltos, em horários diferentes, às vezes pedindo a mesma coisa
// com palavras diferentes, sem saber o que era urgente.
//
// A regra agora: o agente ABRE o pedido; o gerente de projeto CONSOLIDA e fala.
// Muitos agentes atrás, uma voz na frente. O cliente conversa com a agência, não
// com seis robôs.
//
// A tabela de pedidos já existia no banco e estava sem uso. Aqui ela vira o
// registro de tudo que está travando a produção — e é ele que o painel lê para
// dizer "parado esperando o cliente" em vez de deixar o projeto mudo.

import { prisma } from "@/lib/db/client";

export interface PedidoAberto {
  id: string;
  tipo: string;
  descricao: string;
  agente: string | null;
  jaFoiPedido: boolean;
}

/**
 * Um agente registra que travou por falta de material.
 *
 * NÃO fala com o cliente. Não duplica: se já existe pedido em aberto do mesmo
 * agente para o mesmo tipo, o pedido antigo continua valendo — insistir duas
 * vezes pela mesma coisa é o oposto do que esta peça existe para resolver.
 */
export async function abrirPedido(input: {
  projectId: string;
  tipo: string;
  descricao: string;
  agentId: string;
  agenteLabel: string;
}): Promise<{ criado: boolean; id: string | null }> {
  try {
    const jaExiste = await prisma.materialRequest.findFirst({
      where: { projectId: input.projectId, type: input.tipo, status: "pending", requestedByAgentId: input.agentId },
      select: { id: true },
    });
    if (jaExiste) return { criado: false, id: jaExiste.id };

    const novo = await prisma.materialRequest.create({
      data: {
        projectId: input.projectId,
        type: input.tipo,
        description: input.descricao,
        status: "pending",
        requestedByAgentId: input.agentId,
        requestedByLabel: input.agenteLabel,
      },
      select: { id: true },
    });
    return { criado: true, id: novo.id };
  } catch (e) {
    console.warn("[esteira] não consegui abrir o pedido de material:", e instanceof Error ? e.message : e);
    return { criado: false, id: null };
  }
}

/** Tudo que está travando a produção deste projeto. */
export async function pedidosAbertos(projectId: string): Promise<PedidoAberto[]> {
  try {
    const linhas = await prisma.materialRequest.findMany({
      where: { projectId, status: "pending" },
      orderBy: { requestedAt: "asc" },
      select: { id: true, type: true, description: true, requestedByLabel: true, askedClientAt: true },
    });
    return linhas.map((l) => ({
      id: l.id,
      tipo: l.type,
      descricao: l.description,
      agente: l.requestedByLabel,
      jaFoiPedido: l.askedClientAt !== null,
    }));
  } catch {
    return [];
  }
}

/**
 * A mensagem que o PM manda: todos os pedidos novos, de uma vez só.
 *
 * Devolve null quando não há nada novo a cobrar — silêncio é a resposta certa
 * quando o cliente já foi perguntado e ainda não respondeu. Cobrar de novo o que
 * já foi cobrado é o jeito mais rápido de o cliente parar de ler o portal.
 */
export function redigirCobranca(pedidos: PedidoAberto[], nomeDoNegocio: string): string | null {
  const novos = pedidos.filter((p) => !p.jaFoiPedido);
  if (novos.length === 0) return null;

  const linhas: string[] = [];
  linhas.push(
    novos.length === 1
      ? `Oi! Para seguir com o projeto ${nomeDoNegocio}, precisamos de uma coisa sua:`
      : `Oi! Juntei aqui tudo que precisamos de você para seguir com o projeto ${nomeDoNegocio}:`,
  );
  linhas.push("");
  novos.forEach((p, i) => {
    linhas.push(`${novos.length > 1 ? `${i + 1}. ` : "• "}${p.descricao}`);
  });
  linhas.push("");
  linhas.push(
    novos.length === 1
      ? "Pode mandar por aqui mesmo. Assim que chegar, a gente retoma na hora."
      : "Pode mandar tudo por aqui mesmo — na ordem que for mais fácil pra você. O que chegar primeiro já destrava uma parte.",
  );
  return linhas.join("\n");
}

/** Marca os pedidos como já levados ao cliente, para o PM não cobrar de novo. */
export async function marcarComoCobrados(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  try {
    await prisma.materialRequest.updateMany({
      where: { id: { in: ids } },
      data: { askedClientAt: new Date() },
    });
  } catch (e) {
    console.warn("[esteira] não consegui marcar os pedidos como cobrados:", e instanceof Error ? e.message : e);
  }
}

/**
 * O PM cobra o cliente: junta os pedidos novos numa mensagem só e envia.
 * Devolve quantos pedidos entraram na mensagem (0 = nada novo, nada enviado).
 */
export async function cobrarCliente(input: {
  projectId: string;
  clientRequestId: string;
  nomeDoNegocio: string;
}): Promise<number> {
  const abertos = await pedidosAbertos(input.projectId);
  const texto = redigirCobranca(abertos, input.nomeDoNegocio);
  if (!texto) return 0;

  try {
    await prisma.portalMessage.create({
      data: {
        clientRequestId: input.clientRequestId,
        authorRole: "team",
        authorName: "Gerente de projeto",
        body: texto,
        readByTeam: true,
      },
    });
  } catch (e) {
    console.warn("[esteira] não consegui enviar a cobrança:", e instanceof Error ? e.message : e);
    return 0;
  }

  const novos = abertos.filter((p) => !p.jaFoiPedido);
  await marcarComoCobrados(novos.map((p) => p.id));
  return novos.length;
}

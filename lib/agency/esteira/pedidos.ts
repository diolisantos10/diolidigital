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

// ─────────────────────────────────────────────────────────────────────────────
// A VARREDURA — o pedido que ninguém nunca levou ao cliente
// ─────────────────────────────────────────────────────────────────────────────
//
// ── O buraco, medido na PRODUÇÃO em 08/08/2026 ──────────────────────────────
// O raio-x acusou: *"1 pedido pendente há +24h com `askedClientAt` vazio"* — o
// agente travou por falta de material e **a pergunta nunca chegou ao cliente**.
//
// A causa não é um caso raro; é estrutural. `cobrarCliente` tinha **um único
// chamador** (`run-execution.ts:869`) e ele só dispara:
//
//   • na MESMA passada que abriu o pedido (`if (askedClient.length > 0)`), e
//   • se a passada chegar até ali — o que não acontece quando ela cai antes,
//     nem quando o projeto termina em `blocked`, estado que o cron de
//     recuperação **não pega de propósito**.
//
// Quer dizer: o pedido nascia, o projeto morria, e não existia **nenhum**
// caminho no repositório inteiro capaz de perguntar aquilo ao cliente depois.
// O alarme do raio-x tocaria para sempre e ninguém poderia calá-lo — fila morta
// por construção. Do lado do cliente é pior: ele não sabe que está sendo
// esperado, e a agência parece ter parado.
//
// ── A escolha: varredura por TEMPO, não por evento ──────────────────────────
// Cobrar na hora já é o caminho feliz e continua valendo. Esta função é a rede
// embaixo dele, e o gatilho é o relógio — a mesma razão pela qual a régua de
// recompra mora no banco e não numa lista em memória: *"não existe 'alguém
// lembra'"*.
//
// ── Por que uma CARÊNCIA, e não varrer tudo ────────────────────────────────
// A cobrança já sai pela porta normal segundos depois de o pedido nascer. Uma
// varredura sem carência competiria com ela e mandaria a mesma pergunta duas
// vezes — e cliente que recebe pergunta repetida é cliente que para de ler o
// portal (é o que o cabeçalho deste arquivo existe para evitar). A carência é o
// mesmo horizonte que o raio-x usa para chamar algo de "preso": um dia.

/** Abaixo disto é operação normal; acima, alguém está esperando sem saber. */
export const CARENCIA_DA_COBRANCA_MS = 24 * 60 * 60 * 1000;

/** Teto por rodada. Recuperar alguns é recuperação; recuperar 200 é uma
 *  enxurrada de mensagens no portal que ninguém pediu — o mesmo teto que o
 *  despertador aplica a tudo que ele toca. */
const MAX_PROJETOS_POR_VARREDURA = 5;

export interface VarreduraDeCobranca {
  /** Projetos em que a cobrança esquecida finalmente saiu. */
  projetosCobrados: number;
  /** Pedidos que entraram nessas mensagens. */
  pedidosCobrados: number;
  /**
   * Pedidos vencidos que NÃO puderam ser cobrados, com o motivo.
   *
   * Campo próprio porque este é o caso perigoso: o pedido continua preso, o
   * raio-x continua acusando, e sem esta lista o motivo ficaria invisível — que
   * é exatamente o defeito que esta varredura veio consertar.
   */
  semDestino: Array<{ projectId: string; motivo: string }>;
}

/**
 * Varre os pedidos de material pendentes há mais de um dia que nunca chegaram
 * ao cliente e manda a pergunta.
 *
 * Idempotente: `cobrarCliente` marca `askedClientAt` no que cobrou, então a
 * rodada seguinte não encontra mais nada. Nunca cobra duas vezes a mesma coisa.
 */
export async function cobrarPedidosEsquecidos(agora: Date = new Date()): Promise<VarreduraDeCobranca> {
  const saida: VarreduraDeCobranca = { projetosCobrados: 0, pedidosCobrados: 0, semDestino: [] };

  let esquecidos: Array<{ projectId: string | null }>;
  try {
    esquecidos = await prisma.materialRequest.findMany({
      where: {
        status: "pending",
        askedClientAt: null,
        requestedAt: { lt: new Date(agora.getTime() - CARENCIA_DA_COBRANCA_MS) },
      },
      select: { projectId: true },
      orderBy: { requestedAt: "asc" },
    });
  } catch (e) {
    console.warn("[esteira] não consegui varrer os pedidos esquecidos:", e instanceof Error ? e.message : e);
    return saida;
  }

  // Um projeto pode ter vários pedidos esquecidos e a mensagem é UMA só — é a
  // regra deste arquivo ("muitos agentes atrás, uma voz na frente").
  const projetos = [...new Set(esquecidos.map((e) => e.projectId).filter((id): id is string => !!id))]
    .slice(0, MAX_PROJETOS_POR_VARREDURA);

  for (const projectId of projetos) {
    const projeto = await prisma.project.findUnique({
      where: { id: projectId },
      select: { clientRequestId: true, client: { select: { name: true } } },
    }).catch(() => null);

    // Sem solicitação de portal não há conversa onde escrever. Não inventamos
    // um destino: o pedido fica preso e o motivo fica ESCRITO. Ausência de
    // informação não é informação.
    if (!projeto?.clientRequestId) {
      saida.semDestino.push({ projectId, motivo: "o projeto não tem solicitação de portal — não há conversa onde perguntar" });
      continue;
    }

    // ── "NADA A COBRAR" E "A COBRANÇA FALHOU" NÃO SÃO A MESMA COISA ─────────
    // `cobrarCliente` devolve 0 nos dois casos, e tratá-los igual seria o
    // defeito nº 1 do incidente do Drive (07/08) outra vez: um `if` que confunde
    // "não sei" com "quebrou". Aqui a diferença é consequente — um 0 benigno
    // virando alarme ensina a equipe a ignorar o alarme, e um 0 de falha
    // silenciado recria a fila morta que esta varredura veio consertar.
    // Por isso se pergunta ANTES quantos havia a cobrar.
    const aCobrar = (await pedidosAbertos(projectId)).filter((p) => !p.jaFoiPedido).length;
    if (aCobrar === 0) continue;

    const cobrados = await cobrarCliente({
      projectId,
      clientRequestId: projeto.clientRequestId,
      nomeDoNegocio: projeto.client?.name ?? "seu projeto",
    });
    if (cobrados > 0) {
      saida.projetosCobrados++;
      saida.pedidosCobrados += cobrados;
    } else {
      saida.semDestino.push({ projectId, motivo: "a cobrança não pôde ser escrita no portal" });
    }
  }

  return saida;
}

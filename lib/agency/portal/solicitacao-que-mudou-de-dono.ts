// ── QUAIS SOLICITAÇÕES JÁ FORAM DE OUTRO CLIENTE ────────────────────────────
//
// ── O furo que isto fecha (15/08/2026, rodada 3, adendo do `qualidade`) ─────
// A rodada 2 declarou o FURO A fechado porque toda escrita nova passou a
// carimbar o `clientId`. O `qualidade` mostrou que isso vale para o FUTURO e
// não para o PRESENTE:
//
//   • o carimbo começa hoje; **nenhuma linha já gravada em produção o tem**;
//   • a cerca excluía uma solicitação só quando havia, presa a ela, uma linha
//     carimbada com OUTRO dono;
//   • logo, uma conversa **100% legada** não tem carimbo nenhum, não há o que
//     provar, e ela atravessava inteira.
//
// Probe dele, banco e rota de verdade, solicitação re-apontada com histórico
// 100% legado:
//
//   {"messages":[{"body":"SEGREDO-LEGADO proposta de R$ 12.000"}, …]}
//
// Era o sintoma que o CEO viu, ainda de pé, dentro do código "consertado".
//
// ── A saída, e por que ela não é adivinhação ────────────────────────────────
// Não dá para inventar o dono de uma linha sem dono — a lei da casa proíbe. O
// que dá é **parar de depender de uma prova que só a mensagem podia dar**. A
// mensagem não é o único registro que amarra uma solicitação a um cliente:
//
//   • `PortalAccess` — desde a rodada 2 ele CONGELA o dono. Um acesso com
//     `clientRequestId = R` e `clientId = A`, enquanto `R` pertence a `B`, é
//     prova documental de que R mudou de mãos. Todo cliente de portal tem um.
//   • `Project` — nasce com `clientId` e `clientRequestId` juntos. Toda compra
//     de balcão e todo projeto de esteira cria um.
//   • `ApprovalRequest` — mesma dupla de chaves, nascida no fluxo de aprovação.
//   • `PortalMessage` — a prova original, que continua valendo.
//
// Basta UMA dessas quatro discordar para a solicitação ser considerada
// ambígua. É evidência, não palpite: são quatro registros independentes que a
// casa já grava, e o caso do probe (o dono antigo tinha portal) é coberto pelo
// primeiro deles.
//
// **As duas metades:** no caso limpo nenhuma das quatro discorda, nada é
// escondido e o histórico legado continua inteiro.

import { prisma } from "@/lib/db/client";

/**
 * De uma lista de solicitações que HOJE pertencem a `clientId`, quais têm
 * evidência de já terem pertencido a outro.
 *
 * ⚠️ Falha de leitura **FECHA**: se não der para apurar, devolve TODAS como
 * suspeitas. "Não sei quais mudaram de dono" e "nenhuma mudou" são fatos
 * opostos, e o segundo é o que vaza.
 */
export async function solicitacoesQueMudaramDeDono(
  clientId: string,
  ids: string[],
): Promise<Set<string>> {
  if (ids.length === 0) return new Set();

  // `Project.clientId` é NOT NULL no schema; nas outras três é anulável. Por
  // isso o filtro precisa das duas formas — a mesma pergunta, dois tipos.
  const alheioAnulavel = { not: null as null, notIn: [clientId] };
  const alheioObrigatorio = { notIn: [clientId] };

  try {
    const [mensagens, acessos, projetos, aprovacoes] = await Promise.all([
      prisma.portalMessage.findMany({
        where: { clientRequestId: { in: ids }, clientId: alheioAnulavel },
        select: { clientRequestId: true }, distinct: ["clientRequestId"],
      }),
      prisma.portalAccess.findMany({
        where: { clientRequestId: { in: ids }, clientId: alheioAnulavel },
        select: { clientRequestId: true }, distinct: ["clientRequestId"],
      }),
      prisma.project.findMany({
        where: { clientRequestId: { in: ids }, clientId: alheioObrigatorio },
        select: { clientRequestId: true }, distinct: ["clientRequestId"],
      }),
      prisma.approvalRequest.findMany({
        where: { clientRequestId: { in: ids }, clientId: alheioAnulavel },
        select: { clientRequestId: true }, distinct: ["clientRequestId"],
      }),
    ]);

    const suspeitas = new Set<string>();
    for (const grupo of [mensagens, acessos, projetos, aprovacoes]) {
      if (!Array.isArray(grupo)) continue;
      for (const linha of grupo) {
        if (linha?.clientRequestId) suspeitas.add(linha.clientRequestId);
      }
    }
    return suspeitas;
  } catch {
    // FECHA, não abre.
    return new Set(ids);
  }
}

// ── O CENSO DO RISCO RESIDUAL (15/08/2026, rodada 3, adendo 2) ──────────────
//
// A primeira versão do censo **tranquilizava**, e o `qualidade` chamou isso de
// o pior item da operação — com razão. Ela contava só o que a cerca JÁ bloqueia:
//
//   | cenário                                   | ambíguas | achava |
//   | carimbo conflitante + 1 legada            |    1     |   1  ✅ |
//   | re-apontada com histórico 100% legado     |    2     |   0  ❌ |
//
// Falso negativo estrutural. E como o carimbo começou agora, em produção ela
// tenderia a devolver **0/0** — que seria lido como "não há contaminação"
// justamente no caso mais exposto. Um número que mente é pior que número
// nenhum: o CEO decide com ele.
//
// Agora o censo usa a MESMA evidência da cerca (`solicitacoesQueMudaramDeDono`)
// e publica o **universo de risco** como número principal.

export interface CensoDeHistoricoAmbiguo {
  medidoEm: string;
  totalDeMensagens: number;
  /** 🔴 O NÚMERO PRINCIPAL: linhas sem dono escrito. É o universo de risco —
   *  toda mensagem anterior ao carimbo cai aqui, e é sobre ele que a pergunta
   *  "algum cliente pode ter visto o que não era dele?" incide. */
  semDonoEscrito: number;
  solicitacoesQueTrocaramDeDono: number;
  /** Linhas ambíguas que a cerca esconde HOJE (o custo, não o risco). */
  mensagensOcultadasPelaCerca: number;
  solicitacoesAfetadas: string[];
  /** Solicitações de PROSPECT (sem dono). Ficavam fora da conta antiga. */
  solicitacoesSemDono: number;
}

/** Somente leitura. Não migra, não carimba, não apaga. */
export async function censoDeHistoricoAmbiguo(): Promise<CensoDeHistoricoAmbiguo> {
  const solicitacoes = await prisma.clientRequestDb.findMany({ select: { id: true, clientId: true } });

  // ⚠️ O ponto cego antigo: `if (atual && …)` pulava solicitação de dono NULO,
  // e o ramo do prospect ficava fora da cerca E fora do censo. Ele entra aqui.
  const porCliente = new Map<string, string[]>();
  let solicitacoesSemDono = 0;
  for (const s of solicitacoes) {
    if (!s.clientId) { solicitacoesSemDono++; continue; }
    porCliente.set(s.clientId, [...(porCliente.get(s.clientId) ?? []), s.id]);
  }

  const afetadas = new Set<string>();
  for (const [clientId, ids] of porCliente) {
    for (const id of await solicitacoesQueMudaramDeDono(clientId, ids)) afetadas.add(id);
  }

  const mensagensOcultadasPelaCerca = afetadas.size === 0 ? 0 : await prisma.portalMessage.count({
    where: { clientRequestId: { in: [...afetadas] }, clientId: null },
  });

  return {
    medidoEm: new Date().toISOString(),
    totalDeMensagens: await prisma.portalMessage.count(),
    semDonoEscrito: await prisma.portalMessage.count({ where: { clientId: null } }),
    solicitacoesQueTrocaramDeDono: afetadas.size,
    mensagensOcultadasPelaCerca,
    solicitacoesAfetadas: [...afetadas],
    solicitacoesSemDono,
  };
}

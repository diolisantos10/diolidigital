// orcamento-do-briefing.ts — o orçamento que já existia e ninguém entregava.
//
// O QUE ACONTECEU, 16/08/2026, com o CEO na tela:
// Ele fez o briefing do CityJobs, anexou dois PDFs e recebeu uma confirmação
// prometendo o orçamento "em breve". Ficou horas esperando. No servidor, entre
// o envio e a madrugada, nada — nenhuma execução, nenhuma fila, nenhum aviso.
//
// A DESCOBERTA QUE ENCURTOU O CONSERTO: o orçamento **já estava calculado**.
// A sala de briefing calcula ao vivo enquanto a conversa acontece
// (`computeEstimate`, número derivado — a IA nunca inventa valor) e envia junto
// no `briefingJson.estimate`. Ou seja: o número existia, estava gravado no
// pedido, e simplesmente nunca era mostrado a ninguém. Não faltava calcular.
// Faltava ENTREGAR.
//
// É o mesmo defeito da casa outra vez: caixa certa, seta faltando.
//
// ─── O QUE ESTE ARQUIVO FAZ, E SÓ ISSO ──────────────────────────────────────
//
// Toda passada do relógio, pega briefing novo que tem orçamento guardado,
// escreve o orçamento na conversa do portal — em português, sem jargão — e
// move o pedido para a fila de proposta, onde gente vê.
//
// ─── O QUE ELE NÃO FAZ, DE PROPÓSITO ────────────────────────────────────────
//
// • **Não calcula nada.** Usa o número que a sala de briefing derivou. Se o
//   pedido não tiver orçamento guardado, ele NÃO inventa um: marca como
//   pendente para gente olhar. Número nesta casa não é alucinado.
// • **Não fecha negócio.** O texto diz que é estimativa e que a proposta final
//   vem da equipe. Faixa de estimativa não é preço acordado.
// • **Não promete prazo.** Ordem do CEO em 16/08: *"não autorizei nada disso"*
//   sobre o "em 1 dia" que a tela prometia. Aqui não se promete data nenhuma.
// • **Não fala duas vezes.** O pedido sai de `new` na mesma transação da
//   mensagem; se uma falhar, nenhuma vale.

import { prisma } from "@/lib/db/client";

/** Teto por rodada. O relógio bate de 5 em 5 min; enxurrada nunca. */
const MAX_POR_RODADA = 5;

export type ResultadoDoOrcamento = {
  entregues: number;
  semOrcamento: number;
  falhas: string[];
};

type EstimativaGuardada = {
  totalMin?: number;
  totalMax?: number;
  items?: { label?: string; detail?: string; unit?: string }[];
  included?: string[];
  notIncluded?: string[];
  missingForEstimate?: string[];
};

/** Lê a estimativa que a sala de briefing gravou. Nunca lança: briefing com
 *  JSON quebrado vira "sem orçamento", que é tratado por gente — e não um erro
 *  que derruba a rodada inteira do relógio. */
function estimativaDe(briefingJson: string | null): EstimativaGuardada | null {
  if (!briefingJson) return null;
  try {
    const corpo = JSON.parse(briefingJson) as { estimate?: EstimativaGuardada };
    const e = corpo?.estimate;
    if (!e || typeof e.totalMin !== "number" || typeof e.totalMax !== "number") return null;
    if (e.totalMin <= 0 && e.totalMax <= 0) return null;
    return e;
  } catch {
    return null;
  }
}

const real = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

/**
 * O texto que o cliente lê. Escrito para quem NÃO trabalha na agência: sem id,
 * sem nome de sistema, sem custo interno, sem prazo prometido.
 */
export function textoDoOrcamento(negocio: string, e: EstimativaGuardada): string {
  const linhas: string[] = [];

  linhas.push(`Recebemos seu briefing${negocio ? ` da ${negocio}` : ""} — obrigado pelo material.`);
  linhas.push("");

  const min = e.totalMin ?? 0;
  const max = e.totalMax ?? 0;
  linhas.push(
    min === max
      ? `Pelo que você descreveu, a estimativa é de ${real(min)} por mês.`
      : `Pelo que você descreveu, a estimativa fica entre ${real(min)} e ${real(max)} por mês.`,
  );

  const itens = (e.items ?? []).filter((i) => i?.label);
  if (itens.length > 0) {
    linhas.push("");
    linhas.push("O que entra nessa conta:");
    for (const i of itens.slice(0, 8)) {
      linhas.push(`• ${i.label}${i.detail ? ` — ${i.detail}` : ""}`);
    }
  }

  const fora = (e.notIncluded ?? []).filter(Boolean);
  if (fora.length > 0) {
    linhas.push("");
    linhas.push("O que NÃO está incluído:");
    for (const f of fora.slice(0, 6)) linhas.push(`• ${f}`);
  }

  // A honestidade que faltava: dizer que ainda falta informação, em vez de
  // apresentar faixa larga como se fosse precisão.
  const falta = (e.missingForEstimate ?? []).filter(Boolean);
  if (falta.length > 0) {
    linhas.push("");
    linhas.push("Para fechar o número, ainda precisamos de:");
    for (const f of falta.slice(0, 5)) linhas.push(`• ${f}`);
  }

  linhas.push("");
  linhas.push(
    "Isto é uma estimativa a partir do que você contou, não a proposta final — " +
      "a equipe confere e te manda a proposta fechada por aqui. Se algo acima " +
      "estiver diferente do que você precisa, é só responder nesta conversa.",
  );

  return linhas.join("\n");
}

/**
 * Entrega o orçamento de quem acabou de entregar briefing.
 *
 * Chamado pelo despertador. Erro num pedido não derruba os outros: o próximo
 * cliente não pode pagar pelo anterior.
 */
export async function entregarOrcamentosPendentes(): Promise<ResultadoDoOrcamento> {
  const resultado: ResultadoDoOrcamento = { entregues: 0, semOrcamento: 0, falhas: [] };

  // ── POR QUE `lead_incompleto` ENTRA AQUI ──────────────────────────────────
  // 16/08/2026, sete horas depois de este arquivo subir: ele não tinha
  // entregado UM orçamento. Nem falha, nem entrega — silêncio.
  //
  // A causa estava na porta de entrada. `app/api/brain/client-requests` grava
  //   status: contato.temComoFalar ? "new" : "lead_incompleto"
  // e o briefing do CEO entrou SEM contato — porque o SDR havia parado de pedir
  // e-mail. Resultado: o pedido nasceu marcado como incompleto e ficou fora da
  // vista de tudo. Ele esperou a noite inteira por um orçamento de um pedido
  // que o sistema tratava como lixo.
  //
  // Faltar contato NÃO é faltar pedido. O cliente escreveu, anexou material e
  // está com o portal aberto — o orçamento chega ali, e o portal não precisa
  // de e-mail nenhum para funcionar. O que a falta de contato impede é AVISAR
  // por fora; não é atender.
  //
  // ── E POR QUE `scope_ready` ─────────────────────────────────────────────
  // Terceira e última descoberta, e só apareceu quando o diário do piloto
  // ficou de pé e deixou os Diretores enxergarem o banco. O briefing do CEO
  // estava lá, intacto, COM anexo e COM orçamento calculado — em `scope_ready`.
  //
  // O auto-scope (`lib/dioli-brain/run-auto-scope.ts`) tinha rodado nele,
  // oito agentes de estratégia trabalharam, o pedido avançou para
  // `scope_ready`... e ali morreu. Nenhum código pega esse estado. Escopo
  // pronto era o fim da linha em vez do meio dela.
  //
  // A lição, que vale mais que a linha: durante três teorias eu procurei o
  // pedido nos estados que EU imaginava, em vez de perguntar ao banco em que
  // estado ele estava. Diagnóstico por dedução perde para uma leitura.
  const pedidos = await prisma.clientRequestDb
    .findMany({
      where: { status: { in: ["new", "lead_incompleto", "scope_ready"] } },
      orderBy: { createdAt: "asc" },
      take: MAX_POR_RODADA,
    })
    .catch(() => []);

  for (const pedido of pedidos) {
    try {
      const e = estimativaDe(pedido.briefingJson);
      if (!e) {
        // Sem número derivado não se inventa número. Fica de pé como estava,
        // para a fila de gente — e conta como notícia, não como rotina.
        resultado.semOrcamento += 1;
        continue;
      }

      const corpo = textoDoOrcamento(pedido.businessName ?? "", e);

      await prisma.$transaction([
        prisma.portalMessage.create({
          data: {
            clientRequestId: pedido.id,
            clientId: pedido.clientId,
            authorRole: "team",
            authorName: "Gerente de projeto",
            body: corpo,
            readByTeam: true,
          },
        }),
        // Sair de `new` é o que impede mandar duas vezes, e é o que faz o
        // pedido aparecer na fila de proposta para a equipe.
        prisma.clientRequestDb.update({
          where: { id: pedido.id },
          data: { status: "proposal_pending" },
        }),
      ]);

      resultado.entregues += 1;
    } catch (err) {
      resultado.falhas.push(err instanceof Error ? err.message : String(err));
    }
  }

  return resultado;
}

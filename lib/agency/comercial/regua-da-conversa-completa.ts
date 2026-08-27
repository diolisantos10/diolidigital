// A RÉGUA DO "JÁ DÁ PARA ATENDER" — a metade PURA da promoção, sem uma linha
// de banco, de propósito.
//
// ═══ POR QUE ESTE ARQUIVO NÃO IMPORTA PRISMA ════════════════════════════════
//
// Lição já paga por esta casa (`parceria-do-cliente.ts` a repete no topo): a
// sala de briefing e o `question-engine` rodam NO NAVEGADOR, e
// `await import("@/lib/db/client")` dentro de função NÃO impede o empacotador
// de arrastar o Prisma para o bundle do cliente. `tsc` passa, a suíte passa, e
// quem reprova é `npm run build` — depois de tudo parecer verde. Régua pura em
// arquivo sem banco; leitura de banco em `promover-conversas-paradas.ts`.
//
// ═══ O DEFEITO QUE ESTA RÉGUA EXISTE PARA NÃO CRIAR ═════════════════════════
//
// O primeiro cliente real (FOOCCI, `cmtc145qf007a0xo4txmjss11`) conversou com o
// SDR em 27/08 às 01:34 e de novo às 13:43, contou o que precisava, e NENHUM
// pedido nasceu — 24 horas de atraso no orçamento de quem já tinha entregado o
// briefing inteiro. O rastro dessa conversa passou a ser gravado no mesmo dia
// (`conversa-sem-pedido.ts`) e NINGUÉM AGIA SOBRE ELE: a décima ocorrência da
// família "trava construída sem fechadura". *Coluna gravada não é cliente
// informado.*
//
// A tentação óbvia — promover TODA conversa parada — é pior que o defeito:
// **metade de briefing virando pedido produz orçamento errado com cara de
// certo**, e o cliente recebe um número que ninguém pode sustentar. Esta régua
// é o que separa "recuperar o que ele já disse" de "inventar o que ele não
// disse".
//
// ⛔ NADA AQUI PREENCHE LACUNA. Não há valor padrão, não há inferência
// "razoável", não há campo deduzido de outro. Falta dado → a conversa NÃO vira
// pedido; vira uma pendência NOMEADA, dizendo o que falta. Recuperar o que o
// cliente JÁ ESCREVEU é honrar o trabalho dele; completar o que ele não
// escreveu é mentir, e a diferença é a única coisa que importa neste arquivo.

import type { BriefingScope } from "@/lib/agency/briefing-conversation";
import { computeEstimate } from "@/lib/agency/live-calculator";

/** O que a estimativa derivada guarda. Mesmo formato que
 *  `orcamento-do-briefing.ts` já lê — uma forma só, não uma segunda. */
export type EstimativaDaConversa = {
  totalMin: number;
  totalMax: number;
  travadaPor?: string;
};

export type VeredictoDaConversa =
  /** Dá para orçar AGORA, com o que a pessoa mesma escreveu. */
  | { pode: true; escopo: BriefingScope; estimativa: EstimativaDaConversa }
  /** Não dá. `faltando` é a pendência NOMEADA — nunca um "não" mudo. */
  | { pode: false; faltando: string[] };

function texto(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

/**
 * ESTE ESCOPO JÁ DÁ PARA ORÇAR?
 *
 * As exigências são as MESMAS de `canSubmitProposal` (`sdr-agent.ts`), a régua
 * que o botão de enviar do briefing usa — quem: nome; o quê: negócio e ao menos
 * um serviço pedido —, mais a única que o botão não precisava fazer porque a
 * tela calculava ao vivo: **o número tem de fechar**. `computeEstimate` é
 * determinística e se RECUSA a somar sem volume declarado (`travadaPor`), e é
 * essa recusa que impede o zero do CityJobs de voltar como preço.
 *
 * ⚠️ Não exige contato. Faltar canal impede AVISAR, nunca ATENDER — é a lei que
 * `orcamento-do-briefing.ts` já escreveu ao aceitar `lead_incompleto` na fila.
 * O orçamento chega ao portal de qualquer jeito; o e-mail só sai se houver
 * endereço DECLARADO pelo cliente (nunca inventado, nunca `.invalid`).
 */
export function conversaJaDaParaOrcar(escopoBruto: unknown): VeredictoDaConversa {
  const faltando: string[] = [];

  if (!escopoBruto || typeof escopoBruto !== "object" || Array.isArray(escopoBruto)) {
    return { pode: false, faltando: ["o escopo da conversa não é legível"] };
  }
  const e = escopoBruto as Record<string, unknown>;

  if (!texto(e.prospectName)) faltando.push("o nome de quem falou com a casa");
  if (!texto(e.businessName)) faltando.push("o nome do negócio");

  const branding = e.branding as { requested?: unknown } | undefined;
  const temServico =
    e.wantsSocialMedia === true ||
    e.wantsPaidTraffic === true ||
    (!!branding && typeof branding === "object" && branding.requested === true);
  if (!temServico) faltando.push("qual serviço ele quer (social, tráfego ou identidade)");

  // A conta só é tentada quando o resto está de pé: `computeEstimate` sobre um
  // escopo sem serviço devolveria zero, e zero é ausência — nunca preço.
  if (faltando.length > 0) return { pode: false, faltando };

  const escopo = escopoBruto as BriefingScope;
  let estimativa: EstimativaDaConversa;
  try {
    const bruta = computeEstimate(escopo);
    estimativa = {
      totalMin: bruta.totalMin,
      totalMax: bruta.totalMax,
      ...(bruta.travadaPor ? { travadaPor: bruta.travadaPor } : {}),
    };
  } catch {
    // Escopo torto NÃO vira pedido. A alternativa — seguir com um número de
    // consolo — é exatamente o orçamento errado com cara de certo.
    return { pode: false, faltando: ["a conta do orçamento não fechou sobre este escopo"] };
  }

  if (estimativa.travadaPor) {
    return { pode: false, faltando: [`o volume de trabalho (${estimativa.travadaPor})`] };
  }
  if (!(estimativa.totalMin > 0 || estimativa.totalMax > 0)) {
    return { pode: false, faltando: ["o volume de trabalho — a conta fechou em zero"] };
  }

  return { pode: true, escopo, estimativa };
}

/** A pendência em uma linha, para o log da rodada e para quem for atender.
 *  Frase constante mentiria: o que falta muda o que a pessoa tem de fazer. */
export function fraseDaPendencia(fio: string, faltando: string[]): string {
  return `${fio}: não vira pedido sozinho — falta ${faltando.join(", ")}.`;
}

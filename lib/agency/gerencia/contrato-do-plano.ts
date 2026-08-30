// O CONTRATO DO PLANO CONTRA O ESCOPO — o plano não vende o que o cliente recusou.
//
// ── O QUE ISTO FECHA, MEDIDO EM PRODUÇÃO (26/08/2026) ───────────────────────
//
// 6ª volta de cliente oculto (`docs/medicoes/jornada-cliente-oculto-26-08-rodada6.md`,
// item 8). O cliente escreveu, com todas as letras:
//
//     "Anúncios não, agora não."
//
// O escopo aceito registrou o que ele disse — `wantsPaidTraffic: false`,
// `services: ["social_media"]`. E o plano do Gerente Geral saiu com sete
// tarefas, uma delas:
//
//     "Planejamento de Paid Strategy (Opcional)" — agente a4 (tráfego pago)
//
// O plano vem de um modelo de linguagem. Pedir ao prompt que ele respeite o
// escopo é aviso; **o que trava é código**, e o lugar do código é a porta por
// onde TODO plano entra: `despacharPlanoPeloGerenteGeral`. As duas portas que
// criam projeto nesta casa passam por lá, então a regra mora num lugar só —
// duas cópias divergem, e é assim que uma porta respeita o escopo e a outra não.
//
// ── O QUE ELE FAZ E O QUE ELE **NÃO** FAZ ──────────────────────────────────
//
// FAZ: recusa a tarefa cujo departamento o cliente RECUSOU explicitamente, e
// recusa a tarefa cujas PALAVRAS vendem o serviço recusado ainda que ela venha
// carimbada com outro departamento — que foi exatamente o caso medido ("Paid
// Strategy" chegando por `strategy`).
//
// NÃO FAZ: recusar tarefa só porque o serviço dela não está na lista de
// contratados. Strategy Room, KPIs e alinhamento de marca não aparecem em
// `services` de briefing nenhum, e barrá-las mataria o plano inteiro. Esta é
// uma **dívida declarada**: a metade positiva do contrato (só se produz o que
// se vendeu) exige um catálogo de serviço→entregável que esta casa ainda não
// tem, e inventá-lo aqui seria trocar um plano largo por um plano mudo.
//
// E a assimetria é de propósito: **ausência de flag nunca vira recusa**.
// `wantsPaidTraffic: undefined` é "o cliente não disse", e guardrail 1 desta
// casa proíbe concluir uma negação a partir do silêncio. Só `false` — a palavra
// dele registrada — recusa.
//
// Módulo PURO: sem banco, sem rede, sem IA.

/** O escopo que o cliente aceitou, do ponto de vista do que ele RECUSOU. */
export interface EscopoContratado {
  /**
   * Departamentos canônicos que o cliente recusou EXPLICITAMENTE (flag `false`
   * no escopo aceito). Vazio = ele não recusou nada por escrito, e o contrato
   * não barra nada.
   */
  recusados: string[];
  /** Onde a recusa está registrada, palavra por palavra, para a frase do motivo. */
  ondeEstaRegistrado: Record<string, string>;
}

/** Escopo vazio: ninguém recusou nada. Não barra tarefa alguma. */
export function escopoSemRecusa(): EscopoContratado {
  return { recusados: [], ondeEstaRegistrado: {} };
}

/** As flags do escopo aceito, como o SDR/briefing as grava. */
export interface FlagsDoEscopo {
  wantsPaidTraffic?: boolean | null;
  wantsSocialMedia?: boolean | null;
  branding?: { requested?: boolean | null } | null;
}

/**
 * A flag `false` do escopo aceito → o departamento canônico recusado.
 *
 * Só `false` entra. `undefined`/`null` é silêncio, e silêncio não recusa.
 */
export function escopoDoBriefing(flags: FlagsDoEscopo | null | undefined): EscopoContratado {
  const escopo = escopoSemRecusa();
  if (!flags || typeof flags !== "object") return escopo;

  const marcar = (departamento: string, campo: string) => {
    escopo.recusados.push(departamento);
    escopo.ondeEstaRegistrado[departamento] = campo;
  };

  if (flags.wantsPaidTraffic === false) marcar("paid-traffic", "wantsPaidTraffic: false");
  if (flags.wantsSocialMedia === false) marcar("social-media", "wantsSocialMedia: false");
  if (flags.branding && flags.branding.requested === false) marcar("branding", "branding.requested: false");

  return escopo;
}

/**
 * Lê as flags de um `briefingJson` bruto (a coluna do banco). JSON ilegível
 * vira escopo sem recusa — nunca lança, e nunca inventa uma recusa que não leu.
 */
export function escopoDoBriefingJson(briefingJson: string | null | undefined): EscopoContratado {
  if (!briefingJson) return escopoSemRecusa();
  try {
    const bruto = JSON.parse(briefingJson) as Record<string, unknown>;
    if (!bruto || typeof bruto !== "object") return escopoSemRecusa();
    // O escopo pode estar na raiz ou aninhado em `scope` — as duas formas
    // existem no banco desta casa, e ler só uma é ler metade.
    const raiz = bruto as FlagsDoEscopo;
    const aninhado = (bruto.scope ?? bruto.escopo) as FlagsDoEscopo | undefined;
    const combinado: FlagsDoEscopo = {
      wantsPaidTraffic: primeiroBooleano(raiz.wantsPaidTraffic, aninhado?.wantsPaidTraffic),
      wantsSocialMedia: primeiroBooleano(raiz.wantsSocialMedia, aninhado?.wantsSocialMedia),
      branding: raiz.branding ?? aninhado?.branding ?? null,
    };
    return escopoDoBriefing(combinado);
  } catch {
    return escopoSemRecusa();
  }
}

function primeiroBooleano(...valores: Array<boolean | null | undefined>): boolean | undefined {
  for (const v of valores) if (typeof v === "boolean") return v;
  return undefined;
}

/**
 * O VOCABULÁRIO DE CADA SERVIÇO — a segunda trava.
 *
 * Existe porque o caso medido não veio pelo departamento: "Planejamento de Paid
 * Strategy (Opcional)" chegou com o departamento de estratégia. Carimbo errado
 * na tarefa não pode ser a porta dos fundos do escopo.
 *
 * As expressões são propositalmente ESTREITAS. "Campanha" sozinha não entra:
 * campanha de conteúdo é social media legítimo, e barrar por ela transformaria
 * o contrato num moedor de plano. Só entra o que só existe em mídia paga.
 */
const VOCABULARIO: Record<string, RegExp> = {
  "paid-traffic":
    /\b(?:tr[áa]fego\s*pago|m[íi]dia\s*paga|paid\s*(?:strategy|traffic|media|ads|social)|google\s*ads|meta\s*ads|facebook\s*ads|instagram\s*ads|tiktok\s*ads|an[úu]ncios?\s*pagos?|campanhas?\s*(?:de\s*)?(?:m[íi]dia|an[úu]ncios?|ads)|impulsionamento|verba\s*de\s*m[íi]dia|budget\s*de\s*m[íi]dia|ro[ai]s\b)/i,
  "social-media":
    /\b(?:calend[áa]rio\s*editorial|plano\s*de\s*conte[úu]do|gest[ãa]o\s*de\s*redes|social\s*media)\b/i,
  branding:
    /\b(?:rebrand\w*|brand\s*book|manual\s*de\s*marca|identidade\s*visual|nova\s*marca)\b/i,
};

export interface TarefaConferida {
  title: string;
  description?: string | null;
}

export type VeredictoDoContrato =
  | { ok: true }
  | { ok: false; motivo: string; departamentoRecusado: string };

/**
 * A CONFERÊNCIA. Recebe a tarefa, o departamento canônico a que ela foi
 * despachada e o escopo do cliente; devolve veredicto como VALOR — recusa não
 * lança, para quem chama ter de decidir o que fazer com ela.
 */
export function conferirContraOEscopo(
  tarefa: TarefaConferida,
  departamentoCanonico: string,
  escopo: EscopoContratado | null | undefined,
): VeredictoDoContrato {
  if (!escopo || escopo.recusados.length === 0) return { ok: true };

  const texto = `${tarefa.title ?? ""} ${tarefa.description ?? ""}`;

  for (const recusado of escopo.recusados) {
    const onde = escopo.ondeEstaRegistrado[recusado] ?? "escopo aceito";

    if (departamentoCanonico === recusado) {
      return {
        ok: false,
        departamentoRecusado: recusado,
        motivo:
          `O cliente RECUSOU "${recusado}" no escopo aceito (${onde}), e esta tarefa é desse departamento. ` +
          `Plano não vende o que o cliente disse que não quer.`,
      };
    }

    const vocabulario = VOCABULARIO[recusado];
    if (vocabulario && vocabulario.test(texto)) {
      return {
        ok: false,
        departamentoRecusado: recusado,
        motivo:
          `O cliente RECUSOU "${recusado}" no escopo aceito (${onde}), e esta tarefa vende esse serviço ` +
          `pelas próprias palavras ("${tarefa.title}") ainda que tenha chegado como "${departamentoCanonico}". ` +
          `Carimbo de departamento não é porta dos fundos do escopo.`,
      };
    }
  }

  return { ok: true };
}

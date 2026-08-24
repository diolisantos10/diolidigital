// O QUE, DE FATO, CAUSA REFAÇÃO NESTA CASA — e a pergunta que teria evitado.
//
// ── Por que este arquivo existe (24/08/2026) ────────────────────────────────
//
// A produção só começa DEPOIS do pagamento. O preço já está fechado quando a
// primeira peça é apresentada. Logo, **toda refação é prejuízo da casa** — não
// é retrabalho cobrado, é margem queimada. Reduzir refação é reduzir custo
// direto, e é a única alavanca de custo que não depende de negociar nada.
//
// O briefing, até aqui, perguntava **o que é fácil perguntar**. A lista de
// perguntas nova não pode nascer de palpite: formulário longo faz prospect
// desistir, e prospect que desiste custa mais que peça retida (regra medida em
// 24/08/2026, ver `question-engine.ts`). Então **pergunta nova precisa de
// lastro**: uma falta que a casa REGISTROU estar custando peça.
//
// Este módulo é o lastro. Ele faz duas coisas separadas de propósito:
//
//   1. **O CATÁLOGO** (`CAUSAS`) — as causas de refação que a casa já mediu,
//      cada uma com a citação, o arquivo e a DATA de onde a medição saiu.
//      Afirmação medida tem prazo de validade: sem fonte e data, ninguém
//      consegue conferir depois se ainda vale.
//   2. **A CONTAGEM AO VIVO** (`contarCausasDeRefacao`) — lê os registros reais
//      da casa (as peças barradas, as reprovações de dentro, os pedidos de
//      ajuste do cliente, os `PRECISO CONFIRMAR` que sobraram dentro da
//      entrega) e classifica cada ocorrência numa causa do catálogo.
//
// O catálogo diz **por que a pergunta entrou**; a contagem diz **se ela ainda
// se justifica**. Uma causa que parar de aparecer nos registros é uma pergunta
// que pode sair do formulário — e é assim que o formulário não cresce para
// sempre.
//
// ⚠️ ESTE MÓDULO NÃO JULGA PEÇA E NÃO ESCREVE NADA. Só lê e conta.

// ⚠️ O CLIENTE DO BANCO ENTRA POR IMPORT TARDIO, DENTRO DA FUNÇÃO QUE CONTA.
// O catálogo (`CAUSAS`) é lido pelo motor de perguntas do briefing, que roda
// também no navegador; um `import { prisma }` no topo arrastaria o banco para
// dentro do pacote do cliente. O tipo abaixo é `import type` — some na
// compilação e não carrega nada.
import type { CampoDaMarca } from "@/lib/agency/esteira/campos-da-marca";

/** As causas que a casa já mediu. Id estável: ele é a chave que liga a causa à
 *  pergunta do briefing, e renomear um id quebra o lastro da pergunta. */
export type CausaId =
  | "canal_nao_informado"
  | "horario_ou_dia"
  | "area_ou_cidade"
  | "cor_e_tipografia"
  | "voz_e_lexico"
  | "exemplo_de_referencia"
  | "quem_aprova"
  | "proibicao_violada";

/** De onde a medição saiu. Sem arquivo e sem data ninguém confere se ainda vale
 *  — e regra de marca sem prazo de validade vira folclore. */
export interface Medicao {
  /** O arquivo desta casa onde a medição está registrada. */
  fonte: string;
  /** Quando foi medido, em DD/MM/AAAA. */
  data: string;
  /** As palavras do registro, sem reescrita. */
  citacao: string;
}

export interface Causa {
  id: CausaId;
  /** Como um humano chama esta falta. */
  rotulo: string;
  /** Por onde a falta aparece no texto de um parecer, de um motivo de
   *  reprovação ou de um `PRECISO CONFIRMAR`. Conservador de propósito: causa
   *  classificada errado vira pergunta sem lastro. */
  padroes: RegExp[];
  /** O campo da constituição da marca que responde esta falta — quando é falta
   *  de MARCA. `null` quando é falta OPERACIONAL (horário, área, canal), que
   *  mora no `operacao_basica`. */
  campoDaMarca: CampoDaMarca | null;
  /** A pergunta do briefing que evita esta falta. `null` = medida e ainda sem
   *  pergunta: é a fila de trabalho, não um esquecimento. */
  perguntaQueEvita: string | null;
  /** O lastro. Vazio é proibido — há teste que reprova causa sem medição. */
  evidencia: Medicao[];
}

/**
 * O CATÁLOGO. Cada entrada só existe porque a casa registrou a falta custando
 * peça — nenhuma foi imaginada para "ficar completo".
 */
export const CAUSAS: readonly Causa[] = [
  {
    id: "canal_nao_informado",
    rotulo: "canal de contato (o @ e se atende por WhatsApp)",
    padroes: [
      /preciso confirmar[^\n]{0,40}(whats|instagram|@|canal|perfil|contato|n[úu]mero|telefone)/i,
      // O parecer real trazia o canal ANTES do marcador: "chame no WhatsApp
      // [PRECISO CONFIRMAR: número]". Ler só numa direção perdia a medição que
      // deu origem a esta causa.
      /(whats|instagram|@\w|perfil)[^\n]{0,30}preciso confirmar/i,
      /canal_nao_informado/i,
      /\bconfirmar canais\b/i,
    ],
    campoDaMarca: null,
    perguntaQueEvita: "operacao_basica",
    evidencia: [{
      fonte: "lib/agency/execution/especialistas.ts (regrasDeRedacao)",
      data: "24/08/2026",
      citacao:
        'peças escritas com CTA do tipo "chame no WhatsApp [PRECISO CONFIRMAR: número]" '
        + "foram REPROVADAS pela Qualidade e o pacote inteiro ficou retido",
    }],
  },
  {
    id: "horario_ou_dia",
    rotulo: "horário e dias de funcionamento",
    padroes: [
      /horario_nao_informado/i,
      /preciso confirmar[^\n]{0,40}(hor[áa]rio|dia)/i,
      /restringir dias de funcionamento/i,
    ],
    campoDaMarca: null,
    perguntaQueEvita: "operacao_basica",
    evidencia: [{
      fonte: "lib/agency/execution/especialistas.ts (regrasDeRedacao)",
      data: "24/08/2026",
      citacao:
        'a peça foi barrada em `horario_nao_informado`; e com o horário atestado a peça '
        + 'saiu falando em dias úteis e foi REPROVADA por "restringir dias de funcionamento sem base"',
    }],
  },
  {
    id: "area_ou_cidade",
    rotulo: "cidade, bairros e raio de atendimento",
    padroes: [
      /area_nao_informada/i,
      /preciso confirmar[^\n]{0,40}(cidade|bairro|[áa]rea|raio)/i,
      /sem "?cidade"?/i,
    ],
    campoDaMarca: null,
    perguntaQueEvita: "operacao_basica",
    evidencia: [{
      fonte: "lib/agency/execution/especialistas.ts (contratoDaSegmentacao)",
      data: "24/08/2026",
      citacao: 'sem "cidade" — negócio local anunciado no país inteiro é dinheiro queimado',
    }],
  },

  // ── A METADE DE MARCA: medida no Farol 27, e NUNCA perguntada a tempo ──────
  // As quatro abaixo saíram do mesmo lugar: a base de marca do Farol 27, com os
  // campos que ficaram em LACUNA depois de a produção já ter começado. Cada
  // lacuna dessas vira "PRECISO CONFIRMAR" dentro da peça — quando o trabalho
  // já foi feito e já foi pago.
  {
    id: "cor_e_tipografia",
    rotulo: "cores da marca e tipografia",
    padroes: [
      /atributos_formais/i,
      /paleta[^\n]{0,30}(hex|documentada)/i,
      /preciso confirmar[^\n]{0,40}(cor|paleta|fonte|tipografia|logo)/i,
      /arquivo vetorial do logo/i,
      /tipografia oficial/i,
    ],
    campoDaMarca: "atributos_formais",
    perguntaQueEvita: "marca_basica",
    evidencia: [{
      fonte: "__tests__/branding/regua-sobre-a-base-de-marca.test.ts (base de marca Farol 27)",
      data: "24/08/2026",
      citacao:
        'campo `atributos_formais` em lacuna: "paleta em hex e arquivo da fonte"; '
        + 'materiais em lacuna: "arquivo vetorial do logo; paleta de cores documentada; tipografia oficial"',
    }],
  },
  {
    id: "voz_e_lexico",
    rotulo: "tom de voz e as palavras que não se usa",
    padroes: [
      /\blexico\b/i,
      /\bvoz\b[^\n]{0,20}(lacuna|n[ãa]o (definid|declarad))/i,
      /tom (de voz )?(n[ãa]o|sem)[^\n]{0,20}(informad|definid|declarad)/i,
      /preciso confirmar[^\n]{0,40}(tom|voz|palavra)/i,
    ],
    campoDaMarca: "lexico",
    perguntaQueEvita: "marca_basica",
    evidencia: [{
      fonte: "lib/agency/esteira/campos-da-marca.ts (MODO_MINIMO) + case Farol 27",
      data: "24/08/2026",
      citacao:
        "`lexico` e `proibicoes` estão entre os quatro campos do MODO MÍNIMO — "
        + '"sem os quais não existe julgamento nem escalada possível"',
    }],
  },
  {
    id: "exemplo_de_referencia",
    rotulo: "um exemplo do que ficou certo e do que ficou errado",
    padroes: [
      /\breferencias\b/i,
      /post que (ficou certo|voc[êe] achou)/i,
      /moodboard/i,
      /preciso confirmar[^\n]{0,40}(refer[êe]ncia|exemplo)/i,
    ],
    campoDaMarca: "referencias",
    perguntaQueEvita: "marca_basica",
    evidencia: [{
      fonte: "__tests__/branding/regua-sobre-a-base-de-marca.test.ts (base de marca Farol 27)",
      data: "24/08/2026",
      citacao: 'campo `referencias` em lacuna: "um post que ficou certo e um que ficou errado"',
    }],
  },
  {
    id: "quem_aprova",
    rotulo: "quem aprova o material, e por qual canal",
    padroes: [
      /hierarquia_e_dono/i,
      /quem aprova/i,
      /aprova[çc][ãa]o parada|sem aprovador/i,
    ],
    campoDaMarca: "hierarquia_e_dono",
    perguntaQueEvita: "marca_basica",
    evidencia: [{
      fonte: "__tests__/branding/regua-sobre-a-base-de-marca.test.ts (base de marca Farol 27)",
      data: "24/08/2026",
      citacao: 'campo `hierarquia_e_dono` em lacuna: "quem aprova o material e por qual canal"',
    }],
  },

  // ── E a causa que NÃO se resolve perguntando mais ─────────────────────────
  // Esta é a razão da Missão B: a peça violou algo que o cliente JÁ tinha dito.
  // Perguntar de novo não conserta; o que conserta é a recusa virar regra.
  {
    id: "proibicao_violada",
    rotulo: "a peça usou o que o cliente já tinha proibido",
    padroes: [/proibicao_do_cliente/i, /o cliente PROIBIU/i],
    campoDaMarca: "proibicoes",
    perguntaQueEvita: null,
    evidencia: [{
      fonte: "lib/agency/esteira/proibicoes.ts (cabeçalho) + piso-de-verdade.ts",
      data: "06/08/2026",
      citacao:
        "peça que viola uma proibição registrada é pior que peça sem graça, porque o "
        + "cliente já avisou — ele lê a mesma palavra que pediu para nunca mais usar, "
        + "na peça pela qual pagou",
    }],
  },
];

const PORID = new Map<CausaId, Causa>(CAUSAS.map((c) => [c.id, c]));

/** A causa deste parecer, ou `null` quando o texto não casa com nenhuma que a
 *  casa saiba nomear. `null` é resposta honesta: causa que ninguém mediu não
 *  vira pergunta. */
export function classificarCausa(texto: string | null | undefined): CausaId | null {
  const t = (texto ?? "").trim();
  if (!t) return null;
  for (const c of CAUSAS) {
    for (const p of c.padroes) {
      p.lastIndex = 0;
      if (p.test(t)) return c.id;
    }
  }
  return null;
}

/** Todas as causas que uma pergunta do briefing evita. Vazio = pergunta sem
 *  lastro, e pergunta sem lastro é formulário mais longo de graça. */
export function causasDaPergunta(qid: string): Causa[] {
  return CAUSAS.filter((c) => c.perguntaQueEvita === qid);
}

/** As causas medidas que ainda NÃO têm pergunta. É a fila de trabalho — e ela
 *  fica visível de propósito, em vez de virar silêncio. */
export function causasSemPergunta(): Causa[] {
  return CAUSAS.filter((c) => c.perguntaQueEvita === null);
}

// ─────────────────────────────────────────────────────────────────────────────
// A CONTAGEM AO VIVO
// ─────────────────────────────────────────────────────────────────────────────

export interface CausaContada {
  causa: Causa;
  ocorrencias: number;
  /** Até três registros reais, para ninguém ter de acreditar no número. */
  exemplos: string[];
}

export interface ContagemDeCausas {
  /** `false` quando a leitura falhou. Nunca "não houve refação" — ausência de
   *  informação não é informação. */
  lidas: boolean;
  /** Ordenado por ocorrências, do que mais custa para o que menos custa. */
  ranking: CausaContada[];
  /** Registros que não casaram com nenhuma causa conhecida. Contados e não
   *  escondidos: é aqui que a próxima causa vai aparecer. */
  naoClassificados: number;
  /** A janela lida, em dias. */
  janelaDias: number;
}

const JANELA_PADRAO_DIAS = 90;
const TETO_DE_REGISTROS = 500;

/**
 * Conta, nos registros REAIS da casa, o que vem custando peça.
 *
 * Três fontes, e as três são o mesmo fenômeno visto de ângulos diferentes:
 *   • `DepartmentLadderRecord` — a peça barrada no piso, no contrato ou pela
 *     Qualidade. É a refação que a casa pegou ANTES de o cliente ver.
 *   • `ActivityEvent` do tipo `peca_reprovada` — o "não é isso" de dentro.
 *   • `Deliverable.clientFeedback` — o pedido de ajuste do CLIENTE, que é o
 *     caro: a peça já foi apresentada e já estava paga.
 *
 * Nunca lança. Falha de leitura devolve `lidas: false`.
 */
export async function contarCausasDeRefacao(input?: {
  workspaceId?: string | null;
  janelaDias?: number;
}): Promise<ContagemDeCausas> {
  const janelaDias = input?.janelaDias ?? JANELA_PADRAO_DIAS;
  const desde = new Date(Date.now() - janelaDias * 24 * 60 * 60 * 1000);
  const ws = input?.workspaceId ?? undefined;

  const textos: string[] = [];
  try {
    const { prisma } = await import("@/lib/db/client");
    const barradas = await prisma.departmentLadderRecord.findMany({
      where: {
        ...(ws ? { workspaceId: ws } : {}),
        criadoEm: { gte: desde },
        resultado: { in: ["reprovada_qualidade", "barrada_piso", "barrada_contrato"] },
      },
      select: { detalhe: true },
      take: TETO_DE_REGISTROS,
    });
    textos.push(...barradas.map((b) => b.detalhe ?? ""));

    const reprovadas = await prisma.activityEvent.findMany({
      where: { ...(ws ? { workspaceId: ws } : {}), type: "peca_reprovada", timestamp: { gte: desde } },
      select: { message: true },
      take: TETO_DE_REGISTROS,
    });
    textos.push(...reprovadas.map((r) => r.message ?? ""));

    // O pedido de ajuste do CLIENTE. Sem filtro de workspace no `Deliverable`
    // (ele não tem a coluna): a chave é o projeto, e a janela é a mesma.
    const ajustes = await prisma.deliverable.findMany({
      where: { updatedAt: { gte: desde }, NOT: { clientFeedback: null } },
      select: { clientFeedback: true, content: true },
      take: TETO_DE_REGISTROS,
    });
    for (const a of ajustes) {
      textos.push(a.clientFeedback ?? "");
      // O `PRECISO CONFIRMAR` que sobrou DENTRO da entrega: a lacuna que virou
      // texto na cara do cliente. É o sintoma mais direto de pergunta que
      // deveria ter sido feita antes.
      for (const m of (a.content ?? "").match(/PRECISO CONFIRMAR:[^\n"]{0,80}/gi) ?? []) textos.push(m);
    }
  } catch (e) {
    console.warn(`[causas-de-refacao] não consegui ler os registros: ${String(e)}`);
    return { lidas: false, ranking: [], naoClassificados: 0, janelaDias };
  }

  const contagem = new Map<CausaId, { n: number; exemplos: string[] }>();
  let naoClassificados = 0;
  for (const t of textos) {
    if (!t.trim()) continue;
    const id = classificarCausa(t);
    if (!id) { naoClassificados++; continue; }
    const atual = contagem.get(id) ?? { n: 0, exemplos: [] };
    atual.n += 1;
    if (atual.exemplos.length < 3) atual.exemplos.push(t.slice(0, 200));
    contagem.set(id, atual);
  }

  const ranking: CausaContada[] = [...contagem.entries()]
    .map(([id, v]) => ({ causa: PORID.get(id)!, ocorrencias: v.n, exemplos: v.exemplos }))
    .sort((a, b) => b.ocorrencias - a.ocorrencias);

  return { lidas: true, ranking, naoClassificados, janelaDias };
}

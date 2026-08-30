// O DOSSIÊ DO LEAD — tudo que a agência consegue montar SEM falar com a pessoa.
//
// Pedido do CEO em 08/08/2026, sobre as três solicitações paradas há 51, 29 e 28
// dias: *"produza, para cada uma, o que a agência conseguir montar sem contato:
// leitura do negócio, proposta de escopo e faixa de preço pela tabela da casa.
// Deixe pronto no admin para o CEO decidir se aborda."*
//
// TRÊS REGRAS MANDAM AQUI, e as três existem porque a alternativa já custou caro:
//
//  1. **DETERMINÍSTICO.** Nenhuma chamada de IA. O dossiê é uma LEITURA do que
//     está gravado somada à TABELA DA CASA (`live-calculator` +
//     `service-catalog`). Um modelo escrevendo "leitura do negócio" produziria
//     prosa convincente sobre um cliente que ninguém conferiu — que é
//     exatamente o modo de falhar desta casa sem revisor humano.
//
//  2. **O QUE NÃO SE SABE APARECE COMO NÃO SABIDO.** Faixa de preço sem cadência
//     declarada é faixa larga E DIZ QUE É LARGA. Serviço que a tabela não
//     reconhece vira "preciso confirmar", nunca zero. Preço não medido e preço
//     zero não dividem o mesmo pixel.
//
//  3. **CONTATO NÃO SE DEDUZ.** `pistasDeContato` é campo separado, com outro
//     nome, e o dossiê o rotula como *pista não confirmada*. O `@sushicazzaoficial`
//     do Sushi Cazza aparece porque é a única ponta de sete semanas de espera —
//     e **quem aborda é o CEO**, não a máquina.

import { SOCIAL_PACKAGES, computeEstimate, getPackageDef, detectPackage } from "@/lib/agency/live-calculator";
import { DEPARTMENT_CATALOG } from "@/lib/agency/service-catalog";
import type { BriefingScope } from "@/lib/agency/briefing-conversation";
import {
  lerContato,
  pistasDeContato,
  type ContatoDoLead,
  type PistaDeContato,
} from "./contato-do-lead";
import type { RepeticaoDoProspect } from "./chave-do-prospect";
import { confrontoDeVerba, type ConfrontoDeVerba } from "./verba-declarada";
import { lerNegocio } from "./negocio-do-lead";

export type FonteDaFaixa =
  /** O escopo gravado bastou: a tabela foi aplicada sobre a cadência declarada. */
  | "escopo_declarado"
  /** Só sabemos QUAIS serviços — não quanto volume. A faixa é a banda do catálogo. */
  | "catalogo_sem_cadencia"
  /** Nada casou com a tabela. Não há faixa, e isso é um fato, não um zero. */
  | "indeterminada";

export type LinhaDeEscopo = {
  departamento: string;
  item: string;
  detalhe: string;
  minimo: number;
  maximo: number;
  unidade: string;
};

export type DossieDoLead = {
  id: string;
  /** `null` quando o briefing não trouxe nome do negócio. Ausência de
   *  informação não é informação — nunca string vazia. Ver `negocio-do-lead.ts`.
   *  Some ausente daqui e entra em `precisoConfirmar`. */
  negocio: string | null;
  segmento: string | null;
  paradoDesde: string;
  diasParado: number;
  status: string;

  /** Como falar — ou a declaração explícita de que não dá. */
  contato: ContatoDoLead;
  /** Pistas do texto. **Não são contato.** Ver a regra 3 no cabeçalho. */
  pistas: PistaDeContato[];

  /**
   * **ESTE MESMO CONTATO JÁ ESCREVEU ANTES?** (16/08/2026)
   *
   * Pergunta do CEO: *"se entrar um cliente com o mesmo e-mail e fizer cinco
   * briefings um atrás do outro, o que acontece com o sistema?"*. Acontecia que
   * apareciam **cinco cartões idênticos e anônimos** nesta fila, e nada dizia
   * que eram a mesma pessoa — quem abrisse a tela trataria cinco pedidos de um
   * prospect como cinco prospects.
   *
   * `null` quando é a única vez, ou quando o briefing chegou **sem canal
   * declarado** — sem contato não existe chave, e agrupar dois leads anônimos
   * por semelhança de nome seria a inferência que esta casa proíbe.
   *
   * ⚠️ **Marca, não funde.** Ver `agruparPorProspect`: cinco briefings do mesmo
   * e-mail podem ser um reenvio OU um segundo projeto legítimo, e nenhum código
   * distingue os dois. Quem decide é gente, com os dois textos na frente.
   */
  repeticao: RepeticaoDoProspect | null;

  /** O que o lead disse que quer, como ele mesmo disse. */
  servicosPedidos: string[];
  objetivos: string[];
  /** Frases do briefing que sustentam a leitura. Citação, não paráfrase. */
  oQueEleContou: string[];

  escopo: LinhaDeEscopo[];
  faixa: { minimo: number; maximo: number } | null;
  fonteDaFaixa: FonteDaFaixa;
  /** Por que a faixa é o que é — vai para a tela, sempre. */
  notaDaFaixa: string;

  /**
   * **A ESTIMATIVA PASSOU DA VERBA QUE ELE DECLAROU?** (16/08/2026)
   *
   * `null` na maioria dos casos, e isso é o comportamento certo: só é
   * preenchido quando o lead declarou uma faixa, essa faixa tem teto, e o
   * **piso** do que a casa calculou já passa desse teto.
   *
   * Por que existe: em 16/08/2026, no piloto ao vivo, o CEO declarou
   * **R$ 500/mês** e a casa devolveu **R$ 1.800 – R$ 3.400** sem dizer uma
   * palavra sobre a diferença. Os dois números já viviam neste mesmo dossiê,
   * lado a lado, e ninguém os comparava — a pessoa disse quanto tinha e a casa
   * seguiu como se não tivesse ouvido.
   *
   * A regra mora em `verba-declarada.ts` — **a mesma** que o prospect ouve na
   * conversa (`live-calculator`) e lê no orçamento. É de propósito: em 16/08
   * duas frentes construíram esta regra em dobro no mesmo dia, e duas fontes do
   * mesmo julgamento comercial divergem no dia em que alguém mexe numa só. O
   * jeito de descobrir seria o cliente ouvindo uma coisa e lendo outra.
   */
  acimaDaVerba: ConfrontoDeVerba | null;

  /** O que só uma conversa resolve. Nunca preenchido por inferência. */
  precisoConfirmar: string[];
};

type Entrada = {
  id: string;
  businessName: string;
  segment?: string | null;
  status: string;
  createdAt: Date | string;
  services?: string[];
  objectives?: string[];
  rawContext?: string | null;
  briefingJson?: unknown;
  sdrHandoffJson?: unknown;
};

const DIA = 24 * 60 * 60 * 1000;

function escopoGravado(briefingJson: unknown): BriefingScope | null {
  const b =
    typeof briefingJson === "string"
      ? (() => { try { return JSON.parse(briefingJson); } catch { return null; } })()
      : briefingJson;
  const scope = (b as { scope?: unknown } | null)?.scope;
  if (!scope || typeof scope !== "object") return null;
  const s = scope as Partial<BriefingScope>;
  // Escopo só é utilizável se disser QUAL departamento. Um objeto `{}` passaria
  // pelo `typeof` e faria `computeEstimate` devolver zero — e zero aqui teria
  // cara de "a agência calculou e deu R$ 0".
  const temDepartamento = s.wantsSocialMedia || s.wantsPaidTraffic || s.branding?.requested;
  if (!temDepartamento) return null;
  return { objectives: [], wantsSocialMedia: false, ...s } as BriefingScope;
}

/** Palavras que a casa reconhece por departamento. Lista explícita: "isto é
 *  social media" é fato declarado aqui, não julgamento de quem lê. */
const PALAVRAS: Record<"social" | "traffic" | "branding", RegExp> = {
  social:   /social|conte[úu]do|post|instagram|reels|stories|calend[áa]rio|m[íi]dia social|planejamento/i,
  traffic:  /tr[áa]fego|an[úu]ncio|ads|campanha|performance|google|meta ads|impulsion/i,
  branding: /identidade|branding|logo|marca|dire[çc][ãa]o visual|paleta|visual/i,
};

function departamentosPedidos(servicos: string[], objetivos: string[]): Array<"social" | "traffic" | "branding"> {
  const texto = [...servicos, ...objetivos].join(" · ");
  return (Object.keys(PALAVRAS) as Array<"social" | "traffic" | "branding">)
    .filter((d) => PALAVRAS[d].test(texto));
}

/** As primeiras falas do prospect, cruas. Citação do que ele disse é a única
 *  "leitura do negócio" que esta casa pode assinar sem ter falado com ele. */
function frasesDoBriefing(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/\n+/)
    .map((l) => l.replace(/^\s*(?:\*\*)?(?:cliente|prospect|usu[áa]rio|dioli|assistente)(?:\*\*)?\s*:\s*/i, "").trim())
    .filter((l) => l.length >= 25 && l.length <= 400)
    .slice(0, 8);
}

export function montarDossie(
  entrada: Entrada,
  agora: Date = new Date(),
  /** Só quem enxerga a FILA INTEIRA sabe disto — por isso vem de fora, e não é
   *  calculado aqui dentro. Quem calcula é `agruparPorProspect`. */
  repeticao: RepeticaoDoProspect | null = null,
): DossieDoLead {
  const criadoEm = entrada.createdAt instanceof Date ? entrada.createdAt : new Date(entrada.createdAt);
  const servicos = entrada.services ?? [];
  const objetivos = entrada.objectives ?? [];

  const escopo: LinhaDeEscopo[] = [];
  let fonteDaFaixa: FonteDaFaixa = "indeterminada";
  let notaDaFaixa = "";

  const gravado = escopoGravado(entrada.briefingJson);

  if (gravado) {
    // Caminho bom: a conversa deixou cadência declarada. Aplica-se a tabela.
    const est = computeEstimate(gravado);
    for (const item of est.items) {
      // ── ITEM SEM PREÇO NÃO ENTRA NA FAIXA (26/08/2026) ──────────────────
      // Com a tabela única, tráfego pago e identidade visual saem da proposta
      // COM escopo e SEM preço ("orçado à parte"). Entrar aqui como zero
      // puxaria o mínimo do dossiê para baixo e faria o comercial negociar
      // contra um piso que não existe. O item continua sendo dito ao cliente
      // na proposta; o que ele não faz é virar número numa faixa.
      if (item.minPrice === null || item.maxPrice === null) continue;
      escopo.push({
        departamento: "declarado no briefing",
        item: item.label,
        detalhe: item.detail,
        minimo: item.minPrice,
        maximo: item.maxPrice,
        unidade: item.unit,
      });
    }
    if (escopo.length > 0) {
      fonteDaFaixa = "escopo_declarado";
      const plano = gravado.social?.postsPerWeek
        ? getPackageDef(detectPackage(gravado.social.postsPerWeek * 4)).label
        : null;
      notaDaFaixa =
        `Faixa calculada pela tabela da casa sobre o escopo que o próprio lead declarou` +
        (plano ? ` (${plano})` : "") +
        `. Confiança do cálculo: ${est.confidence}.` +
        (est.missingForEstimate.length
          ? ` Ainda falta: ${est.missingForEstimate.join(", ")}.`
          : "");
    }
  }

  if (escopo.length === 0) {
    // Caminho honesto: sabemos QUAIS departamentos, não QUANTO volume. A faixa
    // é a banda inteira do catálogo — larga de propósito, e dizendo que é.
    const depts = departamentosPedidos(servicos, objetivos);
    for (const id of depts) {
      const cat = DEPARTMENT_CATALOG.find((d) => d.id === id);
      if (!cat) continue;
      if (cat.plans?.length) {
        const min = Math.min(...SOCIAL_PACKAGES.map((p) => p.minPrice));
        const max = Math.max(...SOCIAL_PACKAGES.map((p) => p.maxPrice));
        escopo.push({
          departamento: cat.name,
          item: "Plano de Social Media (a definir)",
          detalhe: `Do ${SOCIAL_PACKAGES[0].label} ao ${SOCIAL_PACKAGES[SOCIAL_PACKAGES.length - 1].label} — a cadência não foi declarada`,
          minimo: min,
          maximo: max,
          unidade: "mês",
        });
      }
      for (const addon of cat.addons ?? []) {
        // Um departamento com dois add-ons alternativos (branding básico vs.
        // completo) entra só com o mais barato: somar os dois cobraria duas
        // vezes pelo mesmo trabalho e inflaria a faixa sem ninguém perceber.
        if (escopo.some((l) => l.departamento === cat.name)) continue;
        escopo.push({
          departamento: cat.name,
          item: addon.label,
          detalhe: addon.detail,
          minimo: addon.minPrice,
          maximo: addon.maxPrice,
          unidade: addon.unit,
        });
      }
    }
    if (escopo.length > 0) {
      fonteDaFaixa = "catalogo_sem_cadencia";
      notaDaFaixa =
        "O lead disse QUAIS serviços quer, mas a conversa não fixou volume (posts por semana, " +
        "verba de mídia, escopo da identidade). A faixa abaixo é a banda inteira do catálogo da casa " +
        "— ela estreita numa conversa, não antes dela.";
    }
  }

  if (escopo.length === 0) {
    notaDaFaixa =
      "Nenhum serviço deste briefing casou com a tabela da casa. **Não há faixa de preço**, e isso " +
      "não é R$ 0: é a agência declarando que ainda não sabe precificar o que foi pedido.";
  }

  const faixa = escopo.length
    ? {
        minimo: escopo.reduce((s, l) => s + l.minimo, 0),
        maximo: escopo.reduce((s, l) => s + l.maximo, 0),
      }
    : null;

  const contato = lerContato(entrada);

  // A comparação que faltava. Sem faixa calculada não há o que comparar — e
  // faixa ausente é fato declarado neste dossiê, nunca um zero disfarçado.
  const acimaDaVerba = faixa ? confrontoDeVerba(gravado?.budgetRange, faixa.minimo) : null;

  const negocio = lerNegocio(entrada.businessName);

  const precisoConfirmar: string[] = [];
  if (!contato.temComoFalar) precisoConfirmar.push("Como falar com esta pessoa (nome + WhatsApp ou e-mail) — não há nada gravado, e nada foi deduzido do texto");
  if (!negocio) precisoConfirmar.push("Nome do negócio");
  if (!entrada.segment) precisoConfirmar.push("Segmento do negócio");
  if (fonteDaFaixa !== "escopo_declarado") precisoConfirmar.push("Volume contratado (posts por semana, verba de mídia, escopo da identidade)");
  if (!gravado?.budgetRange) precisoConfirmar.push("Faixa de investimento que o lead tem em mente");
  if (!gravado?.deadline) precisoConfirmar.push("Prazo desejado para começar");

  return {
    id: entrada.id,
    negocio,
    segmento: entrada.segment?.trim() || null,
    paradoDesde: criadoEm.toISOString(),
    diasParado: Math.floor((agora.getTime() - criadoEm.getTime()) / DIA),
    status: entrada.status,
    contato,
    pistas: pistasDeContato(entrada.rawContext),
    repeticao,
    servicosPedidos: servicos,
    objetivos,
    oQueEleContou: frasesDoBriefing(entrada.rawContext),
    escopo,
    faixa,
    fonteDaFaixa,
    notaDaFaixa,
    acimaDaVerba,
    precisoConfirmar,
  };
}

// SERVER-ONLY. Never import from client components.
// Reads ClientRequestDb + (optionally) the related Client's BrandBrain from Prisma
// for a clientRequestId and returns a sanitized ClientKnowledgeSnapshot.
//
// Law 2: never invents missing values. A DB field that is null/empty becomes
// `undefined` on the snapshot and its name is recorded in `missingFields[]`.
// No PII keys (email/phone) are ever copied into the snapshot.

import { prisma } from "@/lib/db/client";
import {
  extrairVerdadeOperacional,
  operacaoVazia,
  separarValoresInformados,
  type VerdadeDoCliente,
  type VerdadeOperacional,
} from "@/lib/agency/execution/piso-de-verdade";
import { lerProibicoes } from "@/lib/agency/esteira/proibicoes";

export interface ClientKnowledgeSnapshot {
  clientRequestId: string;
  businessName: string;
  segment: string;
  services: string[];
  objectives: string[];
  rawContext: string;
  // BrandBrain fields (from DB, not from UI state)
  brandVoice?: string;
  positioning?: string;
  targetAudience?: string;
  preferredChannels?: string;
  visualStyle?: string;
  colors?: string;
  fonts?: string;
  thingsToAvoid?: string;
  productsToHighlight?: string;
  /**
   * A verdade OPERACIONAL do cliente — horário, área de entrega, pagamento,
   * oferta, canal e prazo — extraída das palavras que ELE escreveu (briefing,
   * contexto bruto, Brand Brain). É o que o piso determinístico usa para
   * conferir afirmação de peça.
   *
   * Opcional no tipo só para não obrigar quem monta snapshot em teste; o
   * servidor sempre preenche. Lista vazia dentro dela significa "o cliente não
   * contou", e "não contou" é motivo de reprovação, não permissão.
   */
  operacao?: VerdadeOperacional;
  // Presence flags
  brandBrainComplete: boolean;
  missingFields: string[];
}

// The brand-brain-derived fields we track for completeness. The DB BrandBrain
// model carries a subset; the rest are reserved for richer brand sources and are
// always reported as missing until a source provides them (never invented).
const TRACKED_BRAND_FIELDS = [
  "brandVoice",
  "positioning",
  "targetAudience",
  "preferredChannels",
  "visualStyle",
  "colors",
  "fonts",
  "thingsToAvoid",
  "productsToHighlight",
] as const;

function clean(v: string | null | undefined): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t.length > 0 ? t : undefined;
}

// ─── As palavras do cliente ──────────────────────────────────────────────────
//
// A verdade operacional não tem coluna no banco: não existe campo "horário de
// funcionamento" nem "raio de entrega". Ela está onde o cliente escreveu — o
// contexto bruto do briefing, o escopo que o SDR extraiu da conversa dele, e o
// que ele registrou de marca. Este bloco junta essas fontes e passa ao
// extrator; **nada é inferido**, só reconhecido no que ele mesmo disse.

/** Tira PII antes de a frase virar snapshot: e-mail e sequência longa de dígitos
 *  (telefone/documento). Hora ("18h") e valor ("R$ 2.500") sobrevivem — o corte
 *  é por comprimento de dígitos, não por qualquer número. */
function semPii(texto: string): string {
  return texto
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, " ")
    .replace(/(?:\+?\d[\d\s().-]{9,})/g, (m) => (m.replace(/\D/g, "").length >= 8 ? " " : m));
}

/** Achata o briefing (BriefingScope serializado) em texto, sem inventar rótulo:
 *  o valor entra como o cliente informou, precedido da chave, para que o
 *  extrator veja "budgetRange R$ 2000" e "deadline 30 dias". */
function achatar(valor: unknown, profundidade = 0): string {
  if (profundidade > 3 || valor == null) return "";
  if (typeof valor === "string" || typeof valor === "number") return String(valor);
  if (typeof valor === "boolean") return "";
  if (Array.isArray(valor)) return valor.map((v) => achatar(v, profundidade + 1)).filter(Boolean).join("\n");
  if (typeof valor === "object") {
    return Object.entries(valor as Record<string, unknown>)
      .filter(([k]) => !/email|phone|telefone|cpf|cnpj/i.test(k))
      .map(([k, v]) => {
        const t = achatar(v, profundidade + 1);
        return t ? `${k}: ${t}` : "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

/** Tudo que o cliente contou, em texto, pronto para o extrator. */
/**
 * O QUE O CLIENTE ESCREVEU NA CONVERSA DO PORTAL — e só ele.
 *
 * ── O buraco que isto fecha (cliente oculto, 26/08/2026) ───────────────────
 *
 * Medido em produção, no pedido cmt9exi95001f0xo74bhonn77 (CANTINA DO PORTO
 * TESTE). A cadeia, inteira:
 *
 *   1. o SDR nunca perguntou o horário de funcionamento (ele preencheu o campo
 *      `operacao` com a FRASE DE OBJETIVO do cliente, então a pergunta
 *      `operacao_basica` passou por respondida);
 *   2. o briefing chegou à produção sem horário;
 *   3. o especialista de Estratégia escreveu sobre horário;
 *   4. o piso de verdade REPROVOU, e com a frase certa: *"Horário de
 *      funcionamento. O cliente nunca informou isso."*;
 *   5. o projeto do cliente PAGANTE ficou `blocked`, com zero peças.
 *
 * E o passo que transforma isso de "portão funcionando" em buraco: **o cliente
 * ESCREVEU o horário.** Ele respondeu, na conversa do portal — que é o único
 * canal que ele tem —, *"abrimos de terça a domingo, das 18h às 23h30"*. O piso
 * continuou dizendo que ele nunca informou, porque `palavrasDoCliente` lia
 * `rawContext`, `briefingJson` e `sdrHandoffJson` e **nunca leu `PortalMessage`**.
 *
 * Esta casa já escreveu a lição no espelho: *"coluna gravada não é cliente
 * informado"*. A daqui é a outra metade: **cliente informado não é coluna
 * lida.**
 *
 * ── ⚠️ SÓ O QUE O CLIENTE DISSE, NUNCA O QUE A CASA DISSE ──────────────────
 *
 * `authorRole: "client"` não é filtro de conveniência, é a trava. As mensagens
 * da EQUIPE moram na mesma tabela, e incluí-las faria a agência ATESTAR AS
 * PRÓPRIAS INVENÇÕES: bastaria um agente escrever "vocês abrem às 9h" no portal
 * para o piso de verdade passar a aceitar aquele horário como fato do cliente.
 * Seria a porta dos fundos perfeita para o portão que este arquivo alimenta.
 *
 * Nunca lança: conversa ilegível vira ausência de fala, e ausência de fala
 * mantém o piso fail-closed — que é o comportamento de antes.
 */
async function falasDoClienteNoPortal(clientRequestId: string): Promise<string> {
  try {
    const linhas = await prisma.portalMessage.findMany({
      // O ANCORAMENTO É O PEDIDO. Não se lê por `clientId` aqui: o mesmo cliente
      // pode ter outros pedidos, e verdade de um pedido não atesta outro.
      where: { clientRequestId, authorRole: "client" },
      orderBy: { createdAt: "asc" },
      take: 100,
      select: { body: true },
    });
    return linhas.map((l) => l.body).filter(Boolean).join("\n");
  } catch {
    return "";
  }
}

function palavrasDoCliente(input: {
  rawContext: string;
  briefingJson?: string | null;
  sdrHandoffJson?: string | null;
  brand?: string[];
  website?: string | null;
  /** O que o CLIENTE escreveu na conversa do portal. Ver `falasDoClienteNoPortal`. */
  falasNoPortal?: string;
}): string {
  const partes: string[] = [input.rawContext];
  // Entra junto com o resto do que ele disse: o canal é outro, a fonte é a
  // mesma pessoa. O que separa fala do cliente de fala da casa é o filtro de
  // `authorRole`, aplicado na leitura.
  if (input.falasNoPortal) partes.push(input.falasNoPortal);
  for (const bruto of [input.briefingJson, input.sdrHandoffJson]) {
    if (!bruto) continue;
    try {
      partes.push(achatar(JSON.parse(bruto)));
    } catch {
      partes.push(bruto);
    }
  }
  for (const b of input.brand ?? []) if (b) partes.push(b);
  // O site cadastrado é canal atestado — o cliente o informou no cadastro.
  if (input.website) partes.push(`site ${input.website}`);
  return semPii(partes.filter(Boolean).join("\n"));
}

export async function buildClientSnapshot(
  clientRequestId: string,
): Promise<ClientKnowledgeSnapshot | null> {
  const request = await prisma.clientRequestDb.findUnique({
    where: { id: clientRequestId },
  });
  if (!request) return null;

  // BrandBrain lives on Client (1:1). A request may not be linked to a Client yet.
  const brandBrain = request.clientId
    ? await prisma.brandBrain.findUnique({ where: { clientId: request.clientId } })
    : null;

  // Map DB BrandBrain → snapshot fields. Fields the DB model does not carry stay
  // undefined (never invented). `tone` maps to brandVoice; colors are derived from
  // the two color fields; typography → fonts.
  const colorParts = [clean(brandBrain?.primaryColor), clean(brandBrain?.secondaryColor)].filter(Boolean);

  // ── `thingsToAvoid` DEIXOU DE SER SEMPRE VAZIO (06/08/2026) ────────────────
  // Estas quatro linhas diziam: "preferredChannels / visualStyle / thingsToAvoid
  // / productsToHighlight have no DB column on BrandBrain — left undefined".
  // Era verdade, e para `thingsToAvoid` era grave: a casa sabia o que o cliente
  // É e não sabia o que ele NÃO QUER. "Nunca use essa palavra", "não fale de
  // preço", "não cite concorrente" não sobreviviam ao pedido daquela vez.
  //
  // Agora a proibição TEM casa (`lib/agency/esteira/proibicoes.ts`) e é daqui
  // que ela chega ao especialista como aviso. A TRAVA é outra e roda na saída:
  // `VerdadeDoCliente.proibicoes` no piso determinístico. Prompt não protege.
  //
  // `preferredChannels` / `visualStyle` / `productsToHighlight` continuam sem
  // coluna — seguem `undefined` e reportados em `missingFields`, nunca inventados.
  const proibicoes = await lerProibicoes(request.clientId);

  const mapped: Partial<Record<(typeof TRACKED_BRAND_FIELDS)[number], string>> = {
    brandVoice: clean(brandBrain?.tone),
    positioning: clean(brandBrain?.positioning),
    targetAudience: clean(brandBrain?.targetAudience),
    fonts: clean(brandBrain?.typography),
    colors: colorParts.length > 0 ? colorParts.join(", ") : undefined,
    // Só as proibições EFETIVAMENTE LIDAS entram. `lidas: false` (falha de
    // leitura) deixa o campo vazio e o nome cai em `missingFields` — declarar
    // "nenhuma restrição" sem ter conseguido ler seria a mentira mais cara aqui.
    thingsToAvoid:
      proibicoes.lidas && proibicoes.itens.length > 0
        ? proibicoes.itens.map((p) => p.frase).join(" · ").slice(0, 1200)
        : undefined,
  };

  const missingFields = TRACKED_BRAND_FIELDS.filter((f) => !mapped[f]);

  let services: string[] = [];
  let objectives: string[] = [];
  try {
    services = JSON.parse(request.services) as string[];
  } catch {
    services = [];
  }
  try {
    objectives = JSON.parse(request.objectives) as string[];
  } catch {
    objectives = [];
  }

  const operacao = extrairVerdadeOperacional(
    palavrasDoCliente({
      rawContext: request.rawContext,
      briefingJson: request.briefingJson,
      sdrHandoffJson: request.sdrHandoffJson,
      falasNoPortal: await falasDoClienteNoPortal(request.id),
      brand: [
        clean(brandBrain?.positioning) ?? "",
        clean(brandBrain?.targetAudience) ?? "",
        clean(brandBrain?.tagline) ?? "",
      ],
    }),
    request.businessName,
  );

  return {
    clientRequestId: request.id,
    businessName: request.businessName,
    segment: request.segment,
    services: Array.isArray(services) ? services : [],
    objectives: Array.isArray(objectives) ? objectives : [],
    rawContext: request.rawContext,
    brandVoice: mapped.brandVoice,
    positioning: mapped.positioning,
    targetAudience: mapped.targetAudience,
    preferredChannels: mapped.preferredChannels,
    visualStyle: mapped.visualStyle,
    colors: mapped.colors,
    fonts: mapped.fonts,
    thingsToAvoid: mapped.thingsToAvoid,
    productsToHighlight: mapped.productsToHighlight,
    operacao,
    brandBrainComplete: missingFields.length === 0,
    missingFields,
  };
}

// ─── A VERDADE DO CLIENTE, LIDA PELO SERVIDOR ────────────────────────────────
//
// O buraco que isto fecha: até aqui, quem chamava o piso determinístico montava
// a `VerdadeDoCliente` à mão, com o que tinha em mãos naquele ponto do código.
// Ancoragem de verdade que depende de quem chama não é ancoragem — quem entrega
// pode estar errado, incompleto ou (num fluxo vindo do navegador) adulterado.
// Aqui o SERVIDOR lê a verdade do banco por conta própria, uma vez, e é essa a
// régua contra a qual a peça é conferida.
//
// Campo que o cliente não contou fica VAZIO. Vazio é vazio: o piso trata
// ausência como motivo de reprovação, nunca como permissão.

/**
 * Monta a verdade do cliente a partir do banco, para um `clientRequestId`.
 * Determinístico, sem IA. Devolve `null` quando a solicitação não existe —
 * quem chama deve tratar "não sei quem é o cliente" como bloqueio, jamais
 * seguir com uma verdade vazia inventada na hora.
 */
export async function buildVerdadeDoCliente(clientRequestId: string): Promise<VerdadeDoCliente | null> {
  // NUNCA LANÇA — e isto não é conveniência, é desenho. Esta função é chamada
  // no caminho da produção, da refação e da VIRADA DO MÊS. Uma exceção aqui
  // (banco fora do ar, modelo ausente) derrubaria o fechamento inteiro do
  // ciclo por causa de uma leitura auxiliar. Falha vira `null`, `null` vira
  // "não sei nada sobre a operação dele", e o piso é fail-closed a partir daí:
  // a peça que AFIRMAR horário, área ou canal é barrada; a que não afirmar nada
  // segue. Perde-se a checagem, nunca a operação — e nunca em silêncio para
  // quem lê o código, porque a direção do erro está escrita aqui.
  //
  // A promessa era MENTIRA até 04/08/2026: só a rejeição da query estava
  // coberta. Com o delegate ausente (`prisma.clientRequestDb` undefined — client
  // desatualizado, mock incompleto, schema fora de sincronia) o `TypeError`
  // estourava ANTES do `.catch`, no acesso à propriedade. Escolha feita:
  // **a promessa vira verdade**, e não o contrário. Quem chama já trata `null`
  // como "não sei quem é o cliente" e o piso já é duro nesse estado; degradar a
  // checagem é caro, derrubar a virada do mês de todos os clientes por um
  // delegate ausente é pior. Comentário que promete o que o código não cumpre é
  // a pior das duas opções — quem lê para de conferir.
  try {
    return await lerVerdadeDoCliente(clientRequestId);
  } catch (e) {
    console.warn(`[client-snapshot] não consegui ler a verdade de ${clientRequestId}: ${String(e)}`);
    return null;
  }
}

async function lerVerdadeDoCliente(clientRequestId: string): Promise<VerdadeDoCliente | null> {
  const request = await prisma.clientRequestDb
    .findUnique({ where: { id: clientRequestId } })
    .catch((e: unknown) => {
      console.warn(`[client-snapshot] não consegui ler a verdade de ${clientRequestId}: ${String(e)}`);
      return null;
    });
  if (!request) return null;

  const client = request.clientId
    ? await prisma.client.findUnique({ where: { id: request.clientId } }).catch(() => null)
    : null;
  const brandBrain = request.clientId
    ? await prisma.brandBrain.findUnique({ where: { clientId: request.clientId } }).catch(() => null)
    : null;

  let services: string[] = [];
  try {
    const parsed = JSON.parse(request.services) as unknown;
    services = Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    services = [];
  }

  const briefing = (() => {
    if (!request.briefingJson) return {} as Record<string, unknown>;
    try {
      return (JSON.parse(request.briefingJson) ?? {}) as Record<string, unknown>;
    } catch {
      return {} as Record<string, unknown>;
    }
  })();

  const texto = palavrasDoCliente({
    rawContext: request.rawContext,
    briefingJson: request.briefingJson,
    sdrHandoffJson: request.sdrHandoffJson,
    falasNoPortal: await falasDoClienteNoPortal(request.id),
    brand: [clean(brandBrain?.positioning) ?? "", clean(brandBrain?.targetAudience) ?? "", clean(brandBrain?.tagline) ?? ""],
    website: clean(client?.website),
  });

  const operacao = extrairVerdadeOperacional(texto, request.businessName);
  // O site do cadastro é canal e endereço atestados — veio do cliente, não de
  // uma dedução do texto.
  const site = clean(client?.website);
  if (site) {
    const dominio = site.replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/.*$/, "").toLowerCase();
    if (dominio && !operacao.handles.includes(dominio)) operacao.handles.push(dominio);
    if (!operacao.canais.includes("site")) operacao.canais.push("site");
  }

  return {
    businessName: request.businessName || client?.name || "",
    telefones: [clean(client?.phone), clean(briefing.prospectPhone as string | undefined), clean(briefing.phone as string | undefined)]
      .filter((v): v is string => !!v),
    emails: [clean(client?.email), clean(briefing.prospectEmail as string | undefined), clean(briefing.email as string | undefined)]
      .filter((v): v is string => !!v),
    servicos: services,
    ...(() => {
      const { precos, verbas } = separarValoresInformados(briefing, texto);
      return { valores: precos, verbas };
    })(),
    operacao,
    // A METADE NEGATIVA. Lida pelo SERVIDOR, como todo o resto desta função —
    // e fail-closed: `lidas: false` faz o piso reprovar a peça em vez de
    // liberá-la por falta de checagem.
    proibicoes: await lerProibicoes(request.clientId),
  };
}

/**
 * Os valores que o CLIENTE informou. Faixa ("R$ 1.500 a R$ 3.000") vira os dois
 * extremos: ele informou os dois. O que não é número não vira número.
 *
 * Duas fontes, e a segunda faltava: as CHAVES DE VERBA do briefing **e os preços
 * que ele escreveu no texto**. Sem a segunda, `valoresInformados` só conhecia
 * quanto o cliente paga à agência — e qualquer preço do negócio DELE numa peça
 * ("Escova a partir de R$ 60,00", que estava escrito no briefing dele) era
 * barrado como `valor_inventado`. Peça de comércio sem preço quase não existe;
 * na prática isso era uma mordaça no serviço inteiro.
 *
 * O que NÃO mudou: número que não está no texto do cliente continua sendo
 * invenção. Aqui só se reconhece o que ele mesmo escreveu.
 */
/** A classificação verba-vs-preço mora no piso (`separarValoresInformados`) —
 *  é regra de ancoragem, não de banco, e lá ela é testável sem Prisma. */

/** A verdade operacional que o servidor conhece, para quem só precisa dela.
 *  Nunca devolve `null` disfarçado de vazio: cliente inexistente é `null`. */
export async function buildVerdadeOperacional(clientRequestId: string): Promise<VerdadeOperacional | null> {
  const verdade = await buildVerdadeDoCliente(clientRequestId);
  return verdade ? verdade.operacao ?? operacaoVazia() : null;
}

// Builds the brandBrain Record used by AIRunContext from a snapshot — only
// includes fields that are actually present (no empty/placeholder keys).
export function snapshotBrandBrain(snapshot: ClientKnowledgeSnapshot): Record<string, string> {
  const out: Record<string, string> = {};
  const pairs: Array<[string, string | undefined]> = [
    ["brandVoice", snapshot.brandVoice],
    ["positioning", snapshot.positioning],
    ["targetAudience", snapshot.targetAudience],
    ["preferredChannels", snapshot.preferredChannels],
    ["visualStyle", snapshot.visualStyle],
    ["colors", snapshot.colors],
    ["fonts", snapshot.fonts],
    ["thingsToAvoid", snapshot.thingsToAvoid],
    ["productsToHighlight", snapshot.productsToHighlight],
  ];
  for (const [k, v] of pairs) {
    if (v) out[k] = v;
  }
  return out;
}

// pacote-da-marca.ts — O QUE SE PRODUZ PARA ESTA MARCA. SERVER-ONLY.
//
// ─── A DECISÃO DO CEO (27/09/2026) ───────────────────────────────────────────
//
// Cada marca tem um PACOTE: quantos posts por dia e por semana, em quais
// formatos, em quais dias e horários, e os pilares de conteúdo (com peso). É o
// contrato de produção da marca — o que o calendário editorial (W2) e a rotina
// semanal leem para saber QUANTO e O QUÊ produzir, sem inventar um número.
//
// ─── POR QUE ISTO VIVE EM JSON VALIDADO NA APLICAÇÃO, NÃO EM COLUNAS ─────────
//
// O pacote tem forma — listas de tamanho variável, pesos, horários — que uma
// coluna por campo não representa sem uma dúzia de tabelas satélite. A casa já
// resolveu esse mesmo problema (BrandBrain: `voicePairsJson`, `lexiconJson`) do
// mesmo jeito: JSON na coluna, `zod` na leitura. A trava não é a coluna — é
// NUNCA ler `Client.pacoteJson` cru. Todo leitor passa por `lerPacote`.
//
// ─── AUSÊNCIA NUNCA VIRA DEFAULT ─────────────────────────────────────────────
//
// `pacoteJson` nulo (marca nova, ou marca que nunca teve o pacote definido) não
// vira "3 posts por semana, formato feed" por adivinhação — vira o motivo
// "preciso do pacote da marca", que quem chama escala em vez de inventar. É a
// mesma regra da casa desde sempre: ausência de informação não é informação.
//
// ─── STORIES, E MARCA SÓ DE STORIES (CEO, 27/09/2026) ────────────────────────
//
// `stories` é um bloco NOVO e OPCIONAL — pacote gravado antes desta data não
// tem o campo e continua válido exatamente como validava ontem. Ele descreve o
// PACOTE DE STORIES da marca: quantos por dia (faixa, não número fixo — o
// gerador sorteia dentro dela de forma determinística, nunca com
// `Math.random`), a que horas começa, o intervalo mínimo entre um e outro, o
// mínimo de "combo" por dia e a MISTURA de tipos que preenche o resto
// ("combo" | "reciclado" | "repost" — ver `calendario-editorial.ts` para o que
// cada tipo produz).
//
// Uma marca pode ser SÓ DE STORIES — o caso do Sushi Cazza (27/09/2026): sem
// feed, sem carrossel, sem Reels, só a régua de stories. Para isso o schema
// PRECISA aceitar `postsPorDia`/`postsPorSemana`/`horarios` zerados/vazios
// QUANDO `stories` existe E `formatos` é exatamente `["stories"]` — nos outros
// casos (com ou sem `stories`, mas com outro formato no meio) as exigências de
// sempre continuam valendo: uma marca com feed não pode declarar zero posts de
// feed. É por isso que os campos abaixo perderam o `.min(1)` embutido e a
// exigência virou uma CONFERÊNCIA CONDICIONAL (`superRefine`), não um limite
// solto para todo mundo.
//
// ─── CARDÁPIO, FONTES DE PROVA, CARROSSEL, SÉRIES, COLABORADORES (W12a) ──────
//
// Bloco novo e ADITIVO (27/09/2026) — todo campo abaixo é OPCIONAL; um pacote
// gravado antes desta data não tem nenhum deles e continua validando
// exatamente como validava ontem. NENHUM destes campos entra na conferência
// de coerência do `superRefine` — eles descrevem CONTEÚDO (o que dizer, com
// que prova, em que sequência), não CADÊNCIA (quanto e quando), que continua
// sendo só `postsPorDia`/`postsPorSemana`/`dias`/`horarios`/`stories`.
//
//   • `cardapio`: os combos que um story do tipo "combo" pode citar — preço já
//     por extenso ("R$ 59,90"), nunca calculado aqui. Marca sem cardápio
//     definido (Foocci, Sushi Cazza antes do CEO cadastrar) usa
//     `comboParaStory` (`cardapio.ts`) para escalar em vez de inventar preço.
//   • `fontesDeProva`: a biblioteca de afirmações com fonte desta marca —
//     `conferirNumeroComFonte` (`prova-com-fonte.ts`) confere todo texto
//     gerado contra ela antes de publicar.
//   • `carrossel`: a régua do carrossel "de sempre" da marca — quantos cards,
//     em que sequência de intenção (dor → transformação → prova → cta, etc.),
//     e se usa o horário do DNA da marca ou o `horarioPadrao` declarado aqui.
//   • `series`: séries editoriais NOMEADAS com dias e regras próprias (ex.:
//     "Radar Dioli Tech" toda segunda, 8+ cards, exige fonte) — coexistem com
//     o carrossel "de sempre" da marca, não o substituem.
//   • `colaboradores`: contas que podem ser citadas como colaboração/marca
//     terceira nas peças — `ativo: false` é o padrão até o parecer do `meta`
//     (1C) liberar a função. Máx. 3 contas — lista pequena, revisada à mão.
//
// `stories.derivados` (também aditivo): tipos de story que NASCEM de outra
// peça já existente, não de um slot próprio da agenda — "capa_do_post_do_dia"
// (recorte do post do feed do dia) e "reel_do_acervo" (recorte de um Reels já
// publicado). `stories.mistura` ganha "terceiro_autorizado" (conteúdo de
// terceiro com autorização, ex.: cliente/parceiro que autorizou o repost) —
// "repost" era o nome antigo do mesmo conceito e CONTINUA sendo aceito na
// ENTRADA (pacote gravado antes desta data não quebra), mas é sempre LIDO
// como "terceiro_autorizado": o tipo de saída de `mistura` nunca mais contém
// "repost". `stories.porDia` FIXO (em vez de faixa) já era possível antes
// deste bloco — basta declarar `porDiaMin === porDiaMax`; o `refine` abaixo já
// aceita a igualdade.

import { z } from "zod";

const HORARIO_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

/** "repost" é o nome ANTIGO de "terceiro_autorizado" — aceito na entrada (um
 *  pacote gravado antes de 27/09/2026 não quebra), mas sempre TRANSFORMADO:
 *  a saída de `mistura` nunca contém "repost", só "terceiro_autorizado". */
const ItemDaMisturaSchema = z.union([
  z.literal("combo"),
  z.literal("reciclado"),
  z.literal("terceiro_autorizado"),
  z.literal("repost").transform(() => "terceiro_autorizado" as const),
]);

/** Tipos de story que nascem de OUTRA peça já existente, não de um slot
 *  próprio da agenda de stories — ver o cabeçalho do arquivo. */
const DerivadoDeStorySchema = z.enum(["capa_do_post_do_dia", "reel_do_acervo"]);

const StoriesDoPacoteSchema = z
  .object({
    /** Quantidade MÍNIMA de stories por dia — o piso da faixa. Faixa FIXA:
     *  `porDiaMin === porDiaMax` (ex.: Dioli Digital, 1 story por dia). */
    porDiaMin: z.number().int().min(1).max(20),
    /** Quantidade MÁXIMA de stories por dia — o teto da faixa. */
    porDiaMax: z.number().int().min(1).max(20),
    /** A partir de que horário (Brasília) o primeiro story do dia pode sair. */
    aPartirDe: z.string().regex(HORARIO_REGEX),
    /** Minutos entre um story e o próximo, no mínimo. Padrão 30 — CAMPO QUE
     *  W9 LÊ: `pacote.stories.intervaloMinimoMin`. Não renomeie. */
    intervaloMinimoMin: z.number().int().min(1).default(30),
    /** Quantos stories de "combo" o dia PRECISA ter, no mínimo. */
    combosMinPorDia: z.number().int().min(0),
    /** O que preenche o resto da cota do dia, ciclicamente. */
    mistura: z.array(ItemDaMisturaSchema).min(1),
    /** OPCIONAL, aditivo (W12a): tipos de story derivados de outra peça já
     *  existente — ver o cabeçalho do arquivo. */
    derivados: z.array(DerivadoDeStorySchema).optional(),
    /**
     * OS DEGRAUS INTERMEDIÁRIOS DA RAMPA DE AQUECIMENTO (CJ-J1, 28/09/2026).
     *
     * Opcional, aditivo — pacote sem este campo continua com o comportamento
     * de sempre: `TETO_DA_RAMPA` (3) por 7 dias, depois `porDiaMax`
     * (`lib/agency/esteira/publicacao.ts`, `tetoDeStoriesDoDia`). Uma marca
     * que precise de MAIS de um degrau (o caso do City Jobs, parecer `meta`
     * M4: 3→6→10→15) declara aqui, em ORDEM CRESCENTE de `ateDias` — dias
     * corridos desde o PRIMEIRO story publicado do cliente. O último degrau
     * declarado cobre até o seu `ateDias`; depois dele, o teto volta a ser
     * `porDiaMax` (o "22+" do parecer não é um degrau à parte, é o fallback
     * natural quando a lista acaba).
     */
    rampaDegraus: z
      .array(z.object({ ateDias: z.number().int().positive(), teto: z.number().int().positive() }))
      .optional(),
  })
  .refine((s) => s.porDiaMax >= s.porDiaMin, {
    message: "porDiaMax não pode ser menor que porDiaMin",
    path: ["porDiaMax"],
  });

export type StoriesDoPacote = z.infer<typeof StoriesDoPacoteSchema>;

/** A sequência de intenção de um card de carrossel — usada tanto no
 *  carrossel "de sempre" da marca (`carrossel.sequencia`) quanto numa
 *  série nomeada (`series[].sequencia`). Lista FECHADA — quem quiser um
 *  novo tipo de card muda aqui, não inventa string solta no pacote. */
export const SEQUENCIA_DO_CARROSSEL = [
  "dor",
  "transformacao",
  "prova",
  "beneficio",
  "importancia_do_servico",
  "cta",
] as const;
const SequenciaDoCardSchema = z.enum(SEQUENCIA_DO_CARROSSEL);

/** O CARDÁPIO da marca — os combos que um story/card "combo" pode citar.
 *  `preco` é texto já pronto para exibir ("R$ 59,90"), NUNCA calculado por
 *  esta casa (ver `cardapio.ts`, `comboParaStory`). */
const ComboDoCardapioSchema = z.object({
  nome: z.string().min(1),
  // Vazio = combo SEM PREÇO (CEO, 01/10/2026): sai sem número, nunca inventado.
  preco: z.string().default(""),
  descricao: z.string().optional(),
});
const CardapioDoPacoteSchema = z.object({
  /** Pode ser `[]` — marca sem cardápio cadastrado ainda (o CEO cadastra
   *  depois). `comboParaStory` escala nesse caso, nunca inventa preço. */
  combos: z.array(ComboDoCardapioSchema),
});

/** Uma afirmação com FONTE — a biblioteca que `conferirNumeroComFonte`
 *  (`prova-com-fonte.ts`) confere contra todo número de prova do texto. */
const FonteDeProvaSchema = z.object({
  afirmacao: z.string().min(1),
  /** URL ou documento — texto livre de propósito (nem toda fonte é um link). */
  fonte: z.string().min(1),
  /** "AAAA-MM-DD", opcional — quando a fonte tem data de referência. */
  data: z.string().optional(),
});

/** O carrossel "de sempre" da marca — a régua-padrão de cards por dia,
 *  sequência de intenção e CTA. Independente das `series` nomeadas abaixo. */
const CarrosselDoPacoteSchema = z
  .object({
    cardsMin: z.number().int().min(1),
    cardsMax: z.number().int().min(1),
    sequencia: z.array(SequenciaDoCardSchema).min(1),
    cta: z.string().optional(),
    horarioPadrao: z.string().regex(HORARIO_REGEX).optional(),
    /** `true`: o horário vem do DNA da marca (W1B), não de `horarioPadrao`. */
    usarHorarioDoDna: z.boolean().optional(),
    porDia: z.number().int().min(1).optional(),
  })
  .refine((c) => c.cardsMax >= c.cardsMin, {
    message: "cardsMax não pode ser menor que cardsMin",
    path: ["cardsMax"],
  });

/** Uma SÉRIE editorial nomeada — dias e regras próprias, coexistindo com o
 *  carrossel "de sempre" (ex.: "Radar Dioli Tech", toda segunda). Hoje só
 *  existe o formato "carrossel" — lista fechada de propósito. */
const SerieDoPacoteSchema = z
  .object({
    id: z.string().min(1),
    nome: z.string().min(1),
    /** 0=domingo … 6=sábado. */
    dias: z.array(z.number().int().min(0).max(6)).min(1),
    formato: z.literal("carrossel"),
    cardsMin: z.number().int().min(1),
    cardsMax: z.number().int().min(1).optional(),
    /** `true`: todo card de prova desta série PRECISA de fonte cadastrada
     *  (ver `conferirNumeroComFonte`) — ex.: a série "Radar". */
    exigeFonte: z.boolean().optional(),
    /** Nome livre do layout de arte desta série (ex.: "radar", "servico"). */
    layout: z.string().optional(),
    sequencia: z.array(SequenciaDoCardSchema).optional(),
    horario: z.string().regex(HORARIO_REGEX).optional(),
  })
  .refine((s) => s.cardsMax === undefined || s.cardsMax >= s.cardsMin, {
    message: "cardsMax não pode ser menor que cardsMin",
    path: ["cardsMax"],
  });

/** Contas de terceiro que podem ser citadas como colaboração/parceria nas
 *  peças. `ativo: false` é o padrão até o parecer do `meta` (1C) liberar —
 *  ver o cabeçalho do arquivo. Máx. 3: lista pequena, revisada à mão. */
const ColaboradoresDoPacoteSchema = z.object({
  ativo: z.boolean(),
  contas: z.array(z.string().min(1)).max(3),
});

export const PacoteDaMarcaSchema = z
  .object({
    /** `min(0)`: ver o cabeçalho — só é 0 legítimo quando a marca é SÓ DE
     *  STORIES, e isso é conferido abaixo, não aqui. */
    postsPorDia: z.number().int().min(0).max(5),
    postsPorSemana: z.number().int().min(0).max(21),
    formatos: z.array(z.enum(["feed_imagem", "carrossel", "reels", "stories"])).min(1),
    /** 0=domingo … 6=sábado. */
    dias: z.array(z.number().int().min(0).max(6)).min(1),
    /** Horário de Brasília, "HH:MM". `.default([])`: ver o cabeçalho — vazio
     *  só é legítimo quando a marca é SÓ DE STORIES. */
    horarios: z.array(z.string().regex(HORARIO_REGEX)).default([]),
    pilares: z.array(z.object({ nome: z.string().min(1), peso: z.number().positive() })).min(1),
    /** O pacote de STORIES da marca — opcional, aditivo. Ver o cabeçalho. */
    stories: StoriesDoPacoteSchema.optional(),
    /** OPCIONAIS, aditivos (W12a) — ver o cabeçalho do arquivo para o que
     *  cada um descreve. Nenhum entra na conferência de coerência abaixo. */
    cardapio: CardapioDoPacoteSchema.optional(),
    fontesDeProva: z.array(FonteDeProvaSchema).optional(),
    carrossel: CarrosselDoPacoteSchema.optional(),
    series: z.array(SerieDoPacoteSchema).optional(),
    colaboradores: ColaboradoresDoPacoteSchema.optional(),
    /** Dias mínimos antes de a MESMA arte/foto voltar a ser publicada
     *  (CEO, 03/10/2026). Padrão 14 — ajustável por marca. */
    intervaloDeRepeticaoDias: z.number().int().min(1).max(365).optional(),
    /**
     * A REGRA DA MARCA "paga + sem_risco → aprovação automática" (CJ-J1,
     * 28/09/2026), ligada por MARCA — hoje só o City Jobs a usa. `false`/
     * ausente é o padrão: sem esta flag, NENHUM post entra sozinho por este
     * caminho, mesmo que o post venha marcado "paga"/"sem_risco" pela fonte
     * externa. É TRAVA, não aviso: `carimboValeNoModo`
     * (`lib/agency/esteira/modo-de-aprovacao.ts`) só aceita o carimbo
     * `regra-da-marca:cityjobs_paga_sem_risco@<data>` quando esta flag está
     * `true` E o cliente é o configurado em `CITYJOBS_CLIENT_ID`.
     */
    cityJobsPagaSemRiscoAutoAprovacao: z.boolean().optional(),
  })
  .superRefine((p, ctx) => {
    const soDeStories = !!p.stories && p.formatos.length === 1 && p.formatos[0] === "stories";

    if (soDeStories) return;

    // Fora do caso "só de stories", as exigências de sempre continuam de pé —
    // é o que faz um pacote antigo (sem `stories`) e um pacote misto (feed +
    // stories) recusarem exatamente como recusavam antes deste bloco.
    if (p.postsPorDia < 1) {
      ctx.addIssue({
        code: "custom",
        path: ["postsPorDia"],
        message: "postsPorDia precisa ser pelo menos 1 — só marca SÓ DE STORIES pode zerar o feed.",
      });
    }
    if (p.postsPorSemana < 1) {
      ctx.addIssue({
        code: "custom",
        path: ["postsPorSemana"],
        message: "postsPorSemana precisa ser pelo menos 1 — só marca SÓ DE STORIES pode zerar o feed.",
      });
    }
    if (p.horarios.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["horarios"],
        message: "horarios precisa ter pelo menos um horário — só marca SÓ DE STORIES pode ficar sem.",
      });
    }
    if (p.postsPorSemana > p.postsPorDia * p.dias.length) {
      ctx.addIssue({
        code: "custom",
        path: ["postsPorSemana"],
        message:
          "postsPorSemana não pode ser maior que postsPorDia × número de dias declarados — a marca " +
          "não produz mais posts na semana do que os próprios dias/ritmo permitem.",
      });
    }
  });

export type PacoteDaMarca = z.infer<typeof PacoteDaMarcaSchema>;

export type PacoteLido =
  | { ok: true; pacote: PacoteDaMarca }
  | { ok: false; motivo: string };

/**
 * LÊ O PACOTE. Nulo ou JSON quebrado ou fora do formato → `ok: false` com
 * motivo começando em "preciso do pacote da marca" — a frase que o resto da
 * esteira reconhece como "escale, não invente" (guardrail 1 da casa).
 */
export function lerPacote(pacoteJson: string | null | undefined): PacoteLido {
  if (!pacoteJson || !pacoteJson.trim()) {
    return {
      ok: false,
      motivo: "preciso do pacote da marca — esta marca ainda não tem pacote definido (postsPorDia, formatos, dias, horários, pilares).",
    };
  }

  let bruto: unknown;
  try {
    bruto = JSON.parse(pacoteJson);
  } catch {
    return {
      ok: false,
      motivo: "preciso do pacote da marca — o pacote gravado não é JSON válido.",
    };
  }

  const parsed = PacoteDaMarcaSchema.safeParse(bruto);
  if (!parsed.success) {
    const primeiro = parsed.error.issues[0];
    const onde = primeiro?.path?.length ? ` (${primeiro.path.join(".")})` : "";
    return {
      ok: false,
      motivo: `preciso do pacote da marca — o pacote gravado é inválido${onde}: ${primeiro?.message ?? "formato incorreto"}.`,
    };
  }

  return { ok: true, pacote: parsed.data };
}

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

import { z } from "zod";

const HORARIO_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

const StoriesDoPacoteSchema = z
  .object({
    /** Quantidade MÍNIMA de stories por dia — o piso da faixa. */
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
    mistura: z.array(z.enum(["combo", "reciclado", "repost"])).min(1),
  })
  .refine((s) => s.porDiaMax >= s.porDiaMin, {
    message: "porDiaMax não pode ser menor que porDiaMin",
    path: ["porDiaMax"],
  });

export type StoriesDoPacote = z.infer<typeof StoriesDoPacoteSchema>;

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

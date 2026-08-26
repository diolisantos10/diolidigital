// calendario-do-cliente.ts — A PEÇA NÃO NASCE COM UM DIA QUE NÃO EXISTE.
//
// ═══════════════════════════════════════════════════════════════════════════
// O DEFEITO (rodada paga, 27/08/2026)
// ═══════════════════════════════════════════════════════════════════════════
//
// A refação devolveu a legenda "**Sexta** é dia de estar aqui" para uma peça
// de um cliente cujo calendário inteiro é terça-a-quinta ("Terça tem prato
// especial", "Terça é dia de cacio e pepe", "Terça a quinta é quando a gente
// mais convida os amigos"). Publicada numa quarta, a peça convida o público
// para um dia que não é o dia dela.
//
// Não é erro de gosto: é a peça CONTRADIZENDO a própria data. Quem lê o perfil
// do cliente não tem como saber qual das duas informações vale.
//
// ═══════════════════════════════════════════════════════════════════════════
// AS DUAS PERGUNTAS, E A ORDEM DELAS
// ═══════════════════════════════════════════════════════════════════════════
//
//   1. **A peça tem hora marcada?** Então o dia citado no texto tem de ser o
//      dia dela. É a pergunta forte: a data está no banco, não é palpite.
//   2. **Não tem hora marcada, mas o calendário do cliente é conhecido?**
//      Então o dia citado tem de estar entre os dias em que ele publica. É a
//      pergunta fraca, e ela só existe quando há calendário para comparar.
//
// Sem hora marcada e sem calendário, a resposta é `nao_medido` — nunca
// "aprovado". *Ausência de informação não é informação.*
//
// ⚠️ PURO. Recebe o texto, a data e os dias do calendário; devolve o veredito.

/** 0 = domingo, como `Date.getDay()`. */
export type DiaDaSemana = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const NOME_DO_DIA: Record<DiaDaSemana, string> = {
  0: "domingo", 1: "segunda-feira", 2: "terça-feira", 3: "quarta-feira",
  4: "quinta-feira", 5: "sexta-feira", 6: "sábado",
};

/**
 * Os dias, como o cliente os escreve. As formas com e sem acento entram porque
 * o texto vem de modelo de IA e de gente digitando no portal — e um "terca"
 * sem acento que não casasse passaria justamente o caso que se quer pegar.
 */
const PADRAO_DO_DIA: Array<{ dia: DiaDaSemana; re: RegExp }> = [
  { dia: 0, re: /\bdomingos?\b/i },
  { dia: 1, re: /\bsegundas?(?:-feiras?)?\b/i },
  { dia: 2, re: /\bter[çc]as?(?:-feiras?)?\b/i },
  { dia: 3, re: /\bquartas?(?:-feiras?)?\b/i },
  { dia: 4, re: /\bquintas?(?:-feiras?)?\b/i },
  { dia: 5, re: /\bsextas?(?:-feiras?)?\b/i },
  { dia: 6, re: /\bs[áa]bados?\b/i },
];

/** Só o nome do dia, sem a âncora de palavra — para achar as pontas da faixa. */
const NOME_CRU = "(domingos?|segundas?(?:-feiras?)?|ter[çc]as?(?:-feiras?)?|quartas?(?:-feiras?)?|quintas?(?:-feiras?)?|sextas?(?:-feiras?)?|s[áa]bados?)";

/** "de terça A QUINTA", "terça a quinta", "de segunda à sexta". */
const FAIXA = new RegExp(`\\b(?:de\\s+)?${NOME_CRU}\\s+(?:a|at[ée]|à)\\s+${NOME_CRU}\\b`, "gi");

function diaDaPalavra(palavra: string): DiaDaSemana | null {
  return PADRAO_DO_DIA.find((p) => p.re.test(palavra))?.dia ?? null;
}

/**
 * Os dias da semana citados no texto.
 *
 * ⚠️ FAIXA É FAIXA. "De terça a quinta" cita TRÊS dias, e não dois: uma peça
 * de quarta com esse texto está certíssima, e uma régua que lesse só as pontas
 * inventaria um defeito onde não há. Foi o próprio calendário do cliente
 * medido em produção que trouxe a frase ("Terça a quinta é quando a gente mais
 * convida os amigos").
 */
export function diasCitados(texto: string | null | undefined): DiaDaSemana[] {
  const t = (texto ?? "").trim();
  if (!t) return [];
  const dias = new Set<DiaDaSemana>(PADRAO_DO_DIA.filter((p) => p.re.test(t)).map((p) => p.dia));
  for (const m of t.matchAll(FAIXA)) {
    const de = diaDaPalavra(m[1] ?? "");
    const ate = diaDaPalavra(m[2] ?? "");
    if (de === null || ate === null) continue;
    // A semana dá a volta: "de sexta a domingo" é 5, 6, 0.
    for (let d = de; ; d = ((d + 1) % 7) as DiaDaSemana) {
      dias.add(d as DiaDaSemana);
      if (d === ate) break;
    }
  }
  return [...dias].sort((a, b) => a - b);
}

export type VereditoDaData =
  | "ok"
  /** O texto cita um dia e a peça está marcada para outro. */
  | "briga_com_a_data_da_peca"
  /** O texto cita um dia em que este cliente não publica. */
  | "fora_do_calendario"
  /** Nada a medir (o texto não cita dia) ou nada com que comparar. */
  | "nao_medido";

export interface ConferenciaDaData {
  veredito: VereditoDaData;
  /** `true` quando a peça pode seguir. `nao_medido` segue — declarado. */
  passa: boolean;
  /** Motivo, dono e próxima ação. Vazio quando não há o que dizer. */
  motivo: string;
}

/**
 * O dia citado no texto desta peça faz sentido?
 *
 * `diasDoCalendario` são os dias em que ESTE cliente publica, lidos das outras
 * peças dele. Lista vazia = calendário desconhecido, e desconhecido não acusa.
 *
 * ⚠️ Um texto que cita VÁRIOS dias ("de terça a quinta") só é acusado quando
 * NENHUM deles bate — é a leitura honesta de uma faixa de dias, e acusar
 * "terça a quinta" numa peça de quarta seria a régua criando um defeito.
 */
export function conferirDataDaPeca(entrada: {
  texto: string | null | undefined;
  agendadaPara?: Date | null;
  diasDoCalendario?: readonly DiaDaSemana[];
}): ConferenciaDaData {
  const citados = diasCitados(entrada.texto);
  if (citados.length === 0) return { veredito: "nao_medido", passa: true, motivo: "" };

  const quando = entrada.agendadaPara;
  if (quando instanceof Date && !Number.isNaN(quando.getTime())) {
    const dia = quando.getDay() as DiaDaSemana;
    if (citados.includes(dia)) return { veredito: "ok", passa: true, motivo: "" };
    return {
      veredito: "briga_com_a_data_da_peca", passa: false,
      motivo:
        `o texto desta peça fala em ${citados.map((d) => NOME_DO_DIA[d]).join(" / ")} e ela está marcada para ` +
        `${NOME_DO_DIA[dia]} (${quando.toISOString().slice(0, 10)}). Publicada assim, ela convida o público do cliente ` +
        "para um dia que não é o dela. Dono: a agência (produção). " +
        "Próxima ação: acertar o dia no texto OU mudar a data da peça — as duas coisas têm de dizer a mesma coisa.",
    };
  }

  const calendario = entrada.diasDoCalendario ?? [];
  if (calendario.length === 0) return { veredito: "nao_medido", passa: true, motivo: "" };
  if (citados.some((d) => calendario.includes(d))) return { veredito: "ok", passa: true, motivo: "" };

  return {
    veredito: "fora_do_calendario", passa: false,
    motivo:
      `o texto desta peça fala em ${citados.map((d) => NOME_DO_DIA[d]).join(" / ")}, e este cliente publica em ` +
      `${calendario.map((d) => NOME_DO_DIA[d]).join(", ")}. A peça nasceu com um dia que não existe no calendário dele. ` +
      "Dono: a agência (produção). Próxima ação: acertar o dia no texto antes de a peça ir ao cliente.",
  };
}

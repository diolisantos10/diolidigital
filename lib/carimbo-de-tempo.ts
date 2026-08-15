// ─────────────────────────────────────────────────────────────────────────────
// O CARIMBO — o único formatador de data/hora da casa
// ─────────────────────────────────────────────────────────────────────────────
//
// ⚠️ REGRA DO CEO, 15/08/2026:
//
//   "Tudo precisa ter hora e data."
//
// Ele estava na aba Aprovações do portal, no piloto da CityJobs, e a tela dizia
// "Social Media · sem prazo — decida quando puder" sem nenhuma data; "1 entrega
// está pronta para você" sem nenhuma data; "Analytics · material ainda não
// subiu" sem nenhuma data. Sem carimbo, **item parado é indistinguível de item
// recente** — e foi por isso que ele passou dias sem saber que uma peça estava
// travada esperando por ele.
//
// As quatro leis deste módulo:
//
//  1. **Nunca inventar.** Registro sem campo devolve `null` daqui, e a tela
//     escreve `SEM_CARIMBO` ("sem registro de quando"). Nunca "hoje", nunca uma
//     data plausível. Ausência de informação não é informação (guardrail 1).
//  2. **Absoluta E relativa, juntas.** "14/08/2026 às 21:47 · há 15 h". A
//     absoluta é a PROVA (audita); a relativa é o ALARME (faz agir). Relativa
//     sozinha não audita; absoluta sozinha não alarma.
//  3. **Fuso fixo da casa.** `America/Sao_Paulo`, pt-BR, 24h, dia/mês/ano.
//     Sem `timeZone` explícito, o mesmo instante vira 21:47 no navegador do CEO
//     e 00:47 do dia seguinte no servidor (Railway roda em UTC) — o carimbo
//     mudava de dia dependendo de quem renderizou. A perícia já achou um campo
//     em `mm/dd/yyyy` no portal: era `toLocaleDateString()` sem locale, caindo
//     no `en-US` do servidor.
//  4. **Uma implementação só.** `lib/agency/format-time.ts` passou a delegar
//     para cá. Três formatações do mesmo carimbo é como esta casa produz
//     divergência — já aconteceu com a lista de campos da entrega, em três
//     cópias.

/** O fuso da casa. Cliente e agência estão no Brasil; o servidor, em UTC. */
export const FUSO_DA_CASA = "America/Sao_Paulo";

/** O que se escreve quando o registro NÃO tem o campo. Nunca uma data. */
export const SEM_CARIMBO = "sem registro de quando";

/** O `title` do elemento quando não há carimbo — a falta explicada, não escondida. */
export const SEM_CARIMBO_DETALHE =
  "Este registro não guarda a data em que isso aconteceu. Nada foi estimado.";

export interface Carimbo {
  /** ISO 8601 completo — vai no atributo `dateTime` do `<time>`. */
  iso: string;
  /** "14/08/2026 às 21:47" — a prova. */
  absoluto: string;
  /** "há 15 h" / "em 3 dias" / "agora" — o alarme. */
  relativo: string;
  /** "14/08/2026 às 21:47 · há 15 h" — o padrão da casa. */
  completo: string;
  /** "14/08" — só onde a coluna é estreita DEMAIS. O `title` carrega o completo. */
  curto: string;
  /** Minutos decorridos. Negativo = está no futuro (prazo que ainda não venceu). */
  minutos: number;
  /** Dias decorridos, inteiro. Negativo = futuro. Serve para régua de atraso. */
  dias: number;
  /** O instante já é passado? */
  passado: boolean;
}

const fmtAbsoluto = new Intl.DateTimeFormat("pt-BR", {
  timeZone: FUSO_DA_CASA,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const fmtCurto = new Intl.DateTimeFormat("pt-BR", {
  timeZone: FUSO_DA_CASA,
  day: "2-digit",
  month: "2-digit",
});

/**
 * A idade, em palavras. Cobre os DOIS sentidos: passado ("há 3 dias") e futuro
 * ("em 3 dias"). O formatador antigo só sabia o passado — e `expiresAt`, que é
 * a metade da tela de aprovações, está sempre no futuro até vencer.
 */
function idadeEmPalavras(ms: number): string {
  const futuro = ms < 0;
  const segs = Math.floor(Math.abs(ms) / 1000);
  if (segs < 45) return "agora";
  const prefixo = (t: string) => (futuro ? `em ${t}` : `há ${t}`);
  const mins = Math.floor(segs / 60);
  if (mins < 60) return prefixo(`${mins} min`);
  const horas = Math.floor(mins / 60);
  if (horas < 24) return prefixo(`${horas} h`);
  const dias = Math.floor(horas / 24);
  if (dias < 30) return prefixo(`${dias} dia${dias > 1 ? "s" : ""}`);
  const meses = Math.floor(dias / 30);
  if (meses < 12) return prefixo(`${meses} ${meses > 1 ? "meses" : "mês"}`);
  const anos = Math.floor(meses / 12);
  return prefixo(`${anos} ano${anos > 1 ? "s" : ""}`);
}

/**
 * Carimba um instante — ou devolve `null` quando não há instante nenhum.
 *
 * `null` é a resposta honesta e é o ponto inteiro deste módulo: quem chama
 * escreve `SEM_CARIMBO`, nunca uma data inventada. `agora` é injetável para o
 * teste poder fixar o relógio sem congelar o processo.
 */
export function carimbar(
  valor: string | Date | number | null | undefined,
  agora: Date = new Date(),
): Carimbo | null {
  if (valor === null || valor === undefined || valor === "") return null;
  const d = valor instanceof Date ? valor : new Date(valor);
  const t = d.getTime();
  if (!Number.isFinite(t)) return null;

  const delta = agora.getTime() - t;
  const absoluto = fmtAbsoluto.format(d).replace(", ", " às ");
  const relativo = idadeEmPalavras(delta);

  return {
    iso: d.toISOString(),
    absoluto,
    relativo,
    completo: `${absoluto} · ${relativo}`,
    curto: fmtCurto.format(d),
    minutos: Math.trunc(delta / 60000),
    dias: Math.trunc(delta / 86400000),
    passado: delta >= 0,
  };
}

/**
 * A versão em TEXTO PURO, para onde não cabe elemento (string de assunto de
 * e-mail, `aria-label`, log, coluna de tabela montada como string). Mesma
 * implementação — e, sem carimbo, `SEM_CARIMBO`, nunca vazio nem "—", que o
 * leitor confunde com "zero".
 */
export function textoDoCarimbo(
  valor: string | Date | number | null | undefined,
  agora?: Date,
): string {
  return carimbar(valor, agora)?.completo ?? SEM_CARIMBO;
}

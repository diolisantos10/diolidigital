// pulso.ts — O BATIMENTO DO RELÓGIO, GRAVADO ONDE DÁ PARA CONFERIR.
//
// ── O buraco que ele fecha (06/08/2026, véspera do CEO voltar) ───────────────
// O relógio da agência (`despertador.ts`) bate a cada 5 minutos DENTRO do
// servidor. Ele funciona — e é INVISÍVEL. Uma rodada em que nada aconteceu não
// escreve uma linha sequer, e é exatamente isso que "parou de bater" também
// produz. Os dois estados — "está tudo em dia" e "o relógio morreu" — eram
// indistinguíveis de fora.
//
// Pior: cada perna da rodada (produção, publicação, backup, avisos) engole o
// próprio erro num `console.log` para não derrubar as outras — o que é certo —
// e o log do container é rotativo, some no deploy seguinte e ninguém o lê às
// 7 da manhã. **Falha de madrugada era, na prática, falha sem testemunha.**
//
// O que este arquivo é: uma linha por batida, no volume, com o que a rodada
// moveu e o que quebrou. Duas perguntas passam a ter resposta em um curl:
//   1. o relógio bateu? (`/api/health` → `relogio.haMinutos`)
//   2. quebrou alguma coisa desde ontem à noite? (`relogio.falhas`)
//
// POR QUE ARQUIVO NO VOLUME, e não tabela: migration nova exigiria mexer no
// `schema.prisma`, que está sendo editado por outro agente nesta mesma árvore.
// O precedente é o backup (`backup.ts`), que já guarda estado no mesmo volume.
// **Custo declarado:** o pulso é por INSTÂNCIA e mora no volume — com mais de
// uma réplica, cada uma escreveria o seu. Hoje é uma só.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/** Quantas batidas ficam guardadas. 5 min × 300 ≈ 25 h — cobre a noite inteira
 *  e a manhã seguinte, que é a janela em que o CEO pergunta "e ontem?". */
const MAX_BATIDAS = 300;

/** Acima disto o relógio está atrasado a ponto de merecer alarme. O intervalo é
 *  de 5 min; 15 significa três batidas perdidas, não uma rodada demorada. */
export const ATRASO_QUE_ALARMA_MIN = 15;

export interface FalhaDaRodada {
  /** Qual perna da rodada quebrou: `publicacao`, `backup`, `producao`… */
  perna: string;
  /** O motivo, já em texto. Nunca leva id de cliente nem fala do cliente. */
  erro: string;
}

/** Uma torneira de saída que estava FECHADA nesta rodada, e o que ficou atrás
 *  dela. Ver `lib/agency/freios-de-saida.ts`.
 *
 *  Por que isto é campo próprio e não uma `falha`: freio puxado não é defeito —
 *  é regra funcionando. Contá-lo como falha faria o vigia da madrugada alarmar
 *  toda noite e ensinaria o painel a ser ignorado. E contá-lo como NADA é pior:
 *  fila retida sem testemunha é fila morta invisível, que é a cicatriz que esta
 *  casa já tem. Ele é, então, uma terceira coisa: estado declarado. */
export interface FreioNaRodada {
  /** O nome da variável de ambiente que solta. */
  nome: string;
  /** Em português: o que ficou retido e como se abre. */
  motivo: string;
  /** Quanto ficou esperando atrás do freio nesta rodada. */
  retidos: number;
}

export interface Batida {
  em: string;
  /** Quanto tempo a rodada levou. Rodada que cresce é rodada que vai estourar. */
  ms: number;
  /** O que a rodada MOVEU. Zero em tudo = a casa não tinha trabalho. */
  moveu: Record<string, number>;
  falhas: FalhaDaRodada[];
  /** As torneiras que estavam fechadas. Opcional de propósito: batidas gravadas
   *  antes de 15/08/2026 não têm o campo, e o leitor não pode quebrar com elas. */
  freios?: FreioNaRodada[];
}

export interface EstadoDoPulso {
  ultima: Batida | null;
  /** Há quantos minutos foi a última batida. `null` = nunca bateu. */
  haMinutos: number | null;
  /** `false` = o relógio está atrasado ou nunca bateu. É o alarme. */
  ok: boolean;
  /** Batidas guardadas (para o raio-x contar a noite). */
  batidas: number;
  /** Falhas das últimas 24 h, agrupadas por perna. */
  falhas24h: Array<{ perna: string; erro: string; vezes: number; ultimaEm: string }>;
  /** Soma do que a casa moveu nas últimas 24 h. */
  moveu24h: Record<string, number>;
  /** As torneiras que estavam FECHADAS na última batida, com o que ficou retido
   *  atrás de cada uma. É a resposta a "a fila parou ou o freio está segurando?"
   *  — duas coisas que, sem isto, são indistinguíveis de fora. */
  freios: FreioNaRodada[];
}

function pasta(): string {
  const volume = process.env.RAILWAY_VOLUME_MOUNT_PATH?.trim();
  return volume ? path.join(volume, "pulso") : path.join(process.cwd(), ".pulso");
}

function arquivo(): string {
  return path.join(pasta(), "batidas.json");
}

async function ler(): Promise<Batida[]> {
  try {
    const bruto = await readFile(arquivo(), "utf8");
    const v = JSON.parse(bruto);
    return Array.isArray(v) ? (v as Batida[]) : [];
  } catch {
    // Arquivo ausente é o primeiro boot; arquivo corrompido não pode derrubar o
    // relógio — o pulso é a testemunha, não o trabalho.
    return [];
  }
}

/**
 * Grava uma batida. **Nunca lança**: o registro do relógio não pode ser o que
 * para o relógio. Se o disco recusar, a rodada seguiu — só ficou sem testemunha,
 * e é `/api/health` que denuncia isso pelo atraso.
 */
export async function registrarBatida(b: Batida): Promise<void> {
  try {
    await mkdir(pasta(), { recursive: true });
    const todas = [...(await ler()), b].slice(-MAX_BATIDAS);
    await writeFile(arquivo(), JSON.stringify(todas), "utf8");
  } catch {
    /* best-effort de propósito — ver comentário acima */
  }
}

export async function lerPulso(agora: Date = new Date()): Promise<EstadoDoPulso> {
  const todas = await ler();
  const ultima = todas[todas.length - 1] ?? null;
  const haMinutos = ultima
    ? Math.floor((agora.getTime() - new Date(ultima.em).getTime()) / 60_000)
    : null;

  const limite = agora.getTime() - 24 * 3_600_000;
  const recentes = todas.filter((b) => new Date(b.em).getTime() >= limite);

  const porFalha = new Map<string, { perna: string; erro: string; vezes: number; ultimaEm: string }>();
  const moveu24h: Record<string, number> = {};
  for (const b of recentes) {
    for (const f of b.falhas ?? []) {
      const chave = `${f.perna}::${f.erro}`;
      const atual = porFalha.get(chave);
      if (atual) { atual.vezes++; atual.ultimaEm = b.em; }
      else porFalha.set(chave, { perna: f.perna, erro: f.erro, vezes: 1, ultimaEm: b.em });
    }
    for (const [k, v] of Object.entries(b.moveu ?? {})) {
      if (typeof v === "number") moveu24h[k] = (moveu24h[k] ?? 0) + v;
    }
  }

  return {
    ultima,
    haMinutos,
    // Nunca bateu também é ALARME, e não "ainda não sei". Um servidor que subiu
    // e cujo relógio não ligou é indistinguível, de fora, de um saudável — foi
    // esse silêncio que motivou o arquivo inteiro.
    ok: haMinutos !== null && haMinutos <= ATRASO_QUE_ALARMA_MIN,
    batidas: todas.length,
    falhas24h: [...porFalha.values()].sort((a, b) => b.vezes - a.vezes),
    moveu24h,
    // Da ÚLTIMA batida, não das 24 h: freio é estado de agora, e somar 24 h de
    // retidos daria um número inflado ("288 mensagens retidas" quando são 1
    // mensagem vista 288 vezes) — que é o jeito mais rápido de a contagem
    // deixar de ser levada a sério.
    freios: ultima?.freios ?? [],
  };
}

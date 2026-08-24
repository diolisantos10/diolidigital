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

/**
 * ESTADO ANORMAL-MAS-NÃO-QUEBRADO da rodada (24/08/2026).
 *
 * Nasceu de um achado: a decisão do dono de 08/08 subia como FALHA a cada 5
 * minutos porque a casa não tinha nenhum cliente para liberar. Nada tinha
 * quebrado — e mesmo assim o log gritava "falhou" mais de 4.600 vezes em 16
 * dias, ensinando quem lê a pular a linha.
 *
 * Estado não é falha e não é silêncio: é um fato que continua verdadeiro
 * enquanto durar, dito UMA vez no log quando começa (e quando termina), e
 * sempre disponível em `/api/pulso`. Quem quiser saber, pergunta e vê.
 */
export interface EstadoDaRodada {
  /** De quem é o estado: `decisao-do-dono`, `backup`… */
  perna: string;
  /** O fato, em português, com o que ele significa. Nunca leva PII. */
  texto: string;
}

export interface Batida {
  em: string;
  /** Quanto tempo a rodada levou. Rodada que cresce é rodada que vai estourar. */
  ms: number;
  /** O que a rodada MOVEU. Zero em tudo = a casa não tinha trabalho. */
  moveu: Record<string, number>;
  falhas: FalhaDaRodada[];
  /** Estados contínuos observados nesta rodada. Opcional: batida antiga não tem. */
  estados?: EstadoDaRodada[];
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
  /** Estados contínuos vistos nas últimas 24 h. NÃO são falhas — ver
   *  `EstadoDaRodada`. Ficam aqui para que "não é falha" nunca vire "sumiu". */
  estados24h: Array<{ perna: string; texto: string; vezes: number; ultimaEm: string }>;
  /** O estado que valia na ÚLTIMA batida — o retrato de agora. */
  estadosAgora: EstadoDaRodada[];
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
  const porEstado = new Map<string, { perna: string; texto: string; vezes: number; ultimaEm: string }>();
  const moveu24h: Record<string, number> = {};
  for (const b of recentes) {
    for (const f of b.falhas ?? []) {
      const chave = `${f.perna}::${f.erro}`;
      const atual = porFalha.get(chave);
      if (atual) { atual.vezes++; atual.ultimaEm = b.em; }
      else porFalha.set(chave, { perna: f.perna, erro: f.erro, vezes: 1, ultimaEm: b.em });
    }
    for (const e of b.estados ?? []) {
      const chave = `${e.perna}::${e.texto}`;
      const atual = porEstado.get(chave);
      if (atual) { atual.vezes++; atual.ultimaEm = b.em; }
      else porEstado.set(chave, { perna: e.perna, texto: e.texto, vezes: 1, ultimaEm: b.em });
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
    estados24h: [...porEstado.values()].sort((a, b) => b.vezes - a.vezes),
    estadosAgora: ultima?.estados ?? [],
  };
}

// vigia-da-madrugada.ts — O QUE AVISA QUANDO A NOITE QUEBRA.
//
// ── Por que existe (06/08/2026, véspera de o CEO voltar) ─────────────────────
// A ordem foi: "quero essa agência produzindo, sem parar". Produzir sozinha a
// casa produz — o relógio está dentro do servidor e bate a cada 5 min. O que
// ela NÃO fazia era contar. Se a produção da noite quebrasse, o CEO descobriria
// pelo cliente, que é a pior ordem possível de ficar sabendo.
//
// O aviso que existia dependia do GitHub Actions (`raio-x-noturno.yml`, 03h) —
// e o Actions estava em PANE DECLARADA na noite em que isto foi escrito, com
// os disparos agendados chegando de 64 a 203 minutos de atraso quando chegavam.
// **Alarme hospedado no provedor que cai não toca no dia em que faria falta.**
// Por isso o vigia mora dentro do relógio da própria casa: se a agência está no
// ar, o vigia está de pé; se a agência não está no ar, não há produção a vigiar
// e o silêncio significa a coisa certa.
//
// O QUE ELE FAZ, uma vez por dia às 03h de São Paulo:
//   1. varre os DADOS PRESOS (a mesma varredura do raio-x, só leitura);
//   2. lê as falhas da noite anotadas pelo pulso;
//   3. escreve no painel — `ActivityEvent` — uma linha por achado grave e uma
//      linha de fechamento com o resumo da noite.
//
// O QUE ELE NÃO FAZ, e é decisão, não esquecimento:
//   • NÃO manda WhatsApp. Disparo de mensagem é ESCRITA em plataforma Meta e
//     exige parecer prévio do especialista `meta` (regra da casa, 03/08/2026).
//     Fica declarado como o próximo degrau do aviso.
//   • NÃO conserta nada. Vigia que conserta esconde o defeito que devia mostrar.

import { prisma } from "@/lib/db/client";
import { varrerDadosPresos } from "@/lib/raio-x/dados";
import { hojeEmSaoPaulo } from "@/lib/raio-x/registro";
import type { FalhaDaRodada } from "@/lib/agency/pulso";
import { lerPulso } from "@/lib/agency/pulso";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/** A hora de São Paulo em que o vigia fecha a noite. 03h é depois de a
 *  madrugada ter acontecido e antes de o CEO acordar. */
const HORA_DO_FECHAMENTO = 3;

/** Tipo do evento de fechamento. Nome estável: é por ele que a tela filtra. */
export const TIPO_DO_VIGIA = "vigia_da_madrugada";
export const TIPO_DO_ACHADO = "vigia_achado";

function pasta(): string {
  const volume = process.env.RAILWAY_VOLUME_MOUNT_PATH?.trim();
  return volume ? path.join(volume, "pulso") : path.join(process.cwd(), ".pulso");
}

/** Qual dia o vigia já fechou. Arquivo, e não memória: um restart do servidor
 *  às 03h05 não pode fazer o vigia rodar de novo e duplicar o aviso. */
async function ultimoDiaFechado(): Promise<string | null> {
  try {
    return (await readFile(path.join(pasta(), "vigia.txt"), "utf8")).trim() || null;
  } catch {
    return null;
  }
}

async function marcarDiaFechado(dia: string): Promise<void> {
  try {
    await mkdir(pasta(), { recursive: true });
    await writeFile(path.join(pasta(), "vigia.txt"), dia, "utf8");
  } catch {
    /* best-effort — no pior caso o aviso sai duas vezes, que é melhor que zero */
  }
}

/** A hora do relógio de São Paulo, sem depender do fuso do container. */
function horaEmSaoPaulo(agora: Date): number {
  const h = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    hour12: false,
  }).format(agora);
  return Number(h);
}

export interface FechamentoDaNoite {
  /** `false` = ainda não é hora, ou a noite de hoje já foi fechada. */
  rodou: boolean;
  achadosGraves: number;
  falhasDaNoite: number;
  resumo: string;
}

/**
 * Fecha a noite. **Nunca lança para fora** — o vigia não pode ser o que derruba
 * o relógio que ele veio vigiar.
 *
 * `falhasDaRodada` é o que a rodada atual quebrou; o resto da noite vem do
 * pulso, que guarda 25 h de batidas.
 */
export async function vigiarAMadrugada(
  falhasDaRodada: FalhaDaRodada[] = [],
  agora: Date = new Date(),
): Promise<FechamentoDaNoite> {
  const parado: FechamentoDaNoite = { rodou: false, achadosGraves: 0, falhasDaNoite: 0, resumo: "" };

  const dia = hojeEmSaoPaulo(agora);
  // A porta é dupla de propósito: a HORA impede o vigia de rodar o dia inteiro,
  // e o DIA JÁ FECHADO impede que um servidor que reiniciou às 03h duplique o
  // aviso. Só a hora não bastaria — o relógio bate 12 vezes dentro da hora 3.
  if (horaEmSaoPaulo(agora) !== HORA_DO_FECHAMENTO) return parado;
  if ((await ultimoDiaFechado()) === dia) return parado;
  // Marca ANTES de escrever: se o fechamento morrer no meio, o CEO recebe um
  // aviso incompleto (que ele lê) em vez de doze iguais (que ele ignora).
  await marcarDiaFechado(dia);

  const workspace = await prisma.agencyWorkspace.findFirst({ select: { id: true } }).catch(() => null);
  if (!workspace) return { ...parado, rodou: true, resumo: "sem workspace" };

  const pulso = await lerPulso(agora);
  const falhas = [
    ...pulso.falhas24h.map((f) => ({ perna: f.perna, erro: f.erro, vezes: f.vezes })),
    ...falhasDaRodada.map((f) => ({ perna: f.perna, erro: f.erro, vezes: 1 })),
  ];

  const varredura = await varrerDadosPresos(agora).catch(() => null);
  const graves = (varredura?.achados ?? []).filter((a) => a.gravidade === "alto");

  const registrar = async (type: string, message: string) => {
    await prisma.activityEvent.create({
      data: { workspaceId: workspace.id, type, message },
    }).catch(() => { /* best-effort */ });
  };

  for (const a of graves) {
    await registrar(TIPO_DO_ACHADO, `🔴 ${a.titulo} — ${a.evidencia} (${a.local})`);
  }
  for (const f of falhas) {
    await registrar(
      TIPO_DO_ACHADO,
      `🔴 A produção quebrou na madrugada em "${f.perna}" (${f.vezes}×): ${f.erro}`,
    );
  }

  // O FECHAMENTO SAI SEMPRE, inclusive na noite limpa — e principalmente nela.
  // Alarme que só aparece quando há problema é indistinguível de alarme
  // quebrado: o CEO abre o painel, não vê nada e não sabe qual dos dois é.
  const moveu = pulso.moveu24h;
  const total = Object.values(moveu).reduce((a, b) => a + b, 0);
  const resumo =
    `Noite de ${dia}: o relógio bateu ${pulso.batidas} vez(es) nas últimas 24 h` +
    (pulso.ok ? "" : " ⚠ E ESTÁ ATRASADO AGORA") +
    `. A casa moveu ${total} item(ns)` +
    (total === 0 ? " — a esteira não tinha trabalho pendente" : `: ${resumoDoQueMoveu(moveu)}`) +
    `. ${falhas.length === 0 ? "Nenhuma falha de produção" : `${falhas.length} falha(s) de produção`}` +
    `, ${graves.length === 0 ? "nenhum achado grave" : `${graves.length} achado(s) grave(s)`}.`;
  await registrar(TIPO_DO_VIGIA, resumo);

  return { rodou: true, achadosGraves: graves.length, falhasDaNoite: falhas.length, resumo };
}

function resumoDoQueMoveu(moveu: Record<string, number>): string {
  return Object.entries(moveu)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `${v} ${k}`)
    .join(", ");
}

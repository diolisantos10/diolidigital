// mes-editorial.ts — A ROTINA MENSAL: O MÊS INTEIRO, DE UMA VEZ, TODO DIA 25.
//
// ═══════════════════════════════════════════════════════════════════════════
// A ORDEM DO CEO (bloco MENSAL, 1C-C3, 27/09/2026)
// ═══════════════════════════════════════════════════════════════════════════
//
// Para marcas cujo modo de aprovação é MENSAL, a casa gera o mês INTEIRO no
// dia 25 do mês anterior — texto, arte E legenda final — e o cliente aprova
// tudo de uma vez, num único card, pelo portal. Aprovado, TRAVA: mudança vira
// refação dentro do limite do contrato (`limite-de-refacoes.ts`, do C2 — este
// arquivo só CITA, nunca liga o ajuste) ou é cobrada à parte (este arquivo não
// cobra nada automaticamente: só registra o que aconteceu).
//
// **NÃO EXISTE "silêncio publica" no modo MENSAL.** A peça ESPERA o clique do
// cliente — ao contrário do SEMANAL, onde `aplicarSilencioSemanal.ts` aprova
// por regra depois de sexta 18h. `modo-de-aprovacao.ts` já é fail-closed
// nisso: `carimboValeNoModo` aceita o carimbo de silêncio em MENSAL também,
// mas ESTE arquivo nunca o grava — quem decide, aqui, é sempre o cliente (pelo
// clique) ou o CEO (por regra explícita, noutra porta). Se um dia alguém
// quiser "silêncio publica" para o mensal, é uma peça nova, escrita com o
// mesmo cuidado de `aplicarSilencioSemanal` — nunca um atalho aqui.
//
// ═══════════════════════════════════════════════════════════════════════════
// TRÊS ATOS, NESTA ORDEM — E A ORDEM É A ENTREGA
// ═══════════════════════════════════════════════════════════════════════════
//
//   1. GARANTIR o calendário do mês — `gerarCalendarioEditorial`, idempotente
//      pelo marcador `scriptJson.mes` (ver o cabeçalho de
//      `calendario-editorial.ts`). Marca sem pacote ou sem ficha de marca
//      RECUSA aqui, antes de gastar um token — vira `recusas`, nunca exceção.
//   2. FINALIZAR todas as peças — `finalizarPecasNaJanela`, o MESMO núcleo que
//      a rotina semanal usa (extraído de `semana-editorial.ts` para isto:
//      legenda final + arte, pelas mesmas travas, idempotente pela fase
//      "pauta" → "final"). Nunca uma segunda cópia desta lógica.
//   3. ABRIR UM card de aprovação com o MÊS INTEIRO — `abrirCardDoPeriodo`
//      (também de `semana-editorial.ts`), o MESMO mecanismo do modo SEMANAL.
//
// Gerar depois de finalizar produziria peça "pauta" sem chance de virar
// "final" nesta mesma rodada; finalizar antes de garantir o calendário não
// teria o que finalizar. A ordem acima é a única que faz sentido.
//
// ═══════════════════════════════════════════════════════════════════════════
// QUEM ENTRA — A DATA QUE DECIDE É A DO PRIMEIRO DIA DO MÊS SEGUINTE
// ═══════════════════════════════════════════════════════════════════════════
//
// `modoEmVigor(cliente, janela.de)` — a mesma régua de `modo-de-aprovacao.ts`
// em toda a casa: o modo que vale é o da DATA em que a peça vale, nunca o
// instante em que o relógio bateu. Uma marca cuja troca para MENSAL fica
// pendente para o dia 1 do mês seguinte já entra nesta rodada — é exatamente
// o ciclo em que a troca começa a valer.
//
// ═══════════════════════════════════════════════════════════════════════════
// IDEMPOTÊNCIA, DE PONTA A PONTA
// ═══════════════════════════════════════════════════════════════════════════
//
// Chamar `finalizarMes` de novo, na mesma hora ou depois, não duplica nada:
//   • o calendário é idempotente pelo marcador (`gerarCalendarioEditorial`);
//   • a finalização é idempotente pela fase ("pauta" só existe uma vez);
//   • o card é idempotente por `cardsQueJaDecidem` (a mesma leitura do
//     semanal) — peça já num card pendente, ou já aprovada, não entra de novo.
//
// `ehDia25As10hBrasilia` vale a HORA INTEIRA (10:00–10:59 Brasília), a mesma
// régua de `ehQuinta10hBrasilia`: o despertador bate a cada 5 minutos, e
// checar só o minuto exato arriscaria perder a batida por um segundo de
// atraso.

import "server-only";

import { prisma } from "@/lib/db/client";
import { modoEmVigor } from "@/lib/agency/esteira/modo-de-aprovacao";
import {
  gerarCalendarioEditorial,
  meiaNoiteBrasilia,
  diaCivilBrasilia,
  type GeradorDeIA,
  type ResultadoDoCalendarioEditorial,
  type CodigoDeRecusaDoCalendario,
} from "@/lib/agency/esteira/calendario-editorial";
import {
  civilBrasilia,
  finalizarPecasNaJanela,
  abrirCardDoPeriodo,
} from "@/lib/agency/esteira/semana-editorial";

// ═════════════════════════════════════════════════════════════════════════
// AS FUNÇÕES PURAS DE FUSO E DE MÊS
// ═════════════════════════════════════════════════════════════════════════

/**
 * É dia 25, hora 10 em Brasília? Verdadeira a HORA INTEIRA (10:00 a 10:59
 * Brasília) — ver o cabeçalho quanto à idempotência que isso exige (e
 * entrega). `civilBrasilia` é a MESMA conta de `ehQuinta10hBrasilia`
 * (`semana-editorial.ts`), reusada — nunca uma segunda cópia.
 */
export function ehDia25As10hBrasilia(agora: Date): boolean {
  const c = civilBrasilia(agora);
  return c.dia === 25 && c.hora === 10;
}

export interface JanelaDoMes {
  /** "AAAA-MM" do mês desta janela — o que `gerarCalendarioEditorial` espera
   *  em `entrada.mes`. */
  mes: string;
  /** Dia 1, 00:00:00.000 Brasília, como instante UTC. */
  de: Date;
  /** Último dia do mês, 23:59:59.999 Brasília, como instante UTC. */
  ate: Date;
}

const MES_REGEX = /^(\d{4})-(0[1-9]|1[0-2])$/;

/** A janela Brasília do mês "AAAA-MM" — `null` se o texto não bater no
 *  formato esperado. Pura: quem chama decide como recusar. */
export function janelaDoMesTexto(mesTexto: string): JanelaDoMes | null {
  const m = MES_REGEX.exec((mesTexto ?? "").trim());
  if (!m) return null;
  const ano = Number(m[1]);
  const mesIndex = Number(m[2]) - 1;
  const de = meiaNoiteBrasilia(ano, mesIndex, 1);
  // Início do mês SEGUINTE menos 1ms — `Date.UTC` (dentro de
  // `meiaNoiteBrasilia`) normaliza dezembro sozinho, então não há aritmética
  // de virada de ano espalhada aqui.
  const ate = new Date(meiaNoiteBrasilia(ano, mesIndex + 1, 1).getTime() - 1);
  return { mes: `${m[1]}-${m[2]}`, de, ate };
}

/**
 * O mês SEGUINTE ao de `agora`, em Brasília — dia 1 00:00 até o último dia do
 * mês, 23:59:59.999. Chamada no dia 25, devolve o mês que começa daqui a
 * poucos dias.
 *
 * A STRING "AAAA-MM" nasce do `diaCivilBrasilia` do PRÓPRIO `de` já calculado
 * — nunca de aritmética própria sobre `mesIndex + 1`: é `Date.UTC` (dentro de
 * `meiaNoiteBrasilia`) quem normaliza dezembro → janeiro do ano seguinte, e
 * reconstruir a string a partir do resultado já normalizado é o que evita o
 * bug clássico de "mês 13".
 */
export function mesSeguinte(agora: Date): JanelaDoMes {
  const c = civilBrasilia(agora);
  const de = meiaNoiteBrasilia(c.ano, c.mesIndex + 1, 1);
  const ate = new Date(meiaNoiteBrasilia(c.ano, c.mesIndex + 2, 1).getTime() - 1);
  const civilDe = diaCivilBrasilia(de);
  const mes = `${civilDe.ano}-${String(civilDe.mesIndex + 1).padStart(2, "0")}`;
  return { mes, de, ate };
}

// ═════════════════════════════════════════════════════════════════════════
// finalizarMes
// ═════════════════════════════════════════════════════════════════════════

export interface FinalizarMesEntrada {
  workspaceId?: string;
  clientId?: string;
  /** "AAAA-MM" explícito — o mês a garantir/finalizar/abrir card. Ausente =
   *  o mês SEGUINTE ao de `agora` (`mesSeguinte`), o caso do relógio (chamado
   *  todo dia 25). Explícito é o caso da rota manual: reprocessar um mês
   *  específico sem esperar o próximo dia 25. */
  mes?: string;
  agora?: Date;
  /** Injeção do provedor de IA — só para teste. */
  gerar?: GeradorDeIA;
}

export interface FinalizarMesSaida {
  /** Quantas marcas em modo MENSAL (na data em que o mês vale) foram
   *  examinadas nesta chamada. */
  clientesElegiveis: number;
  /** Clientes para os quais o calendário do mês foi GERADO AGORA
   *  (`criados > 0`) — não conta quem já tinha o calendário (idempotente). */
  calendariosGerados: number;
  postsFinalizados: number;
  falhas: Array<{ postId: string; motivo: string }>;
  /** O calendário do mês NÃO pôde ser gerado para este cliente — sem pacote,
   *  sem ficha de marca, mês inválido... Nunca lança: vira linha aqui. */
  recusas: Array<{ clientId: string; motivo: string; codigo: CodigoDeRecusaDoCalendario }>;
  /** Uma linha por cliente com ao menos uma peça finalizada nesta chamada,
   *  com o que `abrirCardDoPeriodo` fez. */
  cards: Array<{ clientId: string; resultado: string }>;
}

/**
 * Para toda marca em modo MENSAL (no primeiro dia do mês desta janela):
 * garante o calendário do mês, finaliza todas as peças e abre UM card de
 * aprovação com o mês inteiro.
 *
 * IDEMPOTENTE de ponta a ponta — ver o cabeçalho do arquivo. Nunca lança: erro
 * num cliente vira `recusas`/`falhas` e a rodada segue para o próximo.
 */
export async function finalizarMes(entrada: FinalizarMesEntrada = {}): Promise<FinalizarMesSaida> {
  const agora = entrada.agora ?? new Date();
  const saida: FinalizarMesSaida = {
    clientesElegiveis: 0, calendariosGerados: 0, postsFinalizados: 0,
    falhas: [], recusas: [], cards: [],
  };

  const janela = entrada.mes ? janelaDoMesTexto(entrada.mes) : mesSeguinte(agora);
  if (!janela) {
    saida.recusas.push({
      clientId: entrada.clientId ?? "-",
      motivo: `mês inválido: "${entrada.mes}" — use o formato AAAA-MM`,
      codigo: "mes_invalido",
    });
    return saida;
  }

  const candidatos = await prisma.client
    .findMany({
      where: {
        ...(entrada.workspaceId ? { workspaceId: entrada.workspaceId } : {}),
        ...(entrada.clientId ? { id: entrada.clientId } : {}),
      },
      select: {
        id: true, workspaceId: true, modoAprovacao: true, modoPendente: true, modoPendenteVigenteEm: true,
      },
    })
    .catch(() => [] as Array<{
      id: string; workspaceId: string; modoAprovacao: string;
      modoPendente: string | null; modoPendenteVigenteEm: Date | null;
    }>);

  // O MODO é o do PRIMEIRO DIA DO MÊS SEGUINTE (`janela.de`) — ver o
  // cabeçalho do arquivo. Uma marca fora de MENSAL não entra aqui: quem cuida
  // dela é `finalizarSemana` (SEMANAL/PILOTO/CEO), nunca esta rotina.
  const mensais = candidatos.filter((c) => modoEmVigor(c, janela.de) === "MENSAL");

  for (const cliente of mensais) {
    saida.clientesElegiveis++;

    // ── 1. GARANTIR O CALENDÁRIO ─────────────────────────────────────────
    const calendario = await gerarCalendarioEditorial({
      workspaceId: cliente.workspaceId,
      clientId: cliente.id,
      mes: janela.mes,
      gerar: entrada.gerar,
    }).catch((e): ResultadoDoCalendarioEditorial => ({
      ok: false,
      motivo: e instanceof Error ? e.message : "erro inesperado ao gerar o calendário do mês",
      codigo: "ia_falhou",
    }));

    if (!calendario.ok) {
      saida.recusas.push({ clientId: cliente.id, motivo: calendario.motivo, codigo: calendario.codigo });
      continue;
    }
    if (calendario.criados > 0) saida.calendariosGerados++;

    // ── 2. FINALIZAR TODAS AS PEÇAS ───────────────────────────────────────
    const nucleo = await finalizarPecasNaJanela({
      workspaceId: cliente.workspaceId,
      clientId: cliente.id,
      de: janela.de,
      ate: janela.ate,
      gerar: entrada.gerar,
    });
    saida.postsFinalizados += nucleo.postsFinalizados;
    saida.falhas.push(...nucleo.falhas);

    const finalizadosDesteCliente = nucleo.finalizadosPorCliente.get(cliente.id) ?? [];
    if (finalizadosDesteCliente.length === 0) continue;

    // ── 3. ABRIR UM CARD COM O MÊS INTEIRO ────────────────────────────────
    const resultado = await abrirCardDoPeriodo({
      clientId: cliente.id,
      postIds: finalizadosDesteCliente,
      requestedBy: "esteira:rotina-mensal",
    });
    saida.cards.push({ clientId: cliente.id, resultado });
  }

  return saida;
}

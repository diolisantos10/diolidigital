// modo-de-aprovacao.ts — CADA MARCA ESCOLHE COMO APROVA O CONTEÚDO. SERVER-ONLY.
//
// ─── A DECISÃO DO CEO (27/09/2026) ───────────────────────────────────────────
//
// Até hoje só existia UM caminho de aprovação de peça: o clique do cliente no
// portal dele (`client:<nome>`, ver `aprovacao-da-peca.ts`). Certo para quem
// quer decidir peça por peça — e o único caminho possível para toda marca nova,
// justamente porque é o mais conservador.
//
// Mas nem toda marca quer decidir peça por peça para sempre. O CEO decidiu que
// cada `Client` carrega o PRÓPRIO modo de aprovação:
//
//   • `APROVACAO_CEO`      — o modo INICIAL de toda marca. O master aprova a
//                            semana, peça por peça, pelo portal ou por
//                            `POST /api/social-posts/aprovacao-ceo`.
//   • `PILOTO_AUTOMATICO`  — a casa publica sem esperar clique nenhum. O
//                            "cliente" aqui é a decisão da própria agência de
//                            rodar sem revisão — por isso o carimbo se chama
//                            `regra-da-marca:piloto_automatico`, nunca `client:`.
//   • `SEMANAL`            — "silêncio publica": se ninguém pedir ajuste até o
//                            fim da janela, a semana sai. O carimbo é
//                            `regra-da-marca:silencio_publica`.
//   • `MENSAL`             — o mesmo silêncio, em janela mensal.
//
// ─── POR QUE ESTES CARIMBOS NÃO SÃO `client:` ────────────────────────────────
//
// `client:` significa UMA coisa nesta casa desde 15/08/2026: alguém clicou no
// portal, com token validado (ver `autoria-da-aprovacao.ts`). Uma aprovação por
// REGRA nunca teve esse clique — gravá-la como `client:` seria inventar a mesma
// mentira que o carimbo seco "cliente" já contou uma vez (nenhuma prova de quem
// decidiu). Por isso cada modo tem a PRÓPRIA grafia, e a trava de publicação
// (`trava-de-publicacao.ts`) só aceita o carimbo de regra QUANDO o modo que ele
// declara é o modo EM VIGOR da marca, na data da peça. Modo trocado depois que
// o carimbo foi gravado não revalida o carimbo — ele simplesmente para de valer.
//
// ─── A TROCA DE MODO NUNCA MUDA O CICLO EM CURSO ─────────────────────────────
//
// Uma marca em `SEMANAL` na semana corrente não vira `APROVACAO_CEO` no meio da
// semana só porque alguém mudou a configuração às 15h de quarta — isso deixaria
// peças já emitidas sob um modo sendo avaliadas por outro. A troca fica
// PENDENTE (`Client.modoPendente` + `modoPendenteVigenteEm`) e só passa a valer
// no INÍCIO do próximo ciclo: próxima segunda 00:00 (Brasília) para
// SEMANAL/PILOTO_AUTOMATICO/APROVACAO_CEO, dia 1 do mês seguinte para MENSAL.
//
// ─── FAIL-CLOSED, COMO TODA TRAVA DESTA CASA ─────────────────────────────────
//
// Modo desconhecido no banco (linha corrompida, valor de uma versão futura que
// este deploy não conhece) cai em `APROVACAO_CEO` — o mais conservador, nunca
// o mais permissivo. E `APROVACAO_CEO` é também o único modo que NENHUMA marca
// nova pula: `solicitarTrocaDeModo` recusa sair dele antes de
// `primeiraSemanaAprovadaEm` — sem isso, uma marca cadastrada às pressas
// "escolheria" publicar sozinha antes de qualquer humano ter visto uma peça.

import "server-only";

import { prisma } from "@/lib/db/client";
import { agendarPecasAprovadas } from "@/lib/agency/esteira/publicacao";
import { DEPARTAMENTO } from "@/lib/agency/esteira/cards-de-aprovacao";
import { lerPacote } from "@/lib/agency/esteira/pacote-da-marca";

/** A lista fechada. Todo leitor de `Client.modoAprovacao` passa por aqui —
 *  nunca compara a string à mão, porque a lista só existe neste arquivo. */
export type ModoAprovacao =
  | "APROVACAO_CEO"
  | "PILOTO_AUTOMATICO"
  | "SEMANAL"
  | "MENSAL";

export const MODOS_DE_APROVACAO: readonly ModoAprovacao[] = [
  "APROVACAO_CEO",
  "PILOTO_AUTOMATICO",
  "SEMANAL",
  "MENSAL",
];

/** O modo de toda marca nova, e o fail-closed de qualquer valor desconhecido. */
export const MODO_INICIAL: ModoAprovacao = "APROVACAO_CEO";

function ehModoValido(v: string | null | undefined): v is ModoAprovacao {
  return !!v && (MODOS_DE_APROVACAO as readonly string[]).includes(v);
}

/**
 * O modo QUE VALE agora — o de hoje, ou o pendente se já chegou a vigência dele.
 *
 * `em` nunca é "agora" implícito: quem chama decide se está perguntando pela
 * data de HOJE ou pela data AGENDADA da peça (a trava de publicação usa a
 * segunda — o modo que vale é o da data em que a peça deveria sair, não o do
 * instante em que alguém aperta o botão).
 */
export function modoEmVigor(
  c: { modoAprovacao: string; modoPendente: string | null; modoPendenteVigenteEm: Date | null },
  em: Date,
): ModoAprovacao {
  if (c.modoPendente && c.modoPendenteVigenteEm && em.getTime() >= c.modoPendenteVigenteEm.getTime()) {
    return ehModoValido(c.modoPendente) ? c.modoPendente : MODO_INICIAL;
  }
  return ehModoValido(c.modoAprovacao) ? c.modoAprovacao : MODO_INICIAL;
}

// ─── DATA EM BRASÍLIA, SEM DEPENDER DE FUSO DO PROCESSO ─────────────────────
//
// Brasil aboliu o horário de verão em 2019 — América/São_Paulo é UTC-3 fixo,
// hoje e para o horizonte desta régua. Por isso um offset fixo é honesto, e não
// o atalho que quebraria em outubro: não há mais "outubro" que muda o offset.
const OFFSET_BRASILIA_MS = 3 * 60 * 60 * 1000;

/** O Date deslocado para que os getters `UTC*` leiam o relógio de Brasília. */
function comoBrasilia(data: Date): Date {
  return new Date(data.getTime() - OFFSET_BRASILIA_MS);
}

/** AAAA-MM-DD, no calendário de Brasília. `2026-10-01T02:00Z` (23h de
 *  29/09 em Brasília não — 23h de 30/09) vira `2026-09-30`. */
function dataBrasiliaISO(data: Date): string {
  const b = comoBrasilia(data);
  const y = b.getUTCFullYear();
  const m = String(b.getUTCMonth() + 1).padStart(2, "0");
  const d = String(b.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** 00:00 de Brasília do dia informado (calendário de Brasília), como instante
 *  UTC real — a diferença que faz `solicitarTrocaDeModo` gravar a vigência
 *  certa mesmo quando quem lê o campo está em outro fuso. */
function brasiliaMeiaNoiteParaUtc(y: number, mIndex0: number, d: number): Date {
  return new Date(Date.UTC(y, mIndex0, d, 3, 0, 0, 0));
}

function parseDataISO(s: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

/** 00:00 de Brasília do dia "AAAA-MM-DD", como instante UTC. `null` se a data
 *  não estiver no formato esperado — quem chama decide como recusar. */
export function inicioDoDiaBrasilia(dataISO: string): Date | null {
  const p = parseDataISO(dataISO);
  if (!p) return null;
  return brasiliaMeiaNoiteParaUtc(p.y, p.m - 1, p.d);
}

/** 23:59:59.999 de Brasília do dia "AAAA-MM-DD", como instante UTC. Calculado
 *  como "início do dia seguinte menos 1ms" — nunca aritmética de milissegundos
 *  espalhada pelos chamadores. */
export function fimDoDiaBrasilia(dataISO: string): Date | null {
  const p = parseDataISO(dataISO);
  if (!p) return null;
  const inicioDoProximoDia = brasiliaMeiaNoiteParaUtc(p.y, p.m - 1, p.d + 1);
  return new Date(inicioDoProximoDia.getTime() - 1);
}

const PREFIXO_REGRA = "regra-da-marca:";
const SUFIXO_PILOTO = "piloto_automatico";
const SUFIXO_SILENCIO = "silencio_publica";
/** CJ-J1 (28/09/2026): a regra "paga + sem_risco → aprovação automática" do
 *  contrato City Jobs (docs/integracoes/cityjobs-contrato.md, §6.1). Vale em
 *  QUALQUER modo (não é regra do MODO da marca, é regra de uma FONTE
 *  EXTERNA específica) — por isso ela não segue o padrão "só vale se modo é
 *  X" dos outros carimbos de regra; vale se `contexto.clienteEhCityJobsComRegraLigada`
 *  disser sim. Ver `carimboValeNoModo` abaixo. */
const SUFIXO_CITYJOBS_PAGA_SEM_RISCO = "cityjobs_paga_sem_risco";
const PREFIXO_CEO = "ceo:";
/** O carimbo do CLIENTE (`autoria-da-aprovacao.PREFIXO_DO_CLIENTE`) — repetido
 *  aqui só como STRING, nunca importado: importar criaria uma dependência de
 *  `esteira/modo-de-aprovacao` para dentro de um módulo PURO que a trava de
 *  publicação carrega no caminho mais quente da casa. */
const PREFIXO_CLIENTE = "client:";

/** O carimbo do PILOTO AUTOMÁTICO: a própria casa decidiu publicar sem clique
 *  nenhum, e o carimbo diz exatamente isso — nunca `client:`. */
export function carimboDoModo(modo: "PILOTO_AUTOMATICO", data: Date): string {
  return `${PREFIXO_REGRA}${SUFIXO_PILOTO}@${dataBrasiliaISO(data)}`;
}

/** O carimbo do SILÊNCIO: a janela (semanal ou mensal) passou sem pedido de
 *  ajuste, e a régua da casa decidiu que isso vale como aprovação. */
export function carimboDoSilencio(data: Date): string {
  return `${PREFIXO_REGRA}${SUFIXO_SILENCIO}@${dataBrasiliaISO(data)}`;
}

/** O carimbo do CITY JOBS: a peça chegou "paga" + "sem_risco" de uma fonte
 *  externa, e o contrato (§6.1) diz que isso aprova sozinho — SÓ para o
 *  cliente City Jobs, e SÓ com a regra ligada no pacote dele (ver
 *  `clienteEhCityJobsComRegraLigada` abaixo). */
export function carimboDoCityJobsPagaSemRisco(data: Date): string {
  return `${PREFIXO_REGRA}${SUFIXO_CITYJOBS_PAGA_SEM_RISCO}@${dataBrasiliaISO(data)}`;
}

/**
 * O CLIENTE É O CITY JOBS, E A REGRA ESTÁ LIGADA NO PACOTE DELE?
 *
 * TRAVA, não aviso (ordem da ficha CJ-J1): as duas metades são checadas
 * contra o BANCO, nunca contra o que o corpo da requisição afirma de si
 * mesmo. `CITYJOBS_CLIENT_ID` ausente é fail-closed — sem ele, NENHUM
 * cliente passa por esta trava, mesmo que o pacote declare a flag.
 *
 * Erro de leitura (banco fora do ar, pacote ilegível) também é `false` — a
 * mesma régua fail-closed de todo o resto deste arquivo.
 */
export async function clienteEhCityJobsComRegraLigada(
  clientId: string,
  env: Record<string, string | undefined> = process.env,
): Promise<boolean> {
  const cityJobsClientId = (env.CITYJOBS_CLIENT_ID ?? "").trim();
  if (!cityJobsClientId || clientId !== cityJobsClientId) return false;

  try {
    const cliente = await prisma.client.findUnique({ where: { id: clientId }, select: { pacoteJson: true } });
    if (!cliente) return false;
    const lido = lerPacote(cliente.pacoteJson);
    return lido.ok && lido.pacote.cityJobsPagaSemRiscoAutoAprovacao === true;
  } catch {
    return false;
  }
}

/** O carimbo do CEO: ele aprovou, com nome — pelo `userId` da sessão, nunca
 *  pelo que o corpo da requisição declarar. */
export function carimboDoCeo(userId: string, data: Date): string {
  return `${PREFIXO_CEO}${userId}@${dataBrasiliaISO(data)}`;
}

/**
 * `true` quando o `SocialPost.scriptJson` carrega a marca de uma FONTE
 * EXTERNA (J4, 28/09/2026 — hoje só City Jobs, `lib/integracoes/cityjobs/
 * posts.ts`, que grava `{"origem":"cityjobs",...}` na criação). Função PURA,
 * sem banco — lida aqui e em `semana-editorial.ts` (para `aplicarSilencioSemanal`
 * NUNCA varrer uma peça que não passa pela rotina editorial da casa).
 */
export function ehPostDeFonteExterna(scriptJson: string | null | undefined): boolean {
  try {
    const o = scriptJson ? (JSON.parse(scriptJson) as Record<string, unknown>) : null;
    return !!o && typeof o.origem === "string" && o.origem.trim().length > 0;
  } catch {
    return false;
  }
}

/**
 * A MESMA peça, e além disso `risco:"com_risco"` — a combinação que NENHUM
 * carimbo de REGRA (silêncio, piloto) pode aprovar sozinho (Achado 1,
 * Q8-qualidade, 28/09/2026: o contrato §6.1 promete revisão humana para
 * `com_risco`, "com qualquer prioridade", sem exceção). Só aprovação humana
 * (`client:`/`ceo:`) libera. Ver `carimboValeNoModo`.
 */
export function ehPostDeFonteExternaComRisco(scriptJson: string | null | undefined): boolean {
  try {
    const o = scriptJson ? (JSON.parse(scriptJson) as Record<string, unknown>) : null;
    return !!o && typeof o.origem === "string" && o.origem.trim().length > 0 && o.risco === "com_risco";
  } catch {
    return false;
  }
}

/**
 * ESTE CARIMBO VALE NESTE MODO?
 *
 * Chamada pela trava de publicação (e por `registrarAprovacaoPorRegra` antes de
 * gravar). Fail-closed: grafia desconhecida, ou carimbo do modo errado para o
 * modo em vigor, é `false` — nunca "deixa passar por dúvida".
 *
 * `client:` continua valendo em QUALQUER modo: é o cliente decidindo, e o
 * cliente pode sempre decidir por conta própria, mesmo numa marca em piloto
 * automático (ela não tira o direito do cliente de agir; só dispensa a espera
 * por ele).
 *
 * `contexto` é opcional. `clienteEhCityJobsComRegraLigada` serve SÓ ao carimbo
 * do City Jobs. `pecaEhFonteExternaComRisco` (J4, 28/09/2026) é a TRAVA do
 * Achado 1: quando `true`, os carimbos de PILOTO e de SILÊNCIO nunca valem,
 * qualquer que seja o modo — a peça só sai com `client:` ou `ceo:` (aprovação
 * humana de verdade). Sem isto, uma vaga `com_risco` do City Jobs numa marca em
 * SEMANAL/MENSAL/PILOTO_AUTOMATICO seria aprovada por regra, sem nenhum humano
 * ter visto — exatamente o que o contrato promete NUNCA acontecer.
 *
 * Os outros dois carimbos de regra (o do City Jobs "paga+sem_risco" e o do CEO)
 * não passam por esta trava: o primeiro já é condicionado a `sem_risco` na
 * própria criação da peça (`posts.ts`); o segundo É a aprovação humana.
 */
export function carimboValeNoModo(
  carimbo: string,
  modo: ModoAprovacao,
  contexto?: { clienteEhCityJobsComRegraLigada?: boolean; pecaEhFonteExternaComRisco?: boolean },
): boolean {
  const cru = (carimbo ?? "").trim();
  if (!cru) return false;

  if (cru.toLowerCase().startsWith(PREFIXO_CLIENTE) && cru.length > PREFIXO_CLIENTE.length) {
    return true;
  }
  if (cru.startsWith(`${PREFIXO_REGRA}${SUFIXO_PILOTO}@`)) {
    // TRAVA (Achado 1, J4): piloto automático NUNCA aprova com_risco de fonte
    // externa — só aprovação humana.
    if (contexto?.pecaEhFonteExternaComRisco) return false;
    return modo === "PILOTO_AUTOMATICO";
  }
  if (cru.startsWith(`${PREFIXO_REGRA}${SUFIXO_SILENCIO}@`)) {
    // TRAVA (Achado 1, J4): idem — o silêncio do cliente nunca vale como sim
    // para uma vaga com_risco que ninguém revisou.
    if (contexto?.pecaEhFonteExternaComRisco) return false;
    // NÃO existe "silêncio publica" em APROVACAO_CEO — silêncio só vale para as
    // marcas que declararam viver de janela (semanal ou mensal).
    return modo === "SEMANAL" || modo === "MENSAL";
  }
  if (cru.startsWith(`${PREFIXO_REGRA}${SUFIXO_CITYJOBS_PAGA_SEM_RISCO}@`)) {
    // Vale em QUALQUER modo — é regra de MARCA (City Jobs), não regra do modo
    // de aprovação geral. Fail-closed: contexto ausente NUNCA vira permissão.
    return contexto?.clienteEhCityJobsComRegraLigada === true;
  }
  if (cru.startsWith(PREFIXO_CEO)) {
    return modo === "APROVACAO_CEO";
  }
  return false;
}

/**
 * GRAVA A APROVAÇÃO POR REGRA — e promove as peças pelo MESMO caminho que a
 * aprovação do cliente usa (`agendarPecasAprovadas`, que chama a única escrita
 * de "scheduled" da casa). Este módulo não inventa uma segunda promoção.
 *
 * Fail-closed peça por peça: se QUALQUER peça do lote não bate com o modo em
 * vigor NA DATA DELA, o lote inteiro é recusado — aprovar 9 de 10 peças e
 * silenciar a décima seria o mesmo defeito de "ausência não vira permissão",
 * ao contrário: sucesso parcial vira sucesso inteiro na tela de quem chamou.
 */
export async function registrarAprovacaoPorRegra(a: {
  workspaceId: string;
  clientId: string;
  postIds: string[];
  carimbo: string;
}): Promise<
  | { ok: true; approvalRequestId: string; agendados: number }
  | { ok: false; motivo: string }
> {
  const postIds = [...new Set((a.postIds ?? []).filter((id): id is string => typeof id === "string" && !!id.trim()))];
  if (postIds.length === 0) {
    return { ok: false, motivo: "postIds vazio — nenhuma peça para aprovar" };
  }
  if (!a.clientId) {
    return { ok: false, motivo: "clientId é obrigatório" };
  }
  const carimbo = (a.carimbo ?? "").trim();
  if (!carimbo) {
    return { ok: false, motivo: "carimbo vazio — aprovação por regra sem carimbo não é aprovação" };
  }

  const cliente = await prisma.client
    .findFirst({
      where: { id: a.clientId, workspaceId: a.workspaceId },
      select: { modoAprovacao: true, modoPendente: true, modoPendenteVigenteEm: true },
    })
    .catch(() => null);
  if (!cliente) {
    return { ok: false, motivo: "cliente não encontrado neste workspace — fail-closed, não gravo aprovação de dono incerto" };
  }

  const posts = await prisma.socialPost
    .findMany({
      where: { id: { in: postIds }, workspaceId: a.workspaceId, clientId: a.clientId },
      select: { id: true, scheduledFor: true, scriptJson: true },
    })
    .catch(() => null);
  if (posts === null) {
    return { ok: false, motivo: "não consegui ler as peças (banco indisponível) — fail-closed" };
  }
  if (posts.length !== postIds.length) {
    return { ok: false, motivo: "uma ou mais peças não pertencem a este cliente/workspace — nenhuma foi aprovada" };
  }

  const agora = new Date();
  // `clienteEhCityJobsComRegraLigada` é do CLIENTE — calculado UMA vez para o
  // lote inteiro (já conferido acima: `posts` só tem peças de `a.clientId`).
  // `pecaEhFonteExternaComRisco` (Achado 1, J4) é da PEÇA — reconferido em
  // cada volta do laço, porque um lote pode em tese misturar peças com
  // `scriptJson` diferentes, e "uma peça de risco escapou porque outra do
  // mesmo lote não era de risco" seria o mesmo defeito de fail-open, mascarado.
  const clienteEhCityJobs = await clienteEhCityJobsComRegraLigada(a.clientId);
  for (const post of posts) {
    const modo = modoEmVigor(cliente, post.scheduledFor ?? agora);
    const contexto = {
      clienteEhCityJobsComRegraLigada: clienteEhCityJobs,
      pecaEhFonteExternaComRisco: ehPostDeFonteExternaComRisco(post.scriptJson),
    };
    if (!carimboValeNoModo(carimbo, modo, contexto)) {
      return {
        ok: false,
        motivo:
          `O carimbo "${carimbo}" não vale no modo em vigor ("${modo}") na data da peça ${post.id} — ` +
          "esta marca não está neste modo nesta data. Nenhuma peça do lote foi aprovada.",
      };
    }
  }

  const registro = await prisma.approvalRequest.create({
    data: {
      clientId: a.clientId,
      department: DEPARTAMENTO,
      status: "approved",
      reviewedBy: carimbo,
      reviewedAt: agora,
      clientVisible: true,
      sourcePostIdsJson: JSON.stringify(postIds),
    },
  });

  const { agendados } = await agendarPecasAprovadas({ clientId: a.clientId, postIds });

  return { ok: true, approvalRequestId: registro.id, agendados };
}

/** Onde cai a vigência de uma troca — a hora exata em que o PRÓXIMO ciclo do
 *  modo DESTINO começa, em Brasília. */
function inicioDoProximoCiclo(novoModo: ModoAprovacao, agora: Date): Date {
  const b = comoBrasilia(agora);
  const y = b.getUTCFullYear();
  const m = b.getUTCMonth(); // 0-based
  const d = b.getUTCDate();

  if (novoModo === "MENSAL") {
    // Dia 1 do mês seguinte, em Brasília. `Date.UTC` normaliza mês 12 sozinho.
    return brasiliaMeiaNoiteParaUtc(y, m + 1, 1);
  }

  // Próxima segunda 00:00 de Brasília, SEMPRE no futuro (nunca "hoje", mesmo
  // que hoje já seja segunda): a troca vale do PRÓXIMO ciclo, nunca do atual.
  const diaDaSemana = b.getUTCDay(); // 0=domingo … 6=sábado
  let diasAteSegunda = (1 - diaDaSemana + 7) % 7;
  if (diasAteSegunda === 0) diasAteSegunda = 7;
  return brasiliaMeiaNoiteParaUtc(y, m, d + diasAteSegunda);
}

/**
 * PEDE A TROCA DE MODO. Nunca muda o ciclo em curso — grava `modoPendente` e
 * `modoPendenteVigenteEm`, e é `modoEmVigor` quem aplica a troca quando a data
 * chega.
 *
 * Recusa sair de `APROVACAO_CEO` antes de `primeiraSemanaAprovadaEm`: uma marca
 * que o master nunca aprovou nem uma vez não pode "escolher" publicar sozinha.
 */
export async function solicitarTrocaDeModo(a: {
  workspaceId: string;
  clientId: string;
  novoModo: ModoAprovacao;
  agora: Date;
}): Promise<{ ok: true; vigenteEm: Date } | { ok: false; motivo: string }> {
  if (!ehModoValido(a.novoModo)) {
    return { ok: false, motivo: `modo desconhecido: "${a.novoModo}"` };
  }

  const cliente = await prisma.client
    .findFirst({
      where: { id: a.clientId, workspaceId: a.workspaceId },
      select: { modoAprovacao: true, primeiraSemanaAprovadaEm: true },
    })
    .catch(() => null);
  if (!cliente) {
    return { ok: false, motivo: "cliente não encontrado neste workspace" };
  }

  const modoAtual = ehModoValido(cliente.modoAprovacao) ? cliente.modoAprovacao : MODO_INICIAL;
  if (modoAtual === "APROVACAO_CEO" && a.novoModo !== "APROVACAO_CEO" && !cliente.primeiraSemanaAprovadaEm) {
    return {
      ok: false,
      motivo:
        "esta marca ainda não teve a primeira semana aprovada pelo master em APROVACAO_CEO — " +
        "ela não pode sair deste modo antes de um humano ter visto e aprovado ao menos uma semana real.",
    };
  }

  const vigenteEm = inicioDoProximoCiclo(a.novoModo, a.agora);
  await prisma.client.update({
    where: { id: a.clientId },
    data: { modoPendente: a.novoModo, modoPendenteVigenteEm: vigenteEm },
  });

  return { ok: true, vigenteEm };
}

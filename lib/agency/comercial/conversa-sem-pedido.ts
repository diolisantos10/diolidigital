// O RASTRO DA CONVERSA QUE NÃO VIROU PEDIDO — o sexto "trava sem fechadura",
// e o primeiro que some com o CLIENTE em vez de com o código.
//
// ─── O DEFEITO, MEDIDO EM 27/08/2026 (NÃO PRESUMIDO) ────────────────────────
//
// O cliente 001 (Foocci) conversou com o SDR às 01:34, o escopo apareceu montado
// na tela, o SDR se despediu — e a produção não tem UMA linha dele. Medido com
// sessão de master: `GET /api/brain/client-requests` devolve 19 registros (teto
// de 100, lista inteira) e nenhum é Foocci; `clients`, `messages`,
// `deliverables`, `activity-events`, `financeiro` e `gasto-de-ia` também não.
//
// A causa tem duas metades, e as duas precisavam de conserto:
//
// 1. **O ESCOPO SÓ EXISTIA NO NAVEGADOR.** O único caminho que grava um
//    `ClientRequestDb` é o botão de enviar (`app/briefing/page.tsx:72`), e o
//    botão é travado por `canSubmitProposal` (`lib/agency/sdr-agent.ts:368`),
//    que exige nome, negócio, serviço e **zero perguntas obrigatórias em
//    aberto**. Conversa que morre antes disso não tem porta de gravação
//    NENHUMA: o escopo acumulado vive em estado de React e morre com a aba.
//    O servidor RECEBIA esse escopo a cada turno (`body.scope`, em
//    `app/api/sdr/chat/route.ts`) e o jogava fora.
//
// 2. **O TEXTO ERA GRAVADO ONDE, POR DESENHO, NINGUÉM OLHA.**
//    `registrarTurnoDoSdr` grava cada turno em `PortalMessage` — mas com
//    `readByTeam: true, readByClient: true`, e o comentário diz o porquê em voz
//    alta: *"nasce lida dos dois lados para não virar fila do PM nem alarme
//    falso do raio-x"*. Some-se a isso que **todo leitor de `PortalMessage`
//    filtra por `clientId` de cliente real ou por `clientRequestId`** — e um fio
//    `sdr:` sem pedido não é lido por nada. A decisão 2 estava certa para o
//    fio que VIRA pedido, e é exatamente o que apaga o fio que NÃO vira.
//
// Resultado: a casa guardava o texto num lugar sem dono e sem alarme, e
// descartava o escopo em silêncio. **Coluna gravada não é cliente informado;
// conversa sem dono é cliente perdido.**
//
// ─── A RÉGUA QUE ESTE MÓDULO IMPLEMENTA ─────────────────────────────────────
//
// *Nenhuma conversa de cliente pode terminar sem deixar rastro recuperável.*
// Se o escopo não estiver completo, a casa **guarda o que tem** e **para com
// dono e próxima ação** — nunca descarta em silêncio.
//
// ─── POR QUE `ActivityEvent`, E NÃO TABELA NOVA ─────────────────────────────
//
// `ActivityEvent` já é onde esta casa registra parada com dono — é dele que sai
// o `caminho_automatico_parou` que o diário do piloto lê. Ele tem `type`,
// `clientId`, `workspaceId` e `timestamp` como COLUNAS, e o índice
// `@@index([type, timestamp])` já existe no schema. Zero migração num volume
// SQLite vivo, e a porta de leitura (`GET /api/activity-events`) já está no ar.
//
// ⚠️ O escopo viaja como JSON dentro de `message`, e isso NÃO é o blob que esta
// casa já condenou. A condenação (ver `ClientRequestDb.chaveDoProspect`) é sobre
// **indexar ou agrupar por dentro de um JSON no SQLite**, que o SQLite não faz.
// Aqui não se busca por dentro de nada: a busca é por `type` e por `clientId`,
// as duas colunas de verdade e as duas indexadas. O JSON é carga, não chave.
//
// ─── UM RASTRO POR FIO, NÃO UM POR TURNO ────────────────────────────────────
//
// Uma conversa de vinte turnos deixaria vinte linhas contando a mesma história
// com escopos cada vez mais completos, e quem lesse teria de adivinhar qual é a
// boa. O rastro é ATUALIZADO no lugar: o `timestamp` passa a ser "quando ela
// parou", que é a informação que decide quem se atende primeiro.

import { prisma } from "@/lib/db/client";
import { fioDaConversa } from "@/lib/agency/comercial/registro-da-conversa";

/** O tipo do evento. Uma constante porque é lido em três lugares, e verdade
 *  escrita em três lugares já está errada em dois. */
export const TIPO_CONVERSA_SEM_PEDIDO = "conversa_sem_pedido";

/** Teto do JSON guardado. Escopo de briefing real vive na casa das unidades de
 *  KB; 20 mil caracteres é uma ordem de grandeza acima do maior já visto, e o
 *  alvo do teto é abuso da rota pública, não cliente. */
const TETO_DA_CARGA = 20_000;

/** O contato como a porta o declara. Nunca deduzido de arroba nem de nome de
 *  negócio — a inferência que esta casa proíbe. */
export type ContatoDoRastro = {
  nome?: string;
  email?: string;
  whatsapp?: string;
};

export type RastroDaConversa = {
  /** O fio (`sdr:...`), já higienizado. Nunca o id cru do navegador. */
  fio: string;
  /** O que o cliente já tinha contado quando a conversa parou. */
  escopo: Record<string, unknown>;
  /** `null` quando a pessoa não declarou canal — ausência, não erro. */
  contato: ContatoDoRastro | null;
  /** Quantos turnos a conversa teve. Um turno é curiosidade; doze é um lead. */
  turnos: number;
  /** Quando ela parou. */
  paradaEm: Date;
};

/** O que sai gravado no `message`. Formato próprio e versionado: um leitor de
 *  amanhã precisa saber que forma está lendo antes de confiar nela. */
type CargaDoRastro = {
  v: 1;
  escopo: Record<string, unknown>;
  contato: ContatoDoRastro | null;
  turnos: number;
};

/** Só os três campos que a PESSOA declara. Copiar o objeto inteiro do corpo da
 *  rota pública seria deixar o cliente escolher o que a casa guarda. */
function contatoLimpo(bruto: unknown): ContatoDoRastro | null {
  if (!bruto || typeof bruto !== "object" || Array.isArray(bruto)) return null;
  const b = bruto as Record<string, unknown>;
  const texto = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, 200) : "");
  const contato: ContatoDoRastro = {};
  if (texto(b.nome))     contato.nome     = texto(b.nome);
  if (texto(b.email))    contato.email    = texto(b.email);
  if (texto(b.whatsapp)) contato.whatsapp = texto(b.whatsapp);
  return Object.keys(contato).length > 0 ? contato : null;
}

/**
 * GUARDA O QUE TEM. Chamado a cada turno do SDR, com o escopo acumulado.
 *
 * Não decide se a conversa foi abandonada — ninguém sabe isso no momento do
 * turno, e esperar para ter certeza é exatamente como o escopo se perdia. Grava
 * sempre; quem resolve o rastro é `resolverRastroDaConversa`, quando o pedido
 * nasce de verdade.
 *
 * ⚠️ **NUNCA LANÇA.** Rastro é nosso, a conversa é do cliente — a mesma decisão
 * 3 de `registro-da-conversa.ts`. Um erro de banco não pode transformar uma
 * resposta pronta em tela de erro para o prospect. Devolve `false` e segue.
 */
export async function guardarRastroDaConversa(input: {
  sessionId: unknown;
  /** `null` quando a rota pública não resolveu dono — ver a guarda abaixo. */
  workspaceId: string | null;
  escopo: unknown;
  contato?: unknown;
  turnos?: number;
}): Promise<boolean> {
  const fio = fioDaConversa(input.sessionId);

  // SEM DONO, NÃO GRAVA. `workspaceDaRotaPublica` devolve `null` quando não há
  // workspace resolvido, e `ActivityEvent.workspaceId` é obrigatório no schema.
  //
  // A saída errada seria carimbar um workspace qualquer para a linha caber: o
  // rastro apareceria na lista de uma agência que nunca falou com essa pessoa.
  // Falha fechada é a mesma escolha que o teto de gasto faz três linhas adiante
  // na rota — sem dono, não age. E o custo aqui é o de antes deste conserto,
  // não um custo novo.
  if (!input.workspaceId) return false;

  // Escopo vazio não é rastro: uma conversa em que a pessoa não contou NADA não
  // tem o que recuperar, e uma linha por visitante que só disse "oi" enche a
  // lista de quem precisa ser atendido com quem não pediu nada. Ausência de
  // informação não é informação — nos dois sentidos.
  const escopo =
    input.escopo && typeof input.escopo === "object" && !Array.isArray(input.escopo)
      ? (input.escopo as Record<string, unknown>)
      : {};
  if (Object.keys(escopo).length === 0) return false;

  const carga: CargaDoRastro = {
    v: 1,
    escopo,
    contato: contatoLimpo(input.contato),
    turnos: typeof input.turnos === "number" && input.turnos > 0 ? Math.floor(input.turnos) : 1,
  };
  const message = JSON.stringify(carga).slice(0, TETO_DA_CARGA);

  try {
    // Um por fio. `findFirst` + `update`/`create` em vez de `upsert` porque
    // `(type, clientId)` não é chave única no schema, e inventar uma exigiria
    // migração num volume vivo para resolver um problema que duas consultas
    // sobre índice já resolvem.
    const existente = await prisma.activityEvent.findFirst({
      where: { type: TIPO_CONVERSA_SEM_PEDIDO, clientId: fio },
      select: { id: true },
    });
    if (existente) {
      await prisma.activityEvent.update({
        where: { id: existente.id },
        data: { message, timestamp: new Date() },
      });
    } else {
      await prisma.activityEvent.create({
        data: {
          workspaceId: input.workspaceId,
          type: TIPO_CONVERSA_SEM_PEDIDO,
          clientId: fio,
          message,
        },
      });
    }
    return true;
  } catch (e) {
    console.error(
      `[conversa-sem-pedido] rastro não guardado: ${e instanceof Error ? e.message : String(e)}`,
    );
    return false;
  }
}

/**
 * A CONVERSA VIROU PEDIDO — o rastro deixa de ser uma parada.
 *
 * Sem isto a lista mentiria para cima: toda conversa bem-sucedida apareceria
 * para sempre como abandonada, e uma lista que acusa o que está certo é uma
 * lista que se aprende a ignorar — o mesmo alarme cego do `cron-execute`.
 *
 * Não lança: um rastro que sobra é ruído visível, e ruído visível é muito menos
 * caro que um briefing perdido. Fail-open aqui é a escolha certa e é a exceção.
 */
export async function resolverRastroDaConversa(sessionId: unknown): Promise<number> {
  const fio = fioDaConversa(sessionId);
  // `fioDaConversa` devolve `sdr:sem-sessao` para entrada vazia. Apagar por esse
  // fio limparia o rastro de TODAS as conversas sem id de sessão de uma vez —
  // um envio sem sessão apagaria a parada de outra pessoa.
  if (fio.endsWith("sem-sessao")) return 0;
  try {
    const r = await prisma.activityEvent.deleteMany({
      where: { type: TIPO_CONVERSA_SEM_PEDIDO, clientId: fio },
    });
    return r.count;
  } catch (e) {
    console.error(
      `[conversa-sem-pedido] rastro não resolvido: ${e instanceof Error ? e.message : String(e)}`,
    );
    return 0;
  }
}

/**
 * AS CONVERSAS QUE PARARAM — com dono e próxima ação.
 *
 * Ordenadas pela mais recente: uma conversa de dez minutos atrás ainda dá para
 * salvar; uma de dez dias virou história.
 */
export async function conversasSemPedido(
  workspaceId: string,
  teto = 50,
): Promise<RastroDaConversa[]> {
  const linhas = await prisma.activityEvent.findMany({
    where: { type: TIPO_CONVERSA_SEM_PEDIDO, workspaceId },
    orderBy: { timestamp: "desc" },
    take: Math.min(teto, 200),
    select: { clientId: true, message: true, timestamp: true },
  });

  const rastros: RastroDaConversa[] = [];
  for (const l of linhas) {
    let carga: CargaDoRastro | null = null;
    try {
      const bruto = JSON.parse(l.message) as unknown;
      if (bruto && typeof bruto === "object" && (bruto as CargaDoRastro).v === 1) {
        carga = bruto as CargaDoRastro;
      }
    } catch {
      // Carga ilegível não derruba a lista inteira: uma linha corrompida
      // esconderia todas as outras conversas perdidas, que é o contrário do
      // motivo desta função existir.
      carga = null;
    }
    if (!carga) continue;
    rastros.push({
      fio: l.clientId ?? "",
      escopo: carga.escopo ?? {},
      contato: carga.contato ?? null,
      turnos: carga.turnos ?? 1,
      paradaEm: l.timestamp,
    });
  }
  return rastros;
}

/**
 * A PRÓXIMA AÇÃO, derivada do que o rastro TEM — nunca uma frase constante.
 *
 * Uma frase fixa ("procurar o cliente") é a mesma para quem deixou e-mail e para
 * quem não deixou nada, e as duas exigem coisas opostas de quem vai atender.
 */
export function proximaAcaoDoRastro(rastro: RastroDaConversa): string {
  const c = rastro.contato;
  if (c?.email || c?.whatsapp) {
    const canal = c.email ? "e-mail" : "WhatsApp";
    return `Retomar por ${canal}: a conversa parou com escopo pela metade e o canal está declarado.`;
  }
  if (c?.nome) {
    return "Sem canal declarado — só o nome. Não há como retomar sozinho; depende de a pessoa voltar.";
  }
  return "Sem contato nenhum. O rastro serve para medir quantas conversas morrem na sala, não para retomar esta.";
}

// A CASA DIZ DE QUEM É UMA CONVERSA ÓRFÃ — o lado do banco.
//
// ═══ O QUE FALTAVA, DECLARADO PELO AUTOR DA PROMOÇÃO ════════════════════════
//
// `promover-conversas-paradas.ts` só age sobre rastros com `clienteDoConvite`.
// O rastro do FOOCCI (`cmtc145qf007a0xo4txmjss11`) é **v1**: ele não sabe de
// quem é. O cliente contou o briefing inteiro em 27/08 e espera o orçamento há
// mais de 24 horas — e fazer ele repetir tudo é inaceitável.
//
// Faltava a casa poder **DIZER** de quem é o rastro. Não deduzir: declarar, por
// um operador com sessão de agência, que responde pelo ato. A régua pura de
// leitura vive em `dono-do-rastro.ts`; aqui está a ESCRITA, com as travas.
//
// ═══ AS TRAVAS, E POR QUE CADA UMA ═════════════════════════════════════════
//
//  1. ⛔ **NADA DE DEDUÇÃO.** Este arquivo não olha e-mail, nome de negócio nem
//     texto de conversa. Recebe um `clientId` que veio de um operador com
//     sessão e um `atribuidoPor` que veio da SESSÃO — nunca do corpo.
//  2. **O cliente tem de EXISTIR, e no MESMO workspace da sessão.** Sem esta
//     conferência, um id digitado errado viraria um pedido para um cliente que
//     não existe, ou — pior — atravessaria a fronteira de inquilino que o resto
//     da casa defende.
//  3. **O rastro tem de existir, e no mesmo workspace.** Atribuir um fio que
//     ninguém conversou é criar dono para uma conversa inventada.
//  4. ⛔ **REATRIBUIÇÃO SILENCIOSA NÃO ACONTECE.** Se o rastro JÁ virou pedido
//     (`ClientRequestDb.fioDaConversa`), a resposta é recusa, não sobrescrita:
//     mudar o dono depois mudaria a história de uma produção que já correu. E
//     se o rastro já tem atribuição para OUTRO cliente, também recusa — quem
//     quiser corrigir tem de ver o erro na tela primeiro. Reatribuir para o
//     MESMO cliente é idempotente, e devolve `jaExistia`.
//  5. **FAIL-CLOSED em toda leitura.** Banco fora do ar → recusa com motivo,
//     jamais um "ok" otimista. *"Não sei" nunca vira "pode ir".*
//
// ═══ A TRILHA, E POR QUE ELA É ESCRITA DUAS VEZES ══════════════════════════
//
// A atribuição vai (a) dentro da carga do rastro, que é o que a promoção lê; e
// (b) numa linha própria de `ActivityEvent` (`conversa_atribuida`), que é o que
// SOBREVIVE — porque o rastro é APAGADO no instante em que vira pedido
// (`resolverRastroPeloFio`). Sem a segunda escrita, a resposta para "por que
// este pedido é do FOOCCI?" morreria junto com o rastro. E o promotor copia a
// mesma trilha para dentro do `briefingJson` do pedido: três lugares, e o
// pedido carrega a sua própria certidão.
//
// ⚠️ A linha de trilha tem `type = "conversa_atribuida"`, NÃO
// `"conversa_sem_pedido"` — de propósito. Se compartilhasse o tipo, ela
// apareceria na lista de conversas paradas como se fosse uma conversa perdida,
// e a fila de quem atende encheria de ecos do próprio trabalho.

import { prisma } from "@/lib/db/client";
import { TIPO_CONVERSA_SEM_PEDIDO, lerCargaDoRastro } from "@/lib/agency/comercial/conversa-sem-pedido";
import { atribuicaoValida, type AtribuicaoDaCasa } from "@/lib/agency/comercial/dono-do-rastro";

/** O tipo da linha de trilha. Constante porque é lida em mais de um lugar. */
export const TIPO_CONVERSA_ATRIBUIDA = "conversa_atribuida";

/** Mesmo teto da carga do rastro — a carga cresce com a atribuição e o corte
 *  tem de ser o mesmo dos dois lados, senão um JSON truncado vira ilegível. */
const TETO_DA_CARGA = 20_000;

export type RecusaDaAtribuicao =
  | "dados_incompletos"
  | "cliente_inexistente"
  | "rastro_inexistente"
  | "rastro_ilegivel"
  | "ja_virou_pedido"
  | "ja_atribuida_a_outro"
  | "leitura_falhou"
  | "escrita_falhou";

export type ResultadoDaAtribuicao =
  | { ok: true; atribuicao: AtribuicaoDaCasa; jaExistia: boolean }
  | { ok: false; recusa: RecusaDaAtribuicao; motivo: string };

function recusar(recusa: RecusaDaAtribuicao, motivo: string): ResultadoDaAtribuicao {
  return { ok: false, recusa, motivo };
}

const texto = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/**
 * ATRIBUI UM RASTRO ÓRFÃO A UM CLIENTE — o ato declarado pela casa.
 *
 * Nunca lança: é chamada de dentro de uma rota, e o operador do outro lado
 * precisa de um motivo em texto, não de um 500 sem explicação.
 */
export async function atribuirRastroAoCliente(input: {
  /** O fio (`sdr:...`), como a lista de conversas paradas o mostra. */
  fio: string;
  /** De quem a casa está dizendo que é a conversa. */
  clientId: string;
  /** O `userId` da SESSÃO. ⛔ NUNCA do corpo da requisição. */
  atribuidoPor: string;
  /** O workspace da SESSÃO. A fronteira de inquilino dos dois lados. */
  workspaceId: string;
  agora?: Date;
}): Promise<ResultadoDaAtribuicao> {
  const fio = texto(input.fio);
  const clientId = texto(input.clientId);
  const atribuidoPor = texto(input.atribuidoPor);
  const workspaceId = texto(input.workspaceId);
  const agora = input.agora ?? new Date();

  // Nenhum campo com valor padrão. Padrão em campo de dono é a forma silenciosa
  // de dar uma conversa a quem não é dela.
  if (!fio || !clientId || !atribuidoPor || !workspaceId) {
    return recusar("dados_incompletos", "Informe o fio da conversa e o cliente. O autor sai da sessão.");
  }
  // `fioDaConversa` devolve `sdr:sem-sessao` para entrada vazia — um fio
  // coletivo, que não é conversa de ninguém em particular.
  if (fio.endsWith("sem-sessao")) {
    return recusar("rastro_inexistente", "Este fio não identifica uma conversa: é o balde das sessões sem id.");
  }

  try {
    // ── 1. O CLIENTE EXISTE, E É DESTA CASA ──────────────────────────────
    const cliente = await prisma.client.findUnique({
      where: { id: clientId },
      select: { id: true, name: true, workspaceId: true },
    });
    if (!cliente || cliente.workspaceId !== workspaceId) {
      return recusar("cliente_inexistente", "Cliente não encontrado neste workspace.");
    }

    // ── 2. O RASTRO JÁ VIROU PEDIDO? ENTÃO A HISTÓRIA ESTÁ ESCRITA ───────
    // Esta é a única checagem prévia deste conserto, e ela NÃO substitui trava
    // nenhuma: o índice único de `fioDaConversa` continua sendo quem impede o
    // pedido dobrado. O que se impede aqui é outra coisa — reescrever o dono de
    // uma produção que já correu, o que nenhum índice pegaria.
    const pedido = await prisma.clientRequestDb.findFirst({
      where: { fioDaConversa: fio },
      select: { id: true, clientId: true },
    });
    if (pedido) {
      return recusar(
        "ja_virou_pedido",
        `Esta conversa já virou o pedido ${pedido.id}. Reatribuir agora mudaria o dono de uma produção ` +
          `que já correu — se o dono está errado, o conserto é no pedido, com registro próprio.`,
      );
    }

    // ── 3. O RASTRO EXISTE, E É DESTA CASA ───────────────────────────────
    const linha = await prisma.activityEvent.findFirst({
      where: { type: TIPO_CONVERSA_SEM_PEDIDO, clientId: fio, workspaceId },
      select: { id: true, message: true },
    });
    if (!linha) {
      return recusar("rastro_inexistente", "Não há conversa parada com este fio neste workspace.");
    }

    const carga = lerCargaDoRastro(linha.message);
    if (!carga) {
      // Carga ilegível é "não sei o que estou reescrevendo". Sobrescrever seria
      // apagar o escopo do cliente — o próprio bem que o rastro existe para
      // guardar.
      return recusar("rastro_ilegivel", "O registro desta conversa está ilegível; não se reescreve o que não se lê.");
    }

    // ── 4. NADA DE REATRIBUIÇÃO SILENCIOSA ───────────────────────────────
    const anterior = atribuicaoValida(carga.atribuicao);
    if (anterior && anterior.clientId !== clientId) {
      return recusar(
        "ja_atribuida_a_outro",
        `Esta conversa já foi atribuída ao cliente ${anterior.clientId} por ${anterior.atribuidoPor} ` +
          `em ${anterior.atribuidoEm}. Trocar o dono em silêncio não acontece.`,
      );
    }
    if (anterior) {
      // Mesmo cliente: o operador clicou duas vezes, ou duas abas. Nada muda, e
      // o ato ORIGINAL é preservado — inclusive a data, que é a que vale.
      return { ok: true, atribuicao: anterior, jaExistia: true };
    }

    const atribuicao: AtribuicaoDaCasa = {
      clientId,
      atribuidoPor,
      atribuidoEm: agora.toISOString(),
      fio,
    };

    // ── 5. A ESCRITA: a carga do rastro, e a trilha que sobrevive a ele ──
    const novaCarga = { ...carga, v: 3 as const, atribuicao };
    await prisma.activityEvent.update({
      where: { id: linha.id },
      // ⚠️ `timestamp` NÃO é tocado. Ele significa "quando a conversa parou", e
      // é por ele que a fila de quem atende se ordena. Carimbar a hora da
      // atribuição aqui jogaria uma conversa de ontem para o topo da lista de
      // hoje, e a ordem que decide quem se atende primeiro passaria a medir o
      // trabalho da casa em vez da espera do cliente.
      data: { message: JSON.stringify(novaCarga).slice(0, TETO_DA_CARGA) },
    });

    // A certidão. `clientId` aqui é o CLIENTE REAL (não o fio), para que a
    // linha do tempo do cliente mostre o ato — e o `message` guarda o fio de
    // origem, que é a ponta solta que alguém vai puxar daqui a seis meses.
    await prisma.activityEvent.create({
      data: {
        workspaceId,
        type: TIPO_CONVERSA_ATRIBUIDA,
        clientId,
        message: JSON.stringify({ v: 1, ...atribuicao, clienteNome: cliente.name }),
      },
    });

    return { ok: true, atribuicao, jaExistia: false };
  } catch (e) {
    // Leitura ou escrita que falha NÃO vira "ok". Sem esta linha, um banco fora
    // do ar devolveria sucesso e o operador iria embora achando que a conversa
    // do cliente tem dono.
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[atribuir-conversa-orfa] ${fio}: ${msg}`);
    return recusar("leitura_falhou", `Não foi possível concluir a atribuição: ${msg}`);
  }
}

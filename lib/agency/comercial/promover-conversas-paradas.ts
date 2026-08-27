// A CONVERSA PARADA DO PARCEIRO VIRA PEDIDO SOZINHA — a fechadura da décima
// trava desta casa.
//
// ═══ O DEFEITO, MEDIDO EM PRODUÇÃO (27/08/2026) ═════════════════════════════
//
// O primeiro cliente real da agência (FOOCCI, `cmtc145qf007a0xo4txmjss11`)
// conversou com o SDR às 01:34 e de novo às 13:43. Contou tudo o que a casa
// precisava. **E nenhum pedido nasceu.** A conversa das 13:43 travou na pergunta
// de verba mensal — a pergunta que, para um PARCEIRO, a casa não deveria nem
// fazer. Resultado: 24 horas de atraso no orçamento de um cliente que já tinha
// entregado o briefing inteiro.
//
// Desde 27/08 essas conversas deixam rastro (`conversa-sem-pedido.ts`, lido por
// `GET /api/agency/conversas-sem-pedido`). O rastro existia e **ninguém agia
// sobre ele**: a casa passou a GRAVAR o cliente perdido e continuou PERDENDO
// ele. É a décima ocorrência da família "a trava construída sem a fechadura".
// *Coluna gravada não é cliente informado.*
//
// ═══ O QUE ESTE ARQUIVO FAZ ════════════════════════════════════════════════
//
// A cada batida do relógio (`despertador.ts`, perna `conversa-recuperada`),
// varre os rastros e promove a pedido as conversas que cumprem TRÊS condições
// ao mesmo tempo — nunca duas:
//
//   1. **Parceria VIVA**, do cliente que a casa sabe ser o dono do rastro. Só
//      nesta primeira volta: o parceiro é quem a casa já autorizou
//      nominalmente, e a pergunta de verba que travou a conversa dele é
//      irrelevante por definição.
//
//      O dono sai de `donoDeclaradoDoRastro` (régua pura), e ele tem DUAS
//      fontes, ambas verdade de dentro da casa: o `clienteDoConvite` derivado
//      pelo servidor do token, e a `atribuicao` declarada por um operador com
//      sessão de agência. A segunda foi acrescentada em 28/08 porque o rastro
//      do primeiro cliente real é **v1** e não carrega o convite — sem ela, o
//      cliente que este arquivo existe para salvar era justamente o que ficava
//      de fora. ⛔ Nenhuma terceira fonte: continua PROIBIDO deduzir dono do
//      e-mail digitado no chat.
//   2. **Escopo que já dá para orçar** — a régua pura
//      (`regua-da-conversa-completa.ts`), que devolve pendência NOMEADA quando
//      falta algo. *Metade de briefing virando pedido é pior que pedido nenhum:
//      produz orçamento errado com cara de certo.*
//   3. **O índice único deixa** — `ClientRequestDb.fioDaConversa`.
//
// ═══ FAIL-CLOSED, E É A METADE QUE IMPORTA ═════════════════════════════════
//
// Sem parceria viva, escopo incompleto, ou leitura de banco falhando → **NÃO
// promove**, e o motivo fica registrado. `parceriaVivaDoCliente` já devolve
// `null` quando o banco cai, e este arquivo trata `null` como "não é parceiro",
// jamais como "pode ir". *"Não sei" nunca vira "pode ir".*
//
// ═══ A LINHA QUE NÃO SE CRUZA ══════════════════════════════════════════════
//
// ⛔ **Nada do cliente é inventado.** O pedido é montado EXCLUSIVAMENTE com o
// que ele mesmo escreveu na conversa: `businessName` sai de
// `scope.businessName`, os objetivos são os dele, os serviços são os que ele
// marcou, o contato é o que ele declarou. Nenhum campo tem valor padrão de
// conveniência; faltando qualquer um deles a conversa NÃO é promovida.
// Recuperar o que ele JÁ DISSE honra o trabalho dele; preencher o que ele NÃO
// disse é mentir.
//
// ⛔ **Nenhum pagamento falso de R$ 0.** A isenção do parceiro é DERIVADA da
// `ParceriaDoCliente` (`derivarIsencaoDoPedido`) e o portão de pagamento lê
// dali. Este arquivo não encosta em `PagamentoConfirmado`.
//
// ⛔ **Nenhum e-mail para endereço inventado.** Este arquivo não manda e-mail
// nenhum. Quem avisa é `orcamento-do-briefing.ts`, na perna seguinte do mesmo
// relógio, e o endereço dele sai de `lerContato` — o contato DECLARADO.
//
// ═══ A IDEMPOTÊNCIA É DO BANCO, NUNCA DE UM `if` ═══════════════════════════
//
// O relógio bate de 5 em 5 minutos e duas batidas podem se cruzar na mesma
// conversa. Uma checagem em código ("já existe pedido para este fio?") abre uma
// janela entre a leitura e a escrita — e é nessa janela que nascem dois
// pedidos, dois orçamentos e dois e-mails para o mesmo cliente. Aqui não há
// checagem prévia: escreve-se, e o **índice único
// `ClientRequestDb_fioDaConversa_key`** recusa a segunda. A violação (P2002) é
// lida como "já promovida" — resultado normal, não falha da rodada.
// *A trava real é o índice único.*

import { conversaJaDaParaOrcar, fraseDaPendencia } from "@/lib/agency/comercial/regua-da-conversa-completa";
import { conversasSemPedido, resolverRastroPeloFio, type RastroDaConversa } from "@/lib/agency/comercial/conversa-sem-pedido";
import { donoDeclaradoDoRastro } from "@/lib/agency/comercial/dono-do-rastro";
import { parceriaVivaDoCliente, derivarIsencaoDoPedido } from "@/lib/agency/financeiro/parceria-do-parceiro";
import { createClientRequest } from "@/lib/agency/persistence/client-request-service";
import { lerContato } from "@/lib/agency/comercial/contato-do-lead";

/** Quantos rastros se olha por rodada. O relógio bate a cada 5 min e volta
 *  sempre; janela pequena é fila que anda, não fila que entope — a lição do
 *  entupimento medido em `orcamento-do-briefing.ts`. */
const JANELA = 25;

/** A origem gravada dentro do pedido, para quem perguntar daqui a seis meses
 *  "de onde saiu isto". A COLUNA `fioDaConversa` é a resposta indexável; este
 *  bloco é a resposta legível, com a data e o motivo. */
export const ORIGEM_CONVERSA_RECUPERADA = "conversa_recuperada";

export type PedidoRecuperado = {
  fio: string;
  clientRequestId: string;
  clientId: string;
};

export type ResultadoDaPromocao = {
  /** Pedidos que nasceram AGORA. */
  promovidos: PedidoRecuperado[];
  /** Conversas de parceiro que NÃO viraram pedido, com o que falta — nomeado.
   *  Nunca um "não" mudo: o que falta muda o que quem atende tem de fazer. */
  pendencias: string[];
  /** Conversas que o índice único recusou porque já viraram pedido antes. É
   *  resultado NORMAL da segunda batida do relógio, não erro. */
  jaPromovidas: number;
  /** Conversas sem parceria viva declarada. Não é falha: é o caminho de sempre
   *  — parada com dono humano, na lista de quem atende. */
  semParceria: number;
  /** O que quebrou de verdade. Vira notícia da rodada. */
  falhas: string[];
};

/** O nome do serviço nas MESMAS palavras que o extrator da casa usa
 *  (`briefing-extractor.ts`). É restatement do que o cliente marcou, não
 *  inferência: cada item só entra se a bandeira dele estiver ligada no escopo
 *  que a pessoa mesma construiu na conversa. */
function servicosDeclarados(escopo: {
  wantsSocialMedia?: boolean;
  wantsPaidTraffic?: boolean;
  branding?: { requested?: boolean };
}): string[] {
  const s: string[] = [];
  if (escopo.wantsSocialMedia) s.push("Social Media");
  if (escopo.wantsPaidTraffic) s.push("Tráfego Pago");
  if (escopo.branding?.requested) s.push("Branding");
  return s;
}

/** Violação de chave única do Prisma. Reconhecida pelo código, não pelo texto
 *  da mensagem: texto de erro muda com a versão da biblioteca e uma trava que
 *  depende de string é uma trava que some numa atualização menor. */
function eColisaoDeChaveUnica(err: unknown): boolean {
  const e = err as { code?: unknown } | null;
  return !!e && typeof e === "object" && e.code === "P2002";
}

/**
 * PROMOVE AS CONVERSAS PARADAS QUE JÁ DÃO PARA ATENDER.
 *
 * Nunca lança: é chamada de dentro de uma rodada com outros clientes na fila, e
 * o próximo não pode pagar pelo anterior. O que quebrou sai em `falhas`, que o
 * despertador transforma em notícia da rodada.
 */
export async function promoverConversasParadas(
  agora: Date = new Date(),
): Promise<ResultadoDaPromocao> {
  const r: ResultadoDaPromocao = {
    promovidos: [], pendencias: [], jaPromovidas: 0, semParceria: 0, falhas: [],
  };

  let rastros: RastroDaConversa[];
  try {
    // `null` = todos os workspaces. O relógio não tem sessão, logo não tem
    // workspace; o dono de cada pedido sai do rastro, que já nasceu carimbado.
    rastros = await conversasSemPedido(null, JANELA);
  } catch (e) {
    // Leitura que falha NÃO vira "nada a promover" em silêncio: sem esta linha
    // um banco fora do ar apareceria como rodada limpa, e o cliente esperaria
    // outras 24 horas sem ninguém saber por quê.
    r.falhas.push(`rastros não lidos: ${e instanceof Error ? e.message : String(e)}`);
    return r;
  }

  for (const rastro of rastros) {
    try {
      // ── 1. PARCERIA VIVA, OU NADA ────────────────────────────────────────
      // DUAS fontes de dono, e as DUAS são verdade de dentro da casa:
      // `clienteDoConvite`, derivado pelo servidor do token do convite; e a
      // `atribuicao`, DECLARADA por um operador com sessão de agência que
      // responde pelo ato (`atribuir-conversa-orfa.ts`). A segunda existe
      // porque o rastro do primeiro cliente real é **v1** e não sabe de quem
      // é — e fazer o cliente repetir o briefing seria inaceitável.
      //
      // ⛔ Nenhuma terceira fonte. Continua PROIBIDO deduzir dono do e-mail
      // digitado no chat: bastaria um visitante escrever o e-mail de um
      // parceiro. A régua é a mesma de sempre — só a origem do `clientId`
      // ganhou uma segunda porta, e ela também é confiável.
      //
      // Sem nenhuma das duas (rastro v1 não atribuído, visitante anônimo) →
      // não se adivinha de quem é a conversa. Fail-closed.
      const dono = donoDeclaradoDoRastro(rastro);
      if (!dono) { r.semParceria++; continue; }
      const parceria = await parceriaVivaDoCliente(dono.clientId, agora);
      if (!parceria) { r.semParceria++; continue; }

      // ── 2. A RÉGUA DO "JÁ DÁ PARA ATENDER" ───────────────────────────────
      const veredicto = conversaJaDaParaOrcar(rastro.escopo);
      if (!veredicto.pode) {
        r.pendencias.push(fraseDaPendencia(rastro.fio, veredicto.faltando));
        continue;
      }
      const escopo = veredicto.escopo;

      // O contato é lido pela MESMA função que o aviso de orçamento usa, sobre
      // a MESMA forma de briefing — para que "tem como falar com ele" signifique
      // exatamente o mesmo nos dois lugares. Segunda régua aqui seria a casa
      // achando que avisou quem não avisou.
      const briefingJson = {
        scope: escopo,
        // O número é DERIVADO do escopo dele pela função determinística que a
        // sala de briefing roda ao vivo. Não é palpite, e é o mesmo que a tela
        // teria gravado se a conversa tivesse chegado ao fim.
        estimate: veredicto.estimativa,
        contato: rastro.contato ?? undefined,
        origem: {
          tipo: ORIGEM_CONVERSA_RECUPERADA,
          fio: rastro.fio,
          conversaParadaEm: rastro.paradaEm.toISOString(),
          promovidoEm: agora.toISOString(),
          parceriaAutorizadaPor: parceria.autorizadaPor,
          // ── A TRILHA QUE SOBREVIVE AO RASTRO ────────────────────────────
          // O rastro é APAGADO três linhas abaixo (`resolverRastroPeloFio`).
          // Sem esta cópia, a resposta para "por que este pedido é do FOOCCI?"
          // morreria junto com ele. `donoDeclaradoPor` diz QUAL das duas
          // portas respondeu; `atribuicao` traz quem declarou, quando e sobre
          // qual fio — quando foi a casa que disse.
          donoDeclaradoPor: dono.origem,
          atribuicao: dono.atribuicao,
        },
      };
      const contato = lerContato({ briefingJson });

      // ── 3. O PEDIDO NASCE. A TRAVA É O ÍNDICE ÚNICO ──────────────────────
      // Sem checagem prévia de propósito: ver o bloco da idempotência no topo.
      const pedido = await createClientRequest({
        workspaceId: rastro.workspaceId,
        clientId: parceria.clientId,
        // ⛔ Tudo daqui para baixo é palavra do cliente. `businessName` é
        // obrigatório na régua justamente para nunca cair em texto de consolo.
        businessName: escopo.businessName ?? "",
        segment: escopo.segment,
        services: servicosDeclarados(escopo),
        objectives: escopo.objectives ?? [],
        source: ORIGEM_CONVERSA_RECUPERADA,
        fioDaConversa: rastro.fio,
        briefingJson,
        // Mesma lei da porta da frente: sem canal declarado o pedido nasce
        // `lead_incompleto` — que a fila do orçamento atende igual. Faltar
        // contato impede AVISAR, nunca ATENDER.
        status: contato.temComoFalar ? "new" : "lead_incompleto",
      });

      // A isenção do pedido é CONSEQUÊNCIA da parceria, nunca um ato novo — e
      // nunca um pagamento falso de R$ 0. Falhar aqui não desfaz o pedido: quem
      // decide o portão é a parceria viva, não o sucesso desta escrita.
      try {
        await derivarIsencaoDoPedido(pedido.id, parceria.clientId, agora);
      } catch (e) {
        r.falhas.push(`${rastro.fio}: isenção não derivada — ${e instanceof Error ? e.message : String(e)}`);
      }

      // O rastro deixa de ser uma parada. Sem isto a lista mentiria para cima —
      // e a próxima batida tentaria de novo (o índice recusaria, mas a fila
      // ficaria entupida com quem já foi atendido).
      await resolverRastroPeloFio(rastro.fio);

      r.promovidos.push({ fio: rastro.fio, clientRequestId: pedido.id, clientId: parceria.clientId });
    } catch (e) {
      if (eColisaoDeChaveUnica(e)) {
        // A segunda batida do relógio na mesma conversa. Resultado esperado da
        // trava, não erro: o pedido já existe e o orçamento dele já está a
        // caminho. Resolve o rastro para a terceira batida nem chegar aqui.
        r.jaPromovidas++;
        await resolverRastroPeloFio(rastro.fio);
        continue;
      }
      r.falhas.push(`${rastro.fio}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return r;
}

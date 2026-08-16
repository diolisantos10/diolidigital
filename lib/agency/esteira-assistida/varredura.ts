// A PORTA DE ENTRADA ACIONA A ESTEIRA — o briefing deixa de morrer na tabela.
//
// ─── POR QUE ISTO EXISTE (16/08/2026) ──────────────────────────────────────
//
// O briefing do CityJobs foi enviado pela porta pública com dois PDFs. A tela
// prometeu "em breve você saberá o orçamento". Ele virou uma linha em
// `ClientRequestDb` e PAROU. No log da noite: `sdr/chat`, o registro do
// pedido, e silêncio.
//
// A causa não era um bug: era um ELO QUE NÃO EXISTIA. O ciclo assistido
// (`executarCicloAssistido`) só rodava quando alguém chamava
// `POST /api/v2/assistido` com `acao: "ciclo"` À MÃO. Nada no relógio da casa
// o chamava. A agência tinha o motor montado e nenhuma correia ligando a porta
// da frente a ele.
//
// Esta varredura é a correia. Roda a cada passada do despertador.
//
// ─── AS TRAVAS, PORQUE ISTO GASTA DINHEIRO ─────────────────────────────────
//
// Uma rotina que dispara cadeia de IA sozinha, a cada 5 minutos, é uma
// máquina apontada para a fatura. As travas não são opcionais:
//
//   1. TETO POR RODADA (`MAX_POR_RODADA`). Fila de 40 briefings não vira 40
//      cadeias na mesma passada. Sobra para a próxima — a fila anda, não
//      estoura.
//   2. FAIL-CLOSED na autorização. Sem a chave da agência, não roda. E a
//      recusa vira LINHA VISÍVEL, não silêncio (era esse o defeito).
//   3. RESERVA ANTES DE GASTAR. A solicitação sai de `new` ANTES do ciclo
//      começar. Duas passadas concorrentes (ou um deploy no meio) não pagam
//      o mesmo trabalho duas vezes.
//   4. RETOMADA IDEMPOTENTE. O que já foi pago volta de `ExecucaoV2` pelo
//      `jaFeitos` da cadeia, nunca do provedor.
//   5. RECUSA REPETIDA NÃO VIRA ENXURRADA. A mesma recusa, para a mesma
//      solicitação, é gravada UMA vez por janela — e a linha antiga é o que
//      mostra a IDADE de verdade. Regravar a cada 5 min zeraria a idade e
//      esconderia há quanto tempo aquilo está parado.
//
// ─── O QUE ELA NÃO FAZ ─────────────────────────────────────────────────────
//
// Não publica, não envia mensagem, não fala com o cliente e não aprova nada.
// O fim da cadeia continua sendo um card de aprovação HUMANA.

import { executarCicloAssistido, type ResultadoDoCiclo } from "./cadeia";
import { esteiraAutorizada, type ResultadoDaAutorizacao } from "./autorizacao";
import { PORTA_DA_ESTEIRA, AUTORIZACAO_DA_ESTEIRA } from "./recusa-visivel";
import type { ArmazemDeFlags } from "@/lib/agency/flags-v2/flags";

/** Teto de cadeias por passada do relógio. Fila anda; fatura não estoura. */
export const MAX_POR_RODADA = 2;

/** Janela de silêncio de uma recusa repetida — ver trava 5. */
export const JANELA_DA_RECUSA_HORAS = 12;

export interface SolicitacaoNaPorta {
  id: string;
  workspaceId: string | null;
  clientId: string | null;
  businessName: string;
  rawContext: string;
  status: string;
  createdAt: Date;
  /** Dá para falar com quem mandou? Vem do leitor único `lerContato`. */
  temComoFalar: boolean;
  /** Por que não dá. Nulo quando dá. */
  porQueNaoDaParaFalar: string | null;
}

export interface ClienteResolvido {
  id: string;
  workspaceId: string;
  name: string;
}

export interface DependenciasDaVarredura {
  /** As solicitações paradas na porta, mais antigas primeiro (quem espera há mais tempo, primeiro). */
  solicitacoesNaPorta(limite: number): Promise<SolicitacaoNaPorta[]>;
  /** Acha ou cria a ficha do cliente. DEVE deduplicar por nome dentro da agência. */
  resolverCliente(s: SolicitacaoNaPorta): Promise<ClienteResolvido | { erro: string }>;
  flags: ArmazemDeFlags;
  /** Já existe recusa igual e recente para esta solicitação? (trava 5) */
  recusaRecente(correlationId: string, funcaoId: string, desde: Date): Promise<boolean>;
  registrarRecusa(dados: {
    funcaoId: string;
    motivo: string;
    correlationId: string;
    clienteId?: string | null;
    em: Date;
  }): Promise<void>;
  /** Saídas já pagas neste correlationId (funcaoId → saída). */
  jaFeitos(correlationId: string): Promise<Record<string, string>>;
  /** Reserva a solicitação antes de gastar (trava 3). `false` = outro pegou. */
  reservar(solicitacaoId: string): Promise<boolean>;
  marcarStatus(solicitacaoId: string, status: string): Promise<void>;
  rodarCiclo(pedido: {
    clienteId: string;
    workspaceId: string;
    solicitacao: string;
    nomeDoCliente: string;
    correlationId: string;
    jaFeitos: Record<string, string>;
  }): Promise<ResultadoDoCiclo>;
  abrirAprovacao(dados: {
    clienteId: string;
    solicitacaoId: string;
    resumo: string;
  }): Promise<{ id: string }>;
  agora(): Date;
}

export interface ResultadoDaVarredura {
  olhadas: number;
  andaram: number;
  recusadas: number;
  pararamNoMeio: number;
  /** Linha a linha, para o log do relógio e para o relatório ao Diretor. */
  detalhe: Array<{
    solicitacaoId: string;
    negocio: string;
    desfecho: "andou" | "recusada" | "parou" | "reservada-por-outro";
    motivo?: string;
  }>;
}

export function correlationDaPorta(clienteId: string, solicitacaoId: string): string {
  return `assistido:${clienteId}:${solicitacaoId}`;
}

/**
 * A passada. Olha quem está parado na porta e leva para dentro — ou explica,
 * por escrito, por que não levou.
 */
export async function varrerAPorta(deps: DependenciasDaVarredura): Promise<ResultadoDaVarredura> {
  const agora = deps.agora();
  const resultado: ResultadoDaVarredura = { olhadas: 0, andaram: 0, recusadas: 0, pararamNoMeio: 0, detalhe: [] };

  const fila = await deps.solicitacoesNaPorta(MAX_POR_RODADA);
  resultado.olhadas = fila.length;

  for (const s of fila) {
    // A recusa desta etapa ainda não tem correlationId de ciclo (não há
    // cliente resolvido). Usa-se o id da solicitação: é o que identifica QUEM
    // está parado, que é a pergunta da tela.
    const correlationDaSolicitacao = `porta:${s.id}`;

    const recusar = async (funcaoId: string, motivo: string, correlationId: string, clienteId?: string | null) => {
      const desde = new Date(agora.getTime() - JANELA_DA_RECUSA_HORAS * 3_600_000);
      const jaTem = await deps.recusaRecente(correlationId, funcaoId, desde);
      if (!jaTem) {
        await deps.registrarRecusa({ funcaoId, motivo, correlationId, clienteId, em: agora });
      }
      resultado.recusadas += 1;
      resultado.detalhe.push({ solicitacaoId: s.id, negocio: s.businessName, desfecho: "recusada", motivo });
    };

    // 0. SEM CONTATO NÃO SE PRODUZ PROPOSTA — a regra de 08/08/2026, aplicada
    //    aqui também. Uma cadeia de seis funções custa dinheiro e produz um
    //    documento para NINGUÉM quando não há para onde ligar. O gate da rota
    //    pública já grava esses como `lead_incompleto`, mas há linhas antigas
    //    em `new` sem canal (o Sushi Cazza, 51 dias) — e foi exatamente uma
    //    delas que esta varredura processou na primeira prova ao vivo.
    //
    //    O lead NÃO é descartado: fica na porta, visível, com a idade correndo
    //    e o motivo escrito. Quem aborda é gente.
    if (!s.temComoFalar) {
      await recusar(
        PORTA_DA_ESTEIRA,
        `"${s.businessName}" está na porta desde ${s.createdAt.toISOString().slice(0, 10)} e NÃO há como falar com ele — ` +
          `${s.porQueNaoDaParaFalar ?? "sem canal declarado"}. A esteira não gasta uma cadeia inteira para produzir ` +
          `uma proposta que não tem para onde ir. Abordagem é decisão de gente.`,
        correlationDaSolicitacao,
        s.clientId,
      );
      continue;
    }

    // 1. De quem é este trabalho. Sem ficha de cliente não há escopo, não há
    //    dono do gasto e não há para onde entregar.
    const cliente = await deps.resolverCliente(s);
    if ("erro" in cliente) {
      await recusar(PORTA_DA_ESTEIRA, cliente.erro, correlationDaSolicitacao, s.clientId);
      continue;
    }

    // 2. A autorização — por agência, sobrevive ao ciclo de vida do cliente.
    const autorizacao: ResultadoDaAutorizacao = await esteiraAutorizada(
      { clienteId: cliente.id, workspaceId: cliente.workspaceId, nomeDoCliente: cliente.name },
      deps.flags,
    );
    if (!autorizacao.autorizada) {
      await recusar(AUTORIZACAO_DA_ESTEIRA, autorizacao.motivo, correlationDaSolicitacao, cliente.id);
      continue;
    }

    // 3. Reserva ANTES de gastar. Perdeu a corrida? Outro está cuidando.
    const minha = await deps.reservar(s.id);
    if (!minha) {
      resultado.detalhe.push({ solicitacaoId: s.id, negocio: s.businessName, desfecho: "reservada-por-outro" });
      continue;
    }

    const correlationId = correlationDaPorta(cliente.id, s.id);
    const jaFeitos = await deps.jaFeitos(correlationId);

    // O que o motor recebe é o que o cliente ESCREVEU. Não se resume, não se
    // reinterpreta e não se completa por inferência antes de entrar.
    const solicitacao = s.rawContext?.trim()
      ? s.rawContext
      : `Briefing de ${s.businessName} recebido pelo formulário público. O texto da conversa não veio no registro — preciso confirmar o pedido com o cliente.`;

    const ciclo = await deps.rodarCiclo({
      clienteId: cliente.id,
      workspaceId: cliente.workspaceId,
      solicitacao,
      nomeDoCliente: cliente.name,
      correlationId,
      jaFeitos,
    });

    if (!ciclo.ok) {
      // Parou no meio. O executor já gravou a recusa da função; o que falta é
      // a solicitação PEDIR A DECISÃO numa tela em vez de voltar para o limbo.
      await deps.marcarStatus(s.id, "precisa_decisao");
      resultado.pararamNoMeio += 1;
      resultado.detalhe.push({
        solicitacaoId: s.id,
        negocio: s.businessName,
        desfecho: "parou",
        motivo: ciclo.parouEm ? `${ciclo.parouEm.funcaoId}: ${ciclo.parouEm.motivo}` : "sem motivo declarado pelo ciclo",
      });
      continue;
    }

    const resumo = ciclo.passos
      .map((p) => `${p.departamentoId}/${p.funcaoId}: ${p.decisao} ($${(p.custoUsd ?? 0).toFixed(4)})`)
      .join(" · ");
    await deps.abrirAprovacao({ clienteId: cliente.id, solicitacaoId: s.id, resumo });
    resultado.andaram += 1;
    resultado.detalhe.push({ solicitacaoId: s.id, negocio: s.businessName, desfecho: "andou" });
  }

  return resultado;
}

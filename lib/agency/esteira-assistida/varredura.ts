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

/**
 * Teto de CADEIAS INICIADAS por passada. Fila anda; fatura não estoura.
 *
 * 🔴 O que este teto NÃO é, e a distinção custou a primeira versão desta
 * frente: ele **não** é o número de linhas examinadas. Ver `JANELA_DE_CANDIDATOS`.
 */
export const MAX_POR_RODADA = 2;

/**
 * Quantas linhas a passada EXAMINA. É deliberadamente muito maior que o teto
 * de cadeias, e a diferença entre os dois é o conserto do defeito mais grave
 * que esta frente teve.
 *
 * ─── O DEFEITO (achado do `seguranca` na PR #166, G-2) ─────────────────────
 *
 * A primeira versão buscava `take: MAX_POR_RODADA` com `status: "new"` e
 * `createdAt asc`, e a RECUSA NÃO MUDAVA O STATUS. Consequência: os dois leads
 * mais antigos e irrecusáveis (o Sushi Cazza, 51 dias sem canal, e outro
 * igual) ocupavam os DOIS lugares de TODA passada, para sempre. **Nenhum
 * briefing novo jamais chegava ao motor — inclusive o CityJovs, que era o
 * teste de aceite inteiro.**
 *
 * O aceite passou porque foi rodado contra base ZERADA, com exatamente as duas
 * linhas do roteiro. Contra a fila real, com os velhos dentro, ele reprovaria.
 * **A metade que faltou foi a do caso limpo: "o novo passa mesmo com velhos na
 * frente" — e é sempre essa metade que falta.**
 *
 * ─── O CONSERTO ────────────────────────────────────────────────────────────
 *
 * O orçamento passa a contar apenas o que GASTA. Recusar é barato: não paga
 * IA, não reserva linha, não abre ciclo. Então recusa **não consome cota**, e
 * a passada continua descendo a fila até achar quem pode andar.
 *
 * O recusado continua com `status: "new"` de propósito: ele NÃO sai da porta,
 * continua visível para o CEO com a idade correndo. O que ele deixa de fazer é
 * **bloquear a fila de processamento**.
 */
export const JANELA_DE_CANDIDATOS = 60;

/** Teto de recusas GRAVADAS por passada — limita o trabalho, não a visão. */
export const MAX_RECUSAS_POR_RODADA = 20;

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
  /** O canal declarado — viaja para a ficha do `Client` na hora de criá-la. */
  contatoEmail?: string | null;
  contatoWhatsapp?: string | null;
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
    /** De qual AGÊNCIA é a recusa — o motivo carrega o nome do negócio (G-5). */
    workspaceId?: string | null;
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

/** A correlação da PORTA — identifica quem está parado, antes de haver ciclo. */
export function correlationDaSolicitacao(solicitacaoId: string): string {
  return `porta:${solicitacaoId}`;
}

/**
 * O resumo do pacote que vai para o card de aprovação.
 *
 * 🔴 SEM DINHEIRO E SEM ID INTERNO, e isto é P0 de privacidade comercial
 * (achado B-1 do `seguranca` na PR #166). A primeira versão montava
 * `"branding/brand-architect: executado ($0.0087) · …"` e gravava num card
 * `clientVisible: true`. O portal renderiza a nota como corpo do card: **o
 * cliente pagante veria quanto a agência gastou de IA, passo a passo, com os
 * ids internos das funções.** A auditoria de custo já mora em `ExecucaoV2`,
 * que é interna — não precisa (nem pode) viajar no card.
 */
export function resumoDoPacote(passos: Array<{ departamentoId: string }>): string {
  const departamentos = [...new Set(passos.map((p) => p.departamentoId))];
  return (
    `Pacote da esteira: ${passos.length} etapa(s) concluída(s) em ${departamentos.length} departamento(s) ` +
    `(${departamentos.join(", ")}). Aguardando revisão da AGÊNCIA antes de qualquer coisa chegar ao cliente.`
  );
}

/**
 * A passada. Olha quem está parado na porta e leva para dentro — ou explica,
 * por escrito, por que não levou.
 */
export async function varrerAPorta(deps: DependenciasDaVarredura): Promise<ResultadoDaVarredura> {
  const agora = deps.agora();
  const resultado: ResultadoDaVarredura = { olhadas: 0, andaram: 0, recusadas: 0, pararamNoMeio: 0, detalhe: [] };

  // ⚠️ EXAMINA MUITO, GASTA POUCO. Ver `JANELA_DE_CANDIDATOS` para o defeito
  // que esta única linha conserta: com `take: MAX_POR_RODADA`, dois leads
  // velhos e irrecusáveis travavam a fila inteira para sempre.
  const fila = await deps.solicitacoesNaPorta(JANELA_DE_CANDIDATOS);
  resultado.olhadas = fila.length;

  let cadeiasIniciadas = 0;
  let recusasGravadas = 0;

  for (const s of fila) {
    // O orçamento conta o que GASTA. Recusar não paga IA, não reserva linha e
    // não abre ciclo — por isso recusa não consome cota, e a passada continua
    // descendo a fila até achar quem pode andar.
    if (cadeiasIniciadas >= MAX_POR_RODADA) break;

    const correlacao = correlationDaSolicitacao(s.id);

    const recusar = async (funcaoId: string, motivo: string, clienteId?: string | null) => {
      const desde = new Date(agora.getTime() - JANELA_DA_RECUSA_HORAS * 3_600_000);
      const jaTem = await deps.recusaRecente(correlacao, funcaoId, desde);
      if (!jaTem && recusasGravadas < MAX_RECUSAS_POR_RODADA) {
        await deps.registrarRecusa({
          funcaoId, motivo, correlationId: correlacao, clienteId,
          workspaceId: s.workspaceId, em: agora,
        });
        recusasGravadas += 1;
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
        s.clientId,
      );
      continue;
    }

    // 1. A AUTORIZAÇÃO VEM ANTES DE QUALQUER ESCRITA (achado G-3 do
    //    `seguranca`). Na primeira versão, `resolverCliente` rodava primeiro e
    //    fazia `client.create` — ou seja, **um anônimo da internet criava ficha
    //    de cliente na base mesmo com a esteira DESLIGADA**. Portão que só
    //    fecha depois de a porta ter sido usada não é portão.
    //
    //    Aqui usa-se o `clientId` que a solicitação já tiver (pode ser nulo);
    //    o escopo que decide de verdade é o da AGÊNCIA, e ele já está
    //    disponível sem escrever uma linha.
    const autorizacaoPrevia: ResultadoDaAutorizacao = await esteiraAutorizada(
      { clienteId: s.clientId, workspaceId: s.workspaceId, nomeDoCliente: s.businessName },
      deps.flags,
    );
    if (!autorizacaoPrevia.autorizada) {
      await recusar(AUTORIZACAO_DA_ESTEIRA, autorizacaoPrevia.motivo, s.clientId);
      continue;
    }

    // 2. Só agora se resolve (e, se preciso, se cria) a ficha do cliente.
    const cliente = await deps.resolverCliente(s);
    if ("erro" in cliente) {
      await recusar(PORTA_DA_ESTEIRA, cliente.erro, s.clientId);
      continue;
    }

    // 2b. Segunda passada da autorização, agora com o id REAL do cliente — é
    //     ela que honra o desligamento individual (`false` no cliente vence
    //     `true` na agência). Só roda quando o id mudou; senão é a mesma conta.
    if (cliente.id !== s.clientId) {
      const autorizacao: ResultadoDaAutorizacao = await esteiraAutorizada(
        { clienteId: cliente.id, workspaceId: cliente.workspaceId, nomeDoCliente: cliente.name },
        deps.flags,
      );
      if (!autorizacao.autorizada) {
        await recusar(AUTORIZACAO_DA_ESTEIRA, autorizacao.motivo, cliente.id);
        continue;
      }
    }

    // 3. Reserva ANTES de gastar. Perdeu a corrida? Outro está cuidando.
    const minha = await deps.reservar(s.id);
    if (!minha) {
      resultado.detalhe.push({ solicitacaoId: s.id, negocio: s.businessName, desfecho: "reservada-por-outro" });
      continue;
    }
    cadeiasIniciadas += 1;

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
      // Parou no meio: a solicitação PEDE A DECISÃO numa tela, em vez de
      // voltar para o limbo.
      await deps.marcarStatus(s.id, "precisa_decisao");
      const motivo = ciclo.parouEm
        ? `${ciclo.parouEm.motivo}`
        : "o ciclo parou sem declarar motivo — isto é defeito nosso, não do pedido";
      // ⚠️ E VIRA LINHA VISÍVEL AQUI, sempre. Antes eu confiava que o executor
      // já tinha gravado — e ele grava para `recusado`, mas **não** para
      // `escalado` (`escalar()` não chama `gravarRecusa`). Provedor de IA fora
      // do ar cai justamente em `escalado`: a esteira parava e a tela do PM não
      // tinha uma linha explicando por quê.
      await recusar(
        ciclo.parouEm?.funcaoId ?? PORTA_DA_ESTEIRA,
        `A esteira de "${s.businessName}" parou no meio: ${motivo}`,
        cliente.id,
      );
      resultado.recusadas -= 1; // já contabilizado como "parou"; não conta duas vezes
      resultado.detalhe.pop();  // idem para o detalhe — o desfecho certo é "parou"
      resultado.pararamNoMeio += 1;
      resultado.detalhe.push({
        solicitacaoId: s.id,
        negocio: s.businessName,
        desfecho: "parou",
        motivo: ciclo.parouEm ? `${ciclo.parouEm.funcaoId}: ${ciclo.parouEm.motivo}` : motivo,
      });
      continue;
    }

    await deps.abrirAprovacao({
      clienteId: cliente.id,
      solicitacaoId: s.id,
      resumo: resumoDoPacote(ciclo.passos),
    });
    resultado.andaram += 1;
    resultado.detalhe.push({ solicitacaoId: s.id, negocio: s.businessName, desfecho: "andou" });
  }

  return resultado;
}

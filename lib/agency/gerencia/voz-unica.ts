// A VOZ ÚNICA COM O CLIENTE — o Gerente Geral, e mais ninguém.
//
// ── A ORDEM DO CEO (25/08/2026) ─────────────────────────────────────────────
//
//   "Ele é a ponte entre o cliente e a agência. Por ora não haverá um agente
//    por cliente — quem cuida, conversa e responde ao cliente é o GG."
//
// ── O QUE ESTAVA ERRADO, MEDIDO E NÃO INFERIDO ──────────────────────────────
//
// Em 25/08/2026 a casa falava com o cliente por TRÊS nomes diferentes, em 19
// lugares do código:
//
//   "Gerente de projeto"  → 11 ocorrências (esteira, portal, tráfego, refação)
//   "Equipe Dioli"        →  6 ocorrências (triagem, aprovações, reabertura…)
//   "SDR"                 →  3 ocorrências (registro da conversa comercial)
//
// Cada um desses literais era uma decisão tomada de novo, no lugar em que
// dava jeito. Verdade escrita em três lugares já está errada em dois — e o
// custo cai no cliente, que recebe a mesma promessa assinada por três casas
// diferentes e não sabe a quem cobrar.
//
// ── O QUE ESTE MÓDULO FAZ, E O QUE ELE DECLARA QUE AINDA NÃO FEZ ────────────
//
// FAZ: define a voz canônica num lugar só e RECUSA remetente que não seja o
// Gerente Geral — a recusa é valor de retorno, não boa intenção escrita.
//
// ── A DÍVIDA FOI ZERADA (25/08/2026, mesma data, rodada seguinte) ───────────
//
// A versão anterior deste arquivo declarava a dívida e a CONGELAVA: 19
// ocorrências em 14 arquivos continuavam escrevendo o nome da casa à mão, e a
// catraca só impedia que crescesse. Agora a catraca é absoluta — **nenhum
// arquivo fora deste escreve o nome da casa**, e a lista congelada está VAZIA.
//
// As 16 falas com o cliente passaram a importar `VOZ_DO_CLIENTE` daqui. As 3
// restantes eram outra coisa, e são tratadas como outra coisa logo abaixo
// (`AUTOR_DO_REGISTRO_DO_SDR`) — achatá-las na voz do cliente teria consertado
// a catraca e quebrado o produto.

import { GERENTE_GERAL, ehGerente } from "./cadeia";

/**
 * O nome que o cliente lê. UM. Continua sendo "Gerente de projeto" porque é o
 * que os clientes do piloto já leem hoje — trocar o rótulo no meio de uma
 * conversa em curso conserta o código e confunde a pessoa.
 */
export const VOZ_DO_CLIENTE = "Gerente de projeto";

/** O cargo por trás da voz. É o que a hierarquia diz, e agora o código também. */
export const CARGO_DA_VOZ = GERENTE_GERAL;

/**
 * As vozes que a casa ainda usava em paralelo. **Vazia desde 25/08/2026** — e
 * o teste reprova se voltar a ter item sem que a migração tenha acontecido.
 */
export const VOZES_LEGADAS_A_MIGRAR: readonly string[] = [];

/**
 * O AUTOR DO REGISTRO INTERNO DA CONVERSA COMERCIAL — e por que ele NÃO virou
 * "Gerente de projeto".
 *
 * `lib/agency/comercial/registro-da-conversa.ts` grava `PortalMessage` com
 * `authorName: "SDR"`, e é fácil confundir isso com uma fala ao cliente. Não é.
 * Duas diferenças que decidem:
 *
 *   1. **A linha não vai ao portal de nenhum cliente.** O `clientId` dela é o
 *      `fio` da sessão (`fioDaConversa(sessionId)`) — um identificador
 *      sintético de conversa anônima na porta pública. Quem responde ao
 *      visitante é a rota do chat; esta tabela é o DIÁRIO daquele atendimento.
 *   2. **O nome é chave de leitura, não rótulo.** `falasDoSdrNoFio` busca
 *      exatamente `authorName: "SDR"` para o SDR reler o que já perguntou.
 *      Renomear o escritor sem migrar as linhas históricas cegaria o SDR para
 *      o próprio passado — ele repetiria perguntas já feitas. Trocar o rótulo
 *      no meio de uma conversa em curso conserta o código e quebra a pessoa.
 *
 * O que muda: o literal deixa de ser uma decisão tomada de novo em três
 * lugares. Ele mora aqui, com o motivo, e quem o usa importa daqui.
 */
export const AUTOR_DO_REGISTRO_DO_SDR = "SDR";

export interface MensagemAoCliente {
  clienteId: string;
  corpo: string;
  correlationId: string;
}

export type ResultadoDaFala =
  | { decisao: "enviar"; autorNome: string; autorPapel: "team"; mensagem: MensagemAoCliente }
  | { decisao: "recusado"; motivo: string };

/**
 * A porta de saída para o cliente.
 *
 * Gerente de departamento que quer falar com o cliente NÃO é bloqueado por
 * malícia: ele tem a informação certa. O que ele não tem é o contexto do que
 * já foi prometido — e é isso que produz duas versões. Ele entrega a
 * informação ao Gerente Geral, e o Gerente Geral fala.
 */
export function falarComOCliente(remetenteFuncaoId: string, mensagem: MensagemAoCliente): ResultadoDaFala {
  if (!mensagem.corpo.trim()) {
    return { decisao: "recusado", motivo: "Mensagem vazia não é comunicação — é ruído com carimbo." };
  }
  if (remetenteFuncaoId !== CARGO_DA_VOZ) {
    const quem = ehGerente(remetenteFuncaoId) ? "Gerente de departamento" : "Agente de linha";
    return {
      decisao: "recusado",
      motivo: `${quem} "${remetenteFuncaoId}" não fala com o cliente. Entregue a informação ao ${CARGO_DA_VOZ}, que responde — o cliente tem uma casa só do outro lado.`,
    };
  }
  return { decisao: "enviar", autorNome: VOZ_DO_CLIENTE, autorPapel: "team", mensagem };
}

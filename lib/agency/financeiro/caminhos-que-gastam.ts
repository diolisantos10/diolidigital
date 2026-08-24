// O REGISTRO DOS CAMINHOS QUE GASTAM — a lista fechada de quem pode chamar a
// IA paga, e sob qual regra cada um pode.
//
// Este arquivo não executa nada. Ele existe para que
// `__tests__/financeiro/portao-de-pagamento.test.ts` possa perguntar uma coisa
// que nenhum tipo do TypeScript pergunta: *"apareceu um caminho novo que gasta
// dinheiro e ninguém declarou o que ele é?"*.
//
// A regra do CEO é "nenhuma produção começa antes do pagamento confirmado" —
// mas nem toda chamada de IA é produção. A vitrine (o SDR que atende, entende,
// orça e propõe) gasta ANTES de qualquer pagamento, de propósito: fechar a
// vitrine é fechar a loja. E as ferramentas internas da agência gastam a chave
// da casa em trabalho da casa, sem projeto de cliente do outro lado.
//
// Então cada arquivo que chama `generate({` ou `generateDesign(` declara aqui
// QUAL DOS TRÊS ele é. Arquivo novo sem declaração quebra o build — que é o
// ponto: a omissão tem de doer no autor, não no cliente.

export type ClasseDeGasto =
  /**
   * PRODUÇÃO PARA CLIENTE. É o que a regra do pagamento guarda: peça, arte,
   * texto, tarefa de especialista — tudo que o cliente comprou. Só roda com
   * pagamento confirmado, e o teste exige que nenhum ponto de entrada alcance
   * este arquivo sem cruzar um portão.
   */
  | "producao"
  /**
   * CONVERSA COMERCIAL. Fica FORA da trava por decisão explícita do CEO: o SDR
   * atende, entende, orça e propõe antes de qualquer pagamento. É a vitrine.
   * Quem entra aqui é protegido por OUTRAS travas (teto de custo da rota
   * pública, teto por IP), nunca pela do pagamento.
   */
  | "comercial"
  /**
   * FERRAMENTA INTERNA DA AGÊNCIA. Gasta a chave da casa em trabalho da casa,
   * com sessão de agência e sem projeto de cliente do outro lado. Não há pedido
   * a que ligar um pagamento — e inventar um seria pior que não ter portão.
   */
  | "interno";

export interface CaminhoQueGasta {
  /** Por que esta classe, em uma frase. Sem isto a lista vira carimbo. */
  porque: string;
  /**
   * Só para `producao`: qual portão guarda este arquivo. O teste confere que o
   * guardião REALMENTE chama `conferirPagamento(` — declarar não basta.
   */
  guardadoPor?: string;
}

const PORTAO_DA_ESTEIRA = "lib/agency/execution/run-execution.ts";
const PORTAO_DAS_ARTES = "lib/agency/execution/artes.ts";
const PORTAO_DA_REFACAO = "lib/agency/esteira/refacao.ts";
const PORTAO_DOS_MATERIAIS = "lib/agency/execution/assess-resources.ts";

/**
 * OS PORTÕES. Cada um TEM de chamar `conferirPagamento(`, e o teste prova isso
 * lendo o arquivo — declarar aqui não basta.
 *
 * São quatro e não um porque são quatro caminhos INDEPENDENTES até a fatura.
 * `run-execution` é o funil dos nove chamadores da esteira, mas os outros três
 * não passam por ele: a rodada de arte é chamada direto pelo despertador, e a
 * refação e a conferência de materiais são chamadas direto por
 * `app/api/portal/approvals/route.ts`. Um portão só no funil deixaria os
 * outros três abertos — e a régua verde sobre o componente errado é pior que
 * régua nenhuma.
 */
export const PORTOES = [
  PORTAO_DA_ESTEIRA,
  PORTAO_DAS_ARTES,
  PORTAO_DA_REFACAO,
  PORTAO_DOS_MATERIAIS,
] as const;

export const CAMINHOS_QUE_GASTAM: Record<string, CaminhoQueGasta> = {
  // ── PRODUÇÃO: o que o cliente comprou ──────────────────────────────────────
  [PORTAO_DA_ESTEIRA]: {
    porque: "o núcleo da esteira dos especialistas — é ele o portão",
    guardadoPor: PORTAO_DA_ESTEIRA,
  },
  [PORTAO_DAS_ARTES]: {
    porque: "o gerador de imagem, ~US$0,17–0,25 por peça — é ele o portão",
    guardadoPor: PORTAO_DAS_ARTES,
  },
  "lib/agency/execution/logo.ts": {
    porque: "desenha logotipo do cliente — entregável",
    guardadoPor: PORTAO_DA_ESTEIRA,
  },
  "lib/agency/execution/leitura-do-cliente.ts": {
    porque: "lê o feed do cliente para alimentar a produção da rodada",
    guardadoPor: PORTAO_DA_ESTEIRA,
  },
  [PORTAO_DOS_MATERIAIS]: {
    porque: "pergunta à IA o que falta do cliente; chamada direto pelo portal — é ela o portão",
    guardadoPor: PORTAO_DOS_MATERIAIS,
  },
  [PORTAO_DA_REFACAO]: {
    porque: "refazer é produzir; chamada direto pelo portal — é ela o portão",
    guardadoPor: PORTAO_DA_REFACAO,
  },
  "lib/agency/esteira/mes.ts": {
    porque: "monta a medição do mês do cliente pago",
    guardadoPor: PORTAO_DA_ESTEIRA,
  },
  "lib/agency/esteira/avaliacoes.ts": {
    porque: "avalia entregável produzido",
    guardadoPor: PORTAO_DA_ESTEIRA,
  },

  // ── COMERCIAL: a vitrine, fora da trava por decisão do CEO ─────────────────
  "app/api/sdr/chat/route.ts": {
    porque: "o SDR atende antes de existir pagamento — é a vitrine",
  },
  "lib/agency/comercial/qualificar.ts": {
    porque: "qualifica lead e monta proposta; acontece antes de qualquer venda",
  },
  "lib/agency/execution/negotiate-proposal.ts": {
    porque: "negocia a proposta — por definição, antes do dinheiro entrar",
  },
  "lib/agency/esteira/triagem.ts": {
    porque: "tria o briefing que acabou de chegar, antes de haver pedido pago",
  },
  "lib/agency/esteira/producao-de-pedido.ts": {
    porque: "monta o ORÇAMENTO do pedido novo (apesar do nome), pré-venda",
  },
  "lib/agency/execution/create-project-from-request.ts": {
    porque: "cria o projeto a partir do briefing; roda antes da produção começar",
  },
  "lib/dioli-brain/pm-orchestrator.ts": {
    porque:
      "o PM PROPÕE o projeto (escopo, departamentos, plano) a partir do briefing — é a peça " +
      "de planejamento que sustenta a proposta comercial, e roda em `create-project-from-request` " +
      "e no `/api/brain/orchestrate`, ambos ANTES de existir pedido pago. Travá-lo seria travar " +
      "a vitrine: o cliente não pode pagar por um projeto que a casa ainda não sabe orçar. " +
      "O que ele NÃO faz é entregável — nenhuma peça sai daqui.",
  },

  // ── INTERNO: a casa gastando na casa ──────────────────────────────────────
  "app/api/generate-image/route.ts": {
    porque: "ferramenta de design da agência (/agency/design-agent); sem projeto de cliente",
  },
  "app/api/admin/reset-request/route.ts": {
    porque: "diagnóstico de admin: revela o erro real que a esteira engole",
  },
  "app/api/ai/run/route.ts": {
    porque: "console de IA da agência, sessão de agência obrigatória",
  },
  "app/api/brain/reason/route.ts": {
    porque: "o Brain raciocinando para o time, não entregável de cliente",
  },
  "app/api/agents/ads/generate/route.ts": { porque: "gerador manual do time, sessão de agência" },
  "app/api/agents/brand/analyze/route.ts": { porque: "gerador manual do time, sessão de agência" },
  "app/api/agents/design/generate/route.ts": { porque: "gerador manual do time, sessão de agência" },
  "app/api/agents/operations/generate/route.ts": { porque: "gerador manual do time, sessão de agência" },
  "app/api/agents/pm/generate/route.ts": { porque: "gerador manual do time, sessão de agência" },
  "app/api/agents/social/generate/route.ts": { porque: "gerador manual do time, sessão de agência" },
  "app/api/social-posts/generate/route.ts": { porque: "gerador manual do time, sessão de agência" },
  "app/api/portal/messages/suggest/route.ts": { porque: "sugere resposta AO TIME; nada vai ao cliente sem alguém enviar" },
  "lib/agency/radar/radar-agent.ts": { porque: "prospecção da própria agência" },
  "lib/agency/produto-tecnologia/adaptador-tecnico.ts": { porque: "produto interno da casa" },
  "lib/agency/esteira-assistida/adaptador-de-ia.ts": { porque: "piloto assistido, operado por gente do time" },
  "lib/agency/esteira/pm-responde.ts": { porque: "redige resposta do PM ao time" },
  "lib/agency/esteira/pacote-travado.ts": { porque: "explica ao time por que um pacote travou" },
  "lib/agency/execution/quality-auditor.ts": {
    porque:
      "a Qualidade AUDITA texto que já existe — ela não produz entregável nenhum. Quem gastou " +
      "para criar aquele texto já passou (ou não) pelo portão; a auditoria herda a classe de " +
      "quem a chamou. E ela é chamada dos três lados: da esteira (produção, já guardada), do " +
      "orçamento do pedido (comercial, fora da trava por decisão do CEO) e da explicação de " +
      "pacote travado (interno). Pôr um portão aqui exigiria inventar um `clientRequestId` " +
      "onde nem sempre existe um — e portão que adivinha dono é portão que erra.",
  },
};

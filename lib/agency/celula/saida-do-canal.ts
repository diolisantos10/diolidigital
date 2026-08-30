// ─── QUANDO A CONVERSA PODE SAIR DO 99FREELAS — e quando NUNCA pode ────────
//
// Decisão 3 do CEO, 30/08/2026, literal:
//
//   "ANTES da garantia de pagamento, bloquear contato e link externo; DEPOIS
//    da garantia, permitir contato ou briefing externo COM registro de
//    consentimento; contratação e pagamento permanecem obrigatoriamente no
//    99Freelas."
//
// A fonte oficial já estava capturada e diz o mesmo, o que é raro e vale
// registrar: `docs/plataformas/99freelas/policy.json`, `proibicoes_de_conteudo
// .dado_de_contato` — "O chat reforça: proibido até o cliente fazer a garantia
// de pagamento."
//
// ── POR QUE ESTE ARQUIVO EXISTE SEPARADO DO GUARDIÃO ───────────────────────
// `lib/marketplaces/99freelas/conformidade.ts` responde "este TEXTO contém um
// dado de contato?" — é análise de string, e continua valendo intacta. Aqui a
// pergunta é outra: "esta CONVERSA tem direito de sair do canal?". Misturar as
// duas faria o validador de texto precisar conhecer garantia de pagamento, e
// um validador puro que ganha estado é um validador que passa a mentir quando
// o estado chega errado.
//
// ── A REGRA DO DIRETOR GERAL, QUE É O CORAÇÃO DESTE ARQUIVO ────────────────
// "A permissão DEPOIS da garantia só vale com consentimento REGISTRADO como
//  dado, nunca inferido do estado da conversa. Sem registro, comporta-se como
//  antes da garantia — fail closed."
//
// Por isso `avaliarSaidaDoCanal` NÃO recebe a conversa e NÃO lê mensagens. Se
// recebesse, alguém um dia escreveria "o cliente mandou o telefone dele, logo
// consentiu" — que é exatamente a inferência proibida. Ela recebe um REGISTRO,
// e um registro que não tenha as quatro provas de procedência é tratado como
// registro ausente.
//
// ── O QUE NENHUM CONSENTIMENTO DESTRAVA ────────────────────────────────────
// Contratação e pagamento. O CEO escreveu "permanecem obrigatoriamente no
// 99Freelas", e a plataforma sanciona pagamento por fora com BANIMENTO — que
// alcança outras contas do mesmo titular. Não existe caminho neste arquivo que
// devolva `pode: true` para essas duas, com ou sem consentimento, antes ou
// depois da garantia. Não é uma checagem: é a ausência de um ramo.

/** O que se quer fazer para fora do canal. Conjunto FECHADO. */
export type EscopoDeSaida =
  /** Trocar telefone, e-mail, WhatsApp — dado de contato de qualquer lado. */
  | "dado_de_contato"
  /** Mandar o cliente preencher o briefing numa página da Dioli. */
  | "briefing_externo"
  /** Fechar contrato fora da plataforma. NUNCA liberado — existe no tipo para
   *  que o chamador possa PERGUNTAR e receber um não fundamentado. */
  | "contratacao"
  /** Receber pagamento fora da plataforma. NUNCA liberado, idem. */
  | "pagamento";

const ESCOPOS: readonly string[] = ["dado_de_contato", "briefing_externo", "contratacao", "pagamento"];

/**
 * Os dois que nenhum consentimento, garantia ou decisão de gerente destrava.
 * Lista FECHADA e conferida contra `policy.json.proibicoes_de_conteudo`.
 */
const NUNCA_SAEM: readonly EscopoDeSaida[] = ["contratacao", "pagamento"];

export function escopoDeclarado(valor: unknown): EscopoDeSaida | null {
  return typeof valor === "string" && ESCOPOS.includes(valor) ? (valor as EscopoDeSaida) : null;
}

/**
 * O estado da garantia de pagamento na plataforma.
 *
 * `nao_confirmada` é o default de propósito e cobre TRÊS casos que a tela
 * precisa distinguir mas o portão não: não houve garantia, não conseguimos
 * ler, e leu algo que não entendemos. Os três dão no mesmo lugar aqui —
 * ausência de informação não é informação.
 */
export type Garantia = "confirmada" | "nao_confirmada";

export function garantiaDeclarada(valor: unknown): Garantia {
  return valor === "confirmada" ? "confirmada" : "nao_confirmada";
}

/**
 * O registro de consentimento. As quatro provas de procedência são
 * OBRIGATÓRIAS, e é isso que impede a inferência de se disfarçar de registro:
 * um código que "deduziu" o consentimento não tem o que escrever em
 * `palavrasDoCliente`, porque o cliente não disse nada.
 */
export interface ConsentimentoDeSaida {
  /** Para QUE o cliente consentiu. Consentir em briefing externo não é
   *  consentir em trocar telefone — escopo é por item, nunca "para tudo". */
  escopo: EscopoDeSaida;
  /** Quando foi registrado. Data inválida = registro inválido. */
  registradoEm: Date;
  /** O que o CLIENTE escreveu, literal. É a prova. Vazio = sem prova. */
  palavrasDoCliente: string;
  /** Quem da casa registrou. Registro sem autor não se audita. */
  registradoPor: string;
  /**
   * Como o consentimento entrou. **Só `"declaracao_do_cliente"` vale.**
   * Este campo existe para que a inferência proibida tenha de MENTIR
   * explicitamente para passar, em vez de escorregar por omissão — quem
   * escrever `origem: "inferido_da_conversa"` está barrado pelo tipo E pelo
   * valor, e quem omitir cai no default `null` e também é barrado.
   */
  origem: "declaracao_do_cliente";
}

export type VereditoDeSaida =
  | { pode: true; escopo: EscopoDeSaida; consentimentoEm: Date }
  | { pode: false; motivo: string; regra: RegraDeSaida };

/** Por que foi barrado. Conjunto FECHADO — a tela mostra motivo, não adivinha. */
export type RegraDeSaida =
  | "escopo_desconhecido"
  | "nunca_sai_da_plataforma"
  | "antes_da_garantia"
  | "sem_consentimento_registrado"
  | "consentimento_de_outro_escopo"
  | "consentimento_malformado";

export interface PedidoDeSaida {
  escopo: unknown;
  garantia: unknown;
  /** O registro, quando existir. `null`/ausente = não existe, e isso BLOQUEIA. */
  consentimento?: ConsentimentoDeSaida | null;
}

/**
 * O portão. Ordem das checagens é deliberada e não é estética:
 *
 *   1. escopo ilegível  → barra antes de qualquer coisa (não sabemos o que se
 *      está pedindo, então não há como liberar);
 *   2. contratação/pagamento → barra ANTES de olhar garantia e consentimento,
 *      porque nenhum dos dois muda a resposta, e olhar primeiro sugeriria que
 *      poderiam mudar;
 *   3. garantia → o piso do CEO;
 *   4. consentimento → a condição, com as quatro provas de procedência.
 */
export function avaliarSaidaDoCanal(pedido: PedidoDeSaida): VereditoDeSaida {
  const escopo = escopoDeclarado(pedido.escopo);
  if (escopo === null) {
    return {
      pode: false,
      regra: "escopo_desconhecido",
      motivo: `escopo de saída ilegível: ${JSON.stringify(pedido.escopo)}. Conjunto fechado: ${ESCOPOS.join(", ")}.`,
    };
  }

  if (NUNCA_SAEM.includes(escopo)) {
    return {
      pode: false,
      regra: "nunca_sai_da_plataforma",
      motivo:
        `"${escopo}" nunca sai do 99Freelas — ordem do CEO de 30/08/2026 ` +
        `("contratação e pagamento permanecem obrigatoriamente no 99Freelas") e ` +
        `Termos de Uso, que sancionam pagamento por fora com banimento alcançando ` +
        `outras contas do mesmo titular. Garantia e consentimento não mudam isto.`,
    };
  }

  if (garantiaDeclarada(pedido.garantia) !== "confirmada") {
    return {
      pode: false,
      regra: "antes_da_garantia",
      motivo:
        `garantia de pagamento não confirmada — antes dela, contato e link externo ` +
        `são bloqueados (policy.json · proibicoes_de_conteudo.dado_de_contato: ` +
        `"proibido até o cliente fazer a garantia de pagamento").`,
    };
  }

  const c = pedido.consentimento;
  if (c === null || c === undefined) {
    return {
      pode: false,
      regra: "sem_consentimento_registrado",
      motivo:
        `garantia confirmada, mas NÃO HÁ consentimento registrado. Sem registro, ` +
        `comporta-se como antes da garantia — o consentimento não pode ser inferido ` +
        `do estado da conversa.`,
    };
  }

  const malformado = conferirProcedencia(c);
  if (malformado !== null) {
    return { pode: false, regra: "consentimento_malformado", motivo: malformado };
  }

  if (c.escopo !== escopo) {
    return {
      pode: false,
      regra: "consentimento_de_outro_escopo",
      motivo:
        `o consentimento registrado é para "${c.escopo}", e o que se pede é ` +
        `"${escopo}". Consentimento é por item: consentir em briefing externo ` +
        `não é consentir em trocar contato.`,
    };
  }

  return { pode: true, escopo, consentimentoEm: c.registradoEm };
}

/**
 * As quatro provas de procedência. Devolve a mensagem do que falta, ou `null`
 * quando o registro se sustenta.
 *
 * Cada uma existe contra um jeito específico de a inferência se disfarçar:
 * `origem` contra o código que deduziu, `palavrasDoCliente` contra o registro
 * sem prova, `registradoPor` contra o registro sem autor, `registradoEm`
 * contra a data inventada ou zerada.
 */
function conferirProcedencia(c: ConsentimentoDeSaida): string | null {
  if (c.origem !== "declaracao_do_cliente") {
    return `consentimento com origem "${String(c.origem)}" — só vale "declaracao_do_cliente". Consentimento deduzido da conversa não é consentimento.`;
  }
  if (typeof c.palavrasDoCliente !== "string" || c.palavrasDoCliente.trim() === "") {
    return `consentimento sem as palavras do cliente — o registro existe para ser a prova, e prova vazia não prova.`;
  }
  if (typeof c.registradoPor !== "string" || c.registradoPor.trim() === "") {
    return `consentimento sem autor do registro — registro que ninguém assinou não se audita.`;
  }
  if (!(c.registradoEm instanceof Date) || Number.isNaN(c.registradoEm.getTime())) {
    return `consentimento sem data válida de registro.`;
  }
  if (escopoDeclarado(c.escopo) === null) {
    return `consentimento com escopo ilegível: ${JSON.stringify(c.escopo)}.`;
  }
  return null;
}

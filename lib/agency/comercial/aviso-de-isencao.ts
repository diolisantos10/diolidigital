// aviso-de-isencao.ts — O QUE O PARCEIRO LÊ. A fechadura da trava que já existia.
//
// ═══════════════════════════════════════════════════════════════════════════
// O DEFEITO, MEDIDO — NONA OCORRÊNCIA DA MESMA FAMÍLIA (27/08/2026)
// ═══════════════════════════════════════════════════════════════════════════
//
// A casa tinha o mecanismo de parceria INTEIRO do lado de dentro:
// `ParceriaDoCliente` (autorização no nível do parceiro), `IsencaoDeParceria`
// derivada por pedido, e o portão de pagamento devolvendo `parceria_isenta` e
// liberando a esteira sem um centavo. Tudo testado, tudo no ar.
//
// E o CLIENTE PARCEIRO NUNCA FICAVA SABENDO. Medido por busca no código:
//
//   grep -rn "parceria" app/proposta/                                → ZERO
//   grep -rn "parceria" lib/email/templates.ts                       → ZERO
//   grep -rn "parceria" lib/agency/esteira/orcamento-do-briefing.ts  → ZERO
//
// O parceiro recebia o e-mail de "seu orçamento está pronto", abria a página da
// proposta, e via PREÇO e um botão de ACEITAR como qualquer cliente pagante. A
// casa sabia que ele não paga nada e não contava a ele em lugar nenhum.
//
// A pergunta obrigatória desta casa é **"quem CHAMA isto?"** — e a resposta era
// NINGUÉM. É a trava construída sem a fechadura, de novo.
//
// Palavras do CEO: *"Ele está esperando o orçamento; o orçamento tem que ver, e
// em seguida dizendo que o orçamento foi liberado cem por cento porque é
// parceria."*
//
// ═══════════════════════════════════════════════════════════════════════════
// ⚠️⚠️ NENHUM `import` DE BANCO NESTE ARQUIVO — NEM ESTÁTICO, NEM DINÂMICO
// ═══════════════════════════════════════════════════════════════════════════
//
// Estes textos são lidos pela PÁGINA DA PROPOSTA, que é um client component e
// roda NO NAVEGADOR. A lição já foi paga nesta casa hoje de manhã, e está
// escrita no topo de `parceria-declarada.ts`: um `await import("@/lib/db/client")`
// dentro de função NÃO impede o empacotador de arrastar o Prisma para o cliente.
// `tsc` passou, 7.000 testes passaram, e quem reprovou foi o `npm run build`.
//
// Régua e TEXTO puros ficam aqui. A leitura do banco fica em
// `parceria-do-parceiro.ts` (`parceriaVivaDoCliente`), que só o servidor importa.
//
// ═══════════════════════════════════════════════════════════════════════════
// O QUE ISTO NÃO É
// ═══════════════════════════════════════════════════════════════════════════
//
// NÃO é uma segunda régua de parceria. Ninguém aqui decide se há isenção — quem
// decide é `parceriaVivaDoCliente`, no servidor, a partir do `clientId` que o
// servidor derivou do token. *Verdade escrita em dois lugares já está errada em
// um deles.* Este arquivo só sabe VESTIR um fato que já chegou pronto.
//
// E ausência de isenção significa cliente PAGANTE, sempre: sem parceria viva,
// sem leitura possível, banco fora do ar → o comportamento de hoje, com preço e
// com o portão fechando. *"Não sei" nunca vira "isento".*

/**
 * A isenção COMO O CLIENTE PODE VÊ-LA. Um recorte deliberado de `ParceriaViva`:
 * o teto de IA e as peças contratadas são conta interna e não sobem para a tela.
 *
 * `validaAte` chega como texto ISO porque este objeto atravessa JSON (a rota da
 * proposta → o navegador), e uma `Date` não sobrevive a essa travessia. Data
 * ilegível NÃO vira "vale para sempre" — ver `dataPorExtenso`.
 */
export type IsencaoVisivel = {
  autorizadaPor: string;
  /** ISO 8601. */
  validaAte: string;
  escopo: string;
};

/** O título do bloco. Uma constante porque vários lugares o citam — a tela, o
 *  teste e o contexto do SDR — e cópias divergem na primeira edição. */
export const TITULO_DA_ISENCAO = "Este orçamento está 100% isento por parceria";

/**
 * A frase que não pode faltar em lugar nenhum: **nada será cobrado**.
 *
 * Ela é o motivo deste arquivo existir. O valor pode continuar aparecendo como
 * referência do que o trabalho vale — isso é bom, mostra o tamanho do
 * investimento —, mas o cliente tem de sair da tela sem dúvida de que não vai
 * pagar. Um número sem esta frase ao lado é uma cobrança na cabeça de quem lê.
 */
export const NADA_SERA_COBRADO =
  "Você não vai pagar nada por este projeto: não há cobrança, não há fatura e não há link de pagamento.";

/**
 * A data em português, ou `null` quando ilegível.
 *
 * ⛔ Ilegível devolve `null` e QUEM CHAMA omite a linha da validade — nunca
 * escreve "sem prazo" nem "vale para sempre". É a mesma regra do portão de
 * pagamento: sem validade conferível não há promessa de validade.
 */
export function dataPorExtenso(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * O bloco que o cliente parceiro lê, em linhas.
 *
 * Diz as três coisas que ele precisa saber e nada além: que é isento, até
 * quando, e o que a parceria cobre. Sem id, sem nome de sistema, sem teto de
 * custo — o que é conta da casa fica na casa.
 */
export function textoDaIsencao(p: IsencaoVisivel): string[] {
  const linhas: string[] = [`${TITULO_DA_ISENCAO}.`, NADA_SERA_COBRADO];

  const ate = dataPorExtenso(p.validaAte);
  // Sem data legível a linha SOME. Ausência de informação não é informação, e
  // inventar "sem prazo" aqui seria prometer parceria eterna por defeito de dado.
  if (ate) linhas.push(`A parceria vale até ${ate}.`);

  const escopo = (p.escopo ?? "").trim();
  if (escopo) linhas.push(`O que ela cobre: ${escopo}.`);

  linhas.push(
    "O valor citado aparece só como referência do que este trabalho vale — é o tamanho do " +
      "investimento da casa neste projeto, não uma cobrança.",
  );
  return linhas;
}

/**
 * A linha do E-MAIL. Uma só, e sem número.
 *
 * ⛔ MANTÉM A ORDEM DO CEO DE 27/08/2026: **valor NÃO vai no corpo do e-mail.**
 *   *"Eu não acho que o valor tem que estar estampado no e-mail."*
 *
 * Dizer "isento" não é dizer preço — e é por isso que esta frase não carrega
 * nem a faixa, nem o escopo, nem a palavra "R$". O e-mail continua sendo um
 * convite; quem mostra o número (como referência) é a página.
 */
export const LINHA_DE_ISENCAO_NO_EMAIL =
  "Uma coisa antes de você abrir: este orçamento está 100% isento por parceria. " +
  "Nada será cobrado de você — o que está lá é o escopo do trabalho, para você conferir e aceitar.";

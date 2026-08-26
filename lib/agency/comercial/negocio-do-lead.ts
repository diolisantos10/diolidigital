// NOME DO NEGÓCIO — ausência DECLARADA, nunca string vazia.
//
// ── A CICATRIZ QUE ESTE ARQUIVO FECHA (16/08/2026) ──────────────────────────
//
// `prospect-engine.ts` parou de gravar o e-mail do prospect como se fosse o
// nome do negócio (commit `1f9c4f6b`). Isso fechou a mentira — mas abriu um
// buraco diferente: `businessName` na coluna do banco é `String` NÃO-NULO
// (`prisma/schema.prisma`), então "não sei o nome do negócio" grava `""`.
//
// Os dois leitores da porta da frente (`quem-bateu-na-porta.ts` e
// `dossie-do-lead.ts`) repassavam `businessName` cru. String vazia renderizada
// numa tela é um BURACO BRANCO — e um buraco branco é ambíguo: quem olha não
// sabe se o negócio não foi informado, se o dado se perdeu no caminho, ou se a
// tela quebrou. Esta casa já pagou por essa ambiguidade uma vez: "falha de
// leitura nunca vira zero" foi a lição do Sushi Cazza (51 dias, fila invisível
// por sete semanas) — e vazio-com-cara-de-dado é o mesmo defeito, em ponto menor.
//
// ── A LEI ────────────────────────────────────────────────────────────────
//
// Ausência de informação não é informação. `lerNegocio` é o ÚNICO lugar que
// decide "isto é um nome ou isto é nada" — os dois leitores da porta importam
// daqui, para não haver duas cópias da mesma regra divergindo na primeira vez
// que alguém mexer numa e esquecer a outra (o mesmo motivo que fez
// `contato-do-lead.ts` existir).

/** `null` quando o nome do negócio não foi informado — NUNCA string vazia. */
export function lerNegocio(businessName: string | null | undefined): string | null {
  const v = typeof businessName === "string" ? businessName.trim() : "";
  return v.length > 0 ? v : null;
}

/** O rótulo que a tela mostra no lugar do nome — em português, e nunca um traço solto. */
export const NEGOCIO_NAO_INFORMADO = "Negócio não informado";

// ─── O NOME QUE A CASA JÁ TINHA, E NÃO ESTAVA OLHANDO (8ª volta, 26/08/2026) ─
//
// MEDIDO EM PRODUÇÃO: uma entrega de Estratégia nasceu com
// **"PRECISO CONFIRMAR: nome do negócio"** no TÍTULO — o primeiro campo que o
// cliente lê — e o nome estava no escopo desde o PRIMEIRO turno da conversa.
//
// A causa é a de sempre nesta casa: a mesma verdade escrita em dois lugares. O
// nome do negócio mora na COLUNA `ClientRequestDb.businessName` e também em
// `briefingJson.scope.businessName`, e os leitores da produção só olhavam a
// coluna — que é `String` NÃO-NULO e portanto grava `""` quando a porta não
// soube o nome. Vazio na coluna, nome no escopo, e o especialista foi instruído
// a falar de "o cliente".
//
// Honestidade é boa: "PRECISO CONFIRMAR" é o especialista admitindo que não
// sabe, e essa admissão salva a casa de inventar. Perguntar o que já se sabe
// não é honestidade — é a casa não ter lido a própria memória.
//
// Um leitor só, e as duas fontes na ordem da FORÇA: a coluna (o que a porta
// declarou), depois o escopo (o que o cliente disse na conversa), depois o
// cadastro do cliente. Nenhuma delas inventa: as três são coisas que alguém
// escreveu de fato.

/** O nome do negócio olhando TODAS as memórias da casa. `null` quando nenhuma
 *  delas sabe — e `null` continua sendo a resposta honesta. */
export function nomeDoNegocio(fontes: {
  businessName?: string | null;
  briefingJson?: string | null;
  clientName?: string | null;
}): string | null {
  return (
    lerNegocio(fontes.businessName) ??
    lerNegocio(negocioNoBriefing(fontes.briefingJson)) ??
    lerNegocio(fontes.clientName)
  );
}

/** `briefingJson.scope.businessName`, tolerante a JSON quebrado — texto de
 *  coluna que não abre não pode derrubar a produção. */
function negocioNoBriefing(briefingJson: string | null | undefined): string | null {
  if (typeof briefingJson !== "string" || !briefingJson.trim()) return null;
  try {
    const o = JSON.parse(briefingJson) as { scope?: { businessName?: unknown } };
    const v = o?.scope?.businessName;
    return typeof v === "string" ? v : null;
  } catch {
    return null;
  }
}

/**
 * ─── O TÍTULO NÃO CARREGA CONFISSÃO SOBRE O QUE A CASA SABE ─────────────────
 *
 * O título vira o `name` do Deliverable: é o primeiro campo que o cliente lê, e
 * é rótulo, não conteúdo. Uma lacuna legítima pertence ao CORPO da peça, onde
 * ela é uma pergunta com contexto; no rótulo ela vira a etiqueta do trabalho.
 *
 * E quando a lacuna é sobre um dado que a casa TEM, ela não é nem lacuna: é
 * leitura que faltou. Aqui o título cai para o rótulo determinístico que o
 * próprio caminho já calculava como padrão — nunca para um nome inventado.
 *
 * ⚠️ Não mexe no corpo, e não mexe no título que não confessa nada. Sem nome
 * conhecido, o título fica como está: apagar a confissão sem ter a resposta
 * seria esconder a dúvida, que é pior do que mostrá-la.
 */
export function tituloSemConfissao(
  titulo: string,
  padrao: string,
  nomeConhecido: string | null,
): string {
  if (!/PRECISO CONFIRMAR/i.test(titulo)) return titulo;
  if (!nomeConhecido) return titulo;
  return padrao;
}

// autoria-da-aprovacao.ts — A GRAMÁTICA DE `reviewedBy`, NUM LUGAR SÓ. PURA.
//
// ─── O DEFEITO QUE ISTO FECHA (15/08/2026) ──────────────────────────────────
//
// O CEO abriu o portal da CityJobs procurando os criativos e apertou "Aprovar as
// entregas prontas". `marcos.aprovarPacote` gravou `reviewedBy: "cliente"` —
// seco, sem nome. E aí o sistema ficou nos DOIS erros ao mesmo tempo:
//
//   • para o CEO, a peça aparecia APROVADA (o carimbo existe, o portal o mostra);
//   • para o publicador, ela NÃO estava aprovada e nunca sairia, porque
//     `aprovacao-da-peca.decisaoEhDoCliente` recusa essa grafia de propósito —
//     `aprovarPacote` também é alcançável por rota de SESSÃO DA AGÊNCIA
//     (`app/api/projects/[id]/esteira`), e ali a mesma string significaria
//     "alguém da casa clicou pelo cliente". Autoria ambígua não é autoria.
//
// Recusar a grafia na LEITURA estava certo. O erro era continuar ESCREVENDO ela.
// Um carimbo que a própria casa não aceita não deveria existir no banco: ele só
// serve para mentir para um lado e travar o outro.
//
// ─── A REGRA ────────────────────────────────────────────────────────────────
//
// Toda decisão gravada em `ApprovalRequest.reviewedBy` diz QUEM decidiu, com
// uma de DUAS grafias e nenhuma terceira:
//
//   • `client:<nome>` — o CLIENTE, pelo portal dele, com token validado. É a
//     única que a trava de publicação aceita, e é a mesma que
//     `app/api/portal/approvals/route.ts` já escrevia.
//   • `equipe:<email>` — alguém da AGÊNCIA, declaradamente, por rota de sessão.
//     Mesma grafia de `registro-de-publicacao.autorDaEquipe`. Não publica peça,
//     e é exatamente isso que ela deve significar.
//
// **A agência nunca se disfarça de cliente.** Quem constrói o carimbo é o
// caminho de autenticação — token de portal ⇒ `client:`, sessão ⇒ `equipe:` —
// nunca o corpo do pedido. Aceitar `reviewedBy` do corpo numa rota de sessão
// seria dar à casa o poder de assinar no lugar do cliente, e a trava de
// publicação abriria a porta achando que foi ele.
//
// ─── POR QUE PURA, E POR QUE AQUI ───────────────────────────────────────────
//
// Sem `prisma`, sem HTTP, sem import de esteira. `aprovacao-da-peca.ts` é
// carregado por `lib/integrations/meta/trava-de-publicacao` e não pode engordar;
// e a régua precisa ser afirmável em teste sem montar meia casa. É o mesmo
// remédio de `registro-de-publicacao.ts`.

/** O prefixo do CLIENTE. Igual ao de `aprovacao-da-peca.PREFIXO_DO_CLIENTE` —
 *  duplicá-lo aqui seria criar a segunda fonte de verdade que esta casa já
 *  pagou caro; por isso aquele módulo passa a importar deste. */
export const PREFIXO_DO_CLIENTE = "client:";

/** O prefixo da AGÊNCIA. Mesma grafia de `registro-de-publicacao.autorDaEquipe`. */
export const PREFIXO_DA_EQUIPE = "equipe:";

/**
 * A grafia PROIBIDA: `"cliente"` seco, sem nome.
 *
 * Ela existiu em produção (`marcos.aprovarPacote`, até 15/08/2026) e continua
 * existindo em linhas antigas do banco — por isso a LEITURA precisa saber
 * reconhecê-la (é o que `reverter-aprovacao-do-pacote.ts` procura). O que deixa
 * de existir é a ESCRITA.
 */
export const CARIMBO_SECO = "cliente";

/** Quem decidiu, pelo caminho por onde ele entrou. Nunca pelo que ele digitou. */
export type AutoriaDaAprovacao =
  /** Token de portal validado. O nome é do cliente, e ele tem nome. */
  | { tipo: "cliente"; nome: string | null | undefined }
  /** Sessão da agência. O email é de quem está logado. */
  | { tipo: "equipe"; email: string | null | undefined };

/** Corta o que não pode virar carimbo: quebra de linha, espaço duplo e um
 *  tamanho que não cabe na coluna nem numa linha de relatório. */
function limpar(bruto: string | null | undefined): string {
  return (bruto ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
}

/**
 * O carimbo, construído a partir do caminho de autenticação.
 *
 * Cliente sem nome NÃO vira `"cliente"` seco (era exatamente esse o defeito):
 * vira `client:portal` — a autoria continua declarando de que LADO veio a
 * decisão, que é a pergunta que a trava de publicação faz. Quem quiser o nome
 * próprio o passa; quem não tem, não ganha uma grafia ambígua de brinde.
 */
export function carimboDaAutoria(autoria: AutoriaDaAprovacao): string {
  if (autoria.tipo === "cliente") {
    const nome = limpar(autoria.nome);
    return `${PREFIXO_DO_CLIENTE}${nome || "portal"}`;
  }
  const email = limpar(autoria.email);
  return `${PREFIXO_DA_EQUIPE}${email || "desconhecido"}`;
}

/** O parecer da régua de escrita. Nunca um booleano seco: quem recusa precisa
 *  dizer por quê, e a frase é uma só para a casa inteira (guardrail 6). */
export type CarimboConferido =
  | { ok: true; carimbo: string }
  | { ok: false; motivo: string };

/**
 * ESTE CARIMBO PODE SER GRAVADO?
 *
 * A trava de escrita. Chamada por `approval-service.updateApprovalStatus` e
 * `decidirIrmaosGenericos` — os dois pontos por onde uma decisão vira linha no
 * banco — para que nenhuma rota nova precise lembrar da regra.
 *
 * Recusa, e cada recusa é um defeito diferente:
 *   • vazio        — aprovação sem autor não é aprovação, é carimbo;
 *   • `"cliente"`  — a grafia ambígua de 15/08. É a que motivou este arquivo;
 *   • sem prefixo  — grafia inventada por caminho novo. Fail-closed: uma terceira
 *     grafia que ninguém lê é uma aprovação que a publicação nunca vai aceitar,
 *     e o cliente veria "aprovado" para sempre sem nada sair.
 */
export function conferirCarimbo(reviewedBy: string | null | undefined): CarimboConferido {
  const cru = limpar(reviewedBy);

  if (!cru) {
    return {
      ok: false,
      motivo:
        "Decisão sem autor: `reviewedBy` vazio. Aprovação sem quem a tomou não é aprovação, é carimbo — " +
        `grave \`${PREFIXO_DO_CLIENTE}<nome>\` (cliente, por token de portal) ou ` +
        `\`${PREFIXO_DA_EQUIPE}<email>\` (agência, por sessão).`,
    };
  }

  if (cru.toLowerCase() === CARIMBO_SECO) {
    return {
      ok: false,
      motivo:
        `A grafia "${CARIMBO_SECO}" (seca, sem nome) não é gravável desde 15/08/2026. Ela mentia dos dois ` +
        "lados: o portal mostrava a entrega como aprovada e a trava de publicação recusava a mesma linha, " +
        "porque essa string também é o que a rota de sessão da agência gravaria. Use " +
        `\`${PREFIXO_DO_CLIENTE}<nome>\` quando a decisão vier do portal do cliente (token validado) e ` +
        `\`${PREFIXO_DA_EQUIPE}<email>\` quando vier de sessão da agência.`,
    };
  }

  const ehCliente = cru.toLowerCase().startsWith(PREFIXO_DO_CLIENTE) && cru.length > PREFIXO_DO_CLIENTE.length;
  const ehEquipe = cru.toLowerCase().startsWith(PREFIXO_DA_EQUIPE) && cru.length > PREFIXO_DA_EQUIPE.length;
  if (!ehCliente && !ehEquipe) {
    return {
      ok: false,
      motivo:
        `Grafia desconhecida em \`reviewedBy\`: "${cru}". Só existem duas, e elas não valem o mesmo: ` +
        `\`${PREFIXO_DO_CLIENTE}<nome>\` (o cliente decidiu, pelo portal dele — é a única que libera ` +
        `publicação) e \`${PREFIXO_DA_EQUIPE}<email>\` (a agência decidiu, declaradamente). Uma terceira ` +
        "grafia grava uma aprovação que nenhuma trava desta casa sabe ler: o cliente veria 'aprovado' " +
        "para sempre e nada iria ao ar.",
    };
  }

  return { ok: true, carimbo: cru };
}

/** O erro que a trava de escrita lança. Tipo próprio para quem chama poder
 *  distinguir "regra da casa" de "banco caiu" — as duas viram 500 se ninguém
 *  olhar, e só uma delas é defeito de infraestrutura. */
export class CarimboRecusado extends Error {
  constructor(motivo: string) {
    super(motivo);
    this.name = "CarimboRecusado";
  }
}

/**
 * Confere e devolve, ou LANÇA. É a forma usada nos pontos de escrita: um caminho
 * novo que esqueça a regra quebra alto, em vez de gravar em silêncio uma linha
 * que a publicação nunca vai aceitar.
 */
export function exigirCarimbo(reviewedBy: string | null | undefined): string {
  const parecer = conferirCarimbo(reviewedBy);
  if (!parecer.ok) throw new CarimboRecusado(parecer.motivo);
  return parecer.carimbo;
}

// trava-de-publicacao.ts — A TRAVA DA PUBLICAÇÃO ORGÂNICA. SERVER-ONLY.
//
// ─── O BURACO QUE ISTO FECHA (07/08/2026) ───────────────────────────────────
//
// Em 06/08/2026 a casa fechou a trava de ativos autorizados
// (`ativos-autorizados.ts`). Ela cobria TRÊS caminhos:
//
//   • leitura de anúncios      (`ads-leitura.ts`)
//   • gravação de conexão      (`connections.saveConnection`)
//   • escrita de anúncio       (`ads.ts`)
//
// E deixava o quarto de fora: **PUBLICAR NO INSTAGRAM E NO FACEBOOK**.
// `publishPost` recebia um `connectionId`, carregava o token e postava. Não
// perguntava a NINGUÉM se aquele perfil podia receber conteúdo desta casa.
//
// Isso não era teórico. Medido em produção em 07/08/2026, às 01h:
//
//   • os 6 carrosséis da Foocci estavam `scheduled` para 07/08 às 10:00 UTC,
//     com as 6 telas v4 completas e a capa como tela 1 — isto é, PRONTOS;
//   • `MetaConnection` tinha `@foocci_` (17841443818801353) `connected`, com o
//     escopo `instagram_content_publish` no token;
//   • o despertador (`instrumentation.ts` → `ligarDespertador`) roda a cada 5
//     minutos, em produção, sem condição nenhuma, e chama `publicarAgendados`.
//
// Ou seja: faltavam nove horas para a casa publicar sozinha, em nome de um
// cliente, contra a ordem explícita do CEO de que nada vai à Meta sem decisão
// dele. Ninguém teria apertado um botão. É o mesmo formato do incidente de
// 03/08 — a máquina agindo sozinha na Meta — e daquela vez custou a conta de
// anúncios da agência.
//
// ─── AS DUAS PERGUNTAS, NESTA ORDEM ─────────────────────────────────────────
//
// 1. **ESTE PERFIL É NOSSO DE DIREITO?** O ativo tem de estar na lista que o
//    DONO marcou (`MetaAtivoAutorizado`). Mesma trava, mesmo mecanismo e mesma
//    função (`ativoAutorizado`) que a leitura e a escrita de anúncio já usam —
//    um segundo mecanismo divergiria, e o incidente voltaria pela porta que
//    ninguém está olhando.
//
// 2. **A CASA ESTÁ AUTORIZADA A PUBLICAR, HOJE?** Pergunta diferente da
//    primeira, e ela não se responde com dado de banco. Ver abaixo.
//
// ─── POR QUE A PERGUNTA 2 EXISTE (e por que ela é fail-closed) ──────────────
//
// A pergunta 1, sozinha, NÃO teria impedido a publicação das 10:00: `@foocci_`
// ESTÁ na lista de autorizados. E, mesmo assim, publicar hoje é NÃO PODE — por
// razões que a lista de ativos não conhece e nunca vai conhecer:
//
//   • O app `Dioli Digital Studio` está em **modo de desenvolvimento**. Nesse
//     modo o app só opera em nome de quem tem FUNÇÃO nele (Administrador,
//     Desenvolvedor, Testador). Cliente não tem função no nosso app.
//     (fonte: docs/plataformas/meta/fontes/app-modos-dev-vs-live.md)
//   • `instagram_content_publish` publicando em nome de terceiro exige **App
//     Review**: "se o app se destina a ser usado por pessoas sem função nele,
//     ele precisa passar pela análise". A análise não foi feita.
//     (fonte: docs/plataformas/meta/fontes/app-review-processo.md)
//   • O token de hoje TEM o escopo porque quem clicou "Conectar" foi o próprio
//     CEO, que é admin do app. O escopo estar no token prova que a chamada
//     PASSARIA — não prova que ela é permitida. Foi exatamente essa confusão
//     ("a API deixou, então pode") que restringiu a conta de anúncios em 03/08.
//     (fonte: docs/plataformas/meta/fontes/termos-da-plataforma.md — a Meta
//     audita a atividade do app e pune o APP, não só a conta)
//
// Nada disso é legível a partir do banco desta casa. É uma DECISÃO, e decisão
// de publicar em nome de cliente é do CEO. Por isso a pergunta 2 é um
// interruptor explícito, e por isso ele é FAIL-CLOSED: ausência de decisão
// nunca vira permissão. Um aviso no log não teria segurado as 10:00 — só uma
// trava segura. ("Trava, não aviso.")
//
//     PUBLICACAO_ORGANICA=liberada   → a casa publica
//     (variável ausente ou qualquer  → NADA vai à Meta, e a recusa é dita
//      outro valor)                     em português, no painel
//
// ─── AS TRÊS PROPRIEDADES, HERDADAS E NÃO REINVENTADAS ──────────────────────
//
// 1. **DERIVADA, NUNCA COMPARADA.** O dono do ativo NÃO vem do pedido HTTP nem
//    do post: vem da própria linha de `MetaConnection` cujo token vai ser
//    usado (`loadConnectionToken` já devolve `clientId` normalizado). A
//    pergunta certa é "de quem é ESTE token?", não "de quem o chamador disse".
// 2. **FAIL-CLOSED.** Sem lista, sem interruptor, ou com o banco fora do ar:
//    NÃO PUBLICA. `idsAutorizados` já devolve conjunto vazio em erro de banco.
// 3. **NO CAMINHO ÚNICO.** A conferência mora dentro de `publishPost`, que é
//    por onde passam os dois chamadores vivos (`esteira/publicacao.ts` e
//    `app/api/meta/publish/route.ts`) e por onde passará o terceiro, escrito
//    amanhã por alguém que nunca leu este arquivo.
//
// ⛔ A RECUSA ACONTECE ANTES DE QUALQUER CHAMADA DE REDE. Não é "tenta e
//    desfaz" — publicação é irreversível, e uma tentativa recusada pela Meta
//    ainda assim conta como tentativa contra a reputação do app.

import { ativoAutorizado, TIPO_POR_PLATAFORMA, donoDe } from "./ativos-autorizados";

/** O parecer, no formato da casa: pode, ou não pode COM MOTIVO LEGÍVEL. */
export type ParecerDePublicacao =
  | { pode: true }
  | { pode: false; motivo: string };

/** O valor que libera. Qualquer outra coisa — inclusive vazio — barra. */
export const VALOR_QUE_LIBERA = "liberada";

/** O nome da variável, num lugar só, para o motivo poder citá-la ao operador. */
export const CHAVE_DA_DECISAO = "PUBLICACAO_ORGANICA";

/**
 * A decisão do CEO existe? Lê o ambiente na HORA da chamada, de propósito:
 * uma constante de módulo congelaria o valor no boot, e o interruptor
 * precisa valer quando ele o vira.
 */
export function publicacaoOrganicaLiberada(): boolean {
  return (process.env[CHAVE_DA_DECISAO] ?? "").trim().toLowerCase() === VALOR_QUE_LIBERA;
}

/** A frase da recusa por falta de decisão. Uma só, para a casa inteira dizer a
 *  mesma coisa — e para ela nunca virar "erro ao publicar", que faria o
 *  operador procurar defeito onde há regra. */
export const FRASE_SEM_DECISAO =
  "A publicação orgânica está DESLIGADA nesta casa: nada vai ao Instagram ou ao " +
  "Facebook sem decisão do CEO. O app está em modo de desenvolvimento e as " +
  "permissões de publicação não passaram por App Review — publicar em nome de " +
  "cliente nessa condição é o que a Meta chama de automação fora das regras. " +
  `Para liberar, o CEO define ${CHAVE_DA_DECISAO}=${VALOR_QUE_LIBERA}.`;

/** A frase da recusa por ativo não autorizado. */
export function fraseAtivoNaoAutorizado(platform: string, externalId: string): string {
  return (
    `Ninguém autorizou publicar em "${externalId}" (${platform}). ` +
    "Só recebe publicação desta casa o perfil que o dono marcou — o cliente no " +
    "portal dele, a agência na tela de Integrações. Conexão existir não é " +
    "autorização: o token alcança muito mais do que foi autorizado."
  );
}

/**
 * O PARECER. Chamado por `publishPost` antes de qualquer chamada de rede.
 *
 * `clientId` tem de vir da linha de conexão — nunca do post, nunca do corpo
 * HTTP. Ver a propriedade 1 no cabeçalho.
 */
export async function conferirPublicacao(entrada: {
  workspaceId: string;
  /** O DONO, derivado da `MetaConnection` cujo token será usado. */
  clientId: string | null;
  platform: string;
  externalId: string;
}): Promise<ParecerDePublicacao> {
  const { workspaceId, platform, externalId } = entrada;
  const dono = donoDe(entrada.clientId);

  // ── 1. O ativo está na lista do dono? ────────────────────────────────────
  // `user` e plataforma desconhecida não têm tipo de ativo: não se publica num
  // token, publica-se num PERFIL. Recusa, em vez de deixar passar por omissão.
  const tipo = TIPO_POR_PLATAFORMA[platform] ?? null;
  if (!tipo || tipo === "ad_account" || tipo === "whatsapp") {
    return {
      pode: false,
      motivo: `Publicação não faz sentido para "${platform}" — só Página do Facebook e conta do Instagram recebem post.`,
    };
  }
  if (!(await ativoAutorizado(workspaceId, dono, tipo, externalId))) {
    return { pode: false, motivo: fraseAtivoNaoAutorizado(platform, externalId) };
  }

  // ── 2. A casa está autorizada a publicar hoje? ───────────────────────────
  // Depois da 1 de propósito: quando as duas barram, o motivo mais específico
  // ("este perfil não é seu") é mais útil ao operador do que o global.
  if (!publicacaoOrganicaLiberada()) {
    return { pode: false, motivo: FRASE_SEM_DECISAO };
  }

  return { pode: true };
}

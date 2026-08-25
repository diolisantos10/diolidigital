// orcamento-do-briefing.ts — o orçamento que já existia e ninguém entregava.
//
// O QUE ACONTECEU, 16/08/2026, com o CEO na tela:
// Ele fez o briefing do CityJobs, anexou dois PDFs e recebeu uma confirmação
// prometendo o orçamento "em breve". Ficou horas esperando. No servidor, entre
// o envio e a madrugada, nada — nenhuma execução, nenhuma fila, nenhum aviso.
//
// A DESCOBERTA QUE ENCURTOU O CONSERTO: o orçamento **já estava calculado**.
// A sala de briefing calcula ao vivo enquanto a conversa acontece
// (`computeEstimate`, número derivado — a IA nunca inventa valor) e envia junto
// no `briefingJson.estimate`. Ou seja: o número existia, estava gravado no
// pedido, e simplesmente nunca era mostrado a ninguém. Não faltava calcular.
// Faltava ENTREGAR.
//
// É o mesmo defeito da casa outra vez: caixa certa, seta faltando.
//
// ─── O QUE ESTE ARQUIVO FAZ, E SÓ ISSO ──────────────────────────────────────
//
// Toda passada do relógio, pega briefing novo que tem orçamento guardado,
// escreve o orçamento na conversa do portal — em português, sem jargão — e
// move o pedido para a fila de proposta, onde gente vê.
//
// ─── O QUE ELE NÃO FAZ, DE PROPÓSITO ────────────────────────────────────────
//
// • **Não calcula nada.** Usa o número que a sala de briefing derivou. Se o
//   pedido não tiver orçamento guardado, ele NÃO inventa um: marca como
//   pendente para gente olhar. Número nesta casa não é alucinado.
// • **Não fecha negócio.** O texto diz que é estimativa e que a proposta final
//   vem da equipe. Faixa de estimativa não é preço acordado.
// • **Não promete prazo.** Ordem do CEO em 16/08: *"não autorizei nada disso"*
//   sobre o "em 1 dia" que a tela prometia. Aqui não se promete data nenhuma.
// • **Não fala duas vezes.** O pedido sai de `new` na mesma transação da
//   mensagem; se uma falhar, nenhuma vale.
//
// ─── A SETA SEGUINTE, 16/08/2026 ────────────────────────────────────────────
//
// Pergunta do CEO, com o piloto no ar: *"nada ainda via e-mail. O que
// aconteceu?"*
//
// O que aconteceu: este arquivo criava o `portalMessage` — **e só isso**. Não
// havia uma linha de e-mail nele. O orçamento ficava esperando dentro do portal
// alguém voltar para olhar. A casa já mandava e-mail na CONFIRMAÇÃO do briefing
// e ficava muda na hora da coisa que o cliente estava esperando.
//
// É o defeito D-003 outra vez, um degrau adiante: **caixa certa, seta
// faltando.** Na véspera o CEO esperou a noite inteira por uma seta; hoje ele
// esperou de novo pela seta seguinte. Consertar uma seta de cada vez, no dia em
// que ela dói, é como se chega ao terceiro dia de espera.
//
// AS QUATRO REGRAS DO AVISO, e nenhuma é decorativa:
//
// 1. **É o caminho de e-mail que já existe** (`lib/email/send.ts` + um template
//    irmão do de confirmação). Um segundo mecanismo de envio significaria dois
//    lugares para configurar remetente, dois para descobrir que a chave sumiu.
// 2. **O e-mail AVISA, não substitui o portal.** A conversa continua sendo a
//    fonte da verdade; o e-mail leva o essencial e o link para ver.
// 3. **Sem canal, não trava nada.** Briefing que entrou sem e-mail continua
//    sendo atendido pelo portal. Faltar contato impede AVISAR, nunca ATENDER —
//    é a mesma lei que fez `lead_incompleto` entrar na busca lá embaixo.
// 4. **Falha de e-mail não desfaz nem repete a entrega.** O envio acontece
//    DEPOIS da transação e nunca é retentado SOZINHO. Ver o bloco de
//    comentário em `avisarPorEmail`: essa ordem é a garantia de que ninguém
//    recebe o mesmo orçamento duas vezes.
//
// ─── A SETA SEGUINTE, AINDA 16/08/2026: A FALHA QUE SOBREVIVE ──────────────
//
// `RESEND_FROM` não existe no Railway (medido). Sem ela, `sendEmail` cai no
// remetente compartilhado, que o Resend só entrega para o dono da própria
// conta — no dia do deploy, TODO prospect da fila falha o aviso. Até aqui a
// falha virava `console.warn` e um `avisosQueFalharam.push(...)` que só vive
// enquanto dura a chamada (`despertador.ts` lê e descarta a cada rodada). Log
// não é fila: ninguém consulta, ninguém reprocessa, e quando o CEO setar a
// variável ninguém é reavisado — o silêncio de 51 dias recriado, invisível.
//
// `gravarResultadoDoAviso` fecha isso: toda tentativa — sucesso incluído —
// grava em `ClientRequestDb.avisoOrcamento*` (migração
// `20260816130000_aviso_de_orcamento_que_falha`). Gravar o SUCESSO também é
// tão obrigatório quanto gravar a falha: é o que autoriza
// `reenviarAvisosQueFalharam` a existir sem virar máquina de duplicata — ela
// só busca `avisoOrcamentoStatus IN ('falhou', 'skipped')`, nunca 'avisado'.
//
// O reenvio é chamado por rota protegida (`app/api/agency/avisos-de-orcamento`),
// nunca pelo relógio de 5 em 5 minutos: a decisão de não retentar sozinho foi
// declarada com motivo no item 4 acima, e não é desta função que ela se
// derruba. O que muda é que a falha deixa de ser terminal — alguém PODE
// mandar reenviar, em vez de o cliente ficar preso a um `console.warn` morto.
//
// ─── A SETA SEGUINTE, AINDA 16/08/2026: OS QUE JÁ FALHARAM ANTES DESTE DEPLOY ──
//
// Auditoria: `a2d06fb1` — a versão anterior deste arquivo, que criava o
// `portalMessage` mas não gravava NENHUM status — **já estava em produção**
// antes desta migração existir. Todo pedido que o relógio processou naquela
// janela saiu de `new` (está em `proposal_pending` ou adiante) e tem
// `avisoOrcamentoStatus = NULL` — não porque ninguém tentou, mas porque a
// coluna que registraria a tentativa não existia ainda.
//
// `NULL` NÃO é `'falhou'`. `NULL` é "NÃO SABEMOS":
//
//   • tratar `NULL` como `'falhou'` e reenviar em massa arrisca duplicata para
//     quem porventura recebeu o e-mail antes de a coluna existir;
//   • tratar `NULL` como `'avisado'` garante o silêncio de quem não recebeu.
//
// Por isso `NULL` vira um terceiro balde — "legado" — nunca um quinto valor
// de status gravado por palpite: não há como saber o que aconteceu, e gravar
// uma suposição seria inventar dado, a mesma proibição que já vale para o
// orçamento em si (ver `estimativaDe`).
//
// O balde só existe uma vez: na primeira tentativa (bem-sucedida ou não) o
// status deixa de ser `NULL` — `gravarResultadoDoAviso` sempre escreve um dos
// quatro valores conhecidos — e o pedido passa a viver no regime normal
// (`'avisado'` some de qualquer balde; `'falhou'`/`'skipped'` migram para a
// fila comum de `reenviarAvisosQueFalharam`). A ambiguidade se autocura.
//
// `reenviarAvisosLegados` é a única porta para esse balde, e ela NUNCA roda
// como efeito colateral do reenvio normal — é ação deliberada, disparada só
// com o campo explícito `incluirLegados: true` no corpo do POST da rota. Quem
// dispara o reenvio padrão não pode atingir os legados por acidente.
//
// ─── A FRONTEIRA DO INQUILINO, 16/08/2026 (devolução do `seguranca`) ───────
//
// As três buscas abaixo (`reenviarAvisosQueFalharam`, `candidatosLegados` e a
// do `GET` da rota irmã) nasceram SEM `workspaceId` no WHERE. `autenticar()`
// na rota confere "existe sessão?" — nunca "esta sessão é dona deste dado?".
// Consequência medida: qualquer funcionário logado, de qualquer workspace,
// enxergava negócio/e-mail/motivo de falha de prospects de TODOS os
// workspaces, e o botão de reenviar disparava e-mail de verdade para
// prospect que não é da agência dele — efeito externo em nome de outro.
//
// O conserto usa a política de posse que já existe
// (`lib/auth/posse-de-workspace.ts`) em vez de escrever uma quarta versão da
// regra: toda função aqui que toca `ClientRequestDb` agora recebe um
// `EscopoDoAviso` OBRIGATÓRIO — nunca um default implícito — e filtra em
// DUAS camadas: o `WHERE` já reduz no banco (`workspaceId = ? OR
// workspaceId IS NULL`), e `apenasDoWorkspace()` filtra de novo em memória
// (a política completa da órfã-com-cliente, que um `WHERE` simples não
// expressa). Duas camadas porque a rota irmã (`app/api/agency/leads`) já
// prova que confiar só no banco é frágil a um WHERE esquecido amanhã.
//
// O CAMINHO POR SEGREDO (`PILOTO_SECRET`/`CRON_SECRET`) NÃO TEM SESSÃO, LOGO
// NÃO TEM WORKSPACE. Decisão, escrita aqui para não ficar implícita: ele é
// `{ casaInteira: true }` — operação da casa inteira, de propósito, pelos
// mesmos dois motivos que o relógio (`entregarOrcamentosPendentes`, acima
// neste arquivo) já opera sem filtro de workspace: (1) quem detém o segredo
// já tem acesso de infraestrutura — o segredo não é uma credencial de
// workspace, é uma credencial de operação da casa; (2) inconsistência seria
// pior: o mesmo pedido apareceria para o relógio e desapareceria para a
// operação manual pelo MESMO segredo. `casaInteira` não é "esqueci de
// filtrar" — é um valor do tipo, obrigatório, com o nome dizendo o que é.

import { prisma } from "@/lib/db/client";
import { apenasDoWorkspace } from "@/lib/auth/posse-de-workspace";
import {
  textoDaVerbaEstourada,
  type ConfrontoDeVerba,
} from "@/lib/agency/comercial/verba-declarada";
import { lerContato } from "@/lib/agency/comercial/contato-do-lead";
import { HOST_PADRAO } from "@/lib/agency/esteira/links-do-portal";
import { computeEstimate } from "@/lib/agency/live-calculator";
import { randomBytes } from "crypto";
import { sendEmail } from "@/lib/email/send";
import { orcamentoProntoEmail } from "@/lib/email/templates";
import { provaDoProprioBriefing } from "@/lib/agency/consentimento/quem-pode-receber";

/** Teto por rodada. O relógio bate de 5 em 5 min; enxurrada nunca. */
const MAX_POR_RODADA = 5;

export type ResultadoDoOrcamento = {
  entregues: number;
  semOrcamento: number;
  /** Quantos clientes receberam o toque no ombro por e-mail. */
  avisados: number;
  /** Entregues pelo portal para quem não deixou canal. Não é falha: é fato. */
  semCanal: number;
  /** O e-mail não saiu, mas a entrega valeu. Vira notícia no despertador. */
  avisosQueFalharam: string[];
  falhas: string[];
};

export type EstimativaGuardada = {
  /** O que o cliente veio buscar, nas palavras dele. Ver o Clube Farol 27. */
  objetivos?: string[];
  totalMin?: number;
  totalMax?: number;
  items?: { label?: string; detail?: string; unit?: string }[];
  included?: string[];
  notIncluded?: string[];
  missingForEstimate?: string[];
  confrontoDeVerba?: ConfrontoDeVerba;
  travadaPor?: string;
};

/** Lê a estimativa que a sala de briefing gravou. Nunca lança: briefing com
 *  JSON quebrado vira "sem orçamento", que é tratado por gente — e não um erro
 *  que derruba a rodada inteira do relógio. */
export function estimativaEntregue(briefingJson: string | null): EstimativaGuardada | null {
  return estimativaDe(briefingJson);
}

function estimativaDe(briefingJson: string | null): EstimativaGuardada | null {
  if (!briefingJson) return null;
  try {
    const corpo = JSON.parse(briefingJson) as { estimate?: EstimativaGuardada };
    const e = corpo?.estimate;
    if (!e || typeof e.totalMin !== "number" || typeof e.totalMax !== "number") return null;
    if (e.totalMin <= 0 && e.totalMax <= 0) return null;

    // ── A TRAVA DO CityJobs (16/08/2026) ────────────────────────────────────
    // Estimativa travada TEM número — e é justamente por isso que ela é
    // perigosa. Naquele briefing o volume de posts chegou zerado, virou "Plano
    // Essencial" por tabela e produziu R$ 1.800–3.400: um total maior que zero,
    // que passaria por todas as conferências acima e chegaria ao cliente como
    // se fosse conta.
    //
    // Aqui ela vale como AUSÊNCIA de orçamento, não como orçamento. O pedido
    // fica de pé onde está e entra na contagem de `semOrcamento` — que é o
    // número que faz gente olhar. Número que não se sustenta não vira preço
    // nesta casa, e o silêncio dele é contado, nunca silencioso.
    if (typeof e.travadaPor === "string" && e.travadaPor.trim()) return null;

    return e;
  } catch {
    return null;
  }
}

const real = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

/**
 * A faixa em uma linha, para o assunto de e-mail e para o cartão do aviso.
 *
 * Sai DAQUI e não do template: o e-mail nunca formata número por conta própria.
 * Um segundo formatador acaba arredondando diferente do portal, e o cliente lê
 * dois valores para o mesmo orçamento — que é como se perde a confiança em um
 * número que estava certo nos dois lugares.
 */
export function faixaDoOrcamento(e: EstimativaGuardada): string {
  const min = e.totalMin ?? 0;
  const max = e.totalMax ?? 0;
  return min === max
    ? `${real(min)} por mês`
    : `${real(min)} a ${real(max)} por mês`;
}

/** Onde a conversa deste pedido mora. `null` quando não há token — e aí o
 *  e-mail sai sem botão, em vez de não sair.
 *
 *  O host é `HOST_PADRAO`, fixo, e NÃO sai de variável de ambiente: um host de
 *  hospedagem na caixa de entrada do cliente ABRE — carrega a página inteira —
 *  e por isso ninguém percebe que não é o endereço da marca. Ordem do CEO em
 *  16/08/2026; a trava que cobra isso é `__tests__/http/endereco-da-casa`. */
/**
 * ═══ A PORTA DE ACEITE DO CLIENTE — cunhada aqui, e só aqui ══════════════════
 *
 * ── O BURACO QUE ESTA FUNÇÃO FECHA (medido em produção, 24/08/2026) ─────────
 *
 * A versão anterior desta função só SABIA LER: procurava um `PortalAccess` do
 * pedido e, quando não achava, devolvia `null`. E não havia quem criasse.
 * Varredura no código inteiro: `createPortalAccess` só era chamado por
 * `POST /api/brain/portal-access` (exige sessão de agência), pelo reset de
 * admin (exige `CRON_SECRET`) e pelo arnês do cliente falso. **Nenhum caminho
 * automático cunhava token para uma SOLICITAÇÃO.**
 *
 * A consequência, medida na produção do dia: zero clientes com projeto. O
 * cursograma tem um "cliente aceitou?"; a porta do aceite
 * (`POST /api/portal/briefing/aceite`) exige token de portal; o token só nascia
 * de uma sessão de staff. **O caminho automático dispensava o painel e não
 * dispensava a credencial** — o funil não foi destravado, a trava andou um
 * passo para a frente.
 *
 * ── POR QUE CUNHAR AQUI NÃO É ABRIR PORTA NOVA ─────────────────────────────
 *
 *   • Quem cunha é o RELÓGIO, nunca um pedido de fora. Nenhuma rota pública
 *     leva a esta função: ela roda dentro da rodada da esteira, sobre um
 *     briefing que a própria casa já aceitou e já precificou.
 *   • O token vai para UM endereço só: o que o cliente escreveu no próprio
 *     briefing (`lerContato`), com o consentimento provado pelo briefing dele
 *     (`provaDoProprioBriefing`) e barrado pelos cadeados de saída.
 *   • O token abre a PROPOSTA daquele pedido — nada mais. O portal de 11 abas
 *     continua exigindo um `Client`, que neste ponto ainda não existe.
 *
 * ── AS DUAS REGRAS HERDADAS DE `links-do-portal.ts` ────────────────────────
 *
 *   1. NÃO REVOGA NADA. Token vivo é reaproveitado — um link já enviado pode
 *      estar na caixa de entrada do cliente, e trocá-lo o quebra em silêncio.
 *   2. Segredo de verdade: `randomBytes(32)`, e não o `cuid()` sequencial do
 *      `@default` do schema. Este link vai por e-mail e vale por uma decisão
 *      comercial; identificador adivinhável não serve de credencial.
 *
 * Nunca lança: sem link o orçamento AINDA é entregue no portal e por e-mail.
 * Falhar em cunhar não pode desfazer uma entrega.
 */
async function linkDaProposta(clientRequestId: string, clientId: string | null): Promise<string | null> {
  try {
    const vivos = await prisma.portalAccess.findMany({
      where: { clientRequestId, revokedAt: null },
      orderBy: { grantedAt: "desc" },
      select: { token: true, expiresAt: true },
    });
    const agora = Date.now();
    const bom = vivos.find((a) => !a.expiresAt || a.expiresAt.getTime() > agora);
    if (bom) return `${HOST_PADRAO}/proposta/${bom.token}`;

    const novo = await prisma.portalAccess.create({
      data: {
        token: randomBytes(32).toString("base64url"),
        clientRequestId,
        ...(clientId ? { clientId } : {}),
      },
      select: { token: true },
    });
    return `${HOST_PADRAO}/proposta/${novo.token}`;
  } catch (err) {
    console.error(`[orcamento] não consegui cunhar a porta de aceite do pedido ${clientRequestId}:`, err);
    return null;
  }
}

/**
 * ═══ A ESTIMATIVA, DERIVADA QUANDO A SALA DE BRIEFING NÃO GRAVOU UMA ════════
 *
 * O cabeçalho deste arquivo diz, e continua valendo: **não se inventa número.**
 * O que mudou em 24/08/2026 é o que conta como invenção.
 *
 * Medido: o pedido do case ficou parado em `new` para sempre porque
 * `briefingJson.estimate` não existia — e o relógio dizia, de cinco em cinco
 * minutos, *"1 briefing(s) sem orçamento calculado — aguardando gente"*. A
 * gente nunca veio. O escopo estruturado do cliente estava lá, inteiro.
 *
 * `computeEstimate` é a MESMA função que a sala de briefing roda ao vivo, sobre
 * o MESMO `scope`, e é determinística. Rodá-la aqui não produz um número novo:
 * produz o número que já teria sido gravado se a conversa tivesse chegado ao
 * fim. É leitura, não palpite — e é o que `app/api/admin/reset-request` já faz.
 *
 * As duas travas continuam de pé, e são elas que separam isto de chutar:
 *   • `travadaPor` — sem volume declarado, `computeEstimate` se RECUSA a somar
 *     e a estimativa vale como AUSÊNCIA (o zero do CityJobs não volta);
 *   • total zero ou negativo continua sendo "sem orçamento".
 *
 * Nunca lança: escopo torto vira `null`, que é "sem orçamento" — o estado que
 * chama gente.
 */
export function derivarEstimativa(briefingJson: string | null): EstimativaGuardada | null {
  if (!briefingJson) return null;
  try {
    const corpo = JSON.parse(briefingJson) as { scope?: Record<string, unknown> };
    const scope = corpo?.scope;
    if (!scope || typeof scope !== "object" || Array.isArray(scope)) return null;
    const e = computeEstimate(scope as unknown as Parameters<typeof computeEstimate>[0]);
    if (typeof e.travadaPor === "string" && e.travadaPor.trim()) return null;
    if (!(e.totalMin > 0 || e.totalMax > 0)) return null;
    return e as EstimativaGuardada;
  } catch {
    return null;
  }
}

/** O `briefingJson` com a estimativa derivada gravada dentro dele — para que a
 *  proposta que o cliente lê, o e-mail que ele recebe e a regra que decide o
 *  nascimento do projeto leiam TODOS o mesmo número. Duas versões da mesma
 *  conta é como o cliente aceita um preço e o sistema cobra outro. */
function comEstimativa(briefingJson: string | null, e: EstimativaGuardada): string {
  try {
    const corpo = JSON.parse(briefingJson ?? "{}") as Record<string, unknown>;
    return JSON.stringify({ ...corpo, estimate: e });
  } catch {
    return JSON.stringify({ estimate: e });
  }
}

/** O que aconteceu com o toque no ombro. `sem_canal` NÃO é falha, e é por
 *  isso que ela nunca carrega `detalhe`: não há motivo a investigar, só um
 *  fato — o lead não declarou e-mail. As outras três levam `detalhe` porque
 *  é o que a fila de reenvio (e quem olha o painel) precisa para decidir se
 *  vale reenviar ou se é a casa que precisa configurar algo primeiro. */
type ResultadoDoAviso =
  | { tipo: "avisado" }
  | { tipo: "sem_canal" }
  | { tipo: "falhou"; detalhe: string }
  | { tipo: "skipped"; detalhe: string };

/**
 * Avisa por e-mail que o orçamento ficou pronto.
 *
 * ── A ORDEM DAS COISAS É A GARANTIA, NÃO UM DETALHE ─────────────────────────
 *
 * Esta função só é chamada **depois** que a transação (mensagem + saída de
 * `new`) já foi confirmada, e o resultado dela **nunca** volta para dentro da
 * transação. As duas metades disso são propositais:
 *
 *   • **Depois**, porque se o e-mail saísse antes e a transação falhasse, o
 *     pedido continuaria na fila e a próxima batida do relógio — cinco minutos
 *     — mandaria o mesmo orçamento de novo. E de novo. O que impede o cliente
 *     de receber o mesmo e-mail a cada cinco minutos é o pedido já ter saído de
 *     `new` quando o envio acontece.
 *   • **Sem volta**, porque desfazer a entrega por causa de um e-mail seria
 *     trocar um problema pequeno (o cliente não foi avisado) por um grande (o
 *     orçamento sumiu do portal). E-mail que falha **não se retenta aqui**:
 *     retentar é exatamente como se manda duas vezes.
 *
 * Nunca lança. Quem chama está no meio de uma rodada com outros clientes na
 * fila, e o próximo não pode pagar pelo anterior.
 */
async function avisarPorEmail(
  pedido: {
    id: string; businessName: string | null; briefingJson: string | null; sdrHandoffJson: string | null;
    /** A porta de aceite deste pedido, já cunhada por quem chamou. `null` só
     *  quando cunhar falhou — e aí o e-mail sai sem link em vez de não sair. */
    linkDaProposta?: string | null;
  },
  e: EstimativaGuardada,
): Promise<ResultadoDoAviso> {
  try {
    const contato = lerContato({
      briefingJson: pedido.briefingJson,
      sdrHandoffJson: pedido.sdrHandoffJson,
    });

    // Sem e-mail declarado não há a quem avisar — e isso não é problema deste
    // arquivo resolver. O orçamento JÁ está no portal, entregue. Ver a regra 3
    // do cabeçalho: faltar contato impede avisar, nunca impede atender.
    if (!contato.email) return { tipo: "sem_canal" };

    const { subject, html } = orcamentoProntoEmail({
      prospectName: contato.nome ?? undefined,
      businessName: pedido.businessName ?? undefined,
      faixa: faixaDoOrcamento(e),
      // Sinalizador, não conta: o e-mail reconhece que a faixa passou da verba
      // declarada e manda ler a conversa, onde a diferença é nomeada e o que
      // cabe é oferecido. Repetir a conta aqui criaria duas versões dela.
      verbaEstourada: Boolean(e.confrontoDeVerba),
      portalLink: pedido.linkDaProposta ?? undefined,
    });

    // O orçamento vai para quem PEDIU o orçamento, no e-mail que ele mesmo
    // deixou no briefing. Resposta, não abordagem — e a referência aponta o
    // pedido para quem quiser conferir.
    const r = await sendEmail({
      to: contato.email, subject, html,
      consentimento: provaDoProprioBriefing(pedido.id),
    });
    if (r.ok) return { tipo: "avisado" };

    // `skipped` é a casa sem RESEND_API_KEY — configuração, não defeito do
    // pedido. Distinguir os dois no log (e agora também no banco, ver
    // `gravarResultadoDoAviso`) evita mandar alguém caçar bug onde falta
    // variável de ambiente — e evita reenviar achando que vai resolver
    // sozinho quando o que falta é configurar a chave.
    if (r.skipped) {
      // O MOTIVO VEM DE QUEM SABE (25/08/2026). Aqui havia a frase fixa
      // "RESEND_API_KEY ausente", escrita quando `skipped` só tinha um motivo
      // possível. Passou a ter dois — a trava de saída do cliente falso também
      // devolve `skipped` — e a frase fixa virou mentira medida em produção:
      // dois pedidos com contato `@cliente-falso.invalid` (barrados pela trava,
      // como deviam) apareceram na tela do CEO como falta de chave, com a chave
      // cadastrada no Railway. Copiar o motivo recebido é o que impede a
      // próxima divergência: `sendEmail` ganha um motivo novo, a tela mostra o
      // motivo novo, sem ninguém precisar lembrar deste arquivo.
      const detalhe = r.error ?? "skipped sem motivo declarado por sendEmail";
      console.warn(`[orcamento] aviso não enviado (${detalhe}) — pedido ${pedido.id}`);
      return { tipo: "skipped", detalhe };
    }
    const detalhe = r.error ?? "sem detalhe";
    console.warn(`[orcamento] aviso falhou — pedido ${pedido.id}: ${detalhe}`);
    return { tipo: "falhou", detalhe };
  } catch (err) {
    const detalhe = err instanceof Error ? err.message : String(err);
    console.error("[orcamento] aviso lançou — a entrega segue valendo:", err);
    return { tipo: "falhou", detalhe };
  }
}

/**
 * Grava o que aconteceu com o toque no ombro — sucesso incluído.
 *
 * ── POR QUE GRAVAR TAMBÉM O SUCESSO ──────────────────────────────────────
 * `reenviarAvisosQueFalharam` só busca `avisoOrcamentoStatus IN ('falhou',
 * 'skipped')`. Se "avisado" não fosse gravado, não haveria como o reenvio
 * saber quem JÁ recebeu — e o botão de reenviar viraria uma máquina de
 * mandar o mesmo orçamento duas vezes, que é o defeito oposto e pior deste
 * conserto (ver o cabeçalho do arquivo).
 *
 * Nunca lança: quem chama está no meio de uma rodada (ou de um reenvio) com
 * outros pedidos na fila, e uma falha ao GRAVAR o resultado não pode
 * derrubar um e-mail que já saiu (ou já foi tentado). O custo de falhar aqui
 * é real — a próxima leitura não vê a tentativa — mas é estritamente menor
 * que o custo de derrubar a rodada inteira por causa de uma escrita de
 * diagnóstico.
 *
 * `$executeRawUnsafe` porque a coluna é nova e o cliente Prisma gerado
 * (`lib/generated/prisma/`) é versionado de propósito — regenerá-lo nesta
 * árvore, com dois outros pms editando o mesmo repositório agora, produziria
 * um diff gigante e colidiria com o trabalho deles. Mesmo padrão de
 * `lib/integrations/meta/ritmo-no-banco.ts`.
 */
async function gravarResultadoDoAviso(pedidoId: string, aviso: ResultadoDoAviso): Promise<void> {
  const detalhe = "detalhe" in aviso ? aviso.detalhe.slice(0, 500) : null;
  try {
    await prisma.$executeRawUnsafe(
      `UPDATE ClientRequestDb
          SET avisoOrcamentoStatus = ?,
              avisoOrcamentoDetalhe = ?,
              avisoOrcamentoEm = ?,
              avisoOrcamentoTentativas = avisoOrcamentoTentativas + 1
        WHERE id = ?`,
      aviso.tipo,
      detalhe,
      new Date().toISOString(),
      pedidoId,
    );
  } catch (err) {
    console.error(`[orcamento] não consegui gravar o estado do aviso do pedido ${pedidoId}:`, err);
  }
}

/**
 * O texto que o cliente lê. Escrito para quem NÃO trabalha na agência: sem id,
 * sem nome de sistema, sem custo interno, sem prazo prometido.
 */
export function textoDoOrcamento(negocio: string, e: EstimativaGuardada, linkDaProposta?: string | null): string {
  const linhas: string[] = [];

  linhas.push(`Recebemos seu briefing${negocio ? ` da ${negocio}` : ""} — obrigado pelo material.`);

  // ── O MOTIVO DO PROJETO, NA SEGUNDA LINHA (25/08/2026) ────────────────────
  // Medido no Farol 27: o projeto inteiro existia para lançar o Clube Farol 27
  // e a proposta não citava o clube uma vez sequer. Quem lê procura o próprio
  // objetivo antes do preço; não achando, entende que recebeu um pacote de
  // prateleira — e a peça comercial falhou antes do número.
  //
  // Vem GRAVADO com a estimativa (`computeEstimate`), e não reescrito aqui:
  // são as palavras do cliente, não uma paráfrase da casa.
  const objetivos = (e.objetivos ?? []).filter((o) => typeof o === "string" && o.trim());
  if (objetivos.length > 0) {
    linhas.push("");
    linhas.push(
      objetivos.length === 1
        ? `Entendemos que o que você quer é: ${objetivos[0]!.trim()}. É para isso que esta proposta foi montada.`
        : `Entendemos que o que você quer é: ${objetivos.map((o) => o.trim()).join("; ")}. É para isso que esta proposta foi montada.`,
    );
  }

  linhas.push("");

  const min = e.totalMin ?? 0;
  const max = e.totalMax ?? 0;
  linhas.push(
    min === max
      ? `Pelo que você descreveu, a estimativa é de ${real(min)} por mês.`
      : `Pelo que você descreveu, a estimativa fica entre ${real(min)} e ${real(max)} por mês.`,
  );

  // ── A VERBA DECLARADA, DITA NA CARA — e dita AQUI ────────────────────────────
  // Colada no número de propósito. No CityJobs (16/08/2026) o cliente tinha
  // acabado de dizer *"algo em torno de R$ 500 por mês"* e recebeu
  // R$ 1.800–3.400 sem uma palavra sobre a diferença. Enterrar o
  // reconhecimento cinco parágrafos abaixo seria uma versão mais educada do
  // mesmo erro: quem lê o número e não vê a própria verba citada na linha
  // seguinte já entendeu que não estavam escutando, e fecha a conversa ali.
  if (e.confrontoDeVerba) {
    linhas.push("");
    linhas.push(...textoDaVerbaEstourada(e.confrontoDeVerba));
  }

  const itens = (e.items ?? []).filter((i) => i?.label);
  if (itens.length > 0) {
    linhas.push("");
    linhas.push("O que entra nessa conta:");
    for (const i of itens.slice(0, 8)) {
      linhas.push(`• ${i.label}${i.detail ? ` — ${i.detail}` : ""}`);
    }
  }

  const fora = (e.notIncluded ?? []).filter(Boolean);
  if (fora.length > 0) {
    linhas.push("");
    linhas.push("O que NÃO está incluído:");
    for (const f of fora.slice(0, 6)) linhas.push(`• ${f}`);
  }

  // A honestidade que faltava: dizer que ainda falta informação, em vez de
  // apresentar faixa larga como se fosse precisão.
  const falta = (e.missingForEstimate ?? []).filter(Boolean);
  if (falta.length > 0) {
    linhas.push("");
    linhas.push("Para fechar o número, ainda precisamos de:");
    for (const f of falta.slice(0, 5)) linhas.push(`• ${f}`);
  }

  linhas.push("");
  linhas.push(
    "Isto é uma estimativa a partir do que você contou, não a proposta final — " +
      "a equipe confere e te manda a proposta fechada por aqui. Se algo acima " +
      "estiver diferente do que você precisa, é só responder nesta conversa.",
  );

  // ── O CONVITE A RESPONDER — e a razão de ele existir ──────────────────────
  // Até 24/08/2026 este texto terminava aqui: contava o preço e não dizia como
  // dizer "sim". O cursograma tinha um "cliente aceitou?" que o cliente não
  // tinha onde responder. O link aparece SÓ quando existe; sem ele, o texto
  // continua exatamente o de antes — nunca se promete uma porta que não abriu.
  if (linkDaProposta) {
    linhas.push("");
    linhas.push(
      "Quando quiser seguir, é por aqui — dá para aceitar ou recusar, e a recusa " +
        "também é resposta:",
    );
    linhas.push(linkDaProposta);
  }

  return linhas.join("\n");
}

/**
 * Entrega o orçamento de quem acabou de entregar briefing.
 *
 * Chamado pelo despertador. Erro num pedido não derruba os outros: o próximo
 * cliente não pode pagar pelo anterior.
 */
export async function entregarOrcamentosPendentes(): Promise<ResultadoDoOrcamento> {
  const resultado: ResultadoDoOrcamento = {
    entregues: 0,
    semOrcamento: 0,
    avisados: 0,
    semCanal: 0,
    avisosQueFalharam: [],
    falhas: [],
  };

  // ── POR QUE `lead_incompleto` ENTRA AQUI ──────────────────────────────────
  // 16/08/2026, sete horas depois de este arquivo subir: ele não tinha
  // entregado UM orçamento. Nem falha, nem entrega — silêncio.
  //
  // A causa estava na porta de entrada. `app/api/brain/client-requests` grava
  //   status: contato.temComoFalar ? "new" : "lead_incompleto"
  // e o briefing do CEO entrou SEM contato — porque o SDR havia parado de pedir
  // e-mail. Resultado: o pedido nasceu marcado como incompleto e ficou fora da
  // vista de tudo. Ele esperou a noite inteira por um orçamento de um pedido
  // que o sistema tratava como lixo.
  //
  // Faltar contato NÃO é faltar pedido. O cliente escreveu, anexou material e
  // está com o portal aberto — o orçamento chega ali, e o portal não precisa
  // de e-mail nenhum para funcionar. O que a falta de contato impede é AVISAR
  // por fora; não é atender.
  //
  // ── E POR QUE `scope_ready` ─────────────────────────────────────────────
  // Terceira e última descoberta, e só apareceu quando o diário do piloto
  // ficou de pé e deixou os Diretores enxergarem o banco. O briefing do CEO
  // estava lá, intacto, COM anexo e COM orçamento calculado — em `scope_ready`.
  //
  // O auto-scope (`lib/dioli-brain/run-auto-scope.ts`) tinha rodado nele,
  // oito agentes de estratégia trabalharam, o pedido avançou para
  // `scope_ready`... e ali morreu. Nenhum código pega esse estado. Escopo
  // pronto era o fim da linha em vez do meio dela.
  //
  // A lição, que vale mais que a linha: durante três teorias eu procurei o
  // pedido nos estados que EU imaginava, em vez de perguntar ao banco em que
  // estado ele estava. Diagnóstico por dedução perde para uma leitura.
  const pedidos = await prisma.clientRequestDb
    .findMany({
      where: { status: { in: ["new", "lead_incompleto", "scope_ready"] } },
      orderBy: { createdAt: "asc" },
      take: MAX_POR_RODADA,
    })
    .catch(() => []);

  for (const pedido of pedidos) {
    try {
      // A estimativa gravada pela sala de briefing continua sendo a primeira
      // fonte. Só quando ela não existe é que a casa DERIVA — do escopo do
      // próprio cliente, com a mesma função, e sem afrouxar nenhuma trava.
      const guardada = estimativaDe(pedido.briefingJson);
      const derivada = guardada ? null : derivarEstimativa(pedido.briefingJson);
      const e = guardada ?? derivada;
      if (!e) {
        // Sem número derivado não se inventa número. Fica de pé como estava,
        // para a fila de gente — e conta como notícia, não como rotina.
        resultado.semOrcamento += 1;
        continue;
      }

      // A porta de aceite nasce JUNTO com a proposta. Antes de a mensagem ser
      // escrita: o texto que o cliente lê precisa carregar o link, e um link
      // que aparece só no e-mail some quando o e-mail falha.
      const link = await linkDaProposta(pedido.id, pedido.clientId);
      const corpo = textoDoOrcamento(pedido.businessName ?? "", e, link);

      await prisma.$transaction([
        prisma.portalMessage.create({
          data: {
            clientRequestId: pedido.id,
            clientId: pedido.clientId,
            authorRole: "team",
            authorName: "Gerente de projeto",
            body: corpo,
            readByTeam: true,
          },
        }),
        // Sair de `new` é o que impede mandar duas vezes, e é o que faz o
        // pedido aparecer na fila de proposta para a equipe.
        //
        // A estimativa derivada é GRAVADA na mesma transação. Sem isso, a
        // proposta que o cliente abre e a regra que decide o nascimento do
        // projeto recalculariam o número por conta própria — e duas versões da
        // mesma conta é como o cliente aceita um preço e o sistema cobra outro.
        prisma.clientRequestDb.update({
          where: { id: pedido.id },
          data: {
            status: "proposal_pending",
            ...(derivada ? { briefingJson: comEstimativa(pedido.briefingJson, derivada) } : {}),
          },
        }),
      ]);

      // A ENTREGA ESTÁ FEITA AQUI. O que vem depois é aviso, e aviso não
      // desfaz entrega. Contar `entregues` antes do e-mail não é descuido de
      // ordem: é a afirmação de que o orçamento chegou ao portal e nada abaixo
      // desta linha pode voltar atrás nisso.
      resultado.entregues += 1;

      const aviso = await avisarPorEmail({ ...pedido, linkDaProposta: link }, e);
      // Grava SEMPRE — sucesso incluído. Ver o porquê em
      // `gravarResultadoDoAviso`: sem a marca de sucesso, o reenvio não teria
      // como saber quem já foi avisado e viraria máquina de duplicata.
      await gravarResultadoDoAviso(pedido.id, aviso);

      switch (aviso.tipo) {
        case "avisado":
          resultado.avisados += 1;
          break;
        case "sem_canal":
          resultado.semCanal += 1;
          break;
        case "falhou":
        case "skipped":
          // As duas viram a mesma notícia de rodada (o cliente não foi
          // avisado) — o que as distingue para quem for AGIR é o `detalhe`
          // gravado no banco, não este texto de log.
          resultado.avisosQueFalharam.push(
            `pedido ${pedido.id} (${pedido.businessName ?? "sem nome"}): orçamento entregue no portal, mas o e-mail não saiu (${aviso.detalhe})`,
          );
          break;
      }
    } catch (err) {
      resultado.falhas.push(err instanceof Error ? err.message : String(err));
    }
  }

  return resultado;
}

// ─────────────────────────────────────────────────────────────────────────────
// O REENVIO — a falha que sobrevive vira aviso que sai
// ─────────────────────────────────────────────────────────────────────────────

/** Teto por chamada. Reenvio é ação deliberada (rota protegida), não o
 *  relógio de 5 em 5 min — mas mesmo deliberado, um teto evita que um clique
 *  vire uma rajada de e-mail. */
export const MAX_REENVIOS_POR_CHAMADA = 20;

export type ResultadoDoReenvio = {
  /** Quantos saíram desta vez. */
  reenviados: number;
  /** Quantos foram tentados de novo e falharam de novo (o motivo já foi
   *  regravado — quem quiser o texto atual lê `avisoOrcamentoDetalhe`). */
  aindaFalhando: number;
  /** Erros que impediram a TENTATIVA de acontecer (não o envio em si). */
  falhas: string[];
};

type LinhaParaReenviar = {
  id: string;
  businessName: string | null;
  briefingJson: string | null;
  sdrHandoffJson: string | null;
  /** Presentes SÓ para a fronteira de posse (`apenasDoWorkspace`) decidir de
   *  quem é a linha. Nunca usados para nada além disso — o e-mail, o texto e
   *  a gravação seguem exatamente como já eram. */
  workspaceId: string | null;
  clientId: string | null;
};

/**
 * De quem é a chamada: um workspace específico (sessão de equipe — o caso
 * normal) ou "casa inteira" (o segredo de operação, sem sessão, decisão
 * escrita no cabeçalho deste arquivo). Nunca opcional: quem chama declara,
 * o TypeScript obriga.
 */
export type EscopoDoAviso = { workspaceId: string } | { casaInteira: true };

/** Filtra as linhas que vieram de uma consulta já reduzida no banco pela
 *  MESMA política de posse do resto da casa — nunca uma quarta versão dela.
 *  `casaInteira` não filtra nada, de propósito (ver o porquê no cabeçalho). */
async function filtradoPeloEscopo<T extends { workspaceId: string | null; clientId: string | null }>(
  linhas: T[],
  escopo: EscopoDoAviso,
): Promise<T[]> {
  if ("casaInteira" in escopo) return linhas;
  return apenasDoWorkspace(linhas, escopo.workspaceId);
}

// ─────────────────────────────────────────────────────────────────────────────
// A RESERVA — o CAS que fecha a corrida de duas chamadas concorrentes
// ─────────────────────────────────────────────────────────────────────────────
//
// 16/08/2026, devolução do `seguranca` sobre a tela que acabou de nascer
// (`/agency/avisos-de-orcamento`): antes desta tela, disparar reenvio duas
// vezes exigia um script deliberado. Agora é um botão que um humano clica —
// e duas abas, dois operadores, ou um retry de rede enquanto o primeiro lote
// ainda roda liam a MESMA lista de candidatos (o `SELECT` abaixo) antes de
// qualquer linha ser marcada, e mandavam o MESMO orçamento duas vezes ao
// MESMO prospect. É o defeito que o cabeçalho deste arquivo chama de o pior
// desta casa — mandar duas vezes é pior que não mandar.
//
// O conserto: cada linha é RESERVADA atomicamente, uma por vez, ANTES de
// mandar o e-mail — o mesmo padrão de `reservarNaJanelaDoBanco` em
// `lib/integrations/meta/ritmo-no-banco.ts`. O teste de elegibilidade vai
// DENTRO do `UPDATE` (no `WHERE`), não numa leitura separada: não existe
// intervalo entre "ler quem está livre" e "marcar como minha" em que duas
// chamadas concorrentes caibam. Quem afetar 0 linhas perdeu a corrida — a
// outra chamada chegou primeiro — e pula para o próximo candidato sem mandar
// nada.
//
// A MARCA DE RESERVA NUNCA É UM QUINTO STATUS PERMANENTE. `'enviando'` (fila
// normal) e `'enviando_legado'` (balde de legados) só existem ENTRE a
// reserva e a gravação final (`gravarResultadoDoAviso`, chamada sempre
// depois — sucesso ou falha) — que sobrescreve com um dos quatro valores de
// `ResultadoDoAviso`. DUAS marcas, uma por balde, DE PROPÓSITO: uma reserva
// que nasceu do balde de legados (opt-in, `incluirLegados: true`) só pode
// ser reclamada de volta pelo MESMO balde — nunca vaza para o reenvio
// automático, que roda sem pedir permissão a ninguém. Se as duas
// compartilhassem uma marca, um processo que morresse no meio de um reenvio
// de legado devolveria a linha para a fila AUTOMÁTICA na próxima rodada —
// exatamente o vazamento de consentimento que o opt-in existe para impedir.
//
// A LINHA QUE MORRE RESERVADA SE AUTOLIBERA. Se o processo cair entre
// reservar e gravar o resultado final — o servidor reinicia no meio, o
// worker é morto — a linha fica presa em `'enviando'`/`'enviando_legado'`
// com o timestamp DA RESERVA em `avisoOrcamentoEm`. Isso NÃO é para sempre:
// passados `RESERVA_TRAVADA_POR_MS`, a MESMA condição usada tanto para
// reservar quanto para SELECIONAR candidatos (abaixo, nas duas consultas)
// volta a aceitar essa marca como elegível — a próxima chamada da MESMA fila
// destrava a linha sozinha, sem intervenção manual. O prazo é generoso o
// bastante para um envio de e-mail real terminar (rede lenta, Resend
// respondendo devagar) e curto o bastante para não deixar um prospect preso
// por horas se o processo cair no meio.
const RESERVA_TRAVADA_POR_MS = 5 * 60 * 1000; // 5 minutos

/** Reserva uma linha do balde normal (`falhou`/`skipped`) — ou recupera uma
 *  reserva morta e velha do MESMO balde. `true` = a linha é sua, pode mandar
 *  o e-mail. `false` = outra chamada já está com ela (ou a reservou há pouco
 *  tempo, dentro da janela); não manda nada. */
async function reservarParaReenvio(id: string): Promise<boolean> {
  const agora = new Date();
  const travadaDesde = new Date(agora.getTime() - RESERVA_TRAVADA_POR_MS).toISOString();
  const linhas = await prisma.$executeRawUnsafe(
    `UPDATE ClientRequestDb
        SET avisoOrcamentoStatus = 'enviando', avisoOrcamentoEm = ?
      WHERE id = ?
        AND (avisoOrcamentoStatus IN ('falhou', 'skipped')
             OR (avisoOrcamentoStatus = 'enviando' AND avisoOrcamentoEm < ?))`,
    agora.toISOString(),
    id,
    travadaDesde,
  );
  return linhas === 1;
}

/** A mesma reserva, para o balde de legados (`avisoOrcamentoStatus IS
 *  NULL`) — marca PRÓPRIA (`'enviando_legado'`) para nunca vazar para o
 *  reenvio automático (ver o porquê no comentário acima). */
async function reservarParaLegado(id: string): Promise<boolean> {
  const agora = new Date();
  const travadaDesde = new Date(agora.getTime() - RESERVA_TRAVADA_POR_MS).toISOString();
  const linhas = await prisma.$executeRawUnsafe(
    `UPDATE ClientRequestDb
        SET avisoOrcamentoStatus = 'enviando_legado', avisoOrcamentoEm = ?
      WHERE id = ?
        AND (avisoOrcamentoStatus IS NULL
             OR (avisoOrcamentoStatus = 'enviando_legado' AND avisoOrcamentoEm < ?))`,
    agora.toISOString(),
    id,
    travadaDesde,
  );
  return linhas === 1;
}

/**
 * O corpo da tentativa, compartilhado entre o reenvio normal e o reenvio de
 * legados: RESERVA a linha (o CAS acima), lê a estimativa JÁ gravada (nunca
 * recalcula), tenta o e-mail e grava o resultado — sucesso incluído, que é o
 * que faz o balde de origem (falhou/skipped, ou legado) deixar de conter o
 * pedido na próxima leitura.
 *
 * `reservar` é o CAS específico do balde de origem (`reservarParaReenvio` ou
 * `reservarParaLegado`) — nunca compartilhado entre os dois, ver o porquê no
 * bloco de comentário acima de `RESERVA_TRAVADA_POR_MS`.
 */
async function tentarReenviosEmLote(
  candidatos: LinhaParaReenviar[],
  resultado: ResultadoDoReenvio,
  reservar: (id: string) => Promise<boolean>,
): Promise<void> {
  for (const pedido of candidatos) {
    try {
      // A RESERVA é o que fecha a corrida — ver o bloco de comentário acima
      // de `RESERVA_TRAVADA_POR_MS`. 0 linhas afetadas não é erro: é a outra
      // chamada concorrente tendo chegado primeiro nesta MESMA linha.
      const reservou = await reservar(pedido.id);
      if (!reservou) continue;

      // A estimativa é lida DE NOVO do briefing gravado — nunca recalculada.
      // O reenvio manda o MESMO número que já está escrito na conversa do
      // portal; se o briefing não tiver mais estimativa utilizável (JSON
      // corrompido entre a entrega e o reenvio, por exemplo), não há número
      // seguro para reenviar e o pedido fica de fora desta rodada de reenvio
      // — nunca inventa valor para destravar um e-mail.
      const e = estimativaDe(pedido.briefingJson);
      if (!e) {
        resultado.falhas.push(`pedido ${pedido.id}: sem estimativa gravada — não reenviado`);
        // A reserva não pode esperar `RESERVA_TRAVADA_POR_MS` para se soltar
        // quando já sabemos, agora, que não há número seguro para reenviar:
        // grava o motivo real e libera a linha imediatamente — 'falhou' é
        // estado elegível para reenvio futuro nos dois baldes de origem
        // possíveis (já era 'falhou'/'skipped', ou era o primeiro toque num
        // legado NULL).
        await gravarResultadoDoAviso(pedido.id, {
          tipo: "falhou",
          detalhe: "sem estimativa gravada no briefing",
        });
        continue;
      }

      // O reenvio leva a MESMA porta de aceite. `linkDaProposta` reaproveita o
      // token vivo — nada é revogado, e o link que o cliente já tem continua
      // valendo. Só cunha quando não existe nenhum, que é o caso do pedido
      // entregue antes de esta porta existir.
      const aviso = await avisarPorEmail(
        { ...pedido, linkDaProposta: await linkDaProposta(pedido.id, pedido.clientId ?? null) },
        e,
      );
      await gravarResultadoDoAviso(pedido.id, aviso);

      if (aviso.tipo === "avisado") resultado.reenviados += 1;
      else resultado.aindaFalhando += 1;
    } catch (err) {
      resultado.falhas.push(err instanceof Error ? err.message : String(err));
    }
  }
}

/**
 * Reenvia o aviso de quem já teve o orçamento ENTREGUE no portal (a mensagem
 * já está lá, o pedido já saiu de `new`) mas cujo e-mail não saiu.
 *
 * ── O MECANISMO QUE IMPEDE A DUPLICATA ──────────────────────────────────────
 * A consulta abaixo só alcança `avisoOrcamentoStatus IN ('falhou', 'skipped')`
 * — nunca `'avisado'` e nunca `'sem_canal'`. É a MESMA garantia que já existia
 * para a entrega original (o pedido sai de `new` antes do e-mail), expressa
 * agora como estado gravado em vez de estado de fila: quem já foi avisado com
 * sucesso não pode voltar a aparecer aqui, porque o UPDATE de
 * `gravarResultadoDoAviso` já trocou o status dele para `'avisado'` na
 * primeira vez que isso aconteceu — inclusive num reenvio anterior.
 *
 * Não existe um segundo caminho de envio: reaproveita `avisarPorEmail`, a
 * mesma função que a entrega original chama. Duplicar o envio duplicaria
 * também o dia em que `RESEND_FROM` sumir nas variáveis de novo.
 *
 * Chamado por uma rota protegida (`app/api/agency/avisos-de-orcamento`), NUNCA
 * pelo relógio de 5 em 5 minutos — a decisão de não retentar sozinho tem dono e
 * motivo (regra 4 do cabeçalho deste arquivo), e não é este reenvio que a
 * derruba. O que ele resolve é a falha deixar de ser terminal: alguém PODE
 * mandar tentar de novo, em vez do cliente ficar preso a um log que já rodou.
 *
 * Nunca lança: um pedido problemático não pode impedir os outros de serem
 * reenviados.
 *
 * `escopo` é OBRIGATÓRIO (16/08/2026, devolução do `seguranca`): sem ele esta
 * função alcançava `falhou`/`skipped` de QUALQUER workspace, e um clique de
 * quem estivesse logado em qualquer agência disparava e-mail de verdade para
 * prospect alheio. O filtro entra em DUAS camadas — `AND (workspaceId = ? OR
 * workspaceId IS NULL)` já reduz no `WHERE`, e `filtradoPeloEscopo` reaplica
 * a política completa da órfã-com-cliente em memória. Ver o porquê de
 * `casaInteira` existir no cabeçalho do arquivo.
 */
export async function reenviarAvisosQueFalharam(escopo: EscopoDoAviso): Promise<ResultadoDoReenvio> {
  const resultado: ResultadoDoReenvio = { reenviados: 0, aindaFalhando: 0, falhas: [] };

  // A cláusula `OR (avisoOrcamentoStatus = 'enviando' AND avisoOrcamentoEm <
  // ?)` é o que faz uma reserva morta (processo caiu entre reservar e
  // gravar o resultado final) VOLTAR a aparecer aqui depois de
  // `RESERVA_TRAVADA_POR_MS` — sem ela, uma linha travada por um crash
  // nunca mais seria candidata a nada. Ver o bloco de comentário acima de
  // `RESERVA_TRAVADA_POR_MS`.
  const travadaDesde = new Date(Date.now() - RESERVA_TRAVADA_POR_MS).toISOString();

  let candidatos: LinhaParaReenviar[];
  try {
    const linhas =
      "casaInteira" in escopo
        ? await prisma.$queryRawUnsafe<LinhaParaReenviar[]>(
            `SELECT id, businessName, briefingJson, sdrHandoffJson, workspaceId, clientId
               FROM ClientRequestDb
              WHERE (avisoOrcamentoStatus IN ('falhou', 'skipped')
                     OR (avisoOrcamentoStatus = 'enviando' AND avisoOrcamentoEm < ?))
              ORDER BY avisoOrcamentoEm ASC
              LIMIT ?`,
            travadaDesde,
            MAX_REENVIOS_POR_CHAMADA,
          )
        : await prisma.$queryRawUnsafe<LinhaParaReenviar[]>(
            `SELECT id, businessName, briefingJson, sdrHandoffJson, workspaceId, clientId
               FROM ClientRequestDb
              WHERE (avisoOrcamentoStatus IN ('falhou', 'skipped')
                     OR (avisoOrcamentoStatus = 'enviando' AND avisoOrcamentoEm < ?))
                AND (workspaceId = ? OR workspaceId IS NULL)
              ORDER BY avisoOrcamentoEm ASC
              LIMIT ?`,
            travadaDesde,
            escopo.workspaceId,
            MAX_REENVIOS_POR_CHAMADA,
          );
    candidatos = await filtradoPeloEscopo(linhas, escopo);
  } catch (err) {
    resultado.falhas.push(err instanceof Error ? err.message : String(err));
    return resultado;
  }

  // Cada linha ainda é RESERVADA individualmente dentro de
  // `tentarReenviosEmLote` (`reservarParaReenvio`) — esta lista é só a
  // PROPOSTA de candidatos; duas chamadas concorrentes podem propor a mesma
  // linha, e só uma vence a reserva.
  await tentarReenviosEmLote(candidatos, resultado, reservarParaReenvio);
  return resultado;
}

// ─────────────────────────────────────────────────────────────────────────────
// O BALDE DOS LEGADOS — "não sabemos", nunca "falhou" nem "avisado"
// ─────────────────────────────────────────────────────────────────────────────
//
// Ver o comentário longo acima de `reenviarAvisosQueFalharam` para a origem
// do problema. O resumo do mecanismo:
//
//   • Candidato a legado é `status = 'proposal_pending'` (já saiu de `new`,
//     ou seja, o orçamento JÁ foi entregue no portal) com
//     `avisoOrcamentoStatus IS NULL` (nunca tentamos gravar nada, porque a
//     coluna não existia quando este pedido foi processado).
//   • Só entra no balde quem TEM e-mail no leitor único (`lerContato`). Quem
//     não tem é `sem_canal` — fato, não legado — e não é fila de reenvio.
//   • `NULL` nunca é escrito por aqui como palpite: a única escrita é
//     `gravarResultadoDoAviso`, chamada depois de uma tentativa REAL.

/** Uma linha do balde de legados, já com o e-mail confirmado presente —
 *  quem não tem e-mail nunca chega a este tipo. */
export type LegadoDeAviso = {
  id: string;
  businessName: string | null;
  contatoEmail: string;
};

/** `escopo` obrigatório pelo mesmo motivo do reenvio normal — ver o cabeçalho
 *  do arquivo. Duas camadas de filtro: o `WHERE` já reduz no banco quando há
 *  um workspace; `filtradoPeloEscopo` reaplica a política completa (órfã com
 *  cliente incluída) em memória. */
async function candidatosLegados(limite: number, escopo: EscopoDoAviso): Promise<LinhaParaReenviar[]> {
  // Mesma cláusula de recuperação de reserva morta do balde normal (ver o
  // comentário acima de `RESERVA_TRAVADA_POR_MS`), com a marca PRÓPRIA deste
  // balde (`'enviando_legado'`) — nunca a marca do reenvio automático.
  const travadaDesde = new Date(Date.now() - RESERVA_TRAVADA_POR_MS).toISOString();
  const linhas =
    "casaInteira" in escopo
      ? await prisma.$queryRawUnsafe<LinhaParaReenviar[]>(
          `SELECT id, businessName, briefingJson, sdrHandoffJson, workspaceId, clientId
             FROM ClientRequestDb
            WHERE status = 'proposal_pending'
              AND (avisoOrcamentoStatus IS NULL
                   OR (avisoOrcamentoStatus = 'enviando_legado' AND avisoOrcamentoEm < ?))
            ORDER BY createdAt ASC
            LIMIT ?`,
          travadaDesde,
          limite,
        )
      : await prisma.$queryRawUnsafe<LinhaParaReenviar[]>(
          `SELECT id, businessName, briefingJson, sdrHandoffJson, workspaceId, clientId
             FROM ClientRequestDb
            WHERE status = 'proposal_pending'
              AND (avisoOrcamentoStatus IS NULL
                   OR (avisoOrcamentoStatus = 'enviando_legado' AND avisoOrcamentoEm < ?))
              AND (workspaceId = ? OR workspaceId IS NULL)
            ORDER BY createdAt ASC
            LIMIT ?`,
          travadaDesde,
          escopo.workspaceId,
          limite,
        );
  return filtradoPeloEscopo(linhas, escopo);
}

/** Separa quem tem e-mail (o único subconjunto que faz sentido no balde) de
 *  quem não tem (`sem_canal` — não é legado, não é fila de reenvio). */
function filtrarComEmail(linhas: LinhaParaReenviar[]): LinhaParaReenviar[] {
  return linhas.filter((l) => {
    const contato = lerContato({ briefingJson: l.briefingJson, sdrHandoffJson: l.sdrHandoffJson });
    return Boolean(contato.email);
  });
}

/** Teto de leitura para o balde de legados — mesma lógica de teto do resto
 *  do arquivo, mas maior que `MAX_REENVIOS_POR_CHAMADA` porque contar (GET)
 *  não dispara e-mail nenhum; só o reenvio (POST) respeita o teto de envio. */
const MAX_LEGADOS_PARA_CONTAR = 500;

/**
 * Conta e lista quem está no balde de legados, para a rota (GET) mostrar
 * separado dos que sabidamente falharam. Nunca lança: quem chama precisa
 * saber "não consegui contar" separado de "a contagem é zero" — por isso
 * devolve a promessa crua e deixa o chamador decidir o formato do erro.
 *
 * `escopo` obrigatório — mesma fronteira de posse do resto do arquivo (ver o
 * cabeçalho). Sem ele, o painel de legados vazava negócio e e-mail de
 * prospects de outros workspaces.
 */
export async function contarAvisosLegados(
  escopo: EscopoDoAviso,
): Promise<{ total: number; itens: LegadoDeAviso[] }> {
  const linhas = await candidatosLegados(MAX_LEGADOS_PARA_CONTAR, escopo);
  const comEmail = filtrarComEmail(linhas);
  return {
    total: comEmail.length,
    itens: comEmail.map((l) => ({
      id: l.id,
      businessName: l.businessName,
      contatoEmail: lerContato({ briefingJson: l.briefingJson, sdrHandoffJson: l.sdrHandoffJson }).email!,
    })),
  };
}

/**
 * Reenvia o balde de legados — pedidos com `avisoOrcamentoStatus IS NULL`
 * que já saíram de `new`, ou seja, cuja entrega no portal já aconteceu antes
 * de esta casa saber registrar o resultado do aviso por e-mail.
 *
 * ── POR QUE ISTO NUNCA É O COMPORTAMENTO PADRÃO ─────────────────────────────
 * `reenviarAvisosQueFalharam` não chama esta função, e a rota só a aciona com
 * um campo explícito no corpo do POST (`incluirLegados: true`). `NULL`
 * significa "não sabemos se o cliente já recebeu" — reenviar por padrão
 * arriscaria mandar o mesmo orçamento duas vezes para quem, por acaso, já
 * tinha recebido antes de a coluna existir. Duplicata é o defeito pior desta
 * casa (ver o cabeçalho do arquivo); por isso este balde só se mexe quando
 * alguém pede, sabendo o que está pedindo.
 *
 * A ambiguidade se autocura: depois desta tentativa (sucesso ou falha), o
 * pedido tem status conhecido e nunca mais aparece neste balde — na pior das
 * hipóteses migra para a fila comum de `reenviarAvisosQueFalharam`.
 *
 * Nunca lança: mesmo padrão de resiliência do reenvio normal.
 *
 * `escopo` obrigatório — mesma fronteira de posse das duas funções acima.
 */
export async function reenviarAvisosLegados(escopo: EscopoDoAviso): Promise<ResultadoDoReenvio> {
  const resultado: ResultadoDoReenvio = { reenviados: 0, aindaFalhando: 0, falhas: [] };

  let candidatos: LinhaParaReenviar[];
  try {
    const linhas = await candidatosLegados(MAX_REENVIOS_POR_CHAMADA, escopo);
    candidatos = filtrarComEmail(linhas);
  } catch (err) {
    resultado.falhas.push(err instanceof Error ? err.message : String(err));
    return resultado;
  }

  // `reservarParaLegado` — marca PRÓPRIA (`'enviando_legado'`), nunca a
  // marca do reenvio automático. Ver o porquê no comentário acima de
  // `RESERVA_TRAVADA_POR_MS`.
  await tentarReenviosEmLote(candidatos, resultado, reservarParaLegado);
  return resultado;
}

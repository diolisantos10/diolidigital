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
//    DEPOIS da transação e nunca é retentado. Ver o bloco de comentário em
//    `avisarPorEmail`: essa ordem é a garantia de que ninguém recebe o mesmo
//    orçamento duas vezes.

import { prisma } from "@/lib/db/client";
import {
  textoDaVerbaEstourada,
  type ConfrontoDeVerba,
} from "@/lib/agency/comercial/verba-declarada";
import { lerContato } from "@/lib/agency/comercial/contato-do-lead";
import { HOST_PADRAO } from "@/lib/agency/esteira/links-do-portal";
import { sendEmail } from "@/lib/email/send";
import { orcamentoProntoEmail } from "@/lib/email/templates";

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

type EstimativaGuardada = {
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
async function linkDaConversa(clientRequestId: string): Promise<string | null> {
  try {
    const acesso = await prisma.portalAccess.findFirst({
      where: { clientRequestId, revokedAt: null },
      orderBy: { grantedAt: "desc" },
      select: { token: true },
    });
    return acesso ? `${HOST_PADRAO}/portal/access/${acesso.token}` : null;
  } catch {
    return null;
  }
}

/** O que aconteceu com o toque no ombro. `sem_canal` NÃO é falha. */
type ResultadoDoAviso = "avisado" | "sem_canal" | "falhou";

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
  pedido: { id: string; businessName: string | null; briefingJson: string | null; sdrHandoffJson: string | null },
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
    if (!contato.email) return "sem_canal";

    const { subject, html } = orcamentoProntoEmail({
      prospectName: contato.nome ?? undefined,
      businessName: pedido.businessName ?? undefined,
      faixa: faixaDoOrcamento(e),
      // Sinalizador, não conta: o e-mail reconhece que a faixa passou da verba
      // declarada e manda ler a conversa, onde a diferença é nomeada e o que
      // cabe é oferecido. Repetir a conta aqui criaria duas versões dela.
      verbaEstourada: Boolean(e.confrontoDeVerba),
      portalLink: (await linkDaConversa(pedido.id)) ?? undefined,
    });

    const r = await sendEmail({ to: contato.email, subject, html });
    if (r.ok) return "avisado";

    // `skipped` é a casa sem RESEND_API_KEY — configuração, não defeito do
    // pedido. Distinguir os dois no log evita mandar alguém caçar bug onde
    // falta variável de ambiente.
    console.warn(
      r.skipped
        ? `[orcamento] aviso não enviado (RESEND_API_KEY ausente) — pedido ${pedido.id}`
        : `[orcamento] aviso falhou — pedido ${pedido.id}: ${r.error ?? "sem detalhe"}`,
    );
    return "falhou";
  } catch (err) {
    console.error("[orcamento] aviso lançou — a entrega segue valendo:", err);
    return "falhou";
  }
}

/**
 * O texto que o cliente lê. Escrito para quem NÃO trabalha na agência: sem id,
 * sem nome de sistema, sem custo interno, sem prazo prometido.
 */
export function textoDoOrcamento(negocio: string, e: EstimativaGuardada): string {
  const linhas: string[] = [];

  linhas.push(`Recebemos seu briefing${negocio ? ` da ${negocio}` : ""} — obrigado pelo material.`);
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
      const e = estimativaDe(pedido.briefingJson);
      if (!e) {
        // Sem número derivado não se inventa número. Fica de pé como estava,
        // para a fila de gente — e conta como notícia, não como rotina.
        resultado.semOrcamento += 1;
        continue;
      }

      const corpo = textoDoOrcamento(pedido.businessName ?? "", e);

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
        prisma.clientRequestDb.update({
          where: { id: pedido.id },
          data: { status: "proposal_pending" },
        }),
      ]);

      // A ENTREGA ESTÁ FEITA AQUI. O que vem depois é aviso, e aviso não
      // desfaz entrega. Contar `entregues` antes do e-mail não é descuido de
      // ordem: é a afirmação de que o orçamento chegou ao portal e nada abaixo
      // desta linha pode voltar atrás nisso.
      resultado.entregues += 1;

      switch (await avisarPorEmail(pedido, e)) {
        case "avisado":
          resultado.avisados += 1;
          break;
        case "sem_canal":
          resultado.semCanal += 1;
          break;
        case "falhou":
          resultado.avisosQueFalharam.push(
            `pedido ${pedido.id} (${pedido.businessName ?? "sem nome"}): orçamento entregue no portal, mas o e-mail não saiu`,
          );
          break;
      }
    } catch (err) {
      resultado.falhas.push(err instanceof Error ? err.message : String(err));
    }
  }

  return resultado;
}

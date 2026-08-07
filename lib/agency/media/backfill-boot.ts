// A TAREFA DE BOOT DO BACKFILL DE CARROSSEL — o backfill sem clique.
//
// Por que existe (05/08/2026): a reconciliação das telas já tinha script e já
// tinha tela, e mesmo assim não acontecia. O script exige linha de comando no
// banco de produção; a tela exige sessão master, e a senha do master de
// produção vive numa variável do Railway que ninguém consegue ler de volta. O
// trabalho estava pronto e parado por falta de porta — o tipo de estado que
// esta casa chama de vazamento.
//
// A porta é uma VARIÁVEL DE AMBIENTE, e ela é o interruptor:
//
//     BACKFILL_CARROSSEL_CLIENT_ID=<id do cliente>   → roda uma vez, no boot
//     (remover a variável)                            → nunca mais roda
//
// ── As travas, todas herdadas e nenhuma reinventada ──────────────────────────
//  • a regra de casamento é a de `backfill-carrossel.mjs` (29 testes);
//  • a leitura do mundo é a de `backfill-contexto.ts` — a MESMA da tela, para
//    que o caminho automático nunca enxergue um mundo diferente do humano;
//  • `--por-ordem` NÃO EXISTE aqui, em dois níveis: o contexto nunca liga a
//    flag E este runner ABORTA se, por qualquer caminho, o plano trouxer uma
//    tela `via: "ordem"`. Casamento posicional monta carrossel com logo e
//    material bruto;
//  • `--force` não existe: capa preenchida à mão não é trocada, e nada que já
//    está gravado é perdido. O que MUDOU em 05/08/2026: post com carrossel
//    INCOMPLETO (as telas gravadas são um subconjunto do plano) é REPARADO, e
//    o log anuncia `reparado: 5 → 6 telas`. Sem isso, os 6 carrosséis que a
//    primeira passada gravou sem a capa ficariam presos para sempre — e
//    "presos para sempre" é o que esta casa chama de vazamento;
//  • o ENSAIO COMPLETO é impresso ANTES de qualquer escrita. É a conferência
//    tela por tela do CEO, feita pelo log do Railway.
//
// ── O nome de arquivo NO LOG: exceção consciente, e limitada ────────────────
// `MediaAsset.fileName` é marcado no schema como "PII em potencial — nunca em
// log". Aqui ele aparece, e de propósito: o método de casamento É o nome ("por
// que esta tela é do carrossel 2?" só tem uma resposta honesta, e ela é o
// nome). Sem ele, o ensaio vira um número e a conferência de quem autoriza
// deixa de existir. O que limita a exceção: este log só sai enquanto a variável
// estiver ligada, num deploy escolhido, e o que ele lista são artes de produção
// da agência — não anexo enviado pelo cliente.
//
// ── Por que no boot, e não no despertador ────────────────────────────────────
// Isto é um conserto de dado que acontece UMA vez, não uma rotina. No relógio
// de 5 em 5 minutos, o log do ensaio viraria ruído e a idempotência viraria a
// única proteção contra uma segunda escrita. No boot, o CEO liga a variável,
// lê o log do deploy, confere e desliga.
//
// ═══════════════════════════════════════════════════════════════════════════
// ── A SEGUNDA PORTA DESTE ARQUIVO (05/08/2026) ─────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════
//
//     REABRIR_CARD_APROVACAO=<id do card>   → reabre UM card, no boot
//     (remover a variável)                   → nunca mais roda
//
// Por que ela mora aqui e não num arquivo próprio: `instrumentation.ts` chama
// UM ponto de entrada (`agendarBackfillDeBoot`), e este arquivo é ele. Quem
// decide o QUÊ continua sendo a esteira — a regra inteira, incluindo a trava e
// as recusas, vive em `lib/agency/esteira/reabrir-aprovacao.ts`
// (`reabrirCardPorDecisaoDaDirecao`). Aqui só há o interruptor e o log.
//
// Por que ela existe: o impasse de ovo e galinha. A passada que acrescentou as
// telas (5 → 6) rodou ANTES de a regra do ganho existir; quando a regra passou
// a valer, o log já dizia `0 post(s) seriam atualizados · 6 post(s) já com
// telas (intocados)`. Não havia mais ganho para provar, e o card ficou preso em
// `revision_requested` — o CEO esperando para aprovar, sem botão que o
// destravasse. Estado que prende trabalho para sempre é vazamento.
//
// ⛔ Isto NÃO é um afrouxamento da regra do ganho: ela continua intacta, e
//    continua sendo a única que autoriza reabertura AUTOMÁTICA. Esta porta é
//    outra coisa — decisão humana registrada, e ela se declara assim no card e
//    no log. A trava dela é o ESTADO das peças (todo carrossel com ≥2 telas e a
//    capa sendo a tela 1); peça incompleta é RECUSADA, nomeando o que falta.
//
// As duas portas rodam EM SÉRIE, nesta ordem, quando as duas variáveis estão
// ligadas no mesmo deploy: a reabertura precisa ver o estado FINAL das peças,
// não o de antes do backfill.

import { prisma } from "@/lib/db/client";
import { decidirGravacao, postsParaGravar } from "@/lib/agency/media/backfill-carrossel.mjs";
import { montarPlanoDoCliente, type ContextoDoBackfill } from "@/lib/agency/media/backfill-contexto";
import {
  reabrirAprovacoesDosPosts,
  reabrirCardPorDecisaoDaDirecao,
  dataLegivel,
} from "@/lib/agency/esteira/reabrir-aprovacao";

/** O interruptor. Definida = roda no próximo boot; removida = não roda mais. */
export const VARIAVEL = "BACKFILL_CARROSSEL_CLIENT_ID";

/** O interruptor da SEGUNDA porta: o id do card a reabrir por decisão da
 *  direção. Aceita **só o id** — de propósito. O cliente do backfill pode ser
 *  resolvido pelo nome porque errar o cliente aborta no ensaio; errar o card
 *  aqui é devolver a decisão errada a um cliente, e card não tem nome único. */
export const VARIAVEL_REABRIR = "REABRIR_CARD_APROVACAO";

/** O motivo que o cliente lê no card reaberto. Negócio, não jargão. */
const MOTIVO_DA_REABERTURA =
  "as telas de cada carrossel foram ligadas às peças. Antes este card mostrava " +
  "só a capa de cada peça; agora ele mostra o carrossel inteiro, e a sua " +
  "decisão passa a ser sobre 100% do que vai ao ar.";

/** Espera antes de rodar: o boot termina de subir primeiro. O trabalho é de
 *  poucas consultas, mas o health check do Railway não pode esperar por ele. */
const ATRASO_MS = 3_000;

export type MotivoDeParada =
  | "variavel-ausente"
  | "cliente-inexistente"
  | "plano-abortado"
  | "casamento-por-ordem"
  /** Duas artes disputam a mesma tela — jogo velho e jogo aprovado convivendo
   *  nos Arquivos. Ver a trava em `aplicarBackfill`. */
  | "telas-ambiguas"
  | "nada-a-fazer"
  | "erro";

export interface ResultadoDoBackfillDeBoot {
  rodou: boolean;
  motivo: MotivoDeParada | "aplicado";
  postsAtualizados: number;
  telasLigadas: number;
  cardsReabertos: string[];
}

let jaRodou = false;

function log(linha: string): void {
  console.log(`[backfill-boot] ${linha}`);
}

/** Prefixo próprio: no log do Railway as duas portas não se confundem. */
function logReabrir(linha: string): void {
  console.log(`[reabrir-card] ${linha}`);
}

/** O ensaio inteiro, em linhas. Puro: quem chama imprime, e o teste lê. */
export function linhasDoEnsaio(ctx: ContextoDoBackfill): string[] {
  const { plano } = ctx;
  const linhas: string[] = [];
  linhas.push(`cliente: ${ctx.cliente.nome} (${ctx.cliente.id})`);
  linhas.push(
    `${plano.posts.length} carrossel(éis) · ${ctx.imagens} imagem(ns) nos Arquivos · ` +
      `${ctx.midiasComDono} mídia(s) já com dono no workspace`,
  );

  linhas.push("── O que casou ───────────────────────────────────────────");
  for (const post of plano.posts) {
    const capa = post.mediaUrl ? `capa atual: ${post.mediaUrl} (mantida)` : "sem capa (a tela 1 vira capa)";
    linhas.push(`▸ ${post.id} (#${post.idx}) — "${post.caption}…" · ${capa}`);
    const d = decidirGravacao(post, { force: false });
    if (d.acao === "reparar") {
      // O caso que a idempotência binária escondia: TEM telas e mesmo assim
      // está incompleto. O log tem que dizer o número de antes e o de depois —
      // "atualizado" sozinho não deixa ninguém conferir nada.
      linhas.push(
        `   ⟳ INCOMPLETO — será reparado: ${d.telasAtuais} → ${d.urls.length} telas ` +
          `(${d.faltando} faltando; nada do que já está ligado se perde)`,
      );
    } else if (post.telasAtuais.length > 0) {
      linhas.push(`   já tem ${post.telasAtuais.length} tela(s) ligada(s) — NÃO será tocado`);
    }
    if (post.telas.length === 0) {
      linhas.push("   ✗ NENHUMA tela casou");
      continue;
    }
    for (const t of post.telas) {
      // A tela 1 vinda da capa sai marcada [capa]: é o método do casamento, e
      // é ele que prova que `mediaUrlsJson` COMEÇA pela capa.
      linhas.push(`   tela ${t.pos}: ${t.fileName} [${t.via}] → /api/media/${t.assetId}`);
    }
  }

  linhas.push("── EXCLUÍDAS do casamento (com motivo) ───────────────────");
  if (plano.excluidos.length === 0) linhas.push("   (nenhuma)");
  for (const a of plano.excluidos) {
    linhas.push(`   ⛔ ${a.fileName} (${a.assetId}) — ${a.motivo}`);
  }

  linhas.push("── O que sobrou sem casar ────────────────────────────────");
  if (plano.naoCasados.length === 0) {
    linhas.push("   (nada — toda imagem casou ou foi excluída)");
  }
  for (const a of plano.naoCasados) {
    // O nome do arquivo importa: é por ele que se descobre o padrão real do que
    // foi subido à mão quando nada casa.
    linhas.push(`   ? ${a.fileName} (${a.assetId}, ${a.createdAt == null ? "sem data" : String(a.createdAt)})`);
  }

  const aGravar = postsParaGravar(plano.posts, { force: false });
  const telas = aGravar.reduce((s, p) => s + p.urls.length, 0);
  const novos = aGravar.filter((p) => p.acao === "ligar").length;
  const reparos = aGravar.filter((p) => p.acao === "reparar").length;
  const emGravacao = new Set(aGravar.map((p) => p.id));
  const jaTem = plano.posts.filter((p) => p.telasAtuais.length > 0 && !emGravacao.has(p.id)).length;
  const insuficientes = plano.posts.filter((p) => p.telasAtuais.length === 0 && p.telas.length < 2).length;
  linhas.push("── Resumo ────────────────────────────────────────────────");
  linhas.push(
    `   ${aGravar.length} post(s) seriam atualizados (${novos} novo(s) · ${reparos} reparo(s)) · ` +
      `${telas} tela(s) seriam ligadas`,
  );
  linhas.push(`   ${jaTem} post(s) já com telas (intocados) · ${insuficientes} post(s) sem telas suficientes`);
  return linhas;
}

/**
 * De que cliente é este backfill? A variável aceita o **id** ou o **nome** —
 * quem liga isto é o CEO pelo painel do Railway, e o id do cliente não é uma
 * coisa que ele tenha à mão.
 *
 * O nome NUNCA é adivinhado: só vale quando bate em UM cliente. Dois candidatos
 * abortam e o log lista os dois — escrever no cliente errado é pior do que não
 * escrever.
 */
export async function resolverCliente(
  valor: string,
): Promise<{ id: string; via: "id" | "nome" } | { erro: string; candidatos: Array<{ id: string; name: string }> }> {
  const porId = await prisma.client.findUnique({ where: { id: valor }, select: { id: true } });
  if (porId) return { id: porId.id, via: "id" };

  const porNome = await prisma.client.findMany({
    where: { name: { contains: valor } },
    select: { id: true, name: true },
    take: 10,
    orderBy: { createdAt: "asc" },
  });
  if (porNome.length === 1) return { id: porNome[0]!.id, via: "nome" };
  return {
    erro: porNome.length === 0
      ? "nenhum cliente com este id nem com este nome"
      : `${porNome.length} clientes casam com este nome — ambiguidade não se resolve por chute`,
    candidatos: porNome,
  };
}

/** Alguma tela deste plano foi casada por POSIÇÃO? É o que aborta tudo. */
export function telasPorOrdem(ctx: ContextoDoBackfill): number {
  return ctx.plano.posts.reduce(
    (s, p) => s + p.telas.filter((t) => t.via === "ordem").length,
    0,
  );
}

/**
 * O trabalho em si, já com o contexto lido. Separado de `rodarBackfillDeBoot`
 * para que o teste possa provar as duas metades — a que aplica e a que aborta —
 * sem depender de variável de ambiente.
 */
export async function aplicarBackfill(ctx: ContextoDoBackfill): Promise<ResultadoDoBackfillDeBoot> {
  const nada = (motivo: MotivoDeParada): ResultadoDoBackfillDeBoot => ({
    rodou: false, motivo, postsAtualizados: 0, telasLigadas: 0, cardsReabertos: [],
  });

  // 1. ABORTO DE DOMÍNIO — antes de imprimir plano nenhum, porque não há plano.
  if (ctx.plano.erro) {
    log(`✗ ABORTADO: ${ctx.plano.erro.detalhe}`);
    for (const p of ctx.plano.erro.semData ?? []) {
      log(`   sem data no calendário: ${p.id} — "${p.caption}…"`);
    }
    if (ctx.plano.erro.codigo === "sem-data") {
      log("   O índice C<n> das telas vem da ORDEM do calendário — sem data, essa ordem");
      log("   mentiria e as telas iriam para o carrossel errado.");
      log("   Preencha a data desses posts e faça um novo deploy. NADA foi gravado.");
    }
    return nada("plano-abortado");
  }

  // 2. O ENSAIO COMPLETO — sempre, e sempre ANTES de escrever.
  for (const linha of linhasDoEnsaio(ctx)) log(linha);

  // 3. A TRAVA DO CASAMENTO POSICIONAL. O contexto nunca liga `--por-ordem`;
  //    esta guarda é o suspensório: se um dia alguém ligar, a escrita não sai.
  const porOrdem = telasPorOrdem(ctx);
  if (porOrdem > 0) {
    log(`✗ ABORTADO: ${porOrdem} tela(s) casadas por ORDEM DE UPLOAD.`);
    log("   Casamento posicional é chute — monta carrossel com logo e material bruto.");
    log("   Esta tarefa NUNCA aplica isso. NADA foi gravado.");
    return nada("casamento-por-ordem");
  }

  // 3b. A TRAVA DA AMBIGUIDADE (07/08/2026). Medida em produção: os 6
  //     carrosséis da Foocci estavam CERTOS e COMPLETOS (as 6 telas v4), e
  //     mesmo assim o ensaio propunha "reparar" os 6 — porque as telas v3
  //     antigas continuam nos Arquivos e casam com o mesmo carrossel pelo mesmo
  //     padrão de nome. Aplicar teria alternado arte velha e nova em peça já
  //     aprovada pelo cliente. Duas candidatas para a mesma posição é decisão de
  //     gente, não de tarefa de boot rodando às 3 da manhã.
  const ambiguos = ctx.plano.posts
    .map((p) => ({ post: p, d: decidirGravacao(p, { force: false }) }))
    .filter((x) => x.d.acao === "ambiguo");
  if (ambiguos.length > 0) {
    log(`✗ ABORTADO: ${ambiguos.length} carrossel(éis) com DUAS artes para a mesma tela.`);
    for (const { post, d } of ambiguos) {
      log(`   C${post.idx} (${post.id}): posições em disputa ${d.posicoesEmDisputa.join(", ")}`);
      for (const pos of d.posicoesEmDisputa) {
        const nomes = post.telas.filter((t) => t.pos === pos).map((t) => t.fileName);
        log(`      tela ${pos}: ${nomes.join("  ×  ")}`);
      }
    }
    log("   Provavelmente um jogo ANTIGO e o APROVADO convivem nos Arquivos do");
    log("   cliente, e os dois casam com o mesmo carrossel pelo nome. Apague ou");
    log("   renomeie o jogo que não vale. NADA foi gravado.");
    return nada("telas-ambiguas");
  }

  // 4. O QUE SERIA GRAVADO. Vazio = idempotência: já rodou, e é para dizer isso.
  const aGravar = postsParaGravar(ctx.plano.posts, { force: false });
  if (aGravar.length === 0) {
    const jaTem = ctx.plano.posts.filter((p) => p.telasAtuais.length > 0).length;
    const nenhumaCasou = ctx.plano.posts.every((p) => p.telas.length === 0);
    log("✓ NADA A FAZER — nenhum post seria alterado. Nada foi gravado.");
    if (jaTem === ctx.plano.posts.length) {
      log("  Todos os carrosséis JÁ têm telas ligadas e COMPLETAS — nenhum está faltando");
      log("  tela nenhuma do plano (é o estado esperado depois de uma passada");
      log(`  bem-sucedida). Pode remover ${VARIAVEL} do Railway.`);
    } else if (nenhumaCasou) {
      // O cenário que exige olho humano: o nome dos arquivos em produção não é
      // o que o reconhecedor espera. A lista acima É a resposta — e ela é o
      // único jeito honesto de descobrir o padrão real sem arriscar escrita.
      log("  ⚠ NENHUMA tela casou por nome. Os padrões reconhecidos são");
      log("    `carrossel-<postId>-<n>.png` (produzido pela esteira) e `c<N>t<M>` (C2T3, c02-t05…).");
      log("    Os nomes REAIS estão listados em 'o que sobrou sem casar', acima — mande");
      log("    essa lista ao Diretor. Casamento por posição NÃO é feito aqui, por decisão.");
    } else {
      log("  Os posts que casaram já tinham telas, e os demais casaram menos de 2 telas");
      log("  (uma imagem só não é carrossel). Confira a lista acima.");
    }
    return nada("nada-a-fazer");
  }

  // 5. A ESCRITA — transação única, tudo ou nada.
  const capaAtual = new Map(ctx.plano.posts.map((p) => [p.id, p.mediaUrl]));
  const reparos = aGravar.filter((p) => p.acao === "reparar").length;
  log(
    `▶ ESCREVENDO ${aGravar.length} post(s) numa transação única` +
      `${reparos > 0 ? ` — ${reparos} deles são REPARO de carrossel incompleto` : ""}…`,
  );
  await prisma.$transaction(
    aGravar.map((post) =>
      prisma.socialPost.update({
        where: { id: post.id },
        data: {
          // `urls` já vem na ordem do plano — tela 1 primeiro. Quando a tela 1
          // é a capa do post, `urls[0]` É a capa: o contrato de
          // `execution/artes.ts` (`mediaUrl = urls[0]`) fica preservado, e a
          // publicação no Instagram sai com o carrossel inteiro.
          mediaUrlsJson: JSON.stringify(post.urls),
          // Capa vazia é preenchida com a tela 1; capa posta à mão fica.
          ...(capaAtual.get(post.id) ? {} : { mediaUrl: post.urls[0] }),
        },
      }),
    ),
  );
  const telasLigadas = aGravar.reduce((s, p) => s + p.urls.length, 0);
  log(`✅ ${aGravar.length} post(s) atualizados · ${telasLigadas} tela(s) ligadas.`);
  // Post a post, com o número de antes e o de depois: é o que permite conferir
  // um reparo sem abrir o banco.
  for (const p of aGravar) {
    log(
      p.acao === "reparar"
        ? `   ⟳ ${p.id} reparado: ${p.telasAtuais} → ${p.urls.length} telas`
        : `   + ${p.id} ligado: ${p.urls.length} telas`,
    );
  }

  // 6. A APROVAÇÃO VOLTA PARA QUEM DECIDIU VENDO MENOS DO QUE EXISTE.
  //    Só os posts alterados AGORA entram — sem isso, todo boot reabriria o
  //    card e o cliente ficaria decidindo a mesma coisa para sempre.
  //
  //    E vai junto o DE-PARA de telas, peça por peça. Card em que o cliente
  //    pediu ajuste só reabre com ganho comprovado; se este runner mandasse
  //    apenas a lista de ids, a reabertura teria de PRESUMIR que algo mudou —
  //    e uma condição presumida é decoração, não trava.
  const cardsReabertos: string[] = [];
  try {
    const r = await reabrirAprovacoesDosPosts({
      clientId: ctx.cliente.id,
      postIds: aGravar.map((p) => p.id),
      motivo: MOTIVO_DA_REABERTURA,
      mudancas: aGravar.map((p) => ({
        postId: p.id,
        telasAntes: p.telasAtuais,
        telasDepois: p.urls.length,
      })),
    });
    log("── Aprovação ─────────────────────────────────────────────");
    for (const c of r.reabertos) {
      cardsReabertos.push(c.approvalRequestId);
      log(
        `   ↩ card ${c.approvalRequestId}: estava "${c.statusAnterior}" ` +
          `(decidido por ${c.decididoPor ?? "—"}) → volta a PENDENTE, agora com as telas`,
      );
      log(`     histórico da decisão anterior preservado no card (comentário visível ao cliente)`);
      log(`     ${c.postsDevolvidos} peça(s) devolvida(s) para "draft" — a marca da decisão foi retirada`);
      if (c.pedidoDeAjuste) {
        // A linha que responde à pergunta que o CEO faria primeiro: "e o que eu
        // pedi, sumiu?". O pedido dele NÃO é apagado nem movido — o registro
        // novo entra depois dele no mesmo histórico.
        log(
          `     ↪ o card estava em AJUSTE SOLICITADO e voltou porque as peças mudaram: ` +
            `${c.pecasCompletadas} peça(s) completada(s) · ${c.telasAcrescentadas} tela(s) acrescentada(s)`,
        );
        log(
          `       o pedido de ajuste do cliente (${dataLegivel(c.pedidoDeAjuste.registradoEm)} · ` +
            `${c.pedidoDeAjuste.autor}) CONTINUA no histórico do card` +
            `${c.pedidoDeAjuste.comentarioNoHistorico ? ", com as palavras dele" : " (sem texto anexo)"} — ` +
            `o registro novo responde a ele, não o substitui`,
        );
      }
      if (c.prazoRemovido) {
        log(`     prazo vencido removido (ele media a decisão antiga); prazo novo NÃO foi inventado`);
      }
    }
    for (const id of r.jaPendentes) {
      log(`   • card ${id} já estava esperando decisão — as telas novas aparecem nele sozinhas`);
    }
    for (const rec of r.recusados) {
      log(`   ⛔ card ${rec.approvalRequestId} NÃO reaberto: ${rec.motivo}`);
    }
    if (r.reabertos.length + r.jaPendentes.length + r.recusados.length === 0) {
      log("   (nenhum card de aprovação decide estas peças — nada a reabrir)");
    }
  } catch (e) {
    // A reabertura falhar não desfaz o backfill: as telas ligadas são melhoria
    // por si. Mas o log tem que gritar, senão o CEO acha que o card voltou.
    log(`⚠ A REABERTURA DA APROVAÇÃO FALHOU: ${e instanceof Error ? e.message : "erro"}`);
    log("  As telas ESTÃO ligadas, mas o card não voltou para decisão. Avise o Diretor.");
  }

  return {
    rodou: true,
    motivo: "aplicado",
    postsAtualizados: aGravar.length,
    telasLigadas,
    cardsReabertos,
  };
}

/**
 * O ponto de entrada do boot. Sem a variável, silêncio absoluto — esta tarefa
 * não fala em deploy nenhum que não seja o dela.
 */
export async function rodarBackfillDeBoot(): Promise<ResultadoDoBackfillDeBoot> {
  const nada = (motivo: MotivoDeParada): ResultadoDoBackfillDeBoot => ({
    rodou: false, motivo, postsAtualizados: 0, telasLigadas: 0, cardsReabertos: [],
  });

  const pedido = (process.env[VARIAVEL] ?? "").trim();
  if (!pedido) return nada("variavel-ausente");

  log("═══ BACKFILL DE CARROSSEL — tarefa de boot ═══════════════");
  log(`${VARIAVEL}=${pedido}`);
  log("modo: ENSAIO COMPLETO antes de escrever · sem --por-ordem · sem --force");

  try {
    const alvo = await resolverCliente(pedido);
    if ("erro" in alvo) {
      log(`✗ ABORTADO: ${alvo.erro}. NADA foi gravado.`);
      for (const c of alvo.candidatos) log(`   candidato: ${c.id} — ${c.name}`);
      log(`   ${VARIAVEL} aceita o id do cliente OU o nome dele, desde que o nome case`);
      log("   com um cliente só. O id aparece na URL do painel: /agency/clients/<id>.");
      return nada("cliente-inexistente");
    }
    if (alvo.via === "nome") log(`✓ cliente resolvido pelo NOME → ${alvo.id}`);

    const ctx = await montarPlanoDoCliente(alvo.id);
    if (!ctx) {
      log(`✗ ABORTADO: cliente ${alvo.id} sumiu entre a resolução e a leitura. NADA foi gravado.`);
      return nada("cliente-inexistente");
    }
    const r = await aplicarBackfill(ctx);
    log(`═══ FIM. Remova ${VARIAVEL} do Railway para não rodar de novo. ═══`);
    return r;
  } catch (e) {
    // Nada aqui pode derrubar o servidor: a agência inteira não fica fora do ar
    // por causa de um conserto de dado.
    log(`⚠ FALHOU: ${e instanceof Error ? e.message : "erro desconhecido"}`);
    return nada("erro");
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// A SEGUNDA PORTA: reabrir UM card por decisão da direção
// ═══════════════════════════════════════════════════════════════════════════

export type ResultadoDaPortaDaDirecao = "reaberto" | "ja-pendente" | "recusado" | "variavel-ausente" | "erro";

export interface ResultadoDaReaberturaDeBoot {
  rodou: boolean;
  motivo: ResultadoDaPortaDaDirecao;
  approvalRequestId: string;
  postsDevolvidos: number;
}

/**
 * Reabre o card nomeado em `REABRIR_CARD_APROVACAO`.
 *
 * Sem a variável, silêncio absoluto — como a outra porta. Com a variável, o log
 * conta a decisão inteira: o que foi conferido, o que autorizou (ou o que
 * faltou), e o que ficou gravado. Nada aqui pode derrubar o servidor.
 */
export async function rodarReaberturaDeBoot(): Promise<ResultadoDaReaberturaDeBoot> {
  const pedido = (process.env[VARIAVEL_REABRIR] ?? "").trim();
  const nada = (motivo: ResultadoDaPortaDaDirecao): ResultadoDaReaberturaDeBoot => ({
    rodou: false, motivo, approvalRequestId: pedido, postsDevolvidos: 0,
  });
  if (!pedido) return nada("variavel-ausente");

  logReabrir("═══ REABRIR CARD — decisão da direção ═══════════════════");
  logReabrir(`${VARIAVEL_REABRIR}=${pedido}`);
  logReabrir(
    "esta porta NÃO usa ganho de telas (aquela regra continua intacta). A trava aqui é o",
  );
  logReabrir(
    "ESTADO das peças: todo carrossel com ≥2 telas e a capa sendo a tela 1. Peça incompleta = RECUSA.",
  );

  try {
    const r = await reabrirCardPorDecisaoDaDirecao({ approvalRequestId: pedido });

    if (r.resultado === "recusado") {
      logReabrir(`⛔ NÃO REABERTO: ${r.motivo}`);
      if (r.faltas.length > 0) {
        logReabrir("   o que falta, peça por peça:");
        for (const f of r.faltas) logReabrir(`   ✗ ${f.postId} — ${f.falta}`);
        logReabrir("   Complete as peças e faça um novo deploy com a variável ainda ligada.");
      }
      logReabrir(
        `   NADA foi gravado. O card continua em "${r.statusAnterior ?? "—"}" e o cliente ` +
          `não recebeu pedido de decisão nenhum.`,
      );
      logReabrir(`═══ FIM. Remova ${VARIAVEL_REABRIR} do Railway. ═══`);
      return { rodou: false, motivo: "recusado", approvalRequestId: pedido, postsDevolvidos: 0 };
    }

    if (r.resultado === "ja-pendente") {
      // A idempotência: o CEO pode esquecer a variável ligada, e o segundo boot
      // não pode escrever um segundo comentário no histórico do cliente.
      logReabrir("✓ NADA A FAZER — o card já está PENDENTE, esperando a sua decisão.");
      logReabrir("  Um segundo boot com a variável ligada NÃO escreve segundo comentário.");
      logReabrir(`  Pode remover ${VARIAVEL_REABRIR} do Railway.`);
      logReabrir(`═══ FIM. Remova ${VARIAVEL_REABRIR} do Railway. ═══`);
      return { rodou: false, motivo: "ja-pendente", approvalRequestId: pedido, postsDevolvidos: 0 };
    }

    // ── Reaberto: o log tem que deixar conferir sem abrir o banco ────────────
    logReabrir(`✓ peças conferidas: ${r.pecasConferidas.length}, TODAS completas`);
    for (const p of r.pecasConferidas) {
      logReabrir(`   • ${p.postId} (${p.formato}) — ${p.telas.length} tela(s), capa = tela 1`);
    }
    logReabrir(
      `↩ card ${r.approvalRequestId}: estava "${r.statusAnterior}" → volta a PENDENTE ` +
        `POR DECISÃO DA DIREÇÃO (nada mudou nas peças nesta passada, e o card diz isso)`,
    );
    logReabrir(`  ${r.postsDevolvidos} peça(s) devolvida(s) para "draft" — a marca "Em ajuste" saiu`);
    if (r.pedidoDeAjuste) {
      logReabrir(
        `  o pedido de ajuste do cliente (${dataLegivel(r.pedidoDeAjuste.registradoEm)} · ` +
          `${r.pedidoDeAjuste.autor}) CONTINUA no histórico do card` +
          `${r.pedidoDeAjuste.comentarioNoHistorico ? ", com as palavras dele" : " (sem texto anexo)"}` +
          ` — o registro novo entra DEPOIS dele, não no lugar dele`,
      );
    }
    if (r.prazoRemovido) {
      logReabrir("  prazo vencido removido (ele media a decisão antiga); prazo novo NÃO foi inventado");
    }
    logReabrir(`═══ FIM. Remova ${VARIAVEL_REABRIR} do Railway. ═══`);
    return {
      rodou: true, motivo: "reaberto",
      approvalRequestId: r.approvalRequestId, postsDevolvidos: r.postsDevolvidos,
    };
  } catch (e) {
    logReabrir(`⚠ FALHOU: ${e instanceof Error ? e.message : "erro desconhecido"}`);
    logReabrir("  O card NÃO voltou para decisão. Avise o Diretor.");
    return nada("erro");
  }
}

/**
 * Agenda as tarefas de boot guardadas por variável, uma vez por instância.
 *
 * O nome continua o de origem porque é ele que `instrumentation.ts` chama —
 * este é o ÚNICO ponto de entrada de conserto de dado no boot, e trocar o nome
 * por elegância custaria uma edição fora do território com zero ganho.
 *
 * Não bloqueia o `register()`: o health check do Railway não espera por um
 * conserto de dado. Chamar duas vezes (o HMR do dev faz isso) é inofensivo.
 *
 * As duas rodam EM SÉRIE e nesta ordem: com as duas variáveis ligadas no mesmo
 * deploy, a reabertura tem que ler o estado das peças DEPOIS do backfill — se
 * lesse antes, recusaria por peça incompleta um card que o backfill acabaria de
 * completar. Encadear é o que torna essa ordem um fato, e não uma torcida.
 */
export function agendarBackfillDeBoot(): void {
  if (jaRodou) return;
  const temBackfill = !!(process.env[VARIAVEL] ?? "").trim();
  const temReabertura = !!(process.env[VARIAVEL_REABRIR] ?? "").trim();
  if (!temBackfill && !temReabertura) return;
  jaRodou = true;
  if (temBackfill) log(`agendado — ${VARIAVEL} presente; o ensaio sai em ${ATRASO_MS / 1000}s`);
  if (temReabertura) {
    logReabrir(
      `agendada — ${VARIAVEL_REABRIR} presente; roda em ${ATRASO_MS / 1000}s, DEPOIS do backfill`,
    );
  }
  const t = setTimeout(() => {
    void (async () => {
      // Cada uma sai calada quando a sua variável não está definida.
      await rodarBackfillDeBoot();
      await rodarReaberturaDeBoot();
    })();
  }, ATRASO_MS);
  // Não segura o processo vivo: se o servidor está encerrando, ele encerra.
  t.unref?.();
}

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
//  • `--force` não existe: post que já tem telas não é tocado, capa preenchida
//    à mão não é trocada;
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

import { prisma } from "@/lib/db/client";
import { postsParaGravar } from "@/lib/agency/media/backfill-carrossel.mjs";
import { montarPlanoDoCliente, type ContextoDoBackfill } from "@/lib/agency/media/backfill-contexto";
import { reabrirAprovacoesDosPosts } from "@/lib/agency/esteira/reabrir-aprovacao";

/** O interruptor. Definida = roda no próximo boot; removida = não roda mais. */
export const VARIAVEL = "BACKFILL_CARROSSEL_CLIENT_ID";

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
    if (post.telasAtuais.length > 0) {
      linhas.push(`   já tem ${post.telasAtuais.length} tela(s) ligada(s) — NÃO será tocado`);
    }
    if (post.telas.length === 0) {
      linhas.push("   ✗ NENHUMA tela casou");
      continue;
    }
    for (const t of post.telas) {
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
  const jaTem = plano.posts.filter((p) => p.telasAtuais.length > 0).length;
  const insuficientes = plano.posts.filter((p) => p.telasAtuais.length === 0 && p.telas.length < 2).length;
  linhas.push("── Resumo ────────────────────────────────────────────────");
  linhas.push(`   ${aGravar.length} post(s) seriam atualizados · ${telas} tela(s) seriam ligadas`);
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

  // 4. O QUE SERIA GRAVADO. Vazio = idempotência: já rodou, e é para dizer isso.
  const aGravar = postsParaGravar(ctx.plano.posts, { force: false });
  if (aGravar.length === 0) {
    const jaTem = ctx.plano.posts.filter((p) => p.telasAtuais.length > 0).length;
    const nenhumaCasou = ctx.plano.posts.every((p) => p.telas.length === 0);
    log("✓ NADA A FAZER — nenhum post seria alterado. Nada foi gravado.");
    if (jaTem === ctx.plano.posts.length) {
      log("  Todos os carrosséis JÁ têm telas ligadas (é o estado esperado depois de");
      log(`  uma passada bem-sucedida). Pode remover ${VARIAVEL} do Railway.`);
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
  log(`▶ ESCREVENDO ${aGravar.length} post(s) numa transação única…`);
  await prisma.$transaction(
    aGravar.map((post) =>
      prisma.socialPost.update({
        where: { id: post.id },
        data: {
          mediaUrlsJson: JSON.stringify(post.urls),
          // Capa vazia é preenchida com a tela 1; capa posta à mão fica.
          ...(capaAtual.get(post.id) ? {} : { mediaUrl: post.urls[0] }),
        },
      }),
    ),
  );
  const telasLigadas = aGravar.reduce((s, p) => s + p.urls.length, 0);
  log(`✅ ${aGravar.length} post(s) atualizados · ${telasLigadas} tela(s) ligadas.`);

  // 6. A APROVAÇÃO VOLTA PARA QUEM DECIDIU VENDO MENOS DO QUE EXISTE.
  //    Só os posts alterados AGORA entram — sem isso, todo boot reabriria o
  //    card e o cliente ficaria decidindo a mesma coisa para sempre.
  const cardsReabertos: string[] = [];
  try {
    const r = await reabrirAprovacoesDosPosts({
      clientId: ctx.cliente.id,
      postIds: aGravar.map((p) => p.id),
      motivo: MOTIVO_DA_REABERTURA,
    });
    log("── Aprovação ─────────────────────────────────────────────");
    for (const c of r.reabertos) {
      cardsReabertos.push(c.approvalRequestId);
      log(
        `   ↩ card ${c.approvalRequestId}: estava "${c.statusAnterior}" ` +
          `(decidido por ${c.decididoPor ?? "—"}) → volta a PENDENTE, agora com as telas`,
      );
      log(`     histórico da decisão anterior preservado no card (comentário visível ao cliente)`);
      log(`     ${c.postsDevolvidos} peça(s) devolvida(s) de "approved" para "draft" — o aval foi retirado`);
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

/**
 * Agenda a tarefa para logo depois do boot, uma vez por instância.
 *
 * Não bloqueia o `register()`: o health check do Railway não espera por um
 * conserto de dado. Chamar duas vezes (o HMR do dev faz isso) é inofensivo.
 */
export function agendarBackfillDeBoot(): void {
  if (jaRodou) return;
  if (!(process.env[VARIAVEL] ?? "").trim()) return;
  jaRodou = true;
  log(`agendado — ${VARIAVEL} presente; o ensaio sai em ${ATRASO_MS / 1000}s`);
  const t = setTimeout(() => { void rodarBackfillDeBoot(); }, ATRASO_MS);
  // Não segura o processo vivo: se o servidor está encerrando, ele encerra.
  t.unref?.();
}

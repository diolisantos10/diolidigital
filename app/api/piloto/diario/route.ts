// GET /api/piloto/diario — o diário do piloto, legível de fora.
//
// ORDEM DO CEO, 16/08/2026: *"eu preciso de uma forma onde vocês acompanham o
// que eu estou fazendo e a resposta do sistema em relação a isso. Um log."*
//
// POR QUE ISTO EXISTE, e é uma confissão de limite:
// Os dois Diretores que acompanham o piloto (Control Room e o das fichas)
// enxergam o log do servidor e o código — mas NÃO enxergam o banco. Na noite de
// 15 para 16/08 isso custou horas: o CEO entregou um briefing, ele não andou, e
// o Diretor Geral levantou TRÊS teorias diferentes sobre o motivo sem conseguir
// confirmar nenhuma, porque não tinha como abrir o pedido e olhar. Ele via o
// rastro; não via a história.
//
// Este diário fecha esse buraco. Ele não é painel de gestão nem relatório: é o
// que aconteceu, em ordem de tempo, do jeito que a máquina registrou.
//
// ─── SOMENTE LEITURA, E COM CHAVE ───────────────────────────────────────────
//
// Só GET, e nenhuma escrita — nem de rastro. Exige `PILOTO_SECRET` (a mesma
// chave da rota do piloto assistido) por header `Authorization: Bearer …` ou
// `?chave=`. Sem chave configurada no servidor, a rota responde 503 e não
// devolve nada: ausência de chave nunca vira porta aberta.
//
// ─── O QUE ELE NÃO DEVOLVE ──────────────────────────────────────────────────
//
// Nada de segredo, token, chave de integração ou senha. O corpo das mensagens
// aparece porque é justamente o que se precisa auditar — é o que o agente disse
// ao cliente —, mas cortado, e a rota é da CASA, protegida por chave que só o
// CEO distribui.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { segredoConfere } from "@/lib/security/crypto";
import {
  PREFIXO_TURNO_BARRADO,
  FRASE_ESCOPO_SALVO,
  FRASE_ESCOPO_PERDIDO,
} from "@/lib/agency/comercial/registro-da-conversa";

export const dynamic = "force-dynamic";

/** Quantos eventos de cada tipo. Diário é para ler, não para exportar. */
const LIMITE_PADRAO = 40;

function autorizado(request: NextRequest): boolean {
  const esperado = process.env.PILOTO_SECRET || process.env.CRON_SECRET;
  if (!esperado) return false;
  const header = request.headers.get("authorization") ?? "";
  const doHeader = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : null;
  const daQuery = request.nextUrl.searchParams.get("chave");
  return segredoConfere(doHeader ?? daQuery, esperado);
}

const corta = (v: string | null | undefined, n: number) =>
  !v ? null : v.length > n ? `${v.slice(0, n)}…` : v;

type Evento = {
  em: string;
  tipo: string;
  quem: string | null;
  o_que: string | null;
  estado?: string | null;
  id?: string;
};

export async function GET(request: NextRequest): Promise<NextResponse> {
  const esperado = process.env.PILOTO_SECRET || process.env.CRON_SECRET;
  if (!esperado) {
    return NextResponse.json(
      { error: "PILOTO_SECRET não configurado — o diário fica fechado" },
      { status: 503 },
    );
  }
  if (!autorizado(request)) {
    return NextResponse.json({ error: "chave inválida" }, { status: 401 });
  }

  const limite = Math.min(
    Number(request.nextUrl.searchParams.get("limite") ?? LIMITE_PADRAO) || LIMITE_PADRAO,
    200,
  );

  // Cada leitura é independente e nenhuma derruba as outras: um diário que
  // some inteiro porque uma tabela falhou seria pior que um diário com um
  // capítulo faltando — e o capítulo faltando aparece em `cegueiras`.
  const cegueiras: string[] = [];
  const seguro = async <T>(nome: string, p: Promise<T>, vazio: T): Promise<T> => {
    try {
      return await p;
    } catch (err) {
      cegueiras.push(`${nome}: ${err instanceof Error ? err.message : String(err)}`);
      return vazio;
    }
  };

  const [pedidos, mensagens, conteudos, clientes, execucoes, execucoesV2, recusasV2] = await Promise.all([
    seguro("solicitacoes", prisma.clientRequestDb.findMany({
      orderBy: { createdAt: "desc" }, take: limite,
      select: { id: true, businessName: true, status: true, source: true, createdAt: true, updatedAt: true, attachmentsJson: true, briefingJson: true },
    }), []),
    seguro("conversas", prisma.portalMessage.findMany({
      orderBy: { createdAt: "desc" }, take: limite,
      select: { id: true, authorRole: true, authorName: true, body: true, clientId: true, clientRequestId: true, createdAt: true },
    }), []),
    seguro("pedidos_de_conteudo", prisma.contentRequest.findMany({
      orderBy: { createdAt: "desc" }, take: limite,
      select: { id: true, title: true, status: true, declineReason: true, clientId: true, createdAt: true },
    }), []),
    seguro("clientes", prisma.client.findMany({
      orderBy: { createdAt: "desc" }, take: limite,
      select: { id: true, name: true, industry: true, email: true, phone: true, createdAt: true },
    }), []),
    seguro("chamadas_de_ia", prisma.aIRunLog.findMany({
      orderBy: { createdAt: "desc" }, take: limite,
      select: { id: true, departmentId: true, status: true, fallbackUsed: true, fallbackReason: true, outputSummary: true, createdAt: true },
    }), []),
    // ─── A CADEIA DA LINHA (V2) E SUAS RECUSAS ────────────────────────────
    //
    // Acrescentado em 16/08/2026, junto com as mãos do 12º departamento. Sem
    // isto, uma cadeia que rodasse sem provedor de IA configurado não escreveria
    // uma linha em `AIRunLog` e ficaria INVISÍVEL aqui — a agência passaria a
    // trabalhar sozinha num lugar que o CEO não enxerga, que é exatamente o
    // problema que este diário existe para não ter.
    //
    // A recusa entra junto com a execução, e de propósito: "o agente rodou" e
    // "o agente se recusou a rodar, por este motivo" são a mesma história. Só a
    // primeira metade seria um diário que só conta o que deu certo.
    seguro("execucoes_da_linha", prisma.execucaoV2.findMany({
      orderBy: { inicio: "desc" }, take: limite,
      select: { id: true, funcaoId: true, departamentoId: true, ator: true, modelo: true, custoUsd: true, correlationId: true, inicio: true, fim: true },
    }), []),
    seguro("recusas_da_linha", prisma.recusaV2.findMany({
      orderBy: { em: "desc" }, take: limite,
      select: { id: true, funcaoId: true, motivo: true, correlationId: true, em: true },
    }), []),
  ]);

  // ─── OS TOTAIS DE VERDADE, SEPARADOS DA AMOSTRA ────────────────────────────
  //
  // Achado em 16/08/2026, medido com banco real: as sete linhas de `quantos`
  // abaixo eram `pedidos.length` etc — o TAMANHO DA PÁGINA (`take: limite`,
  // padrão 40), não quantas linhas existem. Com 55 mensagens plantadas o
  // diário dizia "40". O CEO lê um número e acredita nele; um `.length` de
  // consulta paginada é uma mentira silenciosa, não um bug visível.
  //
  // `count()` é leitura, não escrita — não fura o "somente leitura" desta
  // rota. Cada total passa pelo MESMO `seguro(...)` do resto do arquivo: se a
  // contagem falhar, o total vira `null` (não `0`) e o motivo entra em
  // `cegueiras` — `0` é um fato ("não há nenhum"), `null` é outro ("não
  // consegui contar"), e confundir os dois é a mesma doença que motivou este
  // conserto inteiro.
  const [
    solicitacoesTotal,
    mensagensTotal,
    conteudosTotal,
    clientesTotal,
    chamadasTotal,
    execucoesV2Total,
    recusasV2Total,
  ] = await Promise.all([
    seguro<number | null>("solicitacoes_total", prisma.clientRequestDb.count(), null),
    seguro<number | null>("mensagens_total", prisma.portalMessage.count(), null),
    seguro<number | null>("pedidos_de_conteudo_total", prisma.contentRequest.count(), null),
    seguro<number | null>("clientes_total", prisma.client.count(), null),
    seguro<number | null>("chamadas_de_ia_total", prisma.aIRunLog.count(), null),
    seguro<number | null>("execucoes_da_linha_total", prisma.execucaoV2.count(), null),
    seguro<number | null>("recusas_da_linha_total", prisma.recusaV2.count(), null),
  ]);

  // ─── O RESGATE DO ESCOPO — o conserto que abriu o dia de 16/08, medido ────
  //
  // A pergunta que o Diretor quer respondida sem intérprete: quantas vezes o
  // resgate do escopo (salvar o que o cliente já tinha dito quando a fala do
  // SDR foi barrada por um guarda) FUNCIONOU e quantas NÃO. Antes de hoje essa
  // resposta não existia — nem como número, nem como frase — porque `false` e
  // `undefined` gravavam o MESMO texto (ver `registro-da-conversa.ts`).
  //
  // As três frases usadas nos filtros abaixo são IMPORTADAS de
  // `lib/agency/comercial/registro-da-conversa.ts`, nunca copiadas à mão: um
  // texto redigitado aqui divergiria do texto gravado no banco no dia em que
  // alguém alterasse um dos dois lados e esquecesse o outro, e a contagem
  // silenciosamente passaria a contar zero.
  const [resgateFuncionou, resgateNaoFuncionou, resgateNaoSei] = await Promise.all([
    seguro<number | null>(
      "resgate_do_escopo.funcionou",
      prisma.portalMessage.count({ where: { body: { contains: FRASE_ESCOPO_SALVO } } }),
      null,
    ),
    seguro<number | null>(
      "resgate_do_escopo.nao_funcionou",
      prisma.portalMessage.count({ where: { body: { contains: FRASE_ESCOPO_PERDIDO } } }),
      null,
    ),
    // "não sei" é TODO turno barrado que não afirma nenhum dos dois lados —
    // registro gravado ANTES de a frase existir, ou turno em que o guarda não
    // tinha escopo à mão para tentar salvar. Enquanto houver registros de
    // ANTES deste conserto no banco, este número será grande, e isso é
    // ESPERADO, não defeito: é o passado que nunca foi afirmado. Ele encolhe
    // sozinho conforme conversas NOVAS acontecem, todas já no formato de três
    // estados.
    seguro<number | null>(
      "resgate_do_escopo.nao_sei",
      prisma.portalMessage.count({
        where: {
          AND: [
            { body: { contains: PREFIXO_TURNO_BARRADO } },
            { NOT: { body: { contains: FRASE_ESCOPO_SALVO } } },
            { NOT: { body: { contains: FRASE_ESCOPO_PERDIDO } } },
          ],
        },
      }),
      null,
    ),
  ]);

  // A LINHA DO TEMPO é o ponto do diário: o CEO faz uma coisa e quer ver a
  // resposta da máquina ao lado, na ordem em que aconteceu — não em cinco
  // tabelas que ele teria de cruzar de cabeça.
  const linhaDoTempo: Evento[] = [
    ...pedidos.map((p) => ({
      em: p.createdAt.toISOString(),
      tipo: "briefing recebido",
      quem: p.businessName,
      o_que: `origem ${p.source}${JSON.parse(p.attachmentsJson || "[]")?.length ? ` · com anexo` : ""}${p.briefingJson?.includes('"estimate"') ? " · com orçamento calculado" : " · SEM orçamento calculado"}`,
      estado: p.status,
      id: p.id,
    })),
    ...clientes.map((c) => ({
      em: c.createdAt.toISOString(),
      tipo: "cliente criado",
      quem: c.name,
      o_que: [c.industry, c.email, c.phone].filter(Boolean).join(" · ") || "sem dados de contato",
      id: c.id,
    })),
    ...mensagens.map((m) => ({
      em: m.createdAt.toISOString(),
      tipo: m.authorRole === "client" ? "CLIENTE escreveu" : "AGÊNCIA escreveu",
      quem: m.authorName || m.authorRole,
      o_que: corta(m.body, 600),
      id: m.id,
    })),
    ...conteudos.map((c) => ({
      em: c.createdAt.toISOString(),
      tipo: "pedido de conteúdo",
      quem: c.title,
      o_que: corta(c.declineReason, 400),
      estado: c.status,
      id: c.id,
    })),
    ...execucoes.map((a) => ({
      em: a.createdAt.toISOString(),
      tipo: "agente rodou",
      quem: a.departmentId,
      o_que: corta(a.fallbackUsed ? `caiu para o plano B: ${a.fallbackReason ?? "motivo não registrado"}` : a.outputSummary, 400),
      estado: a.status,
      id: a.id,
    })),
    ...execucoesV2.map((e) => ({
      em: e.inicio.toISOString(),
      tipo: "função da linha executou",
      quem: `${e.departamentoId}/${e.funcaoId}`,
      o_que: [
        e.fim ? `terminou em ${Math.round((e.fim.getTime() - e.inicio.getTime()) / 1000)}s` : "não registrou fim",
        `custo US$ ${(e.custoUsd ?? 0).toFixed(4)}`,
        `por ${e.ator}${e.modelo ? ` (${e.modelo})` : ""}`,
        e.correlationId,
      ].join(" · "),
      id: e.id,
    })),
    ...recusasV2.map((r) => ({
      em: r.em.toISOString(),
      tipo: "função da linha RECUSOU",
      quem: r.funcaoId,
      o_que: corta(r.motivo, 400),
      estado: r.correlationId,
      id: r.id,
    })),
  ].sort((a, b) => (a.em < b.em ? 1 : -1)).slice(0, limite * 2);

  return NextResponse.json({
    agora: new Date().toISOString(),
    // Contagem antes da lista: é o número que responde "existe ou não existe",
    // que foi a pergunta que ninguem conseguia responder na noite de 15/08.
    //
    // `total` é a verdade da tabela inteira (`count()`); `mostrando` é só o
    // tamanho da amostra que veio na `linha_do_tempo` (`take: limite`, corte
    // de página). Os dois nunca podem ser lidos como o mesmo número — foi
    // exatamente essa confusão que fez o diário mentir "40" com 55 mensagens
    // no banco.
    quantos: {
      solicitacoes: { total: solicitacoesTotal, mostrando: pedidos.length },
      clientes: { total: clientesTotal, mostrando: clientes.length },
      mensagens: { total: mensagensTotal, mostrando: mensagens.length },
      pedidos_de_conteudo: { total: conteudosTotal, mostrando: conteudos.length },
      chamadas_de_ia: { total: chamadasTotal, mostrando: execucoes.length },
      execucoes_da_linha: { total: execucoesV2Total, mostrando: execucoesV2.length },
      recusas_da_linha: { total: recusasV2Total, mostrando: recusasV2.length },
    },
    // O conserto de 16/08 (resgatar o escopo quando um guarda barra a fala do
    // SDR) medido em produção, não em teoria — ver o comentário acima de onde
    // estes três números são contados.
    resgate_do_escopo: {
      funcionou: resgateFuncionou,
      nao_funcionou: resgateNaoFuncionou,
      nao_sei: resgateNaoSei,
      nota:
        "nao_sei é registro de ANTES do conserto de 16/08 ou turno sem escopo " +
        "à mão — não é escopo perdido. Não some com nao_funcionou.",
    },
    // Cegueira declarada em vez de silêncio: tabela que não pôde ser lida
    // aparece aqui com o motivo. Ausência de informação não é informação.
    cegueiras,
    linha_do_tempo: linhaDoTempo,
  });
}

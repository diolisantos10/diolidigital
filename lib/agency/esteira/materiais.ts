// materiais.ts — "o material chegou" volta a ser um evento que MOVE a esteira.
//
// O buraco que isto fecha: um agente travava por falta de logo, o gerente de
// projeto cobrava o cliente, o cliente mandava... e nada acontecia. O pedido
// virava "recebido" numa tabela e a produção continuava parada — para sempre.
// O projeto ficava vivo no papel e morto na prática, e ninguém era avisado,
// porque do lado de dentro parecia que a bola estava com o cliente.
//
// A regra: material recebido **re-enfileira** a produção. Não produz aqui, na
// requisição HTTP — marca `pending` no banco e deixa o motor rodar. Se o
// processo cair no meio, o despertador encontra o projeto e retoma. Produção
// que depende de uma aba de navegador aberta é a falha que esta casa já teve.
//
// ── 05/08/2026: o upload do cliente não chegava aqui ─────────────────────────
// `materialRecebido` era alcançável por UM caminho só: `PATCH
// /api/material-requests/[id]`, com sessão de AGÊNCIA. Ou seja, alguém da equipe
// tinha que abrir uma tela e marcar na mão. O caminho do cliente — que é o único
// que existe de verdade — ia para `POST /api/media`, criava um `MediaAsset` e
// parava ali: não tocava `MaterialRequest`, não retomava produção, não avisava
// ninguém. E a tela dele dizia "A equipe já foi avisada".
//
// Cenário completo: produção travada por falta de logo, o portal escrevendo
// "sem este material a produção fica parada", o cliente mandando o logo, a tela
// confirmando que avisamos — e o projeto parado, com o cliente achando que a
// bola era nossa.
//
// O que fecha o circuito: `materialEnviadoPeloCliente`, abaixo. E ela NÃO
// adivinha: só marca um pedido como atendido quando a evidência decide qual é
// (`casarMaterial`). Quando não decide, o arquivo fica guardado no projeto e o
// caso vira registro para gente — nunca um "recebido" que a casa não pode
// sustentar. Afirmar "as fotos do salão chegaram" porque um arquivo qualquer
// subiu é a produção no escuro que o portão de recursos existe para impedir.

import { prisma } from "@/lib/db/client";
import { moverTarefasDoAgente } from "@/lib/agency/esteira/tarefas";

export interface MaterialRecebido {
  ok: boolean;
  /** Ainda falta material? Então a produção continua esperando de propósito. */
  aindaFaltam: number;
  /** A produção foi re-enfileirada nesta chamada? */
  producaoRetomada: boolean;
  erro?: string;
}

/**
 * Marca um pedido de material como atendido e, se não faltar mais nada,
 * devolve a produção para a fila.
 *
 * Idempotente: marcar duas vezes não re-enfileira duas vezes nem duplica nada
 * — o motor pula quem já entregou.
 */
export async function materialRecebido(materialRequestId: string): Promise<MaterialRecebido> {
  const pedido = await prisma.materialRequest.findUnique({
    where: { id: materialRequestId },
    select: { id: true, projectId: true, status: true, requestedByAgentId: true },
  });
  if (!pedido) return { ok: false, aindaFaltam: 0, producaoRetomada: false, erro: "Pedido não encontrado" };

  if (pedido.status !== "received") {
    await prisma.materialRequest.update({
      where: { id: materialRequestId },
      data: { status: "received", resolvedAt: new Date() },
    });
  }

  return destravarPorMaterial({
    projectId: pedido.projectId,
    requestedByAgentId: pedido.requestedByAgentId,
  });
}

/**
 * O DESTRAVE, separado de QUEM fechou o pedido.
 *
 * ── O defeito que esta extração conserta (26/08/2026, medido em produção) ───
 *
 * Fechar o pedido e DESTRAVAR a produção são duas coisas, e a casa tinha duas
 * portas de fechamento com só uma delas destravando:
 *
 *   • `PATCH /api/material-requests/[id]` → status `received`, chama
 *     `materialRecebido`, destrava. É a porta da EQUIPE.
 *   • `POST /api/portal/materiais`        → status `resolved`, e parava aí.
 *     É a porta do CLIENTE — a única que ele tem para dizer "mandei",
 *     "não tenho" ou "já está no Drive".
 *
 * Pela porta do cliente, a tarefa do agente travado continuava marcada como
 * bloqueada para sempre e o projeto nunca voltava para a fila. E a rota
 * respondia, com todas as letras: *"Anotado. A produção volta a andar com
 * isso"* — uma promessa que o código não cumpria. Promessa escrita ao cliente
 * que o código não cumpre é a pior classe de defeito desta casa: não quebra
 * nada, não acusa em lugar nenhum, e o cliente espera.
 *
 * Medido em produção em 26/08/2026: 30 pedidos de material no workspace,
 * 30 `pending`, ZERO fechados em toda a história — e a resposta do cliente
 * era, até aqui, um caminho sem volta.
 *
 * `pending` é o único status que conta como "falta". `received` (a equipe viu
 * chegar) e `resolved` (o cliente respondeu) são fechamentos diferentes de
 * propósito — quem lê o banco precisa saber se foi arquivo ou frase —, mas
 * destravam igual. Por isso a contagem daqui pergunta por `pending` e não por
 * uma lista de fechados: status novo nasce fechado, e não travando a casa.
 */
export async function destravarPorMaterial(pedido: {
  projectId: string;
  requestedByAgentId?: string | null;
}): Promise<MaterialRecebido> {
  // O agente que estava travado volta para a fila — a tarefa dele deixa de
  // mentir que está bloqueada.
  if (pedido.requestedByAgentId) {
    await moverTarefasDoAgente(pedido.projectId, pedido.requestedByAgentId, "pending")
      .catch(() => { /* best-effort: o destrave não pode falhar por causa do quadro */ });
  }

  // Falta mais alguma coisa? Então continua esperando — retomar agora produziria
  // metade e cobraria o cliente de novo pelo resto.
  const aindaFaltam = await prisma.materialRequest.count({
    where: { projectId: pedido.projectId, status: "pending" },
  });
  if (aindaFaltam > 0) return { ok: true, aindaFaltam, producaoRetomada: false };

  // Chegou tudo. De volta para a fila — o motor (ou o despertador) segue daqui.
  const projeto = await prisma.project.findUnique({
    where: { id: pedido.projectId },
    select: { directionApprovedAt: true, executionStatus: true },
  });
  // Sem o aval da direção não se produz nada, nem com todo o material do mundo.
  if (!projeto?.directionApprovedAt) return { ok: true, aindaFaltam: 0, producaoRetomada: false };
  // Já está rodando? Deixa rodar.
  if (projeto.executionStatus === "running") return { ok: true, aindaFaltam: 0, producaoRetomada: false };

  await prisma.project.update({
    where: { id: pedido.projectId },
    data: {
      executionStatus: "pending",
      executionRequestedAt: new Date(),
      executionError: null,
      // Zera o contador: as tentativas anteriores falharam por falta de
      // material, não por defeito. Sem isto, um projeto que esperou material
      // chegaria ao teto de tentativas e nunca mais seria retomado.
      executionAttempts: 0,
    },
  });

  return { ok: true, aindaFaltam: 0, producaoRetomada: true };
}

// ═══════════════════════════════════════════════════════════════════════════
// O CLIENTE MANDOU UM ARQUIVO — de `POST /api/media` até a produção voltar
// ═══════════════════════════════════════════════════════════════════════════

/** Um pedido em aberto, como o casador precisa vê-lo. */
export interface PedidoEmAberto {
  id: string;
  type: string;
  description: string;
}

/** O arquivo que chegou, pelo que dá para saber dele sem abrir. */
export interface ArquivoDoCliente {
  fileName: string;
  mimeType: string;
}

/** Como o casamento foi decidido. Fica no registro para que gente possa
 *  discordar — critério escondido é palpite com cara de dado. */
export type CriterioDoCasamento = "nome" | "midia" | "unico";

export interface CasamentoDeMaterial {
  /** O pedido que este arquivo atende. `null` = a evidência não decide. */
  pedidoId: string | null;
  criterio: CriterioDoCasamento | null;
  /** Por que não decidiu — é o que vai na escalação para gente. */
  motivo?: string;
}

const CLASSES: Array<{ classe: string; mimes: RegExp; palavras: string[] }> = [
  {
    classe: "imagem",
    mimes: /^image\//,
    palavras: ["foto", "fotos", "imagem", "imagens", "logo", "logotipo", "arte", "artes", "banner", "print", "identidade", "paleta"],
  },
  {
    classe: "video",
    mimes: /^video\//,
    palavras: ["video", "videos", "reel", "reels", "filmagem", "gravacao", "gravacoes", "bruto", "brutos"],
  },
  {
    classe: "documento",
    mimes: /^(application\/(pdf|msword|vnd\.|rtf)|text\/)/,
    palavras: ["documento", "documentos", "pdf", "contrato", "planilha", "tabela", "cardapio", "catalogo", "lista", "texto", "briefing"],
  },
];

/** Sem acento e em minúsculas — "cardápio" e "cardapio" são a mesma palavra. */
function normalizar(s: string): string {
  return (s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/** A classe do ARQUIVO pelo mime. `null` = mime que não conta história. */
function classeDoArquivo(mimeType: string): string | null {
  return CLASSES.find((c) => c.mimes.test(mimeType || ""))?.classe ?? null;
}

/** A classe do PEDIDO pelas palavras dele. Ambíguo ("fotos e vídeos do salão")
 *  devolve `null` de propósito: um pedido que quer duas coisas não decide nada. */
function classeDoPedido(pedido: PedidoEmAberto): string | null {
  const texto = normalizar(`${pedido.type} ${pedido.description}`);
  const achadas = CLASSES.filter((c) => c.palavras.some((p) => new RegExp(`\\b${p}\\b`).test(texto)));
  return achadas.length === 1 ? achadas[0]!.classe : null;
}

/** As palavras do nome do arquivo que podem significar alguma coisa. Curtas
 *  ficam de fora: "de", "do", "img" casariam com qualquer pedido. */
function palavrasDoNome(fileName: string): string[] {
  return normalizar(fileName)
    .replace(/\.[a-z0-9]+$/, "")
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 4 && !/^\d+$/.test(t));
}

/**
 * QUAL pedido este arquivo atende?
 *
 * Determinística e pura de propósito: é a linha que decide se a casa afirma ao
 * agente "o material chegou" — e afirmar isso errado é produzir no escuro, que
 * é exatamente o que o portão de recursos existe para impedir.
 *
 * A ordem é a da força da evidência:
 *   1. NOME — o cliente escreveu "logo-foocci.png" e existe um pedido de logo.
 *      É a única em que ele próprio disse o que está mandando.
 *   2. MÍDIA — só um dos pedidos em aberto é de vídeo, e chegou um vídeo.
 *   3. ÚNICO — só falta uma coisa. Chegou um arquivo: é ela. Mas NÃO vale
 *      quando a mídia CONTRADIZ (pedido de vídeo, arquivo PDF): aí a evidência
 *      não confirma, ela nega.
 *
 * Empate em qualquer degrau não escolhe nenhum. Errar para menos aqui custa uma
 * escalação; errar para mais custa uma entrega produzida sobre material que
 * nunca chegou.
 */
export function casarMaterial(
  pendentes: PedidoEmAberto[],
  arquivo: ArquivoDoCliente,
): CasamentoDeMaterial {
  if (pendentes.length === 0) {
    return { pedidoId: null, criterio: null, motivo: "nenhum material pendente neste projeto" };
  }

  // 1. O nome do arquivo.
  const tokens = palavrasDoNome(arquivo.fileName);
  if (tokens.length > 0) {
    const porNome = pendentes.filter((p) => {
      const texto = normalizar(`${p.type} ${p.description}`);
      return tokens.some((t) => texto.includes(t));
    });
    if (porNome.length === 1) return { pedidoId: porNome[0]!.id, criterio: "nome" };
  }

  // 2. A classe de mídia.
  const classe = classeDoArquivo(arquivo.mimeType);
  if (classe) {
    const porMidia = pendentes.filter((p) => classeDoPedido(p) === classe);
    if (porMidia.length === 1) return { pedidoId: porMidia[0]!.id, criterio: "midia" };
  }

  // 3. Só falta uma coisa — desde que a mídia não negue.
  if (pendentes.length === 1) {
    const unico = pendentes[0]!;
    const esperada = classeDoPedido(unico);
    if (classe && esperada && classe !== esperada) {
      return {
        pedidoId: null,
        criterio: null,
        motivo:
          `o único material pendente é "${unico.description}" (${esperada}) e chegou um arquivo ` +
          `de ${classe} — a evidência CONTRADIZ; alguém precisa conferir antes de destravar`,
      };
    }
    return { pedidoId: unico.id, criterio: "unico" };
  }

  return {
    pedidoId: null,
    criterio: null,
    motivo:
      `${pendentes.length} materiais em aberto e nada no arquivo diz qual deles é ` +
      `(${pendentes.map((p) => p.description).join(" · ")})`,
  };
}

export interface EnvioDeMaterialFeito {
  projectId: string | null;
  /** O pedido que este arquivo atendeu, quando a evidência decidiu. */
  materialRequestId: string | null;
  criterio: CriterioDoCasamento | null;
  aindaFaltam: number;
  producaoRetomada: boolean;
  /** A equipe foi avisada? É a frase que a tela do cliente promete. */
  equipeAvisada: boolean;
  motivo?: string;
}

/**
 * O arquivo do cliente entrou → o pedido de material fecha e a produção volta.
 *
 * Chamada best-effort pela rota de mídia DEPOIS de o arquivo estar guardado:
 * nada aqui pode fazer um upload bem-sucedido responder erro ao cliente — o
 * arquivo dele já está salvo, e mandá-lo enviar de novo seria mentira.
 *
 * O dono vem SEMPRE derivado do token pela rota. Nenhuma chave nula entra em
 * filtro: `{ clientId: null }` casaria com projeto órfão de qualquer um.
 */
export async function materialEnviadoPeloCliente(entrada: {
  workspaceId: string;
  clientId?: string | null;
  clientRequestId?: string | null;
  arquivo: ArquivoDoCliente;
  /** O `MediaAsset` recém-criado — para o registro dizer onde o arquivo está. */
  assetId?: string | null;
}): Promise<EnvioDeMaterialFeito> {
  const saida: EnvioDeMaterialFeito = {
    projectId: null, materialRequestId: null, criterio: null,
    aindaFaltam: 0, producaoRetomada: false, equipeAvisada: false,
  };

  const chaves = [
    ...(entrada.clientRequestId ? [{ clientRequestId: entrada.clientRequestId }] : []),
    ...(entrada.clientId ? [{ clientId: entrada.clientId }] : []),
  ];
  if (chaves.length === 0) return { ...saida, motivo: "envio sem dono derivável" };

  const pendentes = await prisma.materialRequest.findMany({
    where: { status: "pending", project: { OR: chaves } },
    select: { id: true, projectId: true, type: true, description: true },
    orderBy: { requestedAt: "asc" },
  }).catch(() => [] as Array<{ id: string; projectId: string; type: string; description: string }>);

  saida.aindaFaltam = pendentes.length;

  // Um projeto de cada vez: o cliente responde ao que UM projeto pediu. Com
  // pendências em projetos diferentes, ficamos com o mais antigo e o resto
  // continua pendente — que é a verdade, e o portal segue pedindo.
  const projectId = pendentes[0]?.projectId ?? null;
  saida.projectId = projectId;
  const doProjeto = pendentes.filter((p) => p.projectId === projectId);

  const casamento = casarMaterial(doProjeto, entrada.arquivo);
  saida.criterio = casamento.criterio;
  saida.motivo = casamento.motivo;

  if (casamento.pedidoId) {
    const r = await materialRecebido(casamento.pedidoId).catch(() => null);
    if (r?.ok) {
      saida.materialRequestId = casamento.pedidoId;
      saida.aindaFaltam = r.aindaFaltam;
      saida.producaoRetomada = r.producaoRetomada;
    } else {
      saida.motivo = "não consegui marcar o pedido como atendido";
    }
  }

  // ── ALGUÉM SEMPRE SABE ────────────────────────────────────────────────────
  // Este registro é o que torna verdadeira a frase que a tela do cliente já
  // mostrava. Ele sai nos três desfechos, com o texto de cada um: destravou,
  // não decidiu qual pedido era, ou não havia pedido nenhum em aberto.
  const atendido = doProjeto.find((p) => p.id === saida.materialRequestId);
  const mensagem = saida.materialRequestId
    ? `Material do cliente recebido: "${entrada.arquivo.fileName}" atende "${atendido?.description ?? "pedido"}" ` +
      `(critério: ${saida.criterio}). ${saida.aindaFaltam > 0
        ? `Ainda faltam ${saida.aindaFaltam} material(is) — a produção segue esperando.`
        : saida.producaoRetomada
          ? "Era o último: a produção foi retomada."
          : "Não falta mais nada, mas a produção não foi re-enfileirada (direção não aprovada ou já rodando)."}`
    : doProjeto.length > 0
      ? `Material do cliente recebido e NÃO destravou nada: "${entrada.arquivo.fileName}". ${saida.motivo ?? ""} ` +
        `Confira e marque o pedido certo — a produção continua parada até alguém decidir.`
      : `Material do cliente recebido: "${entrada.arquivo.fileName}". Nenhum pedido de material estava em aberto.`;

  await prisma.activityEvent.create({
    data: {
      workspaceId: entrada.workspaceId,
      ...(projectId ? { projectId } : {}),
      ...(entrada.clientId ? { clientId: entrada.clientId } : {}),
      type: saida.materialRequestId ? "material_recebido" : "material_sem_destino",
      message: mensagem.slice(0, 900),
    },
  }).then(() => { saida.equipeAvisada = true; })
    .catch(() => { /* best-effort: o arquivo já está salvo */ });

  return saida;
}

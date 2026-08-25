// pacote-travado.ts — o que a agência faz quando ELA MESMA reprova o próprio trabalho.
//
// Descoberto rodando o primeiro projeto de verdade em produção (01/08/2026): a
// Qualidade barrou 2 de 6 entregas, o pacote NÃO foi apresentado — o freio
// funcionou — e aí o projeto **ficou parado para sempre**. O motor é idempotente:
// re-rodar pula quem já produziu, então a entrega reprovada nunca era refeita.
// Nenhuma tela mostrava o bloqueio. Vivo no papel, morto na prática.
//
// Decisão do CEO em 01/08/2026: **refaz sozinha até 2 tentativas, depois chama.**
// É a definição de automático que serve — resolve o caso comum sem gente e só
// escala o caso raro. As outras duas saídas foram recusadas com motivo:
// chamar direto põe o CEO no caminho de todo projeto (com 5 clientes, é ele
// olhando pacote todo dia); apresentar com ressalva anula o único freio da casa.
//
// ── 04/08/2026: a peça refeita É REAUDITADA AQUI ────────────────────────────
// A 5ª auditoria adversarial mostrou que este arquivo era a porta dos fundos do
// árbitro: refazia e gravava `quality_ok` à mão, apostando numa "próxima
// auditoria" que não existe neste caminho. Agora o veredito volta a ser de um
// juiz, e sem juiz a peça continua barrada. Ver o bloco no meio do laço.

import { prisma } from "@/lib/db/client";
import { renderizarEntrega, ESQUEMA_DA_ENTREGA } from "@/lib/agency/esteira/renderizar-entrega";
import { generate } from "@/lib/ai/generate";
import { TODOS_OS_ESPECIALISTAS, conferirContrato } from "@/lib/agency/execution/especialistas";
import {
  conferirPisoDeVerdade, resumirViolacoes, type VerdadeDoCliente,
} from "@/lib/agency/execution/piso-de-verdade";
import { lerProibicoes } from "@/lib/agency/esteira/proibicoes";
import { buildVerdadeOperacional } from "@/lib/dioli-brain/client-snapshot";
import { preservarVersaoAtual, registrarNovaVersao } from "@/lib/agency/esteira/versoes";
import {
  auditDeliverable, revisionStatusDoVeredito, arbitragemDoVeredito,
  foiAprovadaPelaQualidade, foiReprovadaPelaQualidade,
} from "@/lib/agency/execution/quality-auditor";

/** Quantas vezes o especialista refaz antes de o pacote virar problema do CEO.
 *  Duas: se o modelo errou duas vezes COM a crítica na mão, a terceira
 *  dificilmente resolve — passa a ser dinheiro de IA queimado. */
export const MAX_TENTATIVAS_DE_REFAZER = 2;

export interface ResultadoDoDestravamento {
  projectId: string;
  /** Entregas refeitas que passaram por um ÁRBITRO nesta rodada e foram aprovadas.
   *  Só entra aqui quem foi olhado de novo — não quem foi só reescrito. */
  corrigidas: string[];
  /** Entregas que continuam reprovadas depois do teto de tentativas. */
  persistentes: string[];
  /** Refeitas e REPROVADAS de novo pelo árbitro. Seguem barradas; a próxima
   *  passada tenta outra vez até o teto. */
  reprovadasDeNovo: string[];
  /** Refeitas, mas a auditoria não pôde olhar (IA fora do ar, timeout). Seguem
   *  BARRADAS — ver a regra da reprovação que não se apaga, mais abaixo. */
  semArbitro: string[];
  /** O pacote virou problema do CEO nesta rodada? */
  escalado: boolean;
}

/**
 * Tenta destravar UM pacote barrado pela Qualidade.
 *
 * Refaz cada entrega reprovada com o parecer da Qualidade em mãos. Se todas
 * passarem, quem apresenta é o fluxo normal — este módulo não apresenta nada,
 * só devolve as peças ao estado "boa". Se alguma resistir ao teto de tentativas,
 * o pacote é escalado: vira evento no banco, para aparecer no painel.
 */
export async function destravarPacote(projectId: string): Promise<ResultadoDoDestravamento> {
  const saida: ResultadoDoDestravamento = {
    projectId, corrigidas: [], persistentes: [], reprovadasDeNovo: [], semArbitro: [], escalado: false,
  };

  const projeto = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, workspaceId: true, clientId: true, clientRequestId: true, presentedAt: true },
  });
  if (!projeto || projeto.presentedAt) return saida; // já apresentado: nada a destravar

  const reprovadas = await prisma.deliverable.findMany({
    where: { projectId, revisionStatus: "quality_flag" },
    // `type` entra porque a reauditoria precisa saber se a régua determinística
    // de texto se aplica a esta peça (`regua-do-texto.ts`). Sem ele, o caminho
    // de CONSERTO julgaria por uma régua diferente da que reprovou a peça — e
    // duas réguas para a mesma peça é exatamente como a porta dos fundos que
    // este arquivo fechou em 04/08 voltaria a existir.
    select: { id: true, name: true, content: true, type: true, ownerAgentId: true, lastFeedback: true, version: true },
  });
  if (reprovadas.length === 0) return saida;

  const req = projeto.clientRequestId
    ? await prisma.clientRequestDb.findUnique({
        where: { id: projeto.clientRequestId },
        select: { businessName: true, segment: true, services: true, objectives: true },
      })
    : null;
  const negocio = req?.businessName ?? "o cliente";

  // ── O PISO DE VERDADE, QUE NÃO EXISTIA NESTE CAMINHO ──────────────────────
  //
  // Este arquivo refaz EXATAMENTE as peças que a Qualidade reprovou — e era o
  // único dos quatro motores que não conferia dado inventado. O caminho de
  // CONSERTO era o menos guardado da casa: o modelo recebia "a Qualidade
  // reprovou, refaça" e podia trocar um problema de tom por um preço, um prazo
  // ou um telefone que a agência não sustenta, e isso ia direto para o
  // `Deliverable` — porque o veredito do árbitro, logo abaixo, julga tom e
  // aderência, não dado.
  //
  // O piso roda em código, sem IA e sem rede: por isso ele nunca fica
  // "indisponível" e pode ser exigido aqui sem risco de travar a operação.
  const cliente = projeto.clientId
    ? await prisma.client.findUnique({
        where: { id: projeto.clientId },
        select: { phone: true, email: true },
      }).catch(() => null)
    : null;
  const verdade: VerdadeDoCliente = {
    businessName: negocio,
    telefones: [cliente?.phone].filter((v): v is string => !!v),
    emails: [cliente?.email].filter((v): v is string => !!v),
    servicos: lerLista(req?.services),
    valores: [],
    // Sem a solicitação não há verdade operacional para conferir, e aí o piso
    // volta a ser fail-closed para essas classes — que é o comportamento certo
    // quando a verdade não existe. Mesmo desenho de `refacao.ts`.
    operacao: projeto.clientRequestId
      ? (await buildVerdadeOperacional(projeto.clientRequestId).catch(() => null)) ?? undefined
      : undefined,
    // A metade NEGATIVA, e ela pesa aqui: a peça está sendo reescrita, e
    // reescrever violando o que o cliente já proibiu é o pior desfecho deste
    // caminho. Leitura fail-closed — não conseguir ler REPROVA.
    proibicoes: await lerProibicoes(projeto.clientId),
  };
  // O contexto que o árbitro recebe. Não é o mesmo bloco riquíssimo do motor
  // (aquele nasce do `AIRunContext`, que só existe dentro da execução) — é o
  // que dá para reconstruir aqui, e é o suficiente para as perguntas que
  // importam neste caminho: tom, promessa falsa, número inventado.
  const contextoDaMarca = [
    `Negócio: ${negocio}`,
    req?.segment ? `Segmento: ${req.segment}` : "",
    listar(req?.services) ? `Serviços contratados: ${listar(req?.services)}` : "",
    listar(req?.objectives) ? `Objetivos: ${listar(req?.objectives)}` : "",
  ].filter(Boolean).join("\n");

  for (const entrega of reprovadas) {
    // `version` conta quantas versões desta peça já existiram. Usar o campo que
    // já é gravado evita inventar um contador paralelo que um dia diverge.
    if (entrega.version > MAX_TENTATIVAS_DE_REFAZER) {
      saida.persistentes.push(entrega.name);
      continue;
    }

    const esp = TODOS_OS_ESPECIALISTAS.find((e) => e.id === entrega.ownerAgentId);
    const quemFez = esp ? `${esp.departamentoLabel} · ${esp.label}` : entrega.name;

    const refeito = await generate({
      system: `Você é o especialista de ${esp?.label ?? "produção"} de uma agência de marketing brasileira. A Qualidade REPROVOU sua entrega. Refaça inteira, corrigindo exatamente o que foi apontado — não defenda a versão anterior, não repita o mesmo erro. Mantenha o mesmo formato. Responda SOMENTE com JSON válido.`,
      user: [
        `NEGÓCIO: ${negocio}`,
        `ENTREGA REPROVADA — "${entrega.name}":`,
        entrega.content ?? "",
        "",
        `O QUE A QUALIDADE APONTOU: ${entrega.lastFeedback ?? "qualidade insuficiente"}`,
        "",
        'Refaça corrigindo exatamente esses pontos. Onde faltar informação do cliente, escreva "PRECISO CONFIRMAR: <o quê>" — nunca invente para preencher.',
        // `cenas` NÃO é opcional aqui, e a razão não é de formato: se o item
        // tinha telas e volta sem elas, `extrairPecas` lê `cenas=[]` e
        // `publicacao.ts:1046` REBAIXA o carrossel para feed. O cliente comprou
        // 5 telas e recebe uma imagem, sem ninguém ficar vermelho.
        ESQUEMA_DA_ENTREGA,
        "Se o item já tinha CENAS (telas de carrossel), devolva TODAS elas no mesmo formato numerado. Carrossel que volta sem telas deixa de ser carrossel.",
      ].join("\n"),
      maxTokens: 1800,
      workspaceId: projeto.workspaceId,
      preferredProvider: esp?.provedor ?? "claude",
      agentId: "esteira-pacote-travado",
      clientId: projeto.clientId ?? null,
      projectId: projeto.id,
    });

    if (!refeito.ok) {
      // IA fora do ar não é reprovação: a peça fica como está e a próxima
      // passada do despertador tenta de novo. Contar isto como tentativa
      // gastaria o teto por um problema que não é do modelo nem da peça.
      saida.persistentes.push(entrega.name);
      continue;
    }

    const dados = refeito.data as Record<string, unknown>;
    const novoTexto = typeof dados.summary === "string" ? String(dados.summary) : "";
    const itens = Array.isArray(dados.items) ? dados.items : [];
    if (itens.length === 0 && novoTexto.length < 40) {
      saida.persistentes.push(entrega.name);
      continue;
    }

    const novoCorpo = renderizar(dados);
    const novoTitulo = typeof dados.title === "string" && dados.title.trim() ? dados.title : entrega.name;

    // ── FREIO 1 · CONTRATO DE SAÍDA ─────────────────────────────────────────
    // A refação não pode ENCOLHER a entrega. O modelo que recebe "refaça
    // corrigindo" costuma devolver menos itens do que tinha — e uma peça com
    // metade das telas passa no árbitro (o tom está bom) e chega ao cliente
    // faltando o que ele comprou. `conferirContrato` conta e confere formato,
    // em código, sem IA. É o MESMO objeto do motor grande.
    const esperado = esp ? conferirContrato(esp, dados) : { cumpriu: true, violacoes: [] as string[] };
    if (!esperado.cumpriu) {
      saida.persistentes.push(entrega.name);
      await registrarRecusa(projeto, negocio, entrega.name, `contrato de saída: ${esperado.violacoes.join("; ")}`);
      continue;
    }

    // ── FREIO 2 · PISO DE VERDADE ───────────────────────────────────────────
    // Título junto com o corpo: o título vira o `name` do `Deliverable`, o
    // primeiro campo que o cliente lê, e conferir só o corpo já deixou passar
    // preço e prazo inventados no título.
    //
    // Reprovada aqui, a peça NÃO é gravada — nem como refeita, nem como
    // reprovada de novo. Ela fica como está, com a reprovação anterior de pé, e
    // a próxima passada tenta outra vez até o teto. Gravar o texto com dado
    // inventado "para não perder" seria colocar a invenção no lugar do original.
    const piso = conferirPisoDeVerdade(`${novoTitulo}\n\n${novoCorpo}`, verdade);
    if (!piso.aprovado) {
      saida.persistentes.push(entrega.name);
      await registrarRecusa(projeto, negocio, entrega.name, `piso de verdade: ${resumirViolacoes(piso.violacoes)}`);
      continue;
    }

    // Antes de sobrescrever, a versão reprovada vira registro imutável — mesmo
    // uma versão que o cliente nunca viu faz parte da história da peça
    // ("quantas vezes a Qualidade barrou isto?" só é respondível com o registro).
    await preservarVersaoAtual(entrega);

    // ── O ÁRBITRO VOLTA A OLHAR — a porta dos fundos que a auditoria de
    //    04/08/2026 encontrou fechada aqui ──────────────────────────────────
    //
    // Até esta data, a peça REPROVADA era reescrita e gravada de volta como
    // `quality_ok` com o comentário "a próxima auditoria decide de novo".
    // **Não existia próxima auditoria neste caminho**: `auditDeliverable` só
    // roda dentro de `run-execution`, e o motor é idempotente — ele não volta
    // numa peça que já produziu. A sequência real era: Qualidade reprova →
    // pacote-travado refaz → `quality_ok` → `apresentar` não vê ressalva → vai
    // ao cliente. O único freio da casa tinha uma porta dos fundos, e era
    // justamente o caminho de conserto.
    //
    // Agora a peça refeita é AUDITADA de novo, aqui, antes de mudar de estado.
    // É uma chamada de IA por peça reprovada — o caso raro, com teto de duas
    // tentativas. É barato exatamente onde é caro errar.
    const veredito = await auditDeliverable({
      deptLabel: esp?.departamentoLabel ?? "Produção",
      title: novoTitulo,
      content: novoCorpo,
      brandContext: contextoDaMarca,
      workspaceId: projeto.workspaceId,
      // A MESMA régua que reprovou a peça julga a refeita. Ver o `select` lá em
      // cima: é para isto que o `type` é lido.
      tipoDaEntrega: entrega.type,
      clientId: projeto.clientId ?? null,
      projectId: projeto.id,
    });

    // ── A REPROVAÇÃO NÃO SE APAGA POR AUSÊNCIA DE PARECER ───────────────────
    //
    // A regra da casa diz que indisponibilidade da auditoria NÃO bloqueia. Ela
    // vale para peça que nunca teve juiz: nesse caso o vazio é vazio, e vazio
    // não pode virar bloqueio da operação inteira. AQUI é o contrário: a única
    // opinião que já existiu sobre esta peça diz REPROVADA. "Ninguém olhou de
    // novo" não derruba isso — ausência de informação não é informação, e
    // muito menos absolvição. Sem árbitro, a peça continua barrada, é refeita
    // na próxima passada e, esgotado o teto, vira decisão de gente.
    const status = foiAprovadaPelaQualidade(veredito.verdict)
      ? revisionStatusDoVeredito("aprovado")
      : revisionStatusDoVeredito("reprovado");

    const parecer = foiAprovadaPelaQualidade(veredito.verdict)
      ? `Refeita após reprovação da Qualidade e APROVADA na reauditoria. ${veredito.note}`
      : foiReprovadaPelaQualidade(veredito.verdict)
        ? `Refeita e REPROVADA de novo: ${veredito.issues.join("; ") || veredito.note}`
        : `Refeita, mas ${veredito.note} Segue barrada: a reprovação anterior continua valendo.`;

    await prisma.deliverable.update({
      where: { id: entrega.id },
      data: {
        name: novoTitulo,
        content: novoCorpo,
        version: { increment: 1 },
        revisionStatus: status,
        // ⚠️ `revisionStatus` aqui NÃO sai do veredito: quando ninguém olhou de
        // novo, a peça CONTINUA barrada pela reprovação anterior (ver acima). Já
        // "quem julgou" sai do veredito desta passada e de mais nada — herdar o
        // árbitro da rodada passada seria afirmar uma auditoria que não houve.
        qualityArbiter: veredito.arbitro ?? null,
        qualityArbitragem: arbitragemDoVeredito(veredito),
        lastFeedback: parecer.slice(0, 500),
      },
    });
    await registrarNovaVersao({
      deliverableId: entrega.id,
      number: entrega.version + 1,
      content: novoCorpo,
      createdBy: entrega.ownerAgentId,
      note: parecer.slice(0, 300),
    });

    if (foiAprovadaPelaQualidade(veredito.verdict)) saida.corrigidas.push(quemFez);
    else if (foiReprovadaPelaQualidade(veredito.verdict)) saida.reprovadasDeNovo.push(entrega.name);
    else saida.semArbitro.push(entrega.name);
  }

  // Sobrou algo que resistiu ao teto? O pacote deixa de ser problema da máquina
  // e passa a ser decisão do Diretor. Sem este registro, o travamento seria
  // invisível — que foi exatamente o buraco encontrado no primeiro projeto.
  if (saida.persistentes.length > 0) {
    saida.escalado = true;
    await prisma.activityEvent.create({
      data: {
        workspaceId: projeto.workspaceId,
        projectId,
        clientId: projeto.clientId,
        type: "pacote_travado_escalado",
        message: `${negocio}: ${saida.persistentes.length} entrega(s) seguem reprovadas após ${MAX_TENTATIVAS_DE_REFAZER} tentativas — ${saida.persistentes.join("; ")}. Precisa de decisão.`.slice(0, 900),
      },
    }).catch(() => { /* best-effort: o registro não pode derrubar o destravamento */ });
  }

  return saida;
}

/** A recusa de um freio determinístico deixa rastro com o CASO na frente. O
 *  alerta carrega a própria evidência: "algo falhou" sem o motivo é ruído que
 *  ninguém investiga. */
async function registrarRecusa(
  projeto: { workspaceId: string; id: string; clientId: string | null },
  negocio: string,
  peca: string,
  motivo: string,
): Promise<void> {
  await prisma.activityEvent.create({
    data: {
      workspaceId: projeto.workspaceId,
      projectId: projeto.id,
      clientId: projeto.clientId,
      type: "refacao_barrada_no_conserto",
      message: `${negocio} · "${peca}": a versão refeita foi BARRADA antes de gravar — ${motivo}. A reprovação anterior continua valendo.`.slice(0, 900),
    },
  }).catch(() => { /* best-effort: o registro não pode derrubar o destravamento */ });
}

/** Uma lista JSON-em-string vira array. Campo ilegível vira vazio — nunca um
 *  item inventado. */
function lerLista(bruto: string | null | undefined): string[] {
  try { const v = JSON.parse(bruto ?? "[]"); return Array.isArray(v) ? (v as string[]) : []; }
  catch { return []; }
}

/** Os campos JSON-em-string do briefing viram texto legível para o árbitro.
 *  Campo ilegível vira vazio — nunca um rótulo inventado. */
function listar(bruto: string | null | undefined): string {
  if (!bruto) return "";
  try {
    const v = JSON.parse(bruto) as unknown;
    return Array.isArray(v) ? v.map(String).filter(Boolean).join(", ") : "";
  } catch {
    return "";
  }
}

/** O markdown que o cliente lê. Era uma CÓPIA que se declarava "mesmo
 *  formato de texto que o motor usa" e NÃO era: faltava a linha
 *  `["cenas","Cenas"]`, e sem ela o carrossel refeito perdia as telas,
 *  `extrairPecas` lia `cenas=[]` e `publicacao.ts:1046` rebaixava a peça
 *  para feed. Comentário dizendo "igual ao motor" não é mecanismo; import é. */
const renderizar = renderizarEntrega;

/** Os pacotes que estão travados agora — o que o painel do Diretor precisa ver. */
export async function pacotesTravados(workspaceId?: string) {
  const projetos = await prisma.project.findMany({
    where: {
      presentedAt: null,
      executionStatus: "done",
      ...(workspaceId ? { workspaceId } : {}),
      deliverables: { some: { revisionStatus: "quality_flag" } },
    },
    select: {
      id: true, name: true, clientId: true, updatedAt: true,
      deliverables: {
        where: { revisionStatus: "quality_flag" },
        select: { id: true, name: true, lastFeedback: true, version: true },
      },
    },
    orderBy: { updatedAt: "asc" },
  });

  return projetos.map((p) => ({
    projectId: p.id,
    projeto: p.name,
    clientId: p.clientId,
    desde: p.updatedAt,
    reprovadas: p.deliverables,
    /** Já esgotou as tentativas? Então está esperando gente, não a máquina. */
    esperandoDecisao: p.deliverables.some((d) => d.version > MAX_TENTATIVAS_DE_REFAZER),
  }));
}

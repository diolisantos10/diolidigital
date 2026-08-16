// O COLETOR DO RETRATO — a seta que faltava entre a caixa e o mundo.
//
// ── O DEFEITO, MEDIDO PELO ESSENCIAL `qualidade` (16/08/2026, achado D-003) ──
//
// `pendencias.ts` (a REGRA DE OURO DO DIRETOR, ordem do CEO de 15/08) julga
// certo e está testado. Mas `podeODiretorEncerrar(` só aparecia no PRÓPRIO
// teste — zero rota, zero script, zero import de produção. A ordem virou
// código e o código nunca foi ligado: nada perguntava a ele se o turno podia
// fechar, e o Diretor continuava checando de memória — exatamente o
// comportamento que produziu a ordem (cinco paradas seguidas em 09-10/08).
//
// Este arquivo é a seta. Ele VAI ao banco, monta um `RetratoDasFontes` de
// verdade e devolve para `pendencias.ts` julgar. Ele mesmo não julga nada —
// julgar já está certo e testado lá; aqui só mora "onde olhar".
//
// ── ESCOPO: ESTE COLETOR FALA SÓ POR "dioli-digital" ────────────────────────
//
// O cabeçalho de `pendencias.ts` diz: "o Diretor de produto pergunta pelo
// produto dele; o Diretor Geral pergunta por todos" — e o teste do arquivo
// fixa os escopos como "dioli-digital", "foocci", "cityjobs": são OS PRODUTOS
// da casa (repositórios distintos), não workspaces de um CRM. Este coletor
// mora dentro do repositório dioli-digital e só tem acesso ao banco DELE — não
// enxerga Foocci nem CityJobs. Por isso toda `Pendencia` que ele produz carrega
// o mesmo escopo fixo, `ESCOPO_DESTE_PRODUTO`. Quando existir um Diretor Geral
// de verdade, ele soma as saídas de um coletor destes por produto; somar não é
// responsabilidade deste arquivo — este arquivo fala só pelo que ele vê.
//
// ── A REGRA DAS FONTES: uma por vez, cada uma no seu try/catch ─────────────
//
// O ponto mais caro deste arquivo não é achar dado — é NÃO deixar uma consulta
// que estoura derrubar a varredura inteira. Se isso acontecesse, o retrato
// voltaria com `pendencias` curta e `falhas` vazio, e `podeODiretorEncerrar`
// leria "limpo" onde na verdade uma fonte simplesmente não respondeu. É
// EXATAMENTE a propriedade que o cabeçalho de `pendencias.ts` nomeia:
// "silêncio de fonte não é ausência de pendência". Por isso cada bloco abaixo
// roda isolado (`coletar`, mais abaixo): uma fonte que lança erro entra em
// `falhas` com nome e motivo, e as outras seguem rodando — `falhas` não fica
// vazio por engano, e `podeODiretorEncerrar` reprova o encerramento sozinho.
//
// ── OS SETE TIPOS, E A FONTE DE CADA UM (nenhum varrido em silêncio) ───────
//
//   bloqueio_aberto        → BloqueioV2 (canônico) + pacotes que a Qualidade
//                            travou e esgotou as tentativas automáticas
//   handoff_sem_aceite     → HandoffV2 "aguardando_recebimento", via a MESMA
//                            função que o PM usa (lib/agency/pm/varredura.ts)
//   prazo_estourado        → a mesma varredura (Task) + a mesma régua de SLA
//                            (SLA_POR_ESTADO_HORAS) aplicada às demais
//                            entidades com estado canônico derivado
//   aprovacao_pendente     → ApprovalRequest pendente com prazo vencido
//   efeito_morto           → OutboxV2 morto + SocialPost falhado + WhatsApp
//                            falhado — os três "efeito que ninguém olhou"
//   reprovado_sem_refacao  → Deliverable ainda em "quality_flag"
//   escalada_sem_resposta  → ContentRequest em "precisa_decisao" parado
//
// Nenhum dos sete é varrido "no escuro": cada um tem uma fonte real abaixo. O
// que É verdade, e fica dito aqui em vez de escondido: várias dessas colunas
// (`estadoCanonico`, `BloqueioV2`) só se populam depois que o rollout V2
// (`/api/v2/rollout`) roda em produção — enquanto isso não acontece, a
// consulta é honesta e correta, e devolve vazio porque está mesmo vazio, não
// porque este arquivo deixou de perguntar.

import { prisma } from "@/lib/db/client";
import type { Pendencia, RetratoDasFontes, TipoDePendencia } from "./pendencias";
import { varrerOQueEstaParado } from "@/lib/agency/pm/varredura";
import { SLA_POR_ESTADO_HORAS } from "@/lib/agency/v2-recovery/detector-de-parados";
import { pacotesTravados, MAX_TENTATIVAS_DE_REFAZER } from "@/lib/agency/esteira/pacote-travado";
import { departamentoDoAgente } from "@/lib/agency/escada/degraus";
import { deSlugLegado } from "@/lib/agency/catalogo-v2/adaptadores";

/** O único produto que este repositório enxerga — ver o comentário acima. */
export const ESCOPO_DESTE_PRODUTO = "dioli-digital";

const HORA_EM_MS = 3_600_000;

/**
 * O mesmo horizonte de "parado há tempo demais" que `lib/raio-x/dados.ts` usa
 * em TODOS os seus baldes (ver o comentário em `dados.ts` por volta da linha
 * 294): um segundo relógio na mesma casa é uma segunda regra para alguém
 * esquecer. Só é usado aqui onde a fonte não tem uma régua de estado própria
 * (SLA_POR_ESTADO_HORAS) para aplicar.
 */
const HORAS_PARA_CONSIDERAR_PARADO = 24;

function horasDesde(data: Date, agora: Date): number {
  return Math.max(0, Math.floor((agora.getTime() - data.getTime()) / HORA_EM_MS));
}

/**
 * Roda UMA fonte isolada. É este wrapper que garante a propriedade central do
 * arquivo: uma fonte que lança nunca derruba as outras, e nunca vira uma
 * lista vazia disfarçada de "nada pendente" — ela vira uma linha em `falhas`,
 * com o nome da fonte e o motivo, para `podeODiretorEncerrar` reprovar.
 */
async function coletar(
  nome: string,
  falhas: RetratoDasFontes["falhas"],
  buscar: () => Promise<Pendencia[]>,
): Promise<Pendencia[]> {
  try {
    return await buscar();
  } catch (erro) {
    falhas.push({ fonte: nome, erro: erro instanceof Error ? erro.message : String(erro) });
    return [];
  }
}

/**
 * Monta o `RetratoDasFontes` inteiro, direto do banco. É o único lugar deste
 * produto que faz essa pergunta ao banco — a rota (`app/api/diretor/pendencias`)
 * só chama esta função e entrega o resultado a `podeODiretorEncerrar`.
 */
export async function coletarRetratoDasFontes(agora: Date = new Date()): Promise<RetratoDasFontes> {
  const falhas: RetratoDasFontes["falhas"] = [];
  const escopo = ESCOPO_DESTE_PRODUTO;
  const limiteDeParado = new Date(agora.getTime() - HORAS_PARA_CONSIDERAR_PARADO * HORA_EM_MS);

  const [
    bloqueiosCanonicos,
    pacotesEsperandoDecisao,
    handoffsETarefas,
    estadoAlemDaTarefa,
    aprovacoesVencidas,
    efeitosMortos,
    entregasReprovadas,
    pedidosEscalados,
  ] = await Promise.all([
    // 1 · BLOQUEIO CANÔNICO — a tabela desenhada exatamente para isto
    // (BloqueioV2: "dono, SLA, evidência e próxima ação. Falha não desaparece
    // — ocupa espaço de propósito"). Ainda não tem escritor em produção (o
    // rollout M7 não ligou a flag de escrita); a consulta é real e correta,
    // e hoje devolve vazio porque a tabela está vazia — não porque ninguém
    // perguntou.
    coletar("bloqueios-canonicos (BloqueioV2)", falhas, async () => {
      const linhas = await prisma.bloqueioV2.findMany({
        where: { resolvidoEm: null },
        orderBy: { abertoEm: "asc" },
        take: 200,
      });
      return linhas.map((b) => ({
        tipo: "bloqueio_aberto" as TipoDePendencia,
        escopo,
        referencia: `${b.entidadeTipo}:${b.entidadeId}`,
        horasParada: horasDesde(b.abertoEm, agora),
        acao: `${b.donoFuncaoId}: bloqueio "${b.tipo}" aberto — ${b.acaoRecomendada}`,
      }));
    }),

    // 2 · O PACOTE QUE A PRÓPRIA CASA TRAVOU — `pacotesTravados()` já existe e
    // já é testado (lib/agency/esteira/pacote-travado.ts); reaproveitado aqui,
    // não reimplementado. `esperandoDecisao` é EXATAMENTE "alguém travou (a
    // Qualidade) e ninguém destravou (as 2 tentativas automáticas esgotaram)".
    coletar("pacotes-travados-pela-qualidade (esteira/pacote-travado)", falhas, async () => {
      const projetos = await pacotesTravados();
      return projetos
        .filter((p) => p.esperandoDecisao)
        .map((p) => ({
          tipo: "bloqueio_aberto" as TipoDePendencia,
          escopo,
          referencia: `Project:${p.projectId}`,
          horasParada: horasDesde(p.desde, agora),
          acao:
            `"${p.projeto}": pacote reprovado pela Qualidade esgotou as ${MAX_TENTATIVAS_DE_REFAZER} tentativas ` +
            `automáticas de refação (${p.reprovadas.length} peça(s) presa(s)). Decisão de gente agora.`,
        }));
    }),

    // 3 · HANDOFF SEM ACEITE + TAREFA ALÉM DO PRAZO — a MESMA função que o PM
    // usa (lib/agency/pm/varredura.ts), alimentada com o MESMO par de fontes
    // que o despertador já lê a cada 5 minutos (despertador.ts). Não é uma
    // segunda régua: é a régua do PM, chamada de um segundo lugar.
    coletar("handoffs-e-tarefas (HandoffV2 + Task, via pm/varredura)", falhas, async () => {
      const [handoffsAbertos, tarefas] = await Promise.all([
        prisma.handoffV2.findMany({
          where: { status: "aguardando_recebimento" },
          orderBy: { criadoEm: "asc" },
          take: 200,
        }),
        prisma.task.findMany({
          where: { estadoCanonico: { not: null }, status: { in: ["pending", "in_progress", "in_review"] } },
          orderBy: { updatedAt: "asc" },
          take: 300,
          select: { id: true, estadoCanonico: true, updatedAt: true, agentId: true },
        }),
      ]);
      const varredura = varrerOQueEstaParado(
        {
          handoffs: handoffsAbertos.map((h) => ({
            id: h.id,
            deDepartamento: h.deDepartamento,
            paraDepartamento: h.paraDepartamento,
            responsavelEntrega: h.responsavelEntrega,
            criadoEm: h.criadoEm,
            cobradoEm: h.cobradoEm,
          })),
          trabalhos: tarefas.map((t) => {
            const legado = t.agentId ? departamentoDoAgente(t.agentId) : null;
            return {
              id: t.id,
              entidadeTipo: "Task",
              estadoCanonico: t.estadoCanonico,
              atualizadoEm: t.updatedAt,
              donoDepartamento: legado ? (deSlugLegado(legado) ?? legado) : null,
            };
          }),
        },
        agora,
      );
      // "sem_dono" também nasce de um SLA estourado (varredura.ts só cobra
      // depois de checar o prazo) — por isso cai em prazo_estourado, e não num
      // tipo à parte: o texto do `pedido` já diz "sem dono" quando é o caso.
      return varredura.cobrancas.map((c) => ({
        tipo: (c.motivo === "handoff_sem_aceite" ? "handoff_sem_aceite" : "prazo_estourado") as TipoDePendencia,
        escopo,
        referencia: c.referencia,
        horasParada: c.horasParado,
        acao: c.pedido,
      }));
    }),

    // 4 · A MESMA RÉGUA DE SLA, PARA QUEM NÃO É TASK — Deliverable,
    // ApprovalRequest, ContentRequest e ClientRequestDb também recebem
    // `estadoCanonico`. `varrerOQueEstaParado` resolve DONO por `agentId`, que
    // só Task tem — para as demais, aplicamos a MESMA tabela
    // (SLA_POR_ESTADO_HORAS, importada, nunca copiada) sem inventar dono.
    coletar("estado-canonico-alem-da-tarefa (Deliverable/ApprovalRequest/ContentRequest/ClientRequestDb)", falhas, async () => {
      const [deliverables, aprovacoes, pedidos, briefings] = await Promise.all([
        prisma.deliverable.findMany({
          where: { estadoCanonico: { not: null } },
          select: { id: true, estadoCanonico: true, updatedAt: true },
          take: 300,
        }),
        prisma.approvalRequest.findMany({
          where: { estadoCanonico: { not: null } },
          select: { id: true, estadoCanonico: true, updatedAt: true },
          take: 300,
        }),
        prisma.contentRequest.findMany({
          where: { estadoCanonico: { not: null } },
          select: { id: true, estadoCanonico: true, updatedAt: true },
          take: 300,
        }),
        prisma.clientRequestDb.findMany({
          where: { estadoCanonico: { not: null } },
          select: { id: true, estadoCanonico: true, updatedAt: true },
          take: 300,
        }),
      ]);
      const todos = [
        ...deliverables.map((d) => ({ entidadeTipo: "Deliverable", ...d })),
        ...aprovacoes.map((d) => ({ entidadeTipo: "ApprovalRequest", ...d })),
        ...pedidos.map((d) => ({ entidadeTipo: "ContentRequest", ...d })),
        ...briefings.map((d) => ({ entidadeTipo: "ClientRequestDb", ...d })),
      ];
      const pendencias: Pendencia[] = [];
      for (const item of todos) {
        const sla = SLA_POR_ESTADO_HORAS[item.estadoCanonico as string];
        if (sla === undefined) continue; // estado sem régua: assunto da leitura dupla, não deste coletor
        const horas = horasDesde(item.updatedAt, agora);
        if (horas <= sla) continue;
        pendencias.push({
          tipo: "prazo_estourado",
          escopo,
          referencia: `${item.entidadeTipo}:${item.id}`,
          horasParada: horas,
          acao: `${item.entidadeTipo} ${item.id} está em "${item.estadoCanonico}" há ${horas}h, e o prazo desse estado é ${sla}h. Confira e desbloqueie.`,
        });
      }
      return pendencias;
    }),

    // 5 · A DECISÃO DO CLIENTE QUE VENCEU — o próprio campo que a casa criou
    // para isto (`ApprovalRequest.expiresAt`), não uma régua nova.
    coletar("aprovacoes-vencidas (ApprovalRequest.expiresAt)", falhas, async () => {
      const vencidas = await prisma.approvalRequest.findMany({
        where: { status: "pending", expiresAt: { lt: agora } },
        select: { id: true, department: true, expiresAt: true },
        orderBy: { expiresAt: "asc" },
        take: 200,
      });
      return vencidas.map((a) => ({
        tipo: "aprovacao_pendente" as TipoDePendencia,
        escopo,
        referencia: `ApprovalRequest:${a.id}`,
        horasParada: horasDesde(a.expiresAt as Date, agora),
        acao: `${a.department}: aprovação do cliente venceu em ${(a.expiresAt as Date).toISOString()} e ninguém decidiu por ele. Renove o prazo ou vá atrás da decisão.`,
      }));
    }),

    // 6 · O EFEITO QUE MORREU NA FILA — os três lugares desta casa onde um
    // efeito externo esgota as tentativas e para: OutboxV2 (o outbox
    // genérico, estado "dead" É o nome do tipo), SocialPost ("failed") e
    // WhatsAppOutbox ("failed"). Mesmos três que lib/raio-x/dados.ts mede.
    coletar("efeitos-mortos (OutboxV2 + SocialPost + WhatsAppOutbox)", falhas, async () => {
      const [outboxMortos, postsFalhados, whatsappFalhados] = await Promise.all([
        prisma.outboxV2.findMany({
          where: { status: "dead" },
          select: { id: true, tipo: true, criadoEm: true, ultimoErro: true },
          take: 200,
        }),
        prisma.socialPost.findMany({
          where: { status: "failed" },
          select: { id: true, updatedAt: true, lastError: true },
          take: 200,
        }),
        prisma.whatsAppOutbox.findMany({
          where: { status: "failed" },
          select: { id: true, updatedAt: true, error: true, kind: true },
          take: 200,
        }),
      ]);
      return [
        ...outboxMortos.map((o) => ({
          tipo: "efeito_morto" as TipoDePendencia,
          escopo,
          referencia: `OutboxV2:${o.id}`,
          horasParada: horasDesde(o.criadoEm, agora),
          acao: `Efeito "${o.tipo}" morreu na fila depois de esgotar as tentativas — ${o.ultimoErro ?? "sem motivo registrado"}. Decida: reprocessar ou descartar.`,
        })),
        ...postsFalhados.map((p) => ({
          tipo: "efeito_morto" as TipoDePendencia,
          escopo,
          referencia: `SocialPost:${p.id}`,
          horasParada: horasDesde(p.updatedAt, agora),
          acao: `Publicação falhou e ficou parada — ${p.lastError ?? "sem motivo registrado"}. Reagende ou explique ao cliente.`,
        })),
        ...whatsappFalhados.map((w) => ({
          tipo: "efeito_morto" as TipoDePendencia,
          escopo,
          referencia: `WhatsAppOutbox:${w.id}`,
          horasParada: horasDesde(w.updatedAt, agora),
          acao: `Mensagem de WhatsApp ("${w.kind}") falhou e não saiu — ${w.error ?? "sem motivo registrado"}.`,
        })),
      ];
    }),

    // 7 · REPROVADA E NUNCA REFEITA — todo Deliverable ainda marcado
    // "quality_flag" no momento da leitura. `destravarPacote()` tenta refazer
    // sozinho; se a peça continua aqui, ou o cron não passou ainda, ou ela já
    // esgotou as tentativas (e aí também aparece na fonte 2, de outro ângulo
    // — o pacote inteiro). As duas leituras coexistem de propósito: uma
    // pendência que aparece duas vezes por dois ângulos verdadeiros não é
    // ruído, é dois fatos verdadeiros sobre o mesmo caso.
    coletar("entregas-reprovadas (Deliverable.revisionStatus=quality_flag)", falhas, async () => {
      const reprovadas = await prisma.deliverable.findMany({
        where: { revisionStatus: "quality_flag" },
        select: { id: true, name: true, updatedAt: true, projectId: true, version: true },
        take: 300,
      });
      return reprovadas.map((d) => ({
        tipo: "reprovado_sem_refacao" as TipoDePendencia,
        escopo,
        referencia: `Deliverable:${d.id}`,
        horasParada: horasDesde(d.updatedAt, agora),
        acao: `"${d.name}" (projeto ${d.projectId}) segue reprovada pela Qualidade, versão ${d.version}. Confira se a refação automática travou.`,
      }));
    }),

    // 8 · A MÁQUINA PAROU E CHAMOU, E NINGUÉM ATENDEU — ContentRequest em
    // "precisa_decisao" é o fail-closed da triagem funcionando (não é
    // defeito); o defeito é ficar assim por mais de um dia. Mesmo balde e
    // mesmo horizonte que lib/raio-x/dados.ts já mede (item 10 daquele
    // arquivo) — aqui ele vira pendência formal do Diretor, não só um número
    // de painel.
    coletar("pedidos-escalados (ContentRequest.status=precisa_decisao)", falhas, async () => {
      const pedidos = await prisma.contentRequest.findMany({
        where: { status: "precisa_decisao", updatedAt: { lt: limiteDeParado } },
        select: { id: true, title: true, updatedAt: true, declineReason: true },
        take: 200,
      });
      return pedidos.map((p) => ({
        tipo: "escalada_sem_resposta" as TipoDePendencia,
        escopo,
        referencia: `ContentRequest:${p.id}`,
        horasParada: horasDesde(p.updatedAt, agora),
        acao: `"${p.title}": a triagem automática parou e escalou — ${p.declineReason ?? "sem motivo registrado"}. Decida e destrave.`,
      }));
    }),
  ]);

  return {
    pendencias: [
      ...bloqueiosCanonicos,
      ...pacotesEsperandoDecisao,
      ...handoffsETarefas,
      ...estadoAlemDaTarefa,
      ...aprovacoesVencidas,
      ...efeitosMortos,
      ...entregasReprovadas,
      ...pedidosEscalados,
    ],
    falhas,
  };
}

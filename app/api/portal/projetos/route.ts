// /api/portal/projetos — os projetos do cliente POR clientId, não por solicitação.
//
// Por que esta rota existe: no lançamento da Foocci (03/08/2026) o CEO abriu o
// portal e perguntou "onde eu vejo o projeto?". A aba Projetos estava vazia
// porque TUDO no portal derivava de clientRequestId — e cliente criado direto
// (sem passar pelo briefing público) não tem solicitação. O projeto existia, os
// posts do carrossel estavam agendados por clientId, e o cliente não via nada.
//
// Aqui a chave é o clientId derivado do token (regra da casa, 03/08/2026:
// derivação, nunca comparação — clientId de query/corpo não entra). Funciona
// para os dois mundos: cliente que veio do briefing e cliente criado direto.
//
// Fronteira do portal — o que NUNCA sai por aqui:
//   • proposalPricing / proposalScope / proposalStatus — preço não vai ao
//     cliente nesta versão (a decisão registrada aparece via aprovações);
//   • executionError / executionStatus / agents — o cliente não precisa saber
//     que uma IA falhou, precisa saber em que pé está o trabalho dele;
//   • post com visibility "interno" — fail-closed, mesma regra do calendário.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { PECA_VISIVEL_AO_CLIENTE } from "@/lib/agency/portal/peca-visivel-ao-cliente";
import { donoDoPortal } from "@/lib/agency/persistence/portal-access-service";
import { tokenDoPortal } from "@/lib/agency/persistence/portal-cookie";
import { statusDoProjeto } from "@/lib/agency/esteira/retrato";

// ═══════════════════════════════════════════════════════════════════════════
// A ETAPA NÃO É ESCRITA AQUI — E ESSE É O CONSERTO (cliente oculto, 6ª rodada)
// ═══════════════════════════════════════════════════════════════════════════
//
// Aqui morava `etapaLegivel()`: uma função de sete linhas que derivava a etapa
// do cliente dos carimbos do `Project` mais o pagamento. Ela estava CERTA — e
// era o problema.
//
// Medido em produção: `/api/portal/esteira` dizia ao cliente **"Ainda estamos
// produzindo"** enquanto esta rota — o CARTÃO, que é o que ele vê primeiro —
// dizia **"Esperando a sua aprovação"**, com 2 cartões pedindo decisão. Mesmo
// portal, mesmo projeto, duas frases opostas. É a TERCEIRA contradição que o
// cliente oculto encontra nesta mesma superfície, e as três tiveram a mesma
// causa: dois escritores da mesma verdade.
//
// O ramo exato da divergência: com `presentedAt` carimbado e NENHUMA decisão
// disponível (`decisoesDisponiveis === 0`), `lerFase` responde "ainda estamos
// produzindo" — corretamente, porque não há corpo para o cliente assinar — e
// `etapaLegivel` respondia "esperando a sua aprovação" no primeiro `if`,
// porque `presentedAt` era tudo o que ela olhava. Ela não tinha COMO saber:
// nunca contou entregável nenhum.
//
// Verdade escrita em dois lugares já está errada em um deles. Não se conserta
// alinhando as duas redações — isso dura até o próximo conserto de uma delas.
// Mata-se o segundo escritor.
//
// Agora as duas rotas leem `statusDoProjeto` (`esteira/retrato.ts`), o mesmo
// leitor, e devolvem a MESMA string. O que só esta rota sabia — o pagamento —
// subiu para o leitor único (`RetratoDoProjeto.pagamentoConfirmado`), então
// nada se perdeu no caminho: a esteira ficou MAIS informada, não menos.
//
// A régua que prende isto é `__tests__/portal/uma-verdade-so.test.ts`: ela
// reprova qualquer volta em que as duas rotas discordem sobre o mesmo projeto.
//
// ⚠️ Custo assumido: uma leitura de `statusDoProjeto` POR projeto do cliente.
// Cliente de agência tem 1–3 projetos, e correção vale mais que contagem de
// consulta. Quando um cliente tiver dezenas, a conta vira lote — não volta a
// ser uma segunda gramática.

/** O estado do post como o CLIENTE entende — espelho do CalendarioDoMes. */
function statusLegivel(s: string): string {
  switch (s) {
    case "published": return "No ar";
    case "scheduled": return "Programado";
    case "failed":    return "Com problema";
    // A decisão do cliente propagada pelo card de calendário volta legível.
    case "approved":  return "Aprovado por você";
    case "revision_requested": return "Em ajuste";
    default:          return "Esperando você";
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  // A4: query (compatibilidade) ou cookie httpOnly da sessão de portal.
  const token = tokenDoPortal(request, new URL(request.url).searchParams.get("token"));
  if (!token) return NextResponse.json({ error: "token é obrigatório" }, { status: 400 });

  // O dono vem SEMPRE do token — único caminho público desta rota.
  // ── TOKEN VÁLIDO SEM FICHA DE CLIENTE NÃO É ACESSO NEGADO (6ª rodada) ─────
  //
  // Medido em produção: um prospect recém-orçado, com o link que a casa acabou
  // de mandar, recebia 200 na esteira e nas mensagens (com a proposta dele
  // dentro) e **403 "Acesso negado"** aqui — porque a ficha de `Client` só
  // nasce quando ele ACEITA. Ausência de ficha virava afirmação de que ele não
  // podia entrar. Ver `donoDoPortal`.
  //
  // Token inválido, expirado ou revogado continua 403, sem um milímetro de
  // folga. O que muda é só o caso em que o acesso é legítimo e ainda não há o
  // que mostrar — e aí a casa mostra o vazio, com todas as letras.
  const dono = await donoDoPortal(token);
  if (dono === "invalido") return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  if (dono === "sem-cliente") return NextResponse.json({ ok: true, projetos: [], calendario: [], aindaSemFicha: true });

  try {
    const [projetos, posts] = await Promise.all([
      prisma.project.findMany({
        where: { clientId: dono.clientId },
        orderBy: { createdAt: "desc" },
        // Select explícito — o que não entra aqui não tem COMO vazar.
        select: {
          id: true, name: true, goal: true, createdAt: true,
          presentedAt: true, clientApprovedAt: true, directionApprovedAt: true,
          // O pedido continua no select porque a leitura do pagamento (agora em
          // `statusDoProjeto`) nasce dele — e continua sem VAZAR: o id do
          // pedido não vai para a resposta.
          clientRequestId: true,
        },
      }),
      prisma.socialPost.findMany({
        // Por clientId: pega também os posts agendados sem clientRequestId —
        // o buraco exato que deixou o calendário da Foocci invisível.
        //
        // `PECA_VISIVEL_AO_CLIENTE` entrou em 26/08/2026: o cliente oculto viu
        // este calendário oferecer TRÊS peças sem arte, com "Esperando você" —
        // pedindo decisão sobre cartão vazio. A regra é a mesma de
        // `/api/social-posts` e mora num lugar só, porque a primeira versão
        // deste conserto fechou aquela rota e esqueceu esta.
        where: { clientId: dono.clientId, ...PECA_VISIVEL_AO_CLIENTE },
        orderBy: { scheduledFor: "asc" },
        select: {
          id: true, caption: true, networks: true, format: true, pillar: true,
          mediaUrl: true, mediaUrlsJson: true, scheduledFor: true, status: true,
        },
      }),
    ]);

    // ── A ETAPA VEM DO LEITOR ÚNICO, UM PROJETO POR VEZ ───────────────────
    //
    // A leitura do pagamento que morava aqui subiu para `statusDoProjeto` (ela
    // era o que ESTA rota sabia e a esteira não). Aqui sobrou o que sempre
    // devia ter sobrado: pedir a etapa a quem a escreve.
    //
    // `null` (projeto que o leitor não encontrou) NÃO vira "Em produção" nem
    // qualquer outra afirmação: vira a frase que diz que a etapa não foi lida.
    // Ausência de informação não é informação — foi um `else` afirmativo que
    // produziu a mentira anterior nesta mesma função.
    const etapas = new Map<string, string>();
    await Promise.all(projetos.map(async (p) => {
      const st = await statusDoProjeto(p.id).catch(() => null);
      etapas.set(p.id, st?.leitura.paraCliente.titulo ?? "Não consegui ler a etapa agora");
    }));

    return NextResponse.json({
      ok: true,
      projetos: projetos.map((p) => ({
        id: p.id,
        nome: p.name,
        objetivo: p.goal,
        etapa: etapas.get(p.id) ?? "Não consegui ler a etapa agora",
        criadoEm: p.createdAt,
      })),
      calendario: posts.map((p) => ({
        id: p.id,
        caption: p.caption,
        networks: (() => { try { return JSON.parse(p.networks) as string[]; } catch { return []; } })(),
        format: p.format,
        pillar: p.pillar,
        mediaUrl: p.mediaUrl,
        // As telas do carrossel — o cliente clica no post agendado e vê a peça
        // INTEIRA, não só a miniatura da capa. Parse defensivo: JSON quebrado
        // vira lista vazia, nunca 500. (São artes prontas; o scenesJson —
        // descrição interna — continua fora da fronteira.)
        telas: (() => { try { const v = JSON.parse(p.mediaUrlsJson ?? "[]"); return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []; } catch { return []; } })(),
        scheduledFor: p.scheduledFor ? p.scheduledFor.toISOString() : null,
        // O cru para o componente agrupar; o legível para quem consome direto.
        status: p.status,
        statusLegivel: statusLegivel(p.status),
      })),
    });
  } catch {
    return NextResponse.json({ error: "Não consegui carregar agora" }, { status: 503 });
  }
}

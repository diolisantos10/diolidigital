// /api/portal/esteira — a mesma verdade da esteira, na linguagem do cliente.
//
// O cliente entra por token, não por sessão, e não conhece id de projeto — ele
// conhece o próprio projeto. Esta rota resolve isso e devolve SÓ o que é dele:
// em que etapa está, o que a agência está fazendo, e o que se espera dele agora.
//
// A leitura vem do mesmo módulo que alimenta a tela da agência. Isso é
// deliberado: se cada lado montasse a própria versão, um dia o cliente veria um
// estado e a equipe outro — e não há jeito pior de perder a confiança dele.
//
// POST é onde o cliente decide: aprovar a direção (que dispara a produção) ou
// aprovar o pacote apresentado. São as duas únicas coisas que ele pode mudar
// aqui — o resto é leitura.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { validatePortalAccess } from "@/lib/agency/persistence/portal-access-service";
import { tokenDoPortal } from "@/lib/agency/persistence/portal-cookie";
import { statusPelaSolicitacao } from "@/lib/agency/esteira/retrato";
import { lerFase } from "@/lib/agency/esteira/fases";
import { aprovarDirecao, aprovarPacote } from "@/lib/agency/esteira/marcos";
import { runProjectExecution } from "@/lib/agency/execution/run-execution";

export const maxDuration = 300;

/**
 * O NOME de quem está decidindo, DERIVADO do token — nunca do corpo.
 *
 * ── Por que isto existe (15/08/2026) ─────────────────────────────────────────
 * `aprovarPacote` gravava `reviewedBy: "cliente"`, seco, e a trava de publicação
 * recusa essa grafia de propósito (`aprovacao-da-peca.ts`) porque o mesmo marco
 * é alcançável por rota de sessão da agência. Resultado: o CEO via a entrega
 * como aprovada e o publicador via a mesma linha como não-aprovada.
 *
 * Aqui a decisão vem de um token de portal JÁ VALIDADO — é comprovadamente o
 * cliente. Então ela grava `client:<nome>`, a mesma gramática de
 * `/api/portal/approvals`. O nome sai do cadastro do cliente dono do token;
 * cliente sem nome legível vira `client:portal:<8 chars>…`, que continua sendo
 * uma autoria do lado do cliente — o que nunca volta é a grafia ambígua.
 */
async function nomeDoClienteDoToken(token: string): Promise<string> {
  const anonimo = `portal:${token.slice(0, 8)}…`;
  try {
    // Leitura SEM efeito colateral: `validatePortalAccess` (que já rodou nesta
    // requisição) incrementa `accessCount`, e a mesma visita não pode contar
    // duas vezes — é a lição escrita em `conferirTokenDoPortal`.
    const record = await prisma.portalAccess.findUnique({
      where: { token }, select: { clientId: true, clientRequestId: true },
    });
    let clientId = record?.clientId ?? null;
    if (!clientId && record?.clientRequestId) {
      const solicitacao = await prisma.clientRequestDb.findUnique({
        where: { id: record.clientRequestId }, select: { clientId: true },
      });
      clientId = solicitacao?.clientId ?? null;
    }
    if (!clientId) return anonimo;
    const cliente = await prisma.client.findUnique({ where: { id: clientId }, select: { name: true } });
    return (cliente?.name ?? "").trim() || anonimo;
  } catch {
    // Nome é enfeite da autoria; o LADO é que importa. Banco tropeçando não
    // pode transformar uma decisão do cliente em decisão sem autor.
    return anonimo;
  }
}

/** Resolve a solicitação do cliente a partir do token. Único caminho público. */
async function solicitacaoDoToken(token: string): Promise<{ id: string } | { erro: string; codigo: number; clientId?: string }> {
  const acesso = await validatePortalAccess(token);
  if (!acesso.valid) return { erro: "Acesso negado", codigo: 403 };

  const direto = acesso.record?.clientRequestId;
  if (direto) return { id: direto };

  const clientId = acesso.record?.clientId;
  if (!clientId) return { erro: "Acesso sem projeto vinculado", codigo: 404 };

  const ultima = await prisma.clientRequestDb.findFirst({
    where: { clientId },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (!ultima) return { erro: "Ainda não há projeto para acompanhar", codigo: 404, clientId };
  return { id: ultima.id };
}

/**
 * Cliente que entrou DIRETO (sem passar pelo briefing público) não tem
 * solicitação — mas pode ter projeto. Foi o caso da Foocci no lançamento: o
 * portal respondia "não consegui carregar" para um projeto que existia e
 * estava andando. A trilha aqui é derivada dos três carimbos do Project — os
 * momentos que aconteceram — nunca de um status escrito à mão.
 */
async function trilhaDoProjetoDireto(clientId: string) {
  const p = await prisma.project.findFirst({
    where: { clientId },
    orderBy: { createdAt: "desc" },
    select: { name: true, presentedAt: true, clientApprovedAt: true, directionApprovedAt: true },
  });
  if (!p) return null;

  const etapas = [
    { etapa: "Projeto aberto", feito: true },
    { etapa: "Produção", feito: Boolean(p.presentedAt) },
    { etapa: "Sua aprovação", feito: Boolean(p.clientApprovedAt) },
    { etapa: "No ar", feito: false },
  ];
  const atual = etapas.findIndex((e) => !e.feito);
  const trilha = etapas.map((e, i) => ({
    etapa: e.etapa,
    estado: (i < atual || atual === -1 ? "feito" : i === atual ? "atual" : "futuro") as "feito" | "atual" | "futuro",
  }));

  const aguardandoCliente = Boolean(p.presentedAt && !p.clientApprovedAt);
  return {
    ok: true,
    temProjeto: true,
    projeto: p.name,
    etapa: aguardandoCliente ? "Esperando a sua aprovação" : "Em produção",
    agora: aguardandoCliente
      ? "O pacote está pronto — dê uma olhada na aba Aprovações."
      : "A equipe está produzindo. Quando algo precisar de você, aparece nas pendências.",
    oQueEsperamosDeVoce: aguardandoCliente ? "Aprovar ou pedir ajustes na aba Aprovações." : null,
    aBolaEstaComVoce: aguardandoCliente,
    progresso: Math.round(((atual === -1 ? etapas.length : atual) / etapas.length) * 100),
    trilha,
    pendencias: [],
    // Sem solicitação de briefing não há direção para avalizar por esta porta —
    // e `false` aqui é MEDIDO, não omissão: este ramo não tem projeto com
    // portão de direção pendente (ele só existe quando há `clientRequestId`).
    direcao: { pedeAprovacao: false },
    ciclo: null,
  };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  // A4: query (compatibilidade) ou cookie httpOnly da sessão de portal.
  const token = tokenDoPortal(request, new URL(request.url).searchParams.get("token"));
  if (!token) return NextResponse.json({ error: "token é obrigatório" }, { status: 400 });

  const alvo = await solicitacaoDoToken(token);
  if ("erro" in alvo) {
    // Sem solicitação de briefing, mas com projeto? A trilha vem do projeto.
    if ("clientId" in alvo && alvo.clientId) {
      const direto = await trilhaDoProjetoDireto(alvo.clientId);
      if (direto) return NextResponse.json(direto);
    }
    return NextResponse.json({ error: alvo.erro }, { status: alvo.codigo });
  }

  const status = await statusPelaSolicitacao(alvo.id);
  if (!status) {
    // ═══════════════════════════════════════════════════════════════════════
    // A QUARTA CONTRADIÇÃO DO PORTAL (cliente oculto, 6ª rodada)
    // ═══════════════════════════════════════════════════════════════════════
    //
    // Medido em produção, MESMO token, MESMO minuto:
    //   • `/api/portal/messages` → a proposta dele, com o valor, a lista do que
    //     entra e o link de aceitar ou recusar;
    //   • esta rota            → *"Ainda estamos organizando tudo. Seu projeto
    //     está sendo preparado."*
    //
    // A frase era um literal cravado aqui, disparado sempre que não existe
    // linha de `Project` — e `Project` só nasce DEPOIS do aceite. Ou seja: em
    // toda a fase comercial, a esteira dizia ao cliente que nada tinha
    // acontecido, enquanto a proposta esperava a assinatura dele na aba do
    // lado. É a mesma família das três anteriores: um segundo escritor da
    // etapa, aqui na forma de um texto fixo.
    //
    // `lerFase` já sabia responder isto — os ramos comerciais (`orcamento`,
    // `negociacao`, `sondagem`) existem e nunca eram alcançados por esta porta.
    // O conserto é ler a solicitação e passá-la ao MESMO leitor, em vez de
    // escrever a quarta versão da verdade.
    const solicitacao = await prisma.clientRequestDb
      .findUnique({ where: { id: alvo.id }, select: { status: true, businessName: true } })
      .catch(() => null);
    const leitura = lerFase({
      statusDaSolicitacao: solicitacao?.status ?? null,
      propostaAceita: false,
      tarefas: { total: 0, entregues: 0, produzindo: 0, bloqueadas: 0 },
      entregaveis: { total: 0, emRevisao: 0, comRessalva: 0, aprovados: 0 },
      pedidosAbertos: 0, pedidosCobrados: 0,
      cicloAberto: false, postsPublicados: 0, postsAgendados: 0,
    });
    return NextResponse.json({
      ok: true,
      temProjeto: false,
      projeto: solicitacao?.businessName ?? null,
      etapa: leitura.paraCliente.titulo,
      // `titulo` fica no lugar por compatibilidade com quem já o lia — mas
      // agora ele diz a MESMA coisa que `etapa`, e as duas saem do leitor
      // único. Duas chaves com dois textos é como esta casa se contradiz.
      titulo: leitura.paraCliente.titulo,
      agora: leitura.paraCliente.agora,
      oQueEsperamosDeVoce: leitura.paraCliente.oQueEsperamosDeVoce,
      aBolaEstaComVoce: leitura.responsavel === "cliente",
      progresso: leitura.progresso,
      trilha: [],
      pendencias: [],
      direcao: { pedeAprovacao: false },
      ciclo: null,
    });
  }

  // Só o que é do cliente. Nada de contagem interna, nome de agente ou erro de
  // execução — o cliente não precisa saber que uma IA falhou, precisa saber em
  // que pé está o trabalho dele.
  return NextResponse.json({
    ok: true,
    temProjeto: true,
    projeto: status.nome,
    etapa: status.leitura.paraCliente.titulo,
    agora: status.leitura.paraCliente.agora,
    oQueEsperamosDeVoce: status.leitura.paraCliente.oQueEsperamosDeVoce,
    aBolaEstaComVoce: status.leitura.responsavel === "cliente",
    progresso: status.leitura.progresso,
    trilha: status.trilha.map((t) => ({ etapa: t.curtoCliente, estado: t.estado })),
    pendencias: status.pendencias.filter((p) => p.jaFoiPedido).map((p) => p.descricao),
    // ── O CARD DO PACOTE (CEO, 08/08/2026) ────────────────────────────────
    // O botão "Aprovar tudo" deixou de ser derivado do TEXTO da etapa
    // ("tudo pronto", casado por `includes`) e passa a vir daqui, medido no
    // servidor. Casar botão com frase é dívida: a frase muda por motivo de
    // redação e o botão muda de comportamento junto, sem ninguém perceber.
    //
    // `prontas` sobe com nome de cliente porque o card TEM de listar o que
    // está dentro — ele estava pedindo assinatura sem dizer em quê.
    // ── A PORTA DE APROVAR A DIREÇÃO ──────────────────────────────────────
    // Mesmo molde do card do pacote, logo abaixo, e pelo mesmo motivo: as duas
    // telas do portal desenhavam este botão casando o TEXTO da etapa com a
    // frase "confirme o caminho". Bastou a etapa virar "Precisamos de uma
    // coisa sua" para o botão sumir enquanto a conversa dizia "é só aprovar"
    // (case Farol 27, 24/08/2026). Agora quem decide é o ESTADO, medido aqui.
    direcao: { pedeAprovacao: status.leitura.precisaAprovarDirecao },
    pacote: {
      pedeAprovacao: status.pacote.pedeAprovacao,
      prontas: status.pacote.prontas.map((i) => i.titulo),
      emProducao: status.pacote.emProducao.map((i) => i.titulo),
    },
    ciclo: status.ciclo ? { referencia: status.ciclo.referencia, resumo: status.ciclo.resumo } : null,
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: { token?: string; decisao?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }

  const token = tokenDoPortal(request, body.token);
  if (!token) return NextResponse.json({ error: "token é obrigatório" }, { status: 400 });

  const alvo = await solicitacaoDoToken(token);
  if ("erro" in alvo) return NextResponse.json({ error: alvo.erro }, { status: alvo.codigo });

  const projeto = await prisma.project.findFirst({
    where: { clientRequestId: alvo.id },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (!projeto) return NextResponse.json({ error: "Projeto não encontrado" }, { status: 404 });

  if (body.decisao === "aprovar_direcao") {
    // ── RESPONDE CEDO, TRABALHA ATRÁS (medido, 7ª volta, 26/08/2026) ───────
    //
    // ⚠️ MEDIDO EM PRODUÇÃO: este clique segurava o cliente **mais de 2
    // minutos** dentro da requisição. `aprovarDirecao()` rodava a PRODUÇÃO
    // INTEIRA — seis entregas, dezenas de chamadas de IA — antes de devolver
    // qualquer coisa ao navegador dele.
    //
    // Isso é ruim de dois jeitos, e o segundo é pior: o cliente fica olhando
    // um botão girando e conclui que travou (e clica de novo); e qualquer
    // tempo-limite no meio do caminho — proxy, navegador, celular que dorme —
    // mata a resposta de uma produção que JÁ ACONTECEU. Ele não vê confirmação
    // nenhuma de uma coisa que a casa fez inteira e cobrou.
    //
    // `produzirAgora: false` faz `aprovarDirecao` gravar `directionApprovedAt`,
    // deixar o projeto em `executionStatus: "pending"` e avisar o cliente — que
    // é o que ele precisa saber AGORA. A produção sai logo depois, sem `await`.
    //
    // E o `void` não é a única garantia, de propósito: `retomarProducao()` no
    // despertador já varre exatamente `directionApprovedAt != null` +
    // `executionStatus: "pending"`. Se este processo morrer no meio, o relógio
    // pega o projeto na batida seguinte. Promessa solta sozinha seria esperança;
    // com a rede do relógio atrás, é resposta cedo com trabalho garantido.
    const r = await aprovarDirecao(projeto.id, { produzirAgora: false });
    if (r.ok) {
      void runProjectExecution(projeto.id).catch((e) => {
        // Nunca derruba a resposta já enviada. O relógio retoma na próxima
        // batida — este log é só para o motivo não sumir.
        console.error(`[portal/esteira] produção de ${projeto.id} falhou fora da requisição:`,
          e instanceof Error ? e.message : e);
      });
    }
    return NextResponse.json({ ok: r.ok, mensagem: r.ok ? "Direção aprovada. A produção já começou." : r.erro },
      { status: r.ok ? 200 : 409 });
  }

  if (body.decisao === "aprovar_pacote") {
    // Token de portal validado ⇒ a decisão é COMPROVADAMENTE do cliente, e o
    // carimbo tem de dizer isso (`client:<nome>`). Ver `nomeDoClienteDoToken`.
    const r = await aprovarPacote(projeto.id, { tipo: "cliente", nome: await nomeDoClienteDoToken(token) });
    return NextResponse.json({ ok: r.ok, mensagem: r.ok ? "Aprovado! Vamos colocar tudo no ar." : r.erro },
      { status: r.ok ? 200 : 409 });
  }

  return NextResponse.json({ error: "decisão inválida — use aprovar_direcao ou aprovar_pacote" }, { status: 400 });
}

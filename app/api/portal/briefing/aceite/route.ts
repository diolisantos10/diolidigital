// POST /api/portal/briefing/aceite — o cliente aceita a proposta do briefing.
//
// ═══ A PERGUNTA DO CURSOGRAMA QUE NINGUÉM PODIA RESPONDER ════════════════════
//
// O fluxo oficial da agência tem UM ponto de decisão depois da precificação:
// "cliente aceitou?". Medido em 24/08/2026: **nada nesta casa movia um briefing
// para fora de `proposal_pending`.** O orçamento era entregue, o pedido ficava
// parado, e a única porta adiante exigia sessão de staff. A pergunta existia no
// desenho e o cliente não tinha onde responder — é a explicação dos zero
// clientes em produção.
//
// Esta rota é a resposta dele. Depois dela, `nascerDoAceite` faz o projeto
// nascer sem ninguém abrir o painel (`lib/agency/esteira/caminho-automatico.ts`).
//
// ═══ AS TRAVAS, TODAS HERDADAS — NENHUMA INVENTADA AQUI ══════════════════════
//
//   1. O dono vem SEMPRE do token (derivação, nunca comparação — regra da casa
//      de 03/08/2026). `clientRequestId` do corpo é conferido contra o cliente
//      do token; id de outro cliente responde 404, nunca 403 — 403 confirmaria
//      que aquele id existe.
//   2. A decisão é UMA. Já aceito devolve o que valeu, sem criar nada de novo:
//      cliente que clica duas vezes no 4G não pode virar dois projetos.
//   3. Recusar é decisão do cliente e fica gravada. Não vira projeto, e não
//      volta para `proposal_pending` — "não" também é resposta.
//
// ⚠️ Esta rota NÃO substitui a rota autenticada de staff. As duas coexistem de
// propósito: esta é o caminho normal do cliente; aquela é a de quem quer decidir
// na mão, e continua recusando intruso exatamente como antes.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { validatePortalAccess } from "@/lib/agency/persistence/portal-access-service";
import { tokenDoPortal } from "@/lib/agency/persistence/portal-cookie";
import { nascerDoAceite, STATUS_ACEITO, ESPERANDO_DECISAO_DA_PROPOSTA } from "@/lib/agency/esteira/caminho-automatico";

export const maxDuration = 300;

const DECISOES = ["aceito", "recusado"] as const;
type Decisao = (typeof DECISOES)[number];

function texto(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let corpo: Record<string, unknown>;
  try {
    corpo = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const token = tokenDoPortal(request, texto(corpo.token) || null);
  if (!token) return NextResponse.json({ error: "token é obrigatório" }, { status: 400 });

  const acesso = await validatePortalAccess(token);
  if (!acesso.valid || !acesso.record) return NextResponse.json({ error: "Acesso negado" }, { status: 403 });

  const decisao = texto(corpo.decisao) as Decisao;
  if (!DECISOES.includes(decisao)) {
    return NextResponse.json({ error: "decisao deve ser 'aceito' ou 'recusado'" }, { status: 400 });
  }

  // ── O DONO VEM DO TOKEN, E AQUI ELE PODE AINDA NÃO SER "CLIENTE" ──────────
  //
  // Medido em 24/08/2026, na primeira volta desta porta: 403 para um aceite
  // legítimo. `resolvePortalClient` deriva o `clientId` — e neste ponto da
  // esteira **o Client ainda não existe**: quem o cria é justamente o projeto
  // que este aceite vai fazer nascer. Exigir cliente aqui era exigir o efeito
  // como condição da causa.
  //
  // O token de portal do briefing é vinculado à SOLICITAÇÃO, e é assim que
  // `/api/portal/esteira` já resolve o dono. Mesma porta, mesma gramática:
  // deriva do token, nunca do corpo.
  const doToken = acesso.record.clientRequestId ?? null;
  const doCliente = acesso.record.clientId ?? null;
  const solicitacao = doToken
    ? await prisma.clientRequestDb.findUnique({
        where: { id: doToken },
        select: { id: true, status: true, businessName: true },
      })
    : doCliente
      ? await prisma.clientRequestDb.findFirst({
          where: { clientId: doCliente },
          orderBy: { createdAt: "desc" },
          select: { id: true, status: true, businessName: true },
        })
      : null;
  if (!solicitacao) return NextResponse.json({ error: "Solicitação não encontrada" }, { status: 404 });

  // O corpo pode NOMEAR a solicitação, mas nunca ESCOLHER outra: quando ele
  // nomeia, tem de bater com a do token. Divergência responde 404 — 403
  // confirmaria que aquele id existe.
  const pedidoId = texto(corpo.clientRequestId);
  if (pedidoId && pedidoId !== solicitacao.id) {
    return NextResponse.json({ error: "Solicitação não encontrada" }, { status: 404 });
  }

  // ── A PORTA SÓ DECIDE O QUE AINDA ESTÁ ABERTO (cliente oculto, 6ª rodada) ─
  //
  // Medido em produção: recusei, a leitura passou a dizer `decidivel: false` e
  // `jaRecusado: true` — e este MESMO endpoint aceitou logo em seguida, criando
  // o projeto. A rota que lê dizia "não há mais o que decidir" e a que escreve
  // decidia assim mesmo. O aviso existia; a trava não.
  //
  // A direção perigosa é a outra: aceitar e depois recusar marcava a
  // solicitação `rejected` com o projeto JÁ CRIADO — possivelmente pago,
  // possivelmente produzindo. Um clique derrubaria no papel um projeto que
  // continua andando de verdade.
  //
  // A lista é a MESMA que a leitura usa (`ESPERANDO_DECISAO_DA_PROPOSTA`), e é
  // por isso que ela saiu de dentro daquela rota: duas listas iguais divergem
  // no primeiro conserto de uma delas.
  //
  // ⚠️ Mudar de ideia NÃO acabou — mudou de porta. 409 com a frase que diz
  // onde: a conversa do portal, com gente do outro lado. Reverter um contrato
  // não é ato de um clique, e nunca foi.
  if (!ESPERANDO_DECISAO_DA_PROPOSTA.includes(solicitacao.status)) {
    return NextResponse.json({
      ok: false,
      jaDecidido: true,
      status: solicitacao.status,
      mensagem:
        solicitacao.status === STATUS_ACEITO
          ? "Esta proposta já foi aceita e o seu projeto já está em andamento. Se você quer mudar alguma coisa, é só escrever na conversa aqui do portal — a equipe responde."
          : "Esta proposta já foi respondida. Se você mudou de ideia, é só escrever na conversa aqui do portal — a equipe retoma com você.",
    }, { status: 409 });
  }

  if (decisao === "recusado") {
    await prisma.clientRequestDb.update({ where: { id: solicitacao.id }, data: { status: "rejected" } });
    return NextResponse.json({ ok: true, decisao, mensagem: "Tudo bem — obrigado por responder." });
  }

  // ── ACEITE ────────────────────────────────────────────────────────────────
  // Grava o aceite ANTES de tentar criar: se a criação morrer no meio, o fato
  // "o cliente aceitou" não pode morrer junto — o relógio retoma daí
  // (`aplicarCaminhoAutomatico`). A esteira não depende do navegador.
  if (solicitacao.status !== STATUS_ACEITO) {
    await prisma.clientRequestDb.update({ where: { id: solicitacao.id }, data: { status: STATUS_ACEITO } });
  }

  const r = await nascerDoAceite(solicitacao.id, "cliente (portal)");
  if (r.ok) {
    return NextResponse.json({
      ok: true, decisao, projetoCriado: !r.jaExistia,
      mensagem: "Aceite registrado! Já montamos o plano do seu projeto — em instantes você recebe a direção para avalizar.",
    });
  }

  // Parou na regra: o aceite ESTÁ gravado e uma pessoa vai olhar. O cliente não
  // recebe o motivo interno — ele recebe a verdade dele, que é "recebemos".
  return NextResponse.json({
    ok: true, decisao, projetoCriado: false, aguardandoPessoa: r.esperaGente,
    mensagem: "Aceite registrado! Nossa equipe vai conferir os últimos detalhes e você recebe o plano em seguida.",
  });
}

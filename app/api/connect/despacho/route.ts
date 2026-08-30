// POST /api/connect/despacho — a porta corporativa do Dioli Connect.
//
// É por aqui que a Control Room aciona o Gerente de Atendimento e SDR da Dioli
// Digital. Fase 2 do Dioli Connect, aprovada pelo CEO em 30/08/2026, com a
// determinação literal:
//
//   "Mantenha o piloto no SDR da Dioli Digital, exclusivamente em homologação,
//    com cliente e dados sintéticos. A D-006 impede operação real, não este
//    teste de recuperação."
//
// ─── POR QUE ESTA ROTA E NÃO `POST /api/sdr/chat` ──────────────────────────
//
// `app/api/sdr/chat/route.ts` é hoje a única porta HTTP que fala com o SDR, e
// ela gasta CHAVE DE IA PAGA em todo turno (é a "porta da rua" com teto de
// gasto próprio). Está proibida neste trabalho. O caminho legítimo é o executor
// por ficha (`lib/agency/execucao-v2/executor.ts`), que roda sem credencial —
// e que até agora não tinha porta HTTP nenhuma. Esta rota é essa porta.
//
// ─── AS QUATRO TRAVAS, NA ORDEM EM QUE ELAS FECHAM ─────────────────────────
//
// 1. SEGREDO. `Bearer` conferido em TEMPO CONSTANTE (`segredoConfere`, o mesmo
//    helper de `v2/assistido`, `pm-command` e `avisos-de-orcamento`). Sem
//    segredo configurado no ambiente a porta responde **503 e não abre** — ela
//    nunca "abre por omissão", que é o modo de falha clássico de porta
//    protegida por variável de ambiente esquecida. Com segredo configurado e
//    cabeçalho errado, 401.
//    NÃO existe caminho por sessão/cookie aqui de propósito: quem chama é
//    máquina (a Control Room), não navegador — e sem cookie não há CSRF a
//    barrar nem sessão a sequestrar.
//
// 2. MODO e 3. SINTÉTICO. `modo: "homologacao"` e `sintetico: true`,
//    literais, sem padrão. Ver `lib/agency/connect/contrato.ts`.
//
// 4. CARIMBO. O nome do cliente tem que carregar `[TESTE]`. Nenhum negócio
//    real se chama assim; com esta trava, nome de cliente real não atravessa.
//
// ─── E A TRAVA CENTRAL, QUE NÃO É DE ENTRADA E SIM DE SAÍDA ────────────────
//
// "O despachante disse ok é proibido como prova. Quem executou é que carimba."
// Esta rota nunca responde sucesso por ter conseguido chamar alguém: ela
// devolve `executado` só quando a linha de `ExecucaoV2` volta LIDA do banco,
// com início, fim e artefato. Tudo o que não é isso e não é um "não" nomeado
// sai como `nao_verificavel`. Ver `lib/agency/connect/despacho.ts`.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { segredoConfere } from "@/lib/security/crypto";
import { PERFIL_DO_PAPEL } from "@/lib/agency/roles";
import { armazemDoConnectNoBanco } from "@/lib/agency/connect/armazem-prisma";
import { conferirPedido, type PedidoDeDespacho } from "@/lib/agency/connect/contrato";
import { despachar } from "@/lib/agency/connect/despacho";

// O executor tem timeout por ficha (20 min na ficha do gerente). A janela da
// rota acompanha a de `v2/assistido` — 300s é o teto da plataforma.
export const maxDuration = 300;

/**
 * O segredo desta porta. `CONNECT_SECRET` primeiro; `PILOTO_SECRET` como o
 * segredo de operação que a sala de controle já usa em `v2/assistido`.
 *
 * `CRON_SECRET` fica DE FORA de propósito: ele é o segredo do relógio da casa,
 * conhecido pelo agendador; uma porta corporativa que aceita o segredo do cron
 * herda todo o raio de alcance dele sem ninguém ter decidido isso.
 */
function segredoDaPorta(): string | null {
  return process.env.CONNECT_SECRET?.trim() || process.env.PILOTO_SECRET?.trim() || null;
}

function autenticar(request: NextRequest): NextResponse | null {
  const segredo = segredoDaPorta();
  if (!segredo) {
    // 503, não 401: a porta não está protegida — está DESLIGADA. Dizer "não
    // autorizado" aqui esconderia do operador que falta configuração.
    return NextResponse.json(
      {
        estado: "recusado",
        motivo:
          "porta fechada: nenhum segredo configurado (CONNECT_SECRET ou PILOTO_SECRET). " +
          "Sem segredo esta porta não abre — ela nunca abre por omissão.",
      },
      { status: 503 },
    );
  }
  const cabecalho = request.headers.get("authorization") ?? "";
  const recebido = cabecalho.toLowerCase().startsWith("bearer ") ? cabecalho.slice(7).trim() : null;
  if (!segredoConfere(recebido, segredo)) {
    return NextResponse.json({ estado: "recusado", motivo: "segredo inválido" }, { status: 401 });
  }
  return null;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const barrado = autenticar(request);
  if (barrado) return barrado;

  let corpo: PedidoDeDespacho;
  try {
    corpo = (await request.json()) as PedidoDeDespacho;
  } catch {
    return NextResponse.json({ estado: "recusado", motivo: "JSON inválido" }, { status: 400 });
  }

  const conferencia = conferirPedido(corpo ?? {});
  if (!conferencia.ok) {
    return NextResponse.json({ estado: "recusado", motivo: conferencia.motivo }, { status: 400 });
  }

  const resultado = await despachar(conferencia.pedido, {
    armazem: armazemDoConnectNoBanco(prisma),
    // Autoridade total: quem atravessou o segredo desta porta É a direção da
    // casa. O recorte fino por departamento tem teste próprio (capacidades).
    perfil: PERFIL_DO_PAPEL.diretor,
    agora: () => new Date(),
  });

  // O código HTTP acompanha o estado, e `nao_verificavel` JAMAIS é 2xx:
  //   executado       → 200
  //   recusado        → 422 (o pedido chegou inteiro; a regra é que disse não)
  //   nao_verificavel → 502 (o acionamento não se completou — não é sucesso)
  const status = resultado.estado === "executado" ? 200 : resultado.estado === "recusado" ? 422 : 502;
  return NextResponse.json(resultado, { status });
}

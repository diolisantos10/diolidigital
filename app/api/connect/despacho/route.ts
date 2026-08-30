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
// ─── AS CINCO TRAVAS, NA ORDEM EM QUE ELAS FECHAM ──────────────────────────
//
// 1. SEGREDO PRÓPRIO E ÚNICO. `Bearer` conferido em TEMPO CONSTANTE
//    (`segredoConfere`, o mesmo helper de `v2/assistido`, `pm-command` e
//    `avisos-de-orcamento`), contra `CONNECT_SECRET` **e mais nada**. Sem ele
//    configurado a porta responde **503 e permanece fechada** — não cai para
//    `PILOTO_SECRET` (o encosto que o CEO mandou tirar em 30/08/2026) nem para
//    nenhum outro segredo da casa. Com segredo configurado e cabeçalho errado,
//    401.
//    NÃO existe caminho por sessão/cookie aqui de propósito: quem chama é
//    máquina (a Control Room), não navegador — e sem cookie não há CSRF a
//    barrar nem sessão a sequestrar.
//
// 2. MODO e 3. SINTÉTICO. `modo: "homologacao"` e `sintetico: true`,
//    literais, sem padrão. Ver `lib/agency/connect/contrato.ts`.
//
// 4. A FUNÇÃO É UMA LISTA DE UMA. Só `manager-atendimento` atravessa; qualquer
//    outra ficha é recusada **com o nome pedido no motivo**.
//
// 5. ⭐ O CLIENTE NÃO VEM DE QUEM CHAMA. `cliente` e `clienteId` deixaram de ser
//    entrada: mandá-los é recusa. O gateway resolve sozinho, no banco, o
//    cliente sintético de homologação, conferindo na linha lida o carimbo
//    `[TESTE]` e o domínio `.invalid`. Sem cliente sintético plantado, a porta
//    recusa em vez de inventar um. Ver
//    `lib/agency/connect/cliente-de-homologacao.ts`.
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
 * O SEGREDO DESTA PORTA É UM SÓ: `CONNECT_SECRET`.
 *
 * Até 30/08/2026 esta função também aceitava `PILOTO_SECRET` como encosto — e o
 * CEO mandou tirar, com a razão dita em uma frase: **segredo de outra finalidade
 * não abre porta corporativa.**
 *
 * O encosto parecia conveniência e era o contrário. `PILOTO_SECRET` é o segredo
 * do piloto interno, que já abre `v2/assistido` e a rota de diagnóstico: quem o
 * tivesse por qualquer daqueles motivos ganhava, de graça e sem ninguém decidir,
 * a porta pela qual a Control Room aciona agente deste produto. O raio de
 * alcance de um segredo tem que ser escolhido, não herdado — é o mesmo
 * raciocínio que já mantinha `CRON_SECRET` de fora.
 *
 * E o efeito colateral que interessa: sem `CONNECT_SECRET` configurado, a porta
 * **permanece fechada**. Ela não cai para o segredo do vizinho, não abre por
 * omissão, não abre por sorte de ambiente. Não tem o segredo dela, não abre.
 */
function segredoDaPorta(): string | null {
  return process.env.CONNECT_SECRET?.trim() || null;
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
          "porta fechada: CONNECT_SECRET não está configurado. Esta porta aceita EXCLUSIVAMENTE o segredo " +
          "dela — não existe encosto em PILOTO_SECRET, em CRON_SECRET nem em nenhum outro, porque segredo de " +
          "outra finalidade não abre porta corporativa. Sem CONNECT_SECRET ela permanece fechada.",
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

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
// 0. TETO DE RITMO, antes de tudo. Vinte tentativas por minuto por IP, no
//    contador que mora no volume. Adivinhar o segredo passa a custar tempo.
//
// 1. SEGREDO PRÓPRIO, ÚNICO E COM PISO. `Bearer` conferido em TEMPO CONSTANTE
//    contra `CONNECT_SECRET` **e mais nada**, e só depois de o segredo cumprir
//    o piso de 16 caracteres (e 5 distintos). Ausente OU abaixo do piso, a
//    porta responde **503 e permanece fechada** — não cai para `PILOTO_SECRET`
//    (o encosto que o CEO mandou tirar em 30/08/2026) nem para nenhum outro
//    segredo da casa. Com segredo válido configurado e cabeçalho errado, 401.
//    A decisão inteira é função pura em `lib/agency/connect/porta.ts`.
//    NÃO existe caminho por sessão/cookie aqui de propósito: quem chama é
//    máquina (a Control Room), não navegador — e sem cookie não há CSRF a
//    barrar nem sessão a sequestrar.
//
// 6. ⭐ O FIO TAMBÉM NÃO VEM DE QUEM CHAMA. `correlationId` só é aceito no
//    formato que o próprio gateway emite; qualquer outro é recusa. Um fio de
//    fora deixaria a homologação LER e ESCREVER dentro da conversa de outro
//    cliente. Ver `contrato.ts` e a conferência de posse em `despacho.ts`.
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
import { consumirVaga } from "@/lib/security/limite-no-banco";
import { clientIp } from "@/lib/security/rate-limit";
import { PERFIL_DO_PAPEL } from "@/lib/agency/roles";
import { armazemDoConnectNoBanco } from "@/lib/agency/connect/armazem-prisma";
import { conferirPedido, type PedidoDeDespacho } from "@/lib/agency/connect/contrato";
import { despachar } from "@/lib/agency/connect/despacho";
import {
  BALDE_DA_PORTA,
  JANELA_DO_BALDE_MS,
  TENTATIVAS_POR_JANELA,
  conferirSegredo,
} from "@/lib/agency/connect/porta";

// O executor tem timeout por ficha (20 min na ficha do gerente). A janela da
// rota acompanha a de `v2/assistido` — 300s é o teto da plataforma.
export const maxDuration = 300;

/**
 * O SEGREDO DESTA PORTA É UM SÓ: `CONNECT_SECRET` — E ELE TEM PISO.
 *
 * Até 30/08/2026 esta função também aceitava `PILOTO_SECRET` como encosto — e o
 * CEO mandou tirar, com a razão dita em uma frase: **segredo de outra finalidade
 * não abre porta corporativa.** O encosto parecia conveniência e era o
 * contrário: quem tivesse o segredo do piloto interno por qualquer motivo
 * ganhava, de graça e sem ninguém decidir, a porta pela qual a Control Room
 * aciona agente deste produto. O raio de alcance de um segredo tem que ser
 * escolhido, não herdado.
 *
 * ⭐ E o que faltava, medido por auditoria independente no mesmo dia: a porta
 * abria com `CONNECT_SECRET="x"`. O comentário que ficava aqui prometia que ela
 * "permanece fechada"; a promessa não estava no código. A decisão inteira mudou
 * de casa — vive agora em `lib/agency/connect/porta.ts`, em função PURA, com o
 * piso de tamanho do molde da casa (o mesmo do irmão Foocci) e com o piso
 * vizinho de repetição. Esta rota voltou a ser casca: ela não lê variável de
 * ambiente nenhuma, e é por isso que este arquivo não tem mais um `process.env`.
 */
async function autenticar(request: NextRequest): Promise<NextResponse | null> {
  const guarda = conferirSegredo(request.headers.get("authorization"));
  if (!guarda.ok) {
    // 503 quando a porta está DESLIGADA (segredo ausente ou abaixo do piso),
    // 401 quando ela está ligada e o cabeçalho está errado. Dizer "não
    // autorizado" no primeiro caso esconderia do operador que falta configurar.
    return NextResponse.json({ estado: "recusado", motivo: guarda.motivo }, { status: guarda.status });
  }
  return null;
}

/**
 * ⭐ O TETO DE RITMO — o agravante que a auditoria anotou junto do A-1.
 *
 * O piso de dezesseis caracteres torna o segredo caro POR TENTATIVA; sem teto
 * de ritmo, o atacante compra as tentativas no atacado e o piso vira uma conta
 * de tempo em vez de uma trava. As duas metades são a mesma trava, e faltava
 * uma.
 *
 * Ele vem ANTES da conferência do segredo de propósito: um freio que só conta
 * as tentativas BEM-SUCEDIDAS não freia adivinhação nenhuma. O balde é por IP,
 * e o mecanismo é o da casa (contador no volume, que atravessa deploy e
 * réplica) — o `Map` em memória seria pior que nada aqui, porque qualquer push
 * de qualquer agente desta casa devolveria a cota inteira ao atacante.
 *
 * Fail-closed herdado do mecanismo: contador que não responde nega. Esta rota
 * precisa do banco para tudo o que ela faz, então "banco fora" não é um mundo
 * em que ela funcionaria.
 */
async function freioDeRitmo(request: NextRequest): Promise<NextResponse | null> {
  const r = await consumirVaga(
    `${BALDE_DA_PORTA}:${clientIp(request)}`,
    TENTATIVAS_POR_JANELA,
    JANELA_DO_BALDE_MS,
  );
  if (r.liberado) return null;
  return NextResponse.json(
    {
      estado: "recusado",
      motivo:
        r.motivo === "indisponivel"
          ? "o contador de ritmo não respondeu, e esta porta nega por precaução — contador que não conta não autoriza."
          : `ritmo excedido nesta porta: no máximo ${TENTATIVAS_POR_JANELA} tentativas por minuto. ` +
            "O teto existe para que adivinhar o segredo custe tempo, e não só sorte.",
    },
    { status: r.motivo === "indisponivel" ? 503 : 429, headers: { "Retry-After": String(r.esperarSegundos) } },
  );
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const rapidoDemais = await freioDeRitmo(request);
  if (rapidoDemais) return rapidoDemais;

  const barrado = await autenticar(request);
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

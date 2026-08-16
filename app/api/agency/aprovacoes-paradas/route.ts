// A APROVAÇÃO QUE NINGUÉM DECIDIU, CONTADA — somente leitura.
//
// Esta rota é o segundo chamador que faltava do mesmo defeito:
// `lib/agency/esteira/aprovacao-parada.ts` estava escrito, completo e testado, e
// o único importador do repositório inteiro era o próprio teste. Peça verde,
// junta rompida.
//
// **O relógio já conta e faz `log` — e log do Railway não é tela.** Fila que só
// existe se alguém lembrar de abrir o console é a mesma fila morta de sempre,
// com um arquivo bonito ao lado. É a lição literal da porta da frente, de
// 16/08/2026, uma camada acima.
//
// O que ela devolve, e por que são DOIS números e não um:
//   • `paradas` — o cliente ainda não decidiu. A bola é dele; cobrar é legítimo.
//   • `bolaConosco` — ele PERGUNTOU e a agência não respondeu. **A bola é
//     NOSSA**, o prazo dele está pausado, e esta é a urgente.
// Somados, viram um alarme que cobra o cliente pelo atraso da própria casa.
//
// Nada é decidido, nada é escrito, ninguém é avisado. Ver o cabeçalho de
// `aprovacao-parada.ts`: aprovar no lugar do cliente é falsificar o
// consentimento dele, e é o único erro daquela lista que não tem desfazer.

import { NextResponse } from "next/server";
import { exigirApiInterna } from "@/lib/agency/organizacao/guarda";
import { prisma } from "@/lib/db/client";
import {
  aprovacoesParadas,
  resumoDasAprovacoes,
  DIAS_ATE_VIRAR_ABANDONO,
} from "@/lib/agency/esteira/aprovacao-parada";

export async function GET(): Promise<NextResponse> {
  // A permissão vem da MESMA linha do inventário que decide a tela — e não de
  // um `requireSession()` largo, que foi o furo consertado em 16/08 nas duas
  // rotas da porta da frente.
  const { acesso, erro } = await exigirApiInterna("/agency/approvals");
  if (erro) return erro;
  const { session } = acesso;

  try {
    const agora = new Date();
    const [resumo, fila, semDono] = await Promise.all([
      resumoDasAprovacoes(session.workspaceId, agora),
      aprovacoesParadas(session.workspaceId, agora),
      // O card pendente sem `clientRequestId` E sem `clientId` fica de fora da
      // fila por workspace — corretamente, porque varrer órfão de outro
      // inquilino é vazamento entre clientes. Mas "fora da conta" não é "não
      // existe": é peça pronta esperando decisão que nenhuma tela mostra.
      prisma.approvalRequest.count({
        where: { status: "pending", clientRequestId: null, clientId: null },
      }),
    ]);

    return NextResponse.json({
      medido: true,
      resumo,
      // A dívida NOSSA em cima e, dentro de cada grupo, o mais antigo primeiro.
      // A fila que se lê de cima para baixo tem de começar pelo que é culpa da
      // casa — ler a cobrança do cliente antes da própria é ler ao contrário.
      fila: [...fila].sort(
        (a, b) => Number(b.bolaConosco) - Number(a.bolaConosco) || b.diasParado - a.diasParado,
      ),
      semDono,
      diasAteVirarAbandono: DIAS_ATE_VIRAR_ABANDONO,
    });
  } catch (e) {
    console.error("[agency/aprovacoes-paradas] GET error", e);
    // Falha de leitura NÃO vira fila vazia. "Ninguém esperando decisão" e "não
    // consegui olhar" são fatos opostos, e o segundo com cara do primeiro é
    // como esta fila ficou invisível desde sempre.
    return NextResponse.json(
      { medido: false, motivo: "o banco não respondeu — esta fila NÃO é zero, é desconhecida" },
      { status: 503 },
    );
  }
}

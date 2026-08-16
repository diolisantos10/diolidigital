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
  lerAsAprovacoesParadas,
  DIAS_ATE_VIRAR_ABANDONO,
} from "@/lib/agency/esteira/aprovacao-parada";
import { todosOsInquilinos } from "@/lib/agency/varredura/inquilinos";

export async function GET(): Promise<NextResponse> {
  // A permissão vem da MESMA linha do inventário que decide a tela — e não de
  // um `requireSession()` largo, que foi o furo consertado em 16/08 nas duas
  // rotas da porta da frente.
  const { acesso, erro } = await exigirApiInterna("/agency/approvals");
  if (erro) return erro;
  const { session } = acesso;

  try {
    const agora = new Date();
    // UMA leitura, uma regra: `lerAsAprovacoesParadas` devolve o resumo e a
    // fila da mesma consulta. Chamar as duas funções em paralelo, como esta
    // rota fazia, lia o banco duas vezes para responder uma pergunta — e virava
    // quatro leituras quando a contagem ganhou consulta própria.
    const { resumo, fila } = await lerAsAprovacoesParadas(session.workspaceId, agora);

    // ── O ÓRFÃO, E POR QUE ELE NÃO É SIMPLESMENTE CONTADO (16/08) ──────────
    //
    // O card pendente sem `clientRequestId` E sem `clientId` fica de fora da
    // fila por workspace — corretamente, porque varrer órfão de outro inquilino
    // é vazamento entre clientes. Mas "fora da conta" não é "não existe": é peça
    // pronta esperando decisão que nenhuma tela mostra.
    //
    // 🔴 A versão anterior contava **o banco inteiro** e devolvia o número para
    // qualquer inquilino, três linhas abaixo de um comentário que dizia que
    // varrer órfão alheio é vazamento. Com dois inquilinos, o A leria o órfão do
    // B como se fosse dele.
    //
    // Órfão não tem inquilino **por definição** — `workspaceId` é justamente o
    // que falta —, então não existe recorte correto. O que existe é uma
    // pergunta honesta: **a casa tem um inquilino só?** Se sim, "o banco
    // inteiro" e "este inquilino" são o mesmo conjunto e o número vale. Se não,
    // o número é `null` **com o motivo**, e não zero: "não dá para atribuir" e
    // "não há nenhum" são fatos opostos.
    const inquilinos = await todosOsInquilinos();
    const semDono = inquilinos.length <= 1
      ? await prisma.approvalRequest.count({
          where: { status: "pending", clientRequestId: null, clientId: null },
        })
      : null;

    return NextResponse.json({
      medido: true,
      resumo,
      semDono,
      motivoDoSemDono: semDono === null
        ? "há mais de um inquilino nesta instalação, e card órfão não tem dono — atribuí-lo a qualquer um seria vazamento entre clientes"
        : null,
      // A dívida NOSSA em cima e, dentro de cada grupo, o mais antigo primeiro.
      // A fila que se lê de cima para baixo tem de começar pelo que é culpa da
      // casa — ler a cobrança do cliente antes da própria é ler ao contrário.
      fila: [...fila].sort(
        (a, b) => Number(b.bolaConosco) - Number(a.bolaConosco) || b.diasParado - a.diasParado,
      ),
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

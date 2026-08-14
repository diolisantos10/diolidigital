// POST /api/admin/cards-de-aprovacao — ABRIR O PEDIDO PARA O CLIENTE DECIDIR.
//
// ── ELA NÃO APROVA NADA. É A PRIMEIRA COISA A DIZER ─────────────────────────
//
// Esta rota **abre o card** e para aí. O registro nasce `status: "pending"`,
// com `reviewedBy` e `reviewedAt` NULOS. Quem os escreve é o clique do CLIENTE
// em `/api/portal/approvals`, com a posse derivada do token do portal dele —
// e é só essa grafia (`client:<nome>`) que a trava de publicação aceita
// (`lib/agency/esteira/aprovacao-da-peca.ts`).
//
// Dito de outro jeito: esta rota é o convite, não o sim. Se um dia ela gravar
// "approved", terá virado o carimbo da agência em nome do cliente que a ordem do
// CEO de 14/08/2026 proíbe — *"quem libera, quem aprova, são os clientes"*.
//
// ── POR QUE ELA EXISTE (14/08/2026) ─────────────────────────────────────────
//
// O caminho normal é `POST /api/social-posts/aprovacao`, e ele exige **sessão de
// master/PM**. No piloto do CityJobs as 6 peças estavam prontas, convertidas para
// JPEG, agendadas — e barradas na trava de aprovação, sem card nenhum aberto. Sem
// este botão, abrir o card exigiria que alguém colasse credencial num terminal,
// que é exatamente o caminho que esta casa proíbe.
//
// Mesmo padrão de `/api/admin/recompor-pecas`, pelo mesmo motivo: um workflow de
// `workflow_dispatch` aperta, o segredo mora nos secrets do repositório e no
// Railway, e ninguém digita nada.
//
// ── AUTENTICAÇÃO E VERBO ────────────────────────────────────────────────────
//
// `Authorization: Bearer <CRON_SECRET>`, comparação em tempo constante.
// **Segredo ausente do ambiente → 503, porta FECHADA, nunca aberta.**
// **POST, não GET**: GET é o verbo que proxy, pré-carregador e histórico tratam
// como inofensivo, e isto escreve no que o cliente vai ler.
//
// ── LEITURA PURA POR PADRÃO ─────────────────────────────────────────────────
//
// Sem `?criar=1` ela **mede e não grava**: diz quantas peças existem, quais já
// têm card, quais o cliente já aprovou e quais ficariam de fora — com o MOTIVO
// de cada uma. É como se confirma o estado de produção sem sessão e sem risco,
// e foi para isso que o modo existe. Criar é ato explícito, igual a `emitir=1`
// em `/api/admin/links-do-portal`.
//
// ── IDEMPOTENTE, E PELO DADO ────────────────────────────────────────────────
//
// Peça que já está num card PENDENTE é excluída pela leitura do próprio banco,
// não por marca gravada em algum campo. Apertar o botão duas vezes não abre um
// segundo card: a segunda passada volta `nada_a_criar`, com o placar dizendo por
// quê. Peça que o cliente JÁ aprovou também não volta para a fila.
//
// ── RESTRITA AO QUE FAZ SENTIDO ─────────────────────────────────────────────
//
//   • **Um cliente por chamada**, informado pelo nome. Nome ambíguo RECUSA em
//     vez de escolher: abrir o card errado mostra o trabalho de um cliente a
//     outro, e isso não se desfaz depois que ele viu.
//   • **Só peça que ainda vai ao ar** — o padrão é `scheduled`, o único estado
//     que o relógio lê. Publicada nunca entra; a decisão chegaria depois do fato.
//   • **Só peça compartilhada.** Peça "interna" fica de fora, fail-closed.
//
// ── O QUE ELA NÃO FAZ ───────────────────────────────────────────────────────
//
//   • **Não publica.** Nenhuma chamada a Meta, Google ou TikTok. Não lê
//     `PUBLICACAO_ORGANICA` e não toca a data marcada de peça nenhuma.
//   • **Não aprova** (ver acima).
//   • **Não afrouxa trava.** Ela não muda o que a publicação exige; ela só cria o
//     registro que faltava para o cliente poder dizer sim.

import { NextRequest, NextResponse } from "next/server";
import { segredoConfere } from "@/lib/security/crypto";
import { abrirCardsDeAprovacao } from "@/lib/agency/esteira/cards-de-aprovacao";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    // Porta FECHADA. Sem segredo no ambiente não há como distinguir quem aperta
    // o botão de qualquer pessoa na internet — e isto escreve no portal de um
    // cliente pagante.
    return NextResponse.json(
      { error: "Rota administrativa não configurada — defina CRON_SECRET" },
      { status: 503 },
    );
  }
  const cabecalho = request.headers.get("authorization");
  const token = cabecalho?.startsWith("Bearer ") ? cabecalho.slice(7) : null;
  if (!segredoConfere(token, cronSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const cliente = (params.get("cliente") ?? "").trim();
  if (!cliente) {
    return NextResponse.json(
      {
        error:
          "Informe ?cliente=<nome>. Esta rota abre card para UM cliente por chamada, de propósito: " +
          "uma passada que abre pedido de aprovação para a casa inteira é o problema se disfarçando " +
          "de conserto.",
      },
      { status: 400 },
    );
  }

  // Criar é ação EXPLÍCITA. Qualquer coisa diferente de "1"/"true" é não.
  const pedidoDeCriacao = (params.get("criar") ?? "").toLowerCase();
  const criar = pedidoDeCriacao === "1" || pedidoDeCriacao === "true";

  const estados = (params.get("estados") ?? "").split(",").map((s) => s.trim()).filter(Boolean);

  const relatorio = await abrirCardsDeAprovacao({ cliente, criar, estados }).catch((e) => ({
    erro: e instanceof Error ? e.message : "falha ao ler o banco",
  }));

  if ("erro" in relatorio) {
    // Banco fora do ar NÃO vira "nenhuma peça precisa de card": isso leria como
    // uma afirmação, e ausência de informação não é informação (guardrail 1).
    return NextResponse.json({ error: relatorio.erro }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    ...relatorio,
    // Dito com todas as letras na resposta, para quem lê o JSON não precisar
    // reler o cabeçalho da rota para saber o que acabou de acontecer.
    aviso: criar
      ? "CRIAÇÃO LIGADA. O card nasceu PENDENTE — nada foi aprovado. Quem decide agora é o cliente, " +
        "no portal dele."
      : "Leitura pura: nada foi gravado. Use ?criar=1 para abrir o pedido.",
  });
}

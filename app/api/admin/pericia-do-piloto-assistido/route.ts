// GET /api/admin/pericia-do-piloto-assistido — a prova dos dois defeitos de
// 15/08/2026, lida de dentro da produção. SOMENTE LEITURA.
//
// ── POR QUE ESTA ROTA EXISTE ────────────────────────────────────────────────
//
// O merge do piloto assistido (a9bd36c, produção às 20:23 de 15/08/2026)
// produziu dois defeitos, e os dois têm uma pergunta de fato pendurada que o
// código consertado NÃO responde:
//
//   1. o card de aprovação mostrou ao cliente o custo em dólar de cada agente —
//      **quantos cards assim existem, e algum cliente chegou a abrir o portal
//      depois de o card nascer?**
//   2. o City Jobs virou dois clientes — **quais linhas duplicadas existem hoje
//      e o que está pendurado em cada uma?**
//
// Nenhuma das duas se responde daqui de fora: o banco de produção é um SQLite
// dentro de um volume no contêiner do Railway. Mesmo motivo, mesmo formato e
// mesma autenticação de `app/api/admin/links-do-portal` — a leitura roda ONDE O
// BANCO ESTÁ.
//
// ── ELA NÃO CONSERTA NADA, E ISSO É DE PROPÓSITO ────────────────────────────
//
// Não esconde card, não funde cliente, não apaga linha. Fundir cliente é
// irreversível — projeto, aprovação decidida e conversa do portal ficam
// pendurados num dos dois ids. Quem decide isso é o dono do negócio, com a
// lista na mão; esta rota produz a lista.
//
// ── AUTENTICAÇÃO ───────────────────────────────────────────────────────────
//
// `Authorization: Bearer <CRON_SECRET>`. Segredo ausente do ambiente → porta
// FECHADA (503), nunca aberta: a resposta contém nome de cliente e trechos de
// card, e uma rota que se abre sozinha quando a variável some é uma rota sem
// trava nenhuma.
//
// Uso:
//   curl -H "Authorization: Bearer $CRON_SECRET" \
//     https://www.diolidigital.com.br/api/admin/pericia-do-piloto-assistido

import { NextRequest, NextResponse } from "next/server";
import { segredoConfere } from "@/lib/security/crypto";
import { periciaDoVazamento } from "@/lib/agency/esteira/pericia-do-vazamento";
import { clientesDuplicados } from "@/lib/agency/clients/duplicados";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
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

  const [vazamento, duplicados] = await Promise.all([periciaDoVazamento(), clientesDuplicados()]);

  return NextResponse.json({
    vazamento: {
      cardsVisiveisAoCliente: vazamento.total,
      cardsInternos: vazamento.totalInternos,
      // O veredito por cliente é a resposta à pergunta "alguém viu?". `viu:
      // null` = não há registro de acesso, e então NÃO HÁ COMO SABER — a rota
      // diz isso com todas as letras em vez de arredondar para "provavelmente
      // não".
      porCliente: vazamento.porCliente,
      cards: vazamento.cards,
      limiteDaProva:
        "PortalAccess.lastAccessedAt prova que o portal foi ABERTO depois do card, não que a aba " +
        "Aprovações foi lida. viu=null significa que não há registro de acesso — não há como saber.",
    },
    duplicados: {
      grupos: duplicados.length,
      detalhe: duplicados,
      observacao:
        "Somente leitura. A fusão é decisão do dono do negócio: apagar cliente com trabalho " +
        "pendurado é irreversível.",
    },
  });
}

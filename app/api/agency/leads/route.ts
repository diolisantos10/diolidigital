// A FILA DA PORTA DA FRENTE — o que entrou pelo briefing público e ainda não
// virou nada. Somente leitura.
//
// Existe porque, até 08/08/2026, esta agência não tinha uma tela que
// respondesse "quem me procurou e ainda não teve resposta?". A caixa de entrada
// era uma aba dentro de `/agency/requests` alimentada pelo **store do
// navegador** — quem abrisse noutro computador não via nada, e o que estava no
// banco de produção não aparecia. Três leads ficaram 51, 29 e 28 dias assim.
//
// Nenhuma escrita, nenhuma chamada de IA, nenhum contato inventado.

import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/api-guard";
import { listClientRequests } from "@/lib/agency/persistence/client-request-service";
import { montarDossie } from "@/lib/agency/comercial/dossie-do-lead";
import { agruparPorProspect } from "@/lib/agency/comercial/chave-do-prospect";

export async function GET(): Promise<NextResponse> {
  const { session, error } = await requireSession();
  if (error) return error;

  try {
    const registros = await listClientRequests({
      workspaceId: session.workspaceId,
      status: "new,lead_incompleto",
      limit: 200,
    });

    const agora = new Date();

    // ── QUEM JÁ ESCREVEU ANTES (16/08/2026) ────────────────────────────────
    //
    // Pergunta do CEO: *"se entrar um cliente com o mesmo e-mail e fizer cinco
    // briefings um atrás do outro, o que acontece com o sistema?"*. Nesta tela,
    // acontecia o pior desfecho possível para quem opera: **cinco cartões
    // anônimos e indistinguíveis**, como se fossem cinco prospects diferentes.
    //
    // O agrupamento é feito aqui, e não dentro de `montarDossie`, por um motivo
    // simples: só quem enxerga a FILA INTEIRA sabe que uma linha é a terceira.
    // Um dossiê olha uma linha só.
    //
    // ⚠️ **Marca, nunca funde, e nada some.** Os cinco briefings continuam na
    // resposta, inteiros, cada um com o seu texto — o que muda é que cada um
    // agora sabe dizer "3ª vez deste contato" e apontar os irmãos. Fundir seria
    // escolher, por conta própria, entre "reenviou" e "pediu outro projeto" —
    // e a segunda hipótese é um cliente contratando trabalho novo.
    const repeticoes = agruparPorProspect(
      registros.map((r) => ({
        id: r.id,
        createdAt: r.createdAt,
        briefingJson: r.briefingJson,
        sdrHandoffJson: r.sdrHandoffJson,
      })),
    );

    const dossies = registros
      .map((r) =>
        montarDossie(
          {
            id: r.id,
            businessName: r.businessName,
            segment: r.segment,
            status: r.status,
            createdAt: r.createdAt,
            services: r.services,
            objectives: r.objectives,
            rawContext: r.rawContext,
            briefingJson: r.briefingJson,
            sdrHandoffJson: r.sdrHandoffJson,
          },
          agora,
          repeticoes.get(r.id) ?? null,
        ),
      )
      // O mais velho primeiro: a fila que se lê de cima para baixo é a fila em
      // que os 51 dias aparecem na primeira linha, não na última.
      .sort((a, b) => b.diasParado - a.diasParado);

    return NextResponse.json({
      medido: true,
      total: dossies.length,
      semContato: dossies.filter((d) => !d.contato.temComoFalar).length,
      /** Quantos cartões desta fila são repetição de um contato que já escreveu.
       *  É o termômetro da pergunta do CEO de 16/08: se este número crescer, a
       *  agência está recebendo o mesmo prospect várias vezes sem responder. */
      repetidos: dossies.filter((d) => (d.repeticao?.vezes ?? 1) > 1).length,
      leads: dossies,
    });
  } catch (e) {
    console.error("[agency/leads] GET error", e);
    // Falha de leitura NÃO vira lista vazia: "não há lead nenhum" e "não
    // consegui olhar" são fatos opostos, e o segundo com cara do primeiro é o
    // que faz a fila voltar a ser invisível.
    return NextResponse.json(
      { medido: false, motivo: "o banco não respondeu — esta lista NÃO é zero, é desconhecida" },
      { status: 503 },
    );
  }
}

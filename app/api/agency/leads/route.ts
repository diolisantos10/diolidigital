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
        ),
      )
      // O mais velho primeiro: a fila que se lê de cima para baixo é a fila em
      // que os 51 dias aparecem na primeira linha, não na última.
      .sort((a, b) => b.diasParado - a.diasParado);

    return NextResponse.json({
      medido: true,
      total: dossies.length,
      semContato: dossies.filter((d) => !d.contato.temComoFalar).length,
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

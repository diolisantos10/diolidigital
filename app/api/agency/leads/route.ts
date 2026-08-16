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

import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/api-guard";
import { listClientRequests } from "@/lib/agency/persistence/client-request-service";
import { montarDossie } from "@/lib/agency/comercial/dossie-do-lead";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { session, error } = await requireSession();
  if (error) return error;

  // `?contato=sim|nao` — o recorte que a COLUNA destravou (16/08/2026). É o que
  // o aviso do orçamento precisa perguntar: "quais destes eu consigo responder?".
  // Sem parâmetro, a fila vem inteira, que continua sendo o padrão.
  //
  // ⚠️ O filtro roda no BANCO e por isso enxerga só o que está na coluna. Está
  // dito na resposta (`filtro.apenasColuna`), porque um recorte que esconde
  // registro antigo sem avisar é como esta fila ficou invisível por sete semanas.
  const pedido = new URL(request.url).searchParams.get("contato");
  const comContato = pedido === "sim" ? true : pedido === "nao" ? false : undefined;

  try {
    const registros = await listClientRequests({
      workspaceId: session.workspaceId,
      status: "new,lead_incompleto",
      limit: 200,
      comContato,
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
            // A coluna primeiro (16/08/2026); o blob continua atrás dela para
            // quem entrou antes de ela existir.
            contatoNome: r.contatoNome,
            contatoEmail: r.contatoEmail,
            contatoWhatsapp: r.contatoWhatsapp,
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
      filtro: comContato === undefined
        ? null
        : { contato: pedido, apenasColuna: true },
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

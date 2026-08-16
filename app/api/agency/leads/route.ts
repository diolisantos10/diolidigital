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
//
// ⚠️ A GUARDA MUDOU EM 16/08/2026, e a rota é anterior a essa data.
// Ela usava `requireSession()` — qualquer pessoa logada da casa. A tela que ela
// serve (`/agency/leads`) é `dono_e_gestao` no inventário de páginas, então
// Design, Social, Tráfego e Tecnologia liam por `curl` o dossiê inteiro (nome,
// segmento, o que a pessoa contou, e-mail e WhatsApp) de quem só falou com a
// porta pública. `exigirApiInterna("/agency/leads")` prende a API à MESMA linha
// que decide a tela.

import { NextResponse } from "next/server";
import { exigirApiInterna } from "@/lib/agency/organizacao/guarda";
import { listClientRequests } from "@/lib/agency/persistence/client-request-service";
import { montarDossie } from "@/lib/agency/comercial/dossie-do-lead";
import { AINDA_NA_PORTA, TETO_DA_LISTA } from "@/lib/agency/comercial/quem-bateu-na-porta";

export async function GET(): Promise<NextResponse> {
  const { acesso, erro } = await exigirApiInterna("/agency/leads");
  if (erro) return erro;
  const { session } = acesso;

  try {
    // ⚠️ O CONJUNTO DE STATUS É O MESMO DA FILA, e isso passou a ser trava em
    // 16/08/2026. Esta rota lia `"new,lead_incompleto"` à mão enquanto a fila
    // (`AINDA_NA_PORTA`) lia outra coisa. Duas listas escritas em dois arquivos
    // sobre a MESMA fila é o defeito nº 2 do incidente do Drive: elas divergem
    // no dia em que alguém consertar só uma — e foi exatamente o que aconteceu,
    // com a tela mostrando cartão de lead que o placar não contava.
    const registros = await listClientRequests({
      workspaceId: session.workspaceId,
      status: [...AINDA_NA_PORTA].join(","),
      limit: TETO_DA_LISTA,
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

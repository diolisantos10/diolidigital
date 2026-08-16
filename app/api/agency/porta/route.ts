// A PORTA DA FRENTE, CONTADA — somente leitura.
//
// Esta rota é o **chamador que faltava**. `lib/agency/comercial/quem-bateu-na-porta.ts`
// estava escrito, completo e testado desde 08/08/2026 e nenhuma linha de
// produção o chamava: existia o alarme e não existia o fio. O briefing do
// CityJobs, entregue pelo próprio CEO, ficou parado sem ninguém saber.
//
// O que ela devolve, e por que são DOIS números e não um:
//   • `esperandoResposta` — dá para falar e ninguém falou. **Cobra a casa.**
//   • `semCaminho` — a pessoa não deixou canal. É buraco de DADO; cobrar alguém
//     por não ter ligado para quem não deixou telefone é cobrar o impossível.
// Somados, viram um alarme que ninguém sabe atender.
//
// Nada é escrito, nada é enviado, ninguém é abordado. Ver o cabeçalho de
// `quem-bateu-na-porta.ts` — e a ordem do CEO de 10/08/2026.

import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/api-guard";
import {
  quemBateuNaPorta,
  resumoDaPorta,
  DIAS_ATE_VIRAR_DESLEIXO,
} from "@/lib/agency/comercial/quem-bateu-na-porta";

export async function GET(): Promise<NextResponse> {
  const { session, error } = await requireSession();
  if (error) return error;

  try {
    const agora = new Date();
    // DUAS leituras, de propósito. A alternativa seria recontar o resumo aqui —
    // uma segunda cópia da mesma regra, que é exatamente o defeito que já deixou
    // duas telas discordando sobre a mesma fila nesta casa. Divergência entre as
    // duas leituras só existiria se alguém preenchesse um briefing no
    // milissegundo entre elas, e some no refresh seguinte; regra duplicada
    // diverge para sempre.
    const [resumo, fila] = await Promise.all([
      resumoDaPorta(session.workspaceId, agora),
      quemBateuNaPorta(session.workspaceId, agora),
    ]);

    return NextResponse.json({
      medido: true,
      resumo,
      // O mais velho em cima: a fila que se lê de cima para baixo é a fila em
      // que os 51 dias aparecem na primeira linha, não na última.
      fila: [...fila].sort((a, b) => b.diasEsperando - a.diasEsperando),
      diasAteVirarDesleixo: DIAS_ATE_VIRAR_DESLEIXO,
    });
  } catch (e) {
    console.error("[agency/porta] GET error", e);
    // Falha de leitura NÃO vira fila vazia. "Não há ninguém esperando" e "não
    // consegui olhar" são fatos opostos — e o segundo com cara do primeiro é
    // exatamente como esta fila ficou invisível por sete semanas.
    return NextResponse.json(
      { medido: false, motivo: "o banco não respondeu — esta fila NÃO é zero, é desconhecida" },
      { status: 503 },
    );
  }
}

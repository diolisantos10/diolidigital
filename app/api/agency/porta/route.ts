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

// ── POR QUE A GUARDA É `exigirApiInterna`, E NÃO `requireSession` (16/08) ──
//
// A primeira versão desta rota usava `requireSession()` — "tem biscoito válido,
// entra". A TELA que ela alimenta é `dono_e_gestao` no inventário
// (`organizacao/paginas.ts`): Atendimento, master, diretor e PM. Com a guarda
// larga, quem fosse de Design, Social, Tráfego ou Tecnologia via a fila inteira
// — nome de negócio, dias de espera e canal de contato — bastando um `curl`.
// O menu escondia; a API servia. É textualmente o defeito que `guarda.ts`
// existe para não deixar acontecer de novo, e ele voltou por descuido de quem
// escreveu esta rota (o PM, em 16/08).
//
// `exigirApiInterna("/agency/leads")` prende a permissão da API à MESMA linha
// do inventário que decide a tela. Muda o `acesso` daquela linha e as duas
// mudam juntas — que é o ponto inteiro de haver uma só tabela.

import { NextResponse } from "next/server";
import { exigirApiInterna } from "@/lib/agency/organizacao/guarda";
import { lerAPorta, DIAS_ATE_VIRAR_DESLEIXO } from "@/lib/agency/comercial/quem-bateu-na-porta";

export async function GET(): Promise<NextResponse> {
  const { acesso, erro } = await exigirApiInterna("/agency/leads");
  if (erro) return erro;
  const { session } = acesso;

  try {
    const agora = new Date();
    // UMA leitura, uma regra. A versão de 16/08 chamava `resumoDaPorta` e
    // `quemBateuNaPorta` em paralelo para não recontar aqui — o argumento
    // estava certo (regra duplicada diverge para sempre) e a solução era
    // `lerAPorta`, que devolve as duas coisas do mesmo `findMany`. Sem isso, a
    // contagem separada da lista teria transformado 2 consultas em 4.
    const { resumo, fila } = await lerAPorta(session.workspaceId, agora);

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

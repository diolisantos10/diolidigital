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
import { listClientRequests, contarIrmaosPorChave } from "@/lib/agency/persistence/client-request-service";
import { montarDossie } from "@/lib/agency/comercial/dossie-do-lead";
import { agruparPorProspect, janelaDaRepeticao } from "@/lib/agency/comercial/chave-do-prospect";

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
    //
    // `businessName`, `services` e `rawContext` vão junto **só para descrever o
    // irmão na tela** — nome de negócio continua proibido como identidade (ver
    // a lei em `chave-do-prospect.ts`). Sem eles, a lista de irmãos saía em id
    // cru de banco, que não responde "é o mesmo pedido ou é outro projeto?".
    //
    // `chaveDoProspect` (16/08/2026): a coluna gravada em `createClientRequest`
    // era escrita e nunca lida — este era o leitor de produção que faltava.
    // `agruparPorProspect` usa a coluna quando ela existe e cai no recálculo em
    // memória (o comportamento de sempre) para as linhas legadas de coluna nula.
    const repeticoes = agruparPorProspect(
      registros.map((r) => ({
        id: r.id,
        createdAt: r.createdAt,
        briefingJson: r.briefingJson,
        sdrHandoffJson: r.sdrHandoffJson,
        businessName: r.businessName,
        services: r.services,
        rawContext: r.rawContext,
        chaveDoProspect: r.chaveDoProspect,
      })),
    );

    // ── A JANELA CONFESSADA (16/08/2026) ────────────────────────────────────
    //
    // `repeticoes` acima só enxerga estas `registros` — no máximo `limit`
    // (200). Um contato que já escreveu 6 vezes, cuja 6ª linha caiu fora
    // dessas 200, contava "5ª vez" aqui — número completo com cara de
    // errado. `limit` continua sendo a janela de EXIBIÇÃO; deixa de ser a
    // fonte da CONTAGEM.
    //
    // A pergunta certa ("quantas vezes este contato escreveu, de verdade?")
    // vai direto ao banco, sem teto, via `contarIrmaosPorChave` — consulta
    // agregada sobre o índice `[workspaceId, chaveDoProspect]`, não uma
    // segunda varredura de 200 linhas.
    const chavesDaJanela = registros.map((r) => r.chaveDoProspect);
    let contagemPorChave = new Map<string, number>();
    let contagemFalhou = false;
    try {
      contagemPorChave = await contarIrmaosPorChave({
        workspaceId: session.workspaceId,
        chaves: chavesDaJanela,
      });
    } catch (e) {
      // Falha de leitura NUNCA vira zero nem "1ª vez": cai para o que a
      // janela já sabia (o comportamento de hoje) e MARCA que a contagem é
      // parcial. "Não consegui contar" e "escreveu uma vez só" são fatos
      // opostos — confundi-los é como esta fila ficou invisível por sete
      // semanas.
      console.error("[agency/leads] contarIrmaosPorChave falhou — caindo para a contagem da janela", e);
      contagemFalhou = true;
    }
    const chaveColunaPorId = new Map(registros.map((r) => [r.id, r.chaveDoProspect] as const));

    const dossies = registros
      .map((r) => {
        const repeticao = repeticoes.get(r.id) ?? null;
        const dossie = montarDossie(
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
          repeticao,
        );
        const chaveColuna = chaveColunaPorId.get(r.id);
        // Sem repetição na janela = sem chave = nada a confessar. Chave nula
        // nunca consultou o banco (ver `contarIrmaosPorChave`), então aqui
        // também não há "irmão fora da janela" para uma linha que não tem
        // parentesco nenhum.
        const janelaDeRepeticao = repeticao
          ? janelaDaRepeticao({
              irmaosVisiveis: repeticao.vezes,
              totalDoBanco:
                typeof chaveColuna === "string" && chaveColuna.trim()
                  ? contagemPorChave.get(chaveColuna)
                  : undefined,
              contagemFalhou,
            })
          : null;
        return { ...dossie, janelaDeRepeticao };
      })
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

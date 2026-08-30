// A LEITURA DA PARCERIA — o lado que fala com o banco, e SÓ o servidor importa.
//
// ⚠️ ESTE ARQUIVO NÃO PODE SER IMPORTADO POR `question-engine.ts` NEM POR NADA
// QUE O BRIEFING CARREGUE NO NAVEGADOR. A régua pura (`parceriaVale`) vive em
// `parceria-declarada.ts` justamente para que a sala pública possa usá-la sem
// puxar o Prisma para o browser — ver o bloco medido no topo daquele arquivo,
// onde o build de produção reprovou por exatamente isso.
//
// Aqui é o caminho do SERVIDOR: a rota do SDR resolve o convite, lê a isenção
// viva e entrega o fato pronto para o motor de perguntas.

import { prisma } from "@/lib/db/client";
import { parceriaVale, type ParceriaDeclarada } from "./parceria-declarada";

/**
 * A parceria DECLARADA deste cliente, se houver uma válida.
 *
 * Lê `IsencaoDeParceria` — a tabela que já é a verdade da casa sobre quem não
 * paga. Não cria nada, não deduz nada e não aceita nada vindo do corpo da
 * requisição: quem chama passa um `clientId` que o SERVIDOR derivou.
 *
 * ⚠️ `clientId` ausente devolve `null`, e isso é a resposta certa, não uma
 * falha: um visitante anônimo na sala de briefing não tem como ser reconhecido
 * como parceiro, e fingir que tem seria adivinhar. Ver o bloco "o que continua
 * aberto" no topo do teste desta frente.
 */
export async function parceriaDoCliente(
  clientId: string | null | undefined,
  agora: Date = new Date(),
): Promise<ParceriaDeclarada | null> {
  const id = (clientId ?? "").trim();
  if (!id) return null;
  try {
    const linha = await prisma.isencaoDeParceria.findFirst({
      where: { clientId: id, validaAte: { gte: agora } },
      orderBy: { validaAte: "desc" },
      select: { autorizadaPor: true, validaAte: true },
    });
    if (!linha) return null;
    const p = { autorizadaPor: linha.autorizadaPor, validaAte: linha.validaAte };
    // Confere a validade DE NOVO, em código, e não só no `where`. A consulta
    // pode mudar amanhã; a régua de "vencida não vale" é desta camada.
    return parceriaVale(p, agora) ? p : null;
  } catch {
    // ── FAIL-CLOSED, E ESTE `catch` É A METADE QUE IMPORTA ─────────────────
    // Banco fora do ar devolve "não sei se é parceria" — e "não sei" tem de
    // significar **continua perguntando a verba**, nunca "trata como parceiro".
    // Um erro de leitura que dispensasse a pergunta transformaria uma queda de
    // banco em porta aberta para todo visitante.
    return null;
  }
}

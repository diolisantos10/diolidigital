// QUAL IA ATENDE ESTE CLIENTE — a escolha por cliente, e quem a lê.
//
// ─── O DEFEITO QUE ISTO CONSERTA ─────────────────────────────────────────────
//
// `BRAIN_AI_PROVIDER` é uma env GLOBAL. Ligar a faixa gratuita por ela punha a
// Foocci — cliente pagante — na cobaia junto com a agência. A ordem do CEO era
// "testar na agência primeiro, replicar se der certo", e sem escolha por cliente
// isso era literalmente impossível de executar.
//
// ─── A REGRA DE EXISTÊNCIA ───────────────────────────────────────────────────
//
// NENHUM ESTADO GRAVADO QUE NINGUÉM LÊ. `ClientAiProvider` tem um leitor
// nomeado: `escolhaDoCliente()`, chamada por `lib/ai/generate.ts` — o portão
// único por onde toda IA de texto desta casa passa. A tela grava aqui e a
// próxima peça produzida para aquele cliente sai por outro provedor. Se algum
// dia esse leitor sumir, esta tabela vira exatamente o que substituiu:
// `DbAgentProviderConfig`, gravado pela tela e lido por ninguém.
//
// ─── FAIL-CLOSED NO QUE DECIDE GASTO ─────────────────────────────────────────
//
// A escolha nasce ESTRITA (`estrito: true`). Um cliente fixado num provedor e
// esse provedor caindo faz a casa DIZER que não conseguiu — não deixa outro
// atender por baixo. Dois motivos, e os dois são caros:
//
//   • medição: fixar o Gemini na Dioli e o Claude atender calado por baixo mede
//     o Claude e chama o resultado de "o gratuito funciona";
//   • cliente: a peça sai com padrão diferente do que o painel afirma. O cliente
//     recebe pior achando que é o nosso padrão. Degradação silenciosa é o pior
//     desfecho — pior que a falha, que pelo menos aparece.
//
// Quem quiser reserva marca `estrito: false` na tela, e aí está escrito que quis.

import { prisma } from "@/lib/db/client";
import { isAiProvider, type AiProvider } from "@/lib/ai/resolve-key";

export interface EscolhaDeProvedor {
  clientId: string;
  provider: AiProvider;
  model: string | null;
  estrito: boolean;
  motivo: string | null;
  decididoPor: string | null;
  atualizadoEm: Date;
}

/**
 * O provedor fixado para este cliente, ou `null` = "a casa decide".
 *
 * Nunca lança. Banco fora do ar devolve `null`, e `null` significa "cai na
 * preferência da casa" — que é o comportamento de sempre. Errar aqui para o lado
 * de derrubar a produção seria trocar um seletor de conveniência por um ponto
 * único de falha na entrega ao cliente.
 *
 * Valor de provedor irreconhecível (typo numa correção manual, provedor
 * removido do código) também vira `null`, pelo mesmo motivo do
 * `degrauDeclarado` da escada: um `as AiProvider` no ponto de leitura faria
 * `"geminii"` viajar até o `fetch` e falhar longe da causa.
 */
export async function escolhaDoCliente(
  workspaceId: string,
  clientId: string | null | undefined,
): Promise<EscolhaDeProvedor | null> {
  if (!clientId) return null;
  try {
    const linha = await prisma.clientAiProvider.findUnique({
      where: { workspaceId_clientId: { workspaceId, clientId } },
    });
    if (!linha) return null;
    if (!isAiProvider(linha.provider)) {
      console.warn(
        `[provedor-por-cliente] cliente ${clientId} tem provedor "${linha.provider}", que não existe nesta casa — ignorado, vale a preferência da casa`,
      );
      return null;
    }
    return {
      clientId: linha.clientId,
      provider: linha.provider,
      model: linha.model,
      estrito: linha.estrito,
      motivo: linha.motivo,
      decididoPor: linha.decididoPor,
      atualizadoEm: linha.updatedAt,
    };
  } catch {
    return null;
  }
}

/** Todas as escolhas do workspace — para a tela e para o relatório. */
export async function escolhasDoWorkspace(workspaceId: string): Promise<EscolhaDeProvedor[]> {
  try {
    const linhas = await prisma.clientAiProvider.findMany({ where: { workspaceId } });
    return linhas.flatMap((l) =>
      isAiProvider(l.provider)
        ? [{
            clientId: l.clientId,
            provider: l.provider,
            model: l.model,
            estrito: l.estrito,
            motivo: l.motivo,
            decididoPor: l.decididoPor,
            atualizadoEm: l.updatedAt,
          }]
        : [],
    );
  } catch {
    return [];
  }
}

/**
 * Fixa (ou troca) o provedor de UM cliente. `provider: null` remove a fixação e
 * devolve o cliente à preferência da casa.
 *
 * O `clientId` é conferido contra o workspace ANTES de gravar. Sem isso, um id
 * digitado errado criaria uma linha órfã que nunca seria lida por ninguém — e
 * quem configurou juraria ter configurado.
 */
export async function fixarProvedor(p: {
  workspaceId: string;
  clientId: string;
  provider: AiProvider | null;
  model?: string | null;
  estrito?: boolean;
  motivo?: string | null;
  decididoPor: string;
}): Promise<{ ok: true } | { ok: false; erro: string }> {
  const cliente = await prisma.client.findFirst({
    where: { id: p.clientId, workspaceId: p.workspaceId },
    select: { id: true },
  });
  if (!cliente) return { ok: false, erro: "cliente não encontrado neste workspace" };

  if (p.provider === null) {
    await prisma.clientAiProvider.deleteMany({
      where: { workspaceId: p.workspaceId, clientId: p.clientId },
    });
    return { ok: true };
  }

  if (!isAiProvider(p.provider)) return { ok: false, erro: `provedor "${p.provider}" não existe nesta casa` };

  const dados = {
    provider: p.provider,
    model: p.model?.trim() || null,
    estrito: p.estrito ?? true,
    motivo: p.motivo?.trim() || null,
    decididoPor: p.decididoPor,
  };
  await prisma.clientAiProvider.upsert({
    where: { workspaceId_clientId: { workspaceId: p.workspaceId, clientId: p.clientId } },
    create: { workspaceId: p.workspaceId, clientId: p.clientId, ...dados },
    update: dados,
  });
  return { ok: true };
}

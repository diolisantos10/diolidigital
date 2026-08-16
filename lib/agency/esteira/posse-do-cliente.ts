// ─── DE QUEM É ESTE CLIENTE? ──────────────────────────────────────────────────
//
// Toda rota que recebe um `clientId` pela URL ou pelo corpo precisa responder
// esta pergunta ANTES de ler ou escrever qualquer coisa. Ela nasceu dentro de
// `app/api/agency/clients/[id]/marca/do-brand-book/route.ts`, sozinha e certa —
// e o arquivo ao lado (`.../marca/route.ts`) não a tinha: `GET` e `PUT` liam e
// gravavam a ficha de marca de QUALQUER cliente de QUALQUER inquilino, bastando
// ter uma sessão válida da casa. Provado com sessão de `design_staff` do
// workspace A lendo e escrevendo a ficha de um cliente do workspace B: 200 nas
// duas.
//
// Está aqui, e não copiada nas duas rotas, porque duas cópias da mesma regra é
// exatamente o defeito que esta casa já pagou três vezes — a segunda cópia
// diverge no dia em que alguém conserta só uma.
//
// ── 404, NUNCA 403 ──────────────────────────────────────────────────────────
//
// A diferença não é estética: 403 confirma que o id existe e pertence a outra
// conta, e essa confirmação já é vazamento — transforma a rota num oráculo de
// enumeração. 404 não distingue "não existe" de "não é seu", e é por isso que é
// a resposta certa nas duas situações.
//
// ── O ESCOPO VAI NO `where`, NUNCA NUMA COMPARAÇÃO DEPOIS ───────────────────
//
// Buscar por id e comparar `achado.workspaceId === sessao.workspaceId` num `if`
// funciona até alguém acrescentar um caminho de saída antes do `if`. Derivar
// dentro da consulta faz o isolamento não depender de ninguém lembrar.
//
// ── E A SESSÃO DO PORTAL ────────────────────────────────────────────────────
//
// Ela carrega `clientId`: só alcança o próprio cliente. Sem esta linha, um token
// de portal legítimo leria a ficha de marca de qualquer outro cliente do mesmo
// workspace — o vizinho de inquilino, que é o vazamento mais fácil de não notar.

import "server-only";

import { prisma } from "@/lib/db/client";

/** O mínimo que este módulo precisa de uma sessão. Nunca o corpo da requisição. */
export interface DonoDaSessao {
  workspaceId: string;
  clientId?: string;
}

/**
 * O cliente existe E é desta sessão? `null` quando não — e quem chama devolve
 * **404**, nunca 403.
 *
 * ⚠️ Falha de banco cai em `null` de propósito: negar por não conseguir
 * conferir é a única resposta segura. "Não sei de quem é" nunca pode virar
 * "então pode".
 */
export async function clienteOuNulo(
  id: string,
  sessao: DonoDaSessao,
): Promise<{ id: string } | null> {
  if (!id) return null;
  if (sessao.clientId && sessao.clientId !== id) return null;
  try {
    return await prisma.client.findFirst({
      where: { id, workspaceId: sessao.workspaceId },
      select: { id: true },
    });
  } catch {
    // `try/catch` e não `.catch()`: o `.catch()` só pega a promessa rejeitada e
    // deixa passar o erro SÍNCRONO (cliente do banco não inicializado, modelo
    // ausente). Os dois casos significam a mesma coisa aqui — não deu para
    // conferir de quem é —, e a resposta a essa dúvida é sempre "não é seu".
    return null;
  }
}

/**
 * O mesmo, respondendo só sim ou não. Para quem já tem o id e só precisa saber
 * se pode tocar na linha — o caso do `liberarCliente` da escada, que gravava na
 * allowlist um `clientId` vindo do corpo da requisição sem conferir nada.
 */
export async function clienteEDesteWorkspace(
  id: string,
  sessao: DonoDaSessao,
): Promise<boolean> {
  return (await clienteOuNulo(id, sessao)) !== null;
}

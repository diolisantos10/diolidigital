// QUEM O RELÓGIO VARRE — a casa inteira, nunca "o primeiro que aparecer".
//
// ── O DEFEITO QUE ESTE ARQUIVO EXISTE PARA MATAR (16/08/2026) ──────────────
//
// Duas pernas do `despertador` elegiam UM inquilino com `findFirst` e varriam
// só ele, devolvendo o número no tipo de retorno da rodada como se fosse "a
// fila da casa":
//
//   • **porta da frente** — `clientRequestDb.findFirst({ workspaceId: { not:
//     null } })`. Medido: 40 pessoas esperando numa conta e 12 com a bola nossa
//     noutra → **nenhuma sai em log nenhum**;
//   • **aprovação parada** — âncora no card `pending` mais antigo. Pior: a
//     perna **não tira card de pending** (ela só conta, e isso é de propósito),
//     então o card mais antigo continua sendo o mais antigo na rodada seguinte,
//     e na seguinte. **O mesmo inquilino é eleito para sempre.** Não é sorteio
//     que às vezes calha errado: é fome determinística.
//
// A casa hoje tem ~1 workspace, então o dano real é baixo — e isso é exatamente
// o motivo de consertar agora, enquanto é barato. Alarme que só funciona com um
// inquilino é alarme que morre em silêncio no dia em que entrar o segundo, e o
// dia em que entra o segundo é o dia em que ninguém está olhando o alarme.
//
// ── O IDIOMA JÁ EXISTIA NESTA CASA ────────────────────────────────────────
//
// `lib/agency/comercial/caixa-de-entrada/varredura.ts:355` faz
// `workspacesComCaixa()` + laço. Este arquivo é o mesmo desenho para as pernas
// que ainda não o tinham — uma função que ENUMERA, e o laço no chamador.
//
// ── POR QUE ENUMERAR O WORKSPACE, E NÃO A FILA ────────────────────────────
//
// Dava para tirar os inquilinos de `distinct` na própria tabela da fila. Não
// serve para as duas pernas: `ApprovalRequest` **não tem `workspaceId`** (a
// posse é `clientRequestId` OU `clientId`), então não há coluna de onde tirar
// `distinct`. `AgencyWorkspace` é a tabela que a casa já usa como "os
// inquilinos que existem", e vale para as duas pernas do mesmo jeito.

import { prisma } from "@/lib/db/client";

/**
 * Todos os inquilinos da casa.
 *
 * **Lança** se o banco não responder: uma lista vazia aqui faria toda perna que
 * a usa terminar sem varrer nada e sem uma palavra — que é o defeito de
 * `.catch(() => [])` que esta rodada inteira existe para tirar do caminho.
 * Quem chama já tem `try/catch` com `quebrou(...)`.
 */
export async function todosOsInquilinos(): Promise<string[]> {
  const linhas = await prisma.agencyWorkspace.findMany({ select: { id: true } });
  return linhas.map((l) => l.id);
}

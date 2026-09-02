// ─── QUEM É ESTA PESSOA NA CÉLULA — LIDO DO BANCO, NUNCA DO HEADER ─────────
//
// Até 02/09/2026 as duas rotas de escrita da Célula (`fila-diaria` e `funil`)
// montavam a credencial lendo `req.headers.get("x-papel-na-celula")` — um
// header que QUALQUER chamador podia forjar. `papeis.ts` (a lógica de
// PODE/NÃO PODE) sempre esteve correta; o buraco era de ONDE o dado vinha.
//
// Este arquivo é a fonte única do "de onde vem": o papel mora em
// `User.papelNaCelula`, escrito só por quem tem autoridade `master`
// (`atribuirPapelNaCelula`), lido fail-closed por qualquer rota
// (`buscarPapelNaCelula`).
//
// Diferente de `papeis.ts` — que é lógica pura, sem I/O, para poder ser
// testada por mutação (`scripts/mutacao-papeis.mjs`) sem tocar banco — este
// arquivo FAZ I/O de propósito. Misturar os dois faria a lógica de permissão
// depender de banco para ser testada, e é exatamente o que `papeis.ts` evita.

import "server-only";

import { prisma } from "@/lib/db/client";
import { RESPONSAVEIS, type Responsavel } from "@/lib/agency/celula/excecoes/tipos";

const CONJUNTO_DE_RESPONSAVEIS: ReadonlySet<string> = new Set(RESPONSAVEIS);

/**
 * Leitura fail-closed: valor fora de `RESPONSAVEIS` vira `null`, nunca vira
 * permissão. Serve tanto para o valor lido do banco quanto para o `papel`
 * recebido por `atribuirPapelNaCelula`.
 *
 * Exportada para a rota de listagem (`app/api/agency/celula/papeis/route.ts`)
 * sanitizar o que devolve — o mesmo motivo pelo qual `buscarPapelNaCelula`
 * nunca devolve um valor sujo direto do banco.
 */
export function responsavelOuNulo(valor: unknown): Responsavel | null {
  return typeof valor === "string" && CONJUNTO_DE_RESPONSAVEIS.has(valor) ? (valor as Responsavel) : null;
}

/**
 * O papel desta pessoa na Célula, lido do banco.
 *
 * FAIL CLOSED em duas camadas: usuário inexistente → `null`; valor gravado
 * que não bate EXATAMENTE com um de `RESPONSAVEIS` → `null`. Dado sujo nunca
 * vira permissão — nunca um `as Responsavel` cru.
 */
export async function buscarPapelNaCelula(userId: string): Promise<Responsavel | null> {
  if (!userId) return null;
  const usuario = await prisma.user.findUnique({
    where: { id: userId },
    select: { papelNaCelula: true },
  });
  return responsavelOuNulo(usuario?.papelNaCelula);
}

export type CodigoDaAtribuicao =
  | "sem_autoridade"
  | "alvo_nao_encontrado"
  | "papel_invalido"
  | "alvo_e_cliente";

export type ResultadoDaAtribuicao =
  | { ok: true; alvoUserId: string; papel: Responsavel | null }
  | { ok: false; codigo: CodigoDaAtribuicao; motivo: string };

/**
 * Atribui (ou remove, com `papel: null`) o papel de OUTRA pessoa na Célula.
 *
 * As quatro regras, NESTA ordem — a ordem é deliberada, mesma postura de
 * `papeis.ts`: a pergunta "quem manda" vem antes de qualquer coisa sobre o
 * alvo, porque autorizar depois de já ter revelado se o alvo existe seria
 * vazamento por outra porta.
 *
 *   1. só `master` atribui — não é sobre o papel de quem, é sobre QUEM
 *      ATRIBUI. Ninguém abaixo de master atribui, nem para si mesmo;
 *   2. o alvo precisa existir E ser do MESMO workspace do ator — não existir
 *      ou ser de outro workspace são a MESMA resposta ("não encontrado"),
 *      mesmo padrão de posse-antes-de-permissão que a rota do funil já usa:
 *      não vaza se o id existe noutro workspace;
 *   3. `papel` precisa ser um de `RESPONSAVEIS` ou `null` (remover o papel);
 *   4. o alvo NÃO pode ser uma conta de cliente do portal (`User.role ===
 *      "client"`). `User` guarda staff e cliente no mesmo model — sem esta
 *      trava, um erro de clique do master gravaria papel operacional numa
 *      sessão de cliente. Isto é DEFESA EM PROFUNDIDADE: a listagem
 *      (`GET /api/agency/celula/papeis`) já filtra clientes de propósito,
 *      mas esta função é a ÚNICA escrita — ela não pode confiar só na
 *      listagem, porque um chamador direto (script, rota futura) tem que
 *      ser barrado igual. Achado do `interface` em 02/09/2026.
 *
 * Objeto discriminado, nunca lança para erro de negócio — mesmo estilo de
 * `avancarFunil`/`liberarEmBloco`.
 */
export async function atribuirPapelNaCelula(args: {
  atorUserId: string;
  atorAutoridade: string;
  atorWorkspaceId: string;
  alvoUserId: string;
  papel: Responsavel | null;
}): Promise<ResultadoDaAtribuicao> {
  const { atorAutoridade, atorWorkspaceId, alvoUserId, papel } = args;

  // 1. QUEM ATRIBUI — antes de qualquer leitura sobre o alvo.
  if (atorAutoridade !== "master") {
    return {
      ok: false,
      codigo: "sem_autoridade",
      motivo:
        "só quem tem autoridade master atribui papel na Célula — não é sobre o papel de quem, " +
        "é sobre quem atribui. Ninguém abaixo de master atribui, nem para si mesmo.",
    };
  }

  // 3 (validada aqui, antes da consulta ao alvo, para não gastar uma leitura
  // de banco com um valor que já se sabe inválido).
  if (papel !== null && !CONJUNTO_DE_RESPONSAVEIS.has(papel)) {
    return {
      ok: false,
      codigo: "papel_invalido",
      motivo: `papel inválido: ${JSON.stringify(papel)}. Conjunto fechado: ${RESPONSAVEIS.join(", ")}, ou null.`,
    };
  }

  // 2. POSSE — existir e ser do mesmo workspace são a MESMA resposta.
  if (!alvoUserId) {
    return { ok: false, codigo: "alvo_nao_encontrado", motivo: "usuário não encontrado." };
  }
  const alvo = await prisma.user.findFirst({
    where: { id: alvoUserId, workspaceId: atorWorkspaceId },
    select: { id: true, role: true },
  });
  if (!alvo) {
    return { ok: false, codigo: "alvo_nao_encontrado", motivo: "usuário não encontrado." };
  }

  // 4. O ALVO NÃO PODE SER CLIENTE — depois de confirmar posse (não vaza se o
  // id é de cliente ANTES de saber que é do próprio workspace), antes de
  // gravar. `/agency/**` é território proibido para `client`, sem exceção —
  // e isso vale também para SER alvo de atribuição de papel, não só para
  // acessar a Célula.
  if (alvo.role === "client") {
    return {
      ok: false,
      codigo: "alvo_e_cliente",
      motivo:
        "contas de cliente do portal nunca recebem papel operacional na Célula — " +
        "/agency/** é território proibido para role \"client\", sem exceção.",
    };
  }

  await prisma.user.update({
    where: { id: alvoUserId },
    data: { papelNaCelula: papel },
  });

  return { ok: true, alvoUserId, papel };
}

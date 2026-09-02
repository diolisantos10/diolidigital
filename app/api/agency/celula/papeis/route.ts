// ─── A ROTA QUE ATRIBUI O PAPEL NA CÉLULA — só master escreve ─────────────
//
// Até 02/09/2026 não havia rota nenhuma para gravar `User.papelNaCelula`: a
// coluna existia (migration `20260902120000_o_papel_da_pessoa_na_celula`),
// mas nada no sistema conseguia atribuí-la sem editar o banco à mão. Esta
// rota é a porta — o que a tela do `interface`/`experiencia` vai consumir
// (despacho separado, não construído aqui).
//
// ── GET — leitura larga, mesma régua da casa ──────────────────────────────
// "Ler é largo de propósito" (`lib/agency/organizacao/autoridade.ts`):
// qualquer pessoa DE DENTRO da casa lê (`eInterno` — todo mundo menos
// `client`). Corrigido em 02/09/2026 (achado do `experiencia`): a versão
// original restringia a leitura a `eGestao` (master/diretor/PM) — e isso
// bloqueava, no `proxy.ts`, ANTES da página sequer montar, exatamente quem
// mais precisa desta tela: o `executivo_comercial`, dono do departamento
// `client-service-sdr` que a Célula pertence. Ler quem tem qual papel não é
// segredo; ATRIBUIR papel continua estreito (só `master`, abaixo).
//
// ── POST — escrita estreita, e a MESMA regra em dois lugares ─────────────
// Só `session.role === "master"` chama `atribuirPapelNaCelula`, que checa a
// MESMA coisa por dentro (`atorAutoridade !== "master"`). Não é redundância
// inútil — é defesa em profundidade: se um dia esta rota ganhar um outro
// caminho de entrada (ex.: chamada interna, script), a trava de dentro da
// função continua de pé mesmo que a da rota seja pulada por engano.
//
// `alvoUserId` vem do CORPO (é o alvo, tem que ser dizível); `atorUserId`,
// `atorWorkspaceId` e `atorAutoridade` vêm SEMPRE da sessão — mesma regra de
// autoria que `autor: session.userId` nas outras rotas da Célula: aceitar
// isso do corpo deixaria qualquer chamador assinar como outra pessoa ou
// atribuir papel fora do próprio workspace.
//
// ── CLIENTE NUNCA É ALVO — achado do `interface` em 02/09/2026 ────────────
// `User` guarda staff E contas de cliente do portal no MESMO model (mesmo
// `workspaceId`, `role: "client"`). O GET abaixo filtra `role !== "client"`
// da listagem (a tela nunca OFERECE um cliente como alvo); o POST confia na
// checagem redundante dentro de `atribuirPapelNaCelula` (código
// "alvo_e_cliente") — mesma defesa em profundidade da checagem de
// `atorAutoridade`, e pelo mesmo motivo: um chamador direto da função (fora
// desta rota) tem que ser barrado igual.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireSession } from "@/lib/auth/api-guard";
import { atribuirPapelNaCelula, responsavelOuNulo } from "@/lib/agency/celula/papel-do-usuario";
import type { Responsavel } from "@/lib/agency/celula/excecoes/tipos";
import { ehPapelDaAgencia } from "@/lib/agency/roles";

export async function GET(): Promise<NextResponse> {
  const { session, error } = await requireSession();
  if (error) return error;

  // Leitura larga: qualquer pessoa de dentro da casa. `ehPapelDaAgencia` é o
  // MESMO guarda que `proxy.ts` usa para `/agency/**` — precisa ser repetido
  // aqui porque `/api/**` fica FORA do proxy (`PUBLIC_PATHS` em `proxy.ts`
  // inclui `"/api/"`): cada rota de API responde pela própria porta. Sem
  // este `if`, uma sessão `role: "client"` (JWT válido — `getSession()` não
  // confere a FORMA do payload) faz `autoridadeDoPapel` explodir: `"client"`
  // não é um `AgencyRole`, não existe em `PERFIL_DO_PAPEL`. Achado ao
  // escrever o teste do caso "cliente não lê" — a versão anterior deste `if`
  // (`eInterno(autoridadeDoPapel(session.role))`) crashava em vez de
  // recusar, porque `autoridadeDoPapel` já explode ANTES de `eInterno` rodar.
  if (!ehPapelDaAgencia(session.role)) {
    return NextResponse.json({ error: "cliente não acessa `/agency/**`." }, { status: 403 });
  }

  // `User` guarda tanto staff quanto contas de cliente do portal (mesmo
  // model, `role: "client"`, mesmo `workspaceId`). Esta tela é de gestão de
  // papel OPERACIONAL na Célula — nunca pode listar (e, por extensão, deixar
  // o master atribuir papel a) uma conta de cliente. Achado do `interface`
  // em 02/09/2026, ao construir a tela que consome esta rota: sem este
  // filtro, um clique errado do master gravaria `papelNaCelula` numa sessão
  // de cliente, e `requireSession()` nas rotas da Célula não restringe por
  // `role` — a defesa real fica em `atribuirPapelNaCelula` (item 2 desta
  // mesma frente), mas a listagem não deve nem OFERECER o alvo errado.
  const contas = await prisma.user.findMany({
    where: { workspaceId: session.workspaceId, role: { not: "client" } },
    select: { id: true, name: true, email: true, role: true, papelNaCelula: true },
    orderBy: { name: "asc" },
  });

  // Sanitiza o que sai: valor sujo no banco (nunca deveria acontecer, mas
  // `atribuirPapelNaCelula` é a única escrita — não a única forma de o dado
  // chegar lá, ex.: import futuro) vira "nenhum" para quem consome a tela,
  // igual à leitura fail-closed de `buscarPapelNaCelula`. O `.filter` de
  // `role` é a MESMA postura, defesa em profundidade sobre a própria query:
  // se o `where` acima um dia for editado e o `role: { not: "client" }` se
  // perder no meio de outra mudança, o retorno da rota continua fail-closed.
  return NextResponse.json({
    contas: contas
      .filter((c) => c.role !== "client")
      .map((c) => ({ ...c, papelNaCelula: responsavelOuNulo(c.papelNaCelula) })),
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const { session, error } = await requireSession();
  if (error) return error;

  // Escrita estreita: só master. Mesma regra conferida de novo dentro de
  // `atribuirPapelNaCelula` — defesa em profundidade, não redundância à toa.
  if (session.role !== "master") {
    return NextResponse.json(
      { error: "só quem tem autoridade master atribui papel na Célula." },
      { status: 403 },
    );
  }

  let corpo: unknown;
  try {
    corpo = await request.json();
  } catch {
    return NextResponse.json({ error: "corpo inválido" }, { status: 400 });
  }
  const c = (corpo ?? {}) as Record<string, unknown>;
  if (typeof c.userId !== "string" || c.userId.length === 0) {
    return NextResponse.json({ error: "userId é obrigatório." }, { status: 400 });
  }
  if (c.papel !== null && typeof c.papel !== "string") {
    return NextResponse.json({ error: "papel precisa ser uma string ou null." }, { status: 400 });
  }

  const r = await atribuirPapelNaCelula({
    // ator SEMPRE da sessão — nunca do corpo.
    atorUserId: session.userId,
    atorAutoridade: session.role,
    atorWorkspaceId: session.workspaceId,
    alvoUserId: c.userId,
    // `c.papel` já foi conferido acima como `null | string`; a validação de
    // ESTAR em `RESPONSAVEIS` é feita dentro de `atribuirPapelNaCelula`
    // (fail-closed — "papel_invalido" para qualquer string fora do conjunto).
    papel: c.papel as Responsavel | null,
  });

  if (!r.ok) {
    // "alvo_e_cliente" cai no mesmo 400 de "papel_invalido": é erro de
    // REQUISIÇÃO (o alvo escolhido nunca poderia receber papel), não 403 de
    // autoridade (o ator É master) nem 404 de posse (o alvo existe e é do
    // workspace certo — só não é elegível).
    const status =
      r.codigo === "sem_autoridade" ? 403 : r.codigo === "alvo_nao_encontrado" ? 404 : 400;
    return NextResponse.json({ error: r.motivo, codigo: r.codigo }, { status });
  }
  return NextResponse.json({ ok: true, userId: r.alvoUserId, papel: r.papel });
}

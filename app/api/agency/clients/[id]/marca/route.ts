// A FICHA DE MARCA de um cliente — leitura e escrita.
//
// GET  → os nove campos com o estado de cada um, as lacunas e as perguntas
//        prontas para mandar ao dono.
// PUT  → grava o que o dono respondeu.
//
// ── QUEM PODE ESCREVER AQUI ────────────────────────────────────────────────
//
// A identidade da marca é do DONO — nunca do agente e nunca da agência. Esta
// rota é a porta de dentro (o painel), usada por quem atende; a porta do
// cliente é o formulário do portal. As duas gravam no mesmo lugar e por isso a
// origem de cada resposta fica registrada: sem isso, daqui a três meses
// ninguém sabe se "não prometemos contratação" saiu da boca do cliente ou do
// palpite de quem preencheu a ficha por ele.

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { clienteOuNulo } from "@/lib/agency/esteira/posse-do-cliente";
import { lerFichaDeMarca, proximasPerguntas, CAMPOS_DA_MARCA, type CampoDaMarca } from "@/lib/agency/esteira/ficha-de-marca";
import { COLUNA, gravarRespostaDeMarca } from "@/lib/agency/esteira/escrita-da-ficha";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const sessao = await getSession();
  if (!sessao) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;

  // ── DE QUEM É ESTE CLIENTE? (28/08/2026) ─────────────────────────────────
  //
  // Havia sessão conferida e POSSE não conferida: `id` vinha cru da URL e
  // `lerFichaDeMarca` faz `brandBrain.findUnique({ where: { clientId } })` sem
  // `workspaceId`. Qualquer sessão válida de QUALQUER workspace lia a ficha de
  // marca de QUALQUER cliente — bastava trocar o id no endereço. Valia para
  // `design_staff`, o papel mais baixo.
  //
  // Medido pelo PR #169 em 16/08 (sessão do workspace A sobre cliente do B:
  // 200 nas duas pontas), consertado lá, e o conserto ficou preso: aquele PR
  // não mergeia mais (história órfã — ver #375). O arquivo veio de lá.
  //
  // ⚠️ 404 E NUNCA 403: 403 confirmaria que o id existe e é de outra conta, e
  // essa confirmação já é vazamento — vira oráculo de enumeração.
  if (!(await clienteOuNulo(id, sessao))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const ficha = await lerFichaDeMarca(id);
  return NextResponse.json({
    ...ficha,
    // A conclusão primeiro, para a tela não ter de contar: quantos faltam e o
    // que a falta impede.
    resumo: {
      definidos: ficha.definidos,
      total: CAMPOS_DA_MARCA.length,
      faltam: ficha.lacunas.length,
      oQueAFaltaImpede: ficha.naoConstituida
        ? "sem isto a peça sai sem régua de marca, e o portão de entrega barra a publicação"
        : null,
      // O QUE exatamente falta, item por item. `definidos` conta campo; a porta
      // decide por outra régua (5 campos + 3 proibições + as duas referências).
      // A tela mostrava só o primeiro número, então dava para ver "8 de 9" com
      // a publicação barrada e nada explicando por quê.
      oQueFaltaParaPublicar: ficha.oQueFaltaParaPublicar,
    },
    proximasPerguntas: proximasPerguntas(ficha),
  });
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const sessao = await getSession();
  if (!sessao) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;

  // A mesma pergunta do GET, e por um motivo pior: aqui se ESCREVE. Sem esta
  // linha, uma sessão de outro inquilino adulterava a ficha de marca alheia —
  // e a ficha é o que a produção lê para escrever a peça do cliente.
  if (!(await clienteOuNulo(id, sessao))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const corpo = (await req.json().catch(() => ({}))) as { campos?: Record<string, unknown> };
  const entrada = corpo.campos ?? {};

  const gravados: string[] = [];
  const ignorados: string[] = [];

  // Uma escrita por campo, pelo escritor único (`esteira/escrita-da-ficha.ts`).
  // Era um `upsert` só com o objeto montado aqui — e o envelope montado aqui
  // era a CÓPIA do envelope do portal, com a mesma linha fatal nas duas: a
  // metade que permite reprovar (`reprovadas`, `naoDizemos`) nascia vazia.
  // Escritor único é o que impede a próxima cópia de divergir de novo.
  for (const [campo, valor] of Object.entries(entrada)) {
    if (!COLUNA[campo as CampoDaMarca] && campo !== "proibicoes") {
      // Campo desconhecido não é gravado em silêncio: quem chamou precisa saber
      // que a resposta do cliente foi para o lixo.
      ignorados.push(campo);
      continue;
    }
    if (valor === null || valor === undefined || valor === "") continue;
    const r = await gravarRespostaDeMarca({
      clientId: id,
      campo: campo as CampoDaMarca,
      entrada: valor,
      // ── A AUTORIA, e por que ela não é detalhe ──────────────────────────
      // Esta é a porta de DENTRO: quem escreve aqui é a agência registrando o
      // que o cliente disse. `equipe` diz exatamente isso, e nunca deixa a
      // resposta preenchida pela casa se passar por resposta do dono — a
      // mesma regra do `reviewedBy` que já mordeu esta casa.
      origem: "equipe",
    });
    if (r.gravado) gravados.push(r.onde);
    // Resposta que não virou regra não some: quem preencheu precisa saber que
    // aquilo não vai barrar nada.
    else if (r.motivo) ignorados.push(`${campo} (${r.motivo})`);
  }

  if (gravados.length === 0) {
    return NextResponse.json({ error: "nada para gravar", ignorados }, { status: 400 });
  }

  const ficha = await lerFichaDeMarca(id);
  return NextResponse.json({ gravados, ignorados, ficha });
}

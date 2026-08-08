// ─── PATCH /api/agency/oportunidades/[id] ────────────────────────────────────
//
// A decisão sobre uma oportunidade: aprovar, recusar ou marcar como enviada.
//
// ⚠️ Next.js 16: `params` é uma PROMISE e precisa de `await`. Não é o Next que a
// maioria dos modelos aprendeu — está na vitrine da plataforma e na primeira
// linha do `AGENTS.md` do repositório.
//
// ── POSSE ────────────────────────────────────────────────────────────────────
// O `workspaceId` entra no WHERE da própria escrita, não numa checagem separada
// antes dela. Checar e depois escrever deixa uma janela entre as duas coisas; o
// filtro dentro do `updateMany` é atômico — ou a linha é do inquilino e muda, ou
// não é e nada acontece. Zero linhas afetadas → 404, nunca 403: 403 confirmaria
// que o id existe em OUTRO workspace, e isso é vazamento de existência.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireSession } from "@/lib/auth/api-guard";
import { ehStatusValido, STATUS_VALIDOS, CAMPOS_DE_LEITURA } from "@/lib/agency/comercial/oportunidade";
import { registrarGasto } from "@/lib/marketplaces/99freelas/contador";
import { temCotaDeConexoes } from "@/lib/marketplaces/cotas";

interface CorpoDaDecisao {
  status?: unknown;
  propostaTexto?: unknown;
  valorSugerido?: unknown;
  /** Quantas conexões o 99Freelas cobrou por esta proposta, LIDO DA TELA DELE.
   *  Obrigatório para marcar como enviada numa plataforma com cota. */
  custoEmConexoes?: unknown;
}

/** Teto do texto de proposta. Campo livre que vai para o banco precisa de teto —
 *  o SQLite mora no mesmo volume dos backups. */
const PROPOSTA_MAX = 20_000;

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { session, error } = await requireSession();
  if (error) return error;
  const { id } = await context.params;

  let corpo: CorpoDaDecisao;
  try {
    corpo = (await request.json()) as CorpoDaDecisao;
  } catch {
    return NextResponse.json({ error: "Corpo inválido — esperado JSON." }, { status: 400 });
  }

  // Catálogo FECHADO de estados. O raciocínio (ou a pessoa) ESCOLHE entre
  // estados pré-declarados; nunca inventa um novo. Uma string qualquer virando
  // status deixa a linha num estado que nenhuma tela sabe mostrar e nenhuma
  // consulta sabe achar.
  if (!ehStatusValido(corpo.status)) {
    return NextResponse.json(
      { error: `status inválido — use um de: ${STATUS_VALIDOS.join(" | ")}` },
      { status: 400 },
    );
  }
  const status = corpo.status;

  const dados: Record<string, unknown> = {
    status,
    // Quem bateu o martelo, e quando. `userId`, não e-mail: o registro de
    // decisão não precisa carregar identificador pessoal para cumprir a função
    // de auditoria.
    decididoPor: session.userId,
    decididoEm: new Date(),
  };

  if (typeof corpo.propostaTexto === "string") {
    const t = corpo.propostaTexto.trim();
    if (t.length > PROPOSTA_MAX) {
      return NextResponse.json(
        { error: `propostaTexto acima do limite de ${PROPOSTA_MAX} caracteres.` },
        { status: 400 },
      );
    }
    dados.propostaTexto = t || null;
  }

  if (corpo.valorSugerido !== undefined && corpo.valorSugerido !== null) {
    // Reais INTEIROS (1200 = R$ 1.200), a mesma unidade de `orcamentoInformado`.
    // Negativo ou fracionário é entrada errada, não "valor criativo".
    const v = Number(corpo.valorSugerido);
    if (!Number.isFinite(v) || v < 0 || !Number.isInteger(v)) {
      return NextResponse.json(
        { error: "valorSugerido deve ser um inteiro de reais, zero ou maior." },
        { status: 400 },
      );
    }
    dados.valorSugerido = v;
  }

  // ── A CONEXÃO GASTA (08/08/2026) ──────────────────────────────────────────
  //
  // "Marcar como enviada" é o ÚNICO momento em que a casa sabe que uma conexão
  // foi de fato consumida — o envio é HUMAN_GATE, quem clicou foi gente, e o
  // número em conexões estava na tela do 99Freelas na frente dela.
  //
  // Por que é OBRIGATÓRIO e não opcional: a plataforma NÃO publica a tabela de
  // custo ("varia com o quão disputado costuma ser aquele tipo de projeto"), e
  // marketing e design são os disputados. Assumir 1 faria a casa planejar 240
  // envios com 240 conexões e a cota acabar na 80ª, sem ninguém entender por
  // quê. Conexão gasta não volta e a cota não acumula no mês seguinte.
  //
  // Aceitar o "enviada" SEM o número seria pior que recusar: o contador ficaria
  // otimista em silêncio, e um contador otimista é o mesmo que não ter contador.
  let gastoRegistrado: { ok: boolean; jaEstavaRegistrado: boolean; motivo: string } | null = null;
  if (status === "enviada") {
    const linha = await prisma.oportunidade.findFirst({
      where: { id, workspaceId: session.workspaceId },
      select: { plataforma: true },
    });
    if (!linha) return NextResponse.json({ error: "Oportunidade não encontrada" }, { status: 404 });

    if (temCotaDeConexoes(linha.plataforma)) {
      const custo = Number(corpo.custoEmConexoes);
      if (!Number.isInteger(custo) || custo < 1) {
        return NextResponse.json(
          {
            error:
              "Para marcar como enviada no 99Freelas, informe quantas CONEXÕES a plataforma cobrou — o número está na tela dela, no momento do envio.",
            porque:
              "A plataforma não publica a tabela de custo (ela varia com o quão disputado é o projeto, e marketing/design são os disputados). Assumir 1 faz a cota do mês acabar antes da conta fechar, e conexão gasta não volta.",
            campo: "custoEmConexoes",
          },
          { status: 400 },
        );
      }
      // Registra ANTES de mudar o status: se o contador falhar, a oportunidade
      // NÃO vai para "enviada". O contrário deixaria uma proposta contada como
      // enviada e uma conexão gasta fora do livro — e o erro só apareceria no
      // fim do mês, quando não dá mais para reconstruir.
      gastoRegistrado = await registrarGasto({
        workspaceId: session.workspaceId,
        plataforma: linha.plataforma,
        motivo: "proposta",
        custoLidoDaTela: custo,
        oportunidadeId: id,
        registradoPor: session.userId,
      });
      if (!gastoRegistrado.ok) {
        return NextResponse.json(
          { error: `Não consegui registrar o gasto de conexões: ${gastoRegistrado.motivo}`, campo: "custoEmConexoes" },
          { status: 400 },
        );
      }
    }
  }

  // A ESCRITA JÁ FILTRA POR WORKSPACE — esta é a trava de posse.
  const { count } = await prisma.oportunidade.updateMany({
    where: { id, workspaceId: session.workspaceId },
    data: dados,
  });

  if (count === 0) {
    // Pode ser id inexistente OU id de outro inquilino. As duas respostas são a
    // mesma de propósito.
    return NextResponse.json({ error: "Oportunidade não encontrada" }, { status: 404 });
  }

  const oportunidade = await prisma.oportunidade.findFirst({
    where: { id, workspaceId: session.workspaceId },
    select: CAMPOS_DE_LEITURA,
  });

  return NextResponse.json({ oportunidade, gastoDeConexoes: gastoRegistrado });
}

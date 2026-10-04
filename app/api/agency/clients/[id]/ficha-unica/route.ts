// GET/PUT /api/agency/clients/[id]/ficha-unica — A FICHA DE MARCA ÚNICA.
//
// Uma fonte da verdade (CEO, 04/10/2026): o mesmo registro que calendário,
// legenda, arte e analista leem. Ver `lib/agency/esteira/ficha-unica.ts`.
// Os 9 campos de régua continuam em `/marca` (o escritor deles); esta rota
// grava o resto — e nenhum campo mostrado na tela é descartado.

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { clienteOuNulo } from "@/lib/agency/esteira/posse-do-cliente";
import { CAMPOS_DA_FICHA_UNICA, gravarFichaUnica, lerFichaUnica, type FichaUnica } from "@/lib/agency/esteira/ficha-unica";
import { prisma } from "@/lib/db/client";
import { ehFaltaDeIa } from "@/lib/ai/leitura-pelo-cofre";
import { cofreAprovado } from "@/lib/ai/cofre";

export const dynamic = "force-dynamic";

const PODEM_ESCREVER = new Set(["master", "project_manager", "social_staff", "design_staff"]);
const MAX_POR_CAMPO = 20_000;

async function leituraDaMarca(clientId: string): Promise<{ estado: string; frase: string; arquivo?: string } | null> {
  const a = await prisma.brainArtifact
    .findFirst({
      where: { clientId, department: "brand-book-extraido" },
      orderBy: { createdAt: "desc" },
      select: { status: true, canvasJson: true },
    })
    .catch(() => null);
  if (!a) return null;
  let arquivo: string | undefined;
  let erro = "";
  try {
    const j = JSON.parse(a.canvasJson ?? "{}") as { arquivo?: string; erro?: string };
    arquivo = j.arquivo;
    erro = j.erro ?? "";
  } catch { /* sem detalhe */ }
  // SEM IA ≠ ERRO (04/10/2026): a leitura depende de uma IA que ainda não está
  // ligada pelo cofre. Isso é espera, não defeito, e a tela tem de dizer isso.
  const semIa = ehFaltaDeIa(erro);
  if (a.status === "erro" && semIa && cofreAprovado()) {
    return { estado: "aguardando_ia", frase: "A IA da Control Room está ligada: use \"Reler brand books guardados\" para ler este arquivo.", arquivo };
  }
  if (a.status === "erro" && semIa) {
    return { estado: "aguardando_ia", frase: "O brand book está guardado. A leitura automática começa quando a IA da Control Room for ligada.", arquivo };
  }
  if (a.status === "erro") return { estado: "erro", frase: `A leitura automática falhou: ${erro || "motivo não informado"}`, arquivo };
  if (a.status === "analisando") return { estado: "analisando", frase: "Lendo o brand book…", arquivo };
  return { estado: "aguardando_revisao", frase: "A leitura do brand book trouxe sugestões para revisar.", arquivo };
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const sessao = await getSession();
  if (!sessao) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  if (!(await clienteOuNulo(id, sessao))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const ficha = await lerFichaUnica(id);
  return NextResponse.json({
    campos: CAMPOS_DA_FICHA_UNICA,
    ficha,
    leituraDoBrandBook: await leituraDaMarca(id),
    // Só o SIM/NÃO — nunca o token. Decide se o botão "Reler" faz sentido.
    iaDaControlRoomLigada: cofreAprovado(),
  });
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const sessao = await getSession();
  if (!sessao) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!PODEM_ESCREVER.has(sessao.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await ctx.params;
  if (!(await clienteOuNulo(id, sessao))) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const corpo = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  // DOIS FORMATOS (04/10/2026): `{"ficha":{...}}` (o da tela) ou as chaves
  // SOLTAS no corpo. Antes, as chaves soltas davam 200 e não gravavam nada —
  // uma armadilha medida pelo chat central ao cadastrar as 8 marcas.
  const fonte: Record<string, unknown> =
    corpo && typeof corpo.ficha === "object" && corpo.ficha !== null && !Array.isArray(corpo.ficha)
      ? (corpo.ficha as Record<string, unknown>)
      : (corpo ?? {});
  const conhecidas = new Set<string>(CAMPOS_DA_FICHA_UNICA.map((c) => c.chave));
  const ignorados = Object.keys(fonte).filter((k) => !conhecidas.has(k));
  const entrada: FichaUnica = {};
  for (const c of CAMPOS_DA_FICHA_UNICA) {
    const v = fonte[c.chave];
    if (v === undefined) continue;
    if (typeof v !== "string") return NextResponse.json({ error: `"${c.rotulo}" precisa ser texto` }, { status: 400 });
    if (v.length > MAX_POR_CAMPO) {
      return NextResponse.json({ error: `"${c.rotulo}" passou de ${MAX_POR_CAMPO} caracteres` }, { status: 400 });
    }
    entrada[c.chave] = v;
  }
  // Nenhum campo reconhecido: 400 com a lista, nunca um 200 que não gravou.
  if (Object.keys(entrada).length === 0) {
    return NextResponse.json(
      {
        error: `Nenhum campo da ficha reconhecido. Chaves aceitas: ${[...conhecidas].join(", ")}.`,
        ignorados,
      },
      { status: 400 },
    );
  }
  const ficha = await gravarFichaUnica(id, entrada);
  return NextResponse.json({ ficha, gravados: Object.keys(entrada), ignorados });
}

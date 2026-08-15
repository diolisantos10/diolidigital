// /api/top-down — o dispositivo do CEO.
//
// Ordem literal (15/08/2026): *"precisamos criar um botão para isso no
// sistema"*, *"chamado TOP DOWN"*, *"esse dispositivo só pode ser usado por
// mim"*.
//
// A ÚLTIMA FRASE É UMA TRAVA, NÃO UM COMBINADO. Um dispositivo que destrava a
// casa inteira e depende de as pessoas não clicarem nele é um dispositivo que
// qualquer um usa. Por isso o papel é conferido aqui, no servidor, em toda
// chamada — e `project_manager`, que pode quase tudo nesta casa, NÃO alcança.
// Só `master`.
//
// A leitura (GET) também exige `master`: o estado do freio, com o motivo e o
// nome de quem decidiu, é informação de direção. Quem não pode virar também não
// precisa ler.

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  DECISOES_TOP_DOWN,
  decidir,
  lerDecisao,
  type ChaveTopDown,
} from "@/lib/agency/top-down";

/** O portão, num lugar só, para os dois verbos dizerem a mesma coisa. */
async function somenteOCeo() {
  const session = await getSession();
  if (!session) {
    return { erro: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (session.role !== "master") {
    return {
      erro: NextResponse.json(
        { error: "TOP DOWN é do CEO — este dispositivo não é operado por mais ninguém" },
        { status: 403 },
      ),
    };
  }
  return { session };
}

function chaveValida(v: unknown): v is ChaveTopDown {
  return typeof v === "string" && v in DECISOES_TOP_DOWN;
}

export async function GET(): Promise<NextResponse> {
  const { erro } = await somenteOCeo();
  if (erro) return erro;

  const decisoes = await Promise.all(
    (Object.keys(DECISOES_TOP_DOWN) as ChaveTopDown[]).map(async (chave) => ({
      ...DECISOES_TOP_DOWN[chave],
      ...(await lerDecisao(chave)),
    })),
  );
  return NextResponse.json({ decisoes });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const { session, erro } = await somenteOCeo();
  if (erro) return erro;

  let corpo: { chave?: unknown; ligada?: unknown; motivo?: unknown };
  try {
    corpo = await request.json();
  } catch {
    return NextResponse.json({ error: "corpo inválido" }, { status: 400 });
  }

  if (!chaveValida(corpo.chave)) {
    return NextResponse.json({ error: "chave desconhecida" }, { status: 400 });
  }
  if (typeof corpo.ligada !== "boolean") {
    return NextResponse.json({ error: "ligada tem de ser sim ou não" }, { status: 400 });
  }

  // Motivo obrigatório NOS DOIS SENTIDOS. Desligar também é decisão, e
  // "por que o freio voltou?" é pergunta que alguém faz amanhã.
  const motivo = typeof corpo.motivo === "string" ? corpo.motivo.trim() : "";
  if (!motivo) {
    return NextResponse.json(
      { error: "diga o porquê — decisão sem motivo não se registra" },
      { status: 400 },
    );
  }

  // `decididoPor` sai da SESSÃO, nunca do corpo. Deixar o chamador escolher o
  // nome de quem decidiu transformaria o registro numa ficção assinável.
  const decisao = await decidir({
    chave: corpo.chave,
    ligada: corpo.ligada,
    motivo,
    decididoPor: session!.email || session!.userId,
  });

  return NextResponse.json({ ok: true, decisao });
}

// GET /api/admin/censo-do-cofre — QUANTOS SEGREDOS AINDA DEPENDEM DA CHAVE FRACA.
//
// ── POR QUE ESTA ROTA EXISTE (15/08/2026) ───────────────────────────────────
//
// `CREDENTIALS_SECRET` está definida em produção e defini-la foi seguro. Mas a
// migração para a chave forte só acontece quando cada segredo é REESCRITO — e a
// casa não tinha um só lugar capaz de dizer quantos ainda estavam para trás.
// `estadoDaChaveDeCredenciais()` e `cifradoComChaveLegada()` foram escritas em
// 06/08 "para o painel dizer a verdade" e ficaram com ZERO chamadores: a
// pergunta era irrespondível **mesmo com acesso total**. Esta rota é o meio da
// ponte que faltava.
//
// É a mesma lição do P0 do Chromium: adivinhação sobre produção custa um deploy
// por hipótese; uma rota de leitura custa um.
//
// ── AUTENTICAÇÃO: O MESMO SEGREDO DAS ROTAS DE CRON/ADMIN ───────────────────
//
// `Authorization: Bearer <CRON_SECRET>`, conferido por `segredoConfere` (tempo
// constante — comparação com `!==` vaza o segredo byte a byte). **Segredo
// ausente do ambiente → PORTA FECHADA (503)**, nunca aberta. Contrato idêntico
// ao de `/api/admin/diagnostico-do-navegador` e `/api/admin/reconciliar-drive`:
// esta casa tem UM padrão de guarda de rota administrativa, e rota nova que
// invente o segundo é a divergência que ninguém revisa.
//
// Por que ela precisa de guarda mesmo sem devolver segredo: o censo é **mapa de
// superfície**. "3 tokens de cliente na Meta, 1 App Secret, 2 do Drive" diz a
// um atacante o que existe para procurar e quanto vale o volume do backup.
//
// ── O QUE ELA NÃO FAZ ───────────────────────────────────────────────────────
//
//   • **Não devolve o valor de nenhum segredo** — nem cifrado, nem decifrado,
//     nem em dica. Só contagens e rótulos. Rota de admin que imprime segredo é
//     vazamento por screenshot.
//   • **Não re-cifra nada.** Só existe `GET`. A varredura de re-cifragem
//     reescreve dado de produção e é decisão do CEO; não foi construída de
//     propósito. Teste reprova quem der um verbo de escrita a este arquivo.
//   • **Não conta de quem é o segredo** — nem cliente, nem workspace, nem id.

import { NextRequest, NextResponse } from "next/server";
import { segredoConfere } from "@/lib/security/crypto";
import { censoDoCofre } from "@/lib/security/censo-do-cofre";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { error: "Rota administrativa não configurada — defina CRON_SECRET" },
      { status: 503 },
    );
  }
  const cabecalho = request.headers.get("authorization");
  const token = cabecalho?.startsWith("Bearer ") ? cabecalho.slice(7) : null;
  if (!segredoConfere(token, cronSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const censo = await censoDoCofre();

  // 200 mesmo com o censo cego: o corpo diz `cego` com o motivo, e quem lê
  // distingue "não consegui contar" de "não há nada preso". Trocar por 500
  // apagaria o motivo dentro de uma página de erro.
  return NextResponse.json(censo);
}

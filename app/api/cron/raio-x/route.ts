// POST /api/cron/raio-x — a metade de DADOS do raio-x noturno.
//
// Por que existe uma rota: o banco mora na produção, e o raio-x precisa saber o
// que está preso AGORA lá — não no dev.db de quem rodou o script. A metade de
// código roda no repositório; esta roda onde o dado vive.
//
// SOMENTE LEITURA, e isso é trava: `varrerDadosPresos` só faz `count`/`findFirst`
// /`findMany`, e o teste `raio-x-nao-escreve.test.ts` reprova o build se algum
// verbo de escrita entrar no módulo. Protegida por CRON_SECRET, como as outras.

import { NextRequest, NextResponse } from "next/server";
import { varrerDadosPresos } from "@/lib/raio-x/dados";
import { varrerPorCliente } from "@/lib/raio-x/por-cliente";
import { hojeEmSaoPaulo } from "@/lib/raio-x/registro";
import { segredoConfere } from "@/lib/security/crypto";
import type { Coleta } from "@/lib/raio-x/tipos";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "Cron não configurado — defina CRON_SECRET" }, { status: 503 });
  }
  const cabecalho = request.headers.get("authorization");
  const token = cabecalho?.startsWith("Bearer ") ? cabecalho.slice(7) : null;
  if (!segredoConfere(token, cronSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const agora = new Date();
  const coleta: Coleta = {
    data: hojeEmSaoPaulo(agora),
    em: agora.toISOString(),
    commit: process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) ?? "desconhecido",
    metade: "dados",
    varreduras: [await varrerDadosPresos(agora)],
  };
  // ── O RETRATO POR CLIENTE, FORA DE `varreduras` ───────────────────────────
  // Não é uma varredura: não tem padrão do kit, não produz achado e não se
  // compara com ontem por chave estável. É o CENSO que responde "quem recebeu
  // peça hoje e quem não recebeu" — a pergunta que o agregado de `medidas` não
  // consegue responder e que, em 08/08, deixou a agência sem saber qual dos 5
  // clientes estava parado. Enfiá-lo dentro de `varreduras` desalinharia o
  // histórico das coletas anteriores.
  const porCliente = await varrerPorCliente(agora);
  return NextResponse.json({ ...coleta, porCliente });
}

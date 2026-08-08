// ─── POST /api/cron/caixa-de-entrada ─────────────────────────────────────────
//
// A varredura da caixa da agência, sob demanda. **O caminho normal é o
// despertador** (`lib/agency/despertador.ts`, a cada 5 min) — esta rota existe
// para duas coisas que o relógio não dá:
//
//   • RODAR AGORA, sem esperar a próxima batida, e VER O QUE ACONTECEU. A
//     resposta traz linha por linha: o que virou oportunidade, o que era
//     duplicado, o que foi ignorado e por quê. O relógio faz o mesmo trabalho e
//     conta a história num log de container que some no deploy seguinte.
//   • Rodar de fora se um dia o despertador for desligado (`DESPERTADOR=off`).
//
// Protegida por `CRON_SECRET`, como as outras rotas de `cron/*`. Sem o segredo
// no ambiente: 503 e NADA roda — configuração faltando é porta FECHADA.

import { NextRequest, NextResponse } from "next/server";
import { segredoConfere } from "@/lib/security/crypto";
import { varrerTodasAsCaixas } from "@/lib/agency/comercial/caixa-de-entrada/varredura";

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

  const { resultados, impedidos } = await varrerTodasAsCaixas();

  return NextResponse.json({
    ok: true,
    caixas: resultados.length,
    // ⚠️ Sobe SEMPRE, mesmo vazio. Credencial de ambiente sem alvo resolvido
    // não pode virar "0 caixas, nada a fazer": é uma porta configurada que não
    // lê nada e não avisa ninguém.
    impedidos,
    // A resposta NÃO carrega o corpo de nenhum e-mail nem o texto de nenhuma
    // proposta — só o veredito por mensagem. Alerta de marketplace traz contato
    // de terceiro com frequência, e isso é PII que não pedimos.
    resultados: resultados.map((r) => ({
      workspaceId: r.workspaceId,
      rodou: r.rodou,
      motivo: r.motivo,
      examinadas: r.examinadas,
      jaConhecidas: r.jaConhecidas,
      novas: r.novas,
      duplicadas: r.duplicadas,
      ignoradas: r.ignoradas,
      falhas: r.falhas,
      qualificadas: r.qualificadas,
      linhas: r.linhas.map((l) => ({
        remetente: l.remetente,
        assunto: l.assunto,
        resultado: l.resultado,
        motivo: l.motivo,
        oportunidadeId: l.oportunidadeId,
        qualificada: l.qualificada,
      })),
    })),
  });
}

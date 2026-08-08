// ─── GET /api/agency/oportunidades/conexoes ──────────────────────────────────
//
// O SALDO DE CONEXÕES DO MÊS. É o número que decide onde o CEO gasta a próxima
// proposta — e até 08/08/2026 ele não existia em tela nenhuma.
//
// ── POR QUE ISTO É UMA ROTA, E NÃO UM CÁLCULO NA TELA ───────────────────────
// O saldo depende de `ConexaoGasta` (banco) e de `policy.json` (dado versionado
// com procedência). Calcular no cliente exigiria mandar os dois para o navegador
// e confiar que a aritmética do front bate com a do portão. Uma fonte só.
//
// ── NÃO TOCA O 99FREELAS ────────────────────────────────────────────────────
// Nenhum byte sai daqui para a plataforma. O gasto é o que ESTA CASA registrou;
// a cota é o que a política DECLARA. O saldo real da conta só existe na tela do
// 99Freelas, e isso está escrito na resposta — porque um número que parece lido
// da plataforma e não é vale menos que nenhum número.

import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/api-guard";
import { cotaMensal } from "@/lib/marketplaces/99freelas/conexoes";
import { conexoesGastasNoMes } from "@/lib/marketplaces/99freelas/contador";
import { PLATAFORMAS_COM_COTA } from "@/lib/marketplaces/cotas";

export async function GET(): Promise<NextResponse> {
  const { session, error } = await requireSession();
  if (error) return error;

  const saldos = [];
  for (const plataforma of PLATAFORMAS_COM_COTA) {
    const cota = cotaMensal(plataforma);
    const leitura = await conexoesGastasNoMes({ workspaceId: session.workspaceId, plataforma });
    saldos.push({
      plataforma,
      competencia: leitura.competencia,
      cota: cota.cota,
      cotaDoPlano: cota.cotaDoPlano,
      bonusDeMedalha: cota.bonusDeMedalha,
      plano: cota.plano,
      planoFoiDeclarado: cota.planoFoiDeclarado,
      gastas: leitura.gastas,
      restantes: Math.max(0, cota.cota - leitura.gastas),
      // ⚠️ `false` = a leitura FALHOU e `gastas` é o pior caso (a cota inteira),
      // não o número real. A tela tem de dizer isso com todas as letras: "não
      // sei quanto gastei" e "gastei tudo" produzem o mesmo número e são fatos
      // opostos. É a lição dos três `.catch(() => null)` de 07/08.
      confiavel: leitura.confiavel,
      motivoDaCota: cota.motivo,
      motivoDoContador: leitura.motivo,
    });
  }

  return NextResponse.json({
    saldos,
    aviso:
      "Este saldo é o que ESTA CASA registrou, não o que o 99Freelas mostra. Nenhum login foi feito. Ao enviar, confira o número na tela da plataforma — é ele que manda.",
  });
}

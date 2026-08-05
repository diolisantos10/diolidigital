// GET /api/meta/diagnostico — por que a conexão do cliente não conclui.
//
// Raio-x de 05/08/2026: o CEO testou o popup e disse "não está funcionando".
// A investigação levou 40 minutos de leitura de código porque não havia UM
// lugar que respondesse "o app está configurado? o login está pelo modo certo?
// alguma conta chegou a conectar?". Sem isso, todo diagnóstico começa do zero.
//
// SOMENTE LEITURA e SEM SEGREDO: responde presença e forma, nunca valor. O
// appId aparece mascarado (últimos 4), e o segredo não aparece de jeito nenhum.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireSession } from "@/lib/auth/api-guard";
import {
  resolveMetaAppCredentials,
  DEFAULT_SCOPES,
  SCOPES_QUE_EXIGEM_APP_REVIEW,
} from "@/lib/integrations/meta/config";

function mascarar(id: string): string {
  return id.length <= 4 ? "••••" : `••••${id.slice(-4)}`;
}

export async function GET(): Promise<NextResponse> {
  const { session, error } = await requireSession();
  if (error) return error;

  const creds = await resolveMetaAppCredentials(session.workspaceId);
  const configId = process.env.META_LOGIN_CONFIG_ID?.trim() || null;

  const porPlataforma: Record<string, number> = {};
  let comCliente = 0;
  try {
    const conexoes = await prisma.metaConnection.findMany({
      where: { workspaceId: session.workspaceId },
      select: { platform: true, clientId: true, status: true },
      take: 200,
    });
    for (const c of conexoes) {
      const chave = `${c.platform}:${c.status}`;
      porPlataforma[chave] = (porPlataforma[chave] ?? 0) + 1;
      if (c.clientId) comCliente++;
    }
  } catch {
    // Banco fora do ar é ausência de informação — quem lê decide, e o campo
    // abaixo diz que não deu para olhar.
    return NextResponse.json({
      ok: false,
      appConfigurado: creds !== null,
      conexoes: null,
      motivo: "banco não respondeu — a contagem de conexões não foi feita",
    });
  }

  // O diagnóstico em uma frase, na ordem em que o fluxo quebra.
  const veredito = !creds
    ? "PARA AQUI: o app da Meta não está configurado neste workspace (nem no cofre, nem no ambiente). O popup do cliente não tem para onde ir."
    : !configId
      ? "ATENÇÃO: sem META_LOGIN_CONFIG_ID, o diálogo vai pelo fluxo clássico de `scope`. Em app do tipo Business isso faz a Meta recusar o usuário com mensagem enganosa."
      : Object.keys(porPlataforma).length === 0
        ? "O app está configurado e o login usa config_id, mas NENHUMA conexão foi gravada ainda — ninguém concluiu o fluxo até o fim."
        : "Configuração completa e há conexões gravadas.";

  return NextResponse.json({
    ok: true,
    veredito,
    app: creds
      ? { configurado: true, appId: mascarar(creds.appId), origem: creds.source }
      : { configurado: false },
    // Com config_id, quem manda nas permissões é a CONFIGURAÇÃO do painel da
    // Meta — não esta lista. É a diferença entre o que pedimos e o que a Meta
    // concede, e ela explica a maioria dos "conectou mas não achou a página".
    login: {
      modo: configId ? "login_para_empresas (config_id)" : "classico (scope)",
      configIdPresente: Boolean(configId),
      escoposPedidosNoCodigo: DEFAULT_SCOPES.length,
      escoposQueExigemAppReview: SCOPES_QUE_EXIGEM_APP_REVIEW,
      ressalva: configId
        ? "Com config_id, a lista de escopos do código é IGNORADA: vale a configuração do painel da Meta."
        : null,
    },
    conexoes: { porPlataformaEStatus: porPlataforma, comClienteVinculado: comCliente },
  });
}

// ─── POST /api/agency/oportunidades/caixa/testar ─────────────────────────────
//
// "Conectou ou não conectou, e por quê." Uma frase, na tela.
//
// ── POR QUE ISTO É UMA ROTA DO APP, E NÃO UM SCRIPT ─────────────────────────
// O ambiente onde este código foi escrito **não fala IMAP**: a saída de rede só
// passa por HTTPS através de um proxy, e o socket para `imap.gmail.com:993`
// morre. Um teste rodado de lá concluiria "credencial errada" sobre uma
// credencial certa — e essa é a pior resposta que um teste de conexão pode dar,
// porque manda o CEO regenerar a senha por nada.
//
// Aqui a prova roda ONDE a rotina roda: no servidor de produção, com a mesma
// credencial, contra a mesma caixa. É a única medição que vale.
//
// ── ELE TAMBÉM CONTA ────────────────────────────────────────────────────────
// `?contar=1` devolve quantos alertas daqueles remetentes já existem na caixa
// INTEIRA. É a primeira medida real de volume desta plataforma que a casa vai
// ter, e é ela que decide se o canal vale: 3 alertas em dois anos e 300 por mês
// pedem decisões opostas. Só conta (IMAP `SEARCH`) — não baixa e não ingere.

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { limiteExcedido } from "@/lib/security/limite-no-banco";
import { credencialDaCaixa, registrarTeste } from "@/lib/agency/comercial/caixa-de-entrada/cofre";
import { LeitorImap } from "@/lib/agency/comercial/caixa-de-entrada/leitor";
import { contarAlertasNaCaixa } from "@/lib/agency/comercial/caixa-de-entrada/varredura";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Testar ABRE UMA CONEXÃO AUTENTICADA com a caixa da agência. Não é leitura de
  // painel: é uso da credencial. Fica com quem pode configurá-la.
  if (session.role !== "master") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // ── O TETO, E ELE NÃO É CONTRA ATACANTE ───────────────────────────────────
  // A rota já exige sessão de `master`. O teto existe contra o GOOGLE: cada
  // clique é uma tentativa de LOGIN na conta da agência, e uma sequência de
  // tentativas malsucedidas é o que faz o Google bloquear a conta
  // temporariamente. Um botão que se pode clicar em looping é um jeito de
  // derrubar a caixa da agência sem má intenção nenhuma — basta a senha estar
  // errada e alguém insistir. `contar` e `buscar` NÃO têm teto: elas rodam
  // dentro de uma conexão que já autenticou.
  const barrado = await limiteExcedido(request, "caixa-testar", 6, 5 * 60_000, session.workspaceId);
  if (barrado) return barrado as NextResponse;

  const cred = await credencialDaCaixa(session.workspaceId);
  if (!cred.ok) {
    // 200 com `ok:false`, não 500: "não está configurado" é uma RESPOSTA, não
    // uma falha do servidor. A tela precisa mostrar o motivo, e tela que recebe
    // 500 mostra "erro inesperado".
    return NextResponse.json({ ok: false, conectou: false, mensagem: cred.motivo, motivo: "sem-credencial" });
  }

  const leitor = new LeitorImap(cred.credencial);
  const r = await leitor.testar();
  await registrarTeste(session.workspaceId, r.ok, r.mensagem);

  if (!r.ok) {
    return NextResponse.json({
      ok: false,
      conectou: false,
      origem: cred.credencial.origem,
      caixa: cred.credencial.usuario,
      mensagem: r.mensagem,
      motivo: "conexao-recusada",
    });
  }

  const querContar = new URL(request.url).searchParams.get("contar") === "1";
  const contagem = querContar ? await contarAlertasNaCaixa(session.workspaceId) : null;

  return NextResponse.json({
    ok: true,
    conectou: true,
    origem: cred.credencial.origem,
    caixa: cred.credencial.usuario,
    remetentes: cred.credencial.remetentes,
    mensagem: r.mensagem,
    // ⚠️ `null` quando a contagem falhou — NUNCA zero. "Não consegui contar" e
    // "não há alerta nenhum" são fatos opostos, e o segundo mata o canal por
    // engano.
    alertasNaCaixa: contagem ? contagem.total : null,
    alertasPorRemetente: contagem ? contagem.porRemetente : null,
    contagemMedida: contagem ? contagem.ok : null,
    contagemMotivo: contagem ? contagem.motivo : null,
  });
}

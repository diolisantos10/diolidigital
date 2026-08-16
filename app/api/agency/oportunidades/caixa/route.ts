// ─── /api/agency/oportunidades/caixa ─────────────────────────────────────────
//
// A configuração da TERCEIRA porta do Radar: a leitura direta da caixa da
// agência por IMAP.
//
//   GET    — o estado. Configurada? por qual origem? qual caixa? quais
//            remetentes? o que a rotina faz com a caixa? o que a última rodada
//            leu? **NUNCA devolve a senha**, e há teste que reprova quem a puser
//            aqui.
//   POST   — guarda o endereço + a senha de aplicativo (cifrada) e os ajustes.
//   DELETE — apaga a credencial DESTA CASA. Não revoga no Google, e a resposta
//            diz isso.
//
// ── QUEM PODE ────────────────────────────────────────────────────────────────
// Escrever: `master`, e a conferência é no SERVIDOR — esconder o botão no menu
// é aparência, e aparência não é trava.
//
// **Ler era "qualquer sessão", e isso era um esquecimento (consertado em
// 16/08/2026).** `POST` e `DELETE` já estavam trancados em `master`; o `GET`
// ficou para trás — e é ele que devolve o endereço da caixa da agência, a lista
// de remetentes vigiados e o histórico de remetente + assunto das últimas 20
// mensagens lidas. Assunto de e-mail de terceiro é PII que ninguém autorizou a
// casa inteira a ler. Agora ele responde pela MESMA linha do inventário que a
// tela que serve — `/agency/oportunidades`, `dono_e_gestao` do Atendimento.
//
// A escrita continua `master` de propósito, e NÃO virou `exigirAdministracao`:
// isso alargaria a chave da caixa de e-mail da agência para o diretor sem
// ninguém ter decidido isso. Alargar sem ordem é o inverso do trabalho de hoje.
//
// ⚠️ Esta rota mexe numa credencial que dá acesso de LEITURA À CAIXA INTEIRA da
// agência. O GET diz isso com todas as letras, em `avisoDeAlcance`, e a tela o
// mostra ao lado do campo — o CEO precisa saber o que está entregando ANTES de
// colar, não num documento que ninguém abre.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getSession } from "@/lib/auth/session";
import { exigirApiInterna } from "@/lib/agency/organizacao/guarda";
import {
  apagarCredencial,
  credencialDoAmbienteAtiva,
  estadoDaCaixa,
  guardarCredencial,
} from "@/lib/agency/comercial/caixa-de-entrada/cofre";

const AVISO_DE_ALCANCE =
  "A senha de aplicativo dá acesso de LEITURA À CAIXA INTEIRA desta conta do Gmail — todo e-mail que ela já " +
  "recebeu e todo que vier, não só os alertas do 99Freelas. O código lê apenas as mensagens dos remetentes " +
  "abaixo, mas isso é escolha do código, não limite da chave. Para cortar de verdade, apague a senha em " +
  "myaccount.google.com/apppasswords — apagar aqui só a tira desta casa.";

const O_QUE_A_ROTINA_FAZ_COM_A_CAIXA = {
  le: true,
  apaga: false,
  move: false,
  arquiva: false,
  responde: false,
  envia: false,
};

export async function GET(): Promise<NextResponse> {
  const { acesso, erro } = await exigirApiInterna("/agency/oportunidades");
  if (erro) return erro;
  const { session } = acesso;

  const estado = await estadoDaCaixa(session.workspaceId);

  // O histórico do que a rotina leu. É o que responde "ela está funcionando?"
  // sem obrigar ninguém a abrir log de container.
  const recentes = await prisma.emailDoRadar
    .findMany({
      where: { workspaceId: session.workspaceId },
      orderBy: { processadoEm: "desc" },
      take: 20,
      // ⚠️ Recorte explícito. A tabela não guarda corpo de e-mail (ver o schema),
      // e este `select` é a segunda tranca contra alguém acrescentar um campo
      // sensível depois e ele vazar para a tela sem ninguém decidir isso.
      select: {
        id: true,
        remetente: true,
        assunto: true,
        recebidoEm: true,
        processadoEm: true,
        resultado: true,
        motivo: true,
        oportunidadeId: true,
      },
    })
    .catch(() => null);

  const contagem = await prisma.emailDoRadar
    .groupBy({ by: ["resultado"], where: { workspaceId: session.workspaceId }, _count: { _all: true } })
    .catch(() => null);

  return NextResponse.json({
    ...estado,
    avisoDeAlcance: AVISO_DE_ALCANCE,
    revogacao: {
      nestaCasa: "Apagar aqui remove a senha do cofre desta casa e fecha a porta.",
      noGoogle: "https://myaccount.google.com/apppasswords",
      oQueCortaDeVerdade:
        "Só apagar a senha de aplicativo no Google revoga o acesso. Enquanto ela existir lá, ela vale — " +
        "para esta casa e para quem mais a tiver.",
      ...(estado.origem === "ambiente"
        ? {
            atencao:
              "A senha em uso vem das Variables do Railway (RADAR_GMAIL_APP_PASSWORD). Apagar nesta tela NÃO " +
              "fecha a porta: o ambiente vence o cofre. Para desligar, remova a variável no Railway.",
          }
        : {}),
    },
    oQueAROtinaFazComACaixa: O_QUE_A_ROTINA_FAZ_COM_A_CAIXA,
    // Falha de LEITURA do histórico não vira "nenhuma mensagem lida". Zero é uma
    // afirmação sobre a caixa; "não sei" é uma afirmação sobre nós.
    historico: recentes,
    historicoMedido: recentes !== null,
    resumo: contagem ? Object.fromEntries(contagem.map((c) => [c.resultado, c._count._all])) : null,
    resumoMedido: contagem !== null,
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "master") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let corpo: { usuario?: unknown; senha?: unknown; remetentes?: unknown; marcarComoLido?: unknown };
  try {
    corpo = (await request.json()) as typeof corpo;
  } catch {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }

  const remetentes = Array.isArray(corpo.remetentes)
    ? corpo.remetentes.filter((r): r is string => typeof r === "string")
    : typeof corpo.remetentes === "string"
      ? corpo.remetentes.split(/[,\n;]+/)
      : null;

  const r = await guardarCredencial({
    workspaceId: session.workspaceId,
    usuario: typeof corpo.usuario === "string" ? corpo.usuario : "",
    senha: typeof corpo.senha === "string" ? corpo.senha : "",
    remetentes,
    marcarComoLido: corpo.marcarComoLido === true,
  });
  // ⚠️ NADA do corpo recebido é ecoado na resposta de erro, e a senha não vai
  // para log em nenhum caminho desta rota.
  if (!r.ok) return NextResponse.json({ error: r.erro }, { status: 400 });

  return NextResponse.json({
    ok: true,
    dicaDaSenha: r.dica,
    proximoPasso: "Clique em 'Testar conexão'. Guardar não prova nada — só o teste prova.",
  });
}

export async function DELETE(): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "master") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await apagarCredencial(session.workspaceId);

  const aindaAberta = credencialDoAmbienteAtiva();
  return NextResponse.json({
    ok: true,
    // "Apagado" sobre uma porta que continua aberta é a pior resposta possível:
    // ela encerra o assunto na cabeça de quem clicou.
    portaFechada: !aindaAberta,
    aviso: aindaAberta
      ? "A credencial do cofre foi apagada, MAS a porta continua aberta: RADAR_GMAIL_APP_PASSWORD está definida no " +
        "Railway e o ambiente vence o cofre. Remova a variável lá para fechar."
      : "Credencial apagada. ⚠️ Isto não revoga nada no Google — apague a senha de aplicativo em " +
        "myaccount.google.com/apppasswords, que é o que corta de verdade.",
  });
}

// GET /api/agency/diagnostico-de-email — a chave de e-mail funciona, sim ou não?
//
// ── POR QUE ESTA ROTA EXISTE (25/08/2026) ───────────────────────────────────
//
// O CEO afirmou que "o sistema já está conectado a um sistema de e-mail". A
// auditoria mediu o contrário e ficou sem como decidir: `RESEND_API_KEY`
// APARECE na lista de variáveis do Railway, mas o valor vem redigido para quem
// audita — então "cadastrada" e "funciona" eram duas coisas que ninguém
// conseguia separar de fora. Nome na lista não é chave válida, e chave válida
// não é remetente autorizado.
//
// Esta rota separa as três, SEM ENVIAR MENSAGEM NENHUMA: ela chama
// `GET https://api.resend.com/domains`, que é leitura pura, e devolve o que a
// Resend respondeu DE VERDADE — o status E o texto. Doutrina da casa, que já
// custou caro: **status de erro não é motivo; o motivo está na mensagem.**
// Um 400 já foi falta de saldo; um 404 já foi host morto.
//
// ⚠️ A CHAVE NUNCA SAI DAQUI. A resposta diz se ela existe, quantos caracteres
// tem e qual prefixo — nunca o valor. Segredo não vira relatório.
//
// Autenticação: a MESMA da tela de avisos de orçamento (gestão e
// `client-service-sdr`, via `exigirApiInterna`), OU o segredo de operação
// (`PILOTO_SECRET`/`CRON_SECRET`). Sem segredo configurado, o caminho por token
// nem abre — ausência de chave nunca vira porta aberta.

import { NextRequest, NextResponse } from "next/server";
import { exigirApiInterna } from "@/lib/agency/organizacao/guarda";
import { segredoConfere } from "@/lib/security/crypto";
import { lerRespostaDaResend } from "@/lib/email/diagnostico";

export const dynamic = "force-dynamic";

const ROTA = "/agency/avisos-de-orcamento";

async function autenticar(request: NextRequest): Promise<NextResponse | null> {
  const cabecalho = request.headers.get("authorization") ?? "";
  const segredo = process.env.PILOTO_SECRET || process.env.CRON_SECRET;
  const doHeader = cabecalho.toLowerCase().startsWith("bearer ") ? cabecalho.slice(7).trim() : null;
  if (segredo && segredoConfere(doHeader, segredo)) return null;
  const guarda = await exigirApiInterna(ROTA);
  return guarda.erro ?? null;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const erro = await autenticar(request);
  if (erro) return erro;

  const chave = process.env.RESEND_API_KEY?.trim();
  const remetente = process.env.RESEND_FROM?.trim();

  // O retrato da configuração vem ANTES da rede: mesmo que a Resend esteja
  // fora do ar, estas três linhas já respondem metade da pergunta.
  const configuracao = {
    chaveCadastrada: Boolean(process.env.RESEND_API_KEY),
    chaveEmBranco: Boolean(process.env.RESEND_API_KEY) && !chave,
    // Prefixo e tamanho identificam a chave sem revelá-la — bastam para dizer
    // "trocaram a chave" ou "colaram o valor errado no campo".
    chavePrefixo: chave ? chave.slice(0, 3) : null,
    chaveTamanho: chave ? chave.length : 0,
    remetenteCadastrado: Boolean(remetente),
    remetente: remetente ?? null,
    // Sem `RESEND_FROM`, `lib/email/send.ts` cai no remetente compartilhado da
    // Resend, que entrega SÓ para o dono da conta Resend. Chave válida + este
    // remetente = nenhum cliente recebe. É o fato mais fácil de não perceber.
    remetenteCompartilhadoDeTeste: !remetente,
  };

  if (!chave) {
    return NextResponse.json({
      medido: true,
      clienteRecebeEmail: false,
      motivo: configuracao.chaveEmBranco
        ? "RESEND_API_KEY está cadastrada no ambiente COM VALOR EM BRANCO — nome na lista, valor vazio."
        : "RESEND_API_KEY não está no ambiente.",
      configuracao,
      resend: null,
    });
  }

  let status: number | null = null;
  let corpo = "";
  try {
    const res = await fetch("https://api.resend.com/domains", {
      method: "GET",
      headers: { Authorization: `Bearer ${chave}` },
    });
    status = res.status;
    corpo = (await res.text().catch(() => "")).slice(0, 1000);
  } catch (e) {
    return NextResponse.json({
      medido: true,
      clienteRecebeEmail: false,
      motivo: `não deu para falar com a Resend: ${e instanceof Error ? e.message : "erro desconhecido"}`,
      configuracao,
      resend: null,
    });
  }

  // ⚠️ A LEITURA NÃO É O STATUS. Ver `lib/email/diagnostico.ts`: em produção
  // esta sonda tomou um 401 que significava "chave de envio válida" e o
  // chamou de "chave recusada" — o mesmo defeito que ela foi escrita para
  // acabar. O motivo está na mensagem.
  const leitura = lerRespostaDaResend(status, corpo);
  const clienteRecebeEmail = leitura.chaveValida && configuracao.remetenteCadastrado;

  return NextResponse.json({
    medido: true,
    clienteRecebeEmail,
    motivo: !leitura.chaveValida
      ? leitura.motivo
      : !configuracao.remetenteCadastrado
        ? `${leitura.motivo} MAS RESEND_FROM não está no ambiente: a casa envia pelo remetente compartilhado da Resend (onboarding@resend.dev), que só entrega para o dono da conta Resend. Cliente nenhum recebe.`
        : `${leitura.motivo} Remetente próprio configurado — confira se o domínio dele está verificado na Resend.`,
    leitura,
    configuracao,
    // A mensagem REAL do provedor, não a nossa leitura dela.
    resend: { status, corpo },
  });
}

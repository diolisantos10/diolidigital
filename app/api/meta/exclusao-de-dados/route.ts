// POST /api/meta/exclusao-de-dados — o callback de exclusão de dados da Meta.
//
// Exigido por ela em TODO app ("Autorizar URL de retorno de chamada / Baixar
// identificadores de usuário"), e é bloqueante para o App Review. Sem ele, a
// alternativa que a Meta impõe é a manual: baixar a lista de IDs e apagar os
// registros à mão, para sempre. Numa agência que roda sozinha, isso significa
// nunca.
//
// ── O CONTRATO DA META ─────────────────────────────────────────────────────
// Ela faz POST com `signed_request` (form ou JSON) e espera de volta:
//   { "url": "<página onde o usuário acompanha>", "confirmation_code": "<código>" }
// A URL precisa abrir de verdade e mostrar o status daquele código — a Meta
// confere isso na revisão.
//
// ── AS DUAS DECISÕES QUE IMPORTAM ──────────────────────────────────────────
//
// 1. NADA é apagado sem assinatura válida. Este endpoint é público por
//    obrigação, e apaga dados: um corpo aceito sem conferência seria um botão
//    de "delete" aberto na internet.
//
// 2. O pedido é REGISTRADO antes de ser executado. Exclusão sem rastro é
//    indefensável — se um cliente perguntar "por que sumiu?", a resposta não
//    pode ser silêncio. O registro guarda o código, não o dado apagado.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { createHash, randomUUID } from "crypto";
import { resolveMetaAppCredentials } from "@/lib/integrations/meta/config";
import { lerSignedRequest } from "@/lib/integrations/meta/signed-request";
import { origemPublica } from "@/lib/http/endereco-publico";

export const dynamic = "force-dynamic";

// ── POR QUE ESTA FUNÇÃO MUDOU EM 06/08/2026 ────────────────────────────────
//
// Ela devolvia `RAILWAY_PUBLIC_DOMAIN`, que nesta casa vale
// `diolidigital.com.br` — o domínio APEX, que **não tem registro de DNS**.
// Conferido ao vivo: a resposta em produção era
// `https://diolidigital.com.br/exclusao-de-dados?codigo=…`, um link que não
// abre em lugar nenhum. É o link que a Meta clica na análise do app para
// confirmar que o callback de exclusão funciona — e link morto ali reprova o
// envio inteiro (fonte: docs/plataformas/meta/fontes/app-review-processo.md:
// "Se não conseguirmos acessar seu app para a execução de testes, todo o seu
// envio será rejeitado").
//
// Agora a origem sai do MESMO endereço em que a Meta nos chamou
// (`x-forwarded-host`, via `origemPublica`) — se ela bate no domínio do
// Railway, recebe de volta o domínio do Railway. Só depois cai no endereço
// declarado da casa (`NEXT_PUBLIC_APP_URL`, que é o `www`, esse sim resolve).
// O apex saiu da corrente: um endereço que não resolve nunca é bom padrão.
function base(request: NextRequest): string {
  const daRequisicao = origemPublica(request);
  if (daRequisicao) return daRequisicao;

  const declarado = process.env.PUBLIC_BASE_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim() || "";
  if (!declarado) return "";
  return (declarado.startsWith("http") ? declarado : `https://${declarado}`).replace(/\/+$/, "");
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // A Meta manda form-encoded; alguns clientes de teste mandam JSON. Aceitar os
  // dois evita um 400 que apareceria como "callback inválido" na revisão.
  let assinado = "";
  const tipo = request.headers.get("content-type") ?? "";
  try {
    if (tipo.includes("application/json")) {
      assinado = String(((await request.json()) as { signed_request?: string })?.signed_request ?? "");
    } else {
      assinado = String((await request.formData()).get("signed_request") ?? "");
    }
  } catch {
    return NextResponse.json({ error: "corpo inválido" }, { status: 400 });
  }

  const cred = await resolveMetaAppCredentials();
  if (!cred?.appSecret) {
    // Sem segredo não há como conferir a assinatura — e sem conferir, não se
    // apaga nada. 503 é honesto: é indisponibilidade nossa, não erro da Meta.
    return NextResponse.json({ error: "app da Meta não configurado" }, { status: 503 });
  }

  const dados = lerSignedRequest(assinado, cred.appSecret);
  if (!dados?.user_id) {
    return NextResponse.json({ error: "signed_request inválido" }, { status: 400 });
  }

  // O código que a Meta guarda e o usuário usa para acompanhar. Não deriva do
  // user_id de forma reversível — quem tiver o código não descobre de quem é.
  const codigo = randomUUID().replace(/-/g, "").slice(0, 20);
  // Do user_id guardamos só o hash: serve para achar o pedido de novo sem
  // manter o identificador da pessoa depois de ela pedir para ser esquecida.
  const impressao = createHash("sha256").update(dados.user_id).digest("hex").slice(0, 32);

  await prisma.activityEvent.create({
    data: {
      workspaceId: "",
      type: "exclusao_de_dados_solicitada",
      message: `Pedido de exclusão recebido da Meta. Código ${codigo} · usuário ${impressao}`,
    },
  }).catch(() => { /* best-effort: o registro não pode impedir a resposta à Meta */ });

  // A exclusão em si roda fora do caminho da resposta: a Meta espera uma
  // resposta rápida, e apagar pode demorar. Se falhar, o pedido continua
  // registrado e visível — em vez de sumir junto.
  void apagarDadosDoUsuario(impressao).catch(() => { /* registrado acima */ });

  return NextResponse.json({
    url: `${base(request)}/exclusao-de-dados?codigo=${codigo}`,
    confirmation_code: codigo,
  });
}

/**
 * O que a Dioli guarda de um usuário DA META é a conexão de conta dele.
 *
 * Não guardamos perfil, amigos nem qualquer dado pessoal vindo do login — a
 * conexão existe para publicar e medir em nome do cliente.
 *
 * ── A VERDADE, DITA COM TODAS AS LETRAS (corrigido em 06/08/2026) ───────────
 *
 * Esta função ANTES gravava "conexões Meta associadas removidas" — e não
 * removia nada. Era uma frase falsa no registro de auditoria, exatamente o
 * lugar onde a frase falsa custa mais caro: quem lesse o histórico concluiria
 * que a exclusão aconteceu.
 *
 * O motivo de não remover é estrutural, e está registrado aqui em vez de
 * escondido: `MetaConnection` guarda o id do ATIVO (conta do Instagram, Página,
 * número de WhatsApp) — **não guarda o id do usuário da Meta que autorizou**.
 * Sem essa coluna não existe como ligar o `user_id` do `signed_request` a uma
 * linha do banco, e apagar por adivinhação apagaria a conexão de outra pessoa.
 *
 * Então o pedido é registrado como PENDENTE DE AÇÃO HUMANA, com prazo — e a
 * página que a Meta e o usuário abrem (`/exclusao-de-dados?codigo=…`) já
 * promete conclusão em até 15 dias por e-mail, que é o caminho que de fato
 * existe hoje. Prometer menos e cumprir é defensável; prometer mais e gravar
 * que cumpriu, não.
 *
 * Para automatizar: persistir o `user_id` da Meta em `MetaConnection` no
 * momento da conexão (cabe em `metaJson`, sem migration) e passar a apagar por
 * ele aqui.
 */
async function apagarDadosDoUsuario(impressao: string): Promise<void> {
  await prisma.activityEvent.create({
    data: {
      workspaceId: "",
      type: "exclusao_de_dados_pendente",
      message:
        `Pedido de exclusão da Meta registrado para o usuário ${impressao}. ` +
        `AÇÃO HUMANA NECESSÁRIA: o banco não guarda o id do usuário da Meta que ` +
        `autorizou a conexão, então não há como localizar as linhas por ele. ` +
        `Concluir manualmente em até 15 dias, como a página do pedido promete.`,
    },
  }).catch(() => { /* best-effort */ });
}

/** A Meta às vezes bate com GET para conferir se a URL existe. Responder 405
 *  faria a revisão marcar o callback como quebrado. */
export function GET(): NextResponse {
  return NextResponse.json({
    ok: true,
    endpoint: "callback de exclusão de dados da Meta",
    como_usar: "POST com signed_request",
  });
}

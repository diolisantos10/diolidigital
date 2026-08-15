// O ENDEREÇO PÚBLICO DA CASA — uma fonte só.
//
// A cicatriz de 06/08/2026: o CEO clicou em "Conectar Facebook/Instagram" no
// portal e a janela abriu em `http://0.0.0.0:8080/api/meta/connect-parceiro`.
// Endereço interno do contêiner, vazado para o navegador dele.
//
// A causa foi `new URL(caminho, request.url)`. Atrás de um proxy — e Railway é
// um proxy — `request.url` é o endereço em que o processo ESCUTA, não o
// endereço em que o mundo o ALCANÇA. Os dois são diferentes em produção e
// iguais no seu laptop, que é exatamente o que faz esse bug passar pelo
// desenvolvimento inteiro e só aparecer no cliente.
//
// ── A ORDEM, e por que ela é essa ──────────────────────────────────────────
//
// 1. `x-forwarded-host` — o que o proxy diz que o navegador pediu. É a
//    verdade mais próxima do usuário.
// 2. `NEXT_PUBLIC_APP_URL` — o endereço declarado da casa. Serve quando não há
//    proxy no caminho.
// 3. `host` — último recurso.
//
// Nunca `request.url`. Nunca.
//
// ── A TRAVA ────────────────────────────────────────────────────────────────
//
// Endereço de laço interno (`0.0.0.0`, `[::]`) é RECUSADO mesmo vindo do
// cabeçalho: ele não alcança ninguém de fora, e devolver um link assim para o
// cliente é entregar uma porta que não abre. Localhost continua passando —
// desenvolvimento é caso legítimo, laço interno em produção não é.

/** Hosts que não alcançam ninguém de fora. `localhost` NÃO entra: é dev. */
const NAO_ALCANCA = new Set(["0.0.0.0", "[::]", "::", "0"]);

// ── O ENDEREÇO DE LINK QUE SAI PARA O CLIENTE (15/08/2026) ──────────────────
//
// `origemPublica` serve a quem tem uma REQUISIÇÃO na mão (aí o
// `x-forwarded-host` é a verdade mais próxima do usuário). Aviso de WhatsApp,
// e-mail e retorno de pagamento nascem FORA de requisição — em cron, em fila,
// em rotina — e por isso precisam de um endereço declarado.
//
// O defeito que isto fecha: cada um desses lugares tinha o próprio padrão.
// `avisos.ts` e o retorno do Mercado Pago caíam em STRING VAZIA quando a
// variável não estava definida — e link vazio vira `/portal/access/<token>`,
// um caminho relativo dentro de uma mensagem de WhatsApp, que não abre nada na
// mão do cliente. `notifications.ts` tinha o endereço do Railway escrito à mão.
// Três padrões diferentes para a mesma pergunta é três lugares para esquecer no
// dia da troca de domínio.
//
// ── A TROCA DE DOMÍNIO É UMA VARIÁVEL, NÃO UM COMMIT ────────────────────────
// `diolidigital.com.br` e `www.diolidigital.com.br` já estão cadastrados no
// Railway, mas o `targetPort` está vazio (o serviço responde na 8080) — ou
// seja, **o domínio oficial ainda não atende**. Por isso o padrão continua
// sendo o endereço de hoje: trocá-lo agora mandaria o cliente para uma porta
// que não abre, e link quebrado é pior que link feio. Quando o CEO fechar a
// porta e o DNS, basta definir `NEXT_PUBLIC_APP_URL` — nenhum código muda.
//
// ⚠️ EFEITO COLATERAL QUE O CLIENTE MERECE SABER ANTES: o cookie do portal
// (`dioli_portal`) tem escopo de DOMÍNIO. Trocar o domínio DERRUBA todas as
// sessões abertas em `up.railway.app` — quem estiver logado no portal precisa
// abrir o link de acesso de novo.

/** O endereço oficial da casa. Destino declarado da migração. */
export const ENDERECO_OFICIAL = "https://www.diolidigital.com.br";

/** O endereço que responde HOJE. É o padrão até o domínio oficial atender. */
export const ENDERECO_DE_HOJE = "https://dioli-agency-os-1-production.up.railway.app";

/**
 * A base de todo link ABSOLUTO que sai para o cliente fora de uma requisição.
 * Um lugar só: aviso de WhatsApp, e-mail e retorno de pagamento leem daqui.
 * Nunca devolve string vazia — link relativo numa mensagem não abre nada.
 */
export function baseDeLink(): string {
  const declarado = (process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? "").trim();
  return (declarado || ENDERECO_DE_HOJE).replace(/\/+$/, "");
}

function soOHost(valor: string): string {
  // `x-forwarded-host` pode vir com vários, separados por vírgula: o primeiro é
  // o do cliente. E a porta não conta para decidir se o host alcança.
  const primeiro = valor.split(",")[0]!.trim();
  return primeiro.replace(/:\d+$/, "").toLowerCase();
}

/**
 * A origem pública, sem barra no fim. Ex.: `https://www.diolidigital.com.br`.
 *
 * Devolve `null` quando não dá para saber — e quem chama decide o que fazer com
 * isso. Chutar um endereço é pior que admitir que não sabe: o chute vira link
 * quebrado na mão do cliente, e ninguém descobre até ele reclamar.
 */
export function origemPublica(req: {
  headers: { get(nome: string): string | null };
}): string | null {
  const declarado = (process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? "").trim();

  const encaminhado = req.headers.get("x-forwarded-host");
  if (encaminhado && !NAO_ALCANCA.has(soOHost(encaminhado))) {
    const proto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";
    return `${proto}://${encaminhado.split(",")[0]!.trim()}`;
  }

  if (declarado) return declarado.replace(/\/+$/, "");

  const host = req.headers.get("host");
  if (host && !NAO_ALCANCA.has(soOHost(host))) {
    const proto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";
    return `${proto}://${host}`;
  }

  return null;
}

/** Uma URL absoluta pública a partir de um caminho. `null` = não deu para saber. */
export function urlPublica(
  req: { headers: { get(nome: string): string | null } },
  caminho: string,
): string | null {
  const origem = origemPublica(req);
  return origem ? `${origem}${caminho.startsWith("/") ? "" : "/"}${caminho}` : null;
}

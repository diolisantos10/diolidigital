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

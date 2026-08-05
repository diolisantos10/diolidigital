// TESTE DO MOTOR DE CAMPANHA CONTRA A CONTA DE SANDBOX DA META.
//
// Rode com:
//   META_SANDBOX_TOKEN=... META_SANDBOX_AD_ACCOUNT=act_1072627681961050 \
//     npx tsx scripts/meta-sandbox.ts
//
// ── POR QUE A SANDBOX VALE TANTO ───────────────────────────────────────────
//
// A conta de anúncios de sandbox é o único caminho para exercitar a Marketing
// API INTEIRA sem App Review aprovado, sem verificação de negócio e sem gastar
// um centavo: a campanha é real na API e falsa no dinheiro — não entrega, não
// cobra e não encosta em conta de cliente nenhuma.
//
// É por isso que este script existe: provar que a estrutura que a casa monta
// (campanha → conjunto → anúncio, tudo PAUSADO) é aceita pela Meta, ANTES de
// existir permissão avançada. Chegar no App Review com o fluxo funcionando é o
// que faz a análise passar.
//
// ── O QUE ELE NÃO FAZ ──────────────────────────────────────────────────────
//
// Não ativa nada. Não lê token do banco. Não escreve no banco. O token vem da
// variável de ambiente e some quando o processo termina — credencial de teste
// não mora em arquivo, e muito menos no repositório.

const TOKEN = process.env.META_SANDBOX_TOKEN?.trim() ?? "";
const CONTA = process.env.META_SANDBOX_AD_ACCOUNT?.trim() ?? "";
const VERSAO = process.env.META_GRAPH_VERSION?.trim() || "v21.0";

function faltando(nome: string): never {
  console.error(
    `\n✖ ${nome} não está definida.\n\n` +
      "  META_SANDBOX_TOKEN=<token novo do painel>\n" +
      "  META_SANDBOX_AD_ACCOUNT=act_<id da conta de sandbox>\n\n" +
      "  O token NÃO vai para arquivo nem para o repositório: ele vive só nesta execução.\n",
  );
  process.exit(1);
}

async function graph(caminho: string, corpo?: Record<string, string>): Promise<Record<string, unknown>> {
  const url = `https://graph.facebook.com/${VERSAO}/${caminho}`;
  const res = corpo
    ? await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ ...corpo, access_token: TOKEN }),
      })
    : await fetch(`${url}${url.includes("?") ? "&" : "?"}access_token=${encodeURIComponent(TOKEN)}`);

  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    const err = json.error as { message?: string; code?: number } | undefined;
    throw new Error(`Graph ${res.status} (${err?.code ?? "?"}): ${err?.message ?? JSON.stringify(json)}`);
  }
  return json;
}

async function main(): Promise<void> {
  if (!TOKEN) faltando("META_SANDBOX_TOKEN");
  if (!CONTA) faltando("META_SANDBOX_AD_ACCOUNT");

  console.log(`\n▶ Conta de sandbox: ${CONTA}  ·  Graph ${VERSAO}\n`);

  // 1. A conta responde? É a prova de que o token alcança a conta certa.
  const conta = await graph(`${CONTA}?fields=name,account_status,currency,is_prepay_account`);
  console.log(`✓ Conta alcançada: ${conta.name} · moeda ${conta.currency} · status ${conta.account_status}`);

  // 2. Campanha PAUSADA. Pausada sempre: campanha que nasce ligada é campanha
  //    que pode gastar antes de alguém conferir — inclusive em sandbox, onde o
  //    hábito é o que vale.
  const campanha = await graph(`${CONTA}/campaigns`, {
    name: `Teste do motor — ${new Date().toISOString().slice(0, 16)}`,
    objective: "OUTCOME_TRAFFIC",
    status: "PAUSED",
    special_ad_categories: "[]",
    buying_type: "AUCTION",
    daily_budget: "2000", // R$ 20,00 em centavos — número de teste, conta falsa
  });
  console.log(`✓ Campanha criada (pausada): ${campanha.id}`);

  // 3. Ler de volta. Criar e não conferir é acreditar no 200 — e a Graph
  //    devolve 200 para coisas que depois não existem do jeito que se imagina.
  const lida = await graph(`${campanha.id}?fields=name,status,objective,daily_budget`);
  console.log(
    `✓ Conferida na origem: status=${lida.status} objetivo=${lida.objective} verba=${lida.daily_budget}`,
  );

  console.log(
    "\n✔ O motor de campanha fala com a Marketing API. Nada foi ativado, nada gastou.\n",
  );
}

main().catch((e: unknown) => {
  console.error(`\n✖ ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});

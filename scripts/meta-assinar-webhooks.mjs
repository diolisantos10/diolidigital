// ASSINAR OS WEBHOOKS DO APP — por API, não por clique.
//
// O CEO passou a noite de 05/08 no painel da Meta tentando validar o callback à
// mão, e o painel só deixa marcar um objeto por vez. Isto existe para que ele
// nunca mais faça isso: o parecer do especialista (docs/plataformas/
// parecer-o-que-a-api-faz.md, item 1) já confirmou que a assinatura inteira é
// chamada de API com app access token.
//
//   POST /{app-id}/subscriptions  ·  access_token = {app-id}|{app-secret}
//   > "An app access token is required to add new subscriptions for that app."
//
// ── O QUE ELE NÃO FAZ ──────────────────────────────────────────────────────
//
// Não publica nada, não gasta nada e não toca em conta de cliente. Assinar
// webhook é dizer à Meta PARA ONDE avisar — é leitura chegando, não escrita
// saindo. E é idempotente: reassinar o mesmo campo não duplica.
//
// Rode com:
//   META_APP_ID=... META_APP_SECRET=... META_CALLBACK=https://.../api/meta/webhooks \
//     META_WEBHOOK_VERIFY_TOKEN=... node scripts/meta-assinar-webhooks.mjs [--apply]
//
// Sem --apply ele só mostra o que faria e o que já está assinado.

const APP_ID = (process.env.META_APP_ID ?? "").trim();
const APP_SECRET = (process.env.META_APP_SECRET ?? "").trim();
const VERIFY = (process.env.META_WEBHOOK_VERIFY_TOKEN ?? "").trim();
const CALLBACK = (process.env.META_CALLBACK ?? "").trim();
const VERSAO = (process.env.META_GRAPH_VERSION ?? "v21.0").trim();
const APLICAR = process.argv.includes("--apply");

// Os objetos e campos que esta casa precisa ouvir. Lista fechada: webhook que
// ninguém lê é ruído que custa banda e esconde o que importa.
const ASSINATURAS = [
  { objeto: "application", campos: ["ad_account"] },
  { objeto: "page", campos: ["feed", "messages"] },
  { objeto: "instagram", campos: ["comments", "messages"] },
  { objeto: "whatsapp_business_account", campos: ["messages", "message_template_status_update"] },
  { objeto: "permissions", campos: ["ads_management", "ads_read"] },
];

function faltando(nome) {
  console.error(`\n✖ ${nome} não está definida. Nada foi assinado.\n`);
  process.exit(1);
}

const token = `${APP_ID}|${APP_SECRET}`;

async function listar() {
  const url = `https://graph.facebook.com/${VERSAO}/${APP_ID}/subscriptions?access_token=${encodeURIComponent(token)}`;
  const res = await fetch(url);
  const json = await res.json();
  if (!res.ok) throw new Error(`listar: ${JSON.stringify(json.error ?? json)}`);
  return json.data ?? [];
}

async function assinar({ objeto, campos }) {
  const res = await fetch(`https://graph.facebook.com/${VERSAO}/${APP_ID}/subscriptions`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      object: objeto,
      callback_url: CALLBACK,
      fields: campos.join(","),
      verify_token: VERIFY,
      include_values: "true",
      access_token: token,
    }),
  });
  const json = await res.json();
  if (!res.ok) {
    const e = json.error ?? {};
    // A Meta mente sobre a causa com frequência. O código bruto vai junto para
    // que o diagnóstico não dependa da frase dela.
    throw new Error(`${objeto}: (${e.code ?? "?"}/${e.error_subcode ?? "-"}) ${e.message ?? JSON.stringify(json)}`);
  }
  return json;
}

async function main() {
  if (!APP_ID) faltando("META_APP_ID");
  if (!APP_SECRET) faltando("META_APP_SECRET");
  if (!VERIFY) faltando("META_WEBHOOK_VERIFY_TOKEN");
  if (!CALLBACK) faltando("META_CALLBACK");

  const antes = await listar();
  console.log(`\n▶ App ${APP_ID} · callback ${CALLBACK}`);
  console.log(`  Já assinado: ${antes.length ? antes.map((s) => s.object).join(", ") : "nada"}\n`);

  if (!APLICAR) {
    for (const a of ASSINATURAS) console.log(`  [plano] ${a.objeto} → ${a.campos.join(", ")}`);
    console.log("\n  Nada foi feito. Rode de novo com --apply.\n");
    return;
  }

  const falhas = [];
  for (const a of ASSINATURAS) {
    try {
      await assinar(a);
      console.log(`  ✓ ${a.objeto} → ${a.campos.join(", ")}`);
    } catch (e) {
      // Uma falha não derruba as outras: assinar o que dá é melhor que assinar
      // nada, desde que a falha apareça inteira no fim.
      console.log(`  ✖ ${e.message}`);
      falhas.push(e.message);
    }
  }

  const depois = await listar();
  console.log(`\n  Conferido na origem: ${depois.map((s) => s.object).join(", ") || "nada"}`);
  if (falhas.length) {
    console.log(`\n✖ ${falhas.length} assinatura(s) falharam — acima, com o código da Meta.\n`);
    process.exit(1);
  }
  console.log("\n✔ Webhooks assinados. Ninguém clicou no painel.\n");
}

main().catch((e) => {
  console.error(`\n✖ ${e.message}\n`);
  process.exit(1);
});

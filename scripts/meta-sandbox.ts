// TESTE DO MOTOR DE CAMPANHA CONTRA A CONTA DE SANDBOX DA META.
//
// Rode com:
//   META_SANDBOX_TOKEN=... META_SANDBOX_AD_ACCOUNT=act_1072627681961050 \
//     META_SANDBOX_PAGE=<id da página> npx tsx scripts/meta-sandbox.ts
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
// ── AS TRAVAS QUE VALEM AQUI (e por que elas existem) ──────────────────────
//
// 1. NADA NASCE ATIVO. Campanha, conjunto e anúncio saem PAUSED. Em sandbox
//    não há dinheiro, mas é o HÁBITO que precisa estar certo — o mesmo código
//    roda em conta de cliente.
// 2. TODA ESCRITA PASSA PELO CATÁLOGO FECHADO (`lib/integrations/meta/travas.ts`).
//    Operação que não está no catálogo não acontece.
// 3. TODA CHAMADA PAGA A COTA POR PONTUAÇÃO (`lib/integrations/meta/cota-de-anuncios.ts`):
//    leitura 1 ponto, escrita 3, teto 60 por conta a cada 300 segundos no
//    nível de desenvolvimento (fonte capturada em 06/08/2026:
//    docs/plataformas/meta/fontes/marketing-api-limites-de-taxa.md). Este
//    roteiro inteiro custa ~20 pontos — cabe, com folga, numa janela.
// 4. RITMO DE GENTE, NÃO DE MÁQUINA. Há uma pausa entre escritas. Foi rajada de
//    escrita por API que restringiu a conta da agência em 03/08/2026, e as
//    chamadas de sandbox contam para a qualificação de Acesso Total (500
//    chamadas em 15 dias, taxa de erro < 15%) — pressa aqui é erro lá.
//
// ── O QUE ELE NÃO FAZ ──────────────────────────────────────────────────────
//
// Não ativa nada. Não lê token do banco. O token vem da variável de ambiente e
// some quando o processo termina — credencial de teste não mora em arquivo, e
// muito menos no repositório. O ÚNICO uso do banco é o contador de cota, que
// precisa atravessar processo e réplica.

import { CATALOGO, pesoDaOperacao } from "@/lib/integrations/meta/travas";
import { reservarPontosDaConta, retratoDaCota } from "@/lib/integrations/meta/cota-de-anuncios";

const TOKEN = process.env.META_SANDBOX_TOKEN?.trim() ?? "";
const CONTA = process.env.META_SANDBOX_AD_ACCOUNT?.trim() ?? "";
const PAGINA = process.env.META_SANDBOX_PAGE?.trim() ?? "";
const VERSAO = process.env.META_GRAPH_VERSION?.trim() || "v21.0";
const LINK = process.env.META_SANDBOX_LINK?.trim() || "https://dioli.studio";
const IMAGEM = process.env.META_SANDBOX_IMAGE?.trim()
  || "https://www.facebook.com/images/fb_icon_325x325.png";

/** Pausa entre escritas. Não é cerimônia: é o oposto da assinatura que
 *  restringiu a conta da agência (36 uploads e criação/exclusão em minutos). */
const PAUSA_ENTRE_ESCRITAS_MS = Number(process.env.META_SANDBOX_PAUSA_MS ?? 4000);

function faltando(nome: string): never {
  console.error(
    `\n✖ ${nome} não está definida.\n\n` +
      "  META_SANDBOX_TOKEN=<token novo do painel>\n" +
      "  META_SANDBOX_AD_ACCOUNT=act_<id da conta de sandbox>\n" +
      "  META_SANDBOX_PAGE=<id da página usada no criativo>   (só para o anúncio)\n\n" +
      "  O token NÃO vai para arquivo nem para o repositório: ele vive só nesta execução.\n",
  );
  process.exit(1);
}

function dormir(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * A única porta deste script para a Meta — e ela é travada:
 *   • a operação precisa estar no catálogo fechado;
 *   • a cota por pontuação da conta é reservada ANTES da chamada;
 *   • teto estourado = PARA. Não existe retentativa em laço aqui.
 */
async function graph(
  operacao: string,
  caminho: string,
  corpo?: Record<string, string>,
): Promise<Record<string, unknown>> {
  const ficha = CATALOGO[operacao];
  if (!ficha) {
    throw new Error(
      `operação "${operacao}" não está no catálogo de lib/integrations/meta/travas.ts — não vou inventar uma escrita`,
    );
  }
  if (ficha.escreve && !corpo) throw new Error(`"${operacao}" é escrita e veio sem corpo`);
  if (!ficha.escreve && corpo) throw new Error(`"${operacao}" é leitura e veio com corpo`);
  if (ficha.gastaDinheiro) {
    throw new Error(`"${operacao}" ativa entrega — este script NUNCA ativa nada`);
  }

  const reserva = await reservarPontosDaConta(CONTA, { operacao, metodo: corpo ? "POST" : "GET" });
  if (!reserva.ok) {
    throw new Error(`${reserva.frase} (esperar ~${reserva.esperarSegundos}s)`);
  }

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
    const err = json.error as { message?: string; code?: number; error_subcode?: number } | undefined;
    throw new Error(
      `Graph ${res.status} (${err?.code ?? "?"}${err?.error_subcode ? `/${err.error_subcode}` : ""}): ` +
        `${err?.message ?? JSON.stringify(json)}`,
    );
  }
  console.log(`   · ${operacao} — ${pesoDaOperacao(operacao)} ponto(s) de cota`);
  if (ficha.escreve) await dormir(PAUSA_ENTRE_ESCRITAS_MS);
  return json;
}

async function main(): Promise<void> {
  if (!TOKEN) faltando("META_SANDBOX_TOKEN");
  if (!CONTA) faltando("META_SANDBOX_AD_ACCOUNT");

  console.log(`\n▶ Conta de sandbox: ${CONTA}  ·  Graph ${VERSAO}\n`);

  // 1. A conta responde? É a prova de que o token alcança a conta certa.
  const conta = await graph("ler_conta", `${CONTA}?fields=name,account_status,currency,is_prepay_account`);
  console.log(`✓ Conta alcançada: ${conta.name} · moeda ${conta.currency} · status ${conta.account_status}`);

  // 2. Campanha PAUSADA. Pausada sempre: campanha que nasce ligada é campanha
  //    que pode gastar antes de alguém conferir — inclusive em sandbox, onde o
  //    hábito é o que vale.
  //
  //    O orçamento fica na CAMPANHA (CBO), como em ads.ts: orçamento por
  //    conjunto multiplica o gasto pelo número de conjuntos.
  const campanha = await graph("criar_campanha_pausada", `${CONTA}/campaigns`, {
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
  const lida = await graph("ler_campanha", `${campanha.id}?fields=name,status,objective,daily_budget`);
  console.log(
    `✓ Conferida na origem: status=${lida.status} objetivo=${lida.objective} verba=${lida.daily_budget}`,
  );

  // 4. CONJUNTO DE ANÚNCIOS — pausado. Sem conjunto a campanha não entrega
  //    nada: ela é só um envelope com verba. É o buraco que o raio-x de
  //    02/08/2026 encontrou na esteira ("tráfego pago pronto" sem nada rodando).
  //    Sem orçamento aqui (ele está na campanha) e com público mínimo honesto.
  const conjunto = await graph("criar_conjunto_pausado", `${CONTA}/adsets`, {
    name: "Conjunto de teste — tráfego",
    campaign_id: String(campanha.id),
    status: "PAUSED",
    billing_event: "IMPRESSIONS",
    optimization_goal: "LINK_CLICKS",
    targeting: JSON.stringify({
      geo_locations: { countries: ["BR"] },
      age_min: 18,
      age_max: 65,
    }),
  });
  console.log(`✓ Conjunto criado (pausado): ${conjunto.id}`);

  const conjuntoLido = await graph(
    "ler_conjunto",
    `${conjunto.id}?fields=name,status,campaign_id,optimization_goal,billing_event`,
  );
  console.log(
    `✓ Conferido na origem: status=${conjuntoLido.status} meta=${conjuntoLido.optimization_goal}`,
  );

  // 5. CRIATIVO + ANÚNCIO — pausados. É o último degrau da estrutura, e o que
  //    o App Review precisa ver funcionando.
  if (!PAGINA) {
    console.log(
      "\n⚠ META_SANDBOX_PAGE não foi informada: criativo e anúncio NÃO foram criados.\n" +
        "  A Meta exige uma Página no `object_story_spec` — sem ela, o criativo é recusado.\n" +
        "  A estrutura provada nesta rodada vai até o CONJUNTO.\n",
    );
    await relatorioDeCota();
    return;
  }

  const criativo = await graph("criar_criativo", `${CONTA}/adcreatives`, {
    name: "Criativo de teste",
    object_story_spec: JSON.stringify({
      page_id: PAGINA,
      link_data: {
        picture: IMAGEM,
        link: LINK,
        message: "Teste de estrutura da Marketing API — nada é veiculado.",
        name: "Dioli Digital",
        call_to_action: { type: "LEARN_MORE" },
      },
    }),
  });
  console.log(`✓ Criativo criado: ${criativo.id}`);

  const anuncio = await graph("criar_anuncio_pausado", `${CONTA}/ads`, {
    name: "Anúncio de teste",
    adset_id: String(conjunto.id),
    creative: JSON.stringify({ creative_id: criativo.id }),
    status: "PAUSED",
  });
  console.log(`✓ Anúncio criado (pausado): ${anuncio.id}`);

  const anuncioLido = await graph(
    "ler_anuncio",
    `${anuncio.id}?fields=name,status,effective_status,adset_id,creative`,
  );
  console.log(
    `✓ Conferido na origem: status=${anuncioLido.status} efetivo=${anuncioLido.effective_status}`,
  );

  console.log(
    "\n✔ Estrutura COMPLETA aceita pela Marketing API:\n" +
      `   campanha ${campanha.id} → conjunto ${conjunto.id} → anúncio ${anuncio.id} (criativo ${criativo.id})\n` +
      "   Tudo PAUSADO. Nada foi ativado, nada gastou.\n",
  );
  await relatorioDeCota();
}

async function relatorioDeCota(): Promise<void> {
  const r = await retratoDaCota(CONTA);
  console.log(`▸ Cota da conta nesta janela de 300s: ${r.pontos} de ${r.teto} pontos.`);
}

main().catch((e: unknown) => {
  console.error(`\n✖ ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});

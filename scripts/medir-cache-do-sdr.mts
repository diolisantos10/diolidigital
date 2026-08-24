/**
 * MEDIR O CACHE DO PROMPT DO SDR — o antes e o depois, com número medido.
 *
 * Achado de 24/08/2026: o prompt do SDR tem ~10.700 tokens e é reenviado a CADA
 * turno. Numa conversa de 16 turnos, 171k dos 192k tokens de entrada eram o
 * MESMO texto — ~US$ 0,65 por briefing, EM PRODUÇÃO, de puro desperdício.
 *
 * Este script não estima: ele faz as chamadas e lê `usage` do provedor.
 *
 *   • CONTROLE  — uma chamada SEM cache. É o "antes".
 *   • GRAVAÇÃO  — a primeira com cache: escreve o prefixo (custa ~1,25x).
 *   • LEITURA   — a segunda com cache: deve LER o prefixo (custa ~0,1x).
 *
 * Se a terceira não ler nada, o cache não está funcionando e a economia é
 * imaginária — é exatamente o que este script existe para não deixar passar.
 *
 * Gasta 3 chamadas de IA. Nenhum segredo é impresso.
 */

import { chaveDoAmbiente } from "../lib/ai/resolve-key.ts";
import { generate } from "../lib/ai/generate.ts";
import { sistemaDoSdr } from "../lib/agency/comercial/prompt-do-sdr.ts";

// Sonnet: US$ 3 / MTok de entrada, US$ 15 / MTok de saída.
// Cache: gravar ~1,25x a entrada; ler ~0,1x.
const IN = 3 / 1e6, OUT = 15 / 1e6;
const custo = (u: { entrada: number | null; saida: number | null; cacheEscrito?: number | null; cacheLido?: number | null }) =>
  (u.entrada ?? 0) * IN + (u.saida ?? 0) * OUT + (u.cacheEscrito ?? 0) * IN * 1.25 + (u.cacheLido ?? 0) * IN * 0.1;

async function main(): Promise<number> {
  const chave = chaveDoAmbiente("claude");
  if (!chave) {
    console.error("⛔ ANTHROPIC_API_KEY não está no ambiente. Sem ela não há o que medir.");
    return 1;
  }
  const system = sistemaDoSdr();
  console.log(`system prompt do SDR: ${system.length} caracteres\n`);

  const chamar = async (rotulo: string, cachear: boolean) => {
    const r = await generate({
      system,
      user: "Oi! Somos a Cantina da Prova, um restaurante italiano em Pinheiros.",
      maxTokens: 512,
      agentId: "comercial-sdr",
      tentativas: 1,
      cachearSistema: cachear,
      chaveJaResolvida: { provider: "claude", apiKey: chave.apiKey, model: chave.model },
    });
    const u = r.uso ?? { entrada: null, saida: null };
    console.log(
      `${rotulo.padEnd(22)} entrada=${String(u.entrada).padStart(6)} ` +
      `saída=${String(u.saida).padStart(4)} ` +
      `cacheEscrito=${String(u.cacheEscrito ?? "—").padStart(6)} ` +
      `cacheLido=${String(u.cacheLido ?? "—").padStart(6)} ` +
      `→ US$ ${custo(u).toFixed(5)}`,
    );
    if (!r.ok) console.log(`   ⚠️ a chamada falhou: ${r.error}`);
    return { u, custo: custo(u) };
  };

  const semCache = await chamar("SEM cache (antes)", false);
  const gravacao = await chamar("COM cache (gravação)", true);
  const leitura = await chamar("COM cache (leitura)", true);

  console.log("\n── O VEREDITO ──────────────────────────────────────────────");
  const leu = (leitura.u.cacheLido ?? 0) > 0;
  if (!leu) {
    console.log("🚫 O cache NÃO foi lido na terceira chamada. A economia é imaginária.");
    console.log("   Algo está invalidando o prefixo entre as chamadas — não comemore.");
    return 2;
  }
  const economia = 1 - leitura.custo / semCache.custo;
  console.log(`✅ Cache LIDO: ${leitura.u.cacheLido} tokens.`);
  console.log(`   Turno sem cache: US$ ${semCache.custo.toFixed(5)}`);
  console.log(`   Turno com cache: US$ ${leitura.custo.toFixed(5)}`);
  console.log(`   Economia por turno: ${(economia * 100).toFixed(1)}%`);
  console.log(`\n   Conversa de 16 turnos (1 gravação + 15 leituras):`);
  const antes = semCache.custo * 16;
  const depois = gravacao.custo + leitura.custo * 15;
  console.log(`     antes  ≈ US$ ${antes.toFixed(3)}`);
  console.log(`     depois ≈ US$ ${depois.toFixed(3)}   (${((1 - depois / antes) * 100).toFixed(1)}% menos)`);
  console.log(`\n   ⚠️ Números de UMA medição, com histórico curto. A conversa real`);
  console.log(`   tem histórico crescente, que NÃO é cacheado — a economia real fica`);
  console.log(`   entre este número e zero, mais perto deste. Não arredonde para cima.`);
  return 0;
}

main().then((c) => process.exit(c), (e) => {
  console.error(`\n❌ ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});

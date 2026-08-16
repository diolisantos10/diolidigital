import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { generateStrategyCanvas } from "@/lib/dioli-brain/strategy-engine";
import { generateSocialCanvas } from "@/lib/dioli-brain/social-engine";

// ─────────────────────────────────────────────────────────────────────────────
// A PREMISSA QUE ESTAVA ERRADA — e por que um teste passou a guardá-la
//
// `docs/pendencias.md` registrava, como "dinheiro real sem dono": *"cada
// briefing dispara `runAutoScope`, e cada disparo é uma fatura de IA. Cinco
// briefings do mesmo contato = cinco faturas."*
//
// **É falso, e foi medido duas vezes em 16/08/2026, por duas lentes
// independentes:**
//
//   1. MEDIÇÃO EMPÍRICA — um POST real na rota pública, contando `AIRunLog`
//      antes e depois: **0 chamadas de IA**, 6 `BrainArtifact` gerados.
//   2. LEITURA — o especialista `seguranca`, sem saber da medição, corrigiu a
//      mesma premissa: os 6 motores de `lib/dioli-brain/` não importam
//      provedor nenhum. O gasto real de IA está na rota do SDR (por MENSAGEM
//      da conversa), não no briefing.
//
// Isso importa porque estava para ser construído um freio contra um custo que
// não existe, enquanto o custo real fica noutra rota. **Defeito diagnosticado
// errado consome o orçamento de conserto e deixa o dano vivo.**
//
// Este arquivo trava a premissa CORRETA: o caminho do briefing é determinístico.
// Se alguém puser uma chamada de IA num dos motores, isto cai — e a casa
// descobre no CI, não na fatura.
// ─────────────────────────────────────────────────────────────────────────────

const CADEIA = [
  "lib/dioli-brain/run-auto-scope.ts",
  "lib/dioli-brain/strategy-engine.ts",
  "lib/dioli-brain/social-engine.ts",
  "lib/dioli-brain/design-engine.ts",
  "lib/dioli-brain/traffic-engine.ts",
  "lib/dioli-brain/analytics-engine.ts",
  "lib/dioli-brain/quality-engine.ts",
];

/** Um provedor de IA entra por import. Chamada de rede solta entra por `fetch`. */
const PROVEDOR = /from\s+["'](openai|@anthropic-ai\/[^"']+|@google\/[^"']+|groq-sdk)["']|\breason\(|\bcallAI\(|\bfetch\(/;

describe("o briefing NÃO gera fatura de IA — a premissa da pendência estava errada", () => {
  it("nenhum arquivo da cadeia do auto-escopo chama provedor de IA", () => {
    // A prova estrutural. Cinco briefings do mesmo contato geram 30 artefatos
    // determinísticos e ZERO chamada paga — o que a medição empírica confirmou
    // (AIRunLog: 0 antes, 0 depois).
    for (const caminho of CADEIA) {
      const fonte = readFileSync(join(process.cwd(), caminho), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .split("\n")
        .filter((l) => !l.trim().startsWith("//"))
        .join("\n");
      expect(PROVEDOR.test(fonte), `${caminho} passou a chamar IA — isto vira fatura por briefing`).toBe(false);
    }
  });

  it("o motor é determinístico: a mesma entrada produz a mesma saída", () => {
    // Determinismo é a prova viva de que não há modelo no caminho. Um LLM não
    // devolve exatamente o mesmo texto duas vezes.
    const entrada = {
      businessName: "Clínica Bela Face",
      segment: "Estética",
      objectives: ["mais clientes novos"],
      services: ["social media"],
      rawContext: "5 posts por semana no Instagram, budget de R$ 500",
      requestId: "req-1",
      source: "request" as const,
    };

    const a = generateStrategyCanvas(entrada);
    const b = generateStrategyCanvas(entrada);

    // `id` e carimbo de tempo mudam de propósito; o CONTEÚDO, não.
    const semCarimbo = (c: unknown) =>
      JSON.stringify(c).replace(/"id":"[^"]*"/g, "").replace(/"(createdAt|generatedAt)":"[^"]*"/g, "");
    expect(semCarimbo(a)).toBe(semCarimbo(b));
  });

  it("cinco briefings do mesmo contato NÃO viram cinco faturas", () => {
    // O caso real que abriu a pendência: o próprio CEO fazendo cinco briefings.
    // Cinco execuções, nenhuma promessa de rede — e o custo de cada uma é CPU,
    // não dólar. O que se prova aqui é que a função é SÍNCRONA: função que
    // devolve valor pronto, sem Promise, não tem como ter falado com a rede.
    for (let i = 0; i < 5; i++) {
      const canvas = generateStrategyCanvas({
        businessName: "Clínica Bela Face",
        segment: "Estética",
        objectives: ["mais clientes novos"],
        services: ["social media"],
        rawContext: "briefing repetido do mesmo contato",
        requestId: `req-${i}`,
        source: "request",
      });
      expect(canvas).not.toBeInstanceOf(Promise);
      const social = generateSocialCanvas({ strategyCanvas: canvas, requestId: `req-${i}`, source: "request" });
      expect(social).not.toBeInstanceOf(Promise);
    }
  });
});

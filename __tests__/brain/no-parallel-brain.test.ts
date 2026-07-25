// Blindagem da Regra de Ouro (portão único) — dente arquitetural.
//
// Ninguém fala com a IA por fora do MOTOR (lib/ai). Os arquivos abaixo nasceram
// ANTES do portão e estão CONGELADOS como dívida: a lista só pode DIMINUIR
// (migração para lib/ai/generate), nunca crescer. Se este teste quebrou no seu
// PR: não chame api.anthropic.com/openai/gemini direto — use generate() de
// lib/ai/generate.ts.

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative, sep } from "path";

const ROOT = process.cwd();
const SCAN_DIRS = ["app", "lib"];
const AI_CALL_RE = /api\.(?:anthropic|openai)\.com|generativelanguage\.googleapis\.com/;

/** Onde falar com a IA é PERMITIDO: o motor unificado (e o client gerado). */
function isAllowed(rel: string): boolean {
  return rel.startsWith("lib/ai/") || rel.startsWith("lib/generated/");
}

/** Dívida pré-portão, CONGELADA. Remover item = progresso; adicionar = proibido. */
const FROZEN_EXCEPTIONS = new Set<string>([
  "app/api/agents/ads/generate/route.ts",
  "app/api/agents/brand/analyze/route.ts",
  "app/api/agents/design/generate/route.ts",
  "app/api/agents/operations/generate/route.ts",
  "app/api/agents/pm/generate/route.ts",
  "app/api/agents/social/generate/route.ts",
  "app/api/ai-keys/test/route.ts",
  "app/api/ai/run/route.ts",
  "app/api/brain/analyze-brand-book/route.ts",
  "app/api/brain/briefing-extract/route.ts",
  "app/api/sdr/chat/route.ts",
  "app/api/sdr/transcribe/route.ts",
  "app/api/sdr/upload/route.ts",
]);

function listSourceFiles(dir: string, out: string[] = []): string[] {
  let entries: string[] = [];
  try { entries = readdirSync(dir); } catch { return out; }
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "node_modules" || entry === ".next" || entry === "generated") continue;
      listSourceFiles(full, out);
    } else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

describe("Regra de Ouro — portão único de IA (Dioli)", () => {
  const files = SCAN_DIRS.flatMap((d) => listSourceFiles(join(ROOT, d)));

  it("nenhum arquivo NOVO fala com a IA por fora do motor (lib/ai)", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const rel = relative(ROOT, file).split(sep).join("/");
      if (isAllowed(rel) || FROZEN_EXCEPTIONS.has(rel)) continue;
      if (AI_CALL_RE.test(readFileSync(file, "utf8"))) offenders.push(rel);
    }
    expect(
      offenders,
      `Cérebro paralelo detectado — estes arquivos chamam a IA direto em vez de usar lib/ai/generate:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("a lista congelada só diminui — remova exceções que já migraram/sumiram", () => {
    const existing = new Set(files.map((f) => relative(ROOT, f).split(sep).join("/")));
    const ghosts = [...FROZEN_EXCEPTIONS].filter((f) => !existing.has(f));
    expect(ghosts, `Exceções congeladas que não existem mais — remova:\n${ghosts.join("\n")}`).toEqual([]);
  });
});

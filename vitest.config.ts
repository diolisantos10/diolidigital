import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Minimal vitest setup for Dioli Brain unit tests.
// Resolves the "@/..." alias to the repo root so imports match the app.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["__tests__/**/*.test.ts"],
    globals: true,
    // ── POR QUE ESTES TIMEOUTS SÃO MAIORES QUE O PADRÃO ──────────────────────
    // Em 02/08/2026 a suíte ficou vermelha duas vezes SEM nenhuma mudança de
    // comportamento: um arquivo inteiro não chegava a rodar. O sinal estava no
    // relatório — "import 31s" contra ~6s numa rodada normal. Era contenção de
    // CPU (vitest roda os arquivos em paralelo, e alguns puxam o cliente Prisma
    // inteiro), não defeito do código testado.
    //
    // O padrão do vitest (5s de teste, 10s de hook) foi pensado para teste
    // unitário puro. Aqui existem arquivos que sobem processo externo (ffmpeg)
    // e outros que importam módulos grandes. Falso vermelho é pior que teste
    // nenhum: ensina o time a ignorar o sinal.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});

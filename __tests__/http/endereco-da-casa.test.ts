// O ENDEREÇO DA CASA É `www.diolidigital.com.br` — e o do Railway nunca.
//
// 16/08/2026, o CEO no piloto ao vivo, olhando a própria tela:
//   *"está tudo ainda com o domínio, é pra estar diolidigital.com.br."*
//
// POR QUE ISTO PRECISA DE TESTE E NÃO DE ATENÇÃO: o endereço do Railway
// FUNCIONA. Um link `*.up.railway.app` abre, carrega e entrega a página — ele
// não quebra nada, só mostra ao cliente um domínio que não é o da marca. Defeito
// que funciona é o que ninguém descobre: não gera erro, não gera log, não gera
// alarme. Só gera a pergunta do CEO três semanas depois.
//
// E o lugar onde ele se esconde é o FALLBACK — o `||` que só roda quando a
// variável de ambiente falta, ou seja, exatamente no dia em que alguém esqueceu.
// Fallback é código que não se exercita à mão; por isso se exercita aqui.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const CASA = "https://www.diolidigital.com.br";

/** Onde mora código que GERA URL absoluta vista por gente de fora. */
const PASTAS_DE_CODIGO = ["lib", "app", "components"];

/**
 * O que NÃO é URL gerada, e por isso não reprova:
 *   • `lib/generated/` — cliente Prisma, escrito por máquina;
 *   • `docs/`, `scripts/`, `.github/` — documentação e ferramenta de operação,
 *     onde o endereço do Railway é o endereço CERTO (é para lá que o operador
 *     aponta o smoke test). Estes não estão nas pastas varridas, e é de propósito.
 */
const RAILWAY = /\bup\.railway\.app\b/;

function arquivosDe(alvo: string): string[] {
  const caminho = join(process.cwd(), alvo);
  let s;
  try {
    s = statSync(caminho);
  } catch {
    return [];
  }
  if (s.isFile()) return /\.(ts|tsx)$/.test(alvo) ? [alvo] : [];
  if (alvo.includes("generated") || alvo.includes("node_modules")) return [];
  return readdirSync(caminho).flatMap((n) => arquivosDe(join(alvo, n)));
}

const ALVOS = PASTAS_DE_CODIGO.flatMap(arquivosDe);

describe("nenhuma URL gerada usa o endereço do Railway — ordem do CEO em 16/08", () => {
  // ✅ A METADE QUE PROVA QUE A VARREDURA ENXERGA.
  it("a varredura alcança o código que monta link para o cliente", () => {
    expect(ALVOS.length).toBeGreaterThan(50);
    expect(ALVOS).toContain("lib/integrations/meta/notifications.ts");
    expect(ALVOS).toContain("app/layout.tsx");
  });

  // ⛔ A TRAVA.
  it("nenhum arquivo de código carrega um endereço up.railway.app", () => {
    const culpados = ALVOS.flatMap((arquivo) =>
      readFileSync(join(process.cwd(), arquivo), "utf8")
        .split("\n")
        .map((linha, i) => ({ arquivo, n: i + 1, linha: linha.trim() }))
        .filter(({ linha }) => RAILWAY.test(linha)),
    );

    expect(
      culpados,
      `Endereço do Railway em código que gera URL. O endereço da casa é ${CASA} ` +
        `(ordem do CEO em 16/08/2026). O link do Railway ABRE — por isso ninguém ` +
        `percebe que está errado.\n` +
        culpados.map((c) => `  ${c.arquivo}:${c.n}  ${c.linha}`).join("\n"),
    ).toEqual([]);
  });
});

describe("os endereços declarados apontam para a casa", () => {
  it("o metadataBase e o Open Graph usam www.diolidigital.com.br", () => {
    // `metadataBase` é o que transforma caminho relativo em URL absoluta:
    // canônica do Google e card de compartilhamento do WhatsApp saem daí.
    const layout = readFileSync(join(process.cwd(), "app/layout.tsx"), "utf8");
    expect(layout).toContain(`new URL("${CASA}")`);
    expect(layout).toContain(`url: "${CASA}"`);
  });

  it("o link do portal enviado por WhatsApp cai na casa mesmo sem variável", async () => {
    // A METADE CARA: este é o fallback que monta o link DENTRO da mensagem de
    // WhatsApp do cliente. Sem `NEXT_PUBLIC_APP_URL`, ele antes entregava o
    // endereço do Railway — um link que abre, com o domínio errado.
    const fonte = readFileSync(
      join(process.cwd(), "lib/integrations/meta/notifications.ts"),
      "utf8",
    );
    expect(fonte).toContain(`"${CASA}"`);
    expect(fonte).not.toMatch(RAILWAY);
  });
});

/**
 * ─── O PORTÃO DA TELA QUE APAGOU ────────────────────────────────────────────
 *
 * 06/08/2026. O CEO não conseguia abrir `/agency/integrations` em nenhum
 * aparelho: a tela vinha em branco e o Chrome anunciava "This page couldn't
 * load". O servidor estava certo (200, 74 KB); quem morria era o render no
 * navegador.
 *
 * A linha: `components/agency/MetaConnectManager.tsx`
 *
 *     const pm = PLATFORM_META[c.platform];   // ← undefined quando platform = "user"
 *     <span>{pm.emoji}</span>                 // ← TypeError, árvore inteira desmontada
 *
 * `PLATFORM_META` cobria instagram/facebook/whatsapp. O banco (`platform` é
 * `String` livre no schema) tinha DUAS conexões `platform: "user"` — o registro
 * "Acesso da conta Meta" que o popup de OAuth e o token colado gravam. O tipo
 * do cliente declarava uma união fechada de três valores e o TypeScript
 * acreditou: nenhum erro de compilação, nenhum teste vermelho, tela morta.
 *
 * Este arquivo é a trava, em duas camadas:
 *
 *   1. **O payload real de produção** (27 conexões, com as duas `user`) renderiza
 *      sem lançar. É o defeito exato, reproduzido.
 *   2. **A varredura**: TODO valor de `platform` que o servidor grava em
 *      `IntegrationConnection` tem que renderizar. Vale para o próximo valor
 *      que alguém inventar — não só para os de hoje.
 */

import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { ConnectionsSection } from "@/components/agency/MetaConnectManager";

const CONFIG = {
  configured: true,
  source: "env" as const,
  appId: "1824373765214116",
  secretHint: null,
  lastConfiguredAt: null,
};

function conexao(platform: string, name: string) {
  return {
    id: `id-${platform}-${name}`,
    platform,
    name,
    externalId: "1286545531198132",
    status: "connected",
    tokenHint: "EAA…lkEx",
    tokenExpiresAt: null,
    connectedAt: "2026-08-05T12:00:00.000Z",
  };
}

function renderizar(connections: ReturnType<typeof conexao>[]): string {
  return renderToStaticMarkup(
    createElement(ConnectionsSection, {
      config: CONFIG,
      connections,
      loading: false,
      onChanged: () => {},
    }),
  );
}

/** Varre o servidor atrás de todo `platform: "x"` gravado em conexão. */
function plataformasQueOServidorGrava(): string[] {
  const raizes = ["app/api/meta", "lib/integrations/meta"];
  const achados = new Set<string>();
  const visitar = (dir: string) => {
    for (const nome of readdirSync(dir)) {
      const caminho = join(dir, nome);
      if (statSync(caminho).isDirectory()) visitar(caminho);
      else if (caminho.endsWith(".ts")) {
        const src = readFileSync(caminho, "utf8");
        for (const m of src.matchAll(/platform:\s*"([a-z_]+)"/g)) achados.add(m[1]);
      }
    }
  };
  for (const r of raizes) visitar(join(process.cwd(), r));
  return [...achados].sort();
}

describe("MetaConnectManager · a lista de contas conectadas", () => {
  it("renderiza o payload REAL de produção — inclusive as conexões 'user' — sem derrubar a tela", () => {
    const reais = [
      conexao("user", "Acesso da conta Meta"),
      conexao("instagram", "@dioli.digital"),
      conexao("facebook", "Dioli - Marketing Digital"),
      conexao("whatsapp", "Dioli WhatsApp"),
      conexao("user", "Acesso da conta Meta (token colado)"),
    ];

    // ANTES do conserto esta linha lançava:
    // TypeError: Cannot read properties of undefined (reading 'emoji')
    let html = "";
    expect(() => { html = renderizar(reais); }).not.toThrow();

    // E não basta não quebrar: a conexão precisa APARECER, com nome próprio.
    expect(html).toContain("Acesso da conta Meta");
    expect(html).toContain("Acesso da conta"); // rótulo da plataforma `user`
    expect(html).toContain("@dioli.digital");
  });

  it("cobre TODO valor de platform que o servidor grava — não só os três conhecidos", () => {
    const doServidor = plataformasQueOServidorGrava();

    // Se a varredura não achar nada, o portão virou decoração.
    expect(doServidor.length).toBeGreaterThanOrEqual(4);
    expect(doServidor).toContain("user");

    for (const p of doServidor) {
      expect(() => renderizar([conexao(p, `conta ${p}`)]), `platform "${p}" derruba o render`).not.toThrow();
    }
  });

  it("plataforma desconhecida no futuro também não derruba a tela", () => {
    expect(() => renderizar([conexao("threads", "@algo")])).not.toThrow();
  });
});

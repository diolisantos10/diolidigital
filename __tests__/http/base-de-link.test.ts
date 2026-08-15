// ── A BASE DE TODO LINK QUE SAI PARA O CLIENTE (15/08/2026) ─────────────────
//
// O portal abre hoje em `dioli-agency-os-1-production.up.railway.app`.
// `diolidigital.com.br` e `www.diolidigital.com.br` já estão cadastrados no
// Railway, mas com `targetPort` vazio — o domínio oficial ainda NÃO atende.
//
// Antes disto, cada gerador de link tinha o próprio padrão:
//   • `avisos.ts` (link do portal no WhatsApp)      → string VAZIA
//   • `self-serve/order` (retorno do Mercado Pago)  → string VAZIA
//   • `meta/notifications.ts` (aviso de proposta)   → Railway escrito à mão
//
// Os dois primeiros produziam link RELATIVO na mão do cliente — `/portal/access/
// <token>` numa mensagem de WhatsApp não abre nada. O terceiro seria um dos
// lugares a esquecer no dia da troca de domínio.

import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { baseDeLink, ENDERECO_OFICIAL, ENDERECO_DE_HOJE } from "@/lib/http/endereco-publico";

const antes = { app: process.env.NEXT_PUBLIC_APP_URL, alt: process.env.APP_URL };
beforeEach(() => {
  delete process.env.NEXT_PUBLIC_APP_URL;
  delete process.env.APP_URL;
});
afterAll(() => {
  if (antes.app === undefined) delete process.env.NEXT_PUBLIC_APP_URL; else process.env.NEXT_PUBLIC_APP_URL = antes.app;
  if (antes.alt === undefined) delete process.env.APP_URL; else process.env.APP_URL = antes.alt;
});

describe("baseDeLink", () => {
  it("⛔ NUNCA devolve vazio — link relativo no WhatsApp não abre nada", () => {
    expect(baseDeLink()).not.toBe("");
    expect(baseDeLink()).toMatch(/^https:\/\//);
  });

  it("sem variável, cai no endereço que RESPONDE hoje — não no oficial", () => {
    // A troca é do CEO, no Railway (porta + DNS). Apontar para o domínio
    // oficial antes de ele atender mandaria o cliente para uma porta fechada,
    // e link quebrado é pior que link feio.
    expect(baseDeLink()).toBe(ENDERECO_DE_HOJE);
  });

  it("✅ a troca de domínio é UMA variável, não um commit", () => {
    process.env.NEXT_PUBLIC_APP_URL = ENDERECO_OFICIAL;
    expect(baseDeLink()).toBe("https://www.diolidigital.com.br");
  });

  it("barra no fim não vira `//portal/access`", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://www.diolidigital.com.br/";
    expect(`${baseDeLink()}/portal/access/tok`).toBe("https://www.diolidigital.com.br/portal/access/tok");
  });

  it("`APP_URL` continua valendo como alternativa (compatibilidade)", () => {
    process.env.APP_URL = "https://outro.exemplo";
    expect(baseDeLink()).toBe("https://outro.exemplo");
  });
});

describe("os geradores de link leem de UM lugar só", () => {
  it("⛔ nenhum deles tem endereço escrito à mão", async () => {
    const { readFileSync } = await import("node:fs");
    const arquivos = [
      "lib/agency/esteira/avisos.ts",
      "lib/integrations/meta/notifications.ts",
      "app/api/self-serve/order/route.ts",
    ];
    for (const f of arquivos) {
      const fonte = readFileSync(`${process.cwd()}/${f}`, "utf8");
      expect(fonte, `${f} voltou a montar link sem passar por baseDeLink()`).toContain("baseDeLink");
      // O endereço do Railway não pode voltar a ser constante local: no dia da
      // troca, este arquivo seria o esquecido.
      const semComentarios = fonte.split("\n").filter((l) => !l.trimStart().startsWith("//")).join("\n");
      expect(semComentarios, `${f} tem o endereço do Railway escrito à mão`).not.toContain("up.railway.app");
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 🔴 F2 — ESTA MUDANÇA ARMA O WEBHOOK DO GATEWAY. NÃO É COSMÉTICA.
// ═══════════════════════════════════════════════════════════════════════════
//
// Achado do `qualidade` na rodada 2 do P0 do portal, e é por isso que estas
// correções saíram do PR daquele P0 para este:
//
//   `app/api/self-serve/order/route.ts` montava as URLs do Mercado Pago com
//   `NEXT_PUBLIC_APP_URL ?? ""`. Sem a variável, `notification_url` virava
//   `/api/self-serve/webhook` — um caminho RELATIVO, que o Mercado Pago não
//   alcança. O webhook era **inerte**.
//
//   Com `baseDeLink()` ele passa a ser absoluto — e o webhook COMEÇA A
//   DISPARAR. Quem ele chama é `produzirPedidoDeBalcao`, que até 15/08/2026 era
//   o re-apontador incondicional de `ClientRequestDb.clientId` e a causa do
//   vazamento do portal.
//
// Ou seja: mesclada ANTES do conserto do balcão, esta linha **arma a bomba**.
// A ordem importa, e por isso está escrita num teste e não num comentário de PR.
describe("as URLs do gateway de pagamento", () => {
  it("⛔ nunca são relativas — webhook relativo é webhook que não chega", () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    const APP_URL = baseDeLink();
    for (const u of [
      `${APP_URL}/api/self-serve/webhook`,
      `${APP_URL}/vitrine/sucesso?order=abc`,
      `${APP_URL}/vitrine?erro=pagamento`,
    ]) {
      expect(u).toMatch(/^https:\/\//);
      expect(() => new URL(u)).not.toThrow();
    }
  });

  it("⚠️ e ao virarem absolutas, o webhook passa a chamar o balcão — a ordem de merge importa", async () => {
    const { readFileSync } = await import("node:fs");
    const webhook = readFileSync(`${process.cwd()}/app/api/self-serve/webhook/route.ts`, "utf8");
    // Se esta ligação deixar de existir, o comentário acima vira folclore.
    expect(webhook).toContain("produzirPedidoDeBalcao");
  });
});

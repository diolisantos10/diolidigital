import { describe, it, expect } from "vitest";
import { ehNavegacaoCrossSite } from "@/lib/security/navegacao-cross-site";

function req(secFetchSite?: string) {
  return {
    headers: {
      get: (name: string) => (name === "sec-fetch-site" ? secFetchSite ?? null : null),
    },
  };
}

describe("ehNavegacaoCrossSite", () => {
  it("cross-site → true", () => {
    expect(ehNavegacaoCrossSite(req("cross-site"))).toBe(true);
  });

  it("same-origin → false", () => {
    expect(ehNavegacaoCrossSite(req("same-origin"))).toBe(false);
  });

  it("same-site → false (subdomínio comprometido é outro risco, não este)", () => {
    expect(ehNavegacaoCrossSite(req("same-site"))).toBe(false);
  });

  it("ausente (navegador sem Fetch Metadata) → false, risco aceito e declarado", () => {
    expect(ehNavegacaoCrossSite(req(undefined))).toBe(false);
  });
});

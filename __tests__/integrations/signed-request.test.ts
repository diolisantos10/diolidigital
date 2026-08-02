import { describe, it, expect } from "vitest";
import { createHmac } from "crypto";
import { lerSignedRequest } from "@/lib/integrations/meta/signed-request";

const SEGREDO = "segredo-do-app-da-dioli";

function b64url(b: Buffer): string {
  return b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function assinar(payload: Record<string, unknown>, segredo = SEGREDO): string {
  const p = b64url(Buffer.from(JSON.stringify(payload)));
  const sig = b64url(createHmac("sha256", segredo).update(p).digest());
  return `${sig}.${p}`;
}

const VALIDO = { algorithm: "HMAC-SHA256", user_id: "1234567890", issued_at: 1754100000 };

describe("o envelope assinado da Meta", () => {
  it("abre o payload quando a assinatura confere", () => {
    const r = lerSignedRequest(assinar(VALIDO), SEGREDO)!;
    expect(r.user_id).toBe("1234567890");
  });
});

describe("o que NUNCA pode passar — este endpoint APAGA DADOS", () => {
  // Um corpo aceito sem conferência é um botão de "delete" aberto na internet:
  // bastaria adivinhar um id de usuário para varrer a base de um cliente.
  it("assinatura de outro segredo é recusada", () => {
    expect(lerSignedRequest(assinar(VALIDO, "segredo-do-atacante"), SEGREDO)).toBeNull();
  });

  it("payload adulterado depois de assinado é recusado", () => {
    const bom = assinar(VALIDO);
    const [sig] = bom.split(".");
    const outro = b64url(Buffer.from(JSON.stringify({ ...VALIDO, user_id: "999" })));
    expect(lerSignedRequest(`${sig}.${outro}`, SEGREDO)).toBeNull();
  });

  it("algoritmo diferente de HMAC-SHA256 é recusado", () => {
    // Aceitar outro algoritmo é deixar o atacante ESCOLHER o algoritmo —
    // inclusive um que não protege nada.
    expect(lerSignedRequest(assinar({ ...VALIDO, algorithm: "none" }), SEGREDO)).toBeNull();
  });

  it("assinatura vazia não vira 'sem assinatura, tudo bem'", () => {
    const p = b64url(Buffer.from(JSON.stringify(VALIDO)));
    expect(lerSignedRequest(`.${p}`, SEGREDO)).toBeNull();
  });

  it("formato quebrado devolve null, nunca conteúdo no melhor esforço", () => {
    for (const lixo of ["", "abc", "a.b.c", "naoEBase64.tambemNao"]) {
      expect(lerSignedRequest(lixo, SEGREDO), lixo).toBeNull();
    }
  });

  it("sem segredo do app, nada é aceito", () => {
    expect(lerSignedRequest(assinar(VALIDO), "")).toBeNull();
  });
});

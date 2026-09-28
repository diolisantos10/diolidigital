// lib/security/corpo-limitado.ts — teto de corpo ANTES de bufferizar.
//
// As DUAS metades: barra o corpo grande demais (com e sem Content-Length
// confiável) E não incomoda o corpo dentro do teto.

import { describe, it, expect } from "vitest";
import { lerCorpoComTeto } from "@/lib/security/corpo-limitado";

function streamDeTexto(texto: string, tamanhoDoPedaco = 1024): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(texto);
  let offset = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= bytes.length) {
        controller.close();
        return;
      }
      const fim = Math.min(offset + tamanhoDoPedaco, bytes.length);
      controller.enqueue(bytes.slice(offset, fim));
      offset = fim;
    },
  });
}

function requisicao(texto: string, headers: Record<string, string> = {}, tamanhoDoPedaco?: number) {
  return { headers: new Headers(headers), body: streamDeTexto(texto, tamanhoDoPedaco) };
}

describe("lerCorpoComTeto — a metade que BARRA", () => {
  it("recusa sem ler nada quando o Content-Length declarado já excede o teto", async () => {
    const texto = "x".repeat(10); // o corpo real é pequeno — só o CABEÇALHO mente
    const res = await lerCorpoComTeto(requisicao(texto, { "content-length": String(1_000_000) }), 1024);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.motivo).toMatch(/Content-Length/);
  });

  it("recusa pelo acumulado real quando NÃO há Content-Length confiável (chunked)", async () => {
    const texto = "y".repeat(5000); // sem cabeçalho content-length
    const res = await lerCorpoComTeto(requisicao(texto, {}, 200), 1024);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.motivo).toMatch(/excede o teto/);
  });

  it("recusa mesmo com um Content-Length mentiroso PARA BAIXO", async () => {
    const texto = "z".repeat(5000);
    const res = await lerCorpoComTeto(requisicao(texto, { "content-length": "10" }, 200), 1024);
    expect(res.ok).toBe(false);
  });
});

describe("lerCorpoComTeto — a metade que NÃO incomoda o caso limpo", () => {
  it("deixa passar um corpo bem dentro do teto, byte a byte igual ao original", async () => {
    const texto = JSON.stringify({ idExterno: "vaga-1", legenda: "olá, ç ã é — acento e emoji 🎉" });
    const res = await lerCorpoComTeto(requisicao(texto, { "content-length": String(new TextEncoder().encode(texto).length) }), 1024 * 256);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.texto).toBe(texto);
  });

  it("corpo vazio (GET-like, sem body) devolve string vazia", async () => {
    const res = await lerCorpoComTeto({ headers: new Headers(), body: null }, 1024);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.texto).toBe("");
  });

  it("corpo exatamente no teto passa; um byte a mais já recusa", async () => {
    const noTeto = "a".repeat(1024);
    const acimaDoTeto = "a".repeat(1025);
    const r1 = await lerCorpoComTeto(requisicao(noTeto, {}, 100), 1024);
    const r2 = await lerCorpoComTeto(requisicao(acimaDoTeto, {}, 100), 1024);
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(false);
  });
});

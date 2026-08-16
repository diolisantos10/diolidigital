// A MESMA DOENÇA DE `fetchSdrReply`, NO UPLOAD (item 6 da ficha `esteira` de
// 16/08/2026, terceiro beco sem saída em silêncio).
//
// `fetchUpload` (`PublicBriefingRoom.tsx`) tratava 429 (freio próprio do
// upload, 12/60s — ver `app/api/sdr/upload/route.ts`), 503, corpo ilegível e
// rejeição de formato (`too_large`/`bad_request`) todos como o mesmo `null`,
// e o item de anexo virava um selo "Falhou" idêntico para os quatro — a
// pessoa não sabia se esperava 5 segundos ou trocava de arquivo.
//
// `fetchUpload` não é exportado (é interno ao componente, ao contrário de
// `fetchSdrReply`) — este arquivo prova o mecanismo pela função pura que
// TRADUZ o motivo em texto (`causaDaFalhaDeUpload`), aplicada aos `kind`s que
// `fetchUpload` de fato produz para cada situação de rede, documentados no
// próprio tipo `UploadOutcome`.

import { describe, it, expect } from "vitest";
import { causaDaFalhaDeUpload, type UploadOutcome } from "@/components/agency/briefing/PublicBriefingRoom";

describe("causaDaFalhaDeUpload — um texto por motivo, nunca 'Falhou' sozinho", () => {
  it("barrado (429, freio do upload): causa de espera, sem código de erro na frase", () => {
    const causa = causaDaFalhaDeUpload({ kind: "barrado" });
    expect(causa).not.toBeNull();
    expect(causa).not.toMatch(/429/);
    expect(causa).toMatch(/espere|espera/i);
  });

  it("quebrado (503 / rede): causa de sistema fora do ar, texto diferente do barrado", () => {
    const causa = causaDaFalhaDeUpload({ kind: "quebrado" });
    expect(causa).not.toBeNull();
    expect(causa).not.toMatch(/503/);
    expect(causa).not.toBe(causaDaFalhaDeUpload({ kind: "barrado" }));
  });

  it("rejeitado por too_large: diz que o arquivo é grande demais, não 'tente outro formato'", () => {
    const causa = causaDaFalhaDeUpload({ kind: "rejeitado", motivo: "too_large" });
    expect(causa).toMatch(/grande/i);
  });

  it("rejeitado por motivo desconhecido (bad_request, tipo não suportado): sugere trocar de arquivo", () => {
    const causa = causaDaFalhaDeUpload({ kind: "rejeitado", motivo: "bad_request" });
    expect(causa).toMatch(/formato/i);
    // A causa de "too_large" e a de "outro motivo" NUNCA são a mesma frase —
    // uma pessoa que já sabe que o arquivo é pequeno não deveria trocar de
    // arquivo à toa.
    expect(causa).not.toBe(causaDaFalhaDeUpload({ kind: "rejeitado", motivo: "too_large" }));
  });

  it("concluido: nenhuma causa — o item não está em erro", () => {
    const outcome: UploadOutcome = {
      kind: "concluido",
      result: { fileName: "briefing.pdf", fileType: "PDF", sizeBytes: 100, mimeType: "application/pdf", extractedText: "" },
    };
    expect(causaDaFalhaDeUpload(outcome)).toBeNull();
  });
});

// As DUAS METADES da trava de formato de mídia (08/08/2026).
//
// Metade 1: ela BARRA o problema plantado — o PNG que a Meta recusou 12 vezes
//           por hora em produção, contra a conta da Foocci.
// Metade 2: ela NÃO INVENTA problema no caso limpo — JPEG passa, MP4 passa.
//
// Sem a segunda metade a trava seria indistinguível de um `return false`, e
// travaria a publicação inteira desta casa no dia em que as artes virarem JPEG.

import { describe, it, expect } from "vitest";
import {
  conferirFormatoDeMidia,
  MIME_DE_IMAGEM_ACEITO,
  type MidiaConferida,
} from "@/lib/integrations/meta/formato-de-midia";

/** As 6 telas de um carrossel, todas com o mesmo MIME. */
function carrossel(mime: string | null): MidiaConferida[] {
  return Array.from({ length: 6 }, (_, i) => ({ id: `med_tela${i + 1}`, mime }));
}

describe("a trava de formato de mídia da Meta", () => {
  // ── METADE 1: BARRA O PROBLEMA REAL ──────────────────────────────────────
  describe("BARRA o que a Meta recusa", () => {
    it("recusa o carrossel PNG — o caso medido em produção em 08/08/2026", () => {
      const v = conferirFormatoDeMidia(carrossel("image/png"), false);
      expect(v.aceita).toBe(false);
    });

    it("a frase nomeia AS DUAS METADES: o que o arquivo é e o que a Meta exige", () => {
      const v = conferirFormatoDeMidia(carrossel("image/png"), false);
      if (v.aceita) throw new Error("deveria ter recusado");
      // o que o arquivo é
      expect(v.motivo).toContain("image/png");
      // o que a Meta exige
      expect(v.motivo).toContain("JPEG");
      // ONDE está escrito (a biblioteca capturada, não memória de modelo)
      expect(v.motivo).toContain("instagram-publicacao-de-conteudo");
    });

    it("a frase manda consertar a ARTE, não a conexão — foi o erro de diagnóstico do dia", () => {
      const v = conferirFormatoDeMidia(carrossel("image/png"), false);
      if (v.aceita) throw new Error("deveria ter recusado");
      expect(v.motivo).toContain("NÃO é conexão");
      expect(v.motivo).toMatch(/reconverter/i);
    });

    it("recusa quando UMA só tela está fora do formato — carrossel não vai pela metade", () => {
      const telas = carrossel(MIME_DE_IMAGEM_ACEITO);
      telas[3] = { id: "med_tela4", mime: "image/webp" };
      const v = conferirFormatoDeMidia(telas, false);
      expect(v.aceita).toBe(false);
      if (!v.aceita) expect(v.motivo).toContain("1 de 6");
    });

    it("recusa mídia que não está no banco — ausência de informação não é informação", () => {
      const v = conferirFormatoDeMidia([{ id: "med_sumiu", mime: null }], false);
      expect(v.aceita).toBe(false);
      if (!v.aceita) expect(v.motivo).toContain("não está no banco");
    });

    it("recusa peça sem mídia nenhuma", () => {
      const v = conferirFormatoDeMidia([], false);
      expect(v.aceita).toBe(false);
    });

    it("recusa GIF e WEBP — derivados e vizinhos do JPEG não valem", () => {
      for (const mime of ["image/gif", "image/webp", "image/heic", "image/svg+xml"]) {
        expect(conferirFormatoDeMidia([{ id: "m", mime }], false).aceita).toBe(false);
      }
    });

    it("recusa IMAGEM onde se espera VÍDEO (reel)", () => {
      expect(conferirFormatoDeMidia([{ id: "m", mime: "image/jpeg" }], true).aceita).toBe(false);
    });

    it("recusa VÍDEO onde se espera IMAGEM (carrossel)", () => {
      expect(conferirFormatoDeMidia([{ id: "m", mime: "video/mp4" }], false).aceita).toBe(false);
    });

    it("recusa contêiner de vídeo que o Instagram não processa", () => {
      expect(conferirFormatoDeMidia([{ id: "m", mime: "video/webm" }], true).aceita).toBe(false);
    });
  });

  // ── METADE 2: NÃO INVENTA PROBLEMA NO CASO LIMPO ─────────────────────────
  describe("NÃO barra o que a Meta aceita", () => {
    it("aceita o carrossel inteiro em JPEG — é assim que a Foocci vai ao ar", () => {
      expect(conferirFormatoDeMidia(carrossel(MIME_DE_IMAGEM_ACEITO), false).aceita).toBe(true);
    });

    it("aceita o post único em JPEG", () => {
      expect(conferirFormatoDeMidia([{ id: "m", mime: "image/jpeg" }], false).aceita).toBe(true);
    });

    it("aceita reel em MP4 e em MOV", () => {
      expect(conferirFormatoDeMidia([{ id: "m", mime: "video/mp4" }], true).aceita).toBe(true);
      expect(conferirFormatoDeMidia([{ id: "m", mime: "video/quicktime" }], true).aceita).toBe(true);
    });

    it("não devolve motivo quando aceita — sucesso não carrega texto de recusa", () => {
      const v = conferirFormatoDeMidia(carrossel(MIME_DE_IMAGEM_ACEITO), false);
      expect(v).toEqual({ aceita: true });
    });
  });
});

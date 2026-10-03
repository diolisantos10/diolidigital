// Caso real do test drive de Branding (03/10/2026): o CEO jogou o material de
// várias marcas numa pasta só, sem subpasta. Os arquivos soltos precisam entrar,
// com o tipo tirado do nome — e o que não dá para saber pelo nome entra sem
// papel, nunca recusado.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { sugerirPapel } from "@/lib/integrations/google/escolha-de-material";

describe("nomes reais da pasta do CEO", () => {
  it.each([
    ["CityJobs_Brand_Book_v1.pdf", "application/pdf", "manual_de_marca"],
    ["Dioli_Digital_Brand_Book_v1_10_slides_com_capa.pdf", "application/pdf", "manual_de_marca"],
    ["Brand_Book_Sushi_Cazza_v0_2 (1).pdf", "application/pdf", "manual_de_marca"],
    ["SANTIOH_logo_horizontal.png", "image/png", "logo"],
    ["logo_13-04-quadrado.png", "image/png", "logo"],
    // Os nomes que o CEO deu depois de identificar as imagens (03/10/2026).
    ["DioliDigital_logo_1.jpg", "image/jpeg", "logo"],
    ["CityJobs_logo_variacao_1.png", "image/png", "logo"],
    ["dilee logo.png", "image/png", "logo"],
    ["Dilix_logo_2.png", "image/png", "logo"],
    ["Queise_icone_q.png", "image/png", "logo"],
    ["Queise_logo_fundo_transparente.png", "image/png", "logo"],
  ])("%s → %s", (nome, mime, papel) => {
    expect(sugerirPapel(nome, mime)).toBe(papel);
  });

  it("sem pista no nome, não inventa papel (entra sem papel, para alguém dizer)", () => {
    expect(sugerirPapel("ChatGPT Image 31_07_2026.png", "image/png")).toBeNull();
    expect(sugerirPapel("1.jpg", "image/jpeg")).toBeNull();
  });
});

describe("a importação aceita arquivos soltos", () => {
  const DRIVE = fs.readFileSync(path.join(process.cwd(), "lib/integrations/google/drive-conta-de-servico.ts"), "utf8");
  const ROTA = fs.readFileSync(path.join(process.cwd(), "app/api/agency/clients/[id]/drive/importar/route.ts"), "utf8");
  const TELA = fs.readFileSync(path.join(process.cwd(), "components/agency/clients/PastaDoDrive.tsx"), "utf8");

  it("a pasta principal é lida quando o pedido é 'Arquivos soltos'", () => {
    expect(DRIVE).toContain('export const ARQUIVOS_SOLTOS = "Arquivos soltos"');
    expect(DRIVE).toContain("raiz.itens.filter((i) => !i.ehPasta)");
    expect(DRIVE).toContain("sugerirPapel(item.nome, item.mimeType)");
  });

  it("a rota aceita o pedido e a tela tem o botão", () => {
    expect(ROTA).toContain("if (v === ARQUIVOS_SOLTOS) return ARQUIVOS_SOLTOS;");
    expect(TELA).toContain('importarSubpasta("Arquivos soltos")');
  });
});

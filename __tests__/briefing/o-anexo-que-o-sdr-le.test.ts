/**
 * ── O CONTEÚDO DO ANEXO CHEGA AO SDR, E O QUE NÃO CHEGOU É DECLARADO ────────
 *
 * 16/08/2026. O CEO subiu dois PDFs do CityJobs no `/briefing` — um resumo
 * executivo e o brand book — e a régua de marca dentro do brand book era
 * ignorada.
 *
 * A leitura fácil ("ninguém abre o PDF") estava ERRADA: `/api/sdr/upload` já
 * manda o arquivo para a API de documentos do Claude desde antes. O que faltava
 * era MEMÓRIA — o texto extraído entrava como mensagem de UM turno e sumia,
 * porque o histórico enviado ao modelo só guarda a bolha visível
 * ("📎 Enviei meu briefing: X.pdf"), que não contém uma linha do documento.
 *
 * As duas metades abaixo: o conteúdo lido REAPARECE em todo turno, e o arquivo
 * que não foi lido é DITO como não lido — nunca engolido em silêncio, que é a
 * lei "ausência de informação não é informação".
 */
import { describe, it, expect } from "vitest";
import { dossieDosAnexos } from "@/components/agency/briefing/PublicBriefingRoom";

type Item = Parameters<typeof dossieDosAnexos>[0][number];

function anexo(over: Partial<Item> & { fileName: string }): Item {
  const { fileName, ...resto } = over;
  return {
    attachment: { fileName } as Item["attachment"],
    status: "done",
    texto: "",
    lido: false,
    ...resto,
  };
}

describe("o dossiê dos anexos — o que o SDR recebe a cada turno", () => {
  // ── METADE 1 · o conteúdo lido chega, e chega inteiro ──────────────────────

  it("o texto do arquivo lido aparece no dossiê, com o nome do arquivo", () => {
    const d = dossieDosAnexos([
      anexo({
        fileName: "BrandBook_v1.pdf",
        lido: true,
        texto: "A régua de marca: nunca o logo junto da palavra escrita na mesma peça.",
      }),
    ]);
    expect(d).toContain("BrandBook_v1.pdf");
    expect(d).toContain("nunca o logo junto da palavra escrita");
  });

  it("DOIS arquivos lidos: nenhum dos dois some — o brand book costuma ser o segundo", () => {
    const d = dossieDosAnexos([
      anexo({ fileName: "Resumo_Executivo.pdf", lido: true, texto: "PLATAFORMA DE VAGAS DO ALTO TIETE" }),
      anexo({ fileName: "Brand_Book.pdf",       lido: true, texto: "VERDE INSTITUCIONAL E TIPOGRAFIA" }),
    ]);
    expect(d).toContain("PLATAFORMA DE VAGAS DO ALTO TIETE");
    expect(d).toContain("VERDE INSTITUCIONAL E TIPOGRAFIA");
  });

  it("documento gigante é CORTADO com aviso, nunca truncado em silêncio", () => {
    const d = dossieDosAnexos([
      anexo({ fileName: "Manual.pdf", lido: true, texto: "z".repeat(60_000) }),
    ]);
    expect(d.length).toBeLessThan(20_000);
    expect(d).toMatch(/cortado/i);
  });

  // ── METADE 2 · o que NÃO foi lido é dito, e o limpo não é sujado ───────────

  it("arquivo NÃO lido é nomeado e o modelo é proibido de inventar o conteúdo", () => {
    const d = dossieDosAnexos([anexo({ fileName: "scan-do-cardapio.pdf", lido: false, texto: "" })]);
    expect(d).toContain("scan-do-cardapio.pdf");
    expect(d).toMatch(/NÃO consegui|NÃO invente|não conseguiu ler/i);
    // O ponto do defeito de 15/08: nunca pedir de novo o que já foi enviado.
    expect(d).toMatch(/já enviou|já enviado/i);
  });

  it("arquivo lido NÃO é listado como ilegível — a trava não pode sujar o caso limpo", () => {
    const d = dossieDosAnexos([
      anexo({ fileName: "briefing-bom.pdf", lido: true, texto: "conteúdo de verdade" }),
    ]);
    expect(d).not.toMatch(/NÃO consegui|não conseguiu ler/i);
  });

  it("upload que FALHOU não entra no dossiê — ele não é um anexo do cliente", () => {
    const d = dossieDosAnexos([anexo({ fileName: "morreu.pdf", status: "error" })]);
    expect(d).toBe("");
  });

  it("sem anexo nenhum, o dossiê é VAZIO — nada é acrescentado ao turno", () => {
    expect(dossieDosAnexos([])).toBe("");
  });

  it("um lido e um ilegível na mesma conversa: os dois fatos aparecem, separados", () => {
    const d = dossieDosAnexos([
      anexo({ fileName: "lido.pdf", lido: true, texto: "orçamento de doze posts por mês" }),
      anexo({ fileName: "opaco.pdf", lido: false, texto: "" }),
    ]);
    expect(d).toContain("orçamento de doze posts por mês");
    expect(d).toContain("opaco.pdf");
    expect(d).toMatch(/NÃO invente/i);
  });
});

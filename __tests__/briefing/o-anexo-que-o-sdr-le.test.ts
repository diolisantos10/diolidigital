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

/**
 * ── AUDITORIA ADVERSARIAL DO PRÓPRIO DOSSIÊ (16/08/2026) ────────────────────
 *
 * A rodada 1 construiu o dossiê e a rodada 1 o auditou — mesma mão nas duas
 * pontas, que não vale nesta casa. Na conferência de fora apareceu isto:
 *
 *     const cota = Math.max(1_200, Math.floor(TETO_DO_DOSSIE / lidos.length));
 *
 * O piso de 1.200 passava POR CIMA do teto de 12.000 assim que os arquivos
 * passavam de dez — e NÃO HÁ limite de quantidade em lugar nenhum: o input é
 * `multiple`, o arrastar-e-soltar aceita o que vier, e `handleFilesPicked`
 * percorre a lista inteira.
 *
 *     10 arquivos → 12.000 (no teto) · 20 → 24.000 (2×) · 50 → 60.000 (5×)
 *
 * Como o dossiê é remontado e colado em CADA turno, isso não é um estouro: é um
 * multiplicador de custo em porta PÚBLICA, sem login, na conta de IA da agência.
 */
describe("o teto do dossiê é teto de verdade — em porta pública isso é dinheiro", () => {
  function lidos(n: number, tamanho = 50_000) {
    return Array.from({ length: n }, (_, i) =>
      anexo({ fileName: `arquivo-${i + 1}.pdf`, lido: true, texto: "x".repeat(tamanho) }),
    );
  }

  // ⛔ A metade que reprova o código anterior.
  it.each([[10], [20], [50], [200]])(
    "com %i arquivos grandes, o dossiê NÃO passa do teto declarado",
    (n) => {
      const d = dossieDosAnexos(lidos(n));
      // Folga para o cabeçalho, os nomes e as instruções — o que trava é a
      // ordem de grandeza, não o caractere exato.
      expect(d.length).toBeLessThan(12_000 + 4_000);
    },
  );

  it("50 arquivos não produzem 5× o teto, que era o número medido antes", () => {
    expect(dossieDosAnexos(lidos(50)).length).toBeLessThan(60_000 / 2);
  });

  // ✅ A metade que impede o conserto de virar perda silenciosa.
  it("o que não coube é DECLARADO pelo nome — sumir seria dizer que não existe", () => {
    const d = dossieDosAnexos(lidos(14));
    expect(d).toContain("ARQUIVOS LIDOS QUE NÃO COUBERAM");
    expect(d).toContain("arquivo-14.pdf");
    // E o SDR é proibido de afirmar que leu o que não recebeu.
    expect(d).toMatch(/NÃO diga que leu o conteúdo deles/);
  });

  it("o caso normal não foi estragado: poucos arquivos continuam entrando inteiros", () => {
    const d = dossieDosAnexos([
      anexo({ fileName: "resumo.pdf", lido: true, texto: "A CityJobs conecta vagas do Alto Tietê." }),
      anexo({ fileName: "marca.pdf", lido: true, texto: "Verde institucional, sem serifa." }),
    ]);
    expect(d).toContain("A CityJobs conecta vagas do Alto Tietê.");
    expect(d).toContain("Verde institucional, sem serifa.");
    expect(d).not.toContain("NÃO COUBERAM");
    expect(d).not.toContain("trecho cortado por tamanho");
  });

  it("um arquivo só continua podendo usar o teto inteiro", () => {
    const d = dossieDosAnexos([anexo({ fileName: "unico.pdf", lido: true, texto: "y".repeat(11_000) })]);
    expect(d).toContain("y".repeat(11_000));
    expect(d).not.toContain("trecho cortado por tamanho");
  });
});

describe("a lista de nomes não é despejo — nome de arquivo é PII", () => {
  it("com 200 anexos opacos, o prompt não carrega 200 nomes", () => {
    const d = dossieDosAnexos(
      Array.from({ length: 200 }, (_, i) => anexo({ fileName: `orcamento-cliente-${i + 1}.pdf` })),
    );
    const citados = (d.match(/orcamento-cliente-\d+\.pdf/g) ?? []).length;
    expect(citados).toBeLessThanOrEqual(10);
    // Mas o TOTAL continua dito — 200 arquivos não viram "alguns arquivos".
    expect(d).toContain("e mais 190");
  });
});

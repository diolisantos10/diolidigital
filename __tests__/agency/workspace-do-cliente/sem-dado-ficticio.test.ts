// TESTE 6 do contrato — nenhum dado fictício sobrevive nos componentes de
// produção.
//
// ── O QUE ESTE TESTE ESTÁ CAÇANDO, E POR QUE ELE PRECISA SER CHATO ────────
//
// O pacote visual de referência é uma maquete: ele está cheio de "Foocci",
// "Diego Oliveira", "R$ 84,2 mil", "NPS 9,2", "92/100", "+18%". Numa maquete
// isso é ilustração. Num painel de trabalho é o pior tipo de mentira, porque
// tem cara de dado: alguém lê "ROAS 4,2" na tela de um cliente real e decide
// verba em cima disso.
//
// A regra da casa (guardrail 1) é que ausência de informação não é informação.
// A tradução deste teste: número que a tela mostra ou vem do DTO, ou é o traço
// com o motivo. Não existe terceira forma.
//
// ── POR QUE A VARREDURA É DE TEXTO, E NÃO DE RENDER ──────────────────────
// Porque o defeito é literal escrito no JSX. Um render só pegaria o caminho
// que aquele estado percorre; a varredura pega o literal esteja ele em que
// ramo estiver, inclusive no que ninguém abriu ainda.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const DIR_COMPONENTES = path.join(process.cwd(), "components/agency/clients/workspace");
const DIR_LIB = path.join(process.cwd(), "lib/agency/clients/workspace");

function arquivosDeProducao(): { nome: string; fonte: string }[] {
  const ler = (dir: string) =>
    fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".tsx") || f.endsWith(".ts"))
      .map((f) => ({ nome: path.relative(process.cwd(), path.join(dir, f)), fonte: fs.readFileSync(path.join(dir, f), "utf8") }));
  return [...ler(DIR_COMPONENTES), ...ler(DIR_LIB)];
}

const ARQUIVOS = arquivosDeProducao();

/** Tira os comentários antes de procurar. Um comentário que EXPLICA por que
 *  "Foocci" não pode aparecer não é uma ocorrência de "Foocci" na tela — e
 *  proibir a palavra até na explicação apagaria a memória do defeito. */
function semComentarios(fonte: string): string {
  return fonte.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
}

describe("6. nenhum literal fictício nos componentes de produção", () => {
  it("existem arquivos para varrer — teste que não vê nada passa por engano", () => {
    expect(ARQUIVOS.length).toBeGreaterThan(15);
  });

  const PROIBIDOS = [
    "Foocci",
    "Diego Oliveira",
    "Sushikasa",
    "Santioh",
    "TikTok Business",
    "CRM Foocci",
  ];

  for (const termo of PROIBIDOS) {
    it(`nenhum arquivo contém "${termo}"`, () => {
      const culpados = ARQUIVOS.filter((a) => semComentarios(a.fonte).includes(termo)).map((a) => a.nome);
      expect(culpados, `"${termo}" sobreviveu em: ${culpados.join(", ")}`).toEqual([]);
    });
  }

  it("nenhum valor em reais escrito à mão", () => {
    // "R$ 84,2 mil" e "R$ 12.400" são da maquete. Dinheiro na tela ou vem do
    // DTO, ou não existe.
    const culpados = ARQUIVOS.filter((a) => /R\$\s*\d/.test(semComentarios(a.fonte))).map((a) => a.nome);
    expect(culpados).toEqual([]);
  });

  it("nenhum percentual literal, exceto 0% (a barra vazia honesta)", () => {
    const culpados: string[] = [];
    for (const a of ARQUIVOS) {
      const achados = semComentarios(a.fonte).match(/"\s*[+-]?\d{1,3}(?:[.,]\d+)?%\s*"/g) ?? [];
      // `width: "0%"` é a barra de progresso sem dado — é o desenho do vazio,
      // não um número afirmado.
      if (achados.some((x) => !/^"\s*0%\s*"$/.test(x))) culpados.push(`${a.nome}: ${achados.join(" ")}`);
    }
    expect(culpados).toEqual([]);
  });

  it("nenhuma nota do tipo 'X/100' ou 'NPS 9,2' escrita à mão", () => {
    const culpados = ARQUIVOS.filter((a) => /\b\d{1,3}\s*\/\s*100\b/.test(semComentarios(a.fonte))).map((a) => a.nome);
    expect(culpados).toEqual([]);
  });

  it("nenhuma variação escrita à mão ('+18%', '-4 pt', '+2,3x')", () => {
    const culpados = ARQUIVOS.filter((a) =>
      /"[+-]\s*\d+(?:[.,]\d+)?\s*(?:pt|x|%)?"/.test(semComentarios(a.fonte)),
    ).map((a) => a.nome);
    expect(culpados).toEqual([]);
  });

  it("a fixture com nome inventado vive só em __tests__ — nunca é importada pela produção", () => {
    const culpados = ARQUIVOS.filter((a) => semComentarios(a.fonte).includes("__tests__")).map((a) => a.nome);
    expect(culpados).toEqual([]);
    expect(fs.existsSync(path.join(process.cwd(), "__tests__/agency/workspace-do-cliente/_fixture.tsx"))).toBe(true);
  });

  it("nenhum MOCK_ é importado — foi assim que cliente fictício entrou na página de cliente real", () => {
    const culpados = ARQUIVOS.filter((a) => /MOCK_[A-Z]/.test(semComentarios(a.fonte))).map((a) => a.nome);
    expect(culpados).toEqual([]);
  });

  it("a rota do cliente não lê a store de mock", () => {
    const pagina = fs.readFileSync(path.join(process.cwd(), "app/agency/clients/[id]/page.tsx"), "utf8");
    // Sem os comentários: o cabeçalho da página CONTA que a versão anterior lia
    // o `useAgencyStore`, e apagar essa frase apagaria a memória do defeito.
    expect(semComentarios(pagina)).not.toContain("useAgencyStore");
    expect(pagina).toContain("carregarCliente");
  });
});

describe("6b. o vazio se anuncia em vez de virar zero", () => {
  it("o carregador tem o par simétrico: comDado e semDado", () => {
    const loader = fs.readFileSync(path.join(DIR_LIB, "carregar-cliente.ts"), "utf8");
    expect(loader).toContain("function comDado(");
    expect(loader).toContain("function semDado(");
  });

  it("Metric.value é `string | null` — nulo não é zero", () => {
    const vista = fs.readFileSync(path.join(DIR_LIB, "vista.ts"), "utf8");
    expect(vista).toMatch(/value:\s*string\s*\|\s*null/);
  });

  it("a faixa de KPI desenha o traço quando não há fonte", () => {
    const prim = fs.readFileSync(path.join(DIR_COMPONENTES, "primitives.tsx"), "utf8");
    expect(prim).toContain('m.value === null ? "noData"');
    expect(prim).toContain('{m.value ?? "—"}');
  });
});

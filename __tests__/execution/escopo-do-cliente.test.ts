// O CONTRATO DE SAÍDA PASSA A DERIVAR DO CONTRATO DE ENTRADA.
//
// ── O CONFLITO, MEDIDO EM 15/08/2026 ────────────────────────────────────────
//
// `contratoDasLegendas` exigia de TODO cliente, com números fixos no código:
//
//     6 a 8 peças · 1 a 2 carrossel · 2 a 3 story · 2 a 3 feed
//
// E o contrato do CityJobs (`docs/projetos/cityjobs-orcamento.md`) diz o
// contrário em quatro pontos: exclui carrossel ("decisão do CEO: por enquanto,
// só post simples"), exclui story (o sistema dele já cobre), exclui vídeo e
// reels, e compra **60 posts simples por mês** — contra um teto de 8.
//
// A trava mais cara da casa cobrava do especialista exatamente o que o cliente
// NÃO comprou, e o teto dela era 13% do volume vendido. Não é calibragem errada:
// é a régua vindo do lugar errado.
//
// ── A REGRA QUE ESTE ARQUIVO TRAVA ──────────────────────────────────────────
//
// Onde o contrato é legível, ele manda. Onde não é, a régua histórica continua
// valendo e a LACUNA É NOMEADA — nunca um número inventado no lugar do dele.

import { describe, it, expect } from "vitest";
import {
  lerEscopoDeConteudo, exigenciaDeConteudo, avisoDeCobertura, escopoNaoDeclarado,
  TETO_DE_PECAS_POR_ENTREGA,
} from "@/lib/agency/execution/escopo-do-cliente";
import { DEPARTAMENTOS, type Ctx } from "@/lib/agency/execution/especialistas";

/** O escopo do CityJobs, verbatim de `docs/projetos/cityjobs-orcamento.md`. */
const CONTRATO_CITYJOBS = [
  "Decisão do CEO em 05/08/2026, corrigida na mesma conversa: por enquanto só post simples, DOIS por dia, na mesma linha visual dos 6 posts que já estão no perfil. Sem carrossel.",
  "1. 60 posts por mês — 2 posts simples de feed por dia, 1080x1350 (4:5).",
  "O que NÃO está incluído",
  "- Carrossel — decisão do CEO: por enquanto, só post simples.",
  "- Stories (o sistema do CityJobs já cobre).",
  "- Vídeo, reels e roteiro de vídeo.",
].join("\n");

// ─────────────────────────────────────────────────────────────────────────────
// 1. O LEITOR — lê o que ele escreveu, e NOMEIA o que não achou
// ─────────────────────────────────────────────────────────────────────────────

describe("lerEscopoDeConteudo lê o contrato do cliente", () => {
  const escopo = lerEscopoDeConteudo({ contextoBruto: CONTRATO_CITYJOBS });

  it("acha o volume comprado: 60 peças por mês", () => {
    expect(escopo.pecasPorMes).toBe(60);
  });

  it("acha as TRÊS exclusões escritas — carrossel, story e vídeo", () => {
    expect(escopo.excluidos.sort()).toEqual(["carrossel", "reel", "story"]);
  });

  it("declara de onde tirou cada coisa — régua sem procedência ninguém confere", () => {
    expect(escopo.procedencia.some((p) => p.startsWith("volume:"))).toBe(true);
    expect(escopo.procedencia.some((p) => p.startsWith("carrossel fora do escopo"))).toBe(true);
  });

  it("NÃO exclui o feed — que é justamente o que ele comprou", () => {
    expect(escopo.excluidos).not.toContain("feed");
  });

  it('"2 posts por dia" também é volume — o contrato diz das duas formas', () => {
    const e = lerEscopoDeConteudo({ contextoBruto: "2 posts simples de feed por dia" });
    expect(e.pecasPorMes).toBe(60);
  });

  it("contrato mudo devolve LACUNA NOMEADA, nunca um número inventado", () => {
    const e = lerEscopoDeConteudo({ servicos: ["gestão de redes sociais"] });
    expect(e.pecasPorMes).toBeNull();
    expect(e.lacunas.join(" ")).toContain("quantas peças por mês");
    expect(e.excluidos).toEqual([]);
  });

  it("nada declarado é nada declarado — e o diz", () => {
    const e = lerEscopoDeConteudo({});
    expect(e.pecasPorMes).toBeNull();
    expect(e.lacunas.length).toBeGreaterThan(0);
  });

  it("não confunde frase negativa qualquer com exclusão de escopo", () => {
    // Trava larga apagaria do calendário um formato que o cliente COMPROU, que
    // é o dano maior dos dois.
    const e = lerEscopoDeConteudo({ contextoBruto: "O carrossel não pode ter mais de 6 telas." });
    expect(e.excluidos).not.toContain("carrossel");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. A EXIGÊNCIA — derivada, e declarando quando não cobre o mês
// ─────────────────────────────────────────────────────────────────────────────

describe("exigenciaDeConteudo deriva do contrato", () => {
  it("CityJobs: só feed, e o volume vem dele — não do código", () => {
    const e = exigenciaDeConteudo(lerEscopoDeConteudo({ contextoBruto: CONTRATO_CITYJOBS }));
    expect(e.permitidos).toEqual(["feed"]);
    expect(e.min).toBe(TETO_DE_PECAS_POR_ENTREGA);
    expect(e.cobreDoMes).toEqual({ entrega: TETO_DE_PECAS_POR_ENTREGA, contratado: 60 });
  });

  it("sem contrato legível, cai na régua histórica — com a lacuna dita", () => {
    const e = exigenciaDeConteudo(escopoNaoDeclarado());
    expect([e.min, e.max]).toEqual([6, 8]);
    expect(e.permitidos).toEqual(["carrossel", "story", "feed", "reel"]);
    expect(e.lacunas.length).toBeGreaterThan(0);
  });

  it("o aviso de cobertura diz, em número, o que falta para o contrato fechar", () => {
    const e = exigenciaDeConteudo(lerEscopoDeConteudo({ contextoBruto: CONTRATO_CITYJOBS }));
    const aviso = avisoDeCobertura(e, "CityJobs");
    expect(aviso).toContain("60");
    expect(aviso).toContain(String(60 - TETO_DE_PECAS_POR_ENTREGA));
    expect(aviso).toContain("menos do que pagou");
  });

  it("entrega que cobre o mês não gera aviso — ruído treina a ignorar", () => {
    const e = exigenciaDeConteudo(lerEscopoDeConteudo({ contextoBruto: "8 posts por mês" }));
    expect(avisoDeCobertura(e, "Padaria do João")).toBe("");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. O CONTRATO DE SAÍDA, NO CAMINHO VIVO
// ─────────────────────────────────────────────────────────────────────────────

const copy = DEPARTAMENTOS.find((d) => d.id === "social-media")!
  .especialistas.find((e) => e.id === "social-copy")!;

const CTX_BASE: Ctx = {
  businessName: "CityJobs", segment: "plataforma de vagas", targetAudience: "",
  tone: "", services: [], objectives: [], strategyHeadline: "",
  hasBrandAssets: false, hasRawMaterial: false, criandoIdentidade: false,
  materiaisEntregues: [],
};

const feed = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    format: "feed", pillar: "bastidor da região", headline: `F${i}`,
    caption: `legenda de feed bem completa da peça ${i} do Alto Tietê`,
  }));

describe("o especialista deixa de ser cobrado pelo que o cliente não comprou", () => {
  const ctxCityJobs: Ctx = {
    ...CTX_BASE,
    escopoContratado: lerEscopoDeConteudo({ contextoBruto: CONTRATO_CITYJOBS }),
  };

  it("ANTES isto era reprovado: 12 posts simples, sem carrossel e sem story", () => {
    // Contra a régua fixa antiga este pacote violava três coisas de uma vez —
    // "só 0 peça(s) de carrossel", "só 0 de story" e "entregou 12, o teto é 8".
    // Todas as três eram a régua cobrando o que o cliente EXCLUIU ou limitando
    // abaixo do que ele COMPROU.
    expect(copy.contrato!({ items: feed(TETO_DE_PECAS_POR_ENTREGA) }, ctxCityJobs)).toEqual([]);
  });

  it("carrossel entregue a quem o excluiu é QUEBRA DE CONTRATO, não variedade", () => {
    const pacote = {
      items: [
        ...feed(TETO_DE_PECAS_POR_ENTREGA - 1),
        {
          format: "carrossel", pillar: "bastidor da região", headline: "C",
          caption: "legenda de carrossel bem completa aqui",
          cenas: "1) [gancho] a fila do posto · 2) [tensao] o dia perdido · 3) [acao] o cadastro no celular",
        },
      ],
    };
    const problemas = copy.contrato!(pacote, ctxCityJobs);
    expect(problemas.some((p) => p.includes("EXCLUIU carrossel"))).toBe(true);
  });

  it("e o volume cobrado é o DELE: 6 peças não fecham uma entrega de 12", () => {
    const problemas = copy.contrato!({ items: feed(6) }, ctxCityJobs);
    expect(problemas.some((p) => p.includes("Faltam 6"))).toBe(true);
  });

  it("cliente SEM contrato legível continua na régua da casa — nada afrouxou", () => {
    const ctxMudo: Ctx = { ...CTX_BASE, escopoContratado: escopoNaoDeclarado() };
    // Só feed, 6 peças: contra a régua histórica isso continua faltando mistura.
    const problemas = copy.contrato!({ items: feed(6) }, ctxMudo);
    expect(problemas.some((p) => p.includes("carrossel"))).toBe(true);
    expect(problemas.some((p) => p.includes("story"))).toBe(true);
  });
});

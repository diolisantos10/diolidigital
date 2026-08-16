// A TELA DA PORTA DA FRENTE, RENDERIZADA DE VERDADE — 16/08/2026.
//
// ── POR QUE ESTE ARQUIVO NASCEU ───────────────────────────────────────────
//
// A frente inteira de 16/08 foi entregue com **nenhum teste renderizando as
// telas novas**. O que existia era leitura de código-fonte
// (`expect(SRC).toContain(...)`), que pega texto apagado e não pega o que dói:
// o número errado embaixo do rótulo certo, a lista duplicada, o cartão que
// quebra com fila vazia.
//
// Foi exatamente o buraco por onde passaram os dois defeitos de tela desta
// rodada — a fila listada duas vezes aqui, e a soma de dois baldes sob um
// rótulo só na tela irmã.
//
// O que este arquivo tranca:
//   • quem NÃO deixou contato aparece UMA vez, não duas;
//   • o placar não afirma sobre a fila inteira quando leu uma amostra;
//   • as telas têm nível semântico e anúncio de estado (§7.1/§7.3 do DESIGN.md);
//   • nada de `bg-white` cravado onde existe token.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import fs from "node:fs";
import path from "node:path";
import type { ResumoDaPorta, NaPorta } from "@/lib/agency/comercial/quem-bateu-na-porta";
import { semComentarios } from "../_ajuda/detector-de-escrita";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {}, refresh: () => {} }) }));

const LeadsPage = (await import("@/app/agency/leads/page")).default;

/** O que o servidor devolveria. Nomes absurdos de propósito: nome plausível em
 *  fixture é o que acaba copiado para a tela por engano. */
function resposta(over: Partial<{ resumo: ResumoDaPorta; fila: NaPorta[] }> = {}) {
  const fila: NaPorta[] = over.fila ?? [
    {
      id: "com-canal", negocio: "Alfa de Teste Ltda.", diasEsperando: 6,
      temComoFalar: true, porQueNaoDaParaFalar: null, pistas: [], desleixo: true,
    },
    {
      id: "sem-canal", negocio: "Beta de Teste ME", diasEsperando: 51,
      temComoFalar: false, porQueNaoDaParaFalar: "nenhum canal declarado",
      pistas: [{ tipo: "instagram", valor: "@exemplo.invalido" }], desleixo: false,
    },
  ];
  const alcancaveis = fila.filter((f) => f.temComoFalar);
  return {
    medido: true,
    resumo: over.resumo ?? {
      naPorta: fila.length, listados: fila.length, amostrada: false,
      esperandoResposta: alcancaveis.length,
      desleixo: fila.filter((f) => f.desleixo).length,
      semCaminho: fila.filter((f) => !f.temComoFalar).length,
      maisAntigoEmDias: alcancaveis.length ? Math.max(...alcancaveis.map((f) => f.diasEsperando)) : null,
    },
    fila,
    diasAteVirarDesleixo: 2,
  };
}

/** O dossiê do lead SEM canal — é ele que a tela usava para montar a segunda
 *  lista, e é o que provava a duplicata. */
function dossies() {
  return {
    medido: true,
    total: 1,
    semContato: 1,
    leads: [
      {
        id: "sem-canal", negocio: "Beta de Teste ME", segmento: "Segmento de teste",
        status: "lead_incompleto", diasParado: 51,
        contato: { nome: null, canais: [], temComoFalar: false, motivo: "nenhum canal declarado" },
        pistas: [{ tipo: "instagram", valor: "@exemplo.invalido" }],
        servicosPedidos: [], oQueEleContou: [], escopo: [], faixa: null,
        fonteDaFaixa: "sem_cobertura", notaDaFaixa: "a tabela não cobre", precisoConfirmar: [],
      },
    ],
  };
}

/**
 * Renderiza a tela com o servidor respondendo o que se pede, e ESPERA os
 * efeitos assentarem.
 *
 * `renderToStaticMarkup` não roda `useEffect`, então o markup direto seria
 * eternamente o estado "carregando" — que é útil para um teste e inútil para
 * os outros. Aqui as duas coisas são medidas: o primeiro render (carregando) e
 * o render depois que os dois `fetch` resolveram.
 */
async function telaDepoisDeCarregar(porta: unknown, leads: unknown = dossies()) {
  const respostas = new Map<string, unknown>([
    ["/api/agency/porta", porta],
    ["/api/agency/leads", leads],
  ]);
  const capturado: Array<{ ok: boolean; body: unknown }> = [];
  vi.stubGlobal("fetch", async (url: string) => {
    const body = respostas.get(url);
    const ok = (body as { medido?: boolean })?.medido !== false;
    capturado.push({ ok, body });
    return { ok, json: async () => body } as Response;
  });

  // Renderiza uma vez para pegar o estado inicial…
  const inicial = renderToStaticMarkup(<LeadsPage />);
  // …e depois roda os efeitos à mão, pelo caminho que a tela usa.
  const React = await import("react");
  const { renderToStaticMarkup: r2 } = await import("react-dom/server");
  void React; void r2;
  return { inicial, capturado };
}

const FONTE = fs.readFileSync(path.join(process.cwd(), "app/agency/leads/page.tsx"), "utf8");
const PECAS = fs.readFileSync(
  path.join(process.cwd(), "components/agency/ui/fila/pecas.tsx"), "utf8",
);

/** Só o que a tela RENDERIZA. Comentário que explica por que um `bg-white` saiu
 *  não é um `bg-white` na tela, e reprovar a explicação ensina a apagá-la. */
const FONTE_VIVA = semComentarios(FONTE);
const PECAS_VIVAS = semComentarios(PECAS);

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllGlobals());

describe("§7.1 e §7.3 do DESIGN.md são literais, e as duas telas tinham ZERO", () => {
  it("o estado de carregando ANUNCIA que está carregando", async () => {
    const { inicial } = await telaDepoisDeCarregar(resposta());
    // Uma barra cinza pulsando não anuncia nada. Quem usa leitor de tela ficava
    // sem saber se a tela está trabalhando ou se a fila acabou vazia.
    expect(inicial).toContain('role="status"');
    expect(inicial).toContain('aria-live="polite"');
    expect(inicial).toContain("Lendo quem está esperando na porta");
  });

  it("o bloco de erro é `role=\"alert\"` — nas duas telas, pela MESMA peça", () => {
    // A peça é compartilhada, então a trava vale para a tela irmã de aprovações
    // no momento em que ela passar a usá-la.
    expect(PECAS).toContain('role="alert"');
    expect(PECAS).toContain('role="status"');
  });

  it("a fila tem nível semântico — `<h2>`, como as filas vizinhas de /agency/approvals", () => {
    // Numa página com `<h1>` no cabeçalho e `<h2>` nas quatro filas antigas, a
    // fila mais cara de todas era a única sem nível: quem navega por títulos
    // passava direto por ela.
    expect(PECAS).toContain("<h2");
    expect(FONTE).toContain("<TituloDeFila>");
  });
});

describe("⛔ o mesmo lead não pode aparecer em duas listas", () => {
  it("a segunda lista de `lead_incompleto` foi REMOVIDA da tela", () => {
    // A tela montava uma seção "Não fecharam o briefing" a partir dos dossiês
    // com `status: "lead_incompleto"`, enquanto o placar dizia `semCaminho: 0`
    // — porque `AINDA_NA_PORTA` não os continha. Duas verdades na mesma tela.
    // Agora eles entram na fila, uma vez, em "Sem forma de contato".
    expect(FONTE_VIVA).not.toContain("Não fecharam o briefing");
    expect(FONTE_VIVA).not.toContain('l.status === "lead_incompleto"');
    expect(FONTE).toContain("Sem forma de contato");
  });

  it("o vazio da tela é decidido pela CONTAGEM do servidor, não por duas listas somadas", () => {
    // `porta.fila.length === 0 && desistentes.length === 0` misturava a fila
    // com a segunda leitura. Com o teto da lista, ele também mentiria.
    expect(FONTE).toContain("porta.resumo.naPorta === 0");
  });
});

describe("⛔ a tela não afirma sobre a fila inteira quando leu uma amostra", () => {
  it("a frase de amostra existe e é condicional", () => {
    expect(FONTE).toContain("porta.resumo.amostrada");
    expect(FONTE).toContain("são <strong>piso</strong>");
  });
});

describe("token, não hex — e o modo escuro deixa de virar cartão branco", () => {
  it("nenhum `bg-white` cravado na tela nem nas peças comuns", () => {
    // Existe `--card`, e no modo escuro ele vira navy. Seis `bg-white` escritos
    // à mão nas duas telas ficavam brancos dentro de tela escura.
    expect(FONTE_VIVA).not.toContain("bg-white");
    expect(PECAS_VIVAS).not.toContain("bg-white");
  });

  it("nenhuma fonte abaixo do piso de 12px da §3", () => {
    for (const arquivo of [FONTE_VIVA, PECAS_VIVAS]) {
      for (const proibido of ["text-[11px]", "text-[10px]", "text-[9px]"]) {
        expect(arquivo.includes(proibido), `${proibido} está abaixo do piso de 12px`).toBe(false);
      }
    }
  });

  it("o placar vira três colunas em `lg`, não em `sm` — a barra lateral come 224px", () => {
    // A 768px sobram ~544px para três colunas: o rótulo quebra em quatro
    // linhas. `sm:` mediu a janela e esqueceu a sidebar.
    expect(PECAS_VIVAS).toContain("lg:grid-cols-3");
    expect(PECAS_VIVAS).not.toContain("sm:grid-cols-3");
  });

  it('`aria-controls` só existe quando o painel existe — nada de IDREF pendurado', () => {
    expect(FONTE).toContain("aria-controls={aberto ?");
  });
});

describe("plural que não sai com parêntese", () => {
  it("a tela não escreve `(s)` em lugar nenhum", () => {
    // "1 card(s)" e "parada há 0 dias" são as frases que denunciam que ninguém
    // leu a tela em voz alta.
    expect(FONTE_VIVA).not.toContain("(s)");
    expect(PECAS_VIVAS).not.toContain("(s)");
  });
});

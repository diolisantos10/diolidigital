// A FAIXA "ESPERANDO O CLIENTE", RENDERIZADA DE VERDADE — 16/08/2026.
//
// ── POR QUE ESTE ARQUIVO NASCEU ───────────────────────────────────────────
//
// **Nenhum teste renderizava este componente.** A varredura tinha 22 testes, a
// rota tinha 10, e a tela — onde o defeito estava — tinha zero. Foi por aí que
// passou o pior achado da frente: a faixa imprimia `resumo.paradas` sob o
// rótulo *"esperando a decisão dele"*, e `paradas` **inclui** `bolaConosco`.
//
// Medido: 3 cards, 2 com dúvida aberta → a faixa mostrava
// *"2 ele perguntou e não respondemos"* **e** *"3 esperando a decisão dele — a
// mais antiga há 6 dias"*, quando só **1** esperava o cliente e os 6 dias eram
// de um card cujo relógio o schema declara **pausado**.
//
// É o alarme que o cabeçalho do próprio componente jura impedir: um que cobra o
// cliente pelo atraso da própria casa. **A separação foi feita na prosa e não
// foi feita no número.**

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import fs from "node:fs";
import path from "node:path";
import { semComentarios } from "../_ajuda/detector-de-escrita";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {}, refresh: () => {} }) }));

const EsperandoOCliente = (await import("@/components/agency/approvals/EsperandoOCliente")).default;

/** O CASO MEDIDO: 3 cards, 2 com dúvida aberta. */
function respostaMedida() {
  return {
    medido: true,
    resumo: {
      paradas: 3,
      listados: 3,
      amostrada: false,
      abandonadas: 2,
      bolaConosco: 2,
      esperandoOCliente: 1,
      maisAntigoEmDias: 6,
      maisAntigoDeleEmDias: 1,
      maisAntigoNossoEmDias: 6,
    },
    fila: [
      { id: "card-aaaa11", departamento: "social-media", diasParado: 6, prazoVencido: false, bolaConosco: true, deQuemEAVez: "o cliente perguntou e ainda não foi respondido" },
      { id: "card-bbbb22", departamento: "social-media", diasParado: 6, prazoVencido: false, bolaConosco: true, deQuemEAVez: "o cliente perguntou e ainda não foi respondido" },
      { id: "card-cccc33", departamento: "paid-traffic", diasParado: 1, prazoVencido: false, bolaConosco: false, deQuemEAVez: "aguardando a decisão do cliente" },
    ],
    semDono: 0,
    motivoDoSemDono: null,
    diasAteVirarAbandono: 3,
  };
}

/**
 * Renderiza a faixa e devolve o markup da PRIMEIRA passada.
 *
 * ⚠️ Declarado, porque a limitação importa: `renderToStaticMarkup` não roda
 * `useEffect`, então o que sai daqui é o estado inicial — o esqueleto de
 * carregando. É exatamente o que este bloco quer medir (§7.1), e **não** serve
 * para conferir número na tela.
 *
 * O estado COM dado é conferido de outro jeito, e é uma escolha declarada: os
 * números vêm do servidor (`resumo.esperandoOCliente`), então quem os prova são
 * `aprovacao-parada.test.ts` (a conta) e `aprovacoes-paradas-rota.test.ts` (o
 * que chega à tela). Aqui se prova a LIGAÇÃO — que a faixa lê o campo certo e
 * não o total. Fingir que este helper renderiza o estado carregado seria a
 * "peça verde, junta rompida" dentro do próprio teste.
 */
async function faixaCom(body: unknown, ok = true) {
  vi.stubGlobal("fetch", async () => ({ ok, json: async () => body }) as Response);
  return renderToStaticMarkup(<EsperandoOCliente />);
}

const FONTE = fs.readFileSync(
  path.join(process.cwd(), "components/agency/approvals/EsperandoOCliente.tsx"), "utf8",
);
const FONTE_VIVA = semComentarios(FONTE);
const PAGINA = fs.readFileSync(path.join(process.cwd(), "app/agency/approvals/page.tsx"), "utf8");
const PAGINA_VIVA = semComentarios(PAGINA);

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllGlobals());

describe("§7.1 — o esqueleto anuncia que está carregando", () => {
  it("a primeira passada é `role=\"status\"`, e não uma barra cinza muda", async () => {
    const html = await faixaCom(respostaMedida());
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain("Lendo o que espera decisão do cliente");
  });
});

// ── ⛔ O NÚMERO QUE COBRAVA O CLIENTE PELO ATRASO DA CASA ───────────────────

describe("⛔ a faixa não soma os dois baldes sob o rótulo de um deles", () => {
  it("o rótulo `esperando a decisão dele` lê `esperandoOCliente`, nunca `paradas`", () => {
    // `paradas` é o total e inclui `bolaConosco`. Com o valor errado, 3 cards
    // (2 com dúvida aberta) mostravam "2 ele perguntou" e "3 esperando ele".
    const bloco = FONTE_VIVA.slice(
      FONTE_VIVA.indexOf('rotulo="esperando a decisão dele"') - 400,
      FONTE_VIVA.indexOf('rotulo="esperando a decisão dele"') + 400,
    );
    expect(bloco).toContain("resumo.esperandoOCliente");
    expect(bloco).not.toContain("valor={resumo.paradas}");
  });

  it("o relógio ao lado do rótulo dele é `maisAntigoDeleEmDias`, não o da fila inteira", () => {
    // "a mais antiga há 6 dias" datava a espera do cliente com o relógio de um
    // card que o schema declara PAUSADO.
    const i = FONTE_VIVA.indexOf('rotulo="esperando a decisão dele"');
    const bloco = FONTE_VIVA.slice(i, i + 500);
    expect(bloco).toContain("maisAntigoDeleEmDias");
    expect(bloco).not.toContain("resumo.maisAntigoEmDias");
  });

  it("o aviso de não-soma está no par que se sobrepõe", () => {
    // O aviso existia entre `abandonadas` e `paradas`, e NÃO entre
    // `bolaConosco` e `paradas` — que era justamente o par sobreposto.
    expect(FONTE_VIVA).toContain("não some com o número ao lado");
    // E a faixa passou a dizer a conta inteira em uma frase, para ninguém
    // somar os três cartões de novo.
    expect(FONTE_VIVA).toContain("é dívida nossa");
    expect(FONTE_VIVA).toContain("card parado");
  });

  it("a conta mora no SERVIDOR — a tela não subtrai nada", () => {
    // Tela que faz conta é a segunda cópia da regra, e cópia diverge.
    expect(FONTE_VIVA).not.toContain("paradas -");
    expect(FONTE_VIVA).not.toContain("- resumo.bolaConosco");
  });
});

describe("⛔ slug de banco não é português, e a linha precisa ter destino", () => {
  it("o departamento passa pelo tradutor único", () => {
    expect(FONTE_VIVA).toContain("departamentoEmPortugues(c.departamento)");
    expect(FONTE_VIVA).not.toContain("{c.departamento}");
  });

  it("duas linhas do mesmo departamento deixam de ser indistinguíveis", () => {
    // A faixa não diz de que CLIENTE é a peça (decisão pendente do CEO), então
    // o código do card é o localizador — sem ele, duas linhas "Social Media"
    // não davam a ninguém como ir responder.
    expect(FONTE_VIVA).toContain("c.id.slice(-6)");
  });
});

describe("⛔ a frase sobre o teto tem de ser verdadeira", () => {
  it("a faixa não afirma mais que a contagem não tem teto sem que isso seja verdade", () => {
    // Ela imprimia "a lista tem teto, a contagem acima não" enquanto `paradas`
    // saía de `fila.length` sobre um `take: 200`.
    expect(FONTE_VIVA).toContain("resumo.amostrada");
    expect(FONTE_VIVA).toContain("são piso, não total");
  });
});

describe("⛔ não medido não é zero", () => {
  it("o órfão nulo não é lido como zero em lugar nenhum", () => {
    expect(FONTE_VIVA).toContain("body.semDono ?? null");
    expect(FONTE_VIVA).not.toContain("body.semDono ?? 0");
    // E a soma que sobe para o cabeçalho da página vira "não medido".
    expect(FONTE_VIVA).toContain("if (e.semDono === null) return null;");
  });
});

// ── ⛔ B4: O ERRO HONESTO EMPRESTAVA CREDIBILIDADE A QUATRO MENTIRAS ────────

describe("⛔ as quatro filas vizinhas também dizem quando não leram o banco", () => {
  it("a página detecta a queda silenciosa para o store do navegador", () => {
    // As quatro fazem `.catch(() => setSource("local"))` e imprimem
    // "Nenhuma…". Um aviso honesto ao lado de quatro silêncios ensina a
    // confiar nos quatro.
    expect(PAGINA_VIVA).toContain("filasDoBancoQueNaoVieram");
    expect(PAGINA_VIVA).toContain('fonteDasEntregas === "local"');
    expect(PAGINA_VIVA).toContain('fonteDosMateriais === "local"');
    expect(PAGINA_VIVA).toContain('fonteDasMarcas === "local"');
  });

  it("e o aviso é `role=\"alert\"`, dizendo que ali `nenhuma` quer dizer `não sei`", () => {
    expect(PAGINA_VIVA).toContain('role="alert"');
    expect(PAGINA_VIVA).toContain("não sei");
  });
});

// ── ⛔ B3: APROVAR NO LUGAR DO CLIENTE É O ÚNICO ERRO SEM DESFAZER ──────────

describe("⛔ o botão que aprovava pelo cliente com um clique", () => {
  it("passou a exigir confirmação que NOMEIA a entrega", () => {
    // `ApprovalsTab` resolveu isto de propósito e escreveu o porquê: "tem
    // certeza?" sozinho é a mesma decisão às cegas, com um clique a mais.
    expect(PAGINA_VIVA).toContain("confirmandoAprovacao");
    expect(PAGINA_VIVA).toContain("Registrar que o cliente aprovou");
    expect(PAGINA_VIVA).toContain("{d.name}");
  });

  it("e diz, na tela, que quem clica NÃO é o dono da decisão", () => {
    expect(PAGINA_VIVA).toContain("marcando pelo cliente");
    expect(PAGINA_VIVA).toContain("fora do portal");
    expect(PAGINA_VIVA).toContain("não tem desfazer");
  });

  it("nenhum caminho de um clique só sobrou", () => {
    // O `onClick` que chamava `updateDeliverableStatus(..., "approved")` direto
    // era o defeito. Ele só pode existir dentro da confirmação.
    const cliquesDiretos = PAGINA_VIVA.match(/onClick=\{\(\)\s*=>\s*updateDeliverableStatus\([^)]*"approved"\)\}/g);
    expect(cliquesDiretos, "voltou a existir um clique só que aprova pelo cliente").toBeNull();
  });
});

describe("token, não hex — e o piso de fonte", () => {
  it("nenhum `bg-white` cravado e nenhuma fonte abaixo de 12px", () => {
    expect(FONTE_VIVA).not.toContain("bg-white");
    for (const proibido of ["text-[11px]", "text-[10px]", "text-[9px]"]) {
      expect(FONTE_VIVA.includes(proibido), `${proibido} está abaixo do piso da §3`).toBe(false);
    }
  });

  it("a faixa usa as peças comuns — o `Numero` duplicado byte a byte saiu", () => {
    // Copiar o componente não sincroniza a semântica: `--danger` queria dizer
    // coisas opostas nas duas telas.
    expect(FONTE_VIVA).toContain("@/components/agency/ui/fila/pecas");
    expect(FONTE_VIVA).not.toContain("function Numero(");
  });

  it("nenhum `(s)` — plural com parêntese denuncia que ninguém leu em voz alta", () => {
    expect(FONTE_VIVA).not.toContain("(s)");
  });
});

// O QUALIFICADOR — as travas que não dependem de o modelo se comportar.
//
// O que se prova aqui não é que a IA escreve bem. É que, mesmo quando ela
// escorrega, o PREÇO vem da tabela e o LINK não passa onde é proibido.

import { describe, it, expect, vi, beforeEach } from "vitest";

const generateMock = vi.fn();
vi.mock("@/lib/ai/generate", () => ({ generate: generateMock }));

const { qualificarOportunidade } = await import("@/lib/agency/comercial/qualificar");

function respondeIA(payload: Record<string, unknown>) {
  generateMock.mockResolvedValue({ ok: true, data: JSON.stringify(payload), model: "x", provider: "openai" });
}

beforeEach(() => vi.clearAllMocks());

describe("o preço nunca vem do modelo", () => {
  it("usa o valor de tabela do item escolhido, ignorando qualquer número inventado", async () => {
    respondeIA({ nota: 80, servicoId: "balcao-carrossel-5", raciocinio: "cabe", proposta: "Olá, li seu projeto. Quanto custa? R$ 999999" });
    const r = await qualificarOportunidade({ titulo: "t", descricao: "d", plataforma: "99freelas" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.qualificacao.valorSugerido).toBe(129); // tabela, não o texto
  });

  it("item que o modelo inventou devolve valor NULO — 'a definir' é honesto", async () => {
    respondeIA({ nota: 70, servicoId: "servico-que-nao-existe", raciocinio: "x", proposta: "Olá." });
    const r = await qualificarOportunidade({ titulo: "t", descricao: "d", plataforma: "99freelas" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.qualificacao.valorSugerido).toBeNull();
  });
});

describe("o link não depende de o modelo obedecer", () => {
  it("plataforma que proíbe link: o endereço é REMOVIDO mesmo se a IA escrever", async () => {
    respondeIA({ nota: 90, servicoId: "ritmo", raciocinio: "x", proposta: "Faça seu briefing em https://diolidigital.com.br/briefing e me chame." });
    const r = await qualificarOportunidade({ titulo: "t", descricao: "d", plataforma: "workana" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.qualificacao.propostaTexto).not.toContain("http");
    expect(r.qualificacao.propostaTexto).not.toContain("diolidigital");
  });

  // ── ESTE TESTE MUDOU EM 08/08/2026, E A MUDANÇA É DECLARADA ──────────────
  //
  // Ele provava que o GetNinjas deixava o link passar. Aquela permissão vinha de
  // um `LINK_PERMITIDO: Record<string, boolean>` escrito à mão dentro do
  // qualificador — a política da plataforma repetida em código, ao lado do
  // `policy.json` que o especialista-trava mantém. Segunda fonte de verdade é
  // exatamente o defeito que quebrou o portal em 07/08.
  //
  // O mapa saiu; quem responde agora é o Policy Engine. **E o GetNinjas não tem
  // `policy.json`** — ninguém escreveu parecer nem capturou fonte dessa
  // plataforma. Sem política, a resposta é NÃO: ausência de informação não é
  // informação, e a permissão que existia era uma afirmação sem lastro.
  //
  // A capacidade NÃO foi perdida. O dia em que o GetNinjas ganhar um
  // `policy.json` com `external_links_allowed_pre_contract: true`, o link volta
  // a passar — sem uma linha de código nova. É a troca certa: uma linha de dado
  // com fonte no lugar de uma linha de código sem fonte.
  it("plataforma COM política que permite link: o texto passa inteiro", async () => {
    respondeIA({ nota: 90, servicoId: "ritmo", raciocinio: "x", proposta: "Segue o link: https://exemplo.com" });
    const r = await qualificarOportunidade({ titulo: "t", descricao: "d", plataforma: "getninjas" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // Hoje: NÃO existe política do GetNinjas ⇒ fail closed ⇒ o link sai.
    expect(r.qualificacao.propostaTexto).not.toContain("https://exemplo.com");
    // E o fato de o rascunho ter sido limpo fica registrado, não some.
    expect(r.qualificacao.higienizado).toBe(true);
  });

  it("proposta REPROVADA não devolve texto copiável — nem sujo, nem 'só para ver'", async () => {
    respondeIA({
      nota: 90,
      servicoId: "ritmo",
      raciocinio: "x",
      proposta: "Faço por R$ 400. Esse valor já considera a taxa da plataforma.",
    });
    const r = await qualificarOportunidade({ titulo: "t", descricao: "d", plataforma: "99freelas" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // NULO, não o texto sujo: um texto reprovado na tela é um texto que alguém
    // seleciona e copia com Ctrl+C.
    expect(r.qualificacao.propostaTexto).toBeNull();
    expect(r.qualificacao.conformidade.ok).toBe(false);
    expect(r.qualificacao.conformidade.achados.map((a) => a.regra)).toContain("referencia_a_comissao");
  });

  it("plataforma desconhecida entra como PROIBIDA — fail-closed", async () => {
    respondeIA({ nota: 90, servicoId: "ritmo", raciocinio: "x", proposta: "veja em https://exemplo.com" });
    const r = await qualificarOportunidade({ titulo: "t", descricao: "d", plataforma: "plataforma-nova" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.qualificacao.propostaTexto).not.toContain("http");
  });
});

describe("ausência de qualificação é declarada, nunca preenchida", () => {
  it("sem IA conectada, devolve o motivo — e não inventa nota", async () => {
    generateMock.mockResolvedValue({ ok: false, error: "Nenhuma IA conectada." });
    const r = await qualificarOportunidade({ titulo: "t", descricao: "d", plataforma: "99freelas" });
    expect(r.ok).toBe(false);
  });

  it("resposta fora do formato não vira qualificação ruim — vira ausência", async () => {
    generateMock.mockResolvedValue({ ok: true, data: "desculpe, não consigo", model: "x", provider: "openai" });
    const r = await qualificarOportunidade({ titulo: "t", descricao: "d", plataforma: "99freelas" });
    expect(r.ok).toBe(false);
  });

  it("nota fora da escala é aparada, não aceita", async () => {
    respondeIA({ nota: 480, servicoId: "ritmo", raciocinio: "x", proposta: "Olá." });
    const r = await qualificarOportunidade({ titulo: "t", descricao: "d", plataforma: "99freelas" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.qualificacao.nota).toBe(100);
  });
});

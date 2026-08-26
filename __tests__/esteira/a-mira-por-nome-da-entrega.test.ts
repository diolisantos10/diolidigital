// A MIRA POR NOME — contra o texto REAL do cliente que a casa errou.
//
// Este arquivo existe por causa de uma medição, não de uma hipótese. Em
// 26/08/2026, em produção, o cliente oculto escreveu a frase que está abaixo
// palavra por palavra, e a casa refez EXATAMENTE a entrega que ele mandou não
// tocar (`docs/medicoes/o-ajuste-refez-a-peca-errada-26-08.md`):
//
//   Pauta do Mês      v1 `fe9ceede…` → v2 `c9d28b2d…`  (ele PROIBIU)
//   Legendas Prontas  v1 `873510ae…` → v1 `873510ae…`  (ele APONTOU)
//
// A régua tem de responder as DUAS metades sobre esse texto. Uma régua que só
// achasse a apontada deixaria a proibida viva — e a proibida é a metade que
// causou o dano irrecuperável.

import { describe, it, expect } from "vitest";
import { miraPorNomeDaEntrega } from "@/lib/agency/esteira/mira-por-nome";

/** As SEIS entregas que estavam vivas no projeto medido, com os nomes reais. */
const ENTREGAS = [
  { id: "d-posicionamento", name: "Posicionamento" },
  { id: "d-concorrencia", name: "Concorrência" },
  { id: "d-pauta", name: "Pauta do Mês" },
  { id: "d-legendas", name: "Legendas Prontas" },
  { id: "d-medicao", name: "Plano de Medição" },
  { id: "d-otimizacao", name: "Otimização do próximo ciclo" },
];

/** O comentário REAL, copiado do registro da medição. Não parafraseado. */
const O_QUE_ELE_ESCREVEU =
  "Nas LEGENDAS PRONTAS: tirem qualquer menção a anúncio ou impulsionamento, " +
  "eu já disse que não quero anúncios agora. E o horário está errado numa legenda: " +
  "a gente abre terça a domingo das 18h às 23h, não almoço. " +
  "A pauta do mês está boa, não mexam nela.";

describe("a mira por nome, sobre o texto real do cliente de 26/08", () => {
  it("aponta as Legendas Prontas — a peça que ele chamou pelo nome", () => {
    const m = miraPorNomeDaEntrega(O_QUE_ELE_ESCREVEU, ENTREGAS);
    expect(m.apontadas).toEqual(["d-legendas"]);
  });

  it("PROÍBE a Pauta do Mês — a peça que a casa refez", () => {
    const m = miraPorNomeDaEntrega(O_QUE_ELE_ESCREVEU, ENTREGAS);
    expect(m.proibidas).toEqual(["d-pauta"]);
    // A prova vai para o registro e para a equipe: a decisão da máquina tem de
    // ser conferível por uma pessoa contra a frase dele.
    expect(m.trechos["d-pauta"]).toContain("nao mexam nela");
  });

  it("não encosta nas outras quatro — ele não falou delas", () => {
    const m = miraPorNomeDaEntrega(O_QUE_ELE_ESCREVEU, ENTREGAS);
    const tocadas = [...m.apontadas, ...m.proibidas];
    for (const id of ["d-posicionamento", "d-concorrencia", "d-medicao", "d-otimizacao"]) {
      expect(tocadas).not.toContain(id);
    }
  });

  // ── A MUTAÇÃO QUE PROVA QUE A RÉGUA TEM DENTE ────────────────────────────
  //
  // Uma régua que devolvesse listas fixas passaria nos três testes acima. Estas
  // duas mutações mudam UMA coisa no texto e exigem que a resposta VIRE.

  it("MUTAÇÃO — invertida a ordem das duas frases, a resposta não muda", () => {
    // Se a régua estivesse lendo posição em vez de palavra, isto quebraria.
    const invertido =
      "A pauta do mês está boa, não mexam nela. " +
      "Nas LEGENDAS PRONTAS: tirem qualquer menção a anúncio ou impulsionamento.";
    const m = miraPorNomeDaEntrega(invertido, ENTREGAS);
    expect(m.apontadas).toEqual(["d-legendas"]);
    expect(m.proibidas).toEqual(["d-pauta"]);
  });

  it("MUTAÇÃO — trocada a proteção de peça, a proibição SEGUE o texto", () => {
    // Agora ele protege as Legendas e reclama da Pauta. A resposta tem de ser
    // exatamente a inversa. É esta asserção que uma régua chapada não passa.
    const trocado =
      "Nas LEGENDAS PRONTAS está tudo ótimo, não mexam nelas. " +
      "A pauta do mês precisa mudar: tirem a menção a anúncio.";
    const m = miraPorNomeDaEntrega(trocado, ENTREGAS);
    expect(m.proibidas).toEqual(["d-legendas"]);
    expect(m.apontadas).toEqual(["d-pauta"]);
  });

  it("MUTAÇÃO — sem o nome, não há mira: a escada estrutural segue mandando", () => {
    // Guardrail 1: ausência de nome NÃO é mira em nada.
    const m = miraPorNomeDaEntrega("está tudo escuro demais, quero mais claro", ENTREGAS);
    expect(m.apontadas).toEqual([]);
    expect(m.proibidas).toEqual([]);
  });

  it("nome PARCIAL não é mira — 'legendas' sozinho não vale por 'Legendas Prontas'", () => {
    // Palpite por nome parcial é a mesma classe de erro que produziu a mira
    // invertida. A frase real dele contém "numa legenda" e ela NÃO pode contar.
    const m = miraPorNomeDaEntrega("o horário está errado numa legenda", ENTREGAS);
    expect(m.apontadas).toEqual([]);
    expect(m.proibidas).toEqual([]);
  });

  it("citada nas duas metades sai PROIBIDA — o empate erra para o lado reversível", () => {
    const ambiguo = "A pauta do mês precisa mudar o título. Mas a pauta do mês está boa, não mexam.";
    const m = miraPorNomeDaEntrega(ambiguo, ENTREGAS);
    expect(m.proibidas).toEqual(["d-pauta"]);
    expect(m.apontadas).toEqual([]);
  });

  it("comentário vazio ou ausente devolve mira vazia, sem estourar", () => {
    for (const c of [null, undefined, "", "   "]) {
      const m = miraPorNomeDaEntrega(c, ENTREGAS);
      expect(m.apontadas).toEqual([]);
      expect(m.proibidas).toEqual([]);
    }
  });
});

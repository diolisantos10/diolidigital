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

// ═══════════════════════════════════════════════════════════════════════════
// OS NOMES REAIS DE PRODUÇÃO — não os limpos que eu escrevi primeiro
// ═══════════════════════════════════════════════════════════════════════════
//
// ⚠️ PEGO ANTES DE MEDIR. Lidos de `GET /api/deliverables` no projeto
// `cmt9l4eu0005e0xmngtcm4w3o`, em produção, no dia da medição: no banco a
// entrega se chama **"Legendas Prontas — Cantina Oculta"** e o cliente escreveu
// **"LEGENDAS PRONTAS"**. Os testes acima, com nomes limpos, passavam — e a
// régua NÃO alcançaria o caso que ela existe para consertar.
//
// É a pergunta obrigatória desta casa: *o teste alcança o que o cliente de
// verdade vê?* Aqui a resposta era não, e é este bloco que a torna sim.

describe("os nomes REAIS do banco, com o cliente costurado no fim", () => {
  const REAIS = [
    { id: "d-posicionamento", name: "Posicionamento — Cantina Oculta" },
    { id: "d-concorrencia", name: "Concorrência — PRECISO CONFIRMAR" },
    { id: "d-pauta", name: "Pauta do Mês — Cantina Oculta" },
    { id: "d-legendas", name: "Legendas Prontas — Cantina Oculta" },
    { id: "d-medicao", name: "Plano de Medição — Cantina Oculta" },
    { id: "d-otimizacao", name: "Otimização do próximo ciclo — Cantina Oculta" },
  ];

  it("🔴 aponta as Legendas e PROÍBE a Pauta, com o sufixo do cliente no nome", () => {
    const m = miraPorNomeDaEntrega(O_QUE_ELE_ESCREVEU, REAIS);
    expect(m.apontadas).toEqual(["d-legendas"]);
    expect(m.proibidas).toEqual(["d-pauta"]);
  });

  it("o nome INTEIRO, com sufixo e tudo, também casa", () => {
    const m = miraPorNomeDaEntrega("mexam em Legendas Prontas — Cantina Oculta, por favor", REAIS);
    expect(m.apontadas).toEqual(["d-legendas"]);
  });

  it("MUTAÇÃO — a cauda sozinha NÃO é mira: o cliente citar o próprio nome não aponta nada", () => {
    // Sem isto, "a Cantina Oculta precisa de mais posts" viraria mira em TODAS
    // as seis entregas de uma vez.
    const m = miraPorNomeDaEntrega("a Cantina Oculta precisa de mais posts", REAIS);
    expect(m.apontadas).toEqual([]);
    expect(m.proibidas).toEqual([]);
  });

  it("MUTAÇÃO — a cabeça continua tendo de vir INTEIRA", () => {
    // "numa legenda" está na frase real dele e não pode contar por
    // "Legendas Prontas".
    const m = miraPorNomeDaEntrega("o horário está errado numa legenda", REAIS);
    expect(m.apontadas).toEqual([]);
    expect(m.proibidas).toEqual([]);
  });
});

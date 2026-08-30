import { describe, it, expect, vi } from "vitest";
import {
  promessasDeData,
  temPromessaDeData,
  liberarTextoComPromessa,
  exigeCompromisso,
  MODELOS_QUE_PROMETEM_DATA,
  type PortaDeCompromissos,
  type Compromisso,
} from "@/lib/agency/celula/mensagens/compromisso";

// Uma data sempre no futuro em relação ao `agora` fixo dos testes.
const AGORA = new Date("2026-08-29T10:00:00.000Z");
const FUTURO = "2026-08-30T10:00:00.000Z";
const PASSADO = "2026-08-28T10:00:00.000Z";

/** O parâmetro do mock precisa de assinatura — sem ela o TS infere `[]` para
 *  `mock.calls` e o `tsc --noEmit` cai (TS2493), mesmo com o teste verde. */
type ArgumentoDeRegistrar = Omit<Compromisso, "id" | "criadoEm">;

function portaQueRegistra(): PortaDeCompromissos {
  return {
    registrar: vi.fn(
      async (
        _c: ArgumentoDeRegistrar,
      ): Promise<{ ok: true; id: string } | { ok: false; motivo: string }> => ({
        ok: true,
        id: `c-${Math.random().toString(36).slice(2, 8)}`,
      }),
    ),
  };
}

function portaQueFalha(motivo: string): PortaDeCompromissos {
  return {
    registrar: vi.fn(
      async (
        _c: ArgumentoDeRegistrar,
      ): Promise<{ ok: true; id: string } | { ok: false; motivo: string }> => ({
        ok: false,
        motivo,
      }),
    ),
  };
}

describe("promessasDeData — reconhecer o compromisso temporal em primeira pessoa", () => {
  it("reconhece as formas da ordem do CEO combinadas com verbo de entrega", () => {
    const casos = [
      "Trago ainda hoje o resumo.",
      "Até amanhã eu te mando o valor.",
      "Amanhã cedo eu entrego o material.",
      "Até sexta eu retorno com a proposta.",
      "Em 24 horas eu envio o contrato.",
      "Até o fim do dia eu finalizo e mando.",
      "Na segunda eu te passo o orçamento.",
      "Até dia 12 eu envio tudo.",
      "Em 2 dias eu mando o restante.",
      "Ainda esta semana eu trago a resposta.",
    ];
    for (const texto of casos) {
      const achadas = promessasDeData(texto);
      expect(achadas.length, `deveria achar promessa em: "${texto}"`).toBeGreaterThan(0);
      expect(achadas[0].trecho.length).toBeGreaterThan(0);
      expect(achadas[0].forma.length).toBeGreaterThan(0);
    }
  });

  it("NÃO barra a data do CLIENTE — é pergunta dele, não promessa nossa", () => {
    expect(promessasDeData("Preciso até sexta, dá tempo?")).toEqual([]);
    expect(temPromessaDeData("Você consegue me atender até amanhã?")).toBe(false);
  });

  it("NÃO barra prazo de ESCOPO já contratado, em terceira pessoa", () => {
    expect(promessasDeData("O pacote entrega em 5 dias úteis, conforme contrato.")).toEqual([]);
  });

  it("NÃO barra o passado — é relato, não promessa", () => {
    expect(promessasDeData("Mandei ontem o link do briefing.")).toEqual([]);
  });

  it("acha DUAS promessas quando o texto tem duas sentenças com compromisso", () => {
    const achadas = promessasDeData("Trago ainda hoje o resumo. Amanhã cedo te mando o valor final.");
    expect(achadas).toHaveLength(2);
    expect(achadas[0].trecho).toContain("Trago ainda hoje");
    expect(achadas[1].trecho).toContain("Amanhã cedo");
  });

  it("compõe com o irmão de 27/08: verbo que só o padrão DELE reconhece, com data, também conta", () => {
    // "encaminho" não está na lista de verbos desta ficha — só o padrão do
    // irmão (promessa-que-a-maquina-nao-cumpre) reconhece "encaminho + orçamento".
    // Se este teste passar, a composição é real, não decorativa.
    const semComposicao = "Já encaminho o orçamento até amanhã.";
    const achadas = promessasDeData(semComposicao);
    expect(achadas.length).toBeGreaterThan(0);
  });

  it("texto vazio ou nulo não quebra e não acha nada", () => {
    expect(promessasDeData("")).toEqual([]);
    expect(promessasDeData(null as unknown as string)).toEqual([]);
  });
});

describe("FORMAS_DE_DATA — TODA forma dispara, nenhuma passa sem prova (F2)", () => {
  // F2: "até amanhã" não disparava porque o `\b` final vinha logo depois de
  // "ã" — ASCII, não reconhece acento como letra. Este it.each roda TODAS as
  // formas da ordem do CEO, uma a uma, para que nenhuma forma exista sem
  // prova de que funciona (foi assim que a de "até amanhã" passou batido).
  it.each([
    ["ainda esta semana", "Ainda esta semana eu trago a resposta."],
    ["ainda hoje", "Trago ainda hoje o resumo."],
    ["amanhã cedo", "Amanhã cedo eu entrego o material."],
    ["até amanhã", "Até amanhã eu te mando o valor."],
    ["até o fim do dia", "Até o fim do dia eu finalizo e mando."],
    ["em 24 horas", "Em 24 horas eu envio o contrato."],
    ["até dia da semana", "Até sexta eu retorno com a proposta."],
    ["no dia da semana", "Na segunda eu te passo o orçamento."],
    ["até dia do mês", "Até dia 12 eu envio tudo."],
    ["em N dias", "Em 2 dias eu mando o restante."],
  ])("dispara para a forma \"%s\": \"%s\"", (forma, texto) => {
    const achadas = promessasDeData(texto);
    expect(achadas.length, `deveria achar promessa em: "${texto}"`).toBeGreaterThan(0);
    expect(achadas[0].forma).toBe(forma);
  });

  it('conserto não barrou a metade gêmea: data do CLIENTE com "até amanhã" continua livre', () => {
    expect(temPromessaDeData("Você consegue me atender até amanhã?")).toBe(false);
  });

  it('conserto não barrou o passado: "até amanhã" dentro de relato não passa a ser promessa por engano', () => {
    // "mencionei" não é verbo de entrega em primeira pessoa da ficha nem do
    // irmão de 27/08 — não deveria disparar mesmo tendo "até amanhã".
    expect(temPromessaDeData("Mencionei que o prazo é até amanhã.")).toBe(false);
  });
});

describe("exigeCompromisso — a lista é atalho, o texto manda", () => {
  it("MODELOS_QUE_PROMETEM_DATA é exatamente M15, M16, M18, M19", () => {
    expect(MODELOS_QUE_PROMETEM_DATA).toEqual(["M15", "M16", "M18", "M19"]);
  });

  it("modelo da lista exige compromisso mesmo com texto sem promessa", () => {
    expect(exigeCompromisso("M15", "Oi, tudo bem?")).toBe(true);
    expect(exigeCompromisso("M19", "")).toBe(true);
  });

  it("modelo FORA da lista que promete data no texto também é barrado", () => {
    expect(exigeCompromisso("M01", "Trago ainda hoje o valor final.")).toBe(true);
  });

  it("modelo fora da lista e texto sem promessa não exige compromisso", () => {
    expect(exigeCompromisso("M01", "Oi, tudo bem? Como posso ajudar?")).toBe(false);
  });
});

describe("liberarTextoComPromessa — a trava, no mesmo ato", () => {
  it("texto SEM promessa de data passa limpo e não registra nada", async () => {
    const porta = portaQueRegistra();
    const resultado = await liberarTextoComPromessa({
      texto: "Oi! Tudo bem? Me conta mais sobre o projeto.",
      conversaId: "conv-1",
      dono: null,
      prazo: null,
      agora: AGORA,
      porta,
    });
    expect(resultado.ok).toBe(true);
    if (resultado.ok) expect(resultado.compromissosCriados).toEqual([]);
    expect(porta.registrar).not.toHaveBeenCalled();
  });

  it("dono AUSENTE (null) ⇒ BLOQUEIO", async () => {
    const porta = portaQueRegistra();
    const resultado = await liberarTextoComPromessa({
      texto: "Trago ainda hoje o resumo.",
      conversaId: "conv-1",
      dono: null,
      prazo: FUTURO,
      agora: AGORA,
      porta,
    });
    expect(resultado.ok).toBe(false);
    expect(porta.registrar).not.toHaveBeenCalled();
  });

  it('dono "sistema" ⇒ BLOQUEIO', async () => {
    const porta = portaQueRegistra();
    const resultado = await liberarTextoComPromessa({
      texto: "Trago ainda hoje o resumo.",
      conversaId: "conv-1",
      dono: "Sistema",
      prazo: FUTURO,
      agora: AGORA,
      porta,
    });
    expect(resultado.ok).toBe(false);
  });

  it('dono "ia" ⇒ BLOQUEIO', async () => {
    const porta = portaQueRegistra();
    const resultado = await liberarTextoComPromessa({
      texto: "Trago ainda hoje o resumo.",
      conversaId: "conv-1",
      dono: "IA",
      prazo: FUTURO,
      agora: AGORA,
      porta,
    });
    expect(resultado.ok).toBe(false);
  });

  it("dono vazio (string em branco) ⇒ BLOQUEIO", async () => {
    const porta = portaQueRegistra();
    const resultado = await liberarTextoComPromessa({
      texto: "Trago ainda hoje o resumo.",
      conversaId: "conv-1",
      dono: "   ",
      prazo: FUTURO,
      agora: AGORA,
      porta,
    });
    expect(resultado.ok).toBe(false);
  });

  it("prazo AUSENTE ⇒ BLOQUEIO", async () => {
    const porta = portaQueRegistra();
    const resultado = await liberarTextoComPromessa({
      texto: "Trago ainda hoje o resumo.",
      conversaId: "conv-1",
      dono: "Maria",
      prazo: null,
      agora: AGORA,
      porta,
    });
    expect(resultado.ok).toBe(false);
    expect(porta.registrar).not.toHaveBeenCalled();
  });

  it("prazo INVÁLIDO (não é data) ⇒ BLOQUEIO", async () => {
    const porta = portaQueRegistra();
    const resultado = await liberarTextoComPromessa({
      texto: "Trago ainda hoje o resumo.",
      conversaId: "conv-1",
      dono: "Maria",
      prazo: "não é uma data",
      agora: AGORA,
      porta,
    });
    expect(resultado.ok).toBe(false);
  });

  it("prazo NO PASSADO ⇒ BLOQUEIO", async () => {
    const porta = portaQueRegistra();
    const resultado = await liberarTextoComPromessa({
      texto: "Trago ainda hoje o resumo.",
      conversaId: "conv-1",
      dono: "Maria",
      prazo: PASSADO,
      agora: AGORA,
      porta,
    });
    expect(resultado.ok).toBe(false);
  });

  it("dono e prazo válidos ⇒ registra e libera, com o id devolvido pela porta", async () => {
    const porta = portaQueRegistra();
    const resultado = await liberarTextoComPromessa({
      texto: "Trago ainda hoje o resumo.",
      conversaId: "conv-1",
      dono: "Maria",
      prazo: FUTURO,
      agora: AGORA,
      porta,
    });
    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.compromissosCriados).toHaveLength(1);
      expect(resultado.texto).toBe("Trago ainda hoje o resumo.");
    }
    expect(porta.registrar).toHaveBeenCalledTimes(1);
    const chamada = vi.mocked(porta.registrar).mock.calls[0][0];
    expect(chamada.dono).toBe("Maria");
    expect(chamada.prazo).toBe(FUTURO);
    expect(chamada.conversaId).toBe("conv-1");
  });

  it("FALHA ao registrar ⇒ o texto NÃO sai", async () => {
    const porta = portaQueFalha("banco fora do ar");
    const resultado = await liberarTextoComPromessa({
      texto: "Trago ainda hoje o resumo.",
      conversaId: "conv-1",
      dono: "Maria",
      prazo: FUTURO,
      agora: AGORA,
      porta,
    });
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.motivo).toContain("banco fora do ar");
  });

  it("DUAS promessas no texto ⇒ dois compromissos, e se qualquer um falhar nada sai", async () => {
    const porta = portaQueRegistra();
    const resultado = await liberarTextoComPromessa({
      texto: "Trago ainda hoje o resumo. Amanhã cedo te mando o valor final.",
      conversaId: "conv-1",
      dono: "Maria",
      prazo: FUTURO,
      agora: AGORA,
      porta,
    });
    expect(resultado.ok).toBe(true);
    if (resultado.ok) expect(resultado.compromissosCriados).toHaveLength(2);
    expect(porta.registrar).toHaveBeenCalledTimes(2);
  });

  it("DUAS promessas, a segunda falha ⇒ nada sai, mesmo a primeira tendo sido registrada", async () => {
    let chamada = 0;
    const porta: PortaDeCompromissos = {
      registrar: vi.fn(
        async (
          _c: ArgumentoDeRegistrar,
        ): Promise<{ ok: true; id: string } | { ok: false; motivo: string }> => {
          chamada += 1;
          if (chamada === 1) return { ok: true, id: "c-1" };
          return { ok: false, motivo: "segunda falhou" };
        },
      ),
    };
    const resultado = await liberarTextoComPromessa({
      texto: "Trago ainda hoje o resumo. Amanhã cedo te mando o valor final.",
      conversaId: "conv-1",
      dono: "Maria",
      prazo: FUTURO,
      agora: AGORA,
      porta,
    });
    expect(resultado.ok).toBe(false);
    expect(porta.registrar).toHaveBeenCalledTimes(2);
  });

  it("a ordem é provada pelo mock: registra ANTES de liberar", async () => {
    const ordem: string[] = [];
    const porta: PortaDeCompromissos = {
      registrar: vi.fn(
        async (
          _c: ArgumentoDeRegistrar,
        ): Promise<{ ok: true; id: string } | { ok: false; motivo: string }> => {
          ordem.push("registrar");
          return { ok: true, id: "c-1" };
        },
      ),
    };
    const resultado = await liberarTextoComPromessa({
      texto: "Trago ainda hoje o resumo.",
      conversaId: "conv-1",
      dono: "Maria",
      prazo: FUTURO,
      agora: AGORA,
      porta,
    });
    if (resultado.ok) ordem.push("liberado");
    expect(ordem).toEqual(["registrar", "liberado"]);
  });
});

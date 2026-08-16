// A REGRA DE OURO DO DIRETOR — conferida, não prometida.
//
// Ordem do CEO (15/08/2026): "eles só podem parar quando não tiver mais nada
// pendente em nenhum projeto"; e o dispositivo tinha de existir porque "está
// parado porque eu não vi" não pode ser resposta.
//
// O teste mais importante deste arquivo é o terceiro: quando a auditoria NÃO
// FECHA, o veredito é "não encerro". É a diferença entre um Diretor que audita
// e um que dá de ombros — e é a doutrina da casa aplicada ao cargo mais alto:
// ausência de informação não é informação.

import { describe, it, expect } from "vitest";
import {
  podeODiretorEncerrar,
  recortarPorEscopo,
  relatorioDoDiretor,
  type Pendencia,
} from "@/lib/agency/diretor/pendencias";

const pend = (over: Partial<Pendencia> = {}): Pendencia => ({
  tipo: "handoff_sem_aceite",
  escopo: "dioli-digital",
  referencia: "h1",
  horasParada: 10,
  acao: "Design aceita ou devolve dizendo o que falta.",
  ...over,
});

describe("regra de ouro — o Diretor não encerra com pendência", () => {
  it("casa limpa: encerra, e diz o que foi verificado", () => {
    const v = podeODiretorEncerrar({ pendencias: [], falhas: [] });
    expect(v.podeEncerrar).toBe(true);
    // O vazio explica o próprio vazio: não basta "ok".
    expect(v.frase).toContain("varredura rodou inteira");
  });

  it("uma pendência sozinha já barra o encerramento", () => {
    const v = podeODiretorEncerrar({ pendencias: [pend()], falhas: [] });
    expect(v.podeEncerrar).toBe(false);
    if (v.podeEncerrar) return;
    expect(v.motivo).toBe("pendencias_abertas");
    expect(v.frase).toContain("NÃO POSSO ENCERRAR");
    // A frase tem de dizer o que fazer, não só que existe.
    expect(v.frase).toContain("Design aceita");
  });

  it("AUDITORIA INCOMPLETA barra igual — silêncio de fonte não é casa limpa", () => {
    // O caso plantado: nenhuma pendência na lista, mas uma fonte não respondeu.
    // Um Diretor ingênuo diria "está limpo". Este diz "não posso afirmar".
    const v = podeODiretorEncerrar({
      pendencias: [],
      falhas: [{ fonte: "bloqueios", erro: "banco indisponível" }],
    });
    expect(v.podeEncerrar).toBe(false);
    if (v.podeEncerrar) return;
    expect(v.motivo).toBe("auditoria_incompleta");
    expect(v.frase).toContain("não é ausência de pendência");
    expect(v.frase).toContain("bloqueios");
  });

  it("auditoria incompleta vence a lista curta — a fonte que faltou podia ser a cheia", () => {
    const v = podeODiretorEncerrar({
      pendencias: [pend()],
      falhas: [{ fonte: "aprovacoes", erro: "timeout" }],
    });
    expect(v.podeEncerrar).toBe(false);
    if (v.podeEncerrar) return;
    expect(v.motivo).toBe("auditoria_incompleta");
    // E mesmo assim ele entrega o que conseguiu ver — não engole a lista.
    expect(v.pendencias.length).toBe(1);
  });

  it("a mais antiga vem primeiro, e o resumo conta por espécie", () => {
    const v = podeODiretorEncerrar({
      pendencias: [
        pend({ horasParada: 5 }),
        pend({ tipo: "bloqueio_aberto", horasParada: 90, referencia: "b1" }),
        pend({ tipo: "bloqueio_aberto", horasParada: 40, referencia: "b2" }),
      ],
      falhas: [],
    });
    expect(v.podeEncerrar).toBe(false);
    if (v.podeEncerrar) return;
    expect(v.pendencias.map((p) => p.horasParada)).toEqual([90, 40, 5]);
    expect(v.frase).toContain("2 bloqueio(s) aberto(s)");
    expect(v.frase).toContain("há 90h");
  });
});

describe("o recorte — produto responde pelo seu, Geral responde por todos", () => {
  const todas = [
    pend({ escopo: "dioli-digital", referencia: "a" }),
    pend({ escopo: "foocci", referencia: "b" }),
    pend({ escopo: "cityjobs", referencia: "c" }),
  ];

  it("Diretor de produto só enxerga o produto dele", () => {
    const meu = recortarPorEscopo(todas, "foocci");
    expect(meu.map((p) => p.referencia)).toEqual(["b"]);
    expect(podeODiretorEncerrar({ pendencias: meu, falhas: [] }).podeEncerrar).toBe(false);
  });

  it("produto limpo encerra mesmo com outro produto sujo — cada um com o seu", () => {
    const outro = recortarPorEscopo(todas, "produto-sem-pendencia");
    expect(podeODiretorEncerrar({ pendencias: outro, falhas: [] }).podeEncerrar).toBe(true);
  });

  it("o Diretor Geral é o mesmo instrumento SEM recorte — três produtos, três pendências", () => {
    const v = podeODiretorEncerrar({ pendencias: todas, falhas: [] });
    expect(v.podeEncerrar).toBe(false);
    if (v.podeEncerrar) return;
    expect(v.pendencias.length).toBe(3);
    expect(new Set(v.pendencias.map((p) => p.escopo)).size).toBe(3);
  });
});

describe("o relatório do Diretor", () => {
  it("lista cada pendência com escopo, tempo e ação", () => {
    const v = podeODiretorEncerrar({ pendencias: [pend({ horasParada: 33 })], falhas: [] });
    const texto = relatorioDoDiretor(v);
    expect(texto).toContain("dioli-digital");
    expect(texto).toContain("33h");
    expect(texto).toContain("→");
  });

  it("lista longa não vira parede: corta em 20 e diz quantas sobraram", () => {
    const muitas = Array.from({ length: 26 }, (_, i) => pend({ referencia: `h${i}`, horasParada: i }));
    const texto = relatorioDoDiretor(podeODiretorEncerrar({ pendencias: muitas, falhas: [] }));
    expect(texto).toContain("e mais 6 pendência(s)");
  });
});

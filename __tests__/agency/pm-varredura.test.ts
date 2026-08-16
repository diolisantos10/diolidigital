// O PM QUE PERSEGUE — a varredura, conferida nas duas metades.
//
// O CEO em 15/08/2026: "ele era o que deveria estar mais correndo entre os
// departamentos, está parado". A causa era de desenho: ficha só com entrada
// reativa, métrica sem instrumento, e o relógio da casa nunca chamando o PM.
//
// Este teste cobre o instrumento. As duas metades de toda trava:
//   • acha o que está parado de verdade (senão o PM continua cego);
//   • e NÃO inventa cobrança onde está tudo no prazo (senão vira ruído, e
//     ruído ensina a ignorar — o mesmo defeito do alarme de deploy de 06/08).

import { describe, it, expect } from "vitest";
import {
  varrerOQueEstaParado,
  frazeDaVarredura,
  HORAS_ATE_COBRAR_HANDOFF,
  HORAS_ENTRE_COBRANCAS,
  type HandoffPendente,
  type TrabalhoMonitorado,
} from "@/lib/agency/pm/varredura";

const AGORA = new Date("2026-08-15T12:00:00Z");
const hAtras = (h: number) => new Date(AGORA.getTime() - h * 3_600_000);

function handoff(over: Partial<HandoffPendente> = {}): HandoffPendente {
  return {
    id: "h1",
    deDepartamento: "social-media",
    paraDepartamento: "design",
    responsavelEntrega: "copywriter",
    criadoEm: hAtras(10),
    ...over,
  };
}

function trabalho(over: Partial<TrabalhoMonitorado> = {}): TrabalhoMonitorado {
  return {
    id: "t1",
    entidadeTipo: "Task",
    estadoCanonico: "production", // SLA de 72h
    atualizadoEm: hAtras(100),
    donoDepartamento: "design",
    ...over,
  };
}

describe("varredura do PM — o bastão que ninguém pegou", () => {
  it("cobra o handoff entregue e não aceito, nomeando quem entregou e quem recebe", () => {
    const r = varrerOQueEstaParado({ handoffs: [handoff()], trabalhos: [] }, AGORA);
    expect(r.totalParado).toBe(1);
    const c = r.cobrancas[0]!;
    expect(c.motivo).toBe("handoff_sem_aceite");
    expect(c.departamento).toBe("design");
    expect(c.horasParado).toBe(10);
    // A frase tem de dizer o que fazer — "deu problema" não é cobrança.
    expect(c.pedido).toContain("copywriter");
    expect(c.pedido).toContain("aceite");
    expect(c.reincidente).toBe(false);
  });

  it("NÃO cobra handoff recém-entregue — quem recebeu ainda nem teve tempo de olhar", () => {
    const novo = handoff({ criadoEm: hAtras(HORAS_ATE_COBRAR_HANDOFF - 1) });
    const r = varrerOQueEstaParado({ handoffs: [novo], trabalhos: [] }, AGORA);
    expect(r.totalParado).toBe(0);
  });

  it("não repete a cobrança dentro da janela — cobrança repetida vira ruído", () => {
    const jaCobrado = handoff({ cobradoEm: hAtras(HORAS_ENTRE_COBRANCAS - 1) });
    expect(varrerOQueEstaParado({ handoffs: [jaCobrado], trabalhos: [] }, AGORA).totalParado).toBe(0);
  });

  it("passada a janela, cobra de novo — e a segunda cobrança muda de tom e avisa que sobe", () => {
    const insistente = handoff({ criadoEm: hAtras(48), cobradoEm: hAtras(HORAS_ENTRE_COBRANCAS + 1) });
    const c = varrerOQueEstaParado({ handoffs: [insistente], trabalhos: [] }, AGORA).cobrancas[0]!;
    expect(c.reincidente).toBe(true);
    expect(c.pedido).toContain("já foi cobrado");
    expect(c.pedido).toContain("bloqueio");
  });
});

describe("varredura do PM — o prazo e o dono", () => {
  it("cobra o dono quando o estado passou do SLA da casa", () => {
    const c = varrerOQueEstaParado({ handoffs: [], trabalhos: [trabalho()] }, AGORA).cobrancas[0]!;
    expect(c.motivo).toBe("sla_estourado");
    expect(c.departamento).toBe("design");
    expect(c.pedido).toContain("72h"); // o prazo do estado, dito na cobrança
  });

  it("NÃO cobra o que está dentro do prazo — o caso limpo passa", () => {
    const noPrazo = trabalho({ atualizadoEm: hAtras(10) }); // 10h < 72h
    expect(varrerOQueEstaParado({ handoffs: [], trabalhos: [noPrazo] }, AGORA).totalParado).toBe(0);
  });

  it("trabalho sem dono vira cobrança do PRÓPRIO PM — sem dono ninguém puxa", () => {
    const orfao = trabalho({ donoDepartamento: null });
    const c = varrerOQueEstaParado({ handoffs: [], trabalhos: [orfao] }, AGORA).cobrancas[0]!;
    expect(c.motivo).toBe("sem_dono");
    expect(c.departamento).toBe("project-management");
    expect(c.pedido).toContain("define o dono");
  });

  it("estado sem régua de prazo não vira cobrança inventada — vira achado declarado", () => {
    const semRegua = trabalho({ estadoCanonico: "estado_novo_sem_sla" });
    const r = varrerOQueEstaParado({ handoffs: [], trabalhos: [semRegua] }, AGORA);
    expect(r.totalParado).toBe(0);
    expect(r.estadosSemRegua).toContain("estado_novo_sem_sla");
  });

  it("sem estado derivado, o PM não opina — é assunto da leitura dupla", () => {
    const semEstado = trabalho({ estadoCanonico: null });
    const r = varrerOQueEstaParado({ handoffs: [], trabalhos: [semEstado] }, AGORA);
    expect(r.totalParado).toBe(0);
    expect(r.estadosSemRegua).toEqual([]);
  });
});

describe("varredura do PM — a fila e o consolidado", () => {
  it("o mais antigo vem primeiro: é fila de trabalho, não lista de avisos", () => {
    const r = varrerOQueEstaParado(
      {
        handoffs: [handoff({ id: "novo", criadoEm: hAtras(6) }), handoff({ id: "velho", criadoEm: hAtras(60) })],
        trabalhos: [trabalho({ atualizadoEm: hAtras(80) })],
      },
      AGORA,
    );
    expect(r.cobrancas.map((c) => c.horasParado)).toEqual([80, 60, 6]);
  });

  it("o consolidado começa pela conclusão, e o vazio explica o próprio vazio", () => {
    const vazio = varrerOQueEstaParado({ handoffs: [], trabalhos: [] }, AGORA);
    expect(frazeDaVarredura(vazio)).toContain("Nada parado");

    const cheio = varrerOQueEstaParado({ handoffs: [handoff()], trabalhos: [trabalho()] }, AGORA);
    const frase = frazeDaVarredura(cheio);
    expect(frase).toContain("2 ponto(s) parado(s)");
    expect(frase).toContain("sem aceite");
    expect(frase).toContain("O mais antigo");
  });
});

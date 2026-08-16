// O MEDIDOR DE ESFORÇO — as duas metades.
//
// O risco que este medidor existe para vigiar está escrito no parecer do
// conselho: *"o plano de entrada atrai o cliente que paga menos e exige mais"*.
// Com o Pulso a R$ 49 em vez do Presença a R$ 790, o mesmo risco é dezesseis
// vezes maior.
//
// O modo de este medidor FALHAR é sutil e é o pior possível: contar execução
// sem `fim` como duração zero. Isso faria a conta mais cara da casa aparecer
// como a mais barata, e o número chegaria ao CEO com cara de medida. Por isso
// metade dos testes aqui é sobre o que NÃO se soma.

import { describe, it, expect } from "vitest";
import { medirEsforco, LACUNAS_DA_MEDICAO, type LinhaDeEsforco } from "@/lib/agency/medicao/custo-de-atendimento";

const T0 = new Date("2026-08-16T10:00:00Z");
const emMinutos = (m: number) => new Date(T0.getTime() + m * 60_000);

function linha(p: Partial<LinhaDeEsforco> = {}): LinhaDeEsforco {
  return {
    ator: "humano",
    clienteId: "cli-1",
    funcaoId: "atendimento",
    departamentoId: "social-media",
    inicio: T0,
    fim: emMinutos(30),
    ...p,
  };
}

describe("custo de atendimento — horas humanas por conta, por atividade", () => {
  // ── METADE 1: MEDE O QUE TEM QUE MEDIR ─────────────────────────────────────
  describe("✅ mede o esforço real", () => {
    it("soma minutos por conta e separa POR ATIVIDADE", () => {
      const r = medirEsforco([
        linha({ funcaoId: "atendimento", fim: emMinutos(30) }),
        linha({ funcaoId: "atendimento", fim: emMinutos(15) }),
        linha({ funcaoId: "revisao-de-peca", fim: emMinutos(50) }),
      ]);
      const conta = r.contas.find((c) => c.clienteId === "cli-1")!;
      expect(conta.minutosHumanos).toBe(95);
      expect(conta.horasHumanas).toBe(1.6);
      // A separação por atividade é o pedido literal do despacho.
      expect(conta.atividades.map((a) => [a.funcaoId, a.minutos])).toEqual([
        ["revisao-de-peca", 50],
        ["atendimento", 45],
      ]);
    });

    it("ordena as contas pela que mais consome — é ela que a carteira sente", () => {
      const r = medirEsforco([
        linha({ clienteId: "barato", fim: emMinutos(10) }),
        linha({ clienteId: "caro", fim: emMinutos(300) }),
      ]);
      expect(r.contas.map((c) => c.clienteId)).toEqual(["caro", "barato"]);
    });

    it("trabalho interno da casa sai SEPARADO, não vira conta de cliente", () => {
      const r = medirEsforco([
        linha({ clienteId: null, fim: emMinutos(60) }),
        linha({ clienteId: "cli-1", fim: emMinutos(20) }),
      ]);
      expect(r.minutosSemDono).toBe(60);
      expect(r.contas).toHaveLength(1);
      expect(r.contas[0].minutosHumanos).toBe(20);
    });

    it("execução de IA não vira hora humana — o custo de IA mora no AIRunLog", () => {
      const r = medirEsforco([linha({ ator: "ia", fim: emMinutos(600) })]);
      expect(r.execucoesDeIaIgnoradas).toBe(1);
      expect(r.contas).toHaveLength(0);
    });
  });

  // ── METADE 2: O QUE NÃO PODE VIRAR ZERO ────────────────────────────────────
  describe("⛔ ausência de medida NUNCA é medida de zero", () => {
    it("execução sem `fim` conta como NÃO MEDIDA, não como 0 minuto", () => {
      const r = medirEsforco([
        linha({ fim: null }),
        linha({ fim: null }),
        linha({ fim: emMinutos(10) }),
      ]);
      const conta = r.contas[0];
      expect(conta.minutosHumanos).toBe(10);
      expect(conta.execucoesNaoMedidas).toBe(2);
      // 🔑 A consequência: 10 minutos com 2 execuções abertas não é "conta
      // barata" — é conta parcialmente medida, e quem lê tem que enxergar isso.
      expect(conta.atividades[0].execucoesNaoMedidas).toBe(2);
    });

    it("conta em que NADA fechou é marcada como totalmente não medida", () => {
      const r = medirEsforco([linha({ fim: null }), linha({ fim: null })]);
      expect(r.contas[0].totalmenteNaoMedida).toBe(true);
      expect(r.contas[0].minutosHumanos).toBe(0);
      // ✅ e a outra metade: uma execução fechada já derruba a marca
      const r2 = medirEsforco([linha({ fim: null }), linha({ fim: emMinutos(5) })]);
      expect(r2.contas[0].totalmenteNaoMedida).toBe(false);
    });

    it("relógio impossível (negativo ou 24h+) não entra na soma", () => {
      const r = medirEsforco([
        linha({ inicio: emMinutos(60), fim: T0 }),          // fim antes do início
        linha({ fim: emMinutos(60 * 25) }),                  // 25 horas seguidas
        linha({ fim: emMinutos(30) }),                       // real
      ]);
      expect(r.contas[0].minutosHumanos).toBe(30);
      expect(r.contas[0].execucoesNaoMedidas).toBe(2);
    });

    it("lista vazia devolve retrato vazio, e `linhasLidas` mostra que foi zero", () => {
      // Existe para separar "não houve trabalho" de "a leitura falhou" — a
      // segunda é `{ medido: false }` em `lerEsforco`, e nunca chega aqui.
      const r = medirEsforco([]);
      expect(r.contas).toEqual([]);
      expect(r.linhasLidas).toBe(0);
    });
  });

  // ── AS LACUNAS SÃO PARTE DA ENTREGA ────────────────────────────────────────
  describe("o que falta está NOMEADO, não subentendido", () => {
    it("toda lacuna diz o quê, onde, por que importa e quem é o dono", () => {
      expect(LACUNAS_DA_MEDICAO.length).toBeGreaterThan(0);
      for (const l of LACUNAS_DA_MEDICAO) {
        expect(l.o_que.length, "lacuna sem descrição").toBeGreaterThan(20);
        expect(l.onde.length, `"${l.o_que}" não diz ONDE`).toBeGreaterThan(10);
        expect(l.porque_importa.length, `"${l.o_que}" não diz por que importa`).toBeGreaterThan(40);
        expect(l.dono.length, `"${l.o_que}" não tem dono`).toBeGreaterThan(3);
      }
    });

    it("a lacuna que bloqueia a pergunta do CEO está declarada: `Client` sem plano", () => {
      // Sem ela, o medidor responde "a conta X consumiu 3h" e nunca "o Pulso
      // consome 3h" — que é a pergunta.
      const bloqueadora = LACUNAS_DA_MEDICAO.find((l) => /Client/.test(l.o_que) && /plano/i.test(l.o_que));
      expect(bloqueadora, "a lacuna do vínculo cliente↔plano sumiu da lista").toBeDefined();
      expect(bloqueadora!.onde).toContain("schema.prisma");
    });
  });
});

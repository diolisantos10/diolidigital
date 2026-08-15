// A MÁQUINA DE ESTADOS — legalidade do diagrama e as seis condições, sem banco.

import { describe, it, expect } from "vitest";
import {
  TRANSICOES_LEGAIS,
  transicaoLegal,
  transicionar,
  type ArmazemDeTransicoes,
  type PedidoDeTransicao,
} from "@/lib/agency/estados-v2/maquina";
import { ESTADOS_V2 } from "@/lib/agency/catalogo-v2/catalogo";

function armazemDeMemoria() {
  const transicoes: PedidoDeTransicao[] = [];
  const efeitos: Array<{ tipo: string; chaveIdempotencia: string; correlationId: string }> = [];
  const chaves = new Set<string>();
  const versoes = new Map<string, number>();
  const armazem: ArmazemDeTransicoes = {
    async jaTransicionou(chave) { return chaves.has(chave); },
    async versaoAtual(tipo, id) { return versoes.get(`${tipo}:${id}`) ?? 0; },
    async registrar(pedido) {
      chaves.add(pedido.chaveIdempotencia);
      transicoes.push(pedido);
      const k = `${pedido.entidadeTipo}:${pedido.entidadeId}`;
      versoes.set(k, (versoes.get(k) ?? 0) + 1);
    },
    async enfileirar(efeito) { efeitos.push(efeito as never); },
  };
  return { armazem, transicoes, efeitos, versoes };
}

function pedido(extra: Partial<PedidoDeTransicao> = {}): PedidoDeTransicao {
  return {
    entidadeTipo: "projeto",
    entidadeId: "p1",
    de: "intake",
    para: "qualified",
    ator: { tipo: "ia", id: "conversational-sdr" },
    motivo: "demanda com aderência",
    origem: "teste",
    versaoLida: 0,
    chaveIdempotencia: "t-1",
    correlationId: "c-1",
    ...extra,
  };
}

const PERMITIDO = { permitido: true, motivo: "teste" };
const NEGADO = { permitido: false, motivo: "sem capacidade" };

describe("legalidade do diagrama canônico", () => {
  it("todas as transições do diagrama são legais e usam estados do manifesto", () => {
    for (const [de, para] of TRANSICOES_LEGAIS) {
      expect(transicaoLegal(de, para), `${de}→${para}`).toBe(true);
      expect(ESTADOS_V2).toContain(de);
      expect(ESTADOS_V2).toContain(para);
    }
  });

  it("atalhos proibidos não passam — pular qualidade é ilegal por construção", () => {
    expect(transicaoLegal("production", "client_approval")).toBe(false); // sem internal_review
    expect(transicaoLegal("intake", "production")).toBe(false);
    expect(transicaoLegal("proposal", "production")).toBe(false);
    expect(transicaoLegal("cancelled", "production")).toBe(false); // terminal não volta
    expect(transicaoLegal("closed", "intake")).toBe(false);
  });
});

describe("as seis condições da transição", () => {
  it("condição 1: sem permissão, nada acontece — nem registro, nem efeito", async () => {
    const { armazem, transicoes, efeitos } = armazemDeMemoria();
    const r = await transicionar(pedido(), NEGADO, true, armazem);
    expect(r).toEqual({ ok: false, condicao: 1, motivo: "sem capacidade" });
    expect(transicoes).toHaveLength(0);
    expect(efeitos).toHaveLength(0);
  });

  it("condição 2: transição fora do diagrama é recusada com nome", async () => {
    const { armazem } = armazemDeMemoria();
    const r = await transicionar(pedido({ de: "intake", para: "production" }), PERMITIDO, true, armazem);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.condicao).toBe(2);
  });

  it("condição 2: entrada obrigatória ausente reprova", async () => {
    const { armazem } = armazemDeMemoria();
    const r = await transicionar(pedido(), PERMITIDO, false, armazem);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.condicao).toBe(2);
  });

  it("condição 3: versão que mudou desde a leitura reprova (concorrência)", async () => {
    const { armazem } = armazemDeMemoria();
    await transicionar(pedido(), PERMITIDO, true, armazem); // versão vira 1
    const r = await transicionar(
      pedido({ de: "qualified", para: "briefing_incomplete", chaveIdempotencia: "t-2", versaoLida: 0 }),
      PERMITIDO,
      true,
      armazem,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.condicao).toBe(3);
  });

  it("condição 4: a MESMA chave duas vezes = sucesso idempotente, uma transição só", async () => {
    const { armazem, transicoes, efeitos } = armazemDeMemoria();
    const p = pedido({ efeitosExternos: [{ tipo: "aviso", payload: {}, chaveIdempotencia: "e-1" }] });
    const r1 = await transicionar(p, PERMITIDO, true, armazem);
    const r2 = await transicionar(p, PERMITIDO, true, armazem);
    expect(r1).toEqual({ ok: true, idempotente: false });
    expect(r2).toEqual({ ok: true, idempotente: true });
    expect(transicoes).toHaveLength(1);
    expect(efeitos).toHaveLength(1); // cenário 1 do 07: aprovação dupla não duplica produção
  });

  it("condições 5 e 6: evento persistido e efeito NA FILA com correlationId", async () => {
    const { armazem, transicoes, efeitos } = armazemDeMemoria();
    const p = pedido({
      efeitosExternos: [
        { tipo: "mensagem_ao_cliente", payload: { texto: "…" }, chaveIdempotencia: "e-msg" },
        { tipo: "webhook", payload: {}, chaveIdempotencia: "e-hook" },
      ],
    });
    const r = await transicionar(p, PERMITIDO, true, armazem);
    expect(r.ok).toBe(true);
    expect(transicoes).toHaveLength(1);
    expect(efeitos).toHaveLength(2);
    for (const e of efeitos) expect(e.correlationId).toBe("c-1");
  });
});

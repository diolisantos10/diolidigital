// AS QUATRO DECISÕES — o contrato da V2 conferido contra o manifesto.

import { describe, it, expect } from "vitest";
import {
  DECISAO_PARA_STATUS,
  DECISAO_PARA_ESTADO_CANONICO,
  DECISOES_QUE_EXIGEM_COMENTARIO,
  ACAO_DUVIDA,
} from "@/lib/agency/portal/decisoes-do-portal";
import { DECISOES_DO_CLIENTE_V2, ESTADOS_V2 } from "@/lib/agency/catalogo-v2/catalogo";
import { transicaoLegal } from "@/lib/agency/estados-v2/maquina";

describe("decisões do portal — o contrato das quatro", () => {
  it("existem exatamente as 4 decisões do manifesto (a dúvida não é decisão)", () => {
    expect(Object.keys(DECISAO_PARA_STATUS)).toHaveLength(4);
    expect(DECISOES_DO_CLIENTE_V2).toHaveLength(4);
    expect(Object.keys(DECISAO_PARA_STATUS)).not.toContain(ACAO_DUVIDA);
  });

  it("cancel existe e leva a cancelled — a quarta decisão que faltava", () => {
    expect(DECISAO_PARA_STATUS.cancel).toBe("cancelled");
    expect(DECISAO_PARA_ESTADO_CANONICO.cancel).toBe("cancelled");
  });

  it("ajuste, recusa e cancelamento exigem as palavras do cliente; aprovar não", () => {
    expect(DECISOES_QUE_EXIGEM_COMENTARIO.has("request_revision")).toBe(true);
    expect(DECISOES_QUE_EXIGEM_COMENTARIO.has("reject")).toBe(true);
    expect(DECISOES_QUE_EXIGEM_COMENTARIO.has("cancel")).toBe(true);
    expect(DECISOES_QUE_EXIGEM_COMENTARIO.has(ACAO_DUVIDA)).toBe(true);
    expect(DECISOES_QUE_EXIGEM_COMENTARIO.has("approve")).toBe(false);
  });

  it("todo estado canônico das decisões existe nos 20 e é transição LEGAL de client_approval", () => {
    for (const [acao, estado] of Object.entries(DECISAO_PARA_ESTADO_CANONICO)) {
      expect(ESTADOS_V2, `${acao} → ${estado}`).toContain(estado);
      expect(transicaoLegal("client_approval", estado), `client_approval → ${estado} (${acao})`).toBe(true);
    }
  });
});

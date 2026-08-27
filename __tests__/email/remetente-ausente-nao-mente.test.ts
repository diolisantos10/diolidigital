// O REMETENTE AUSENTE NÃO PODE VIRAR "AVISADO" — 25/08/2026.
//
// Medido em produção nesta data, por `GET /api/agency/diagnostico-de-email`:
// `RESEND_API_KEY` VÁLIDA (restricted_api_key, o certo para chave de app) e
// `RESEND_FROM` AUSENTE. Com isso, `sendEmail` caía no remetente compartilhado
// da Resend — que entrega só para o dono da conta — e voltava `{ ok: true }`.
//
// O estrago não é o e-mail que não chega: é o registro. `orcamento-do-briefing`
// gravava `avisoOrcamentoStatus = "avisado"`, e a fila de reenvio NUNCA busca
// "avisado". O cliente ficava marcado como avisado para sempre, e nem o dia em
// que a variável existir o traria de volta.
//
// Estes testes travam as duas metades: a recusa, e a FORMA da recusa (`skipped`,
// que é o balde que o reenvio busca). Um sem o outro não vale.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { sendEmail, SEM_REMETENTE, SEM_CHAVE } from "@/lib/email/send";
import { orcamentoProntoEmail } from "@/lib/email/templates";

// ⚠️ O CORPO É UM E-MAIL DE VERDADE, e isso passou a ser obrigatório em
// 27/08/2026. Aqui dizia `html: "<p>oi</p>"`. Desde a trava do molde
// (`lib/email/trava-do-molde.ts`), HTML escrito à mão NÃO SAI desta casa — e um
// teste da porta que empurra um corpo que a porta recusa mediria a recusa
// errada, não o remetente.
const DO_MOLDE = orcamentoProntoEmail({
  prospectName: "NOME TESTE",
  businessName: "Padaria do Teste",
  portalLink: "https://www.diolidigital.com.br/portal/access/abc",
});

// Resposta a quem procurou a casa — a natureza que a esteira usa para avisar
// sobre um briefing que o próprio cliente enviou.
const consentimento = { natureza: "resposta", mensagemRecebidaId: "ClientRequestDb#teste" } as const;
const base = {
  // Endereço de exemplo que NÃO é `.invalid`: a trava do cliente falso barra
  // `.invalid` antes de tudo, e barraria o que este teste quer medir.
  to: "nome.teste@exemplo-de-teste.com",
  consentimento,
  subject: DO_MOLDE.subject,
  html: DO_MOLDE.html,
};

const guardado = { chave: process.env.RESEND_API_KEY, from: process.env.RESEND_FROM };

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response('{"id":"x"}', { status: 200 })));
});
afterEach(() => {
  vi.unstubAllGlobals();
  if (guardado.chave === undefined) delete process.env.RESEND_API_KEY;
  else process.env.RESEND_API_KEY = guardado.chave;
  if (guardado.from === undefined) delete process.env.RESEND_FROM;
  else process.env.RESEND_FROM = guardado.from;
});

describe("sem RESEND_FROM a casa RECUSA em vez de fingir que entregou", () => {
  it("⛔ chave válida + remetente ausente = skipped, e NENHUMA chamada à Resend", async () => {
    process.env.RESEND_API_KEY = "re_chave_de_teste_com_tamanho";
    delete process.env.RESEND_FROM;
    const r = await sendEmail(base);
    expect(r.ok).toBe(false);
    // `skipped` é o balde que `reenviarAvisosQueFalharam` BUSCA. Se isto virar
    // `ok:true`, o cliente fica marcado como avisado para sempre.
    expect(r.skipped).toBe(true);
    expect(r.error).toBe(SEM_REMETENTE);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("o motivo diz a AÇÃO e de quem ela é — motivo sem dono não é motivo", () => {
    expect(SEM_REMETENTE).toContain("RESEND_FROM");
    expect(SEM_REMETENTE).toContain("CEO");
    expect(SEM_REMETENTE).toContain("domínio verificado");
    // E nomeia o remetente compartilhado, para ninguém reintroduzi-lo por engano.
    expect(SEM_REMETENTE).toContain("onboarding@resend.dev");
  });

  it("com remetente cadastrado, o envio acontece — a trava não fecha a porta boa", async () => {
    process.env.RESEND_API_KEY = "re_chave_de_teste_com_tamanho";
    process.env.RESEND_FROM = "Dioli Digital <contato@exemplo-verificado.com>";
    const r = await sendEmail(base);
    expect(r.ok).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledOnce();
    const corpo = JSON.parse((vi.mocked(globalThis.fetch).mock.calls[0]![1] as { body: string }).body);
    expect(corpo.from).toBe("Dioli Digital <contato@exemplo-verificado.com>");
  });

  it("a falta de CHAVE continua sendo um motivo DIFERENTE da falta de remetente", async () => {
    // Dois fatos, dois motivos. Achatar os dois em "e-mail não configurado" foi
    // o defeito que mandou o CEO cadastrar uma chave que já estava lá.
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM;
    const r = await sendEmail(base);
    expect(r.error).toBe(SEM_CHAVE);
    expect(SEM_CHAVE).not.toBe(SEM_REMETENTE);
  });
});

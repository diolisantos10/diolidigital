// AS QUATRO PORTAS DE SAÍDA — e o dia em que três delas estavam escancaradas.
//
// ─── O ACHADO (24/08/2026) ──────────────────────────────────────────────────
//
// O cabeçalho de `lib/email/send.ts` afirmava, com a palavra "medido", que o
// e-mail era *"a Única porta de saída de mensagem da casa — o WhatsApp é link
// `wa.me`, não envio programático"*.
//
// **A medição envelheceu e ninguém releu.** Ao mapear a esteira para o piloto,
// as portas de verdade eram quatro:
//
//   sendWhatsAppDirect   → POST {phoneNumberId}/messages   (Meta, token de prod)
//   publishPost          → publica no Instagram do cliente
//   publicarNoGoogle     → posta no perfil Google do cliente
//   responderAvaliacao   → responde avaliação pública do cliente
//
// Três delas SEM UM CADEADO SEQUER. Qualquer engano — de um Diretor, de um
// script mal rodado, de uma rodada do relógio contra a base errada — falava com
// gente de verdade em nome de cliente real.
//
// Este arquivo é a trava da trava. Ele REPROVA contra o código de ontem, em que
// nenhuma das três recusava nada.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("@/lib/db/client", () => ({ prisma: {} }));
vi.mock("@/lib/security/crypto", () => ({ encryptSecret: vi.fn(), decryptSecret: vi.fn() }));

import { sendWhatsAppDirect, publishPost } from "@/lib/integrations/meta/client";
import { publicarNoGoogle, responderAvaliacao } from "@/lib/integrations/google/client";
import {
  CADEADOS_POR_CANAL,
  TELEFONE_DO_CLIENTE_FALSO,
  limparSaidasBloqueadas,
  saidasBloqueadas,
} from "@/lib/agency/cliente-falso/trava-de-saida";
// A trava de consentimento (24/08/2026) tornou `consentimento` obrigatório em
// toda porta de saída. Aqui o assunto é OUTRO — o cadeado do cliente falso — e
// por isso estas chamadas trazem um consentimento válido: o que está sendo
// medido é o cadeado de teste, não o de consentimento (esse tem suíte própria
// em `__tests__/consentimento/`).
const CONSENTE = { natureza: "resposta", mensagemRecebidaId: "msg-1" } as const;

const original = process.env.CLIENTE_FALSO;
beforeEach(() => { limparSaidasBloqueadas(); delete process.env.CLIENTE_FALSO; });
afterEach(() => { if (original === undefined) delete process.env.CLIENTE_FALSO; else process.env.CLIENTE_FALSO = original; });

// Se qualquer porta chegar a usar rede, o teste explode — é assim que se prova
// que a recusa acontece ANTES de ler credencial, e não depois.
beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => {
    throw new Error("A PORTA CHAMOU A REDE: a trava não veio antes da credencial.");
  }));
});

describe("modo de teste fecha as QUATRO portas", () => {
  beforeEach(() => { process.env.CLIENTE_FALSO = "1"; });

  it("WhatsApp recusa, e recusa sem tocar na rede", async () => {
    const r = await sendWhatsAppDirect("phone-1", "token-de-producao", { connectionId: "c", consentimento: CONSENTE, to: "5511988887777" });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/bloqueado:modo_cliente_falso/);
  });

  it("Instagram recusa", async () => {
    const r = await publishPost("ws", { connectionId: "c", platform: "instagram", caption: "oi" });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/bloqueado:/);
  });

  it("Google (post) recusa", async () => {
    const r = await publicarNoGoogle("con-1", { texto: "novidade da semana" });
    expect(r.ok).toBe(false);
    expect(r.erro).toMatch(/bloqueado:/);
  });

  it("Google (avaliação) recusa", async () => {
    const r = await responderAvaliacao("con-1", "rev-1", "Obrigado pela sua avaliação, volte sempre!");
    expect(r.ok).toBe(false);
    expect(r.erro).toMatch(/bloqueado:/);
  });

  it("toda recusa fica REGISTRADA — é o que deixa o placar afirmar 'nada saiu'", async () => {
    await sendWhatsAppDirect("p", "t", { connectionId: "c", consentimento: CONSENTE, to: "5511988887777" });
    await publishPost("ws", { connectionId: "c", platform: "instagram", caption: "oi" });
    const canais = saidasBloqueadas().map((s) => s.canal);
    expect(canais).toContain("whatsapp");
    expect(canais).toContain("publicacao");
  });
});

describe("o segundo cadeado, para quem tem um — vale SEM o modo de teste", () => {
  it("WhatsApp barra o telefone do roteiro mesmo com o modo desligado", async () => {
    expect(process.env.CLIENTE_FALSO).toBeUndefined();
    const r = await sendWhatsAppDirect("p", "t", { connectionId: "c", consentimento: CONSENTE, to: TELEFONE_DO_CLIENTE_FALSO });
    expect(r.error).toMatch(/bloqueado:telefone_de_teste/);
  });

  it("…e reconhece o mesmo número escrito com formatação", async () => {
    const r = await sendWhatsAppDirect("p", "t", { connectionId: "c", consentimento: CONSENTE, to: "+55 11 90000-0001" });
    expect(r.error).toMatch(/bloqueado:telefone_de_teste/);
  });

  it("publicação barra o carimbo [TESTE] no texto que iria ao ar", async () => {
    const r = await publishPost("ws", { connectionId: "c", platform: "instagram", caption: "Cantina da Prova [TESTE] — almoço" });
    expect(r.error).toMatch(/bloqueado:carimbo_de_teste/);
  });
});

describe("cliente de verdade NÃO é censurado — trava que barra tudo é trava inútil", () => {
  it("WhatsApp de número real passa da trava (e só então tenta a rede)", async () => {
    const r = await sendWhatsAppDirect("p", "t", { connectionId: "c", consentimento: CONSENTE, to: "5511988887777" });
    // Não foi bloqueada: chegou na rede, que o teste faz explodir de propósito.
    expect(r.error).not.toMatch(/bloqueado:/);
    expect(saidasBloqueadas()).toHaveLength(0);
  });
});

describe("quantos cadeados cada porta tem, DECLARADO", () => {
  it("a avaliação do Google tem UM só, e isso está escrito", () => {
    // Contar cadeado a mais no papel é o jeito mais fácil de dormir tranquilo
    // com uma porta aberta.
    expect(CADEADOS_POR_CANAL.avaliacao).toBe(1);
    expect(CADEADOS_POR_CANAL.email).toBe(2);
    expect(CADEADOS_POR_CANAL.whatsapp).toBe(2);
  });
});

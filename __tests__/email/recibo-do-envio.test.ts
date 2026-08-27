// O ENVIO QUE DEU CERTO PRECISA DEIXAR RASTRO — 27/08/2026.
//
// Antes desta trava, `sendEmail` só falava quando FALHAVA. O sucesso era mudo:
// o `id` da Resend voltava para quem chamou e os dois chamadores da casa o
// descartam (`client-requests` é fire-and-forget; `orcamento-do-briefing` grava
// a palavra "avisado" e joga o `id` fora). A casa não conseguia provar que uma
// única mensagem tinha saído.
//
// E não dá para consertar depois do fato: a chave desta casa é
// `restricted_api_key` — medido em produção, a Resend responde 401
// "This API key is restricted to only send emails" a qualquer LEITURA. Chave de
// envio não lista o que enviou. O `id` só existe na resposta do envio.
//
// Log só de erro é verde por ausência, e verde por ausência não é verde.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { sendEmail, mascararDestino } from "@/lib/email/send";

const consentimento = { natureza: "resposta", mensagemRecebidaId: "ClientRequestDb#teste" } as const;
const base = {
  // Não pode ser `.invalid`: a trava do cliente falso barra antes do envio.
  to: "nome.teste@exemplo-de-teste.com",
  consentimento,
  subject: "Recebemos seu pedido",
  html: "<p>oi</p>",
};

const guardado = { chave: process.env.RESEND_API_KEY, from: process.env.RESEND_FROM, falso: process.env.CLIENTE_FALSO };

beforeEach(() => {
  delete process.env.CLIENTE_FALSO;
  process.env.RESEND_API_KEY = "re_chave_de_teste";
  process.env.RESEND_FROM = "Dioli Studio <contato@exemplo-de-teste.com>";
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  for (const [k, v] of [["RESEND_API_KEY", guardado.chave], ["RESEND_FROM", guardado.from], ["CLIENTE_FALSO", guardado.falso]] as const) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("o recibo do envio", () => {
  it("anota o id que a Resend devolveu — é a única cópia que a casa terá", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response('{"id":"re_id_da_resend_123"}', { status: 200 })));
    const info = vi.spyOn(console, "info").mockImplementation(() => {});

    const r = await sendEmail(base);
    expect(r.ok).toBe(true);
    expect(r.id).toBe("re_id_da_resend_123");

    // A trava: o id tem de estar NO RASTRO, não só no retorno que ninguém guarda.
    expect(info).toHaveBeenCalledTimes(1);
    const linha = info.mock.calls[0]!.join(" ");
    expect(linha).toContain("re_id_da_resend_123");
    expect(linha).toContain("Recebemos seu pedido");
  });

  it("mascara a parte local do destinatário e preserva o domínio inteiro", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response('{"id":"re_x"}', { status: 200 })));
    const info = vi.spyOn(console, "info").mockImplementation(() => {});

    await sendEmail({ ...base, to: "diolisantos10@gmail.com" });
    const linha = info.mock.calls[0]!.join(" ");

    // O domínio responde "foi para o lugar certo?".
    expect(linha).toContain("@gmail.com");
    // A parte local NÃO vira lista de contatos.
    expect(linha).not.toContain("diolisantos10");
  });

  it("não inventa recibo quando o envio falhou", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("sem saldo", { status: 402 })));
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});

    const r = await sendEmail(base);
    expect(r.ok).toBe(false);
    expect(info).not.toHaveBeenCalled();
  });

  it("não inventa recibo quando a trava de saída barrou a mensagem", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response('{"id":"nao_devia_sair"}', { status: 200 })));
    const info = vi.spyOn(console, "info").mockImplementation(() => {});

    const r = await sendEmail({ ...base, to: "alguem@cliente-falso.invalid" });
    expect(r.skipped).toBe(true);
    expect(info).not.toHaveBeenCalled();
  });

  it("a resposta 200 sem id é dita, não maquiada de id", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
    const info = vi.spyOn(console, "info").mockImplementation(() => {});

    const r = await sendEmail(base);
    expect(r.ok).toBe(true);
    expect(r.id).toBeUndefined();
    expect(info.mock.calls[0]!.join(" ")).toContain("(sem id na resposta)");
  });
});

describe("mascararDestino", () => {
  it("reduz a parte local à inicial e mantém o domínio", () => {
    expect(mascararDestino("diolisantos10@gmail.com")).toBe("d…@gmail.com");
  });

  it("não vaza string crua quando o endereço é ilegível", () => {
    expect(mascararDestino("sem-arroba")).toBe("(destino ilegível)");
    expect(mascararDestino("@so-dominio.com")).toBe("(destino ilegível)");
    expect(mascararDestino("local@")).toBe("(destino ilegível)");
  });
});

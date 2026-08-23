// a-trava-de-saida.test.ts — a trava que impede o cliente falso de falar com
// gente de verdade.
//
// ─── POR QUE ISTO É O TESTE MAIS IMPORTANTE DA PASTA ────────────────────────
//
// As outras verificações erram e a casa conserta um defeito à toa. ESTA erra e
// um cliente de verdade recebe um orçamento fictício de uma agência que ele não
// contratou. É a única falha desta frente que sai do computador e chega a uma
// pessoa.
//
// A trava mora DENTRO de `sendEmail` — a única porta de saída de mensagem da
// casa (o WhatsApp é link `wa.me`, não envio programático). Medido em
// 23/08/2026: chamando a rota pública de briefing fora do Next, o log cuspiu
// *"confirmation e-mail skipped — RESEND_API_KEY not set"*. A tentativa de envio
// ACONTECEU. Só não saiu porque aquela máquina não tinha chave — e produção tem.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  motivoDoBloqueio, modoClienteFalso, limparSaidasBloqueadas, saidasBloqueadas,
  DOMINIO_DO_CLIENTE_FALSO,
} from "@/lib/agency/cliente-falso/trava-de-saida";
import { sendEmail } from "@/lib/email/send";

const original = process.env.CLIENTE_FALSO;
const chaveOriginal = process.env.RESEND_API_KEY;

beforeEach(() => { limparSaidasBloqueadas(); });
afterEach(() => {
  if (original === undefined) delete process.env.CLIENTE_FALSO; else process.env.CLIENTE_FALSO = original;
  if (chaveOriginal === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = chaveOriginal;
});

describe("cadeado 1 — o modo de teste barra TODO endereço", () => {
  it("barra até um endereço perfeitamente real enquanto o modo está ligado", () => {
    process.env.CLIENTE_FALSO = "1";
    expect(modoClienteFalso()).toBe(true);
    expect(motivoDoBloqueio("cliente.de.verdade@gmail.com")).toBe("modo_cliente_falso");
  });

  it("com o modo desligado, endereço real passa — a trava não pode cortar a casa", () => {
    delete process.env.CLIENTE_FALSO;
    expect(motivoDoBloqueio("cliente.de.verdade@gmail.com")).toBeNull();
  });
});

describe("cadeado 2 — o domínio inexistente, que não depende de ninguém lembrar", () => {
  it("barra o contato do cliente falso mesmo com o modo de teste DESLIGADO", () => {
    // É o modo de falha que importa: alguém roda o percurso esquecendo a
    // variável. `.invalid` é reservado pela RFC 2606 — não existe.
    delete process.env.CLIENTE_FALSO;
    expect(motivoDoBloqueio(`marina.prova@${DOMINIO_DO_CLIENTE_FALSO}`)).toBe("dominio_inexistente");
  });

  it("NÃO barra um domínio real que apenas contém a palavra", () => {
    // "invalid.com.br" é um domínio que pode existir e pertencer a um cliente.
    // Barrar por `includes` seria censurar cliente de verdade — a trava tem de
    // olhar o FIM do endereço, não o meio.
    delete process.env.CLIENTE_FALSO;
    expect(motivoDoBloqueio("contato@invalid.com.br")).toBeNull();
  });
});

describe("a trava dentro de sendEmail — antes da chave, não depois", () => {
  it("recusa o envio mesmo COM chave configurada, e registra a tentativa", async () => {
    // Se a trava morasse depois do `if (!apiKey)`, este teste sairia da função
    // pelo caminho do "skipped" e nunca provaria nada. A chave falsa aqui existe
    // justamente para provar que a trava vem ANTES dela.
    process.env.CLIENTE_FALSO = "1";
    process.env.RESEND_API_KEY = "re_chave_falsa_de_teste";

    const r = await sendEmail({ to: "alguem@gmail.com", subject: "não pode sair", html: "<p>x</p>" });

    expect(r.ok).toBe(false);
    expect(r.error).toBe("bloqueado:modo_cliente_falso");
    expect(saidasBloqueadas()).toHaveLength(1);
    expect(saidasBloqueadas()[0].destino).toBe("alguem@gmail.com");
  });

  it("o placar consegue afirmar 'nada saiu' porque a tentativa fica registrada", async () => {
    process.env.CLIENTE_FALSO = "1";
    await sendEmail({ to: `a@${DOMINIO_DO_CLIENTE_FALSO}`, subject: "a", html: "a" });
    await sendEmail({ to: `b@${DOMINIO_DO_CLIENTE_FALSO}`, subject: "b", html: "b" });
    // Sem este registro, "nenhuma pessoa foi contatada" seria uma afirmação sem
    // prova — e afirmação sem prova é o que esta casa chama de vender pronto o
    // que está em piloto.
    expect(saidasBloqueadas()).toHaveLength(2);
  });
});

// A sonda de e-mail não pode confundir status com motivo — 25/08/2026.
//
// Ela foi escrita para acabar com "status de erro virou motivo" e cometeu o
// erro na PRIMEIRA volta em produção: a Resend devolveu 401 com
// `restricted_api_key` (chave de envio VÁLIDA, sem escopo de leitura) e a sonda
// escreveu "a Resend recusou a chave". Estes testes travam a leitura.

import { describe, it, expect } from "vitest";
import { lerRespostaDaResend } from "@/lib/email/diagnostico";

describe("o motivo está na mensagem, não no status", () => {
  it("401 com restricted_api_key é CHAVE VÁLIDA — o corpo medido em produção", () => {
    const corpo = '{"statusCode":401,"message":"This API key is restricted to only send emails","name":"restricted_api_key"}';
    const r = lerRespostaDaResend(401, corpo);
    expect(r.chaveValida).toBe(true);
    expect(r.restritaAEnvio).toBe(true);
    expect(r.motivo).not.toMatch(/recus/i);
  });

  it("401 de chave de verdade errada continua sendo chave inválida", () => {
    const r = lerRespostaDaResend(401, '{"statusCode":401,"message":"API key is invalid","name":"validation_error"}');
    expect(r.chaveValida).toBe(false);
    expect(r.motivo).toMatch(/API key is invalid/);
  });

  it("200 é chave válida e sem restrição de leitura", () => {
    const r = lerRespostaDaResend(200, '{"data":[]}');
    expect(r.chaveValida).toBe(true);
    expect(r.restritaAEnvio).toBe(false);
  });

  it("o motivo carrega SEMPRE o texto do provedor quando a chave não passa", () => {
    // Régua contra a tentação de resumir: sem o texto cru, a próxima pessoa
    // fica com o número e sem o fato.
    const r = lerRespostaDaResend(403, '{"message":"domain not verified"}');
    expect(r.motivo).toMatch(/domain not verified/);
  });
});

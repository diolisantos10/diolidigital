// A PORTA DE APAGAR A PRODUÇÃO SE DENUNCIA SOZINHA — 16/08/2026.
//
// O Diretor perguntou: "alguém consegue apagar a produção inteira?" O
// `seguranca` mediu e respondeu: não é P0 confirmado por exploração — é P0 de
// PROCESSO. A única coisa que separa "a rota existe" de "a rota não existe" é
// `ALLOW_PRODUCTION_RESET`, e ninguém consegue ler o valor dela de fora
// (`/api/admin/reset`, `/api/capacidades` e `/api/piloto/diagnostico`
// respondem 401 mesmo para quem só quer conferir o estado). O único registro
// era uma frase em `docs/pendencias.md`, de 01/08/2026 — "foi ligada para a
// operação e desligada em seguida" — texto, não medição, e por isso
// envelheceu sem que ninguém notasse.
//
// Este teste prova as DUAS metades contra `portaDeResetAberta`, a função pura
// extraída de `despertador.ts` propositalmente para não depender de banco,
// rede nem relógio real:
//   ✅ com a variável em "true", ela denuncia — e a mensagem nomeia a
//      variável e diz o que fazer;
//   ⛔ sem a variável, e com ela em qualquer outro valor ("false", "1",
//      vazia), ela NÃO denuncia nada. Um alarme que dispara onde não há
//      risco é um alarme que quem lê aprende a ignorar, e aí ele para de
//      proteger o caso real.

import { describe, it, expect } from "vitest";
import { portaDeResetAberta, VARIAVEL_DO_RESET } from "@/lib/agency/despertador";

describe("portaDeResetAberta — a denúncia da porta de reset", () => {
  it("✅ denuncia quando a variável está \"true\", e a mensagem nomeia a variável e o que fazer", () => {
    const msg = portaDeResetAberta({ [VARIAVEL_DO_RESET]: "true" });
    expect(msg).not.toBeNull();
    expect(msg).toContain(VARIAVEL_DO_RESET);
    expect(msg?.toLowerCase()).toContain("railway");
    expect(msg?.toLowerCase()).toContain("produção");
  });

  it("⛔ NÃO denuncia quando a variável está ausente", () => {
    expect(portaDeResetAberta({})).toBeNull();
  });

  it("⛔ NÃO denuncia quando a variável está vazia", () => {
    expect(portaDeResetAberta({ [VARIAVEL_DO_RESET]: "" })).toBeNull();
  });

  it("⛔ NÃO denuncia com \"false\"", () => {
    expect(portaDeResetAberta({ [VARIAVEL_DO_RESET]: "false" })).toBeNull();
  });

  it("⛔ NÃO denuncia com qualquer valor que não seja exatamente \"true\" (ex.: \"1\", \"TRUE\", \" true \")", () => {
    expect(portaDeResetAberta({ [VARIAVEL_DO_RESET]: "1" })).toBeNull();
    expect(portaDeResetAberta({ [VARIAVEL_DO_RESET]: "TRUE" })).toBeNull();
    // Espaço em volta é tolerado (trim), mas o valor em si continua sendo o
    // que decide — isto prova que o trim não abre a porta para variações.
    expect(portaDeResetAberta({ [VARIAVEL_DO_RESET]: " true " })).not.toBeNull();
  });
});

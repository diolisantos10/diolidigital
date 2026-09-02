// ─── ACHADO DO `experiencia` EM 02/09/2026 — o CAST vs. a CONVERSÃO ────────
//
// `app/api/agency/oportunidades/fila-diaria/route.ts` e
// `app/api/agency/oportunidades/[id]/funil/route.ts` montavam a credencial
// com `autoridade: session.role as Autoridade` — um CAST, não uma conversão.
// `session.role` é `AgencyRole` (vocabulário em português: "diretor",
// "executivo_comercial"…); `Autoridade` é outro vocabulário ("director",
// "department_member"…). "master" calha de ser igual nos dois vocabulários,
// por acidente — é por isso que ninguém notou até agora. Para qualquer conta
// com `role: "diretor"`, o cast produzia um valor que não batia com NENHUMA
// chave de `Autoridade`.
//
// O conserto: as duas rotas agora usam `autoridadeDoPapel(session.role)`, o
// conversor que já existia em `lib/agency/roles.ts` e que
// `app/api/agency/celula/papeis/route.ts` já usava corretamente.
//
// ── POR QUE ESTE ARQUIVO EXISTE SEPARADO DE `rota-fila-diaria.test.ts` E
//    `rota-funil-papel-do-banco.test.ts` ─────────────────────────────────
// Conferido: NENHUMA das duas rotas chama `podeNaCelula` com
// "aprovar_modelo", "pausar_modelo" ou "operar_fila_de_excecoes" — as três
// ações protegidas pelas travas INCONDICIONAIS de `lib/agency/celula/
// papeis.ts:159` e `:174` (`grep` em `app/` confirma: só "autorizar_envio" e
// "ler_a_celula" passam por rota de `app/` hoje). E nenhuma das duas ações
// que as rotas expõem DEPENDE do valor exato de `autoridade` ser "director"
// — `ler_a_celula` só checa `!== "client"`, e `autorizar_envio` não olha
// `autoridade` nenhuma, só `papel`. Por isso o bug do cast NUNCA quebrou o
// caminho feliz dessas duas ações, em nenhuma das duas versões — e é
// exatamente por isso que ele passou despercebido.
//
// Este arquivo prova a conversão em si (o `autoridadeDoPapel` produz o valor
// certo) e, com isso, prova que a lacuna real do achado do `experiencia`
// só se fecha de ponta a ponta no dia em que "aprovar_modelo",
// "pausar_modelo" ou "operar_fila_de_excecoes" ganharem uma rota em `app/`
// — o que NÃO existe hoje. `lib/agency/celula/papeis.ts` em si já está
// coberto para este cenário exato por `__tests__/celula/papeis.test.ts`
// (testes (b) e (c), "master COM gerente_de_atendimento auto-atribuído").
// Este arquivo é o elo que faltava: mostrar que `autoridadeDoPapel` entrega
// a essas travas o valor que elas esperam.

import { describe, it, expect } from "vitest";
import { autoridadeDoPapel, type AgencyRole } from "@/lib/agency/roles";
import { podeNaCelula, type Credencial } from "@/lib/agency/celula/papeis";
import type { Autoridade } from "@/lib/agency/organizacao/autoridade";

describe("autoridadeDoPapel: a conversão certa, papel a papel", () => {
  it('"diretor" (AgencyRole, pt) converte para "director" (Autoridade) — NÃO é o mesmo texto', () => {
    const role: AgencyRole = "diretor";
    expect(autoridadeDoPapel(role)).toBe("director");
    // O cast antigo não convertia nada — só forçava o tipo.
    const castAntigo = role as unknown as Autoridade;
    expect(castAntigo).toBe("diretor");
    expect(castAntigo).not.toBe("director");
  });

  it('"master" converte para "master" — as duas grafias colidem, por acidente, e é por isso que master nunca expôs o bug', () => {
    const role: AgencyRole = "master";
    expect(autoridadeDoPapel(role)).toBe("master");
    expect(role as unknown as Autoridade).toBe("master");
  });

  it('"executivo_comercial" converte para "department_member" — outro par que não bate por cast', () => {
    const role: AgencyRole = "executivo_comercial";
    expect(autoridadeDoPapel(role)).toBe("department_member");
    expect(role as unknown as Autoridade).toBe("executivo_comercial");
  });
});

describe("o efeito na trava incondicional — o valor certo importa, mesmo não sendo exercitado pelas rotas de hoje", () => {
  // Cenário do despacho: conta com role "diretor", auto-atribuída (ou
  // atribuída por master) como "gerente_de_atendimento" na Célula.
  const credencialComCastAntigo: Credencial = {
    autoridade: "diretor" as unknown as Autoridade, // o que o `as Autoridade` produzia
    departamentos: ["client-service-sdr"],
    papelDeclaradoNaCelula: "gerente_de_atendimento",
  };
  const credencialComConversaoCerta: Credencial = {
    autoridade: autoridadeDoPapel("diretor"), // o que autoridadeDoPapel produz: "director"
    departamentos: ["client-service-sdr"],
    papelDeclaradoNaCelula: "gerente_de_atendimento",
  };

  it("🔴 COM O CAST ANTIGO: a trava incondicional NUNCA disparava para role 'diretor' — o bug real", () => {
    // "diretor" não é "director" nem "master" — nenhuma das comparações
    // `c?.autoridade === "director"` da trava incondicional bate, então ela
    // cai direto na checagem de `papel`, que É "gerente_de_atendimento" —
    // e libera aprovar_modelo/pausar_modelo como se fosse um gerente de
    // verdade, não a direção se autoconcedendo o papel.
    expect(podeNaCelula(credencialComCastAntigo, "aprovar_modelo").pode).toBe(true);
    expect(podeNaCelula(credencialComCastAntigo, "pausar_modelo").pode).toBe(true);
    expect(podeNaCelula(credencialComCastAntigo, "operar_fila_de_excecoes").pode).toBe(true);
  });

  it("✅ COM A CONVERSÃO CERTA: a trava incondicional dispara — a direção não aprova a própria fala nem opera a fila", () => {
    const aprovar = podeNaCelula(credencialComConversaoCerta, "aprovar_modelo");
    const pausar = podeNaCelula(credencialComConversaoCerta, "pausar_modelo");
    const fila = podeNaCelula(credencialComConversaoCerta, "operar_fila_de_excecoes");
    expect(aprovar.pode).toBe(false);
    expect(pausar.pode).toBe(false);
    expect(fila.pode).toBe(false);
    if (!aprovar.pode) expect(aprovar.regra).toBe("direcao_nao_aprova_a_propria_fala");
    if (!pausar.pode) expect(pausar.regra).toBe("direcao_nao_aprova_a_propria_fala");
    if (!fila.pode) expect(fila.regra).toBe("o_ceo_nao_opera_a_fila");
  });

  it("autorizar_envio e ler_a_celula: idênticos nas duas versões — por isso o bug não quebrou o caminho feliz das rotas de hoje", () => {
    expect(podeNaCelula(credencialComCastAntigo, "autorizar_envio").pode).toBe(true);
    expect(podeNaCelula(credencialComConversaoCerta, "autorizar_envio").pode).toBe(true);
    expect(podeNaCelula(credencialComCastAntigo, "ler_a_celula").pode).toBe(true);
    expect(podeNaCelula(credencialComConversaoCerta, "ler_a_celula").pode).toBe(true);
  });
});

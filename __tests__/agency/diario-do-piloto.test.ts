// O diário do piloto — a rota que deixa os Diretores enxergarem o banco.
//
// Ordem do CEO em 16/08: *"eu preciso de uma forma onde vocês acompanham o que
// eu estou fazendo e a resposta do sistema em relação a isso. Um log."*
//
// A noite anterior mostrou o custo de não ter isso: o briefing dele não andou e
// o Diretor Geral levantou TRÊS teorias sem confirmar nenhuma, porque via o
// rastro do servidor e não via o banco.
//
// O teste guarda o que essa rota nunca pode virar: um buraco. Ela é somente
// leitura, exige chave, e sem chave configurada FECHA — nunca abre.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROTA = fs.readFileSync(
  path.join(process.cwd(), "app/api/piloto/diario/route.ts"),
  "utf8",
);

describe("é somente leitura", () => {
  it("expõe apenas GET", () => {
    expect(ROTA).toMatch(/export async function GET/);
    expect(ROTA).not.toMatch(/export async function (POST|PUT|PATCH|DELETE)/);
  });

  it("não escreve no banco — nem rastro", () => {
    // Um diário que escreve deixa de ser diário e vira mais uma fonte de
    // verdade. Só leitura: findMany e nada mais.
    expect(ROTA).not.toMatch(/\.(create|update|upsert|delete|createMany|updateMany|deleteMany)\(/);
  });
});

describe("a chave é obrigatória, e ausência de chave FECHA", () => {
  it("sem PILOTO_SECRET configurado, responde 503 e não devolve dado", () => {
    // Fail-closed: variável ausente nunca pode virar "entra qualquer um" numa
    // rota que devolve conversa de cliente.
    expect(ROTA).toMatch(/if \(!esperado\)/);
    expect(ROTA).toMatch(/status: 503/);
  });

  it("compara a chave com timing-safe, não com ===", () => {
    expect(ROTA).toContain("segredoConfere");
    expect(ROTA).not.toMatch(/chave\s*===\s*esperado/);
  });

  it("chave errada é 401 antes de qualquer leitura do banco", () => {
    const portao = ROTA.indexOf("status: 401");
    const leitura = ROTA.indexOf("prisma.");
    expect(portao).toBeGreaterThan(-1);
    expect(leitura).toBeGreaterThan(portao);
  });
});

describe("não devolve segredo", () => {
  for (const proibido of ["token", "Secret:", "passwordHash", "portalToken", "apiKey"]) {
    it(`não seleciona "${proibido}"`, () => {
      // O que se audita é o que o agente disse e o que o sistema decidiu —
      // credencial nunca entra nisso.
      expect(ROTA).not.toContain(`${proibido}: true`);
    });
  }
});

describe("cegueira é declarada, nunca silenciosa", () => {
  it("tabela que falha na leitura aparece em `cegueiras` com o motivo", () => {
    // Um diário que some inteiro porque uma tabela falhou é pior que um diário
    // com um capítulo faltando — desde que o capítulo faltando esteja nomeado.
    expect(ROTA).toContain("cegueiras");
    expect(ROTA).toMatch(/cegueiras\.push/);
  });

  it("devolve contagem antes da lista", () => {
    // "Existe ou não existe" foi a pergunta que ninguém conseguiu responder na
    // noite de 15/08.
    expect(ROTA).toMatch(/quantos:/);
  });

  it("marca explicitamente briefing SEM orçamento calculado", () => {
    // O defeito que custou a noite: o pedido existia e o número não. Ver isso
    // na primeira linha do diário encurta o diagnóstico para segundos.
    expect(ROTA).toMatch(/SEM orçamento calculado/);
  });
});

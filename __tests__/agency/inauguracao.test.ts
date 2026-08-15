// Modo INAUGURAÇÃO — "como se a gente tivesse inaugurando, sem nenhum cliente".
//
// Ordem do CEO (15/08/2026): zerar tudo que é do cliente para percorrer a
// esteira etapa por etapa a partir do SDR. *"Não quero nenhum resquício."*
//
// A metade que importa não é "apagou". É **não sobrou**. Um resquício não
// aparece como erro: aparece como uma tela que responde sobre um cliente que
// não existe mais — e aí se corrige um defeito que era só fantasma, que é
// exatamente o que a ordem veio impedir.
//
// Por isso o teste lê o CÓDIGO e o SCHEMA em vez de simular o banco: um campo
// `clientId` novo, criado daqui a três semanas por alguém que nunca leu este
// arquivo, tem de FALHAR aqui — nomeando o modelo esquecido.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROTA = fs.readFileSync(
  path.join(process.cwd(), "app/api/admin/reset/route.ts"),
  "utf8",
);
const SCHEMA = fs.readFileSync(
  path.join(process.cwd(), "prisma/schema.prisma"),
  "utf8",
);

/** Todo modelo do schema que carrega `clientId` — o universo do que é do cliente. */
function modelosComClientId(): string[] {
  const achados: string[] = [];
  let modelo = "";
  for (const linha of SCHEMA.split("\n")) {
    const m = /^model\s+(\w+)/.exec(linha);
    if (m) { modelo = m[1]; continue; }
    if (modelo && /^\s*clientId\s+String/.test(linha)) achados.push(modelo);
  }
  return [...new Set(achados)].filter((m) => m !== "Client");
}

/** O delegate do Prisma como aparece no código: "AIRunLog" → "aIRunLog". */
const delegate = (modelo: string) => modelo.charAt(0).toLowerCase() + modelo.slice(1);

/**
 * Modelos que somem por CASCATA quando o pai é apagado — não precisam de linha
 * própria. Declarados aqui, um a um, porque "confie no cascade" sem dizer de
 * quem é filho é como o teste passa a esconder o resquício.
 */
const CAEM_POR_CASCATA: Record<string, string> = {
  Project: "apagado explicitamente",
  ClientNotice: "apagado explicitamente",
  ContentRequest: "apagado explicitamente",
  BrandBrain: "cascade de Client",
  BrandUpdate: "cascade de Client",
};

describe("modo inauguracao — não pode sobrar resquício de cliente", () => {
  it("o modo existe e é aceito pela rota", () => {
    expect(ROTA).toContain('"inauguracao"');
    expect(ROTA).toMatch(/MODES: Mode\[\] = \[[^\]]*"inauguracao"/);
  });

  it("todo modelo com clientId é tratado — por linha própria ou por cascata declarada", () => {
    const esquecidos = modelosComClientId().filter((modelo) => {
      if (modelo in CAEM_POR_CASCATA) return false;
      // `tx.<delegate>.deleteMany` em qualquer ponto da transação serve: o que
      // não pode é o modelo não aparecer em lugar nenhum.
      return !ROTA.includes(`tx.${delegate(modelo)}.deleteMany`);
    });

    expect(
      esquecidos,
      `modelos com clientId que o reset NÃO apaga (resquício): ${esquecidos.join(", ")}`,
    ).toEqual([]);
  });

  it("a agência fica de pé — a conta da Meta DA CASA não é apagada junto", () => {
    // A fronteira do modo: sai o que é do cliente, fica o que é da casa. Apagar
    // a conexão da agência (clientId nulo) obrigaria a reconectar tudo à mão
    // antes do primeiro post — e a ordem foi "a agência vai ficar de pé".
    expect(ROTA).toMatch(/metaConnection\.deleteMany\(\{\s*where:\s*\{\s*NOT:\s*\{\s*clientId:\s*null\s*\}/);
    expect(ROTA).toMatch(/metaAtivoAutorizado\.deleteMany\(\{\s*where:\s*\{\s*NOT:\s*\{\s*clientId:\s*null\s*\}/);
  });

  it("o login do cliente sai, o da equipe fica", () => {
    // "senha, tudo" da ordem: senha de cliente que não existe mais não pode
    // continuar abrindo porta. Mas usuário da casa tem clientId nulo e fica —
    // apagar a equipe deixaria o CEO sem login.
    expect(ROTA).toMatch(/user\.deleteMany\(\{\s*where:\s*\{\s*NOT:\s*\{\s*clientId:\s*null\s*\}/);
  });

  it("continua exigindo as três chaves — apagar não pode ser um clique distraído", () => {
    expect(ROTA).toContain("ALLOW_PRODUCTION_RESET");
    expect(ROTA).toContain("DELETE_ALL_OPERATIONAL_DATA");
    expect(ROTA).toMatch(/role !== "master"|"master"/);
  });
});

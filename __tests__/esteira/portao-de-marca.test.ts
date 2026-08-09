// O PORTÃO DE MARCA no caminho da entrega.
//
// O Conselho listou como condição de tudo: "não existe rota alternativa para
// entregar contornando o portão". Em 09/08/2026 existia — `publicarAgendados`
// lia o post agendado e entregava. Enquanto essa rota existisse, qualquer
// portão de marca ficaria AO LADO do caminho, não NO caminho.
//
// Cada trava aqui tem AS DUAS METADES: barra o caso ruim E deixa passar o bom.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const PUB = fs.readFileSync(path.join(process.cwd(), "lib/agency/esteira/publicacao.ts"), "utf8");

/** O corpo de `publicarAgendados`, que é a rota de entrega. */
function corpoDaPublicacao(): string {
  const i = PUB.indexOf("export async function publicarAgendados");
  expect(i, "publicarAgendados sumiu — a rota de entrega mudou de nome").toBeGreaterThan(-1);
  return PUB.slice(i);
}

describe("nada é entregue sem a régua de marca ter sido consultada", () => {
  const corpo = corpoDaPublicacao();

  it("a rota de entrega consulta o contrato de marca", () => {
    expect(
      corpo.includes("contratoDeMarca(post.clientId)"),
      "a entrega voltou a contornar o portão — o branding virou decoração",
    ).toBe(true);
  });

  it("marca não constituída BARRA a entrega", () => {
    expect(corpo.includes("marca.naoConstituida")).toBe(true);
    const i = corpo.indexOf("marca.naoConstituida");
    // Tem que levar a `falhar(...)` e a um `continue` — não a um aviso.
    expect(corpo.slice(i, i + 700)).toContain("await falhar(");
    expect(corpo.slice(i, i + 700)).toContain("continue;");
  });

  it("FALHAR ao ler a régua também barra — sem portão é reprovado, nunca liberado", () => {
    // O modo de falha mais caro seria `catch` devolvendo null e o código
    // seguindo em frente: o erro de leitura viraria permissão.
    const i = corpo.indexOf("contratoDeMarca(post.clientId)");
    const trecho = corpo.slice(i, i + 700);
    expect(trecho).toContain("if (!marca)");
    expect(trecho).toContain("await falhar(");
  });

  it("o portão vem ANTES de qualquer chamada à plataforma", () => {
    // Barrar depois de já ter criado o container na Meta não é barrar: é
    // publicar e se arrepender.
    const iPortao = corpo.indexOf("contratoDeMarca(post.clientId)");
    const iPublica = corpo.indexOf("publishPost(");
    expect(iPublica, "publishPost sumiu da rota").toBeGreaterThan(-1);
    expect(iPortao).toBeLessThan(iPublica);
  });

  it("a mensagem diz o que fazer, não só o que está errado", () => {
    // Erro que não diz o conserto vira ruído que ninguém age.
    const i = corpo.indexOf("marca.naoConstituida");
    expect(corpo.slice(i, i + 700)).toMatch(/ficha de marca|preencha/i);
  });
});

describe("o portão NÃO julga a peça — isso é do agente, e ele precisa de régua", () => {
  const corpo = corpoDaPublicacao();

  it("não reprova por conteúdo: só pergunta se a marca declarou alguma regra", () => {
    const i = corpo.indexOf("contratoDeMarca(post.clientId)");
    const trecho = corpo.slice(i, i + 900);
    // Se um dia alguém puser aqui uma reprovação por texto/estilo, o portão
    // virou crítico de arte — o erro clássico nomeado na constituição.
    for (const proibido of ["lacunas.length", "marca.texto.includes"]) {
      expect(trecho.includes(proibido), `o portão passou a julgar conteúdo (${proibido})`).toBe(false);
    }
  });
});

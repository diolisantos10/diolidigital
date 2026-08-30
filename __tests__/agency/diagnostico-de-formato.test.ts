// O laudo do "malformado" — e a linha que ele não pode atravessar.
//
// Dois deveres, e o segundo é mais importante que o primeiro:
//   1. dizer QUE FORMA tinha o pacote que falhou;
//   2. NUNCA deixar passar uma letra do que o modelo escreveu — o texto barrado
//      não entra no diário, e um laudo que o contrabandeia é pior que laudo
//      nenhum, porque ninguém desconfia dele.

import { describe, it, expect } from "vitest";
import { formaDaFalha, laudoEmUmaFrase } from "@/lib/agency/comercial/diagnostico-de-formato";

describe("forma da falha — o que o pacote era, sem dizer o que ele dizia", () => {
  it("reconhece o modelo que respondeu em prosa, sem tentar JSON", () => {
    const f = formaDaFalha("Claro! Posso sim receber seu briefing, pode mandar.");
    expect(f.temChaveDeAbertura).toBe(false);
    expect(laudoEmUmaFrase(f)).toMatch(/não abriu JSON nenhum/);
  });

  it("reconhece o pacote que abriu e não fechou", () => {
    const f = formaDaFalha('{"scope": {"businessName": "Cantina');
    expect(f.temChaveDeAbertura).toBe(true);
    expect(f.temChaveDeFechamento).toBe(false);
    expect(laudoEmUmaFrase(f)).toMatch(/abriu e não fechou/);
  });

  it("mede o preâmbulo que o modelo escreveu antes do pacote", () => {
    const f = formaDaFalha('Claro! Aqui está: {"scope": {,}}');
    expect(f.lixoAntes).toBe("Claro! Aqui está: ".length);
    expect(laudoEmUmaFrase(f)).toMatch(/ANTES do pacote/);
  });

  it("mede o epílogo depois do pacote", () => {
    const f = formaDaFalha('{"a": ,} — espero ter ajudado!');
    expect(f.lixoDepois).toBeGreaterThan(0);
    expect(laudoEmUmaFrase(f)).toMatch(/DEPOIS do pacote/);
  });

  it("diz onde o parser desistiu quando ele soube dizer", () => {
    const f = formaDaFalha('{"scope": {"businessName": "Cantina" "segment": "restaurante"}}');
    expect(f.posicaoDaFalha).not.toBeNull();
    expect(laudoEmUmaFrase(f)).toMatch(/posição \d+/);
  });

  it("não quebra com entrada vazia nem com lixo", () => {
    expect(() => laudoEmUmaFrase(formaDaFalha(""))).not.toThrow();
    expect(() => laudoEmUmaFrase(formaDaFalha("}}}{{{"))).not.toThrow();
  });
});

describe("a linha que o laudo não atravessa — nada do que o modelo escreveu", () => {
  // Cada um destes textos falha o parse E contém uma frase que o guarda existe
  // para impedir de sair (preço, pedido de e-mail, nome de cliente). O laudo
  // inteiro tem de sair sem UMA palavra deles.
  const barrados = [
    'Aqui está o plano: R$ 4.000 por mês com desconto {"scope": ,}',
    'Qual é o seu e-mail para eu confirmar? {"reply": }',
    '{"scope": {"businessName": "Cantina da Prova"} "reply": "fechamos por R$ 6.500"}',
    // Insumo do teste que prova que a redação funciona.
    // segredo-permitido: chave FALSA, não existe fora deste arquivo.
    'segredo colado pelo visitante: sk-ant-api03-NAOPODEVAZAR {"a": ,}',
  ];

  for (const texto of barrados) {
    it(`não repete nenhuma palavra do texto barrado: ${texto.slice(0, 28)}…`, () => {
      const laudo = laudoEmUmaFrase(formaDaFalha(texto));
      // Nenhuma palavra de 4+ letras do texto original pode reaparecer no laudo.
      const palavras = texto.match(/[A-Za-zÀ-ÿ0-9_$-]{4,}/g) ?? [];
      for (const w of palavras) {
        expect(laudo.toLowerCase(), `o laudo repetiu "${w}"`).not.toContain(w.toLowerCase());
      }
      // E o laudo continua sendo útil: fala de forma, com números.
      expect(laudo).toMatch(/\d/);
    });
  }

  it("não repassa a mensagem do JSON.parse, que cita o trecho ofensor", () => {
    // "Unexpected token 'x'" carrega o caractere do modelo. Só o número sai.
    const laudo = laudoEmUmaFrase(formaDaFalha('{"reply": "oi" "scope": {}}'));
    expect(laudo).not.toMatch(/Unexpected|token|JSON/i);
  });
});

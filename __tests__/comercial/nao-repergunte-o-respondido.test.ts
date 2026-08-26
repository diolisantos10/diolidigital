// O SDR REPERGUNTOU O QUE O CLIENTE ACABARA DE RESPONDER — 8ª volta, 26/08/2026.
//
// E, na mesma volta, falou do cliente em terceira pessoa, na cara dele:
//
//     "você consegue me dizer se ELE já tem fotos?"
//
// O contador desta casa não pega o primeiro caso: ele conta REPETIÇÕES e freia
// na segunda. Aqui a pergunta saiu UMA vez, e uma já era demais — `reply` e
// `scope` vêm do MESMO pacote do modelo, então ele grava o dado e pergunta o
// dado no mesmo fôlego.

import { describe, it, expect } from "vitest";
import {
  perguntaJaRespondida, proximaPerguntaEmAberto, falaSobreOClienteEmTerceiraPessoa,
  identificarPergunta,
} from "@/lib/agency/comercial/pergunta-repetida";

describe("a fila responde 'isto já foi respondido?'", () => {
  it("o caso medido: o cliente disse que TEM fotos, e a pergunta das fotos fecha", () => {
    const escopo = { social: { hasPhotos: true } };
    expect(perguntaJaRespondida("material_pronto", escopo)).toBe(true);
    // "não temos" também é resposta — `false` é um fato, não um vazio.
    expect(perguntaJaRespondida("material_pronto", { social: { hasPhotos: false } })).toBe(true);
    expect(perguntaJaRespondida("material_pronto", { social: {} })).toBe(false);
  });

  it("vale para a fila inteira, sem uma segunda gramática", () => {
    expect(perguntaJaRespondida("objetivo", { objectives: ["vender mais"] })).toBe(true);
    expect(perguntaJaRespondida("publico_alvo", { targetAudience: "moradores do bairro" })).toBe(true);
    expect(perguntaJaRespondida("canal_de_contato", { preferredChannel: "email" })).toBe(true);
    expect(perguntaJaRespondida("decisor", { decisionMaker: false })).toBe(true);
    expect(perguntaJaRespondida("prazo", {})).toBe(false);
  });

  it("PERGUNTA DESCONHECIDA NÃO É FREADA — freio no escuro cala o SDR", () => {
    expect(perguntaJaRespondida("pergunta_que_nao_existe", { objectives: ["x"] })).toBe(false);
    expect(perguntaJaRespondida("objetivo", undefined)).toBe(false);
  });
});

describe("proibir vem com a instrução gêmea", () => {
  it("no lugar da pergunta respondida sai a PRÓXIMA em aberto", () => {
    const escopo = { social: { hasPhotos: true }, objectives: ["vender mais"], targetAudience: "vizinhança" };
    const proxima = proximaPerguntaEmAberto(escopo, ["material_pronto"]);
    expect(proxima).toBeTruthy();
    // E a substituta não é a mesma pergunta com outra roupa.
    expect(identificarPergunta(proxima!)).not.toBe("material_pronto");
  });

  it("sondagem fechada devolve null — quem chama decide o fecho", () => {
    const cheio = {
      objectives: ["x"], targetAudience: "y", social: { platforms: ["instagram"], hasPhotos: true },
      deadline: "este mês", decisionMaker: true, preferredChannel: "email",
    };
    expect(proximaPerguntaEmAberto(cheio, [])).toBeNull();
  });
});

describe("fala-se COM o cliente, não SOBRE ele", () => {
  it("a frase medida, palavra por palavra", () => {
    expect(falaSobreOClienteEmTerceiraPessoa("você consegue me dizer se ele já tem fotos?")).toBe(true);
  });

  it("pega as outras formas do mesmo erro", () => {
    for (const f of [
      "O cliente já tem logo?",
      "Ela pretende começar quando?",
      "O dono quer anúncio pago?",
    ]) {
      expect(falaSobreOClienteEmTerceiraPessoa(f), f).toBe(true);
    }
  });

  it("NÃO casa com 'ele' que se refere a uma COISA — o pronome tem uso legítimo", () => {
    for (const f of [
      "O seu Instagram: ele está ativo hoje?",
      "Sobre o logo — você tem ele em arquivo aberto?",
      "Você já tem fotos do negócio?",
      "Quem é o cliente típico de vocês?",
    ]) {
      expect(falaSobreOClienteEmTerceiraPessoa(f), f).toBe(false);
    }
  });

  it("fala sem pergunta não é freada", () => {
    expect(falaSobreOClienteEmTerceiraPessoa("Ele já tem fotos.")).toBe(false);
    expect(falaSobreOClienteEmTerceiraPessoa("")).toBe(false);
    expect(falaSobreOClienteEmTerceiraPessoa(null)).toBe(false);
  });
});

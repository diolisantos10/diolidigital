// Onde o negócio vende.
//
// A trava central: **o silêncio não pode virar "Brasil inteiro"**. Até
// 10/08/2026 virava — nenhuma pergunta do SDR capturava região, `cidade` era
// sempre nula, e nula era lida como país. Este arquivo existe para que o
// terceiro estado (`nao_declarado`) não possa ser confundido com os outros dois.

import { describe, it, expect } from "vitest";
import {
  lerAreaDeAtendimento, oQueFaltaParaSegmentar, NAO_PERGUNTADO,
} from "@/lib/agency/comercial/onde-o-negocio-vende";

describe("o silêncio NÃO é uma resposta", () => {
  it("texto vazio volta como não declarado — nunca como nacional", () => {
    expect(lerAreaDeAtendimento("").alcance).toBe("nao_declarado");
    expect(NAO_PERGUNTADO.alcance).toBe("nao_declarado");
  });

  it("texto que não fala de lugar nenhum não vira alcance nenhum", () => {
    const a = lerAreaDeAtendimento("quero vender mais, tô precisando de cliente");
    expect(a.alcance).toBe("nao_declarado");
    expect(a.cidade).toBeNull();
  });

  it("não declarado é BLOQUEIO, e o motivo diz o custo em dinheiro", () => {
    const falta = oQueFaltaParaSegmentar(NAO_PERGUNTADO);
    expect(falta).toBeTruthy();
    expect(falta).toMatch(/Brasil inteiro/i);
    expect(falta).toMatch(/verba/i);
  });

  it("briefing antigo, sem o campo, também é bloqueio", () => {
    // `undefined` é o briefing anterior a este conserto. Deixá-lo passar
    // reabriria o buraco justamente para os clientes que já estão na casa.
    expect(oQueFaltaParaSegmentar(undefined)).toBeTruthy();
  });
});

describe("quem diz a cidade é atendido de verdade", () => {
  it("lê a cidade e o raio da frase do cliente", () => {
    const a = lerAreaDeAtendimento("Meus clientes ficam em Campinas, uns 10 km em volta");
    expect(a.alcance).toBe("local");
    expect(a.cidade).toBe("Campinas");
    expect(a.raioKm).toBe(10);
    expect(oQueFaltaParaSegmentar(a)).toBeNull();
  });

  it("lê cidade de nome composto", () => {
    expect(lerAreaDeAtendimento("aqui em São José dos Campos").cidade).toBe("São José dos Campos");
  });

  it('"cidade de X" também é lido', () => {
    expect(lerAreaDeAtendimento("atendo a cidade de Ribeirão Preto").cidade).toBe("Ribeirão Preto");
  });
});

describe("quem diz Brasil inteiro é atendido de verdade — e só quem diz", () => {
  it("o e-commerce declara nacional e passa", () => {
    const a = lerAreaDeAtendimento("vendo para o Brasil inteiro, é tudo online");
    expect(a.alcance).toBe("nacional");
    expect(oQueFaltaParaSegmentar(a)).toBeNull();
  });

  it("a metade oposta: a MESMA frase sem a declaração não passa", () => {
    const a = lerAreaDeAtendimento("é tudo por encomenda");
    expect(a.alcance).toBe("nao_declarado");
    expect(oQueFaltaParaSegmentar(a)).toBeTruthy();
  });

  it("cidade dita vence 'Brasil' solto na frase — gastar perto é o erro barato", () => {
    const a = lerAreaDeAtendimento("mando para o Brasil todo, mas minha loja fica em Campinas");
    expect(a.alcance).toBe("local");
    expect(a.cidade).toBe("Campinas");
  });
});

describe("o caso do padeiro: disse o alcance, não disse a cidade", () => {
  const a = lerAreaDeAtendimento("só quero anunciar aqui no meu bairro mesmo");

  it("é local — não é nacional e não é ausência", () => {
    expect(a.alcance).toBe("local");
  });

  it("e a cidade continua NULA — não se adivinha onde ele fica", () => {
    // Adivinhar a cidade do padeiro pelo DDD, pelo CEP do sócio ou pelo nome do
    // negócio gastaria a verba dele na cidade errada.
    expect(a.cidade).toBeNull();
  });

  it("então ele BLOQUEIA, e o bloqueio carrega a frase original dele", () => {
    const falta = oQueFaltaParaSegmentar(a);
    expect(falta).toMatch(/não disse qual cidade/i);
    expect(falta).toContain("meu bairro");
  });
});

describe("não inventa cidade a partir de palavra comum", () => {
  it('"na região" não vira a cidade "Região"', () => {
    const a = lerAreaDeAtendimento("atendo na região");
    expect(a.cidade).toBeNull();
    expect(a.alcance).toBe("local");
  });

  it('"aqui no bairro" não vira a cidade "Bairro"', () => {
    expect(lerAreaDeAtendimento("aqui no bairro").cidade).toBeNull();
  });
});

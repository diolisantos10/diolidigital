// O REPERTÓRIO DE UMA MARCA NÃO VAZA PARA OUTRA.
//
// ── O INCIDENTE (CEO, 08/08/2026) ──────────────────────────────────────────
//
// Ao refazer as peças reprovadas do CityJobs, a régua de qualidade foi buscada
// na pasta de referência da agência — e a peça aberta lá era `Radar Dioli Tech`,
// que é da marca da PRÓPRIA DIOLI: serifa de display, paleta creme e
// azul-marinho, mockup de tablet sobre mármore, tom de curadoria de tecnologia
// para um público de agência.
//
// O despacho quase mandou aplicar aquilo inteiro a uma plataforma de vagas do
// Alto Tietê. **"Essa arte é da Dioli Digital, você está misturando os
// projetos."** O CEO pegou antes do Diretor.
//
// O que se leva de uma referência é o NÍVEL (fotografia real, camadas, respiro,
// hierarquia, paleta contida). O que NÃO se leva é o VISUAL de outra marca.
//
// ── AS DUAS METADES ────────────────────────────────────────────────────────
//
// 1. NADA de uma marca aparece na outra — nem o repertório, nem a amplitude,
//    nem a tipografia derivada.
// 2. E o mecanismo NÃO responde vazio no caso legítimo: cada marca registrada
//    devolve o cérebro DELA, cheio. Uma trava que zera tudo "por segurança"
//    protege contra vazamento entregando peça sem repertório nenhum.

import { describe, expect, it } from "vitest";

import {
  cerebroDaMarca,
  cerebroDaFoocci,
  cerebroDaDioli,
  cerebroDoCityJobs,
} from "@/lib/agency/design/repertorio-registrado";
import { familiaDeclarada, FAMILIAS_DE_DISPLAY } from "@/lib/agency/design/molde";

describe("cada marca recebe o cérebro DELA", () => {
  it("CityJobs tem cérebro próprio registrado, e ele não é o da Dioli", () => {
    const c = cerebroDaMarca("CityJobs");
    expect(c.marca).toBe("CityJobs");
    expect(c.repertorio.length).toBeGreaterThan(0);
    expect(c.amplitude.length).toBeGreaterThan(0);
    // A lacuna "não há cérebro registrado" NÃO pode estar lá: ela era verdade
    // até 08/08/2026 e deixou de ser.
    expect(c.lacunas.join(" ")).not.toMatch(/nenhum cérebro criativo registrado/i);
  });

  it.each([
    ["CityJobs", "CityJobs"],
    ["City Jobs", "CityJobs"],
    ["CITYJOBS SP", "CityJobs"],
    ["Foocci", "Foocci"],
    ["Dioli Digital", "Dioli Digital"],
    ["Dioli Digital Studio", "Dioli Digital"],
  ])("%s → cérebro de %s", (pedido, esperado) => {
    expect(cerebroDaMarca(pedido).marca).toBe(esperado);
  });

  it("🔴 a ORDEM da lista importa: 'CityJobs' NUNCA cai no cérebro da Dioli", () => {
    // Se alguém puser `/dioli/i` antes e um dia a régua de uma marca ficar
    // larga demais, é aqui que quebra. A régua larga é a que já existe.
    const c = cerebroDaMarca("CityJobs");
    expect(c.marca).not.toBe("Dioli Digital");
    expect(c.marca).not.toBe("Foocci");
  });
});

describe("nenhuma entrada de uma marca aparece em outra", () => {
  const marcas = {
    CityJobs: cerebroDoCityJobs().cerebro,
    Foocci: cerebroDaFoocci().cerebro,
    Dioli: cerebroDaDioli().cerebro,
  };

  it("os ids de repertório são disjuntos entre marcas", () => {
    const vistos = new Map<string, string>();
    for (const [nome, c] of Object.entries(marcas)) {
      for (const p of c.repertorio) {
        const dono = vistos.get(p.id);
        expect(
          dono,
          `o id de repertório "${p.id}" está em ${dono} E em ${nome} — repertório compartilhado é repertório vazado`,
        ).toBeUndefined();
        vistos.set(p.id, nome);
      }
    }
  });

  it("a procedência de toda entrada aponta para a fonte DAQUELA marca", () => {
    for (const p of marcas.CityJobs.repertorio) {
      expect(p.procedencia).toMatch(/cityjobs/i);
      expect(p.procedencia).not.toMatch(/foocci/i);
    }
    for (const p of marcas.Foocci.repertorio) {
      expect(p.procedencia).not.toMatch(/cityjobs/i);
    }
  });

  it("o CityJobs declara FORA DA MARCA justamente o que é da Dioli", () => {
    const fora = marcas.CityJobs.amplitude.flatMap((a) => a.foraDaMarca ?? []).join(" ").toLowerCase();
    // Não é decoração: é a lista que um gerador de prompt lê antes de pedir a
    // foto, e é o que impede a estética de escritório de tecnologia de voltar.
    expect(fora).toMatch(/serifada/);
    expect(fora).toMatch(/creme/);
    expect(fora).toMatch(/tablet|mármore|coworking/);
  });
});

describe("a TIPOGRAFIA de uma marca não vaza pela porta do molde", () => {
  it("marca declarada sans NUNCA recebe display serifado", () => {
    const f = familiaDeclarada("Arial Black / Arial / Helvetica, sans-serif");
    expect(f.chave).toBe("neutra");
    expect(f.declarada).toBe(true);
    expect(f.display).toBe(FAMILIAS_DE_DISPLAY.neutra);
    expect(f.display).not.toMatch(/Playfair|Georgia|serif'/);
  });

  it("marca declarada serifada continua recebendo serifada — a trava não achata todo mundo", () => {
    const f = familiaDeclarada("Playfair Display, Georgia, serif");
    expect(f.chave).toBe("serifada");
    expect(f.display).toBe(FAMILIAS_DE_DISPLAY.serifada);
  });

  it("o display sai SEMPRE da mesma chave do corpo — nunca de outra linhagem", () => {
    for (const t of ["Inter", "Poppins", "Oswald", "Pacifico", "Georgia", "", null]) {
      const f = familiaDeclarada(t);
      expect(f.display).toBe(FAMILIAS_DE_DISPLAY[f.chave]);
    }
  });
});

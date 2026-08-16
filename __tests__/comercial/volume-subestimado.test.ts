import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { diagnosticar, retratoDoLote } from "@/lib/agency/comercial/volume-subestimado";

// ─────────────────────────────────────────────────────────────────────────────
// O DINHEIRO JÁ GRAVADO — 16/08/2026
//
// O motor lia o número e ignorava a unidade: "2 posts por dia" virava
// `postsPerWeek: 2`. O conserto impede a sujeira nova; **não desfaz a que está
// no banco**. E esta não é cosmética: volume é PREÇO e ESCOPO CONTRATADO. Se um
// pedido virou proposta, a casa cotou menos do que devia; se virou contrato, a
// casa deve entrega que não sabe que deve.
//
// A pergunta que decide tudo: dá para distinguir "pediu 2 por semana" de "disse
// 2 por dia e virou 2"? **Dá, e só, quando a conversa está gravada** — a frase
// original está no transcript. Não é dedução; é leitura.
//
// Sem transcript, `nao_recuperavel` — e isso NÃO é "está certo".
// ─────────────────────────────────────────────────────────────────────────────

const comConversa = (falas: string[], postsPerWeek: number) => ({
  id: "p1",
  briefingJson: JSON.stringify({
    scope: { wantsSocialMedia: true, social: { postsPerWeek } },
    transcript: falas.map((text, i) => ({ role: i % 2 === 0 ? "client" : "assistant", text })),
  }),
});

describe("acha o subestimado usando a frase da própria pessoa", () => {
  it("o caso do CEO: escreveu 2 por dia, o banco guarda 2", () => {
    const d = diagnosticar(comConversa(["2 posts por dia."], 2));
    expect(d.veredito).toBe("subestimado");
    expect(d.gravado).toBe(2);
    expect(d.correto).toBe(14);
    // A prova viaja junto: quem for decidir lê a frase, não a conclusão.
    expect(d.frase).toContain("2 posts por dia");
  });

  it("não toca no que está certo", () => {
    // Quem realmente pediu 3 por semana continua com 3. A dúvida não autoriza
    // escrita, e a certeza contrária muito menos.
    expect(diagnosticar(comConversa(["3 posts por semana."], 3)).veredito).toBe("confere");
    expect(diagnosticar(comConversa(["10 posts por mês"], 3)).veredito).toBe("confere");
  });

  it("a ÚLTIMA palavra da pessoa é a que vale", () => {
    // Quem se corrige no meio da conversa ("na verdade...") tem a última
    // palavra, como teria falando com gente.
    const d = diagnosticar(comConversa(["2 posts por dia.", "ok", "na verdade 3 posts por semana"], 3));
    expect(d.veredito).toBe("confere");
  });

  it("a fala do SDR não conta como prova", () => {
    // O assistente repete o número JÁ ERRADO. Lê-la seria confirmar o defeito
    // com ele mesmo.
    const d = diagnosticar({
      id: "p2",
      briefingJson: JSON.stringify({
        scope: { social: { postsPerWeek: 2 } },
        transcript: [{ role: "assistant", text: "Ajustei para 2 posts por dia." }],
      }),
    });
    expect(d.veredito).toBe("nao_recuperavel");
  });
});

describe("o que não dá para saber é declarado como não sabido", () => {
  it("sem transcript, não é recuperável — e isso não é 'está certo'", () => {
    const d = diagnosticar({ id: "p3", briefingJson: JSON.stringify({ scope: { social: { postsPerWeek: 2 } } }) });
    expect(d.veredito).toBe("nao_recuperavel");
    expect(d.motivo).toMatch(/não é recuperável|NÃO significa que está certo/i);
  });

  it("conversa sem frase de volume também é não recuperável", () => {
    expect(diagnosticar(comConversa(["Quero social media."], 2)).veredito).toBe("nao_recuperavel");
  });

  it("nenhum veredito inventa número quando não há frase", () => {
    const d = diagnosticar(comConversa(["Quero social media."], 2));
    expect(d.correto).toBeNull();
  });
});

describe("idempotente: a segunda passada não acha nada", () => {
  it("corrigido uma vez, para de aparecer", () => {
    const lote = [comConversa(["2 posts por dia."], 2), comConversa(["3 por semana"], 3)];
    const primeira = retratoDoLote(lote);
    expect(primeira.subestimados).toBe(1);

    const depois = lote.map((p) => {
      const d = diagnosticar(p);
      if (d.veredito !== "subestimado") return p;
      const b = JSON.parse(p.briefingJson);
      b.scope.social.postsPerWeek = d.correto;
      return { ...p, briefingJson: JSON.stringify(b) };
    });
    expect(retratoDoLote(depois).subestimados).toBe(0);
  });
});

describe("a ferramenta relata antes de escrever", () => {
  const S = readFileSync(join(process.cwd(), "scripts/volume-subestimado.mts"), "utf8")
    .split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");

  it("simula por padrão e exige duas confirmações para escrever", () => {
    expect(S).toMatch(/const APLICAR = process\.argv\.includes\("--aplicar"\)/);
    expect(S).toContain("EU_SEI_O_QUE_ESTOU_FAZENDO");
    expect(S).toMatch(/if \(!APLICAR\)/);
  });

  it("escreve linha a linha pelo id, nunca updateMany", () => {
    expect(S).toContain("prisma.clientRequestDb.update({ where: { id: m.id }");
    expect(S).not.toContain("updateMany");
  });

  it("preserva o resto do briefing — só o campo do volume é reescrito", () => {
    // Saneamento de um campo não pode levar embora o que a pessoa contou.
    expect(S).toMatch(/b\.scope\.social = \{ \.\.\./);
  });
});

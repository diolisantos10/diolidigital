// O HTML QUE O CLIENTE 001 LÊ — medido, não deduzido.
//
// ── Por que este teste existe, e por que ele renderiza ──────────────────────
// Em 27/08/2026 o conserto dos três defeitos de escopo foi escrito, testado e
// provado por mutação em `tabela-de-precos.ts` — e **nenhuma tela chamava as
// funções**. A suíte ficou verde e o cliente continuou lendo "Posts: 28/mês" e
// "Vídeo: A definir".
//
// A pergunta obrigatória da casa é *"o teste alcança o código que responde ao
// cliente?"*. Provar a função isolada responde NÃO. Por isso aqui se renderiza
// `ScopeSection`, que é o quadro que o Foocci teve na frente, e se mede o texto
// que sai dele.

import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ScopeSection } from "@/components/agency/briefing/PublicBriefingRoom";
import type { BriefingScope } from "@/lib/agency/briefing-conversation";

/** O escopo REAL do cliente 001 em 27/08/2026. */
const foocci: BriefingScope = {
  businessName: "Foocci",
  segment: "B2B SaaS para restaurantes",
  objectives: [],
  serviceMode: "one_off",
  wantsSocialMedia: true,
  social: {
    platforms: ["Instagram"],
    postsPerWeek: 7,            // 28/mês
    storiesPerWeek: 0,
    reelsPerMonth: 0,
    needsVideoProduction: true, // ele PEDE vídeo
  },
};

function texto(scope: BriefingScope): string {
  // Sem as tags: é o que o olho lê, não o que o navegador recebe. Medir o HTML
  // cru reprovaria classe CSS que por acaso contenha a palavra procurada.
  return renderToStaticMarkup(<ScopeSection scope={scope} />)
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#x27;|&quot;/g, " ")
    .replace(/\s+/g, " ");
}

describe("a tela do cliente 001 — os três defeitos, na saída", () => {
  it("NÃO estampa 28/mês como se fosse o contratado", () => {
    expect(texto(foocci)).not.toMatch(/Posts\s*28\/mês/);
  });

  it("mostra o degrau que a casa vende — 36 — e o que ele pediu", () => {
    const t = texto(foocci);
    expect(t).toMatch(/36\/mês/);
    expect(t).toMatch(/você pediu 28/i);
  });

  it("explica o encaixe na própria tela, não só no código", () => {
    expect(texto(foocci)).toMatch(/degrau|recebe mais, não menos/i);
  });

  it("NÃO promete produção de vídeo a quem pediu vídeo", () => {
    const t = texto(foocci);
    expect(t).not.toMatch(/Produção pela Dioli/i);
    expect(t).toMatch(/Vídeo\s*Não fazemos/);
  });

  it("NÃO escreve 'A definir' em lugar nenhum do quadro", () => {
    const t = texto(foocci);
    expect(t).not.toMatch(/a definir/i);
  });

  it("não afirma 'projeto pontual' sobre um escopo com peças por mês", () => {
    const t = texto(foocci);
    expect(t).toMatch(/Modalidade\s*Gestão mensal/);
    expect(t).not.toMatch(/Projeto pontual/);
  });

  it("diz ao cliente o que foi corrigido e devolve a palavra a ele", () => {
    expect(texto(foocci)).toMatch(/é só dizer|refazemos/i);
  });
});

describe("as travas não valem só para o Foocci", () => {
  it("nenhum ramo de vídeo escreve indefinição ou promessa", () => {
    for (const social of [
      { platforms: ["Instagram"], postsPerWeek: 3, needsVideoProduction: true },
      { platforms: ["Instagram"], postsPerWeek: 3, needsVideoProduction: false },
      { platforms: ["Instagram"], postsPerWeek: 3, hasVideomaker: false },
      { platforms: ["Instagram"], postsPerWeek: 3, hasVideomaker: true },
    ]) {
      const t = texto({ ...foocci, social });
      expect(t).not.toMatch(/a definir|Produção pela Dioli/i);
    }
  });

  it("nenhum volume entre 1 e 36 sai da tela fora de um degrau vendido", () => {
    const degraus = [12, 20, 36];
    for (let n = 1; n <= 36; n++) {
      const t = texto({ ...foocci, social: { platforms: [], postsPerWeek: 0, reelsPerMonth: n } });
      const casados = t.match(/(\d+)\/mês/g) ?? [];
      expect(casados.length).toBeGreaterThan(0);
      for (const c of casados) {
        expect(degraus).toContain(Number(c.replace("/mês", "")));
      }
    }
  });

  it("volume acima da capacidade da casa não vira número nenhum", () => {
    const t = texto({ ...foocci, social: { platforms: [], postsPerWeek: 0, reelsPerMonth: 60 } });
    expect(t).toMatch(/Não vendemos esse volume/i);
    expect(t).not.toMatch(/60\/mês/);
  });
});

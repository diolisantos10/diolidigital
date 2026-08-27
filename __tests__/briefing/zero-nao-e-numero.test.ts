// Zero não é número: é uma afirmação FALSA sobre o cliente na TELA do
// briefing — e é pior que ausência, porque parece dado.
//
// Caso real, 16/08/2026: o lead Diego descreveu "2 posts por dia" na
// conversa e o quadro do escopo (`ScopeSection`, na tela pública de
// briefing) mostrou "0 posts por mês". Ele escreveu, duas vezes, na própria
// conversa com a SDR:
//
//   "tá certinho aqui o resumo eu vi aqui ao lado só tá dizendo que são 0
//   posts por mês não sei se é algum problema do sistema de vocês ou não"
//
//   "ali no quadro ainda continua zero post mas tudo bem"
//
// E a SDR respondeu "pode ser alguma coisa no sistema mesmo" — a agência
// admitindo o próprio defeito para o cliente, ao vivo.
//
// A causa não era o número em si (o servidor já lê "dois posts por dia"
// corretamente — conserto de outra frente). A causa era a TELA: a linha de
// Posts do quadro do escopo (`ScopeSection`, `PublicBriefingRoom.tsx`) nunca
// teve a guarda `> 0` que as linhas de Stories e Reels, logo abaixo dela, já
// tinham — a mesma falta se repetia em `buildExtractedSummary` (o resumo que
// vai para o resto da casa) e, por extensão, em qualquer scope cujo
// `postsPerWeek` chegasse como `0` explícito (inclusive vindo do LLM via
// `asNum`, que aceita `0` como número válido — corretamente, porque `0` é um
// valor real, não ausência; o defeito nunca esteve em aceitar `0`, esteve em
// IMPRIMIR `0` como se fosse a resposta, sem dizer que a pergunta nunca foi
// respondida com um número maior).
//
// Este teste prova a cadeia de funções puras exportadas do componente E o HTML
// do `ScopeSection`, renderizado com `renderToStaticMarkup` (o mesmo caminho de
// `nenhuma-parada-sem-porta.test.tsx`; não há jsdom/@testing-library nesta
// casa). Até 27/08/2026 a segunda metade era uma leitura de FONTE com regex —
// ver a nota de inversão no segundo bloco.

import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { buildExtractedSummary, ScopeSection } from "@/components/agency/briefing/PublicBriefingRoom";
import { emptyScope, type BriefingScope } from "@/lib/agency/briefing-conversation";

describe("buildExtractedSummary nunca afirma '0 posts/mês' — a fala do Diego não se repete", () => {
  it("postsPerWeek: 0 explícito NÃO vira '0 posts/mês' nas quantidades", () => {
    const scope = {
      ...emptyScope(),
      wantsSocialMedia: true,
      social: { platforms: ["instagram"], postsPerWeek: 0 },
    };

    const summary = buildExtractedSummary(scope);

    expect(summary.quantities.some((q) => q.includes("0 posts/mês"))).toBe(false);
  });

  it("postsPerWeek real (2/dia = 14/semana) aparece corretamente — a guarda não apaga dado de verdade", () => {
    const scope = {
      ...emptyScope(),
      wantsSocialMedia: true,
      social: { platforms: ["instagram"], postsPerWeek: 14 },
    };

    const summary = buildExtractedSummary(scope);

    expect(summary.quantities).toContain("56 posts/mês");
  });

  it("quando não há nenhuma quantidade real, missingInfo DECLARA a ausência em vez de escondê-la", () => {
    // É exatamente esta ausência declarada que faltava no caso do Diego: se a
    // tela tivesse dito "ainda não perguntamos a quantidade de posts" em vez
    // de "0 posts/mês", ele nunca teria achado que o sistema estava quebrado.
    const scope = {
      ...emptyScope(),
      wantsSocialMedia: true,
      social: { platforms: ["instagram"], postsPerWeek: 0 },
    };

    const summary = buildExtractedSummary(scope);

    expect(summary.missingInfo).toContain("Quantidade de peças/posts");
  });

  it("quando a quantidade real está presente, ela NÃO entra em missingInfo", () => {
    const scope = {
      ...emptyScope(),
      wantsSocialMedia: true,
      social: { platforms: ["instagram"], postsPerWeek: 14 },
    };

    const summary = buildExtractedSummary(scope);

    expect(summary.missingInfo).not.toContain("Quantidade de peças/posts");
  });

  it("orçamento e prazo ausentes também entram em missingInfo — não é só o campo de posts", () => {
    const scope = { ...emptyScope(), wantsSocialMedia: true };
    const summary = buildExtractedSummary(scope);

    expect(summary.missingInfo).toContain("Orçamento");
    expect(summary.missingInfo).toContain("Prazo de entrega");
  });
});

describe("o quadro do escopo (ScopeSection) trata Posts, Stories e Reels com a MESMA regra", () => {
  // ⚠️ ESTE BLOCO FOI REESCRITO EM 27/08/2026, e a inversão fica declarada.
  //
  // Ele lia a FONTE do componente com regex e exigia o literal
  //   `scope.social.postsPerWeek > 0 ? ... : "Não incluído"` + `dim: ... === 0`
  // nos três blocos. Isso congelava a FORMA, não a regra — e virou obstáculo à
  // primeira mudança legítima: as três linhas passaram a sair de UMA função
  // (`linhaDeVolume`), que é justamente "nenhuma segunda forma de escrever a
  // regra" levada ao limite. Três cópias idênticas do ternário eram o problema
  // que o teste tolerava, não a solução que ele protegia.
  //
  // A REGRA — a do Diego, 16/08/2026 — continua inteira e agora é medida onde
  // importa: no HTML que o cliente lê. `ScopeSection` foi exportada para isso.
  // Zero nunca aparece como "0/mês"; os três campos respondem igual; número de
  // verdade continua aparecendo.

  function texto(scope: BriefingScope): string {
    return renderToStaticMarkup(createElement(ScopeSection, { scope }))
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ");
  }

  const base: BriefingScope = {
    ...emptyScope(),
    wantsSocialMedia: true,
    social: { platforms: ["instagram"] },
  };

  it("ScopeSection continua existindo e exportada (trava contra refatoração que a esconda)", () => {
    expect(typeof ScopeSection).toBe("function");
  });

  it("zero NÃO vira '0/mês' em NENHUM dos três campos — a fala do Diego não se repete", () => {
    const t = texto({ ...base, social: { platforms: ["instagram"], postsPerWeek: 0, storiesPerWeek: 0, reelsPerMonth: 0 } });
    expect(t).not.toMatch(/0\/mês/);
    expect(t).toMatch(/Posts\s*Não incluído/);
  });

  it("os três campos respondem à MESMA regra — nenhum deles é a exceção", () => {
    for (const social of [
      { platforms: ["instagram"], postsPerWeek: 0 },
      { platforms: ["instagram"], storiesPerWeek: 0 },
      { platforms: ["instagram"], reelsPerMonth: 0 },
    ]) {
      const t = texto({ ...base, social });
      expect(t).toMatch(/Não incluído/);
      expect(t).not.toMatch(/0\/mês/);
    }
  });

  it("número de verdade continua aparecendo — a guarda não apaga dado real", () => {
    // 3 posts/semana = 12/mês, que É um degrau da casa: sai limpo, sem encaixe.
    const t = texto({ ...base, social: { platforms: ["instagram"], postsPerWeek: 3 } });
    expect(t).toMatch(/Posts\s*12\/mês/);
  });
});

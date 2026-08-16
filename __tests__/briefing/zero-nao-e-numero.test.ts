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
// Este teste prova a cadeia de funções puras exportadas do componente — não
// há jsdom/@testing-library nesta casa (mesmo precedente de
// `escopo-sobrevive-a-recusa.test.ts`) — mais uma leitura de FONTE do
// `ScopeSection`, que é JSX e não é função pura exportável sem renderer.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildExtractedSummary } from "@/components/agency/briefing/PublicBriefingRoom";
import { emptyScope } from "@/lib/agency/briefing-conversation";

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
  const CAMINHO = join(process.cwd(), "components/agency/briefing/PublicBriefingRoom.tsx");
  const FONTE = readFileSync(CAMINHO, "utf8");

  // Recorta só o corpo de `ScopeSection` para não deixar outra ocorrência do
  // arquivo (ex.: `buildExtractedSummary`) mascarar o teste.
  const inicio = FONTE.indexOf("function ScopeSection(");
  const fim = FONTE.indexOf("// ── Estimate section", inicio);
  const SCOPE_SECTION = FONTE.slice(inicio, fim);

  it("existe de fato a função ScopeSection para recortar (trava contra refatoração que renomeia)", () => {
    expect(inicio).toBeGreaterThan(-1);
    expect(fim).toBeGreaterThan(inicio);
  });

  it("a linha de Posts usa a mesma guarda `> 0` que Stories e Reels já usavam", () => {
    // ANTES do conserto, esta linha era:
    //   rows.push({ label: "Posts", value: `${scope.social.postsPerWeek * 4}/mês` });
    // — sem checar se o número era maior que zero, e sem `dim`. Esta asserção
    // reprova exatamente essa forma antiga: se alguém reintroduzi-la, o teste
    // fica vermelho de novo.
    expect(SCOPE_SECTION).not.toMatch(
      /rows\.push\(\{\s*label:\s*"Posts",\s*value:\s*`\$\{scope\.social\.postsPerWeek \* 4\}\/mês`\s*\}\)/,
    );
    expect(SCOPE_SECTION).toMatch(/scope\.social\.postsPerWeek > 0 \? `\$\{scope\.social\.postsPerWeek \* 4\}\/mês` : "Não incluído"/);
    expect(SCOPE_SECTION).toMatch(/dim:\s*scope\.social\.postsPerWeek === 0/);
  });

  it("o padrão de Posts é textualmente o MESMO de Stories e Reels — nenhuma segunda forma de escrever a regra", () => {
    const posPosts = SCOPE_SECTION.indexOf('label: "Posts"');
    const posStories = SCOPE_SECTION.indexOf('label: "Stories"');
    const posReels = SCOPE_SECTION.indexOf('label: "Reels"');
    expect(posPosts).toBeGreaterThan(-1);
    expect(posStories).toBeGreaterThan(posPosts);
    expect(posReels).toBeGreaterThan(posStories);

    // Mesma estrutura de três linhas (label / value ternário / dim) nos três blocos.
    for (const label of ["Posts", "Stories", "Reels"]) {
      const bloco = SCOPE_SECTION.slice(SCOPE_SECTION.indexOf(`label: "${label}"`) - 20, SCOPE_SECTION.indexOf(`label: "${label}"`) + 220);
      expect(bloco).toContain("? `${");
      expect(bloco).toContain('` : "Não incluído"');
      expect(bloco).toMatch(/dim:\s*scope\.social\.\w+ === 0/);
    }
  });
});

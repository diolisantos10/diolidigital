// O PLANO FANTASMA NÃO CHEGA À TELA NEM AO REGISTRO — o portão pela SAÍDA.
//
// ═══════════════════════════════════════════════════════════════════════════
// POR QUE ESTE ARQUIVO SUBSTITUI O PORTÃO ANTERIOR
// ═══════════════════════════════════════════════════════════════════════════
//
// O portão da rodada de 16/08 era isto:
//
//     const acoes = tela.slice(tela.indexOf("const QUICK_ACTIONS"), +2000);
//     expect(acoes).not.toContain('label: "Plano Starter"');
//
// Literal exato, recorte de 2000 caracteres, num arquivo só — **e o defeito
// estava a três arquivos de distância, vivo, RENDERIZANDO**:
//
//     lib/agency/live-calculator.ts:61        label: "Plano Starter"
//       → PublicBriefingRoom.tsx:181          pkgLabel = pkg.label
//       → PublicBriefingRoom.tsx:247          <span>Plano</span> <span>{pkgLabel}</span>
//       → ScopeSection montado em :1750       tela pública do prospect
//       → buildTitle:85                       "Orçamento — <negócio> — Plano Starter"
//                                             → ClientRequestDb → caixa da equipe → portal
//
// Disparava para todo prospect com 15 a 24 posts/mês. Passou porque o portão
// vigiava **onde alguém já tinha olhado**. Portão assim não é mecanismo — é a
// atenção de quem o escreveu, com nome de mecanismo.
//
// ═══════════════════════════════════════════════════════════════════════════
// A RÉGUA DESTE ARQUIVO: portão sobre o que RENDERIZA e o que PERSISTE
// ═══════════════════════════════════════════════════════════════════════════
//
// Ele não pergunta "alguém escreveu Plano Starter em algum arquivo?". Ele
// monta a tela de verdade (`renderToStaticMarkup`), monta o registro de verdade
// (`buildTitle`, `computeEstimate`) e pergunta **o que saiu**. Se um nome de
// plano fora do catálogo puder chegar à tela ou ao registro por qualquer
// caminho — `QUICK_ACTIONS`, `live-calculator`, o motor de regras ou o modelo —
// ele aparece aqui.

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ScopeSection, buildTitle } from "@/components/agency/briefing/PublicBriefingRoom";
import { ACOES_DE_ESCOPO } from "@/lib/agency/comercial/acoes-do-escopo";
import { SOCIAL_PACKAGES, computeEstimate, detectPackage, getPackageDef } from "@/lib/agency/live-calculator";
import { nomesDePlanoForaDoCatalogo, nomesDePlanoAutorizados } from "@/lib/agency/comercial/leitor-de-valor";
import { PLANOS } from "@/lib/agency/planos";
import type { BriefingScope } from "@/lib/agency/briefing-conversation";

/** Um escopo de prospect, com a cadência que o teste quiser. */
function escopo(postsPerWeek: number | undefined, extra: Partial<BriefingScope> = {}): BriefingScope {
  return {
    wantsSocialMedia: true,
    wantsPaidTraffic: false,
    businessName: "Negócio de Teste",
    objectives: [],
    social: postsPerWeek === undefined
      ? { platforms: ["Instagram"] }
      : { platforms: ["Instagram"], postsPerWeek, storiesPerWeek: 5, reelsPerMonth: 2 },
    ...extra,
  } as BriefingScope;
}

function textoDaTela(scope: BriefingScope): string {
  // Tira as tags: o que importa é o que a PESSOA lê, não o markup.
  return renderToStaticMarkup(createElement(ScopeSection, { scope }))
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ");
}

// Toda cadência que um prospect real pode declarar. 1 a 20 posts por semana
// cobre os cinco degraus da tabela, os limites entre eles e os extremos.
const CADENCIAS = Array.from({ length: 20 }, (_, i) => i + 1);

describe("O QUE RENDERIZA — a tela pública do prospect", () => {
  // ── METADE 1: O PORTÃO PEGA O NOME INVENTADO ──────────────────────────────
  it("o leitor ACUSA o rótulo antigo — a prova de que este portão morde", () => {
    // Se esta asserção cair, o portão inteiro virou fachada: ele deixou de
    // reconhecer justamente o nome que produziu o incidente.
    expect(nomesDePlanoForaDoCatalogo("Plano Starter")).toContain("Starter");
    expect(nomesDePlanoForaDoCatalogo("Plano · Plano Growth")).toContain("Growth");
    expect(nomesDePlanoForaDoCatalogo("Volto para o Starter então")).toContain("Starter");
    // E um nome que ninguém previu — a CLASSE do defeito, não o caso de hoje.
    expect(nomesDePlanoForaDoCatalogo("Fica no Plano Turbo")).toContain("Turbo");
  });

  it("NENHUMA cadência renderiza nome de plano fora do catálogo", () => {
    for (const ppw of CADENCIAS) {
      const html = textoDaTela(escopo(ppw));
      expect(
        nomesDePlanoForaDoCatalogo(html),
        `${ppw} posts/semana desenhou plano fantasma na tela: "${html}"`,
      ).toEqual([]);
    }
  });

  it("o selo do painel não se chama mais 'Plano' — ele mede CADÊNCIA", () => {
    const html = textoDaTela(escopo(5));
    expect(html).toContain("Cadência");
    expect(html).toContain("5 posts/semana");
    // O rótulo do incidente, com todas as letras.
    expect(html).not.toContain("Plano Starter");
  });

  // ── METADE 2: A TELA CONTINUA DIZENDO O QUE PRECISA DIZER ─────────────────
  it("o painel não ficou mudo — a cadência e o serviço continuam na tela", () => {
    const html = textoDaTela(escopo(5, { wantsPaidTraffic: true, traffic: { platforms: [], monthlyAdBudget: "R$ 1.000" } } as Partial<BriefingScope>));
    expect(html).toContain("Social Media");
    expect(html).toContain("20/mês");           // posts
    expect(html).toContain("Tráfego Pago");
  });

  it("escopo sem cadência declarada não inventa selo nenhum", () => {
    const html = textoDaTela(escopo(undefined));
    expect(html).not.toContain("Cadência");
    expect(nomesDePlanoForaDoCatalogo(html)).toEqual([]);
  });
});

describe("O QUE PERSISTE — o título que chega à caixa da equipe e ao portal", () => {
  it("NENHUMA cadência produz título com plano fora do catálogo", () => {
    for (const ppw of CADENCIAS) {
      for (const extra of [{}, { wantsPaidTraffic: true }, { branding: { requested: true, hasBrandBook: false, wantsRebrand: false } }]) {
        const titulo = buildTitle(escopo(ppw, extra as Partial<BriefingScope>));
        expect(
          nomesDePlanoForaDoCatalogo(titulo),
          `"${titulo}" carimba plano fantasma no registro do pedido`,
        ).toEqual([]);
      }
    }
  });

  it("e o título continua dizendo de quem é e do que se trata", () => {
    const titulo = buildTitle(escopo(5));
    expect(titulo).toContain("Negócio de Teste");
    expect(titulo).toContain("Social Media");
  });

  it("a ESTIMATIVA persistida (`v2Estimate`) não nomeia plano fantasma", () => {
    // Ela viaja no submit como `v2Estimate` e é lida depois pelo dossiê do lead.
    for (const ppw of CADENCIAS) {
      const est = computeEstimate(escopo(ppw, { wantsPaidTraffic: true, traffic: { platforms: [], monthlyAdBudget: "R$ 1.000" }, branding: { requested: true, hasBrandBook: false, wantsRebrand: false } } as Partial<BriefingScope>));
      const texto = [...est.items.map((i) => `${i.label} ${i.detail}`), ...est.included, ...est.notIncluded].join(" · ");
      expect(nomesDePlanoForaDoCatalogo(texto), `estimativa de ${ppw} posts/semana: "${texto}"`).toEqual([]);
    }
  });
});

describe("A FONTE — quem NOMEIA produto nesta casa é `planos.ts`, e só ele", () => {
  it("nenhum rótulo do `live-calculator` nomeia plano", () => {
    for (const p of SOCIAL_PACKAGES) {
      expect(
        nomesDePlanoForaDoCatalogo(`${p.label} — ${p.description}`),
        `o pacote "${p.id}" voltou a se chamar de plano: "${p.label}"`,
      ).toEqual([]);
    }
  });

  it("nenhum BOTÃO da tela pública nomeia plano", () => {
    for (const a of ACOES_DE_ESCOPO) {
      expect(nomesDePlanoForaDoCatalogo(`${a.label} ${a.text}`), `botão "${a.label}"`).toEqual([]);
    }
  });

  it("os cinco planos de verdade PASSAM — o portão não achata o catálogo", () => {
    for (const p of PLANOS) {
      expect(nomesDePlanoForaDoCatalogo(`O Plano ${p.nome} custa ${p.preco}.`)).toEqual([]);
      expect(nomesDePlanoAutorizados().has(p.nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase())).toBe(true);
    }
    // E frases com "plano" que não são nome de produto continuam livres.
    expect(nomesDePlanoForaDoCatalogo("Quero um plano mais simples e barato")).toEqual([]);
    expect(nomesDePlanoForaDoCatalogo("O plano de medição entra no Conteúdo.")).toEqual([]);
  });

  // ══════════════════════════════════════════════════════════════════════════
  // ⛔ E A PORTA DOS SCRIPTS FICOU ABERTA (16/08/2026, quarta passada)
  // ══════════════════════════════════════════════════════════════════════════
  //
  // O plano fantasma morreu na fonte (`live-calculator`) e continuou vivo em
  // `scripts/p0-browser-input-test.ts`, num `v2Estimate` com
  // `"Social Media — Plano Growth (…)"` que o script **POSTa em
  // `/api/brain/client-requests`** — com `BASE_URL=…railway.app` sugerido no
  // cabeçalho dele. Caminho de persistência real, rodado à mão, sem portão.
  //
  // O portão anterior olhava a tela e o `buildTitle`. Script não é tela: é a
  // mesma escrita, por outra porta. Este varre TODO script que POSTa numa rota
  // de persistência — não o arquivo de que alguém lembrou.
  describe("nem pela porta dos SCRIPTS — o que POSTa também é escrita", () => {
    const ROTAS_QUE_PERSISTEM = ["/api/brain/client-requests", "/api/brain/deliverables", "/api/brain/projects"];

    function scriptsQuePersistem(): { arquivo: string; fonte: string }[] {
      const dir = path.join(process.cwd(), "scripts");
      return readdirSync(dir)
        .filter((f) => f.endsWith(".ts") || f.endsWith(".mts"))
        .map((f) => ({ arquivo: f, fonte: readFileSync(path.join(dir, f), "utf8") }))
        .filter(({ fonte }) => ROTAS_QUE_PERSISTEM.some((r) => fonte.includes(r)) && /method:\s*"POST"/.test(fonte));
    }

    it("a varredura ACHA scripts — ela não pode virar lista vazia", () => {
      const achados = scriptsQuePersistem();
      expect(
        achados.length,
        "nenhum script de persistência encontrado — o portão virou fachada",
      ).toBeGreaterThanOrEqual(3);
    });

    /**
     * O que o script escreve como NOME DE COISA — `label`, `title`, `name`.
     *
     * ⚠️ O ESCOPO É ESTE, E O LIMITE É DECLARADO. A primeira versão varria o
     * arquivo inteiro e acusou `copyTone: "Premium, apetitoso, direto"` em
     * `scripts/pilot-sushi-cazza.ts` — "Premium" ali é adjetivo de tom de voz,
     * não nome de produto. Portão que acusa onde não há risco é portão que
     * alguém desliga, e o preço teria sido reescrever o tom de voz para o teste
     * passar. O que persiste como NOME é o que é vigiado.
     */
    function nomesEscritos(fonte: string): { chave: string; valor: string }[] {
      const codigo = fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
      return [...codigo.matchAll(/\b(label|title|name|nome|produto|plano|pkgLabel)\s*:\s*["'`]([^"'`]*)["'`]/g)].map(
        (m) => ({ chave: m[1]!, valor: m[2]! }),
      );
    }

    it("🔴 NENHUM script que POSTa nomeia plano fora do catálogo", () => {
      for (const { arquivo, fonte } of scriptsQuePersistem()) {
        for (const { chave, valor } of nomesEscritos(fonte)) {
          expect(
            nomesDePlanoForaDoCatalogo(valor),
            `scripts/${arquivo} persiste plano fantasma em \`${chave}: "${valor}"\``,
          ).toEqual([]);
        }
      }
    });

    it("e o portão MORDE — o rótulo exato do incidente é pego", () => {
      const plantado = `{ label: "Social Media — Plano Growth (12 posts + 20 stories + 2 reels)", minPrice: 1400 }`;
      const achados = nomesEscritos(plantado);
      expect(achados, "a extração de nomes não achou o rótulo plantado").toHaveLength(1);
      expect(nomesDePlanoForaDoCatalogo(achados[0]!.valor)).toContain("Growth");
    });

    it("e NÃO acusa o que não é nome de produto — 'Premium' como tom de voz passa", () => {
      expect(nomesEscritos(`{ copyTone: "Premium, apetitoso, direto." }`)).toEqual([]);
    });
  });

  it("a cadência detectada continua batendo com a tabela (o rename não mexeu na régua)", () => {
    expect(getPackageDef(detectPackage(20)).postsPerWeek).toBe(5);
    expect(getPackageDef(detectPackage(60)).postsPerWeek).toBe(15);
  });
});

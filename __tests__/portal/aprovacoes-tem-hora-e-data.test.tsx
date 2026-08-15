/**
 * ─── A ABA APROVAÇÕES CARIMBA TUDO — E NÃO INVENTA NADA ─────────────────────
 *
 * 15/08/2026. O CEO estava no portal da CityJobs, na aba Aprovações, e leu:
 *
 *   • "PRECISO CONFIRMAR: qual é o padrão das referências enviadas?"
 *     → "Social Media · sem prazo — decida quando puder"   (nenhuma data)
 *   • "1 entrega está pronta para você"                     (nenhuma data)
 *   • "Analytics" e "Estratégia" · "material ainda não subiu" (nenhuma data)
 *   • "Peças do calendário — 2 peças" · "decidido em 14/08"  (dia sem hora, sem ano)
 *
 * A ordem: "Tudo precisa ter hora e data." Não é enfeite — sem idade,
 * **item parado é indistinguível de item recente**, e foi por isso que uma peça
 * ficou dias travada sem ninguém notar.
 *
 * Este arquivo trava as DUAS metades da regra, porque só a primeira é fácil:
 *
 *   1. todo estado da lista mostra quando aconteceu — absoluto E relativo;
 *   2. card SEM o campo no banco mostra "sem registro de quando" e **nenhuma
 *      data plausível**. Preencher o buraco é o erro caro desta frente.
 */

import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  AprovacoesDoCliente,
  type AprovacaoDoPortal,
  type DecisaoDaEsteira,
} from "@/components/portal/AprovacoesDoCliente";
import { SEM_CARIMBO } from "@/lib/carimbo-de-tempo";

function aprovacao(over: Partial<AprovacaoDoPortal> = {}): AprovacaoDoPortal {
  return {
    id: "ap1",
    department: "Social Media",
    status: "pending",
    createdAt: "2026-08-14T00:47:00.000Z", // 13/08 21:47 em São Paulo
    updatedAt: "2026-08-14T00:47:00.000Z",
    reviewedAt: null,
    reviewNote: "PRECISO CONFIRMAR: qual é o padrão das referências enviadas?",
    version: null,
    questionOpen: false,
    expiresAt: null,
    pecas: [],
    comments: [],
    ...over,
  };
}

function render(props: Partial<Parameters<typeof AprovacoesDoCliente>[0]> = {}): string {
  return renderToStaticMarkup(
    createElement(AprovacoesDoCliente, {
      aprovacoes: [],
      token: "t",
      abertaId: null,
      onAbrir: () => {},
      enviando: false,
      erro: null,
      onDecidir: async () => true,
      ...props,
    }),
  );
}

describe("cada estado da lista carrega quando aconteceu", () => {
  it("'aguardando você' ganha a data de quando entrou na fila", () => {
    const html = render({ aprovacoes: [aprovacao()] });
    expect(html).toContain("sem prazo — decida quando puder"); // continua sendo dito
    expect(html).toContain("aguardando você desde");
    expect(html).toContain("13/08/2026 às 21:47"); // a prova, com ANO e HORA
    expect(html).toMatch(/há \d+ (min|h|dia)/); // o alarme, colado
  });

  it("'material ainda não subiu' ganha a data da última movimentação", () => {
    const html = render({
      aprovacoes: [aprovacao({ department: "Analytics", reviewNote: null, semConteudo: true })],
    });
    expect(html).toContain("material ainda não subiu");
    expect(html).toContain("última movimentação");
    expect(html).toContain("13/08/2026 às 21:47");
  });

  it("'decidido em 14/08' vira o carimbo inteiro — com ano, hora e idade", () => {
    const html = render({
      aprovacoes: [aprovacao({ status: "approved", reviewedAt: "2026-08-15T00:47:00.000Z" })],
    });
    expect(html).toContain("decidido em");
    expect(html).toContain("14/08/2026 às 21:47");
    // O defeito exato que ele viu: dia sem hora e sem ano. Não pode voltar.
    expect(html).not.toMatch(/decidido em <\/?[^>]*>?14\/08(?!\/)/);
  });

  it("'1 entrega está pronta para você' ganha a idade da fila", () => {
    const decisao: DecisaoDaEsteira = {
      titulo: "1 entrega está pronta para você",
      descricao: "Nesta aprovação vão: Social Media.",
      rotulo: "Aprovar esta entrega",
      itens: ["Social Media"],
      naFilaDesde: "2026-08-14T00:47:00.000Z",
      decidir: async () => true,
    };
    const html = render({ decisaoDaEsteira: decisao });
    expect(html).toContain("Na sua fila desde");
    expect(html).toContain("13/08/2026 às 21:47");
  });

  it("todo carimbo é um <time> com dateTime e title — o carimbo exato no hover", () => {
    const html = render({ aprovacoes: [aprovacao()] });
    expect(html).toMatch(/<time dateTime="2026-08-14T00:47:00\.000Z"/i);
    expect(html).toMatch(/title="aguardando você desde 13\/08\/2026 às 21:47 · há [^"]+"/);
  });
});

describe("o que o banco não tem, a tela NÃO inventa", () => {
  it("card sem createdAt diz 'sem registro de quando' — não a data de hoje", () => {
    const html = render({ aprovacoes: [aprovacao({ createdAt: null, updatedAt: null })] });
    expect(html).toContain(SEM_CARIMBO);

    // A trava de verdade: nenhuma data de HOJE aparece na tela. Se alguém
    // "resolver" a ausência com `?? new Date()`, este teste cai na hora.
    const hoje = new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric",
    }).format(new Date());
    expect(html).not.toContain(hoje);
  });

  it("pacote sem naFilaDesde não ganha data plausível", () => {
    const html = render({
      decisaoDaEsteira: {
        titulo: "1 entrega está pronta para você",
        descricao: "Nesta aprovação vão: Social Media.",
        rotulo: "Aprovar esta entrega",
        itens: ["Social Media"],
        decidir: async () => true,
      },
    });
    expect(html).toContain("Sem registro de quando isto entrou na sua fila");
    expect(html).not.toMatch(/\d{2}\/\d{2}\/\d{4}/);
  });

  it("a ausência é EXPLICADA no title, não escondida", () => {
    const html = render({ aprovacoes: [aprovacao({ createdAt: null, updatedAt: null })] });
    expect(html).toContain("Nada foi estimado.");
  });
});

// A FAIXA NO TOPO DO PAINEL — o que ela pode custar, e o que ela nunca pode perder.
//
// 16/08/2026. O CEO relatou "uma faixa branca no topo atrapalhando toda a
// interface". A rodada anterior mediu `/briefing`, `/auth/signin`, `/vitrine` e o
// painel DESLOGADO — e não achou nada, porque o defeito não mora em nenhum
// desses. Ele mora no **painel da agência LOGADO no celular**, que é onde o CEO
// passa o dia, e onde `AgencyShell` monta `AgencyTopBar` em TODA rota.
//
// Medido a 375×600, autenticado, lendo o pixel real em x=340 (longe do botão e
// do logo), em `/agency/dashboard`, `/agency/clients`, `/agency/leads` e
// `/agency/pipeline` — as quatro deram o MESMO retrato:
//
//     y0–50   rgb(247,248,250)   a barra
//     y51     rgb(230,233,238)   a borda
//     y52–68  rgb(247,248,250)   o respiro
//
// A barra tinha a cor EXATA do fundo da página (`--bg` nos dois lados). Não lia
// como cabeçalho: lia como 68px de página vazia cortada por um risco solto —
// 11% de uma tela de 600px, para carregar um botão de 36px e o logo.
//
// ─── AS DUAS METADES ─────────────────────────────────────────────────────────
//
// Apagar a barra fecharia o relato do CEO e reabriria o incidente que a criou:
// sem ela o celular perde a única entrada da navegação, e o botão flutuante que
// existia antes cortava a linha do texto ao rolar ("econciliar telas dos
// carrosséis"). Então o teste tem de provar as duas coisas ao mesmo tempo:
//
//   ⛔ barra: NÃO custa mais do que aquilo que mora dentro dela, e não pinta
//      superfície quando não há nada para cobrir;
//   ✅ caso limpo: a navegação continua lá, a reserva de espaço continua de pé,
//      e no instante em que há conteúdo por baixo a superfície opaca volta.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { superficieDaBarra } from "@/components/agency/layout/AgencyTopBar";

const CSS = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
const BARRA = readFileSync(
  join(process.cwd(), "components/agency/layout/AgencyTopBar.tsx"),
  "utf8",
);
const CASCA = readFileSync(
  join(process.cwd(), "components/agency/layout/AgencyShell.tsx"),
  "utf8",
);

/** Lê `--nome: <valor>rem` do bloco `.agency-shell` e devolve em px. */
function remDoShell(nome: string): number {
  const bloco = CSS.slice(CSS.indexOf(".agency-shell {"));
  const m = bloco.match(new RegExp(`--${nome}:\\s*([\\d.]+)rem`));
  if (!m) throw new Error(`--${nome} não encontrada em .agency-shell`);
  return parseFloat(m[1]) * 16;
}

describe("⛔ a barra não custa mais do que o que mora dentro dela", () => {
  // O que a barra carrega, medido no navegador: BUTTON 36×36 e o logo 71×18.
  const BOTAO_PX = 36;

  it("a altura declarada é a do botão + folga, não a régua da sidebar do desktop", () => {
    const altura = remDoShell("barra-altura");
    expect(altura).toBeGreaterThanOrEqual(BOTAO_PX);
    // 52px era o "topo da sidebar" — régua de DESKTOP, onde a sidebar aparece.
    // No celular a sidebar não existe, e a barra herdava a altura dela.
    expect(altura).toBeLessThan(52);
  });

  it("a faixa reservada acima do conteúdo cabe em 60px — eram 68px", () => {
    const reserva = remDoShell("barra-altura") + remDoShell("barra-respiro");
    expect(reserva).toBeLessThanOrEqual(60);
  });

  it("em repouso a barra não pinta fundo nem borda — não há o que cobrir", () => {
    const emRepouso = superficieDaBarra(false);
    expect(emRepouso).toContain("bg-transparent");
    expect(emRepouso).toContain("border-transparent");
    // O risco solto sobre a página era o artefato visível do defeito.
    expect(emRepouso).not.toContain("border-[var(--border)]");
  });
});

describe("✅ o caso limpo: nada do que a barra protege foi perdido", () => {
  it("ROLANDO, a superfície opaca volta INTEIRA — é para isso que ela existe", () => {
    const rolando = superficieDaBarra(true);
    expect(rolando).toContain("bg-[var(--bg)]");
    expect(rolando).toContain("border-[var(--border)]");
    expect(rolando).not.toContain("bg-transparent");
  });

  it("a reserva de espaço é CSS e NÃO depende do estado de rolagem", () => {
    // Esta é a metade que impede o conserto de reabrir o incidente: se a reserva
    // dependesse de `rolado`, ficar transparente no topo poria conteúdo embaixo
    // da barra. Ela sai de `--barra-espaco`, que não conhece rolagem nenhuma.
    expect(CSS).toMatch(/\.agency-conteudo\s*\{[^}]*padding-top:\s*calc\(var\(--barra-espaco\)\s*\+\s*var\(--barra-respiro\)\)/);
    expect(CSS).toMatch(/--barra-espaco:\s*calc\(var\(--barra-altura\)\s*\+\s*var\(--barra-safe\)\)/);
    expect(BARRA).not.toMatch(/rolado[^\n]*padding-top|padding-top[^\n]*rolado/);
  });

  it("a barra continua sendo a ÚNICA entrada da navegação no celular", () => {
    expect(BARRA).toContain('aria-label="Abrir menu"');
    expect(BARRA).toContain("aria-controls={navId}");
    expect(BARRA).toContain("aria-expanded={aberto}");
    expect(BARRA).toContain("onClick={onAbrir}");
    // Apagá-la da casca deixaria o celular sem como abrir a gaveta.
    expect(CASCA).toContain("<AgencyTopBar");
  });

  it("continua barra de largura total, não o botão solto que cortava a linha", () => {
    expect(BARRA).toContain("fixed inset-x-0 top-0");
    expect(BARRA).toContain("md:hidden");
  });

  it("a altura da barra sai da MESMA variável que a reserva — nunca dessincronizam", () => {
    expect(CSS).toMatch(/\.agency-barra-topo\s*\{[^}]*height:\s*var\(--barra-espaco\)/);
    // Altura fixada à mão no componente é como as duas saem de sincronia.
    expect(BARRA).not.toMatch(/className="[^"]*\bh-\[/);
  });

  it("a safe-area do iOS continua respeitada", () => {
    expect(CSS).toMatch(/--barra-safe:\s*env\(safe-area-inset-top/);
    expect(CSS).toMatch(/\.agency-barra-topo\s*\{[^}]*padding-top:\s*var\(--barra-safe\)/);
  });
});

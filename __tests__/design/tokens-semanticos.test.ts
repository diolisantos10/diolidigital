// OS PARES SEMÂNTICOS PASSAM AA — medido, não estimado.
//
// ── POR QUE ESTE ARQUIVO NASCEU EM 16/08/2026 ───────────────────────────────
//
// O selo "3º briefing deste mesmo contato" da tela `/agency/leads` saiu de
// `--warning` para `--info`: repetição não é erro do cliente, e âmbar nesta casa
// quer dizer "algo saiu do trilho". Ao fazer a troca, achou-se o furo:
//
//   `--success`, `--warning` e `--danger` carregam, no próprio `globals.css`, a
//   razão de contraste medida em 05/08/2026. **`--info` e `--info-bg` não
//   carregam nenhuma** — o par entrou no sistema sem ninguém medir.
//
// Mover um selo para um par não medido seria trocar um problema de significado
// por um problema de legibilidade. Como comentário em CSS não roda, a medição
// vira teste: quem escurecer um tint ou clarear uma tinta reprova aqui, e não
// numa tela de cliente.
//
// A conta é a da WCAG 2.1 (luminância relativa + (L1+0.05)/(L2+0.05)), e o piso
// é 4.5:1 porque estes tokens pintam TEXTO — e, nas listas desta casa, o texto
// mais curto e mais importante: os selos de estado.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");

/** Lê um token do `:root`. Falha alto se ele sumir — token some em refactor. */
function token(nome: string): string {
  // Só o primeiro bloco importa: o `:root` claro vem antes do tema escuro.
  const m = new RegExp(`--${nome}:\\s*(#[0-9A-Fa-f]{6})`).exec(css);
  if (!m) throw new Error(`token --${nome} não existe mais em app/globals.css`);
  return m[1]!.toUpperCase();
}

/** Luminância relativa da WCAG. */
function luminanciaRelativa(hex: string): number {
  const canal = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const r = canal(parseInt(hex.slice(1, 3), 16));
  const g = canal(parseInt(hex.slice(3, 5), 16));
  const b = canal(parseInt(hex.slice(5, 7), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contraste(a: string, b: string): number {
  const la = luminanciaRelativa(a);
  const lb = luminanciaRelativa(b);
  const [claro, escuro] = la > lb ? [la, lb] : [lb, la];
  return (claro + 0.05) / (escuro + 0.05);
}

const PISO_AA = 4.5;

describe("os pares semânticos passam AA sobre o próprio tint", () => {
  // O selo é `text-[var(--X)]` sobre `bg-[var(--X-bg)]`: é ESTA combinação que
  // o olho enxerga, e é a que mais falha — foi assim que os tons anteriores
  // (#16A34A a 3.00:1, #D97706 a 2.86:1) reprovavam justamente nos selos.
  it.each([["success"], ["warning"], ["danger"], ["info"]])(
    "--%s sobre --%s-bg",
    (nome) => {
      const razao = contraste(token(nome), token(`${nome}-bg`));
      expect(razao).toBeGreaterThanOrEqual(PISO_AA);
    },
  );

  it("--info entrou no sistema sem medição, e agora está medido", () => {
    // O número exato, fixado: 4.75:1 de #2563EB sobre #EFF6FF. Se alguém mexer
    // no par, este teste diz em quanto ficou, não só que reprovou.
    const razao = contraste(token("info"), token("info-bg"));
    expect(razao).toBeGreaterThanOrEqual(PISO_AA);
    expect(razao).toBeCloseTo(4.75, 1);
  });
});

describe("os mesmos pares continuam legíveis sobre as superfícies da casa", () => {
  // O selo mora dentro de um cartão branco, e a tela mora sobre o off-white.
  // Um tint escuro demais passaria no teste de cima e sumiria aqui.
  it.each([["success"], ["warning"], ["danger"], ["info"]])(
    "--%s sobre --card e sobre --bg",
    (nome) => {
      expect(contraste(token(nome), token("card"))).toBeGreaterThanOrEqual(PISO_AA);
      expect(contraste(token(nome), token("bg"))).toBeGreaterThanOrEqual(PISO_AA);
    },
  );
});

describe("⛔ a metade cara: a régua reprova o que era reprovado de verdade", () => {
  // Sem isto, uma conta errada que devolvesse "10" para tudo passaria nos
  // testes acima e não protegeria nada. Os dois valores são os tons REAIS que
  // esta casa usou e trocou em 05/08/2026, com as razões registradas no CSS.
  it("os tons antigos, que reprovavam nos selos, continuam reprovando", () => {
    expect(contraste("#16A34A", token("success-bg"))).toBeLessThan(PISO_AA);
    expect(contraste("#D97706", token("warning-bg"))).toBeLessThan(PISO_AA);
  });

  it("branco sobre branco é 1:1 e preto sobre branco é 21:1", () => {
    expect(contraste("#FFFFFF", "#FFFFFF")).toBeCloseTo(1, 2);
    expect(contraste("#000000", "#FFFFFF")).toBeCloseTo(21, 1);
  });
});

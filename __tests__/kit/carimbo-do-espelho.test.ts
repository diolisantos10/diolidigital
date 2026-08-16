// O CARIMBO DO ESPELHO NÃO PODE MENTIR.
//
// `docs/kit/ESPELHO.json` ficou 7 dias parado (medido em 16/08/2026) sem
// nada na pasta que denunciasse o atraso — o `CLAUDE.md` já admitia em prosa
// que as doutrinas 25 a 29 não estavam espelhadas, mas prosa não se atualiza
// sozinha. `scripts/espelhar-kit.mts` resolve isso gerando
// `docs/kit/LEIA-PRIMEIRO.md` a partir do `ESPELHO.json` — este teste é o que
// garante que o gerado continua honesto sobre o gerador.
//
// ── AS DUAS METADES DESTE TESTE ─────────────────────────────────────────────
// 1. ⛔ REPROVA se `ESPELHO.json` não tiver os campos que fazem o robô
//    denunciar a própria falha (`ultimaTentativaEm`, `ultimoErro`, `estado`),
//    e reprova se `LEIA-PRIMEIRO.md` contar uma data ou um estado diferente
//    do que `ESPELHO.json` registra — aviso que diz uma coisa e carimbo que
//    diz outra é pior que aviso nenhum.
// 2. ✅ NÃO REPROVA por o espelho estar velho. Isto é deliberado: um teste
//    que fica vermelho por idade quebraria o CI de todo mundo e bloquearia
//    deploy por causa de um documento — proteção mais destrutiva que o
//    problema, que esta casa não aceita (ver CLAUDE.md, guardrail 5 do kit).
//    O teste garante que o carimbo DIZ A VERDADE, não que ele está fresco.

import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const RAIZ = resolve(__dirname, "..", "..");
const CAMINHO_ESPELHO_JSON = resolve(RAIZ, "docs", "kit", "ESPELHO.json");
const CAMINHO_LEIA_PRIMEIRO = resolve(RAIZ, "docs", "kit", "LEIA-PRIMEIRO.md");

const ESTADOS_VALIDOS = ["em-dia", "falhou", "nunca-rodou"] as const;

function lerEspelhoJson(): Record<string, unknown> {
  expect(existsSync(CAMINHO_ESPELHO_JSON), "docs/kit/ESPELHO.json precisa existir").toBe(true);
  return JSON.parse(readFileSync(CAMINHO_ESPELHO_JSON, "utf8"));
}

function lerLeiaPrimeiro(): string {
  expect(existsSync(CAMINHO_LEIA_PRIMEIRO), "docs/kit/LEIA-PRIMEIRO.md precisa existir — o aviso é obrigatório, gerado, dentro da pasta").toBe(true);
  return readFileSync(CAMINHO_LEIA_PRIMEIRO, "utf8");
}

describe("docs/kit/ESPELHO.json — os campos que fazem o robô não mentir", () => {
  it("tem os campos originais", () => {
    const json = lerEspelhoJson();
    expect(typeof json.origem).toBe("string");
    expect(typeof json.kitCommit).toBe("string");
    expect(typeof json.espelhadoEm).toBe("string");
    expect(typeof json.arquivos).toBe("object");
    expect(json.arquivos).not.toBeNull();
  });

  it("tem os campos novos: ultimaTentativaEm, ultimoErro, estado", () => {
    const json = lerEspelhoJson();

    // As chaves precisam EXISTIR — mesmo quando o valor é null, porque
    // "nunca tentou" é um estado válido e diferente de "o campo não existe".
    expect(Object.prototype.hasOwnProperty.call(json, "ultimaTentativaEm")).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(json, "ultimoErro")).toBe(true);

    expect(json.ultimaTentativaEm === null || typeof json.ultimaTentativaEm === "string").toBe(true);
    expect(json.ultimoErro === null || typeof json.ultimoErro === "string").toBe(true);

    expect(ESTADOS_VALIDOS).toContain(json.estado);
  });

  it("estado 'falhou' vem sempre acompanhado de ultimoErro preenchido", () => {
    // Um "falhou" com ultimoErro null seria o mesmo silêncio de antes, só que
    // com um novo campo decorativo em cima.
    const json = lerEspelhoJson();
    if (json.estado === "falhou") {
      expect(typeof json.ultimoErro).toBe("string");
      expect((json.ultimoErro as string).length).toBeGreaterThan(0);
    }
  });
});

describe("docs/kit/LEIA-PRIMEIRO.md — o gerado não pode divergir do gerador", () => {
  it("é marcado como gerado, não escrito à mão", () => {
    const texto = lerLeiaPrimeiro();
    expect(texto).toMatch(/GERADO POR scripts\/espelhar-kit\.mts/);
    expect(texto).toMatch(/NÃO EDITE À MÃO/);
  });

  it("cita o mesmo espelhadoEm que ESPELHO.json registra", () => {
    const json = lerEspelhoJson();
    const texto = lerLeiaPrimeiro();
    const espelhadoEm = json.espelhadoEm as string;

    if (espelhadoEm) {
      expect(texto).toContain(espelhadoEm);
    } else {
      // Nunca carimbado com sucesso: o aviso precisa dizer isso, não uma
      // data inventada.
      expect(texto).toMatch(/[Nn]unca foi carimbado/);
    }
  });

  it("cita o mesmo estado que ESPELHO.json registra", () => {
    const json = lerEspelhoJson();
    const texto = lerLeiaPrimeiro();
    expect(texto).toContain(`\`${json.estado as string}\``);
  });

  it("conta a mesma história de ultimaTentativaEm/ultimoErro que ESPELHO.json registra", () => {
    const json = lerEspelhoJson();
    const texto = lerLeiaPrimeiro();

    if (!json.ultimaTentativaEm) {
      expect(texto).toMatch(/nunca rodou/);
    } else if (json.estado === "falhou") {
      expect(texto).toContain(json.ultimaTentativaEm as string);
      expect(texto).toContain("FALHOU");
      if (json.ultimoErro) expect(texto).toContain(json.ultimoErro as string);
    } else {
      expect(texto).toContain(json.ultimaTentativaEm as string);
    }
  });

  it("avisa que doutrina ausente não significa doutrina inexistente", () => {
    // A frase que mais importa do documento — sem ela o aviso vira só uma
    // data, e uma data sem essa frase deixa quem lê concluir "ok, está tudo
    // aqui" exatamente quando NÃO está.
    const texto = lerLeiaPrimeiro();
    expect(texto).toMatch(/doutrina ausente aqui NÃO significa doutrina inexistente/i);
  });

  it("diz onde conferir a idade sem depender de memória", () => {
    const texto = lerLeiaPrimeiro();
    expect(texto).toContain("npm run kit:carimbo");
  });

  // ── DELIBERADAMENTE AUSENTE: nenhum teste aqui reprova por idade. ─────────
  // Um `expect(dias).toBeLessThan(N)` transformaria "o kit está desatualizado"
  // em "o CI está vermelho" — e CI vermelho por um documento é a proteção mais
  // destrutiva que o problema que ela evita (guardrail 5 do dioli-brain-kit).
  // O papel deste arquivo é garantir que a idade REAL apareça corretamente
  // quando alguém olhar — não impedir que o tempo passe.
});

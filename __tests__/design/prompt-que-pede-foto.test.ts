// O PROMPT PEDE FOTOGRAFIA — e para de pedir a ilustração que ele reprovava.
//
// ── O DEFEITO, MEDIDO EM 15/08/2026 ─────────────────────────────────────────
//
// Direção de arte religada, portão do pixel em produção, CityJobs: 6 tentativas,
// 2 fotos, 4 reprovadas por "paleta de ilustração, não fotografia" (101, 178,
// 244 e 432 cores distintas; piso 600). A casa pagava US$ 0,167 por vez para
// ser reprovada pela própria regra.
//
// A causa não estava no portão. Estava no PEDIDO:
//
//   • `repertorio-registrado.ts:305` mandava ao GERADOR DE IMAGEM "nenhuma cor
//     fora de #0D2B4D · #FFFFFF · #16A34A · #FFD24D". Medido com `medirFundo`
//     de verdade: o mesmo sinal fotográfico com o croma preso cai de 2.844 para
//     462 cores — REPROVA. `artes.ts` reforçava com dois hex a mais.
//   • "terço inferior … superfície lisa" consumia 0,330 dos 0,45 de teto de cor
//     dominante (73%) antes de a cena existir.
//   • a última frase do prompt proibia "placa ou etiqueta". Rua de comércio sem
//     placa não existe: a saída que viola menos regras é estilizar.
//   • a direção de arte ocupava 110 de 3.158 caracteres (3,5%), na posição 188;
//     a amplitude ocupava 2.295 (72,7%), com 3 blocos "NUNCA:".
//
// Nenhum limiar de portão foi tocado. O que mudou foi a string.

import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db/client", () => ({ prisma: {} }));

import { cerebroDaMarca } from "@/lib/agency/design/repertorio-registrado";
import { direcaoDeAmplitude, regrasDeOutraCamada, camadaDaRegra } from "@/lib/agency/design/repertorio";
import { montarPrompt } from "@/lib/agency/execution/artes";

const MARCAS = ["CityJobs", "Foocci", "Dioli"];

const DIRECAO =
  "Plataforma da estação da CPTM em Mogi das Cruzes no fim da tarde, com passageiros " +
  "descendo do trem, luz baixa e a fachada da estação ao fundo.";

function promptDe(marca: string): string {
  const cerebro = cerebroDaMarca(marca);
  return montarPrompt({
    legenda: "A vaga que você procura pode ser aqui do lado.",
    direcaoDeArte: DIRECAO,
    pilar: "Bastidor da região",
    negocio: marca,
    segmento: "plataforma de vagas",
    cores: ["#0D2B4D", "#16A34A"],
    tom: "prático",
    formato: "feed",
    amplitude: direcaoDeAmplitude(cerebro),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. A CAMADA CERTA — a regra de cor e de letra sai do pedido de IMAGEM
// ─────────────────────────────────────────────────────────────────────────────

describe("cada regra da marca vai para a camada que a executa", () => {
  it("a linha do hex é classificada como COR, e some do prompt da foto", () => {
    const regra = "paleta creme ou qualquer cor fora de #0D2B4D · #FFFFFF · #16A34A · #FFD24D";
    expect(camadaDaRegra(regra)).toBe("cor");
    expect(direcaoDeAmplitude(cerebroDaMarca("CityJobs"))).not.toContain(regra);
  });

  it("a linha da tipografia é classificada como TIPOGRAFIA, e some do prompt da foto", () => {
    const regra = "tipografia serifada de display (o manual da marca é sans: Arial Black / Arial / Helvetica)";
    expect(camadaDaRegra(regra)).toBe("tipografia");
    expect(direcaoDeAmplitude(cerebroDaMarca("CityJobs"))).not.toContain(regra);
  });

  it("as regras de COPY ficam com o texto, que é onde a trava de texto fecha", () => {
    expect(camadaDaRegra("promessa de contratação, 'emprego garantido' ou linguagem sensacionalista")).toBe("copy");
    expect(camadaDaRegra("salário, número de vagas ou nome de empresa dentro dos pixels")).toBe("copy");
  });

  it("regra de CENA continua sendo de cena — o filtro não engoliu a direção da marca", () => {
    for (const regra of [
      "estética de escritório de tecnologia — coworking, tablet, mármore, café",
      "clichê de contratação: currículo na mão, gravata, confete, comemoração de contratado",
      "banco de imagem genérico sem relação com a região",
      "cena estéril de banco de imagem, sem lugar reconhecível",
      "assunto subexposto, indistinguível do fundo",
    ]) {
      expect(camadaDaRegra(regra)).toBe("cena");
    }
  });

  it("o que a marca não classificou continua indo ao gerador — o default é frouxo", () => {
    // Errar mandando demais custa ruído; errar calando uma regra do cliente
    // custa a regra. O default é `cena` de propósito.
    expect(camadaDaRegra("nada de mesa de mármore")).toBe("cena");
    expect(camadaDaRegra("")).toBe("cena");
  });

  it("NENHUMA regra de outra camada reaparece no prompt de imagem, em marca nenhuma", () => {
    for (const marca of MARCAS) {
      const prompt = promptDe(marca);
      for (const { regra } of regrasDeOutraCamada(cerebroDaMarca(marca))) {
        expect(prompt, `${marca}: "${regra}" voltou ao prompt da foto`).not.toContain(regra);
      }
    }
  });

  it("NENHUM hex chega ao gerador de imagem — é a linha que derrubava o portão", () => {
    for (const marca of MARCAS) {
      expect(promptDe(marca), marca).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    }
    // Nem quando a marca tem paleta declarada: a paleta entra no molde HTML.
    expect(promptDe("CityJobs")).not.toContain("#0D2B4D");
  });

  it("a paleta não some em silêncio: o prompt diz que ela é aplicada depois", () => {
    expect(promptDe("CityJobs")).toMatch(/paleta da marca NÃO é aplicada na foto/i);
  });

  it("eixo cujas proibições são TODAS de outra camada não vai ao gerador", () => {
    // "temperatura editorial" da Dioli é eixo de COPY: previsão com número e
    // promessa a partir de notícia de terceiro. Nada disso é câmera.
    expect(direcaoDeAmplitude(cerebroDaMarca("Dioli"))).toBe("");
    expect(regrasDeOutraCamada(cerebroDaMarca("Dioli")).length).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. A DIREÇÃO VEM ANTES DA PROIBIÇÃO
// ─────────────────────────────────────────────────────────────────────────────

describe("a ordem do pedido", () => {
  it("a cena aparece antes de qualquer NUNCA e antes da frase de texto", () => {
    const p = promptDe("CityJobs");
    const posCena = p.indexOf("Cena a retratar:");
    expect(posCena).toBeGreaterThan(-1);
    expect(posCena).toBeLessThan(p.indexOf("NUNCA:"));
    expect(posCena).toBeLessThan(p.indexOf("SEM TEXTO LEGÍVEL"));
    expect(posCena).toBeLessThan(p.indexOf("COMPOSIÇÃO:"));
    // E ela está na abertura, não no meio: antes era a posição 166 com esta
    // mesma entrada.
    expect(posCena).toBeLessThan(120);
  });

  it("o pedido encolheu e a amplitude parou de ser dois terços dele", () => {
    const amp = direcaoDeAmplitude(cerebroDaMarca("CityJobs"));
    // 2.295 antes.
    expect(amp.length).toBeLessThan(1400);
    const p = promptDe("CityJobs");
    // 3.199 antes, com esta mesma entrada.
    expect(p.length).toBeLessThan(2800);
    // 72,7% antes; 51,5% agora. O que sobra é direção de CENA de verdade — os
    // extremos e as proibições fotográficas que o CEO ditou em 13/08 — e cortar
    // mais seria cortar regra da marca, não gordura.
    expect(amp.length / p.length).toBeLessThan(0.55);
  });

  it("o `porque` de cada eixo não vai ao gerador — é justificativa, não instrução", () => {
    const amp = direcaoDeAmplitude(cerebroDaMarca("CityJobs"));
    expect(amp).not.toContain("quem procura emprego alterna entre a tarefa");
    expect(amp).not.toContain("cidade sem gente vira cartão-postal de prefeitura");
    // Mas a regra que ele justificava continua lá.
    expect(amp).toContain("banco de imagem genérico sem relação com a região");
    expect(amp).toMatch(/o que a imagem tem de provar/);
    expect(amp).toMatch(/os extremos são PERMITIDOS e propositais/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. O QUE NÃO PODE AFROUXAR
// ─────────────────────────────────────────────────────────────────────────────
//
// A proibição de letra tem razão registrada (`artes.ts`, cabeçalho): preço,
// telefone e prazo dentro de um pixel escapam do piso de verdade, que lê texto
// e não enxerga imagem. Ela MUDA DE FORMA; ela não some.

describe("a proibição de letra muda de forma e não afrouxa", () => {
  it("o prompt continua proibindo o que é perigoso: preço, telefone, número, logotipo", () => {
    const p = promptDe("CityJobs");
    expect(p).toMatch(/SEM TEXTO LEGÍVEL/);
    for (const perigo of ["palavra", "número", "preço", "telefone", "data", "logotipo"]) {
      expect(p, perigo).toContain(perigo);
    }
    expect(p).toMatch(/nada que dê para LER na imagem/);
  });

  it("o que ela deixa de proibir é só o cenário real ilegível", () => {
    const p = promptDe("CityJobs");
    // Rua de comércio sem placa não existe. Placa distante e desfocada não
    // afirma fato nenhum — e é isso que o piso de verdade protege.
    expect(p).toMatch(/só ao longe e desfocados/);
  });

  it("a segunda trava continua embaixo: nada vira pixel sem passar pela trava de texto", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const fonte = readFileSync(join(__dirname, "..", "..", "lib/agency/execution/artes.ts"), "utf8");
    expect(fonte).toContain('from "@/lib/agency/design/trava-de-texto"');
  });

  it("a chapa lisa saiu, o espaço do título ficou", () => {
    const p = promptDe("CityJobs");
    // "superfície lisa" sozinha consumia 73% do teto de cor dominante.
    expect(p).not.toMatch(/superf[íi]cie lisa/i);
    expect(p).toMatch(/terço INFERIOR/);
    expect(p).toMatch(/reservado para a tipografia/);
  });

  it("o prompt pede fotografia com as palavras da fotografia", () => {
    const p = promptDe("CityJobs");
    expect(p).toMatch(/Fotografia real, feita com câmera/);
    expect(p).toMatch(/NÃO é ilustração/);
    expect(p).toMatch(/NÃO é arte vetorial/);
    // "publicitária" saiu: é o gênero em que ilustração vetorial é resposta
    // legítima, e era a primeira palavra do pedido.
    expect(p).not.toMatch(/publicit[áa]ria/i);
  });
});

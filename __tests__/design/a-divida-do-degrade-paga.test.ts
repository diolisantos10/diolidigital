// A DÍVIDA DO DEGRADÊ, PAGA — sobre as 14 peças vivas (Fase 2, 27/08/2026).
//
// ═══ O QUE A FASE 1 DEIXOU ESCRITO ══════════════════════════════════════════
//
// `regua-da-peca-final.ts` promete, por escrito, pegar *"o degradê da cor da
// marca"*. A Fase 1 mediu que **não pegava**, e declarou por que não consertou:
//
//   "das 12 peças vivas que calibraram os pisos, esta árvore guarda UMA.
//    Calibrar um piso novo sobre uma amostra de um é exatamente como se inventa
//    uma régua que reprova a casa inteira."
//
// A dívida era: guardar as peças e recalibrar. Ela está paga. As peças reais de
// produção foram baixadas para `docs/entregas/pecas-vivas-27-08/` (14, não 12 —
// é o estoque inteiro com arte no ar em 27/08/2026), e a recalibração foi feita
// contra o degradê construído sobre **cada uma delas**.
//
// ═══ O QUE A AMOSTRA RESPONDEU — E NÃO FOI O QUE SE ESPERAVA ════════════════
//
// A Fase 1 procurou o conserto na TEXTURA e parou no número certo: 2× de
// separação não sustenta piso. O degradê, porém, é vazio de COR antes de ser
// vazio de textura, e nesse eixo a separação é melhor:
//
//   • CORES:   pior peça real 159 · pior degradê 52 → 3,06×
//   • textura: pior peça real 0,0066 · pior degradê 0,0033 → 2,00×
//
// A tentativa foi feita: `PISO_DE_CORES_NA_FOTO = 90`, a média geométrica.
// **A própria régua desta casa recusou.** O teste irmão "a separação é de ORDEM
// DE GRANDEZA, não 'por pouco'" exige `pior peça real > PISO × 5`, e não existe
// piso acima de 52 que deixe 159 cinco vezes acima. A separação TOTAL é 3,06×.
//
// Então a dívida NÃO se fecha subindo piso — e agora isso é um fato medido
// sobre 14 amostras, não uma suspeita sobre uma. **A dívida muda de forma:**
// não é mais "faltam as peças", é "falta um discriminador de alta margem".
//
// Este arquivo congela os DOIS lados da fronteira com número, para que o dia em
// que ela mudar seja um dia em que alguém é avisado.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { medirPecaFinal } from "@/lib/agency/design/medir-peca-final";
import {
  reguaDoPixelDaPecaFinal,
  PISO_DE_CORES_NA_FOTO,
  PISO_DE_TEXTURA_NA_FOTO,
} from "@/lib/agency/design/regua-da-peca-final";

const PASTA = join(process.cwd(), "docs/entregas/pecas-vivas-27-08");
const PECAS = readdirSync(PASTA).filter((f) => f.endsWith(".jpg")).sort();

/** O degradê "bonito e vazio" da Fase 1, na faixa da foto (35%..80%) — a mesma
 *  fabricação, agora aplicada sobre CADA peça real em vez de sobre uma só. */
async function comDegradeNaFaixaDaFoto(bytes: Buffer): Promise<Buffer> {
  const { default: sharp } = await import("sharp");
  const meta = await sharp(bytes).metadata();
  const L = meta.width!, A = meta.height!;
  const topo = Math.round(A * 0.35);
  const alt = Math.round(A * 0.8) - topo;
  const px = Buffer.alloc(L * alt * 3);
  for (let y = 0; y < alt; y++) {
    for (let x = 0; x < L; x++) {
      const i = (y * L + x) * 3;
      px[i] = Math.round(40 + (180 * y) / alt);
      px[i + 1] = Math.round(30 + (150 * y) / alt);
      px[i + 2] = Math.round(60 + (120 * y) / alt);
    }
  }
  const faixa = await sharp(px, { raw: { width: L, height: alt, channels: 3 } }).png().toBuffer();
  return sharp(bytes).composite([{ input: faixa, top: topo, left: 0 }]).jpeg({ quality: 92 }).toBuffer();
}

describe("a amostra existe — sem ela nada aqui vale", () => {
  it("a árvore guarda as peças vivas, e são mais que uma", () => {
    // Esta é a dívida em si. Se alguém apagar a pasta, é ESTA linha que cai —
    // e não um piso passando a mentir em silêncio.
    expect(PECAS.length).toBeGreaterThanOrEqual(12);
  });
});

describe("🟢 O SENTIDO QUE IMPORTA — nenhuma peça real é reprovada pelo piso novo", () => {
  for (const arq of PECAS) {
    it(`APROVA a peça real «${arq}»`, async () => {
      const m = await medirPecaFinal(readFileSync(join(PASTA, arq)));
      expect(m, "a peça real nem decodificou").not.toBeNull();
      const v = reguaDoPixelDaPecaFinal(m!);
      expect(
        v.ok,
        `a régua REPROVOU uma peça REAL de produção — cores ${m!.coresNaFaixaDaFoto} ` +
          `(piso ${PISO_DE_CORES_NA_FOTO}), textura ${m!.texturaNaFaixaDaFoto.toFixed(4)}. ` +
          "Piso rente ao caso conhecido é piso que a casa desliga.",
      ).toBe(true);
    });
  }
});

describe("🔴 A DÍVIDA QUE CONTINUA — o degradê passa, agora medido sobre TODAS", () => {
  // A Fase 1 declarou isto sobre UMA peça. Aqui está sobre catorze: não foi
  // acaso da amostra, é a régua mesmo. Se um dia um destes ficar vermelho, a
  // promessa do cabeçalho passou a se cumprir e este bloco tem de ser movido
  // para a lista de mutantes REPROVADOS.
  for (const arq of PECAS) {
    it(`DÍVIDA: o degradê sobre «${arq}» ainda PASSA`, async () => {
      const m = await medirPecaFinal(await comDegradeNaFaixaDaFoto(readFileSync(join(PASTA, arq))));
      expect(m).not.toBeNull();
      const v = reguaDoPixelDaPecaFinal(m!);
      expect(
        v.ok,
        `A DÍVIDA FOI PAGA sobre «${arq}» — cores ${m!.coresNaFaixaDaFoto} ` +
          `(piso ${PISO_DE_CORES_NA_FOTO}), textura ${m!.texturaNaFaixaDaFoto.toFixed(4)}. ` +
          "Mova este caso para a lista de mutantes reprovados.",
      ).toBe(true);
    });
  }
});

describe("A FRONTEIRA, congelada com número — sobre a amostra inteira", () => {
  it("a separação por COR é maior que a separação por TEXTURA — é por isso que o eixo mudou", async () => {
    const reais: number[] = [], degrades: number[] = [];
    const texReais: number[] = [], texDeg: number[] = [];
    for (const arq of PECAS) {
      const b = readFileSync(join(PASTA, arq));
      const r = (await medirPecaFinal(b))!;
      const d = (await medirPecaFinal(await comDegradeNaFaixaDaFoto(b)))!;
      reais.push(r.coresNaFaixaDaFoto); degrades.push(d.coresNaFaixaDaFoto);
      texReais.push(r.texturaNaFaixaDaFoto); texDeg.push(d.texturaNaFaixaDaFoto);
    }
    const piorReal = Math.min(...reais), piorDeg = Math.max(...degrades);
    const sepCor = piorReal / piorDeg;
    const sepTex = Math.min(...texReais) / Math.max(...texDeg);
    const nums = `cor: ${piorReal} vs ${piorDeg} = ${sepCor.toFixed(2)}× · textura: ${sepTex.toFixed(2)}×`;

    // A COR é o melhor eixo dos dois — este é o achado da recalibração.
    expect(sepCor, nums).toBeGreaterThan(sepTex);
    // E MESMO ASSIM ela não chega. O corrimão da casa exige 5× entre a pior
    // peça real e o piso; para pegar o degradê o piso teria de passar de 52, e
    // 52 × 5 = 260 > 159. Não existe piso que satisfaça os dois.
    // É ESTA linha que segura o conserto apressado — com aritmética, não com
    // opinião. No dia em que a separação virar 5×, ela fica vermelha e cobra.
    expect(sepCor, `${nums} — a separação chegou a 5×: o piso de cores PODE subir agora`).toBeLessThan(5);
    expect(piorDeg * 5, nums).toBeGreaterThan(piorReal);
  });

  it("a textura NÃO foi apertada — a dívida que continua declarada", () => {
    // A Fase 1 estava certa sobre a textura, e continuar certa é parte do
    // conserto. Subir este piso é que teria reprovado a casa.
    expect(PISO_DE_TEXTURA_NA_FOTO).toBeLessThan(0.0033);
  });
});

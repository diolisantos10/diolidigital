// A TRAVA DE FUNDO, COM AS DUAS METADES — e as duas contra ARQUIVO DE VERDADE.
//
// Metade 1: ela REPROVA o problema plantado. O problema plantado aqui não é
// inventado para o teste: são as DUAS PEÇAS QUE O CEO REPROVOU em 08/08/2026,
// guardadas byte a byte em `docs/entregas/cityjobs-08-08/reprovadas/`. Se um dia
// alguém afrouxar os pisos, estes dois arquivos voltam a passar e o teste cai.
//
// Metade 2: ela NÃO reprova o caso limpo. O caso limpo também é real: as duas
// fotografias que entraram nas peças refeitas. Uma trava que só sabe dizer não
// é tão inútil quanto a que só sabe dizer sim — e é pior, porque é desligada.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { medirFundo } from "@/lib/agency/design/medir-fundo";
import {
  travaDeFundoDeclarado,
  travaDeRiquezaDoFundo,
  PISO_DE_CORES_DISTINTAS,
  TETO_DA_COR_DOMINANTE,
} from "@/lib/agency/design/trava-de-fundo";

const ENTREGA = join(process.cwd(), "docs/entregas/cityjobs-08-08");
const ler = (p: string) => readFileSync(join(ENTREGA, p));

const REPROVADAS = [
  "reprovadas/reprovada-post-1-bastidor-da-regiao.png",
  "reprovadas/reprovada-post-2-vaga-validada.png",
];
const FOTOS_DE_VERDADE = ["fotos/p1-recorte.jpg", "fotos/p2-recorte.jpg"];

describe("trava de fundo — a DECLARAÇÃO", () => {
  it("reprova o SVG desenhado em código, que é o caso do incidente", () => {
    const v = travaDeFundoDeclarado(
      "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjwvc3ZnPg==",
    );
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.motivo).toBe("vetor_desenhado_em_codigo");
  });

  it("reprova SVG cru, e reprova em qualquer caixa", () => {
    expect(travaDeFundoDeclarado("<SVG viewBox='0 0 1 1'></SVG>").ok).toBe(false);
    expect(travaDeFundoDeclarado("DATA:IMAGE/SVG+XML,%3Csvg%3E").ok).toBe(false);
  });

  it("reprova a AUSÊNCIA de fundo — campo chapado na cor da marca não é entregável", () => {
    for (const vazio of [null, undefined, "", "   "]) {
      const v = travaDeFundoDeclarado(vazio);
      expect(v.ok).toBe(false);
      if (!v.ok) expect(v.motivo).toBe("sem_fundo");
    }
  });

  it("NÃO reprova foto: PNG e JPEG passam nesta camada", () => {
    expect(travaDeFundoDeclarado("data:image/jpeg;base64,/9j/4AAQ").ok).toBe(true);
    expect(travaDeFundoDeclarado("data:image/png;base64,iVBORw0KGgo").ok).toBe(true);
  });
});

describe("trava de fundo — o PIXEL, contra os arquivos do incidente", () => {
  it.each(REPROVADAS)("REPROVA a peça que o CEO reprovou: %s", async (arquivo) => {
    const m = await medirFundo(ler(arquivo));
    expect(m).not.toBeNull();
    const v = travaDeRiquezaDoFundo(m!);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.motivo).toBe("pobre_demais_para_ser_foto");
  });

  it.each(FOTOS_DE_VERDADE)("NÃO reprova a fotografia real: %s", async (arquivo) => {
    const m = await medirFundo(ler(arquivo));
    expect(m).not.toBeNull();
    expect(travaDeRiquezaDoFundo(m!).ok).toBe(true);
  });

  it("a separação entre clipart e foto é por ORDEM DE GRANDEZA, não por pouco", async () => {
    const clipart = await medirFundo(ler(REPROVADAS[0]!));
    const foto = await medirFundo(ler(FOTOS_DE_VERDADE[0]!));
    // Se um dia esta margem encolher para menos de 3×, a trava virou calibragem
    // fina — e calibragem fina reprova a próxima foto de neblina ou parede
    // branca. Melhor descobrir aqui do que no card do cliente.
    expect(foto!.coresDistintas).toBeGreaterThan(clipart!.coresDistintas * 3);
    expect(clipart!.fracaoDaCorDominante).toBeGreaterThan(foto!.fracaoDaCorDominante * 3);
  });

  it("os pisos ficam FOLGADOS dos dois lados — nem rente ao clipart, nem rente à foto", async () => {
    const clipart = await medirFundo(ler(REPROVADAS[1]!));
    const foto = await medirFundo(ler(FOTOS_DE_VERDADE[1]!));
    expect(clipart!.coresDistintas).toBeLessThan(PISO_DE_CORES_DISTINTAS * 0.6);
    expect(foto!.coresDistintas).toBeGreaterThan(PISO_DE_CORES_DISTINTAS * 2);
    expect(foto!.fracaoDaCorDominante).toBeLessThan(TETO_DA_COR_DOMINANTE * 0.2);
  });
});

describe("trava de fundo — o que ela NÃO promete", () => {
  it("imagem que não decodifica devolve NULL, e null não é aprovação", async () => {
    expect(await medirFundo(Buffer.from("isto não é uma imagem"))).toBeNull();
  });

  it("a régua é conjuntiva ao contrário: UM critério ruim já reprova", () => {
    // Cores de sobra e textura de sobra, mas metade da imagem numa cor só.
    const v = travaDeRiquezaDoFundo({
      coresDistintas: 5000,
      fracaoDaCorDominante: 0.9,
      texturaMedia: 0.5,
    });
    expect(v.ok).toBe(false);
  });
});

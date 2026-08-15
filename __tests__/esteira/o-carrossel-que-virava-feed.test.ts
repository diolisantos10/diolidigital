// O CARROSSEL QUE VIRAVA FEED EM SILÊNCIO.
//
// ── A corrente inteira, porque nenhuma peça sozinha estava errada ──────────
//
//   1. o cliente pede ajuste num CARROSSEL de 5 telas;
//   2. `refacao.ts:490` renderiza a peça refeita com uma CÓPIA da lista de
//      campos do motor — cópia sem a linha `["cenas","Cenas"]`. O comentário em
//      cima dela dizia "mesmo formato de texto que o motor usa", e era falso;
//   3. o prompt de refação pedia um esquema JSON **sem `cenas`**, então o
//      modelo nem devolvia as telas;
//   4. `extrairPecas` lê o texto e acha `cenas = []`;
//   5. `publicacao.ts:1046`: "carrossel sem telas suficientes não é carrossel —
//      vira feed";
//   6. o cliente comprou carrossel de 5 telas e recebe UMA imagem.
//
// Ninguém fica vermelho em passo nenhum. Três cópias da mesma lista foi o que
// produziu isto — a mesma forma de defeito que, na mesma noite, fechou a
// publicação inteira por duas cópias divergentes do mesmo `envelopar`.
//
// Estes testes cobrem a corrente TODA, não os elos: o que se prova é que o
// texto que sai do renderizador de conserto continua sendo lido como carrossel
// pelo leitor de peças de verdade.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { renderizarEntrega, CAMPOS_DA_ENTREGA, ESQUEMA_DA_ENTREGA } from "@/lib/agency/esteira/renderizar-entrega";
import { extrairPecas } from "@/lib/agency/esteira/publicacao";

/** Um carrossel de 5 telas, como o especialista devolve. */
const CARROSSEL = {
  title: "Vagas do bairro",
  summary: "Um carrossel sobre as vagas da semana.",
  items: [
    {
      headline: "As 5 vagas da semana no seu bairro",
      format: "carrossel",
      caption: "Cinco vagas abriram a menos de dez minutos da sua casa nesta semana. Corre ver qual é a sua.",
      cenas: "1) [gancho] a rua do bairro · 2) [tensao] o tempo no ônibus · 3) [prova] o mapa com as vagas · 4) [oferta] a lista · 5) [cta] o link do perfil",
      visual: "Fotos de rua, luz de fim de tarde",
    },
  ],
};

describe("⭐ o carrossel refeito continua carrossel", () => {
  it("o texto renderizado carrega as CENAS — e o leitor de peças conta 5 telas", () => {
    const texto = renderizarEntrega(CARROSSEL);
    expect(texto, "o campo Cenas sumiu do texto — o carrossel perdeu as telas").toContain("- Cenas:");

    const pecas = extrairPecas(texto, "social_post");
    expect(pecas.length).toBe(1);
    expect(pecas[0]!.cenas.length, "as telas não sobreviveram à volta pelo texto").toBe(5);
    expect(
      pecas[0]!.formato,
      "a peça foi REBAIXADA para feed: o cliente comprou 5 telas e receberia uma imagem",
    ).toBe("carousel");
  });

  it("a metade oposta: peça sem telas continua sendo feed — o rebaixamento não foi desligado", () => {
    const semTelas = renderizarEntrega({
      ...CARROSSEL,
      items: [{ ...CARROSSEL.items[0], cenas: undefined }],
    });
    const pecas = extrairPecas(semTelas, "social_post");
    expect(pecas[0]!.formato).toBe("feed");
  });
});

describe("⭐ uma fonte só — a duplicação é que produziu o defeito", () => {
  const fonte = (rel: string) =>
    fs.readFileSync(path.join(process.cwd(), rel), "utf8");

  const OS_TRES = [
    "lib/agency/execution/run-execution.ts",
    "lib/agency/esteira/refacao.ts",
    "lib/agency/esteira/pacote-travado.ts",
  ];

  it("os três motores IMPORTAM o renderizador — nenhum tem cópia própria", () => {
    for (const arquivo of OS_TRES) {
      const s = fonte(arquivo);
      expect(s.includes('from "@/lib/agency/esteira/renderizar-entrega"'), `${arquivo} não importa a fonte única`).toBe(true);
      // A assinatura da cópia: uma função local que remonta a lista de campos.
      expect(
        /\[\s*\[\s*"format",\s*"Formato"\s*\]/.test(s),
        `${arquivo} voltou a ter a lista de campos própria — é assim que a linha de \`cenas\` some de novo`,
      ).toBe(false);
    }
  });

  it("`cenas` está na lista, e a lista é a que os três usam", () => {
    expect(CAMPOS_DA_ENTREGA.map(([k]) => k)).toContain("cenas");
  });

  it("os dois caminhos de conserto PEDEM `cenas` ao modelo", () => {
    // Consertar o renderizador sem consertar o pedido não resolveria nada: o
    // esquema JSON dos dois prompts não tinha `cenas`, então o modelo devolvia
    // o item sem telas e o carrossel virava feed do mesmo jeito.
    expect(ESQUEMA_DA_ENTREGA).toContain('"cenas"');
    for (const arquivo of ["lib/agency/esteira/refacao.ts", "lib/agency/esteira/pacote-travado.ts"]) {
      const s = fonte(arquivo);
      expect(s.includes("ESQUEMA_DA_ENTREGA"), `${arquivo} pede um esquema próprio ao modelo`).toBe(true);
      expect(
        /Responda JSON: \{"title"[^\n]*"cta":"\.\.\."\}\]\}/.test(s),
        `${arquivo} voltou a escrever o esquema à mão`,
      ).toBe(false);
    }
  });
});

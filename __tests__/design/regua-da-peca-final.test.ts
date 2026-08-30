// A RÉGUA DA PEÇA FINAL — E ELA É PROVADA POR MUTAÇÃO, CONTRA ARQUIVO REAL.
//
// Mesma disciplina de `trava-de-fundo.test.ts`: nada aqui é imagem inventada
// para o teste passar.
//
//  • O caso LIMPO é uma peça que estava VIVA em produção em 26/08/2026 —
//    /api/media/med_1f79e9f3_mt8xj2gu, 1080x1350, 150.203 bytes,
//    sha256 1f79e9f3781ea11dc20ff1b58a3704162d1f5b5847b8156e122b68adda67bf8b.
//
//  • O MUTANTE é ela mesma com UMA coisa mudada: a foto não entrou. As faixas
//    de título e assinatura são preservadas byte a byte da peça boa (inclusive
//    os pixels de foto atrás delas — o que torna o mutante MAIS difícil de
//    pegar) e o miolo vira o retângulo chapado do incidente de 25/08/2026.
//
//  • O segundo MUTANTE é o arquivo raso: campo chapado inteiro, 8.937 bytes.
//    É a impressão digital literal da peça de 19.207 bytes que foi ao cliente.
//
// A régua tem de reprovar os dois e NÃO reprovar o primeiro. Régua que só sabe
// dizer não é desligada por quem não sabe o que ela protege.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { medirPecaFinal } from "@/lib/agency/design/medir-peca-final";
import {
  reguaDaPecaFinal,
  reguaDoPixelDaPecaFinal,
  reguaDaLetraDaPecaFinal,
  PISO_DE_CORES_NA_FOTO,
  PISO_DE_BYTES_POR_MEGAPIXEL,
  PISO_DE_TEXTURA_NA_FOTO,
} from "@/lib/agency/design/regua-da-peca-final";

const PASTA = join(process.cwd(), "docs/entregas/peca-final-26-08");
const ler = (p: string) => readFileSync(join(PASTA, p));

const SEM_LETRA = { textosPintados: [], tituloPedido: "", assinaturaPedida: "" };

describe("régua da peça final — o PIXEL, provado por mutação", () => {
  it("APROVA a peça real que estava em produção", async () => {
    const m = await medirPecaFinal(ler("boa-med_1f79e9f3_mt8xj2gu.jpg"));
    expect(m).not.toBeNull();
    expect(reguaDoPixelDaPecaFinal(m!).ok).toBe(true);
  });

  it("REPROVA o mutante em que a foto não entrou — e diz que foi a foto", async () => {
    const m = await medirPecaFinal(ler("mutante-foto-nao-entrou.jpg"));
    expect(m).not.toBeNull();
    const v = reguaDoPixelDaPecaFinal(m!);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.motivo).toBe("foto_nao_entrou");
  });

  it("REPROVA o arquivo raso — o caso de 19.207 bytes em 1080x1350", async () => {
    const m = await medirPecaFinal(ler("mutante-arquivo-raso.jpg"));
    expect(m).not.toBeNull();
    expect(reguaDoPixelDaPecaFinal(m!).ok).toBe(false);
    expect(m!.bytesPorMegapixel).toBeLessThan(PISO_DE_BYTES_POR_MEGAPIXEL);
  });

  it("a separação é de ORDEM DE GRANDEZA, não 'por pouco'", async () => {
    const boa = (await medirPecaFinal(ler("boa-med_1f79e9f3_mt8xj2gu.jpg")))!;
    const mut = (await medirPecaFinal(ler("mutante-foto-nao-entrou.jpg")))!;
    // Se um dia esta distância encolher, a régua virou roleta e o teste avisa.
    expect(boa.coresNaFaixaDaFoto).toBeGreaterThan(mut.coresNaFaixaDaFoto * 20);
    expect(boa.coresNaFaixaDaFoto).toBeGreaterThan(PISO_DE_CORES_NA_FOTO * 5);
  });

  it("o portão do FUNDO CRU reprovaria a peça boa — é por isso que esta régua existe", async () => {
    // A prova de que mover o portão do fundo para a peça composta era o
    // conserto ERRADO. Se um dia alguém tentar, este teste explica por quê.
    const { medirFundo } = await import("@/lib/agency/design/medir-fundo");
    const { travaDeRiquezaDoFundo } = await import("@/lib/agency/design/trava-de-fundo");
    const m = await medirFundo(ler("boa-med_1f79e9f3_mt8xj2gu.jpg"));
    expect(m).not.toBeNull();
    expect(travaDeRiquezaDoFundo(m!).ok).toBe(false);
  });
});

describe("régua da peça final — a LETRA", () => {
  it("REPROVA a peça cujo título não foi pintado no DOM", () => {
    const v = reguaDaLetraDaPecaFinal({
      textosPintados: ["TRATTORIA DA ANA TESTE"],
      tituloPedido: "O ambiente cheio que faz você querer estar aqui também.",
      assinaturaPedida: "TRATTORIA DA ANA TESTE",
    });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.motivo).toBe("sem_titulo_pintado");
  });

  it("REPROVA a peça que sairia sem assinatura de marca", () => {
    const v = reguaDaLetraDaPecaFinal({
      textosPintados: ["O ambiente cheio que faz você querer estar aqui também."],
      tituloPedido: "O ambiente cheio que faz você querer estar aqui também.",
      assinaturaPedida: "TRATTORIA DA ANA TESTE",
    });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.motivo).toBe("sem_assinatura_pintada");
  });

  it("APROVA quando os dois foram conferidos no DOM", () => {
    expect(reguaDaLetraDaPecaFinal({
      textosPintados: ["O ambiente cheio que faz você querer estar aqui também.", "TRATTORIA DA ANA TESTE"],
      tituloPedido: "O ambiente cheio que faz você querer estar aqui também.",
      assinaturaPedida: "TRATTORIA DA ANA TESTE",
    }).ok).toBe(true);
  });
});

describe("régua da peça final — SEM MEDIDA É REPROVADO", () => {
  it("medida ausente NUNCA vira aprovação", () => {
    const v = reguaDaPecaFinal(null, SEM_LETRA);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.motivo).toBe("nao_foi_possivel_medir");
  });

  it("bytes que não decodificam devolvem medida nula — e a régua reprova", async () => {
    const m = await medirPecaFinal(Buffer.from("isto não é uma imagem", "utf8"));
    expect(m).toBeNull();
    expect(reguaDaPecaFinal(m, SEM_LETRA).ok).toBe(false);
  });
});

describe("régua da peça final — o que ela NÃO cobra, e por quê", () => {
  it("assinatura RECUSADA por uma trava não vira reprovação — é degradação declarada", () => {
    // Medido: a marca "Padaria da Arte que Não Saiu TESTE" (seis palavras) é
    // recusada pela FORMA da assinatura. A primeira versão desta régua cobrava
    // a assinatura mesmo assim e parou as QUATRO peças da cliente — uma
    // segunda política sobre um estado que já tinha a sua, e uma produção
    // inteira parada pela forma de um nome.
    //
    // ⚠️ O buraco continua de pé e está declarado em `artes.ts`: essa marca
    // recebe arte sem assinatura. O conserto é a forma da assinatura, não esta
    // régua. Este teste existe para que mudar isso volte a ser uma decisão.
    expect(reguaDaLetraDaPecaFinal({
      textosPintados: ["O título que foi pintado"],
      tituloPedido: "O título que foi pintado",
      assinaturaPedida: "", // `declaracaoDaComposicao` zera o que a trava recusou
    }).ok).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// A FAMÍLIA DE MUTANTES (Fase 1, 26/08/2026) — cada um vermelho, a boa verde
// ═══════════════════════════════════════════════════════════════════════════
//
// A régua tinha DOIS mutantes de arquivo guardados. Dois mutantes provam que
// ela tem dente contra dois defeitos; não provam que ela tem dente contra a
// CLASSE. E o defeito de 25/08 não veio de um caso previsto: veio de uma peça
// que ninguém tinha imaginado.
//
// Os mutantes deste bloco nascem DA PEÇA REAL, por transformação — nada é
// imagem inventada. Cada família é uma maneira diferente de a foto não chegar
// ao cliente, e todas já aconteceram em produtor de imagem no mundo real:
//
//   • chapado — o provedor devolveu retângulo de cor sólida;
//   • gradiente — devolveu um degradê "bonito" e vazio (a armadilha: tem MUITAS
//     cores e passaria por uma régua que só contasse cor);
//   • quase-chapado — cor sólida com ruído mínimo, o mutante mais difícil;
//   • recompressão destrutiva — o arquivo raso, na forma genérica.
//
// ⚠️ O TEXTO ESTOURADO **não** é medido aqui, e a distinção é a de sempre:
// régua verde sobre o componente errado é pior que régua nenhuma. Quem pega
// transbordo é `renderizarHtml` (motivo `texto_cortado`), no DOM, ANTES de
// existir arquivo — e a peça reprovada por ele nunca ganha `mediaUrl`. A prova
// disso mora em `__tests__/design/molde-porta-fechada.test.ts`, e o elo está
// asserido abaixo para que ninguém o apague sem esta régua avisar.

describe("régua da peça final — a FAMÍLIA de mutantes, derivada da peça real", () => {
  const BOA = "boa-med_1f79e9f3_mt8xj2gu.jpg";

  /** Substitui a FAIXA DA FOTO (35%..80%) por outra coisa, preservando o resto
   *  da peça real byte a byte no que for possível. Mutante mais difícil de
   *  pegar do que uma imagem chapada inteira. */
  async function trocarAFaixaDaFoto(
    fabricar: (largura: number, altura: number) => Promise<Buffer>,
  ): Promise<Buffer> {
    const { default: sharp } = await import("sharp");
    const original = sharp(ler(BOA));
    const meta = await original.metadata();
    const L = meta.width!, A = meta.height!;
    const topo = Math.round(A * 0.35);
    const alturaDaFaixa = Math.round(A * 0.8) - topo;
    return sharp(ler(BOA))
      .composite([{ input: await fabricar(L, alturaDaFaixa), top: topo, left: 0 }])
      .jpeg({ quality: 92 })
      .toBuffer();
  }

  const MUTANTES: { nome: string; bytes: () => Promise<Buffer> }[] = [
    {
      nome: "chapado — o provedor devolveu um retângulo de cor sólida",
      bytes: () => trocarAFaixaDaFoto(async (l, a) => {
        const { default: sharp } = await import("sharp");
        return sharp({ create: { width: l, height: a, channels: 3, background: { r: 214, g: 198, b: 172 } } }).png().toBuffer();
      }),
    },
    {
      nome: "__FRONTEIRA__gradiente",
      bytes: () => trocarAFaixaDaFoto(async (l, a) => {
        const { default: sharp } = await import("sharp");
        const px = Buffer.alloc(l * a * 3);
        for (let y = 0; y < a; y++) {
          for (let x = 0; x < l; x++) {
            const i = (y * l + x) * 3;
            px[i] = Math.round(40 + (180 * y) / a);
            px[i + 1] = Math.round(30 + (150 * y) / a);
            px[i + 2] = Math.round(60 + (120 * y) / a);
          }
        }
        return sharp(px, { raw: { width: l, height: a, channels: 3 } }).png().toBuffer();
      }),
    },
    {
      nome: "quase-chapado — cor sólida com ruído mínimo, o mais difícil de pegar",
      bytes: () => trocarAFaixaDaFoto(async (l, a) => {
        const { default: sharp } = await import("sharp");
        const px = Buffer.alloc(l * a * 3);
        for (let i = 0; i < px.length; i += 3) {
          const r = (i / 3) % 3; // ruído determinístico, sem aleatório em teste
          px[i] = 200 + r; px[i + 1] = 186 + r; px[i + 2] = 160 + r;
        }
        return sharp(px, { raw: { width: l, height: a, channels: 3 } }).png().toBuffer();
      }),
    },
    {
      nome: "recompressão destrutiva — o arquivo raso na forma genérica",
      bytes: async () => {
        const { default: sharp } = await import("sharp");
        return sharp(ler(BOA)).jpeg({ quality: 1 }).toBuffer();
      },
    },
  ];

  for (const m of MUTANTES.filter((x) => !x.nome.startsWith("__FRONTEIRA__"))) {
    it(`REPROVA o mutante «${m.nome}»`, async () => {
      const medida = await medirPecaFinal(await m.bytes());
      expect(medida, "o mutante nem decodificou — o teste não mediu o que queria").not.toBeNull();
      const v = reguaDoPixelDaPecaFinal(medida!);
      expect(
        v.ok,
        `a régua APROVOU «${m.nome}» — cores ${medida!.coresNaFaixaDaFoto}, ` +
          `dominante ${medida!.dominanteNaFaixaDaFoto.toFixed(3)}, ` +
          `textura ${medida!.texturaNaFaixaDaFoto.toFixed(4)}, ` +
          `bytes/MP ${Math.round(medida!.bytesPorMegapixel)}`,
      ).toBe(false);
    });
  }

  // ═════════════════════════════════════════════════════════════════════════
  // ⚠️ A FRONTEIRA DA RÉGUA — MEDIDA, DECLARADA, NÃO CONSERTADA (26/08/2026)
  // ═════════════════════════════════════════════════════════════════════════
  //
  // `regua-da-peca-final.ts` afirma, por escrito, que os critérios pegam três
  // coisas: *"o retângulo chapado, **o degradê da cor da marca**, o arquivo
  // truncado"*. Medido nesta fase: **o degradê NÃO é pego.**
  //
  // Um degradê suave de faixa larga na faixa da foto passa por todos os quatro
  // critérios. Os números estão no próprio teste, calculados na execução — não
  // digitados aqui.
  //
  // ── POR QUE ESTE TESTE NÃO FECHA O BURACO ────────────────────────────────
  //
  // Fechá-lo seria subir `PISO_DE_TEXTURA_NA_FOTO`. A pior peça REAL da casa
  // tem textura 0,0066 e o degradê tem ~0,0033: **2× de separação**, contra as
  // ordens de grandeza que sustentam os outros critérios (163 cores contra 1).
  // Piso novo nessa faixa ficaria rente ao caso conhecido — e este arquivo já
  // carrega escrito o que acontece então: *"régua rente ao caso conhecido
  // reprova a próxima peça legítima e acaba desligada por quem não sabe o que
  // ela protege."*
  //
  // E há um motivo mais duro: das 12 peças vivas que calibraram os pisos, esta
  // árvore guarda **UMA**. Calibrar um piso novo sobre uma amostra de um é
  // exatamente como se inventa uma régua que reprova a casa inteira.
  //
  // ── O QUE ESTE TESTE FAZ, ENTÃO ──────────────────────────────────────────
  //
  // Ele CONGELA a fronteira com número. No dia em que alguém mexer nos pisos,
  // ele diz de que lado o degradê caiu — e no dia em que a casa tiver as 12
  // peças de volta (ou um discriminador de alta margem, do tipo "as linhas da
  // faixa sobem em ordem"), ele é o teste que vira vermelho invertido e cobra
  // a promessa do cabeçalho.
  //
  // 📌 FASE 2 / DÍVIDA DECLARADA: guardar as 12 peças reais e recalibrar.
  it("DÍVIDA: o degradê suave PASSA pela régua — a promessa do cabeçalho não se cumpre", async () => {
    const gradiente = MUTANTES.find((m) => m.nome === "__FRONTEIRA__gradiente")!;
    const g = (await medirPecaFinal(await gradiente.bytes()))!;
    const boa = (await medirPecaFinal(ler(BOA)))!;

    const veredito = reguaDoPixelDaPecaFinal(g);
    const numeros =
      `degradê: ${g.coresNaFaixaDaFoto} cores, dominante ${g.dominanteNaFaixaDaFoto.toFixed(3)}, ` +
      `textura ${g.texturaNaFaixaDaFoto.toFixed(4)} · peça real: ${boa.coresNaFaixaDaFoto} cores, ` +
      `textura ${boa.texturaNaFaixaDaFoto.toFixed(4)} · pisos: ${PISO_DE_CORES_NA_FOTO} cores, ` +
      `${PISO_DE_TEXTURA_NA_FOTO} textura`;

    // O degradê está ACIMA de todos os pisos. É isto que se declara.
    expect(g.coresNaFaixaDaFoto, numeros).toBeGreaterThan(PISO_DE_CORES_NA_FOTO);
    expect(g.texturaNaFaixaDaFoto, numeros).toBeGreaterThan(PISO_DE_TEXTURA_NA_FOTO);
    expect(veredito.ok, `A DÍVIDA FOI PAGA — o degradê agora é reprovado. ${numeros}. ` +
      "Apague este teste e mova o degradê de volta para a lista de MUTANTES.").toBe(true);

    // E a separação é de 2×, não de ordem de grandeza — o número que impede o
    // conserto apressado. Se um dia ela virar 5×, o piso pode subir com margem.
    const separacao = boa.texturaNaFaixaDaFoto / g.texturaNaFaixaDaFoto;
    expect(separacao, `separação boa/degradê = ${separacao.toFixed(2)}× — ${numeros}`).toBeLessThan(5);
  });

  it("e a peça BOA continua passando depois de tudo isso — régua que só sabe dizer não é desligada", async () => {
    const m = await medirPecaFinal(ler(BOA));
    expect(m).not.toBeNull();
    expect(reguaDoPixelDaPecaFinal(m!).ok).toBe(true);
    // A mesma peça recomprimida com qualidade de PRODUÇÃO continua boa: a
    // régua mede a FOTO, não o compressor.
    const { default: sharp } = await import("sharp");
    const recomprimida = await sharp(ler(BOA)).jpeg({ quality: 82 }).toBuffer();
    const m2 = await medirPecaFinal(recomprimida);
    expect(reguaDoPixelDaPecaFinal(m2!).ok, "a régua reprovou a peça boa só por recompressão honesta").toBe(true);
  });

  it("o TEXTO ESTOURADO é pego ANTES do arquivo existir — o elo, para ninguém apagá-lo", () => {
    // MUTAÇÃO QUE PROVA: apague o bloco `if (ajuste.cortado)` de
    // `renderizar.ts` e esta linha cai. Cobrar transbordo na régua do PIXEL
    // seria régua verde sobre o componente errado: quando há arquivo, o texto
    // já foi cortado e o dano já está feito.
    const s = readFileSync("lib/agency/design/renderizar.ts", "utf8");
    expect(s).toContain("if (ajuste.cortado)");
    expect(s).toContain('motivo: "texto_cortado"');
    // E ele reprova ANTES da captura: o `return` do transbordo tem de vir
    // antes de `page.screenshot`, senão a peça cortada ganha bytes.
    expect(s.indexOf('motivo: "texto_cortado"')).toBeLessThan(s.indexOf("page.screenshot("));
  });
});

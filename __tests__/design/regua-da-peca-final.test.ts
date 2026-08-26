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

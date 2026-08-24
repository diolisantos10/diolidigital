// A CASA SÓ VENDE O QUE PRODUZ — e este teste é o que impede o próximo item.
//
// Achado de 24/08/2026: a vitrine e a tabela de planos vendiam cinco coisas sem
// caminho de produção (post no Google, ficha do Google, legenda animada,
// logotipo de cliente, arquivo PDF). Consertar os cinco à mão não vale nada: o
// item seis entra amanhã. Então o que este arquivo protege é a RÉGUA, em quatro
// frentes:
//
//   1. O DADO NÃO MENTE. Toda capacidade declarada como existente tem que ter o
//      arquivo, o símbolo exportado E pelo menos um chamador fora de teste. Se
//      alguém marcar "publicacao-no-google" como pronta sem ligar o caminho, o
//      teste quebra aqui.
//   2. A CATRACA INVERSA. Toda capacidade declarada AUSENTE tem que continuar
//      sem chamador de produção. Ligou o caminho? O teste quebra e manda
//      promover a capacidade — para a oferta voltar a ser vendável de verdade.
//   3. FALHA FECHADA. Item sem declaração, com capacidade desconhecida, ou que
//      PROMETE NO TEXTO uma capacidade ausente, não é vendável — mesmo que o
//      autor tenha declarado outra coisa no `requer`.
//   4. A VITRINE E OS PLANOS OBEDECEM. Nada na tela pública, nem item de
//      catálogo nem linha de plano, promete o que não se produz.
//
// O QUE ESTE TESTE NÃO PROVA: que a capacidade FUNCIONE. Ele mede existência de
// caminho de produção no código-fonte — não mede ffmpeg no runtime, chave de
// imagem, cota de API nem qualidade da peça. Esse outro eixo é `/api/capacidades`.

import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  CAPACIDADES,
  CAPACIDADES_AUSENTES,
  capacidadeDisponivel,
  conferirOferta,
  type Capacidade,
  type CapacidadeDeProducao,
} from "@/lib/agency/capacidade-de-producao";
import {
  SELF_SERVE_CATALOG,
  CATALOGO_VENDAVEL,
  CATALOGO_SUSPENSO,
  ofertaVendavel,
} from "@/lib/agency/self-serve-catalog";
import { PLANOS } from "@/lib/agency/planos";

const RAIZ = resolve(__dirname, "..", "..");

/** Os arquivos de produção que de fato CHAMAM o símbolo.
 *
 *  Duas exigências, e as duas importam:
 *   • é uma CHAMADA (`simbolo(`), não uma menção. Este repositório documenta
 *     muito em comentário — o próprio achado de 24/08 está escrito em prosa em
 *     `planos.ts` e em `email/send.ts`, citando `publicarNoGoogle` pelo nome.
 *     Contar citação como chamador transformaria a documentação do defeito na
 *     prova de que o defeito não existe.
 *   • fora do arquivo que define, fora de teste, e fora do próprio registro de
 *     capacidades — senão a prova seria circular.
 *
 *  É a prova de que existe PORTA DE ENTRADA: o defeito original era exatamente
 *  uma função exportada, testada, e que ninguém chamava. */
function chamadoresDeProducao(ponto: { arquivo: string; simbolo: string }): string[] {
  let saida = "";
  try {
    saida = execFileSync(
      "git",
      ["grep", "-n", "-E", "--", `\\b${ponto.simbolo}\\s*\\(`, "lib", "app", "scripts", "components"],
      { cwd: RAIZ, encoding: "utf8" },
    );
  } catch {
    return [];   // git grep sai 1 quando não acha nada
  }
  const arquivos = new Set<string>();
  for (const bruta of saida.split("\n")) {
    const [arquivo, , ...resto] = bruta.split(":");
    if (!arquivo || resto.length === 0) continue;
    const linha = resto.join(":").trim();
    if (linha.startsWith("//") || linha.startsWith("*") || linha.startsWith("/*")) continue;
    if (arquivo === ponto.arquivo) continue;
    if (arquivo.startsWith("__tests__/") || arquivo.includes(".test.")) continue;
    if (arquivo === "lib/agency/capacidade-de-producao.ts") continue;
    arquivos.add(arquivo);
  }
  return [...arquivos];
}

describe("1. o registro de capacidades não mente sobre o que existe", () => {
  const prontas = Object.values(CAPACIDADES).filter((c) => c.ponto !== null);

  it("há pelo menos uma capacidade pronta e pelo menos uma ausente", () => {
    expect(prontas.length).toBeGreaterThan(0);
    expect(CAPACIDADES_AUSENTES.length).toBeGreaterThan(0);
  });

  it.each(prontas.map((c) => [c.id, c] as [CapacidadeDeProducao, Capacidade]))(
    "%s: arquivo existe, exporta o símbolo e TEM chamador em produção",
    (_id, cap) => {
      const ponto = cap.ponto!;
      const caminho = resolve(RAIZ, ponto.arquivo);
      expect(existsSync(caminho), `arquivo sumiu: ${ponto.arquivo}`).toBe(true);

      const fonte = readFileSync(caminho, "utf8");
      expect(
        new RegExp(`export\\s+(async\\s+)?(function|const)\\s+${ponto.simbolo}\\b`).test(fonte),
        `${ponto.arquivo} não exporta ${ponto.simbolo}`,
      ).toBe(true);

      expect(
        chamadoresDeProducao(ponto).length,
        `${ponto.simbolo} não tem chamador fora de teste — é código sem porta de ` +
          `entrada, exatamente o defeito de 24/08/2026. Ou ligue o caminho, ou ` +
          `mova "${cap.id}" para ponto: null.`,
      ).toBeGreaterThan(0);
    },
  );
});

describe("2. catraca inversa: capacidade ausente que ganhar produtor tem que ser promovida", () => {
  const orfas = CAPACIDADES_AUSENTES.filter((c) => c.simboloOrfao);

  it.each(orfas.map((c) => [c.id, c] as [CapacidadeDeProducao, Capacidade]))(
    "%s continua sem chamador de produção",
    (_id, cap) => {
      const chamadores = chamadoresDeProducao(cap.simboloOrfao!);
      expect(
        chamadores,
        `"${cap.simboloOrfao!.simbolo}" agora É chamado em ${chamadores.join(", ")}. ` +
          `Se o caminho de produção existe, promova "${cap.id}" para um ponto real ` +
          `em capacidade-de-producao.ts — a oferta que depende dela está suspensa à toa.`,
      ).toEqual([]);
    },
  );

  it("nenhuma capacidade ausente é considerada disponível", () => {
    for (const c of CAPACIDADES_AUSENTES) {
      expect(capacidadeDisponivel(c.id)).toBe(false);
    }
  });
});

describe("3. falha fechada — o item novo sem produtor NÃO passa", () => {
  it("oferta que não declara nada é recusada (não isenta)", () => {
    expect(conferirOferta({ requer: [], textos: ["Coisa nova", "faz mágica"] }).vendavel).toBe(false);
  });

  it("capacidade desconhecida é tratada como indisponível", () => {
    expect(capacidadeDisponivel("capacidade-que-nao-existe")).toBe(false);
    const v = conferirOferta({
      requer: ["teletransporte" as CapacidadeDeProducao],
      textos: ["Teletransporte"],
    });
    expect(v.vendavel).toBe(false);
  });

  it("declarar capacidade pronta NÃO salva quem promete no texto o que não se produz", () => {
    // Este é o caso que a lista escrita à mão nunca pegaria: o autor tagueia o
    // item com algo que funciona e escreve na vitrine algo que não existe.
    const v = conferirOferta({
      requer: ["arte-estatica-png"],
      textos: ["Kit Marca Express", "Sua marca pronta", "Logotipo em 3 variações", "Arquivo em PDF"],
    });
    expect(v.vendavel).toBe(false);
    expect(v.faltando).toContain("logotipo-de-cliente");
    expect(v.faltando).toContain("arquivo-pdf");
  });

  it.each([
    ["post no Google", ["4 posts no Google por mês"]],
    ["ficha do Google", ["Ficha do Google mantida: locais, horários e informações"]],
    ["legenda animada", ["1 Reel — edição completa, legendas animadas"]],
    ["logotipo", ["Logotipo (2 variações)"]],
    ["PDF", ["Arquivo em PNG e PDF"]],
  ])("promessa de %s derruba a oferta mesmo com requer generoso", (_nome, textos) => {
    const v = conferirOferta({ requer: ["arte-estatica-png", "texto-de-marca"], textos });
    expect(v.vendavel).toBe(false);
  });

  it("uma oferta honesta continua vendável — a régua não é um 'não' para tudo", () => {
    const v = conferirOferta({
      requer: ["arte-estatica-png", "texto-de-marca"],
      textos: ["Post para feed", "1 arte 1080×1350", "Legenda pronta", "Arquivo PNG no portal"],
    });
    expect(v.vendavel).toBe(true);
    expect(v.faltando).toEqual([]);
  });
});

describe("4. a tela pública obedece à régua", () => {
  it("todo item do catálogo declara de que capacidade depende", () => {
    for (const item of SELF_SERVE_CATALOG) {
      expect(Array.isArray(item.requer), `${item.id} sem 'requer'`).toBe(true);
    }
  });

  it("TODO item mostrado na vitrine passa pela régua", () => {
    for (const item of CATALOGO_VENDAVEL) {
      const v = ofertaVendavel(item.id);
      expect(v.vendavel, `${item.id} está na vitrine sem caminho de produção: ${v.motivo}`).toBe(true);
    }
  });

  it("a vitrine é estritamente menor que a tabela — os suspensos ficam de fora, com motivo", () => {
    expect(CATALOGO_VENDAVEL.length + CATALOGO_SUSPENSO.length).toBe(SELF_SERVE_CATALOG.length);
    for (const s of CATALOGO_SUSPENSO) {
      expect(CATALOGO_VENDAVEL.some((v) => v.id === s.item.id)).toBe(false);
      expect(s.motivo.length).toBeGreaterThan(10);
    }
  });

  it.each(["1-reel", "pack-2-reels", "banner-digital", "identidade-basica"])(
    "%s — o achado da auditoria — está fora de venda",
    (id) => {
      expect(ofertaVendavel(id).vendavel).toBe(false);
      expect(CATALOGO_VENDAVEL.some((s) => s.id === id)).toBe(false);
    },
  );

  it("id inexistente é recusa, nunca 'passa assim mesmo'", () => {
    expect(ofertaVendavel("item-inventado-agora").vendavel).toBe(false);
  });

  it("o balcão que a máquina produz de verdade continua vendável", () => {
    for (const id of ["balcao-post-feed", "balcao-carrossel-5", "balcao-legenda"]) {
      expect(ofertaVendavel(id).vendavel, `${id} deveria continuar à venda`).toBe(true);
    }
  });
});

describe("5. a tabela de planos não promete capacidade ausente", () => {
  it.each(PLANOS.map((p) => [p.nome, p] as const))(
    "plano %s: nenhuma linha de 'inclui' promete o que a casa não produz",
    (_nome, plano) => {
      // Cada linha é conferida sozinha para que a mensagem de falha aponte a
      // linha exata. `requer` vem preenchido com o que a casa TEM: o que
      // derruba a linha é o marcador de capacidade ausente no texto dela.
      for (const linha of plano.inclui) {
        const v = conferirOferta({
          requer: ["arte-estatica-png", "texto-de-marca", "publicacao-instagram-facebook", "campanha-de-trafego-meta"],
          textos: [linha],
        });
        expect(
          v.vendavel,
          `plano ${plano.nome} promete "${linha}" — falta: ${v.faltando.join(", ")}. ` +
            `Ou o caminho de produção entra no código, ou a linha sai de 'inclui'.`,
        ).toBe(true);
      }
    },
  );
});

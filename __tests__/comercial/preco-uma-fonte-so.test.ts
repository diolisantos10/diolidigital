// O PREÇO TEM UMA FONTE SÓ — e agora existe MECANISMO, não promessa.
//
// ─── O QUE ESTE PORTÃO ERA ATÉ 16/08/2026, E POR QUE NÃO BASTAVA ─────────────
//
// Ele comparava `docs/precos.md` com `lib/agency/planos.ts` e reprovava a
// divergência. Isso protegia UM par de arquivos — e a casa tinha QUATRO
// catálogos de preço de plano vivos ao mesmo tempo:
//
//   1. `lib/agency/planos.ts` — os 5 oficiais (site `/planos`)
//   2. `comercial/negociacao.ts` — `cheio`/`piso` digitados + preço em frases
//   3. `live-calculator.ts` — CINCO PLANOS QUE NÃO EXISTEM, em faixas, e era
//      esta a tabela que o **briefing PÚBLICO** cotava para o prospect
//   4. `pricing-margins.ts` — um SEGUNDO piso, que contradizia o primeiro
//
// O portão passava verde em todos os quatro dias em que isso foi verdade,
// porque ele olhava exatamente onde não estava o problema. **Portão que só
// confere o par que já concorda é decoração.**
//
// ─── AS DUAS METADES, QUE É A LEI DA CASA ───────────────────────────────────
//
// Toda trava aqui prova as DUAS coisas, e a segunda é a que quase ninguém
// escreve:
//   ⛔ BARRA o problema plantado — a violação é injetada no teste e o portão
//      tem que pegá-la;
//   ✅ NÃO acusa problema no caso limpo — o código de hoje passa, e o portão
//      não vira o alarme que todo mundo desliga.
//
// E há uma terceira, que já custou caro a esta casa: **FALHA ALTO quando não
// consegue ler.** Portão que devolve lista vazia porque o documento mudou de
// forma passa a aprovar tudo em silêncio. É pior que portão nenhum, porque
// parece que alguém conferiu.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import {
  PLANOS,
  PLANOS_PUBLICOS,
  PLANOS_INTERNOS,
  PECA_EXTRA,
  MINIMO_AVULSO,
  PERCENTUAL_SOBRE_MIDIA,
  MIDIA_A_PARTIR_DE,
  taxaSobreMidia,
  podeSerVendido,
  type Implantacao,
} from "@/lib/agency/planos";

const RAIZ = process.cwd();
const DOC = path.join(RAIZ, "docs/precos.md");

/** O único arquivo onde preço de plano pode ser digitado. */
const FONTE_UNICA = "lib/agency/planos.ts";

// ─────────────────────────────────────────────────────────────────────────────
// FERRAMENTA 1 — ler o documento
// ─────────────────────────────────────────────────────────────────────────────

/** "R$ 1.390/mês" → 1390 · "isenta" → "isenta" · "preciso confirmar" → "pendente" */
function valorDaCelula(bruto: string): number | "isenta" | "pendente" {
  const limpo = bruto.trim();
  if (/isenta/i.test(limpo)) return "isenta";
  if (/preciso confirmar|a confirmar|a definir/i.test(limpo)) return "pendente";
  const m = limpo.match(/R\$\s*([\d.]+)/);
  if (!m) return "pendente";
  return Number(m[1].replace(/\./g, ""));
}

interface LinhaDoDoc {
  nome: string;
  preco: number | "isenta" | "pendente";
  implantacao: number | "isenta" | "pendente";
  piso: number | "isenta" | "pendente";
}

/**
 * Lê a tabela "Os seis degraus" de `docs/precos.md`.
 * Formato: | **Nome** | R$ X/mês | R$ Y | R$ Z | ... |
 */
function planosDoDocumento(): LinhaDoDoc[] {
  const linhas = readFileSync(DOC, "utf8").split("\n");
  const saida: LinhaDoDoc[] = [];
  for (const linha of linhas) {
    const m = linha.match(/^\|\s*\*\*([^*|]+)\*\*\s*[^|]*\|([^|]*)\|([^|]*)\|([^|]*)\|/);
    if (!m) continue;
    const nome = m[1].trim();
    if (!PLANOS.some((p) => p.nome === nome)) continue; // ignora outras tabelas
    saida.push({
      nome,
      preco: valorDaCelula(m[2]),
      implantacao: valorDaCelula(m[3]),
      piso: valorDaCelula(m[4]),
    });
  }
  return saida;
}

/** A implantação do código, na mesma moeda que o documento devolve. */
function implantacaoComparavel(i: Implantacao): number | "isenta" | "pendente" {
  return i.tipo === "valor" ? i.reais : i.tipo;
}

// ─────────────────────────────────────────────────────────────────────────────
// FERRAMENTA 2 — varrer o código
// ─────────────────────────────────────────────────────────────────────────────

const PASTAS_VARRIDAS = ["lib", "app", "components", "scripts", "store"];

function arquivosDeCodigo(): string[] {
  const saida: string[] = [];
  const anda = (dir: string) => {
    for (const nome of readdirSync(dir)) {
      // `lib/generated` é o cliente do Prisma: código gerado, não escrito.
      if (nome === "node_modules" || nome === "generated" || nome === ".next") continue;
      const completo = path.join(dir, nome);
      if (statSync(completo).isDirectory()) anda(completo);
      else if (/\.(ts|tsx|mts|mjs)$/.test(nome)) saida.push(completo);
    }
  };
  for (const p of PASTAS_VARRIDAS) {
    const dir = path.join(RAIZ, p);
    try {
      if (statSync(dir).isDirectory()) anda(dir);
    } catch {
      // pasta ausente é problema de leitura, e o teste de leitura abaixo pega.
    }
  }
  return saida;
}

/**
 * Tira comentários antes de varrer, e isso é DECISÃO, não preguiça.
 *
 * Esta casa escreve a história do defeito dentro do arquivo em que ele morava —
 * é assim que ninguém "simplifica" uma regra sem saber o que ela custou. Um
 * portão que reprovasse `// o piso daqui era 520, 820, 1.300…` obrigaria a
 * apagar exatamente a evidência que impede o erro de voltar.
 *
 * E a assimetria é a favor da segurança: preço num comentário **não pode ser
 * cotado a ninguém**; preço em código, sim.
 */
export function semComentarios(fonte: string): string {
  let saida = fonte.replace(/\/\*[\s\S]*?\*\//g, " ");
  saida = saida
    .split("\n")
    // O `[^:]` antes de `//` evita comer `https://…` dentro de string.
    .map((l) => l.replace(/(^|[^:])\/\/.*$/, "$1"))
    .join("\n");
  return saida;
}

/** Os seis preços oficiais, como números. */
const PRECOS_DE_PLANO = new Set(PLANOS.map((p) => p.preco));

/** Chaves que significam "isto é um preço" em qualquer um dos catálogos. */
const CHAVES_DE_PRECO =
  /\b(preco|price|minPrice|maxPrice|cheio|piso|floorPrice|targetPrice|precoMinimo|mensalidade|valorMensal)\s*:\s*(\d[\d_]*)/g;

/**
 * Preço escrito em prosa dentro de uma string: "Plano Ritmo (R$ 297/mês)".
 *
 * O `(?![,\d])` no fim não é detalhe: sem ele, o **R$ 49,90** do rodízio infantil
 * do Sushi Cazza (que aparece em cinco scripts de piloto) casava como "R$ 49" e
 * era acusado de ser o preço do Pulso. Portão que grita no caso limpo é portão
 * que alguém desliga na terceira vez.
 */
const PRECO_EM_PROSA = /R\$\s*(\d{1,3}(?:\.\d{3})+|\d+)(?![,\d])/g;

interface Achado {
  arquivo: string;
  trecho: string;
  valor: number;
}

/**
 * COLISÕES DE NÚMERO QUE NÃO SÃO DUPLICATA — a lista é curta e cada linha tem
 * de dizer por quê.
 *
 * Exceção sem justificativa escrita é como um portão morre: a primeira entra
 * com motivo, a terceira entra "porque a build estava vermelha". Aqui há dois
 * testes cuidando da lista — um exige justificativa longa, o outro reprova
 * entrada MORTA (que já não corresponde a nada no código). Exceção que sobra
 * depois do problema resolvido vira buraco permanente.
 */
const COLISOES_DECLARADAS: { arquivo: string; trecho: string; porQue: string }[] = [
  {
    arquivo: "lib/agency/self-serve-catalog.ts",
    trecho: "precoMinimo: 49",
    porQue:
      "É o PISO do post de balcão (cheio R$ 79), que por coincidência é igual à mensalidade do " +
      "plano Pulso (R$ 49). São produtos diferentes, com fontes diferentes: o balcão é fonte de si " +
      "mesmo (é a vitrine que cobra) e o plano é fonte de si mesmo. Derivar um do outro criaria a " +
      "duplicata que este portão existe para impedir — ao contrário: o piso do post de balcão do " +
      "SDR passou a DERIVAR daqui, e não o inverso.",
  },
];

function ehColisaoDeclarada(a: Achado): boolean {
  return COLISOES_DECLARADAS.some((c) => c.arquivo === a.arquivo && c.trecho === a.trecho.trim());
}

/** Onde um preço de plano aparece FORA da fonte única. */
function precosDePlanoSoltos(arquivos: string[]): Achado[] {
  const achados: Achado[] = [];
  for (const completo of arquivos) {
    const relativo = path.relative(RAIZ, completo);
    if (relativo === FONTE_UNICA) continue;
    const codigo = semComentarios(readFileSync(completo, "utf8"));

    for (const m of codigo.matchAll(CHAVES_DE_PRECO)) {
      const valor = Number(m[2].replace(/_/g, ""));
      if (PRECOS_DE_PLANO.has(valor)) achados.push({ arquivo: relativo, trecho: m[0], valor });
    }
    for (const m of codigo.matchAll(PRECO_EM_PROSA)) {
      const valor = Number(m[1].replace(/\./g, ""));
      if (PRECOS_DE_PLANO.has(valor)) achados.push({ arquivo: relativo, trecho: m[0], valor });
    }
  }
  return achados.filter((a) => !ehColisaoDeclarada(a));
}

/**
 * As superfícies que um CLIENTE ou um PROSPECT enxerga.
 *
 * A lista é explícita e não inferida: uma varredura "tudo que não é
 * `app/agency`" passaria a considerar pública qualquer pasta nova, e o dia em
 * que alguém criar `app/proposta/` o portão continuaria verde.
 */
const SUPERFICIES_DE_CLIENTE = [
  "app/planos",
  "app/vitrine",
  "app/briefing",
  "app/portal",
  "app/contato",
  "app/page.tsx",
  "components/portal",
  "components/agency/briefing/PublicBriefingRoom.tsx",
];

function arquivosDasSuperficies(): string[] {
  const saida: string[] = [];
  for (const alvo of SUPERFICIES_DE_CLIENTE) {
    const completo = path.join(RAIZ, alvo);
    let st;
    try {
      st = statSync(completo);
    } catch {
      continue; // a existência é conferida no teste de leitura, com nome.
    }
    if (st.isFile()) saida.push(completo);
    else {
      const anda = (dir: string) => {
        for (const nome of readdirSync(dir)) {
          const c = path.join(dir, nome);
          if (statSync(c).isDirectory()) anda(c);
          else if (/\.(ts|tsx)$/.test(nome)) saida.push(c);
        }
      };
      anda(completo);
    }
  }
  return saida;
}

// ═════════════════════════════════════════════════════════════════════════════

describe("o preço mora em UM lugar só", () => {
  // ───────────────────────────────────────────────────────────────────────────
  // 0. FALHA ALTO SE NÃO CONSEGUIR LER — a metade que ninguém escreve
  // ───────────────────────────────────────────────────────────────────────────
  describe("FALHA ALTO quando não consegue ler (senão o portão aprova tudo em silêncio)", () => {
    it("a tabela do documento é legível e tem SEIS linhas", () => {
      const doDoc = planosDoDocumento();
      expect(
        doDoc.length,
        `docs/precos.md: a tabela "Os seis degraus" devolveu ${doDoc.length} linhas em vez de 6. ` +
          `Ou um plano sumiu do documento, ou o formato da tabela mudou e este portão parou de ler. ` +
          `Nos dois casos ele deixaria de proteger — por isso quebra aqui.`,
      ).toBe(6);
    });

    it("a varredura enxerga o código de verdade (não uma lista vazia)", () => {
      const arquivos = arquivosDeCodigo();
      // O número exato não importa e não vira teste frágil; a ordem de grandeza
      // sim. Uma varredura que devolve 3 arquivos está quebrada e aprovaria tudo.
      expect(
        arquivos.length,
        "A varredura de código não achou arquivos suficientes. Ela está quebrada, e um portão " +
          "quebrado passa verde em qualquer violação.",
      ).toBeGreaterThan(200);
      expect(arquivos.some((a) => a.endsWith("lib/agency/planos.ts"))).toBe(true);
    });

    it("todas as superfícies de cliente declaradas EXISTEM no disco", () => {
      // Caminho renomeado sem alguém atualizar esta lista = superfície que
      // deixou de ser conferida, sem uma linha vermelha em lugar nenhum.
      for (const alvo of SUPERFICIES_DE_CLIENTE) {
        expect(() => statSync(path.join(RAIZ, alvo)), `superfície declarada e ausente: ${alvo}`).not.toThrow();
      }
      expect(arquivosDasSuperficies().length).toBeGreaterThan(5);
    });

    it("o removedor de comentários funciona — senão a varredura vira cega", () => {
      // ⛔ pega o que é código
      expect(semComentarios('const a = { preco: 297 };')).toContain("297");
      // ✅ ignora o que é história
      expect(semComentarios("// o piso do Ritmo era 297\nconst a = 1;")).not.toContain("297");
      expect(semComentarios("/* faixa antiga: R$ 2.590 */\nconst a = 1;")).not.toContain("2.590");
      // 🔑 e não come URL, que é como um stripper ingênuo apaga meia linha
      expect(semComentarios('const u = "https://dioli.studio/planos";')).toContain("dioli.studio/planos");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 1. SÃO SEIS — a pergunta que o CEO fez
  // ───────────────────────────────────────────────────────────────────────────
  describe("a tabela tem SEIS planos, nem cinco nem sete", () => {
    it("a fonte única tem exatamente os seis, com os preços da ordem do CEO", () => {
      expect(PLANOS.map((p) => [p.nome, p.preco])).toEqual([
        ["Pulso", 49],
        ["Ritmo", 297],
        ["Presença", 790],
        ["Conteúdo", 1390],
        ["Crescimento", 2590],
        ["Performance", 4990],
      ]);
    });

    it("nenhum id repetido e nenhum plano órfão sobrou", () => {
      const ids = PLANOS.map((p) => p.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(PLANOS_PUBLICOS.length + PLANOS_INTERNOS.length).toBe(PLANOS.length);
    });

    it("Pulso e Ritmo estão na tabela — são decisão do CEO, não resíduo", () => {
      // Existe porque já houve quem lesse "pacote de entrada barato" como
      // sobra de tabela velha e propusesse remover.
      expect(PLANOS.find((p) => p.id === "pulso")?.preco).toBe(49);
      expect(PLANOS.find((p) => p.id === "ritmo")?.preco).toBe(297);
    });

    it("o Performance carrega a mídia à parte, e ele é o único", () => {
      expect(PLANOS.filter((p) => p.midiaAParte).map((p) => p.id)).toEqual(["performance"]);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. 🔴 O PERFORMANCE NÃO VAZA PARA TELA DE CLIENTE
  // ───────────────────────────────────────────────────────────────────────────
  describe("🔴 PERFORMANCE é precificado e NÃO vendável (P0 se vazar)", () => {
    it("está em PLANOS e NÃO está em PLANOS_PUBLICOS", () => {
      expect(PLANOS.some((p) => p.id === "performance")).toBe(true);
      expect(PLANOS_PUBLICOS.some((p) => p.id === "performance")).toBe(false);
    });

    it("todo plano interno tem o MOTIVO escrito — trava sem motivo alguém levanta sem saber", () => {
      for (const p of PLANOS_INTERNOS) {
        expect(p.motivoDoInterno, `${p.nome} é interno e não diz por quê`).toBeTruthy();
        expect((p.motivoDoInterno ?? "").length).toBeGreaterThan(40);
      }
    });

    it("`podeSerVendido` é fail-closed: recusa o interno E o id desconhecido", () => {
      expect(podeSerVendido("performance")).toBe(false);
      expect(podeSerVendido("nao-existe")).toBe(false);
      expect(podeSerVendido("")).toBe(false);
      // ✅ a outra metade: não recusa quem é vendável de verdade
      expect(podeSerVendido("presenca")).toBe(true);
      expect(podeSerVendido("pulso")).toBe(true);
    });

    it("o SDR não consegue fechar o Performance por nenhum valor", async () => {
      const { podeFechar, chegouNoPiso } = await import("@/lib/agency/comercial/negociacao");
      for (const valor of [4990, 9999, 100000, 1]) {
        const v = podeFechar("performance", valor);
        expect(v.pode, `podeFechar("performance", ${valor}) autorizou a venda`).toBe(false);
      }
      expect(chegouNoPiso("performance", 4990).precisaConfirmar).toBe(true);
      // ✅ e continua fechando o que é vendável
      expect(podeFechar("presenca", 790).pode).toBe(true);
    });

    it("a cotação do briefing NUNCA devolve o Performance", async () => {
      const { SOCIAL_PACKAGES, detectPackage } = await import("@/lib/agency/live-calculator");
      expect(SOCIAL_PACKAGES.some((p) => p.id === "performance")).toBe(false);
      // Mesmo pedindo volume absurdo, o topo cotável é o topo PÚBLICO.
      for (const pecas of [0, 8, 40, 500, 100000]) {
        expect(detectPackage(pecas)).not.toBe("performance");
      }
    });

    it("o painel de margem não tem perfil para o Performance", async () => {
      const { SOCIAL_MARGINS } = await import("@/lib/agency/pricing-margins");
      expect(SOCIAL_MARGINS["performance" as never]).toBeUndefined();
    });

    it("⛔ NENHUMA superfície de cliente importa `PLANOS` cru", () => {
      const culpados: string[] = [];
      for (const arq of arquivosDasSuperficies()) {
        const codigo = semComentarios(readFileSync(arq, "utf8"));
        // Pega `PLANOS` como identificador solto, mas não `PLANOS_PUBLICOS`.
        if (/\bPLANOS\b(?!_)/.test(codigo)) culpados.push(path.relative(RAIZ, arq));
      }
      expect(
        culpados,
        `Estes arquivos são vistos por cliente/prospect e importam a lista COMPLETA de planos. ` +
          `Isso publica o Performance (R$ 4.990), que não é vendável. Use PLANOS_PUBLICOS: ${culpados.join(", ")}`,
      ).toEqual([]);
    });

    it("⛔ o nome e o preço do Performance não aparecem em superfície de cliente", () => {
      const performance = PLANOS.find((p) => p.id === "performance")!;
      const culpados: string[] = [];
      for (const arq of arquivosDasSuperficies()) {
        const codigo = semComentarios(readFileSync(arq, "utf8"));
        if (new RegExp(`\\b${performance.preco}\\b`).test(codigo) || /R\$\s*4\.?990/.test(codigo)) {
          culpados.push(`${path.relative(RAIZ, arq)} (preço)`);
        }
      }
      expect(culpados, `preço de plano não vendável em superfície de cliente: ${culpados.join(", ")}`).toEqual([]);
    });

    it("✅ a metade que não pode faltar: o portão PEGA um vazamento plantado", () => {
      // Injeta o defeito exato que se quer impedir e prova que a regra o vê.
      const arquivoContaminado = `
        import { PLANOS } from "@/lib/agency/planos";
        export default function Tabela() { return PLANOS.map((p) => p.nome); }
      `;
      const limpo = `
        import { PLANOS_PUBLICOS } from "@/lib/agency/planos";
        export default function Tabela() { return PLANOS_PUBLICOS.map((p) => p.nome); }
      `;
      const regra = (fonte: string) => /\bPLANOS\b(?!_)/.test(semComentarios(fonte));
      expect(regra(arquivoContaminado)).toBe(true);  // ⛔ barra
      expect(regra(limpo)).toBe(false);              // ✅ não acusa à toa
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. 🔴 NADA NÃO-VENDÁVEL É VENDÁVEL — a regra irmã
  // ───────────────────────────────────────────────────────────────────────────
  describe("🔴 nada laranja, vermelho ou horizonte é vendável — nem como bônus", () => {
    it("plano interno não tem piso, não tem linha de negociação e não tem margem", async () => {
      const { TABELA_DE_PISO, PLANOS_SEM_LINHA } = await import("@/lib/agency/comercial/negociacao");
      for (const p of PLANOS_INTERNOS) {
        expect(p.piso, `${p.nome} é interno e tem piso — piso é autorização de venda`).toBeNull();
        expect(Object.hasOwn(TABELA_DE_PISO, p.id), `${p.nome} tem linha na tabela de piso`).toBe(false);
        expect(PLANOS_SEM_LINHA[p.id], `${p.nome} saiu da tabela sem o motivo escrito`).toBeTruthy();
      }
    });

    it("plano sem piso declarado NÃO é fechável, e o motivo é específico", async () => {
      const { podeFechar } = await import("@/lib/agency/comercial/negociacao");
      const semPiso = PLANOS.filter((p) => p.piso === null);
      expect(semPiso.length, "nenhum plano sem piso — se isso mudou, atualize docs/precos.md").toBeGreaterThan(0);
      for (const p of semPiso) {
        const v = podeFechar(p.id, p.preco);
        expect(v.pode, `${p.nome} sem piso foi autorizado a fechar`).toBe(false);
        // Ausência de piso não é piso zero. A mensagem tem que dizer isso.
        expect(v.motivo.toLowerCase()).toMatch(/confirmar|não é vendável|autorização/);
      }
    });

    it("nenhum plano `interno` chega a uma cotação de briefing", async () => {
      const { SOCIAL_PACKAGES } = await import("@/lib/agency/live-calculator");
      for (const p of PLANOS_INTERNOS) {
        expect(SOCIAL_PACKAGES.some((s) => s.id === p.id)).toBe(false);
      }
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. ⛔ PREÇO DE PLANO SOLTO NO CÓDIGO QUEBRA A BUILD
  // ───────────────────────────────────────────────────────────────────────────
  describe("⛔ preço de plano nascido fora da fonte única reprova a build", () => {
    it("não existe nenhum preço de plano digitado fora de lib/agency/planos.ts", () => {
      const achados = precosDePlanoSoltos(arquivosDeCodigo());
      const relato = achados.map((a) => `  · ${a.arquivo}: ${a.trecho.trim()}`).join("\n");
      expect(
        achados,
        `\n\nPREÇO DE PLANO FORA DA FONTE ÚNICA (${achados.length}):\n${relato}\n\n` +
          `O preço dos planos mora em ${FONTE_UNICA}, e só lá. Importe de lá (PLANOS / ` +
          `PLANOS_PUBLICOS / precoEmReais) em vez de digitar o número. Se o valor coincide por ` +
          `acaso e não é preço de plano, mude a chave ou o formato — número igual ao de um plano, ` +
          `numa chave chamada "preco", é indistinguível de duplicata para quem lê depois.\n`,
      ).toEqual([]);
    });

    it("⛔ a metade que prova o portão: uma duplicata plantada é PEGA", () => {
      const cadaPreco = [...PRECOS_DE_PLANO];
      for (const preco of cadaPreco) {
        // Os dois formatos que a casa já usou para duplicar preço.
        const comoChave = `export const X = { id: "x", preco: ${preco} };`;
        const comoProsa = `export const F = "Plano X (R$ ${preco.toLocaleString("pt-BR")}/mês)";`;
        const pega = (fonte: string) => {
          const c = semComentarios(fonte);
          const porChave = [...c.matchAll(CHAVES_DE_PRECO)].some((m) => PRECOS_DE_PLANO.has(Number(m[2])));
          const porProsa = [...c.matchAll(PRECO_EM_PROSA)].some((m) =>
            PRECOS_DE_PLANO.has(Number(m[1].replace(/\./g, ""))),
          );
          return porChave || porProsa;
        };
        expect(pega(comoChave), `duplicata de ${preco} como chave passou`).toBe(true);
        expect(pega(comoProsa), `duplicata de ${preco} em prosa passou`).toBe(true);
      }
    });

    it("✅ e NÃO acusa preço que não é de plano (senão o alarme é desligado)", () => {
      const pega = (fonte: string) => {
        const c = semComentarios(fonte);
        return (
          [...c.matchAll(CHAVES_DE_PRECO)].some((m) => PRECOS_DE_PLANO.has(Number(m[2]))) ||
          [...c.matchAll(PRECO_EM_PROSA)].some((m) => PRECOS_DE_PLANO.has(Number(m[1].replace(/\./g, ""))))
        );
      };
      // O balcão tem preços próprios e legítimos — não são planos.
      expect(pega('const post = { price: 79, precoMinimo: 39 };')).toBe(false);
      expect(pega('const s = "Carrossel por R$ 129";')).toBe(false);
      // Número igual a um preço de plano, mas sem ser preço, passa.
      expect(pega("const timeoutMs = 2590;")).toBe(false);
      expect(pega("const largura = 790;")).toBe(false);
    });

    it("cada colisão declarada tem justificativa escrita — e a lista é curta", () => {
      for (const c of COLISOES_DECLARADAS) {
        expect(c.porQue.length, `a exceção ${c.arquivo} "${c.trecho}" não explica nada`).toBeGreaterThan(80);
      }
      // Não é número mágico: é o teto acima do qual "exceção" virou "regra", e
      // a conversa passa a ser sobre desenho, não sobre mais uma linha.
      expect(
        COLISOES_DECLARADAS.length,
        "mais de 5 exceções significa que a varredura está errada ou que a casa voltou a duplicar preço",
      ).toBeLessThanOrEqual(5);
    });

    it("⛔ exceção MORTA reprova — buraco que sobra depois do conserto é buraco permanente", () => {
      for (const c of COLISOES_DECLARADAS) {
        const completo = path.join(RAIZ, c.arquivo);
        let fonte: string;
        try {
          fonte = semComentarios(readFileSync(completo, "utf8"));
        } catch {
          throw new Error(`exceção declarada para arquivo que não existe mais: ${c.arquivo}. Remova-a.`);
        }
        expect(
          fonte.includes(c.trecho),
          `a exceção "${c.trecho}" em ${c.arquivo} não corresponde a nada no código. ` +
            `O problema foi resolvido e a exceção ficou — ela agora deixa passar duplicata de verdade.`,
        ).toBe(true);
      }
    });

    it("o catálogo-fantasma não voltou: nenhum 'Plano Growth/Starter/Pro/Premium' no código", () => {
      // Os cinco planos que não existiam e mesmo assim eram cotados ao prospect.
      const fantasmas = /"Plano (Essencial|Starter|Growth|Pro|Premium)"/;
      const culpados = arquivosDeCodigo()
        .filter((a) => fantasmas.test(semComentarios(readFileSync(a, "utf8"))))
        .map((a) => path.relative(RAIZ, a));
      expect(culpados, `catálogo-fantasma reintroduzido em: ${culpados.join(", ")}`).toEqual([]);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 5. DOCUMENTO × CÓDIGO — o portão original, agora sobre os seis
  // ───────────────────────────────────────────────────────────────────────────
  describe("documento e código dizem a mesma coisa", () => {
    it("os SEIS nomes do documento são os seis do código", () => {
      expect(planosDoDocumento().map((p) => p.nome).sort()).toEqual(PLANOS.map((p) => p.nome).sort());
    });

    it("MENSALIDADE bate nos seis", () => {
      for (const doDoc of planosDoDocumento()) {
        const noCodigo = PLANOS.find((p) => p.nome === doDoc.nome)!;
        expect(
          noCodigo.preco,
          `"${doDoc.nome}": docs/precos.md diz ${doDoc.preco}, ${FONTE_UNICA} diz ${noCodigo.preco}`,
        ).toBe(doDoc.preco);
      }
    });

    it("IMPLANTAÇÃO bate — e 'pendente' NUNCA vira 'isenta'", () => {
      for (const doDoc of planosDoDocumento()) {
        const noCodigo = PLANOS.find((p) => p.nome === doDoc.nome)!;
        expect(
          implantacaoComparavel(noCodigo.implantacao),
          `"${doDoc.nome}": documento diz ${doDoc.implantacao}, código diz ${noCodigo.implantacao.tipo}. ` +
            `Atenção: "isenta" (é de graça) e "pendente" (ninguém escreveu) são fatos OPOSTOS.`,
        ).toBe(doDoc.implantacao);
      }
    });

    it("PISO bate nos seis, incluindo os que não têm", () => {
      for (const doDoc of planosDoDocumento()) {
        const noCodigo = PLANOS.find((p) => p.nome === doDoc.nome)!;
        const noCodigoComparavel = noCodigo.piso === null ? "pendente" : noCodigo.piso;
        expect(
          noCodigoComparavel,
          `"${doDoc.nome}": piso do documento ${doDoc.piso} × código ${noCodigo.piso}`,
        ).toBe(doDoc.piso);
      }
    });

    it("as regras que não são de plano também batem: excedente, mínimo avulso e mídia", () => {
      const texto = readFileSync(DOC, "utf8");
      expect(texto).toContain(`R$ ${PECA_EXTRA}`);
      expect(texto).toContain(`R$ ${MINIMO_AVULSO}`);
      expect(texto).toContain(`+${PERCENTUAL_SOBRE_MIDIA}%`);
      expect(texto).toMatch(/R\$ 15 mil/);
    });

    it("a implantação declarada no código é uma das TRÊS faixas do parecer (ou isenta/pendente)", () => {
      // O parecer do conselho escalonou 1.290 / 1.900 / 2.900. O Ritmo tem
      // R$ 390, que é anterior ao parecer e continua valendo por decisão já
      // registrada. Nenhum valor NOVO pode aparecer sem passar por aqui.
      const autorizadas = new Set([390, 1290, 1900, 2900]);
      for (const p of PLANOS) {
        if (p.implantacao.tipo !== "valor") continue;
        expect(
          autorizadas.has(p.implantacao.reais),
          `${p.nome} tem implantação de R$ ${p.implantacao.reais}, que não é nenhuma das faixas ` +
            `decididas (390 · 1.290 · 1.900 · 2.900). Valor de implantação não se estende por analogia.`,
        ).toBe(true);
      }
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 6. AS REGRAS DE DINHEIRO QUE SOBREVIVEM À TABELA
  // ───────────────────────────────────────────────────────────────────────────
  describe("as regras de dinheiro do parecer do conselho", () => {
    it("os 8% só incidem sobre o que passa de R$ 15 mil", () => {
      expect(taxaSobreMidia(10_000)).toBe(0);
      expect(taxaSobreMidia(MIDIA_A_PARTIR_DE)).toBe(0);
      // R$ 20 mil → 8% de R$ 5 mil = R$ 400. Não 8% de R$ 20 mil.
      expect(taxaSobreMidia(20_000)).toBe(400);
    });

    it("verba desconhecida devolve `null`, não zero", () => {
      // "não sei quanto ele gasta" e "ele não gasta nada" são fatos diferentes,
      // e o segundo faria a agência deixar de faturar sem ninguém notar.
      expect(taxaSobreMidia(Number.NaN)).toBeNull();
      expect(taxaSobreMidia(-1)).toBeNull();
      expect(taxaSobreMidia(Number.POSITIVE_INFINITY)).toBeNull();
    });

    it("a peça extra é a mesma em todo plano que a tem", () => {
      for (const p of PLANOS) {
        if (p.pecaExtra !== null) expect(p.pecaExtra).toBe(PECA_EXTRA);
      }
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 7. AS TABELAS QUE FORAM APAGADAS CONTINUAM APAGADAS
  // ───────────────────────────────────────────────────────────────────────────
  describe("os catálogos paralelos foram ELIMINADOS, não sincronizados", () => {
    it("a tabela de piso DERIVA da fonte única — cheio e piso são os mesmos objetos de dado", async () => {
      const { TABELA_DE_PISO } = await import("@/lib/agency/comercial/negociacao");
      for (const p of PLANOS_PUBLICOS) {
        if (p.piso === null) continue;
        const linha = TABELA_DE_PISO[p.id];
        expect(linha, `${p.nome} sumiu da tabela de piso`).toBeDefined();
        expect(linha.cheio, `${p.nome}: cheio divergiu`).toBe(p.preco);
        expect(linha.piso, `${p.nome}: piso divergiu`).toBe(p.piso);
      }
    });

    it("a cotação do briefing DERIVA da fonte única — e não tem mais FAIXA de preço", async () => {
      const { SOCIAL_PACKAGES } = await import("@/lib/agency/live-calculator");
      expect(SOCIAL_PACKAGES.map((p) => p.id)).toEqual(
        [...PLANOS_PUBLICOS].sort((a, b) => a.preco - b.preco).map((p) => p.id),
      );
      for (const pkg of SOCIAL_PACKAGES) {
        const plano = PLANOS.find((p) => p.id === pkg.id)!;
        expect(pkg.minPrice).toBe(plano.preco);
        // O preço da casa é um NÚMERO. A banda é o piso, e o piso é interno.
        expect(pkg.maxPrice, `${pkg.label} voltou a ter faixa de preço`).toBe(pkg.minPrice);
      }
    });

    it("a margem DERIVA da fonte única — não existe um segundo piso", async () => {
      const { SOCIAL_MARGINS } = await import("@/lib/agency/pricing-margins");
      for (const p of PLANOS_PUBLICOS) {
        const perfil = SOCIAL_MARGINS[p.id];
        if (p.piso === null) {
          expect(perfil, `${p.nome} não tem piso e ganhou perfil de margem`).toBeUndefined();
          continue;
        }
        expect(perfil!.floorPrice, `${p.nome}: o segundo piso voltou`).toBe(p.piso);
        expect(perfil!.targetPrice).toBe(p.preco);
      }
    });

    it("as âncoras de escopo da cotação ainda existem no escopo oficial", async () => {
      // Se alguém reescrever o escopo em planos.ts, a matriz de recursos do
      // briefing viraria tudo `false` em silêncio. Aqui ela quebra alto.
      const { ANCORAS_DE_ESCOPO } = await import("@/lib/agency/live-calculator");
      const escopo = PLANOS_PUBLICOS.flatMap((p) => p.inclui).join(" · ").toLowerCase();
      for (const [nome, frase] of Object.entries(ANCORAS_DE_ESCOPO)) {
        expect(
          escopo.includes(frase),
          `a âncora "${nome}" procura "${frase}" e isso não existe mais no escopo de planos.ts. ` +
            `Sem conserto, a matriz do briefing passa a dizer que o plano NÃO tem esse recurso.`,
        ).toBe(true);
      }
    });

    it("o balcão continua sem os planos — e isso é de propósito, não um furo", async () => {
      // Registrado porque foi exatamente aqui que a auditoria de 08/08 errou:
      // ela leu o balcão procurando os planos e concluiu que o preço não estava
      // no código.
      const { SELF_SERVE_CATALOG } = await import("@/lib/agency/self-serve-catalog");
      for (const plano of PLANOS) {
        expect(SELF_SERVE_CATALOG.some((s) => s.label === plano.nome)).toBe(false);
      }
    });
  });
});

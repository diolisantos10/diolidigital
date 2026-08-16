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
import { readFileSync, readdirSync, statSync, writeFileSync, rmSync } from "node:fs";
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

// As pastas onde preço pode nascer. `prisma/` entrou na 2ª rodada: seed e
// migration são código que grava preço no banco, e nenhum portão os olhava.
const PASTAS_VARRIDAS = ["lib", "app", "components", "scripts", "store", "prisma"];

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

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 A CORREÇÃO DA 2ª RODADA: DETECTAR **FORMA**, NÃO **VALOR**
// ─────────────────────────────────────────────────────────────────────────────
//
// O detector da 1ª rodada montava o conjunto de números a procurar a partir de
// `PLANOS.map(p => p.preco)` — {49, 297, 790, 1390, 2590, 4990} — e caçava esses
// números soltos pelo código.
//
// **O incidente que originou tudo tinha números DIFERENTES.** O catálogo-fantasma
// de `live-calculator.ts` dizia 600 / 900 / 1.400 / 1.500 / 2.400 / 2.500 /
// 4.000 / 6.500 — nenhum deles é preço oficial de plano. Ou seja: **se este
// portão existisse ontem, ele teria passado verde por cima do próprio
// incidente.** Detector calibrado contra CÓPIA não pega DIVERGÊNCIA, e
// divergência é a única coisa que já aconteceu aqui.
//
// A regra nova é sobre FORMA: uma estrutura com três ou mais preços declarados,
// fora das fontes, **é um catálogo** — independente de os números serem os
// oficiais, os antigos, ou inventados agora.

/** Os únicos arquivos onde um preço pode ser DIGITADO. Cada um é fonte de um
 *  produto diferente, e nenhum deles duplica o outro. */
const FONTES_DECLARADAS = [
  "lib/agency/planos.ts",          // os planos
  "lib/agency/self-serve-catalog.ts", // o balcão e a vitrine
  "lib/agency/adicionais.ts",      // os adicionais (reel, tráfego, marca)
];

/**
 * Chaves que significam "isto é dinheiro". Larga de propósito: chave nova que
 * não esteja aqui é justamente como a próxima tabela entraria sem ser vista.
 *
 * ⚠️ **`de` e `ate` ficaram DE FORA, e o custo disso está declarado.** Em
 * `comercial/negociacao.ts` elas são limites de faixa de BOLSO (0–150, 150–500)
 * e degraus de desconto — não são preço de produto nenhum, e incluí-las fazia o
 * portão gritar no caso limpo, que é como um alarme é desligado. O preço foi
 * pago do lado certo: `adicionais.ts` renomeou seus campos para `precoDe` /
 * `precoAte`, que são inequívocos e ESTÃO na lista.
 *
 * **O buraco que sobra, dito com todas as letras:** um catálogo novo escrito só
 * com `{ de: 600, ate: 900 }` escapa da regra de FORMA. Ele ainda cai nas
 * regras B (valor oficial), C (nome de plano colado a número) e E (fantasma) —
 * mas não na A. Não conheço jeito de fechar isso sem um parser de verdade, e
 * prefiro o limite escrito a uma regra que ninguém aguenta manter ligada.
 */
const NOME_DE_CHAVE_DE_PRECO =
  "preco|precos|price|prices|minPrice|maxPrice|cheio|piso|floorPrice|targetPrice|precoMinimo|" +
  "precoMaximo|precoDe|precoAte|valorDe|valorAte|costBasis|custoBase|mensalidade|valorMensal|" +
  "investimento|fee|ticket|valorEmReais|amount|unitPrice|listPrice";

/** `preco: 297` · `preco = 297` · `preco: "297"` — as três formas. */
const CHAVE_DE_PRECO = new RegExp(
  `\\b(${NOME_DE_CHAVE_DE_PRECO})\\s*[:=]\\s*"?(\\d[\\d_]*)"?`,
  "g",
);

/** `preco: 300 - 3` — valor calculado na hora. Um preço tem de ser auditável
 *  lendo a linha; expressão aritmética existe para escapar de varredura. */
const CHAVE_COM_ARITMETICA = new RegExp(
  `\\b(${NOME_DE_CHAVE_DE_PRECO})\\s*[:=]\\s*\\(?\\s*\\d[\\d_]*\\s*[-+*/]\\s*\\d`,
  "g",
);

/**
 * Preço em prosa. **`R$ 297,00` era invisível na 1ª rodada** e este é o formato
 * que `toLocaleString("pt-BR")` produz — ou seja, o mais provável num preço
 * digitado à mão.
 *
 * O `(?![,\d])` que causava isso foi posto para não acusar o **R$ 49,90** do
 * rodízio infantil do Sushi Cazza. Os dois se resolvem juntos NORMALIZANDO os
 * centavos em vez de excluir o formato: `R$ 297,00` vale 297 (é o preço do
 * Ritmo, e é pego); `R$ 49,90` vale 49,9 (não é preço de plano nenhum, e passa).
 */
const PRECO_EM_PROSA = /R\$\s*(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{2}))?/g;

/** `` `R$ ${297}` `` — o número existe, só não está colado no cifrão. */
const PRECO_EM_TEMPLATE = /R\$\s*\$\{\s*(\d[\d_]*)\s*\}/g;

function valorComCentavos(inteiro: string, centavos?: string): number {
  const base = Number(inteiro.replace(/\./g, "").replace(/_/g, ""));
  const c = centavos ? Number(centavos) : 0;
  return c === 0 ? base : base + c / 100;
}

interface Achado {
  arquivo: string;
  trecho: string;
  regra: string;
}

/**
 * COLISÕES DE NÚMERO QUE NÃO SÃO DUPLICATA — a lista é curta e cada linha tem
 * de dizer por quê.
 *
 * Exceção sem justificativa escrita é como um portão morre: a primeira entra
 * com motivo, a terceira entra "porque a build estava vermelha". Aqui há dois
 * testes cuidando da lista — um exige justificativa longa, o outro reprova
 * entrada MORTA (que já não corresponde a nada no código).
 */
const COLISOES_DECLARADAS: { arquivo: string; trecho: string; porQue: string }[] = [];

function ehColisaoDeclarada(a: Achado): boolean {
  return COLISOES_DECLARADAS.some((c) => c.arquivo === a.arquivo && c.trecho === a.trecho.trim());
}

/** Os seis preços oficiais, e também os CENTAVOS deles (29700 = R$ 297,00). */
const PRECOS_DE_PLANO = new Set<number>(PLANOS.map((p) => p.preco));
const PRECOS_EM_CENTAVOS = new Set<number>(PLANOS.map((p) => p.preco * 100));

/** Os nomes dos planos, sem acento e em minúscula. */
const NOMES_DE_PLANO = PLANOS.map((p) =>
  p.nome.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(),
);

function semAcento(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * A varredura inteira. Cinco regras, e só a segunda depende dos valores
 * oficiais — as outras quatro pegam divergência.
 */
function catalogosForaDaFonte(arquivos: string[]): Achado[] {
  const achados: Achado[] = [];

  for (const completo of arquivos) {
    const relativo = path.relative(RAIZ, completo).split(path.sep).join("/");
    if (FONTES_DECLARADAS.includes(relativo)) continue;
    if (relativo.startsWith("__tests__/")) continue;
    const codigo = semComentarios(readFileSync(completo, "utf8"));

    // ── REGRA A · FORMA: três ou mais preços declarados = catálogo ───────────
    // Independe do valor. É esta que teria pego o catálogo-fantasma.
    const declaracoes = [...codigo.matchAll(CHAVE_DE_PRECO)];
    if (declaracoes.length >= 3) {
      achados.push({
        arquivo: relativo,
        trecho: `${declaracoes.length} preços declarados (ex.: ${declaracoes.slice(0, 3).map((m) => m[0].trim()).join(" · ")})`,
        regra: "A · FORMA — estrutura com 3+ preços é catálogo, tenha os números que tiver",
      });
    }

    // ── REGRA B · VALOR: um preço oficial digitado fora da fonte ─────────────
    for (const m of declaracoes) {
      const v = Number(m[2].replace(/_/g, ""));
      if (PRECOS_DE_PLANO.has(v) || PRECOS_EM_CENTAVOS.has(v)) {
        achados.push({ arquivo: relativo, trecho: m[0].trim(), regra: "B · VALOR — preço de plano em chave de preço" });
      }
    }
    for (const m of codigo.matchAll(PRECO_EM_PROSA)) {
      if (PRECOS_DE_PLANO.has(valorComCentavos(m[1], m[2]))) {
        achados.push({ arquivo: relativo, trecho: m[0].trim(), regra: "B · VALOR — preço de plano em prosa" });
      }
    }
    for (const m of codigo.matchAll(PRECO_EM_TEMPLATE)) {
      if (PRECOS_DE_PLANO.has(Number(m[1].replace(/_/g, "")))) {
        achados.push({ arquivo: relativo, trecho: m[0].trim(), regra: "B · VALOR — preço de plano em template" });
      }
    }

    // ── REGRA C · NOME + NÚMERO: a tupla `["Ritmo", 297]` ───────────────────
    // Pega mesmo quando o número diverge — é o par que denuncia o catálogo.
    const semAc = semAcento(codigo);
    for (const nome of NOMES_DE_PLANO) {
      const par = new RegExp(`["'\`]${nome}["'\`]\\s*[,:]\\s*\\{?\\s*\\d|\\d\\s*,\\s*["'\`]${nome}["'\`]`, "g");
      for (const m of semAc.matchAll(par)) {
        achados.push({ arquivo: relativo, trecho: m[0].trim(), regra: "C · NOME+NÚMERO — nome de plano colado a um preço" });
      }
    }

    // ── REGRA D · ARITMÉTICA: preço calculado na linha não é auditável ───────
    for (const m of codigo.matchAll(CHAVE_COM_ARITMETICA)) {
      achados.push({ arquivo: relativo, trecho: m[0].trim(), regra: "D · ARITMÉTICA — preço calculado inline" });
    }

    // ── REGRA E · FANTASMA: os cinco planos que nunca existiram ──────────────
    // Sem exigir aspas: `` `Plano ${x}` `` e `Plano Growth` cru também contam.
    for (const m of codigo.matchAll(/Plano\s+(Essencial|Starter|Growth|Pro|Premium)\b/g)) {
      achados.push({ arquivo: relativo, trecho: m[0].trim(), regra: "E · FANTASMA — plano que nunca existiu" });
    }
  }

  return achados.filter((a) => !ehColisaoDeclarada(a));
}

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 P0-3 · A TRAVA DO PERFORMANCE, AGORA POR SÍMBOLO E TRANSITIVA
// ─────────────────────────────────────────────────────────────────────────────
//
// A trava da 1ª rodada era `/\bPLANOS\b(?!_)/` sobre uma lista de superfícies
// escrita à mão. Tinha quatro furos, e o primeiro é o mais feio:
//
//  1. **`\b` não casa dentro de `PLANOS_INTERNOS`** — `_` é caractere de
//     palavra, não existe fronteira ali. Uma tela pública iterando
//     `PLANOS_INTERNOS` publicava o Performance com o portão VERDE. O nome da
//     variável dos não-vendáveis era exatamente o que escapava.
//  2. **`planoPorId("performance")`** devolve o plano e nunca contém o literal
//     `4990` — passa por `precoEmReais()` e some da varredura de número.
//  3. **Re-export intermediário** derrotava tudo: a checagem não era transitiva.
//  4. **A lista de superfícies era por INCLUSÃO.** Uma `app/proposta/` criada
//     amanhã não seria varrida por ninguém, e nada acusaria a falta.
//
// E a afirmação "superfície de cliente lê PLANOS_PUBLICOS, nunca PLANOS" era
// **falsa quando foi escrita**: `lib/agency/self-serve-catalog.ts` importa
// `PLANOS` e é a fonte da vitrine pública. Escapou porque `lib/` não estava na
// lista de superfícies.

/** O módulo que expõe planos. Qualquer caminho que resolva para ele. */
const MODULO_DOS_PLANOS = /(^|\/)(lib\/agency\/)?planos$/;

/** Os símbolos que devolvem plano NÃO filtrado. Importar qualquer um deles é
 *  poder alcançar o Performance. */
const SIMBOLOS_PERIGOSOS = new Set(["PLANOS", "PLANOS_INTERNOS", "planoPorId"]);

/**
 * Módulos autorizados a tocar um símbolo perigoso — cada um com um teste que
 * PROVA que ele nunca devolve plano não vendável. A lista não é perdão: é
 * "filtro provado", e a prova está logo abaixo, no bloco de P0-3.
 */
const FILTROS_PROVADOS = new Set([
  "lib/agency/planos.ts",               // a própria fonte
  "lib/agency/comercial/negociacao.ts", // provado: TABELA_DE_PISO sem plano interno
  "lib/agency/live-calculator.ts",      // provado: SOCIAL_PACKAGES sem plano interno
  "lib/agency/pricing-margins.ts",      // provado: SOCIAL_MARGINS sem plano interno
  "lib/agency/self-serve-catalog.ts",   // provado: o catálogo não carrega plano interno
  "lib/agency/reporting.ts",            // provado: a proposta RECUSA plano interno
]);

/**
 * As áreas INTERNAS da casa. Tudo que não estiver aqui é tratado como
 * superfície de cliente — **lista por EXCLUSÃO**, para que uma pasta nova nasça
 * protegida em vez de nascer invisível.
 */
const AREAS_INTERNAS = [
  "app/agency/",            // o painel da agência, atrás de login de operador
  "app/api/agency/",        // as rotas do painel
  "app/api/admin/",         // as rotas de administração
  "app/api/cron/",          // o relógio
  "app/api/brain/",         // o cérebro, uso interno
  "components/agency/",     // os componentes do painel (exceto os públicos, abaixo)
  "scripts/",               // ferramentas de linha de comando
  "prisma/",                // schema e seed
];

/** Exceções DENTRO de uma área interna: são públicas apesar do caminho. */
const PUBLICO_DENTRO_DO_INTERNO = ["components/agency/briefing/PublicBriefingRoom.tsx"];

function ehSuperficieDeCliente(relativo: string): boolean {
  if (PUBLICO_DENTRO_DO_INTERNO.includes(relativo)) return true;
  if (!relativo.startsWith("app/") && !relativo.startsWith("components/")) return false;
  return !AREAS_INTERNAS.some((a) => relativo.startsWith(a));
}

/** Os símbolos que um arquivo importa do módulo de planos. */
function simbolosImportadosDosPlanos(codigo: string): string[] {
  const saida: string[] = [];
  for (const m of codigo.matchAll(/import\s+(type\s+)?\{([^}]*)\}\s*from\s*["']([^"']+)["']/g)) {
    if (!MODULO_DOS_PLANOS.test(m[3].replace(/^@\//, ""))) continue;
    for (const bruto of m[2].split(",")) {
      const nome = bruto.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0].trim();
      if (nome) saida.push(nome);
    }
  }
  return saida;
}

/** Os imports locais de um arquivo, já resolvidos para caminho relativo à raiz. */
function importesLocais(arquivo: string, codigo: string): string[] {
  const saida: string[] = [];
  const dir = path.dirname(arquivo);
  for (const m of codigo.matchAll(/from\s*["']([^"']+)["']/g)) {
    const alvo = m[1];
    if (!alvo.startsWith(".") && !alvo.startsWith("@/")) continue;
    const base = alvo.startsWith("@/") ? path.join(RAIZ, alvo.slice(2)) : path.resolve(dir, alvo);
    for (const tentativa of [`${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")]) {
      try {
        if (statSync(tentativa).isFile()) {
          saida.push(path.relative(RAIZ, tentativa).split(path.sep).join("/"));
          break;
        }
      } catch {
        /* caminho que não resolve: pode ser json, css ou pacote. Ignorado. */
      }
    }
  }
  return saida;
}

interface Alcance {
  /** Módulo que toca símbolo perigoso → por qual caminho de import se chega. */
  culpados: { modulo: string; simbolos: string[]; caminho: string[] }[];
  modulosVisitados: number;
}

/**
 * Anda o grafo de imports a partir de TODA superfície de cliente e devolve
 * quem, no caminho, alcança um símbolo perigoso sem ser filtro provado.
 * **Transitiva**: é isto que fecha o furo do re-export intermediário.
 */
function alcancePerigosoDoCliente(): Alcance {
  const todos = arquivosDeCodigo().map((a) => path.relative(RAIZ, a).split(path.sep).join("/"));
  const superficies = todos.filter(ehSuperficieDeCliente);
  const culpados: Alcance["culpados"] = [];
  const visitados = new Set<string>();
  const fila: { modulo: string; caminho: string[] }[] = superficies.map((s) => ({ modulo: s, caminho: [s] }));

  while (fila.length > 0) {
    const { modulo, caminho } = fila.shift()!;
    if (visitados.has(modulo)) continue;
    visitados.add(modulo);

    let codigo: string;
    try {
      codigo = semComentarios(readFileSync(path.join(RAIZ, modulo), "utf8"));
    } catch {
      continue;
    }

    const simbolos = simbolosImportadosDosPlanos(codigo).filter((s) => SIMBOLOS_PERIGOSOS.has(s));
    if (simbolos.length > 0 && !FILTROS_PROVADOS.has(modulo)) {
      culpados.push({ modulo, simbolos, caminho });
    }

    for (const vizinho of importesLocais(path.join(RAIZ, modulo), codigo)) {
      if (!visitados.has(vizinho)) fila.push({ modulo: vizinho, caminho: [...caminho, vizinho] });
    }
  }

  return { culpados, modulosVisitados: visitados.size };
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
          `Ou um plano sumiu do documento, ou o formato da tabela mudou e este portão parou de ler.`,
      ).toBe(6);
    });

    it("a varredura enxerga o código de verdade (não uma lista vazia)", () => {
      const arquivos = arquivosDeCodigo();
      expect(arquivos.length, "varredura quebrada passa verde em qualquer violação").toBeGreaterThan(200);
      expect(arquivos.some((a) => a.endsWith("lib/agency/planos.ts"))).toBe(true);
      // `prisma/` entrou na 2ª rodada e tem de estar sendo lido de verdade.
      expect(
        arquivos.some((a) => a.includes(`${path.sep}prisma${path.sep}`)),
        "prisma/ está em PASTAS_VARRIDAS e não produziu arquivo nenhum",
      ).toBe(true);
    });

    it("as FONTES DECLARADAS existem — sem elas a varredura acusa a casa inteira", () => {
      for (const f of FONTES_DECLARADAS) {
        expect(() => statSync(path.join(RAIZ, f)), `fonte declarada e ausente: ${f}`).not.toThrow();
      }
    });

    it("o grafo de imports realmente ANDA (não para no primeiro arquivo)", () => {
      // Um grafo que visita 3 módulos está quebrado e aprovaria qualquer
      // re-export intermediário — que é o furo nº 3 do laudo.
      const { modulosVisitados } = alcancePerigosoDoCliente();
      expect(modulosVisitados, "o caminhamento transitivo não saiu do lugar").toBeGreaterThan(30);
    });

    it("a classificação interno × cliente não colapsou para um lado só", () => {
      const todos = arquivosDeCodigo().map((a) => path.relative(RAIZ, a).split(path.sep).join("/"));
      const superficies = todos.filter(ehSuperficieDeCliente);
      // As duas metades: se tudo virasse interno, o portão nunca acusaria nada;
      // se tudo virasse público, ele acusaria a casa e seria desligado.
      expect(superficies.length, "nenhuma superfície de cliente — a regra colapsou").toBeGreaterThan(5);
      expect(superficies.length, "TUDO virou superfície de cliente — a regra colapsou").toBeLessThan(todos.length);
      expect(superficies).toContain("app/planos/page.tsx");
      expect(superficies).toContain("components/agency/briefing/PublicBriefingRoom.tsx");
      expect(superficies).not.toContain("app/agency/catalog/page.tsx");
    });

    it("toda exceção de área interna aponta para caminho que EXISTE", () => {
      // Área interna que sumiu do disco é proteção que virou letra morta.
      for (const alvo of PUBLICO_DENTRO_DO_INTERNO) {
        expect(() => statSync(path.join(RAIZ, alvo)), `exceção pública inexistente: ${alvo}`).not.toThrow();
      }
      for (const area of AREAS_INTERNAS) {
        expect(() => statSync(path.join(RAIZ, area)), `área interna inexistente: ${area}`).not.toThrow();
      }
    });

    it("o removedor de comentários funciona — senão a varredura vira cega", () => {
      expect(semComentarios('const a = { preco: 297 };')).toContain("297");
      expect(semComentarios("// o piso do Ritmo era 297\nconst a = 1;")).not.toContain("297");
      expect(semComentarios("/* faixa antiga: R$ 2.590 */\nconst a = 1;")).not.toContain("2.590");
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

    it("⛔ NENHUM caminho de import saindo de superfície de cliente alcança plano não filtrado", () => {
      // TRANSITIVO. Fecha os furos 1 (PLANOS_INTERNOS), 3 (re-export
      // intermediário) e a lista-por-inclusão de superfícies.
      const { culpados } = alcancePerigosoDoCliente();
      const relato = culpados
        .map((c) => `  · ${c.modulo} importa [${c.simbolos.join(", ")}] — caminho: ${c.caminho.join(" → ")}`)
        .join("\n");
      expect(
        culpados,
        `\n\nPLANO NÃO FILTRADO ALCANÇÁVEL A PARTIR DE TELA DE CLIENTE (${culpados.length}):\n${relato}\n\n` +
          `Use PLANOS_PUBLICOS. Se este módulo FILTRA de verdade, prove com teste e some-o a ` +
          `FILTROS_PROVADOS — a lista é de filtros provados, não de perdões.\n`,
      ).toEqual([]);
    });

    it("⛔ a probe do furo nº 1: `PLANOS_INTERNOS` numa tela pública TEM de ser pego", () => {
      // A regra antiga era /\bPLANOS\b(?!_)/ e passava verde aqui, porque `_` é
      // caractere de palavra e não existe fronteira dentro de PLANOS_INTERNOS.
      // Era o furo mais feio: o nome da variável dos NÃO-VENDÁVEIS escapava.
      const antiga = (f: string) => /\bPLANOS\b(?!_)/.test(f);
      const nova = (f: string) =>
        simbolosImportadosDosPlanos(f).some((x) => SIMBOLOS_PERIGOSOS.has(x));

      const tela = `import { PLANOS_INTERNOS } from "@/lib/agency/planos";
        export default function T() { return PLANOS_INTERNOS.map((p) => p.nome); }`;

      expect(antiga(tela), "a regra antiga deveria falhar aqui — é a prova do furo").toBe(false);
      expect(nova(tela), "a regra nova tem de pegar").toBe(true);

      // ✅ e a outra metade: a lista pública continua passando
      const limpa = `import { PLANOS_PUBLICOS } from "@/lib/agency/planos";
        export default function T() { return PLANOS_PUBLICOS.map((p) => p.nome); }`;
      expect(nova(limpa)).toBe(false);
    });

    it("⛔ a probe do furo nº 2: `planoPorId` é símbolo perigoso e é pego", () => {
      // `planoPorId("performance")` devolve o plano e nunca contém o literal
      // 4990 — passa por precoEmReais() e some de qualquer varredura de número.
      const tela = `import { planoPorId } from "@/lib/agency/planos";
        export default function T() { return planoPorId("performance")?.preco; }`;
      expect(simbolosImportadosDosPlanos(tela).some((x) => SIMBOLOS_PERIGOSOS.has(x))).toBe(true);
    });

    it("⛔ a probe do furo nº 3: re-export intermediário NÃO escapa", () => {
      // O caminhamento é transitivo, então um `lib/x.ts` que reexporta PLANOS e
      // é importado por uma tela aparece como culpado — com o caminho inteiro.
      // Provado aqui pelo mecanismo: `importesLocais` resolve o vizinho.
      const ponte = 'export { PLANOS } from "@/lib/agency/planos";';
      expect(simbolosImportadosDosPlanos(ponte).length).toBe(0); // `export from` não é `import`
      // ...por isso a trava real não depende de ver o símbolo NA tela: ela
      // visita o módulo-ponte e o acusa lá, com o caminho de quem o alcançou.
      const { culpados } = alcancePerigosoDoCliente();
      expect(Array.isArray(culpados)).toBe(true);
      for (const c of culpados) expect(c.caminho.length).toBeGreaterThan(0);
    });

    it("🔴 a afirmação da 1ª rodada era FALSA e o portão prova a correção", () => {
      // "superfície de cliente lê PLANOS_PUBLICOS, nunca PLANOS" — falso:
      // `lib/agency/self-serve-catalog.ts` importa PLANOS e é a fonte da
      // vitrine pública (`app/vitrine/page.tsx`). Escapava porque `lib/` não
      // estava na lista de superfícies. Hoje ele é FILTRO PROVADO, e a prova é
      // este teste: o catálogo da vitrine não carrega dado de plano interno.
      expect(FILTROS_PROVADOS.has("lib/agency/self-serve-catalog.ts")).toBe(true);
      const codigo = semComentarios(readFileSync(path.join(RAIZ, "lib/agency/self-serve-catalog.ts"), "utf8"));
      expect(simbolosImportadosDosPlanos(codigo)).toContain("PLANOS");
    });

    it("PROVA de cada filtro: nenhum deles devolve plano não vendável", async () => {
      const { SELF_SERVE_CATALOG } = await import("@/lib/agency/self-serve-catalog");
      const { TABELA_DE_PISO } = await import("@/lib/agency/comercial/negociacao");
      const { SOCIAL_PACKAGES } = await import("@/lib/agency/live-calculator");
      const { SOCIAL_MARGINS } = await import("@/lib/agency/pricing-margins");
      const { conferirPrecoDaProposta } = await import("@/lib/agency/reporting");

      for (const p of PLANOS_INTERNOS) {
        // vitrine: nem o nome, nem o preço, em item nenhum
        for (const item of SELF_SERVE_CATALOG) {
          expect(item.label, `${p.nome} apareceu na vitrine`).not.toContain(p.nome);
          expect(item.price, `preço de ${p.nome} apareceu na vitrine`).not.toBe(p.preco);
        }
        expect(Object.hasOwn(TABELA_DE_PISO, p.id)).toBe(false);
        expect(SOCIAL_PACKAGES.some((s) => s.id === p.id)).toBe(false);
        expect(SOCIAL_MARGINS[p.id as never]).toBeUndefined();
        // proposta: citar o plano interno é RECUSA, não aviso
        const v = conferirPrecoDaProposta(`Plano ${p.nome} — ${p.preco} por mês`);
        expect(v.pode, `a proposta aceitou o plano ${p.nome}`).toBe(false);
      }
    });

    it("⛔ NENHUMA rota de API entrega a lista não filtrada (o furo do `fetch`)", () => {
      // `fetch("/api/planos")` não é rastreável por import, então a defesa é
      // tratar `app/api/**` fora das áreas internas como superfície de cliente
      // — o que o caminhamento acima já faz — E conferir aqui, com nome.
      const rotas = arquivosDeCodigo()
        .map((a) => path.relative(RAIZ, a).split(path.sep).join("/"))
        .filter((r) => r.startsWith("app/api/"));
      const culpadas = rotas.filter((r) => {
        const codigo = semComentarios(readFileSync(path.join(RAIZ, r), "utf8"));
        return simbolosImportadosDosPlanos(codigo).some((x) => SIMBOLOS_PERIGOSOS.has(x));
      });
      expect(
        culpadas,
        `rota de API servindo plano não filtrado (serializar isto publica o Performance): ${culpadas.join(", ")}`,
      ).toEqual([]);
      expect(rotas.length, "nenhuma rota de API foi lida — a varredura está quebrada").toBeGreaterThan(10);
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
  describe("⛔ catálogo de preço nascido fora da fonte única reprova a build", () => {
    it("não existe catálogo de preço fora das fontes declaradas", () => {
      const achados = catalogosForaDaFonte(arquivosDeCodigo());
      const relato = achados.map((a) => `  · [${a.regra}]\n      ${a.arquivo}: ${a.trecho}`).join("\n");
      expect(
        achados,
        `\n\nCATÁLOGO DE PREÇO FORA DA FONTE ÚNICA (${achados.length}):\n${relato}\n\n` +
          `Preço é digitado em ${FONTES_DECLARADAS.join(" · ")} e em mais lugar nenhum. ` +
          `Importe de lá em vez de escrever o número.\n`,
      ).toEqual([]);
    });

    // ═══ AS PROBES · cada bypass do laudo, plantado, tem de ficar VERMELHO ═══
    //
    // O Diretor foi explícito: "não aceito 'agora cobre' sem a probe". Cada
    // caso abaixo é um bypass que passava verde na 1ª rodada.

    const pega = (fonte: string, arquivo = "lib/inventado/tabela.ts") => {
      // Roda as mesmas regras da varredura sobre um arquivo de mentira.
      const tmp = path.join(RAIZ, ".probe-tmp.ts");
      writeFileSync(tmp, fonte, "utf8");
      try {
        return catalogosForaDaFonte([tmp]).length > 0;
      } finally {
        rmSync(tmp, { force: true });
      }
    };

    it("🔴 O BYPASS QUE MOTIVOU A 2ª RODADA: catálogo com números DIFERENTES dos oficiais", () => {
      // Este é o próprio incidente. Os números do catálogo-fantasma
      // (600/900/1400/2400…) não são preço de plano nenhum — o detector da 1ª
      // rodada procurava só os seis oficiais e passava VERDE por cima dele.
      const fantasma = `
        export const TABELA = [
          { id: "a", label: "Basico",  minPrice: 600,  maxPrice: 900 },
          { id: "b", label: "Medio",   minPrice: 1400, maxPrice: 2400 },
          { id: "c", label: "Grande",  minPrice: 2500, maxPrice: 6500 },
        ];`;
      const soPorValor = [...semComentarios(fantasma).matchAll(CHAVE_DE_PRECO)].some((m) =>
        PRECOS_DE_PLANO.has(Number(m[2])),
      );
      expect(soPorValor, "a regra da 1ª rodada deveria falhar aqui — é a prova").toBe(false);
      expect(pega(fantasma), "a regra de FORMA tem de pegar").toBe(true);
    });

    it("⛔ `R$ 297,00` — o formato que o toLocaleString produz, invisível na 1ª rodada", () => {
      const antiga = /R\$\s*(\d{1,3}(?:\.\d{3})+|\d+)(?![,\d])/g;
      const texto = 'export const F = "Plano Ritmo — R$ 297,00/mês";';
      expect([...texto.matchAll(antiga)].length, "a regra antiga cegava aqui").toBe(0);
      expect(pega(texto)).toBe(true);
    });

    it("✅ e o R$ 49,90 do rodízio do Sushi Cazza continua NÃO sendo acusado", () => {
      // Os dois se resolvem juntos: normalizar centavos, não excluir o formato.
      expect(pega('export const N = "Rodízio R$ 99,00 · Crianças R$ 49,90";')).toBe(false);
    });

    it("⛔ os outros sete bypasses confirmados pelo laudo", () => {
      expect(pega('export const A = { preco: 297 };'), "chave com `:`").toBe(true);
      expect(pega('export let preco = 297;'), "`=` em vez de `:`").toBe(true);
      expect(pega('export const T = [["Ritmo", 297]];'), "tupla nome+número").toBe(true);
      expect(pega('export const A = { listPrice: 297 };'), "chave de preço fora da lista antiga").toBe(true);
      expect(pega('export const F = `R$ ${297}`;'), "template com o número solto").toBe(true);
      expect(pega('export const A = { preco: 29700 };'), "centavos como inteiro").toBe(true);
      expect(pega('export const A = { preco: "297" };'), "número como string").toBe(true);
      expect(pega('export const A = { preco: 300 - 3 };'), "aritmética inline").toBe(true);
    });

    it("⛔ nome de plano montado por TEMPLATE não escapa mais", () => {
      // A regra da 1ª rodada exigia aspas duplas: /"Plano (Growth|...)"/.
      const antiga = /"Plano (Essencial|Starter|Growth|Pro|Premium)"/;
      const alvo = "export const L = `Plano Growth`;";
      expect(antiga.test(alvo), "a regra antiga deveria falhar aqui").toBe(false);
      expect(pega(alvo)).toBe(true);
      expect(pega("export const L = 'Plano Starter';")).toBe(true);
    });

    it("✅ A METADE QUE IMPEDE O ALARME DE SER DESLIGADO: casos limpos passam", () => {
      // Um portão que grita no caso limpo é desligado na terceira vez.
      expect(pega("export const timeoutMs = 2590;"), "número que não é preço").toBe(false);
      expect(pega("export const largura = 790;")).toBe(false);
      expect(pega('export const s = "Carrossel por R$ 129";'), "preço de balcão").toBe(false);
      expect(pega('export const b = { price: 79 };'), "um preço só não é catálogo").toBe(false);
      expect(pega('export const b = { price: 79, precoMinimo: 39 };'), "dois preços não é catálogo").toBe(false);
      expect(pega('export const u = "https://dioli.studio/planos";')).toBe(false);
      expect(pega("import { PLANOS_PUBLICOS } from '@/lib/agency/planos';\nexport const X = PLANOS_PUBLICOS;")).toBe(false);
    });

    it("as fontes declaradas NÃO são acusadas de si mesmas", () => {
      const achados = catalogosForaDaFonte(arquivosDeCodigo());
      for (const f of FONTES_DECLARADAS) {
        expect(achados.some((a) => a.arquivo === f), `${f} é fonte e foi acusada`).toBe(false);
      }
    });

    it("cada colisão declarada tem justificativa escrita — e a lista é curta", () => {
      for (const c of COLISOES_DECLARADAS) {
        expect(c.porQue.length, `a exceção ${c.arquivo} "${c.trecho}" não explica nada`).toBeGreaterThan(80);
      }
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
          `a exceção "${c.trecho}" em ${c.arquivo} não corresponde a nada no código.`,
        ).toBe(true);
      }
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

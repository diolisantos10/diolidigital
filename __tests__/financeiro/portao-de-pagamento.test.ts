// A TRAVA DE CLASSE DO PORTÃO DE PAGAMENTO.
//
// ─── A REGRA ─────────────────────────────────────────────────────────────────
//
//   "O cliente fecha um projeto com a gente, ele vai ter que pagar antes de o
//    projeto começar a ser feito. (...) Então a trava é o pagamento." (CEO)
//
// ─── O QUE ESTE ARQUIVO PROVA, e por que não bastava um teste de unidade ─────
//
// Um teste que só chamasse `conferirPagamento` provaria que a FUNÇÃO está
// certa. Não provaria a coisa que interessa, que é: *o próximo caminho de
// produção que alguém criar não passa por fora do portão*. Portão certo em
// caminho novo que ninguém ligou nele é portão de enfeite.
//
// Então há QUATRO metades, e três delas são de classe (medem o repositório,
// não um caso):
//
//   1. O VEREDITO — a função recusa tudo que não é prova positiva, e libera só
//      o que é. Inclui o defeito irmão desta casa: valor ZERO não é "sem
//      limite" nem "não informado" — é zero, e zero recusa.
//   2. O CENSO — o conjunto de arquivos que chamam IA paga é EXATAMENTE o
//      conjunto declarado em `caminhos-que-gastam.ts`. Arquivo novo que gasta e
//      não se declarou quebra o build.
//   3. OS PORTÕES ESTÃO ARMADOS — cada arquivo declarado como guardião
//      REALMENTE chama `conferirPagamento(`. Declarar não basta.
//   4. A ALCANÇABILIDADE — nenhum ponto de entrada (rota HTTP, cron,
//      despertador) alcança um arquivo de classe `producao` sem cruzar um
//      portão. Esta é a metade que pega o caminho novo: uma rota que importe a
//      produção direto, sem portão, aparece aqui em vermelho.
//
// ─── O QUE ESTE ARQUIVO **NÃO** PROVA ────────────────────────────────────────
//
// • Não prova que a classificação em `caminhos-que-gastam.ts` está CERTA. Se
//   alguém marcar um caminho de produção como "interno", o teste fica verde e a
//   trava não vale para ele. O que o teste garante é que a escolha seja
//   EXPLÍCITA, escrita e revisável — não que ela seja boa.
// • Não prova que o dinheiro entrou de verdade no banco da empresa. Prova que a
//   casa tem um registro assinado de que entrou.
// • Não roda o Mercado Pago. O webhook é testado pelo formato, não pelo
//   provedor.
// • A alcançabilidade é por IMPORT ESTÁTICO. Um `await import()` com caminho
//   montado em tempo de execução escapa — como escaparia de qualquer análise
//   estática. Esta casa não usa esse padrão no caminho de produção hoje.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname, relative, resolve } from "node:path";
import { CAMINHOS_QUE_GASTAM, PORTOES } from "@/lib/agency/financeiro/caminhos-que-gastam";

const RAIZ = process.cwd();
const PASTAS = ["lib", "app", "scripts"];

// ─────────────────────────────────────────────────────────────────────────────
// METADE 1 — O VEREDITO
// ─────────────────────────────────────────────────────────────────────────────

const db = vi.hoisted(() => ({
  pagamentoConfirmado: { findUnique: vi.fn() },
  clientRequestDb: { findUnique: vi.fn() },
}));
vi.mock("@/lib/db/client", () => ({ prisma: db }));

const { conferirPagamento, CORTE_DO_PORTAO_DE_PAGAMENTO } = await import(
  "@/lib/agency/financeiro/portao-de-pagamento"
);

const DEPOIS_DO_CORTE = new Date(CORTE_DO_PORTAO_DE_PAGAMENTO.getTime() + 86_400_000);
const ANTES_DO_CORTE = new Date(CORTE_DO_PORTAO_DE_PAGAMENTO.getTime() - 86_400_000);

describe("o veredito do portão de pagamento", () => {
  beforeEach(() => {
    db.pagamentoConfirmado.findUnique.mockReset();
    db.clientRequestDb.findUnique.mockReset();
  });

  it("LIBERA com registro de pagamento de valor positivo", async () => {
    db.pagamentoConfirmado.findUnique.mockResolvedValue({
      valorCentavos: 7900, origem: "mercadopago", confirmadoEm: new Date("2026-08-25"),
    });
    db.clientRequestDb.findUnique.mockResolvedValue({ createdAt: DEPOIS_DO_CORTE });
    const v = await conferirPagamento("pedido-1");
    expect(v.liberado).toBe(true);
    if (v.liberado) expect(v.motivo).toBe("pagamento_confirmado");
  });

  it("RECUSA quando não há registro nenhum e o pedido é novo", async () => {
    db.pagamentoConfirmado.findUnique.mockResolvedValue(null);
    db.clientRequestDb.findUnique.mockResolvedValue({ createdAt: DEPOIS_DO_CORTE });
    const v = await conferirPagamento("pedido-1");
    expect(v.liberado).toBe(false);
    if (!v.liberado) expect(v.motivo).toBe("sem_registro_de_pagamento");
  });

  // ── O DEFEITO IRMÃO: "teto 0" lido como "sem limite" ──────────────────────
  // Em outro produto desta casa, um zero foi lido como ausência de limite.
  // Aqui, zero centavos tem de ser ZERO — nunca "valor não informado", nunca
  // "liberado". Estorno (negativo) idem: devolver dinheiro não é pagar.
  it("RECUSA valor ZERO — zero não é 'sem valor', é zero", async () => {
    db.pagamentoConfirmado.findUnique.mockResolvedValue({
      valorCentavos: 0, origem: "manual", confirmadoEm: new Date(),
    });
    db.clientRequestDb.findUnique.mockResolvedValue({ createdAt: DEPOIS_DO_CORTE });
    const v = await conferirPagamento("pedido-1");
    expect(v.liberado).toBe(false);
    if (!v.liberado) expect(v.motivo).toBe("valor_nao_positivo");
  });

  it("RECUSA valor NEGATIVO — estorno não é pagamento", async () => {
    db.pagamentoConfirmado.findUnique.mockResolvedValue({
      valorCentavos: -7900, origem: "manual", confirmadoEm: new Date(),
    });
    db.clientRequestDb.findUnique.mockResolvedValue({ createdAt: DEPOIS_DO_CORTE });
    const v = await conferirPagamento("pedido-1");
    expect(v.liberado).toBe(false);
  });

  it("RECUSA quando o pedido não existe — 'não sei a data' não vira 'é antigo'", async () => {
    db.pagamentoConfirmado.findUnique.mockResolvedValue(null);
    db.clientRequestDb.findUnique.mockResolvedValue(null);
    const v = await conferirPagamento("fantasma");
    expect(v.liberado).toBe(false);
    if (!v.liberado) expect(v.motivo).toBe("pedido_nao_encontrado");
  });

  it("RECUSA sem clientRequestId — produção sem pedido não tem o que cobrar", async () => {
    const v = await conferirPagamento(null);
    expect(v.liberado).toBe(false);
    if (!v.liberado) expect(v.motivo).toBe("pedido_ausente");
    expect(db.pagamentoConfirmado.findUnique).not.toHaveBeenCalled();
  });

  // ── FALHA FECHADA: o serviço de cobrança fora do ar NÃO produz ────────────
  it("RECUSA quando o banco cai — e NUNCA lança", async () => {
    db.pagamentoConfirmado.findUnique.mockRejectedValue(new Error("SQLITE_BUSY"));
    db.clientRequestDb.findUnique.mockResolvedValue({ createdAt: ANTES_DO_CORTE });
    const v = await conferirPagamento("pedido-1");
    expect(v.liberado).toBe(false);
    if (!v.liberado) expect(v.motivo).toBe("leitura_indisponivel");
  });

  it("a anistia libera o pedido ANTERIOR ao corte — e se rotula como tal", async () => {
    db.pagamentoConfirmado.findUnique.mockResolvedValue(null);
    db.clientRequestDb.findUnique.mockResolvedValue({ createdAt: ANTES_DO_CORTE });
    const v = await conferirPagamento("pedido-antigo");
    expect(v.liberado).toBe(true);
    // O rótulo importa: quem lê o log tem de saber que ninguém conferiu nada.
    if (v.liberado) expect(v.motivo).toBe("anterior_ao_portao");
  });

  // ── A INSTRUÇÃO GÊMEA ────────────────────────────────────────────────────
  // Toda proibição precisa da instrução gêmea. Proibição sem alternativa
  // empurra o operador para o contorno.
  it("TODA recusa traz instrução em português de gente, sem código de erro", async () => {
    const casos: Array<() => void> = [
      () => { db.pagamentoConfirmado.findUnique.mockResolvedValue(null);
              db.clientRequestDb.findUnique.mockResolvedValue({ createdAt: DEPOIS_DO_CORTE }); },
      () => { db.pagamentoConfirmado.findUnique.mockResolvedValue(null);
              db.clientRequestDb.findUnique.mockResolvedValue(null); },
      () => { db.pagamentoConfirmado.findUnique.mockResolvedValue({ valorCentavos: 0, origem: "manual", confirmadoEm: new Date() });
              db.clientRequestDb.findUnique.mockResolvedValue({ createdAt: DEPOIS_DO_CORTE }); },
      () => { db.pagamentoConfirmado.findUnique.mockRejectedValue(new Error("caiu"));
              db.clientRequestDb.findUnique.mockResolvedValue({ createdAt: DEPOIS_DO_CORTE }); },
    ];
    for (const montar of casos) {
      db.pagamentoConfirmado.findUnique.mockReset();
      db.clientRequestDb.findUnique.mockReset();
      montar();
      const v = await conferirPagamento("pedido-1");
      expect(v.liberado).toBe(false);
      if (v.liberado) continue;
      const msg = v.mensagemAoCliente;
      expect(msg.length).toBeGreaterThan(80);
      // Diz o que fazer, não só o que não dá.
      expect(/WhatsApp|Dioli/i.test(msg)).toBe(true);
      // Nada de código de erro nem de jargão de máquina na cara da pessoa.
      expect(/\b(?:HTTP\s*)?\d{3}\b|status|error|null|undefined|_[a-z]+_/i.test(msg)).toBe(false);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AS METADES DE CLASSE — o repositório inteiro
// ─────────────────────────────────────────────────────────────────────────────

function arquivosDeCodigo(dir: string, saida: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    if (nome === "node_modules" || nome === "generated" || nome.startsWith(".")) continue;
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) arquivosDeCodigo(caminho, saida);
    else if (/\.tsx?$/.test(nome)) saida.push(caminho);
  }
  return saida;
}

const TODOS = PASTAS.flatMap((p) => arquivosDeCodigo(join(RAIZ, p))).map((f) =>
  relative(RAIZ, f).split("\\").join("/"),
);
const FONTE = new Map(TODOS.map((f) => [f, readFileSync(join(RAIZ, f), "utf8")]));

/** Tira comentários — a documentação desta casa cita `generate({` em prosa, e
 *  prosa não gasta dinheiro. */
function semComentarios(s: string): string {
  return s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

/** Os dois primitivos PAGOS. Quem os chama, gasta. */
const RE_PAGO = /\bgenerate\(\{|\bgenerateDesign\(/;

/** Onde eles são DEFINIDOS, e o registro de donos — não são gastadores. */
const NAO_SAO_GASTADORES = new Set([
  "lib/ai/generate.ts",
  "lib/ai/design-engine.ts",
  "lib/ai/donos.ts",
]);

const GASTADORES = TODOS.filter(
  (f) => !NAO_SAO_GASTADORES.has(f) && RE_PAGO.test(semComentarios(FONTE.get(f)!)),
);

describe("a anistia não pode virar buraco", () => {
  // A PIOR FALHA POSSÍVEL deste arquivo: mover o corte para o futuro. O portão
  // continuaria compilando, todo o resto continuaria verde, e TODO pedido novo
  // passaria pela anistia — a trava viraria enfeite, em silêncio.
  it("o corte NÃO está no futuro (fora uma janela de 24h do dia da subida)", () => {
    const adiante = CORTE_DO_PORTAO_DE_PAGAMENTO.getTime() - Date.now();
    expect(
      adiante,
      `O corte da anistia está ${Math.round(adiante / 3_600_000)}h no FUTURO. ` +
        "Enquanto ele estiver adiante, todo pedido novo é liberado sem prova de pagamento. " +
        "O corte só anda para TRÁS: para destravar um pedido específico use o registro " +
        "manual (POST /api/admin/pagamentos), que tem dono e valor.",
    ).toBeLessThan(24 * 3_600_000);
  });

  it("a anistia cobre o passado inteiro — nenhum cliente que já estava na casa é parado", async () => {
    db.pagamentoConfirmado.findUnique.mockResolvedValue(null);
    // Um pedido de meses atrás e um de um minuto antes do corte: os dois passam.
    for (const idade of [200 * 86_400_000, 60_000]) {
      db.clientRequestDb.findUnique.mockResolvedValue({
        createdAt: new Date(CORTE_DO_PORTAO_DE_PAGAMENTO.getTime() - idade),
      });
      const v = await conferirPagamento("antigo");
      expect(v.liberado).toBe(true);
    }
  });
});

describe("o censo dos caminhos que gastam", () => {
  it("todo arquivo que chama IA paga está DECLARADO — e nada além deles", () => {
    const declarados = new Set(Object.keys(CAMINHOS_QUE_GASTAM));
    const naoDeclarados = GASTADORES.filter((f) => !declarados.has(f));
    const fantasmas = [...declarados].filter((f) => !GASTADORES.includes(f));

    expect(
      naoDeclarados,
      "Estes arquivos gastam dinheiro da casa e ninguém disse o que eles são.\n" +
        "Declare cada um em lib/agency/financeiro/caminhos-que-gastam.ts:\n" +
        "  • 'producao' → é entregável de cliente. Precisa de portão de pagamento.\n" +
        "  • 'comercial' → é a vitrine/SDR, gasta antes da venda de propósito.\n" +
        "  • 'interno' → é ferramenta do time, sem projeto de cliente do outro lado.\n" +
        naoDeclarados.map((f) => `  - ${f}`).join("\n"),
    ).toEqual([]);

    expect(
      fantasmas,
      "Declarados como gastadores, mas não gastam mais. Apague a linha:\n" +
        fantasmas.map((f) => `  - ${f}`).join("\n"),
    ).toEqual([]);
  });
});

describe("os portões estão armados", () => {
  it("cada guardião declarado REALMENTE chama conferirPagamento()", () => {
    for (const portao of PORTOES) {
      const fonte = FONTE.get(portao);
      expect(fonte, `${portao} não existe`).toBeTruthy();
      expect(
        /\bconferirPagamento(?:DaAncora)?\(/.test(semComentarios(fonte!)),
        `${portao} está declarado como PORTÃO DE PAGAMENTO e não chama conferirPagamento(). ` +
          "Ou a trava foi removida, ou o portão mudou de lugar e o registro não acompanhou.",
      ).toBe(true);
    }
  });

  it("todo arquivo de produção aponta para um guardião que existe", () => {
    for (const [arquivo, decl] of Object.entries(CAMINHOS_QUE_GASTAM)) {
      if (!decl.guardadoPor) continue;
      expect(
        (PORTOES as readonly string[]).includes(decl.guardadoPor),
        `${arquivo} diz ser guardado por ${decl.guardadoPor}, que não é um portão.`,
      ).toBe(true);
    }
  });
});

// ─── METADE 4: O FECHO DA PRODUÇÃO ─────────────────────────────────────────
//
// A pergunta que interessa não é "quem importa um arquivo de produção" — meia
// dúzia de rotas importa `revisionStatusDoVeredito` de `quality-auditor.ts` só
// para traduzir um rótulo, e isso não gasta um centavo. A pergunta é: **quem
// chama a FUNÇÃO que gasta?**
//
// Então o teste acha, dentro de cada arquivo de produção, os SÍMBOLOS que
// realmente contêm a chamada paga, e exige que todo arquivo que importe um
// desses símbolos esteja ele próprio DENTRO do conjunto de produção declarado
// (ou seja um portão). É um fecho: a produção só se chama de dentro da
// produção, e só se entra na produção por um portão.
//
// É esta metade que quebra o build quando alguém cria um caminho novo — uma
// rota, um cron, um script — que chama a produção direto, por fora da trava.

/** Os símbolos de um arquivo que, eles mesmos, contêm a chamada paga. */
function simbolosQueGastam(arquivo: string): string[] {
  const src = semComentarios(FONTE.get(arquivo) ?? "");
  const re = /^export\s+(?:async\s+)?function\s+(\w+)/gm;
  const marcos: Array<[string, number]> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) marcos.push([m[1]!, m.index]);
  const achados: string[] = [];
  for (let i = 0; i < marcos.length; i++) {
    const ini = marcos[i]![1];
    const fim = i + 1 < marcos.length ? marcos[i + 1]![1] : src.length;
    if (RE_PAGO.test(src.slice(ini, fim))) achados.push(marcos[i]![0]);
  }
  return achados;
}

function resolverImport(deQual: string, especificador: string): string | null {
  let base: string;
  if (especificador.startsWith("@/")) base = join(RAIZ, especificador.slice(2));
  else if (especificador.startsWith(".")) base = resolve(RAIZ, dirname(deQual), especificador);
  else return null; // pacote de node_modules
  for (const suf of [".ts", ".tsx", "/index.ts", "/index.tsx", ""]) {
    const tent = base + suf;
    if (existsSync(tent) && statSync(tent).isFile()) return relative(RAIZ, tent).split("\\").join("/");
  }
  return null;
}

const PRODUCAO = new Set(
  Object.entries(CAMINHOS_QUE_GASTAM).filter(([, d]) => d.guardadoPor).map(([f]) => f),
);
const PORTAO = new Set<string>(PORTOES);
/** Quem pode chamar produção: a própria produção. Os portões já estão nela. */
const PODE_CHAMAR = PRODUCAO;

describe("o fecho da produção", () => {
  it("só a produção chama a produção — nenhum caminho novo entra por fora do portão", () => {
    // símbolo que gasta → arquivo de produção que o define
    // ⚠️ Os símbolos dos PORTÕES ficam de fora de propósito: chamar um portão é
    // exatamente a entrada sancionada. `runProjectExecution` e
    // `produzirArtesPendentes` PODEM ser chamados de qualquer lugar — eles
    // conferem o pagamento por conta própria. O que não pode é chegar à
    // produção contornando-os.
    const donoDoSimbolo = new Map<string, string>();
    for (const f of PRODUCAO) {
      if (PORTAO.has(f)) continue;
      for (const sim of simbolosQueGastam(f)) donoDoSimbolo.set(sim, f);
    }

    expect(
      donoDoSimbolo.size,
      "Nenhum símbolo de produção foi encontrado — o detector quebrou, e um detector " +
        "quebrado fica verde para sempre.",
    ).toBeGreaterThan(2);

    const violacoes: string[] = [];
    for (const arquivo of TODOS) {
      if (PODE_CHAMAR.has(arquivo)) continue;
      const src = semComentarios(FONTE.get(arquivo)!);
      // Só imports NOMEADOS: `import { auditDeliverable } from "..."`.
      const re = /import\s*(?:type\s+)?\{([^}]*)\}\s*from\s*["']([^"']+)["']/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src))) {
        // `import type` não executa nada e não gasta.
        if (/^import\s+type/.test(m[0])) continue;
        const alvo = resolverImport(arquivo, m[2]!);
        if (!alvo || !PRODUCAO.has(alvo)) continue;
        for (const bruto of m[1]!.split(",")) {
          const nome = bruto.trim().split(/\s+as\s+/)[0]!.trim();
          if (!nome || nome.startsWith("type ")) continue;
          if (donoDoSimbolo.get(nome) === alvo) {
            violacoes.push(`${arquivo} chama ${nome}() de ${alvo}`);
          }
        }
      }
    }

    expect(
      [...new Set(violacoes)].sort(),
      "Estes arquivos chamam uma função que GASTA em produção de cliente, e não estão\n" +
        "dentro do conjunto de produção declarado — ou seja, chegam ao dinheiro por fora\n" +
        "do portão de pagamento. Escolha um dos dois consertos, nunca um terceiro:\n" +
        "  a) faça a função chamada conferir `conferirPagamento()` e declare-a em PORTOES; ou\n" +
        "  b) entre pela esteira (runProjectExecution) / pela rodada de arte, que já são guardadas.\n" +
        violacoes.map((v) => `  - ${v}`).join("\n"),
    ).toEqual([]);
  });
});

// A TRAVA QUE TRANSFORMA "INERTE" EM "P0" NA MESMA HORA — automaticamente.
//
// ─── O DEFEITO, E POR QUE ELE NÃO É URGENTE HOJE ─────────────────────────────
//
// `OutboxV2` **não tem coluna de dono** — nem `clienteId`, nem `workspaceId`.
// A posse de um efeito de saída não existe no modelo: `POST /api/v2/retomar`
// alcança linha por `correlationId`, e `correlationId` chega do corpo da
// requisição. Sem dono na tabela, a defesa é derivada de fora (hoje, do rastro
// de `ExecucaoV2` — ver `lib/agency/v2-recovery/retomar.ts`).
//
// **O vetor real hoje é ZERO, e isso foi MEDIDO, não suposto:**
//
//   • `OutboxV2` não tem escritor de produção — `transicionar()` só é chamado
//     por teste;
//   • o registro de executores só tem `registro_de_teste`, que escreve uma
//     linha de log;
//   • nada agenda esse relógio.
//
// O defeito de modelo é verdadeiro e está **inerte**. Consertar o modelo é
// migration, e migration é decisão do dono do modelo de dados.
//
// ─── POR QUE ESTA TRAVA EXISTE, ENTÃO ────────────────────────────────────────
//
// Porque o dia em que o primeiro efeito com consequência externa (mensagem,
// publicação, e-mail) ganhar executor, o defeito inerte vira **P0 na mesma
// hora** — e ninguém vai lembrar disto aqui. Aviso em documento é sugestão;
// **trava é mecanismo**. Enquanto `OutboxV2` não tiver dono EM USO, o CI
// REPROVA qualquer tipo novo de efeito.
//
// ─── 🔴 OS TRÊS BURACOS QUE ESTA TRAVA TINHA — fechados em 15/08/2026 ────────
//
// **1. Ela lia CHAVE LITERAL do código-fonte.** Passava calada com as três
//    escritas mais normais do mundo:
//
//        { ...OUTROS_EXECUTORES }        // spread
//        { [TIPO_WHATSAPP]: enviar }     // chave computada
//        Object.assign(EXECUTORES, {…})  // mutação depois da declaração
//
//    Nenhuma é má-fé — **spread é exatamente o que qualquer um faz ao
//    modularizar executores**, e é aí que a trava soltava em silêncio: no dia
//    em que passou a importar. Agora ela lê o **mapa efetivo**
//    (`Object.keys`), de `lib/agency/v2-recovery/executores-de-saida.ts`. Há
//    teste abaixo que exibe o buraco antigo lado a lado com o conserto.
//
// **2. Ela vigiava UM registro, e nada impedia um segundo.** Registro novo em
//    outro arquivo seria um caminho de saída fora do alcance dela. Agora todo
//    `processarOutbox(` do repositório tem de receber o registro único.
//
// **3. Ela soltava só com a COLUNA — sem uma linha de `where` recortado.** Ou
//    seja: liberaria exatamente no dia em que a migration entrasse, com a
//    fiação ainda por fazer, que é o dia de maior risco. Agora exige as duas
//    coisas: a coluna existir **e** toda consulta ao outbox usá-la.
//
// ─── AS DUAS METADES ─────────────────────────────────────────────────────────
//
// Metade 1 — BARRA o problema plantado: executor novo (por chave literal, por
//            spread ou por chave computada) é REPROVADO; e coluna sem recorte
//            em uso continua reprovando.
// Metade 2 — NÃO INVENTA PROBLEMA no caso limpo: o repositório como está passa;
//            e com a coluna E o recorte em uso, o executor novo passa — a trava
//            solta sozinha, não vira imposto permanente.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { EXECUTORES_DE_SAIDA, tiposDeEfeitoRegistrados } from "@/lib/agency/v2-recovery/executores-de-saida";

const RAIZ = process.cwd();
const SCHEMA = join(RAIZ, "prisma/schema.prisma");
const REGISTRO_UNICO = "EXECUTORES_DE_SAIDA";

/** Os únicos tipos de efeito toleráveis enquanto o outbox não tiver dono. */
const INERTES = ["registro_de_teste"];

// ─── Leitura do repositório ──────────────────────────────────────────────────

/** Os fontes de produção (nada de teste, nada de código gerado pelo Prisma). */
function fontesDeProducao(): string[] {
  const achados: string[] = [];
  const ignorar = new Set(["node_modules", ".next", "generated"]);
  function andar(dir: string) {
    for (const entrada of readdirSync(dir, { withFileTypes: true })) {
      if (entrada.name.startsWith(".") || ignorar.has(entrada.name)) continue;
      const caminho = join(dir, entrada.name);
      if (entrada.isDirectory()) andar(caminho);
      else if (/\.(ts|tsx)$/.test(entrada.name)) achados.push(caminho);
    }
  }
  andar(join(RAIZ, "app"));
  andar(join(RAIZ, "lib"));
  return achados;
}

/** Tira comentário e literal de texto: sem isso o varredor confunde os
 *  dois-pontos de uma frase, ou o nome de um modelo citado num comentário,
 *  com código de verdade. */
export function semRuido(fonte: string): string {
  return fonte
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "")
    .replace(/`(?:[^`\\]|\\.)*`/g, '""')
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\]|\\.)*'/g, '""');
}

/** O trecho balanceado que começa no delimitador de abertura em `de`. */
function blocoBalanceado(texto: string, de: number, abre: string, fecha: string): string | null {
  const inicio = texto.indexOf(abre, de);
  if (inicio < 0) return null;
  let profundidade = 0;
  for (let i = inicio; i < texto.length; i++) {
    if (texto[i] === abre) profundidade++;
    else if (texto[i] === fecha) {
      profundidade--;
      if (profundidade === 0) return texto.slice(inicio, i + 1);
    }
  }
  return null;
}

// ─── 🔴 BURACO 1 — o leitor ANTIGO, preservado só para PROVAR o buraco ───────
//
// Esta função é a trava como ela era: chave literal, lida do texto. Ela não
// vigia mais nada — existe para que o teste possa exibir o que ela DEIXAVA
// PASSAR, lado a lado com o leitor de verdade. Buraco que ninguém consegue
// demonstrar volta na próxima refatoração.

export function chavesLiteraisNoTexto(fonte: string): string[] {
  const limpo = semRuido(fonte);
  const inicio = limpo.search(/const\s+EXECUTORES\w*/);
  if (inicio < 0) return [];
  const corpo = blocoBalanceado(limpo, inicio, "{", "}");
  if (!corpo) return [];
  const chaves: string[] = [];
  let nivel = 0;
  let i = 1;
  while (i < corpo.length - 1) {
    const c = corpo[i];
    if (c === "{" || c === "(" || c === "[") { nivel++; i++; continue; }
    if (c === "}" || c === ")" || c === "]") { nivel--; i++; continue; }
    if (nivel === 0) {
      const m = /^(["']?)([A-Za-z_$][\w$-]*)\1\s*:/.exec(corpo.slice(i));
      if (m) { chaves.push(m[2]!); i += m[0].length; continue; }
    }
    i++;
  }
  return chaves;
}

// ─── ✅ O leitor de verdade: o MAPA EFETIVO ──────────────────────────────────
//
// `Object.keys` do registro importado. Spread, chave computada e
// `Object.assign` aparecem todos, porque isto não lê texto: lê o objeto.

export function tiposDoMapaEfetivo(mapa: Record<string, unknown>): string[] {
  return Object.keys(mapa);
}

// ─── Buraco 2 — registro ÚNICO ───────────────────────────────────────────────

/** Todo `processarOutbox(` do repositório, com o primeiro argumento. */
export function chamadasDeProcessamento(fonte: string): string[] {
  const limpo = semRuido(fonte);
  const primeiros: string[] = [];
  const re = /processarOutbox\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(limpo))) {
    // A própria DECLARAÇÃO da função não é uma chamada.
    if (/function\s+$/.test(limpo.slice(Math.max(0, m.index - 40), m.index))) continue;
    const args = blocoBalanceado(limpo, m.index, "(", ")");
    if (!args) continue;
    primeiros.push(args.slice(1).split(",")[0]!.trim());
  }
  return primeiros;
}

// ─── Buraco 3 — a coluna E o recorte em uso ──────────────────────────────────

/** O `OutboxV2` já sabe de quem é cada linha? Devolve o nome da coluna. */
export function donoDoOutbox(schema: string): string | null {
  const inicio = schema.indexOf("model OutboxV2 {");
  if (inicio < 0) {
    throw new Error(
      "`model OutboxV2` não existe mais em prisma/schema.prisma — esta trava fala de um modelo que sumiu. Reaponte-a.",
    );
  }
  const fim = schema.indexOf("\n}", inicio);
  const bloco = schema.slice(inicio, fim);
  const m = /^\s*(clienteId|clientId|workspaceId)\s/m.exec(bloco);
  return m ? m[1]! : null;
}

/** Onde a coluna de dono tem de aparecer, por método do Prisma. */
function chaveExigida(metodo: string): "data" | "where" {
  return metodo === "create" || metodo === "createMany" ? "data" : "where";
}

export interface ConsultaDoOutbox {
  arquivo: string;
  metodo: string;
  recortada: boolean;
}

/** Toda consulta a `prisma.outboxV2.*` de um fonte, e se ela carrega o dono. */
export function consultasDoOutbox(fonte: string, arquivo: string, dono: string | null): ConsultaDoOutbox[] {
  const limpo = semRuido(fonte);
  const achadas: ConsultaDoOutbox[] = [];
  const re = /prisma\.outboxV2\.(\w+)\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(limpo))) {
    const metodo = m[1]!;
    const args = blocoBalanceado(limpo, m.index, "(", ")") ?? "";
    const alvo = chaveExigida(metodo);
    const marcador = new RegExp(`\\b${alvo}\\s*:`).exec(args);
    const bloco = marcador ? blocoBalanceado(args, marcador.index, "{", "}") ?? "" : "";
    const recortada = dono !== null && new RegExp(`\\b${dono}\\b`).test(bloco);
    achadas.push({ arquivo, metodo, recortada });
  }
  return achadas;
}

export interface Veredito {
  aprovado: boolean;
  motivo: string;
}

export function vereditoDoOutbox(entrada: {
  tipos: string[];
  dono: string | null;
  consultas: ConsultaDoOutbox[];
}): Veredito {
  const { tipos, dono, consultas } = entrada;
  const abertas = consultas.filter((c) => !c.recortada);

  // 🔑 A COLUNA NÃO BASTA. Soltar com a coluna e sem o recorte é soltar
  // exatamente no dia da migration — o dia em que a fiação ainda não existe.
  if (dono && abertas.length === 0) {
    return {
      aprovado: true,
      motivo: `OutboxV2 tem \`${dono}\` E todas as ${consultas.length} consultas o usam — a trava soltou sozinha, como foi desenhada.`,
    };
  }

  const novos = tipos.filter((t) => !INERTES.includes(t));
  if (novos.length === 0) {
    return { aprovado: true, motivo: "só efeito inerte registrado — o vetor continua zero." };
  }

  const diagnostico = dono
    ? [
        `A coluna \`${dono}\` EXISTE no OutboxV2, mas ${abertas.length} consulta(s) ainda não a usam:`,
        ...abertas.map((c) => `  • ${c.arquivo} → prisma.outboxV2.${c.metodo}(…) sem \`${dono}\` no ${chaveExigida(c.metodo)}`),
        "",
        "  Coluna sem recorte em uso é dono no papel. A trava NÃO solta por ela.",
      ]
    : ["  `OutboxV2` não tem coluna de dono (clienteId/workspaceId) — a posse de um efeito não existe no modelo."];

  return {
    aprovado: false,
    motivo: [
      "",
      "🔴 EFEITO DE SAÍDA NOVO NUM OUTBOX SEM DONO — reprovado de propósito.",
      "",
      `Tipo(s) novo(s) no registro de executores: ${novos.join(", ")}`,
      "",
      "POR QUE ISTO REPROVA:",
      ...diagnostico,
      "  Enquanto o outbox só registra log, isso é um defeito INERTE: nada sai da casa.",
      "  No momento em que um tipo com consequência externa ganha executor, a mesma",
      "  tabela sem dono vira um caminho para disparar efeito de um cliente a partir de",
      "  outro — e `POST /api/v2/retomar` alcança linha por `correlationId` vindo do corpo.",
      "",
      "COMO DESTRAVAR (e não é afrouxando este teste):",
      "  1. pôr `clienteId` (ou `workspaceId`) em `model OutboxV2` no prisma/schema.prisma,",
      "     com migration — é decisão do dono do modelo de dados;",
      "  2. recortar por ele TODA leitura e TODA escrita do outbox, inclusive as duas",
      "     consultas de `retomar` (leitura E update: meia trava parece inteira) e os",
      "     agregados dos painéis (contagem de casa alheia também vaza);",
      "  3. este teste solta sozinho quando as DUAS coisas estiverem de pé.",
      "",
    ].join("\n"),
  };
}

// ─── O repositório como está ─────────────────────────────────────────────────

describe("o outbox sem dono não ganha executor novo", () => {
  const schema = readFileSync(SCHEMA, "utf8");
  const fontes = fontesDeProducao().map((caminho) => ({
    caminho: relative(RAIZ, caminho),
    texto: readFileSync(caminho, "utf8"),
  }));
  const dono = donoDoOutbox(schema);
  const consultas = fontes.flatMap((f) => consultasDoOutbox(f.texto, f.caminho, dono));

  it("a trava enxerga o alvo — se o varredor não achar nada, ela passaria calada", () => {
    // Trava que não encontra nada é trava que aprova tudo. Este é o teste da trava.
    expect(tiposDeEfeitoRegistrados().length).toBeGreaterThan(0);
    expect(tiposDeEfeitoRegistrados()).toContain("registro_de_teste");
    expect(consultas.length).toBeGreaterThan(0);
  });

  it("HOJE: OutboxV2 continua sem coluna de dono — o fato que a trava vigia", () => {
    expect(dono).toBeNull();
  });

  it("✅ o repositório como está PASSA — a trava não inventa problema", () => {
    const v = vereditoDoOutbox({ tipos: tiposDeEfeitoRegistrados(), dono, consultas });
    expect(v.aprovado, v.motivo).toBe(true);
  });

  it("🔴 REGISTRO ÚNICO: todo processarOutbox() recebe o mapa vigiado", () => {
    const chamadas = fontes.flatMap((f) =>
      chamadasDeProcessamento(f.texto).map((primeiro) => ({ arquivo: f.caminho, primeiro })),
    );
    expect(chamadas.length, "nenhum processarOutbox() no repositório — a trava perdeu o alvo").toBeGreaterThan(0);
    for (const c of chamadas) {
      expect(
        c.primeiro,
        `${c.arquivo} chama processarOutbox() com \`${c.primeiro}\`. Um SEGUNDO registro de ` +
          `executores é um caminho de saída que esta trava não vigia — importe ${REGISTRO_UNICO} ` +
          `de lib/agency/v2-recovery/executores-de-saida.ts.`,
      ).toBe(REGISTRO_UNICO);
    }
  });

  it("🔴 a rota do relógio não declara registro próprio", () => {
    const rota = readFileSync(join(RAIZ, "app/api/cron/v2/route.ts"), "utf8");
    expect(
      chavesLiteraisNoTexto(rota),
      "app/api/cron/v2/route.ts voltou a declarar `const EXECUTORES…` — mapa que a trava não lê em tempo de execução.",
    ).toEqual([]);
    expect(semRuido(rota)).toContain(REGISTRO_UNICO);
  });
});

// ─── 🔴 O BURACO 1, EXIBIDO: por que a leitura de texto não servia ───────────

describe("o leitor antigo passava calado — a prova, lado a lado", () => {
  const COM_SPREAD = `
const EXECUTORES: Record<string, Executor> = {
  registro_de_teste: async () => {},
  ...EXECUTORES_DE_WHATSAPP,
};
`;
  const COM_CHAVE_COMPUTADA = `
const EXECUTORES: Record<string, Executor> = {
  registro_de_teste: async () => {},
  [TIPO_WHATSAPP]: async () => {},
};
`;

  it("⛔ spread: o leitor de TEXTO via só um tipo — o registro tinha dois", () => {
    expect(chavesLiteraisNoTexto(COM_SPREAD)).toEqual(["registro_de_teste"]);
    // O mesmo registro, montado de verdade:
    const efetivo = { registro_de_teste: async () => {}, ...{ enviar_whatsapp: async () => {} } };
    expect(tiposDoMapaEfetivo(efetivo)).toEqual(["registro_de_teste", "enviar_whatsapp"]);
  });

  it("⛔ chave computada: mesma história", () => {
    expect(chavesLiteraisNoTexto(COM_CHAVE_COMPUTADA)).toEqual(["registro_de_teste"]);
    const TIPO = "enviar_whatsapp";
    const efetivo = { registro_de_teste: async () => {}, [TIPO]: async () => {} };
    expect(tiposDoMapaEfetivo(efetivo)).toEqual(["registro_de_teste", "enviar_whatsapp"]);
  });

  it("⛔ Object.assign depois da declaração: o texto do objeto nem muda", () => {
    const efetivo: Record<string, unknown> = { registro_de_teste: async () => {} };
    Object.assign(efetivo, { publicar_post: async () => {} });
    expect(chavesLiteraisNoTexto("const EXECUTORES = { registro_de_teste: async () => {} };")).toEqual([
      "registro_de_teste",
    ]);
    expect(tiposDoMapaEfetivo(efetivo)).toEqual(["registro_de_teste", "publicar_post"]);
  });

  it("✅ e o mapa de verdade da casa é lido pelo caminho novo", () => {
    expect(tiposDoMapaEfetivo(EXECUTORES_DE_SAIDA)).toEqual(tiposDeEfeitoRegistrados());
  });
});

// ─── As duas metades, em amostra sintética ───────────────────────────────────

describe("as duas metades da trava", () => {
  const SEM_DONO = `
model OutboxV2 {
  id                 String    @id @default(cuid())
  tipo               String
  correlationId      String
}
`;
  const COM_DONO = `
model OutboxV2 {
  id                 String    @id @default(cuid())
  tipo               String
  clienteId          String
  correlationId      String
}
`;
  const CONSULTA_RECORTADA = `
await prisma.outboxV2.findMany({ where: { clienteId, status: "pending" }, select: { id: true } });
await prisma.outboxV2.update({ where: { id, clienteId }, data: { status: "sent" } });
`;
  const CONSULTA_ABERTA = `
await prisma.outboxV2.findMany({ where: { status: "pending" }, select: { id: true } });
await prisma.outboxV2.update({ where: { id }, data: { status: "sent" } });
`;
  const PLANTADO = ["registro_de_teste", "enviar_whatsapp"];
  const LIMPO = ["registro_de_teste"];

  it("⛔ METADE 1 — executor novo com outbox sem dono é REPROVADO, e a mensagem explica", () => {
    const v = vereditoDoOutbox({
      tipos: PLANTADO,
      dono: null,
      consultas: consultasDoOutbox(CONSULTA_ABERTA, "sintetico.ts", null),
    });
    expect(v.aprovado).toBe(false);
    expect(v.motivo).toContain("enviar_whatsapp");
    expect(v.motivo).toContain("clienteId");
    expect(v.motivo).toContain("retomar");
  });

  it("🔴 METADE 1b — a COLUNA SOZINHA não solta: sem recorte em uso, continua reprovado", () => {
    const dono = donoDoOutbox(COM_DONO);
    const v = vereditoDoOutbox({
      tipos: PLANTADO,
      dono,
      consultas: consultasDoOutbox(CONSULTA_ABERTA, "sintetico.ts", dono),
    });
    expect(
      v.aprovado,
      "trava que solta na migration libera no dia em que a fiação ainda não existe — o dia de maior risco",
    ).toBe(false);
    expect(v.motivo).toContain("sem `clienteId` no where");
    expect(v.motivo).toContain("prisma.outboxV2.findMany");
  });

  it("✅ METADE 2 — o caso limpo passa", () => {
    const v = vereditoDoOutbox({
      tipos: LIMPO,
      dono: null,
      consultas: consultasDoOutbox(CONSULTA_ABERTA, "sintetico.ts", null),
    });
    expect(v.aprovado).toBe(true);
  });

  it("🔑 e a trava SOLTA sozinha: coluna + recorte em uso, o executor novo passa", () => {
    const dono = donoDoOutbox(COM_DONO);
    const v = vereditoDoOutbox({
      tipos: PLANTADO,
      dono,
      consultas: consultasDoOutbox(CONSULTA_RECORTADA, "sintetico.ts", dono),
    });
    expect(v.aprovado, "trava que não solta quando o problema é resolvido vira imposto permanente").toBe(true);
  });

  it("o varredor de consultas não confunde `data` com `where`", () => {
    // `clienteId` no `data` de um update NÃO recorta nada — recorta o `where`.
    const enganoso = `await prisma.outboxV2.update({ where: { id }, data: { clienteId } });`;
    expect(consultasDoOutbox(enganoso, "s.ts", "clienteId")[0]!.recortada).toBe(false);
    // Já num `create`, é o `data` que carrega o dono.
    const criacao = `await prisma.outboxV2.create({ data: { tipo, clienteId } });`;
    expect(consultasDoOutbox(criacao, "s.ts", "clienteId")[0]!.recortada).toBe(true);
  });

  it("schema sem OutboxV2 não passa calado — ele GRITA", () => {
    expect(() => donoDoOutbox("model Outra {}")).toThrow(/OutboxV2/);
  });

  it("o varredor ignora comentário e literal — nome de modelo citado em prosa não conta", () => {
    const soComentario = `// prisma.outboxV2.findMany({ where: {} }) — só um exemplo em comentário\n`;
    expect(consultasDoOutbox(soComentario, "s.ts", null)).toEqual([]);
  });
});

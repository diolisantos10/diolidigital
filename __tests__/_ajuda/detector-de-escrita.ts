// O DETECTOR DE ESCRITA — fechado por omissão, e é essa a mudança.
//
// ⚠️ Não é `*.test.ts`: é biblioteca dos testes. O `include` do vitest só pega
// `*.test.ts` e `*.test.tsx`, então este arquivo não roda sozinho.
//
// ── O QUE ESTAVA ERRADO (medido em 16/08/2026) ─────────────────────────────
//
// As pernas do relógio que só podem CONTAR eram protegidas por uma lista de
// palavras proibidas procuradas com `.includes()` no bloco de código. Uma
// blocklist erra dos dois lados, e errou dos dois:
//
// **Deixava passar** (falso verde, que é o caro):
//   • `await import("...")` — o idioma da própria função, 7 ocorrências no
//     arquivo. Qualquer módulo que escreve entra por aí sem tocar na lista;
//   • `$transaction` — não estava listado, e escreve o que quiser;
//   • `updateMany (` com espaço antes do parêntese — `"updateMany("` não casa;
//   • escrita por função de TERCEIRO módulo: `await publicarTudo()` não parece
//     escrita nenhuma para uma lista de palavras, e é.
//
// **Reprovava o legítimo** (falso vermelho, que é o que corrói):
//   • `log("… ainda não foi respondido, alguém precisa decidir …")` ficava
//     vermelho por conter a palavra "decidir" — dentro de uma STRING, num log.
//
// Detector que reprova o certo ensina o time a editar a lista. Uma vez que se
// aprende a editar a lista, ela deixou de ser trava e virou carimbo.
//
// ── O CONSERTO: ALLOWLIST DE CHAMADAS ─────────────────────────────────────
//
// Em vez de perguntar "esta perna chama alguma coisa proibida?", pergunta-se
// **"esta perna chama alguma coisa que não foi declarada?"**. É a mesma
// inversão que a doutrina pede para o registro de portões: sem declaração
// executável, REPROVADO.
//
//   1. comentários e literais de string saem do texto ANTES da varredura — a
//      palavra dentro de um `log(...)` não é código, e tratá-la como código foi
//      o falso vermelho;
//   2. toda chamada `algo(` e `a.b.c(` que sobra é comparada com a lista
//      declarada pelo teste. **Uma chamada nova reprova até alguém declará-la**,
//      e declarar é o momento em que uma pessoa pensa "isto escreve?";
//   3. as portas de fuga que não são chamadas comuns — `import(`, `require(`,
//      `eval(`, `$transaction`, `$executeRaw`, `$queryRaw` — continuam barradas
//      por nome, porque nenhuma delas tem uso legítimo dentro de uma perna que
//      só conta.

/** Palavras-chave do JavaScript que aparecem seguidas de `(` e não são chamada. */
const NAO_E_CHAMADA = new Set([
  "if", "for", "while", "switch", "catch", "return", "await", "typeof", "function",
  "new", "of", "in", "do", "else", "yield", "void", "delete", "instanceof",
]);

/**
 * As portas de fuga. Nenhuma tem uso legítimo numa perna que só conta, e
 * nenhuma delas é pega pela allowlist de chamadas (`import(` é sintaxe, não
 * identificador; `$transaction` é membro de um objeto que já está declarado).
 */
const PORTAS_DE_FUGA = [
  "import(", "require(", "eval(", "Function(",
  "$transaction", "$executeRaw", "$queryRaw", "$executeRawUnsafe", "$queryRawUnsafe",
];

/**
 * Tira do texto tudo que não é código executável: comentários de bloco, de
 * linha, e o CONTEÚDO de literais de string e template.
 *
 * As aspas ficam (`""`) para que a forma da chamada não mude — `log("x")`
 * continua sendo `log("")`, e a allowlist ainda vê `log(`.
 */
/**
 * Só os comentários saem. As strings ficam.
 *
 * É o que serve para trava de tela: `bg-white` num comentário que EXPLICA por
 * que ele saiu não é `bg-white` na tela, e reprovar a explicação ensina o time
 * a apagar a explicação — que é o oposto do que esta casa quer.
 */
export function semComentarios(fonte: string): string {
  return fonte.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^[ \t]*\/\/.*$/gm, " ");
}

export function apenasCodigo(fonte: string): string {
  const semComentario = semComentarios(fonte)
    // Aspas simples e duplas: o conteúdo some, a forma da chamada fica —
    // `log("x")` vira `log("")`, e a allowlist continua vendo `log(`.
    .replace(/(["'])(?:\\.|(?!\1)[^\\\n])*\1/g, '""');

  // ── TEMPLATE PRECISA DE VARREDURA, NÃO DE REGEX ──────────────────────────
  //
  // Uma regex que "come" o template inteiro apagaria as `${...}`, e dentro
  // delas pode haver chamada de verdade. Uma que preserva as `${}` deixa
  // passar o TEXTO entre duas interpolações — foi assim que
  // `` `${x} dia(s) sem decisão` `` fez a palavra `dia(` virar "chamada não
  // declarada". Aqui o texto some e o miolo das interpolações fica.
  let fora = "";
  let i = 0;
  while (i < semComentario.length) {
    const c = semComentario[i]!;
    if (c !== "`") { fora += c; i++; continue; }
    i++; // abre o template
    let profundidade = 0;
    while (i < semComentario.length) {
      const d = semComentario[i]!;
      if (profundidade === 0) {
        if (d === "\\") { i += 2; continue; }
        if (d === "`") { i++; break; }
        if (d === "$" && semComentario[i + 1] === "{") { profundidade = 1; fora += " "; i += 2; continue; }
        i++; // texto do template: descartado
        continue;
      }
      if (d === "{") profundidade++;
      if (d === "}") { profundidade--; if (profundidade === 0) { fora += " "; i++; continue; } }
      fora += d;
      i++;
    }
  }
  return fora;
}

/**
 * O recorte entre duas âncoras, **encostado no começo da linha**.
 *
 * Sutil e necessário: a âncora de cima costuma ser um trecho de comentário
 * (`"QUEM BATEU NA PORTA E NINGUÉM ATENDEU"`). Cortando no índice exato, o
 * `//` daquela linha fica de fora do recorte, a linha deixa de parecer
 * comentário, e o resto dela entra na varredura como se fosse código — foi
 * assim que a palavra `ATENDEU(` de um título virou "chamada não declarada".
 */
export function recorteDeLinhas(fonte: string, de: number, ate: number): string {
  return fonte.slice(fonte.lastIndexOf("\n", de) + 1, ate);
}

/** Toda chamada que sobrou no código: `nome(`, `a.b(`, `a.b.c(`. */
export function chamadasEm(codigo: string): string[] {
  const achadas = new Set<string>();
  for (const m of codigo.matchAll(/([A-Za-z_$][\w$]*(?:\s*\.\s*[A-Za-z_$][\w$]*)*)\s*\(/g)) {
    const bruto = m[1]!.replace(/\s+/g, "");
    const ultimo = bruto.split(".").pop()!;
    if (NAO_E_CHAMADA.has(bruto) || NAO_E_CHAMADA.has(ultimo)) continue;
    achadas.add(bruto);
  }
  return [...achadas].sort();
}

export interface Laudo {
  /** Chamadas que ninguém declarou. Qualquer uma reprova. */
  naoDeclaradas: string[];
  /** Portas de fuga achadas pelo nome. */
  portasDeFuga: string[];
  /** O código sem comentário e sem texto de string — para o teste conferir que
   *  o recorte não encolheu a ponto de passar em tudo. */
  codigo: string;
}

/**
 * Audita um bloco de código contra a lista de chamadas permitidas.
 *
 * @param permitidas o que esta perna PODE chamar. Escrever aqui é o gesto em
 *   que alguém decide, com o nome na frente, que aquela função não escreve.
 */
export function auditarChamadas(fonte: string, permitidas: string[]): Laudo {
  const codigo = apenasCodigo(fonte);
  const declaradas = new Set(permitidas);
  return {
    naoDeclaradas: chamadasEm(codigo).filter((c) => !declaradas.has(c)),
    portasDeFuga: PORTAS_DE_FUGA.filter((p) => codigo.includes(p)),
    codigo,
  };
}

/** Os métodos que ESCREVEM em qualquer modelo do Prisma. */
export const VERBOS_DE_ESCRITA = [
  "create", "createMany", "createManyAndReturn", "update", "updateMany",
  "upsert", "delete", "deleteMany",
];

/**
 * Nenhum modelo do mock escreveu — **todos os modelos**, não um.
 *
 * O guarda de runtime das duas frentes olhava um modelo cada
 * (`expect(db.approvalRequest.update).not.toHaveBeenCalled()`). Uma perna que
 * passasse a escrever em `client`, `project` ou `portalMessage` passava verde
 * pelo teste que existe para barrar escrita.
 */
export function escritasNoBanco(db: Record<string, unknown>): string[] {
  const houve: string[] = [];
  for (const [modelo, valor] of Object.entries(db)) {
    if (!valor || typeof valor !== "object") continue;
    for (const verbo of VERBOS_DE_ESCRITA) {
      const fn = (valor as Record<string, unknown>)[verbo] as
        | { mock?: { calls?: unknown[] } }
        | undefined;
      const vezes = fn?.mock?.calls?.length ?? 0;
      if (vezes > 0) houve.push(`${modelo}.${verbo} (${vezes}x)`);
    }
  }
  return houve;
}

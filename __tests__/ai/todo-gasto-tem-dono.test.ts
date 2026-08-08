// A TRAVA DA COBERTURA: chamada de IA sem dono declarado não passa.
//
// ─── O INCIDENTE ─────────────────────────────────────────────────────────────
//
// `AIRunLog.agentId` existe desde 06/08/2026. Em 07/08, medido no repositório:
// **32 chamadas a `generate(...)`, 10 declaravam o dono e 22 não.** O
// departamento financeiro nasceria medindo cerca de um terço do gasto de IA — e
// sem saber QUAL terço. Custo de IA por agente e por cliente, que é a pergunta
// que o CEO fez, teria resposta com cara de completa e conteúdo de amostra.
//
// ─── POR QUE ESTE TESTE EXISTE SE O COMPILADOR JÁ BARRA ──────────────────────
//
// `agentId` é obrigatório na assinatura de `generate()` — chamada nova sem dono
// não compila. Isso é a trava principal e é ela que torna o esquecimento
// impossível. Este teste cobre o que o tipo NÃO cobre:
//
//   • `agentId` presente mas com um id que não existe no registro (typo,
//     grafia divergente do mesmo especialista) — o custo apareceria partido em
//     duas linhas do relatório sem ninguém errar visivelmente;
//   • fuga de tipo (`as never`, `as unknown as ...`, objeto montado antes);
//   • um `// @ts-expect-error` posto para "destravar o build".
//
// Uma trava só com compilador é uma trava que um `as` desfaz.
//
// ─── AS DUAS METADES ─────────────────────────────────────────────────────────
//
// Metade 1 — barra o problema plantado: um trecho de código sem `agentId`, e
//            outro com um dono inexistente, são REPROVADOS pela mesma função.
// Metade 2 — não inventa problema no caso limpo: o repositório inteiro, como
//            está, passa; e um trecho bem formado passa.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { DONOS_DE_CHAMADA, donoDaChamada, departamentoQuePaga } from "@/lib/ai/donos";

const RAIZ = process.cwd();
const PASTAS = ["lib", "app", "scripts"];

/** Uma chamada achada no código-fonte. */
interface Chamada {
  arquivo: string;
  linha: number;
  /** O literal declarado, `null` se não há `agentId`, `"<dinamico>"` se é expressão. */
  dono: string | null | "<dinamico>";
}

function arquivosDeCodigo(dir: string, saida: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    if (nome === "node_modules" || nome === "generated" || nome.startsWith(".")) continue;
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) arquivosDeCodigo(caminho, saida);
    else if (/\.tsx?$/.test(nome)) saida.push(caminho);
  }
  return saida;
}

/**
 * Acha `generate({ … })` e lê o `agentId` declarado.
 *
 * Deliberadamente burro (contagem de chaves, sem parser): o que ele precisa
 * fazer é não deixar passar chamada nova, e para isso texto basta. Um parser
 * traria uma dependência a mais para proteger 30 linhas.
 */
export function chamadasDoArquivo(fonte: string, arquivo: string): Chamada[] {
  const achadas: Chamada[] = [];
  const re = /\bgenerate\(\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(fonte))) {
    // Ignora ocorrência dentro de comentário de bloco/linha: a documentação
    // desta casa cita `generate({` em prosa, e prosa não gasta dinheiro.
    const linhaInteira = fonte.slice(fonte.lastIndexOf("\n", m.index) + 1, m.index);
    if (/^\s*(\/\/|\*|\/\*)/.test(linhaInteira)) continue;

    let profundidade = 0;
    let fim = m.index;
    for (let i = m.index + m[0].length - 1; i < fonte.length; i++) {
      if (fonte[i] === "{") profundidade++;
      else if (fonte[i] === "}") {
        profundidade--;
        if (profundidade === 0) { fim = i; break; }
      }
    }
    const corpo = fonte.slice(m.index, fim + 1);
    const linha = fonte.slice(0, m.index).split("\n").length;

    const literal = corpo.match(/\bagentId\s*:\s*["'`]([^"'`]+)["'`]/);
    if (literal) { achadas.push({ arquivo, linha, dono: literal[1] }); continue; }
    if (/\bagentId\s*:/.test(corpo)) { achadas.push({ arquivo, linha, dono: "<dinamico>" }); continue; }
    achadas.push({ arquivo, linha, dono: null });
  }
  return achadas;
}

/** O veredito. Devolve a lista de problemas — vazia é aprovação. */
export function reprovar(chamadas: Chamada[]): string[] {
  return chamadas.flatMap((c) => {
    if (c.dono === null) return [`${c.arquivo}:${c.linha} — chamada de IA SEM dono declarado (falta \`agentId\`)`];
    if (c.dono === "<dinamico>") return [];   // expressão: o registro confere em runtime
    if (!donoDaChamada(c.dono)) return [`${c.arquivo}:${c.linha} — dono "${c.dono}" não existe em lib/ai/donos.ts`];
    return [];
  });
}

describe("todo gasto de IA tem dono — o repositório", () => {
  const arquivos = PASTAS.flatMap((p) => arquivosDeCodigo(join(RAIZ, p)));
  const chamadas = arquivos.flatMap((a) =>
    chamadasDoArquivo(readFileSync(a, "utf8"), a.replace(RAIZ + "/", "")),
  );

  it("acha as chamadas — senão este teste passaria por não olhar nada", () => {
    // Guarda contra o pior modo de falha de um teste de varredura: a varredura
    // quebra, encontra zero e o teste fica verde para sempre.
    expect(chamadas.length).toBeGreaterThan(20);
  });

  it("METADE LIMPA: nenhuma chamada sem dono, nenhum dono inexistente", () => {
    expect(reprovar(chamadas)).toEqual([]);
  });
});

describe("as duas metades da trava", () => {
  it("BARRA: chamada sem agentId é reprovada", () => {
    const fonte = `const r = await generate({ system: "s", user: "u", workspaceId: ws });`;
    const problemas = reprovar(chamadasDoArquivo(fonte, "plantado.ts"));
    expect(problemas).toHaveLength(1);
    expect(problemas[0]).toContain("SEM dono declarado");
  });

  it("BARRA: agentId com id que não está no registro é reprovado", () => {
    const fonte = `await generate({ system: "s", user: "u", agentId: "social-midia" });`;
    const problemas = reprovar(chamadasDoArquivo(fonte, "plantado.ts"));
    expect(problemas).toHaveLength(1);
    expect(problemas[0]).toContain('"social-midia" não existe');
  });

  it("NÃO INVENTA: chamada bem formada passa", () => {
    const fonte = `await generate({ system: "s", user: "u", agentId: "esteira-triagem", clientId });`;
    expect(reprovar(chamadasDoArquivo(fonte, "limpo.ts"))).toEqual([]);
  });

  it("NÃO INVENTA: `generate({` citado em comentário não conta como chamada", () => {
    const fonte = `// exemplo de uso: generate({ system, user })\nconst x = 1;`;
    expect(chamadasDoArquivo(fonte, "prosa.ts")).toEqual([]);
  });
});

describe("o registro de donos", () => {
  it("todo dono declara o departamento que paga", () => {
    const semDepartamento = DONOS_DE_CHAMADA.filter((d) => !d.departmentId.trim());
    expect(semDepartamento).toEqual([]);
  });

  it("o departamento sai do registro quando o chamador não o declara", () => {
    expect(departamentoQuePaga("esteira-triagem")).toBe("client-service-sdr");
  });

  it("o que o chamador declara vence o registro", () => {
    expect(departamentoQuePaga("esteira-triagem", "quality")).toBe("quality");
  });

  it("dono desconhecido devolve null — NÃO um departamento chutado", () => {
    // Ausência de informação não é informação: atribuir a casa errada faria o
    // DRE cobrar de um departamento um custo que não é dele.
    expect(departamentoQuePaga("agente-que-nao-existe")).toBeNull();
  });
});

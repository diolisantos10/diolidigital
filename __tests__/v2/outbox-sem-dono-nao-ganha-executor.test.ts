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
//   • `POST /api/cron/v2` não tem executor de saída — o único tipo registrado
//     em `EXECUTORES` é `registro_de_teste`, que escreve uma linha de log;
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
// **trava é mecanismo**. Enquanto `OutboxV2` não tiver coluna de dono, o CI
// REPROVA qualquer tipo novo em `EXECUTORES`.
//
// A saída não é "afrouxar o teste": é pôr a coluna de dono no `OutboxV2`. No
// instante em que ela existir no schema, esta trava solta sozinha.
//
// ─── AS DUAS METADES ─────────────────────────────────────────────────────────
//
// Metade 1 — BARRA o problema plantado: uma fonte sintética com um executor
//            novo (`enviar_whatsapp`) é REPROVADA pela mesma função.
// Metade 2 — NÃO INVENTA PROBLEMA no caso limpo: o repositório como está passa;
//            e quando o schema sintético TEM coluna de dono, o executor novo
//            passa também — a trava solta, não engorda.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const RAIZ = process.cwd();
const FONTE_DO_CRON = join(RAIZ, "app/api/cron/v2/route.ts");
const SCHEMA = join(RAIZ, "prisma/schema.prisma");

/** Os únicos tipos de efeito toleráveis enquanto o outbox não tiver dono. */
const INERTES = ["registro_de_teste"];

// ─── As funções puras da trava ───────────────────────────────────────────────

/** Tira comentário e literal de texto: sem isso o varredor confunde os dois-pontos de uma frase com uma chave. */
function semRuido(fonte: string): string {
  return fonte
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "")
    .replace(/`(?:[^`\\]|\\.)*`/g, '""')
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\]|\\.)*'/g, '""');
}

/** Os tipos de efeito declarados em `EXECUTORES`, lidos do código-fonte. */
export function tiposDeEfeito(fonte: string): string[] {
  const limpo = semRuido(fonte);
  const inicio = limpo.indexOf("const EXECUTORES");
  if (inicio < 0) {
    throw new Error(
      "`const EXECUTORES` não foi encontrado em app/api/cron/v2/route.ts. " +
        "Ou o registro mudou de nome/lugar, ou esta trava perdeu o alvo — e trava que perdeu o alvo passa calada. " +
        "Reaponte-a antes de mexer no relógio da V2.",
    );
  }
  const abre = limpo.indexOf("{", inicio);
  let profundidade = 0;
  let fim = -1;
  for (let i = abre; i < limpo.length; i++) {
    if (limpo[i] === "{") profundidade++;
    else if (limpo[i] === "}") {
      profundidade--;
      if (profundidade === 0) {
        fim = i;
        break;
      }
    }
  }
  if (fim < 0) throw new Error("bloco de EXECUTORES não fecha — fonte ilegível para a trava");

  const corpo = limpo.slice(abre + 1, fim);
  const chaves: string[] = [];
  let nivel = 0;
  let i = 0;
  while (i < corpo.length) {
    const c = corpo[i];
    if (c === "{" || c === "(" || c === "[") {
      nivel++;
      i++;
      continue;
    }
    if (c === "}" || c === ")" || c === "]") {
      nivel--;
      i++;
      continue;
    }
    if (nivel === 0) {
      const m = /^(["']?)([A-Za-z_$][\w$-]*)\1\s*:/.exec(corpo.slice(i));
      if (m) {
        chaves.push(m[2]);
        i += m[0].length;
        continue;
      }
    }
    i++;
  }
  return chaves;
}

/** O `OutboxV2` já sabe de quem é cada linha? */
export function outboxTemDono(schema: string): boolean {
  const inicio = schema.indexOf("model OutboxV2 {");
  if (inicio < 0) {
    throw new Error(
      "`model OutboxV2` não existe mais em prisma/schema.prisma — esta trava fala de um modelo que sumiu. Reaponte-a.",
    );
  }
  const fim = schema.indexOf("\n}", inicio);
  const bloco = schema.slice(inicio, fim);
  return /^\s*(clienteId|clientId|workspaceId)\s/m.test(bloco);
}

export interface Veredito {
  aprovado: boolean;
  motivo: string;
}

export function vereditoDoOutbox(tipos: string[], temDono: boolean): Veredito {
  if (temDono) {
    return { aprovado: true, motivo: "OutboxV2 tem coluna de dono — a trava soltou sozinha, como foi desenhada." };
  }
  const novos = tipos.filter((t) => !INERTES.includes(t));
  if (novos.length === 0) {
    return { aprovado: true, motivo: "só efeito inerte registrado — o vetor continua zero." };
  }
  return {
    aprovado: false,
    motivo: [
      "",
      "🔴 EFEITO DE SAÍDA NOVO NUM OUTBOX SEM DONO — reprovado de propósito.",
      "",
      `Tipo(s) novo(s) em EXECUTORES (app/api/cron/v2/route.ts): ${novos.join(", ")}`,
      "",
      "POR QUE ISTO REPROVA:",
      "  `OutboxV2` não tem coluna de dono (clienteId/workspaceId). Enquanto ele só",
      "  registra log, isso é um defeito INERTE: nada sai da casa. No momento em que",
      "  um tipo com consequência externa ganha executor, a mesma tabela sem dono vira",
      "  um caminho para disparar efeito de um cliente a partir de outro — e",
      "  `POST /api/v2/retomar` alcança linha por `correlationId` vindo do corpo.",
      "",
      "COMO DESTRAVAR (e não é afrouxando este teste):",
      "  1. pôr `clienteId` (ou `workspaceId`) em `model OutboxV2` no prisma/schema.prisma,",
      "     com migration — é decisão do dono do modelo de dados;",
      "  2. recortar por ele TODA leitura e TODA escrita do outbox, inclusive as duas",
      "     consultas de `retomar` (leitura E update: meia trava parece inteira);",
      "  3. este teste solta sozinho no instante em que a coluna existir.",
      "",
    ].join("\n"),
  };
}

// ─── O repositório como está ─────────────────────────────────────────────────

describe("o outbox sem dono não ganha executor novo", () => {
  const fonte = readFileSync(FONTE_DO_CRON, "utf8");
  const schema = readFileSync(SCHEMA, "utf8");

  it("a trava enxerga o alvo — se o varredor não achar nada, ela passaria calada", () => {
    const tipos = tiposDeEfeito(fonte);
    // Trava que não encontra nada é trava que aprova tudo. Este é o teste da trava.
    expect(tipos.length).toBeGreaterThan(0);
    expect(tipos).toContain("registro_de_teste");
  });

  it("HOJE: OutboxV2 continua sem coluna de dono — o fato que a trava vigia", () => {
    expect(outboxTemDono(schema)).toBe(false);
  });

  it("✅ o repositório como está PASSA — a trava não inventa problema", () => {
    const v = vereditoDoOutbox(tiposDeEfeito(fonte), outboxTemDono(schema));
    expect(v.aprovado, v.motivo).toBe(true);
  });
});

// ─── As duas metades, em amostra sintética ───────────────────────────────────

describe("as duas metades da trava", () => {
  const FONTE_LIMPA = `
const EXECUTORES: Record<string, Executor> = {
  // um comentário com dois pontos: e uma frase qualquer
  registro_de_teste: async (payload, correlationId) => {
    console.log("[cron/v2] processado", { payload, correlationId });
  },
};
`;
  const FONTE_PLANTADA = `
const EXECUTORES: Record<string, Executor> = {
  registro_de_teste: async () => {},
  enviar_whatsapp: async (payload) => { await mandarMensagem(payload); },
};
`;
  const SCHEMA_SEM_DONO = `
model OutboxV2 {
  id                 String    @id @default(cuid())
  tipo               String
  correlationId      String
}
`;
  const SCHEMA_COM_DONO = `
model OutboxV2 {
  id                 String    @id @default(cuid())
  tipo               String
  clienteId          String
  correlationId      String
}
`;

  it("o varredor lê as chaves, e não se engana com comentário nem com literal", () => {
    expect(tiposDeEfeito(FONTE_LIMPA)).toEqual(["registro_de_teste"]);
    expect(tiposDeEfeito(FONTE_PLANTADA)).toEqual(["registro_de_teste", "enviar_whatsapp"]);
  });

  it("⛔ METADE 1 — executor novo com outbox sem dono é REPROVADO, e a mensagem explica", () => {
    const v = vereditoDoOutbox(tiposDeEfeito(FONTE_PLANTADA), outboxTemDono(SCHEMA_SEM_DONO));
    expect(v.aprovado).toBe(false);
    expect(v.motivo).toContain("enviar_whatsapp");
    expect(v.motivo).toContain("clienteId");
    expect(v.motivo).toContain("retomar");
  });

  it("✅ METADE 2 — o caso limpo passa", () => {
    expect(vereditoDoOutbox(tiposDeEfeito(FONTE_LIMPA), outboxTemDono(SCHEMA_SEM_DONO)).aprovado).toBe(true);
  });

  it("🔑 e a trava SOLTA sozinha: com coluna de dono no schema, o executor novo passa", () => {
    const v = vereditoDoOutbox(tiposDeEfeito(FONTE_PLANTADA), outboxTemDono(SCHEMA_COM_DONO));
    expect(v.aprovado, "trava que não solta quando o problema é resolvido vira imposto permanente").toBe(true);
  });

  it("fonte sem EXECUTORES não passa calada — ela GRITA", () => {
    expect(() => tiposDeEfeito("const OUTRA_COISA = {};")).toThrow(/EXECUTORES/);
  });

  it("schema sem OutboxV2 não passa calado — ele GRITA", () => {
    expect(() => outboxTemDono("model Outra {}")).toThrow(/OutboxV2/);
  });
});

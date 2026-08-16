// ── A CONTENÇÃO: UM RESOLVEDOR SÓ PARA TOKEN DE PORTAL ─────────────────────
//
// ⚠️ ESTE TESTE EXISTE PORQUE O MESMO ERRO ACONTECEU QUATRO VEZES SEGUIDAS.
//
//   rodada 2 — 5 rotas convertidas, 4 esquecidas;
//   rodada 3 — `escopoDoToken` criado, e `media/[id]` REGREDIDO;
//   rodada 4 — `donoDoToken` recusa o token legado, e `conversaDoToken`
//              CONCEDE, com as duas portas discordando entre si;
//   e a frase estava escrita dentro do próprio arquivo consertado
//   (`portal-access-service.ts`): *"a trava vai onde o id é USADO — converter
//   a função central não converte quem não a chama."*
//
// Revisão humana não pega isso: cada rodada parece completa por dentro. O que
// pega é uma regra que roda. **Sem gate = reprovado.**
//
// ── A REGRA ────────────────────────────────────────────────────────────────
// Nenhum arquivo da superfície do portal resolve credencial de portal por
// conta própria. Quem resolve é `lib/agency/persistence/portal-access-service`
// (`escopoDoToken` / `donoDoToken` / `resolvePortalClient`) — e mais ninguém.
//
// Concretamente, na superfície listada é PROIBIDO:
//   • importar `validatePortalAccess` ou `conferirTokenDoPortal`;
//   • tocar em `prisma.portalAccess` (findUnique/findFirst/findMany/update…).
//
// A allowlist é curta, nominal e justificada. Arquivo novo nasce coberto.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const RAIZ = process.cwd();

/** A superfície que fala com o cliente por token de portal. */
const SUPERFICIE = [
  "app/api/portal",
  "app/api/brain/portal-data",
  "app/api/media",
  "app/api/social-posts",
  "app/portal",
  // O resolvedor da CONVERSA mora aqui e é chamado pelas rotas do portal —
  // foi exatamente por estar fora da lista que ele divergiu na rodada 4.
  "app/api/messages/conversa.ts",
  // ⚠️ `lib/agency/portal/**` entrou na rodada 6: é onde moram os helpers de
  // POSSE que as rotas chamam, e a varredura não o via. `qualidade` mostrou
  // que `solicitacao-que-mudou-de-dono.ts` já lia `prisma.portalAccess` sem
  // ser varrido — helper fora da varredura é rota fora da varredura com outro
  // nome.
  "lib/agency/portal",
];

/**
 * Quem pode resolver por conta própria, e POR QUÊ. Toda linha aqui é uma
 * exceção declarada — se a lista crescer sem motivo escrito, a trava virou
 * decoração.
 */
// ⚠️ A ALLOWLIST ESTÁ VAZIA, E ISSO É O CONSERTO (rodada 6).
//
// Ela tinha uma entrada — `app/api/portal/session` — justificada por uma
// afirmação FALSA: *"continua obrigada a exigir dono — provado em
// `cookie-de-outro-cliente-na-porta`"*. Aquele teste faz `vi.mock` do módulo e
// só exercita `app/portal/access/route.ts`; **nunca tocou em `session`**. A
// única exceção do único gate de arquitetura estava apoiada em prova que não
// existia — e a rota, medida, dava 200 + cookie de 180 dias para token nu e
// para `ponteiro_andou`.
//
// A rota passou a usar o resolvedor único, e a exceção deixou de ser
// necessária. Exceção que some é melhor que exceção justificada.
const PERMITIDOS: Record<string, string> = {};

function arquivosDe(alvo: string): string[] {
  const caminho = join(RAIZ, alvo);
  let st: ReturnType<typeof statSync>;
  try { st = statSync(caminho); } catch { return []; }
  if (st.isFile()) return caminho.endsWith(".ts") || caminho.endsWith(".tsx") ? [caminho] : [];
  return readdirSync(caminho).flatMap((n) => arquivosDe(join(alvo, n)));
}

/** Código sem comentários — um comentário que CITA a proibição não a viola. */
function codigo(fonte: string): string {
  return fonte
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n").filter((l) => !l.trimStart().startsWith("//")).join("\n");
}

const PROIBIDOS: { nome: string; re: RegExp; porque: string }[] = [
  {
    nome: "validatePortalAccess",
    re: /\bvalidatePortalAccess\b/,
    porque: "resolve o token sem a guarda de dono — foi assim que 4 rotas ficaram para trás",
  },
  {
    nome: "conferirTokenDoPortal",
    re: /\bconferirTokenDoPortal\b/,
    porque: "confere existência/validade e NÃO confere dono",
  },
  {
    // ⚠️ A REGRA É "RESOLVER POR TOKEN", NÃO "TOCAR NA TABELA".
    //
    // A primeira versão proibia `prisma.portalAccess` inteiro, e acusou
    // `solicitacao-que-mudou-de-dono.ts` — que lê a tabela por
    // `clientRequestId` como EVIDÊNCIA de troca de dono, não para resolver
    // credencial nenhuma. Proibição larga demais se paga com exceção, e
    // exceção é onde o furo volta a morar. A busca POR TOKEN é que é
    // resolução, e é ela que fica proibida.
    nome: "prisma.portalAccess … { token",
    re: /prisma\s*\.\s*portalAccess[\s\S]{0,120}?\btoken\b\s*[,:}]/,
    porque: "buscar o registro PELO TOKEN é resolver credencial — isso é do resolvedor único",
  },
  {
    // A fuga que o `qualidade` provou passar: apelidar o cliente do Prisma.
    nome: "prisma apelidado",
    re: /import\s*\{[^}]*\bprisma\s+as\s+\w+/,
    porque: "apelidar o prisma escapa da varredura por nome — se precisa apelidar, precisa explicar",
  },
];

describe("um resolvedor só para credencial de portal", () => {
  const alvos = SUPERFICIE.flatMap(arquivosDe);

  it("a superfície do portal existe e está sendo varrida de verdade", () => {
    // Varredura que não acha arquivo nenhum passa sempre — e não protege nada.
    expect(alvos.length).toBeGreaterThan(15);
  });

  it("⛔ nenhuma rota resolve token de portal fora do resolvedor único", () => {
    const violacoes: string[] = [];

    for (const caminho of alvos) {
      const rel = relative(RAIZ, caminho);
      if (PERMITIDOS[rel]) continue;
      const fonte = codigo(readFileSync(caminho, "utf8"));
      for (const p of PROIBIDOS) {
        if (p.re.test(fonte)) violacoes.push(`${rel} → usa \`${p.nome}\` (${p.porque})`);
      }
    }

    // O caminho do arquivo entra na mensagem: alerta que diz "algo violou" sem
    // o caso concreto é ruído que ninguém investiga.
    expect(violacoes, `\n${violacoes.join("\n")}\n`).toEqual([]);
  });

  it("⛔ a allowlist não cresce em silêncio — cada exceção tem motivo escrito", () => {
    for (const [arquivo, motivo] of Object.entries(PERMITIDOS)) {
      expect(motivo.length, `${arquivo} sem motivo`).toBeGreaterThan(20);
    }
    // Se esta conta subir, alguém abriu exceção — e vai ter de explicar aqui.
    // 2 → 1 → 0. A última caiu quando `POST /api/portal/session` passou pelo
    // resolvedor: a justificativa dela citava um teste que não a exercitava.
    expect(Object.keys(PERMITIDOS)).toHaveLength(0);
  });
});

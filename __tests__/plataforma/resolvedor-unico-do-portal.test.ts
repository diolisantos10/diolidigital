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
];

/**
 * Quem pode resolver por conta própria, e POR QUÊ. Toda linha aqui é uma
 * exceção declarada — se a lista crescer sem motivo escrito, a trava virou
 * decoração.
 */
const PERMITIDOS: Record<string, string> = {
  // A porta que TROCA token por cookie: ela precisa conferir o token cru,
  // porque é ela que decide se grava a credencial. Continua obrigada a exigir
  // dono — provado em `__tests__/portal/cookie-de-outro-cliente-na-porta`.
  "app/api/portal/session/route.ts": "mint do cookie: confere o token cru por definição",
  "app/portal/access/route.ts": "porta de entrada: mesma razão do mint",
};

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
    nome: "prisma.portalAccess",
    re: /prisma\s*\.\s*portalAccess\b/,
    porque: "ler o registro do token à mão é reimplementar o resolvedor",
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
    expect(Object.keys(PERMITIDOS)).toHaveLength(2);
  });
});

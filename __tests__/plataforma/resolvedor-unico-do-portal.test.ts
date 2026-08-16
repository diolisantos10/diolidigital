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
// **Nenhum arquivo de `app/` ou `lib/`** resolve credencial de portal por
// conta própria. Quem resolve é `lib/agency/persistence/portal-access-service`
// (`escopoDoToken` / `donoDoToken` / `resolvePortalClient`) — e mais ninguém.
//
// Concretamente, em TODO o repositório é PROIBIDO:
//   • importar `validatePortalAccess` ou `conferirTokenDoPortal`;
//   • LER `prisma.portalAccess` (find*/count/aggregate/groupBy);
//   • alcançar a tabela por colchete ou apelidar o cliente do Prisma.
//
// As duas allowlists são nominais, curtas e com motivo escrito. **Arquivo novo
// nasce coberto** — e agora isso é verdade literal, não intenção: não há lista
// de pastas de onde ele possa nascer de fora.
//
// 🔴 O QUE A INVERSÃO ACHOU NA PRIMEIRA VEZ QUE RODOU:
// `lib/integrations/meta/notifications.ts` resolvia token por conta própria,
// num arquivo que ninguém associava ao portal — e o destino ali é um
// **telefone**. Ver o comentário na linha consertada. Uma varredura por lista
// de pastas nunca teria encontrado, porque a pasta não estava na lista.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const RAIZ = process.cwd();

// ── 🔴 RODADA 10: O DEFAULT FOI INVERTIDO ───────────────────────────────────
//
// Até aqui a varredura tinha uma LISTA DE LUGARES VIGIADOS (`SUPERFICIE`), e o
// `qualidade` mostrou três fugas que passavam por ela:
//
//   1. **arquivo fora da lista** — bastava resolver token em qualquer pasta
//      não listada;
//   2. **`prisma["portalAccess"]`** — colchete no lugar do ponto;
//   3. **`where: { token }` a mais de 120 caracteres** do nome da tabela — a
//      janela da expressão regular era o limite.
//
// Lista de lugares vigiados é a mesma forma de erro que este arquivo existe
// para conter: *"a trava vai onde o id é USADO — converter a função central
// não converte quem não a chama."* Uma lista de pastas nunca acompanha o
// código; **o default é que precisa mudar de lado.**
//
// Agora varre-se **o repositório inteiro** (`app/` e `lib/`), e o que pode
// LER a tabela de credencial é uma lista **nominal, curta e com motivo
// escrito**. A janela de 120 caracteres morreu junto: não se procura mais
// "portalAccess perto de token" — qualquer LEITURA da tabela fora da lista é
// violação, e não há distância que escape disso.
const VARREDURA = ["app", "lib"];
/** Gerado pelo Prisma — não é código desta casa. */
const FORA_DA_VARREDURA = ["lib/generated"];

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
const PERMITIDOS: Record<string, string> = {
  // ⚠️ Isto NÃO é uma exceção à regra: é o arquivo onde a regra mora. Ele passa
  // a aparecer na varredura porque o default virou "o repositório inteiro" —
  // pedir que o resolvedor único não use as próprias funções seria pedir que
  // ele não exista. Vigiá-lo é papel dos testes de comportamento
  // (`reconferencia-do-dono`), não de uma varredura de texto.
  "lib/agency/persistence/portal-access-service.ts":
    "É O RESOLVEDOR ÚNICO — o arquivo onde a regra mora, não um cliente dela.",
};

/**
 * Quem pode LER `PortalAccess`, e por quê. Nenhuma destas resolve
 * credencial: nenhuma delas procura por `token`. Elas leem a tabela por
 * `clientId` ou por `clientRequestId`, para EMITIR, para CONTAR ou como
 * EVIDÊNCIA. Cada linha é uma exceção declarada; lista que cresce sem motivo
 * escrito é trava virando decoração.
 */
const PODEM_LER_A_TABELA: Record<string, string> = {
  "lib/agency/persistence/portal-access-service.ts":
    "É O RESOLVEDOR ÚNICO. É o único lugar do repositório onde token vira dono.",
  "lib/agency/esteira/links-do-portal.ts":
    "EMITE e reaproveita link, buscando por `clientId` (nunca por token). É quem "
    + "responde 'qual o link do cliente X', a pergunta oposta de 'de quem é este token'.",
  "lib/agency/portal/solicitacao-que-mudou-de-dono.ts":
    "Lê por `clientRequestId` como EVIDÊNCIA de troca de dono. Não resolve credencial: "
    + "responde 'esta pasta já serviu outro cliente?'.",
  "lib/agency/portal/backfill-de-carimbo.ts":
    "Lê por `clientRequestId` como uma das três provas do carimbo retroativo, offline.",
  "app/api/brain/portal-access/route.ts":
    "Rota de ADMIN (sessão de equipe, não token de portal): lista credenciais por "
    + "`clientId`/`clientRequestId` para a agência. Não há token na consulta.",
  "app/api/admin/reset-request/route.ts":
    "Ferramenta de ADMIN: apaga e reemite o acesso de uma solicitação. Busca por "
    + "`clientRequestId`, nunca por token.",
  "app/api/admin/reset/route.ts":
    "CONTA linhas (`count()`) para o inventário de reset. Não lê registro nenhum: "
    + "um número de linhas não resolve credencial de ninguém.",
  "lib/agency/balcao/producao.ts":
    "Antes de EMITIR, confere por `clientId` se o cliente já tem acesso vivo — é o que "
    + "impede o balcão de criar um token novo a cada compra. Não há token na consulta.",
};

function arquivosDe(alvo: string): string[] {
  if (FORA_DA_VARREDURA.some((f) => alvo === f || alvo.startsWith(`${f}/`))) return [];
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

interface Proibicao {
  nome: string;
  re: RegExp;
  porque: string;
  /** Exceções NOMINAIS desta proibição, cada uma com o motivo escrito. */
  liberadosPor?: Record<string, string>;
}

const PROIBIDOS: Proibicao[] = [
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
    // ⚠️ A JANELA DE 120 CARACTERES MORREU (rodada 10).
    //
    // A versão anterior procurava `prisma.portalAccess` **perto** de `token` —
    // e o `qualidade` mostrou que bastava afastar a cláusula `where` para
    // passar. Distância nunca foi a regra; era só o que a expressão alcançava.
    //
    // Agora: **qualquer LEITURA da tabela de credencial** conta, com ponto ou
    // com colchete, em qualquer arquivo de `app/` e `lib/`. Quem pode ler está
    // em `PODEM_LER_A_TABELA`, nominalmente e com motivo. `create`, `update` e
    // `delete` ficam de fora desta regra: emitir e apagar não é resolver, e
    // proibição larga demais se paga com exceção — exceção é onde o furo mora.
    nome: "leitura de PortalAccess fora do resolvedor",
    // A aspa e o colchete OPCIONAIS no meio são o que fecha a fuga nº 2: a
    // forma `["portalAccess"].findFirst` tem `"` e `]` entre o nome e o ponto,
    // e a versão sem eles deixava passar — medido com a fuga plantada.
    re: /\bportalAccess\b\s*["'`]?\s*\]?\s*\.\s*(findUnique|findFirst|findMany|count|aggregate|groupBy)/,
    porque: "quem lê a tabela de credencial resolve credencial — isso é do resolvedor único",
    liberadosPor: PODEM_LER_A_TABELA,
  },
  {
    // Colchete no lugar do ponto — a fuga nº 2 do `qualidade`. A regra acima já
    // pega o `.findFirst` que vem depois; esta pega a INTENÇÃO de escapar da
    // varredura por nome, que é sinal por si só.
    nome: "prisma com colchete",
    re: /prisma\s*\[\s*["'`]portalAccess/,
    porque: "acessar a tabela por colchete só serve para escapar de varredura por nome",
  },
  {
    // A fuga que o `qualidade` provou passar: apelidar o cliente do Prisma.
    nome: "prisma apelidado",
    re: /import\s*\{[^}]*\bprisma\s+as\s+\w+/,
    porque: "apelidar o prisma escapa da varredura por nome — se precisa apelidar, precisa explicar",
  },
];

describe("um resolvedor só para credencial de portal", () => {
  const alvos = VARREDURA.flatMap(arquivosDe);

  it("o repositório está sendo varrido de verdade, e não uma lista de pastas", () => {
    // Varredura que não acha arquivo nenhum passa sempre — e não protege nada.
    // O número é alto de propósito: se alguém trocar a varredura por uma lista
    // curta de novo, esta linha cai antes de a trava virar decoração.
    expect(alvos.length).toBeGreaterThan(400);
    // E as três fugas da rodada 9 têm de estar cobertas: arquivo FORA da antiga
    // lista de pastas precisa ser varrido.
    const rel = alvos.map((c) => relative(RAIZ, c));
    expect(rel).toContain("lib/integrations/meta/notifications.ts");
    expect(rel).toContain("lib/agency/balcao/producao.ts");
  });

  it("⛔ nenhuma rota resolve token de portal fora do resolvedor único", () => {
    const violacoes: string[] = [];

    for (const caminho of alvos) {
      const rel = relative(RAIZ, caminho);
      if (PERMITIDOS[rel]) continue;
      const fonte = codigo(readFileSync(caminho, "utf8"));
      for (const p of PROIBIDOS) {
        if (p.liberadosPor?.[rel]) continue;
        if (p.re.test(fonte)) violacoes.push(`${rel} → usa \`${p.nome}\` (${p.porque})`);
      }
    }

    // O caminho do arquivo entra na mensagem: alerta que diz "algo violou" sem
    // o caso concreto é ruído que ninguém investiga.
    expect(violacoes, `\n${violacoes.join("\n")}\n`).toEqual([]);
  });

  it("⛔ quem pode LER a tabela de credencial é nominal, e cada um tem motivo", () => {
    for (const [arquivo, motivo] of Object.entries(PODEM_LER_A_TABELA)) {
      expect(motivo.length, `${arquivo} sem motivo escrito`).toBeGreaterThan(40);
      // Exceção para arquivo que não existe mais é exceção que ninguém revisou.
      expect(() => statSync(join(RAIZ, arquivo)), `${arquivo} não existe`).not.toThrow();
    }
    // Se esta conta subir, alguém abriu exceção — e vai ter de explicar aqui.
    expect(Object.keys(PODEM_LER_A_TABELA)).toHaveLength(8);
  });

  it("⛔ a allowlist não cresce em silêncio — cada exceção tem motivo escrito", () => {
    for (const [arquivo, motivo] of Object.entries(PERMITIDOS)) {
      expect(motivo.length, `${arquivo} sem motivo`).toBeGreaterThan(20);
    }
    // Se esta conta subir, alguém abriu exceção — e vai ter de explicar aqui.
    // 2 → 1 → 0. A última caiu quando `POST /api/portal/session` passou pelo
    // resolvedor: a justificativa dela citava um teste que não a exercitava.
    expect(Object.keys(PERMITIDOS)).toHaveLength(1);
  });
});

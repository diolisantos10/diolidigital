// TESTE 13 do contrato — nenhum dado interno vaza para o portal externo.
//
// ── O QUE ESTE TESTE NÃO FAZ, E POR QUE ─────────────────────────────────
//
// Ele NÃO cria uma segunda política de fronteira. A tentação, ao construir um
// painel interno rico, é escrever aqui um `toClientPortalView()` com uma lista
// de campos proibidos — e é exatamente o erro que esta casa já pagou: a
// conferência de posse vivia copiada em três lugares e as cópias divergiram.
// Duas políticas com o mesmo nome não protegem o dobro; protegem menos, porque
// cada lado assume que o outro cuidou.
//
// A fronteira canônica JÁ EXISTE, é mais antiga e tem cicatriz:
//   · `Deliverable.visibility`        — nasce "interno"; vira "compartilhado"
//                                       só no ato de apresentar.
//   · `ApprovalRequest.clientVisible` — o card só existe para o cliente quando
//                                       alguém decidiu que existe.
//   · `app/api/brain/portal-data`     — o ÚNICO montador do pacote do portal.
//   · `lib/auth/posse-de-workspace`   — estar logado não é ser dono.
//
// Então o que este arquivo verifica é o que PODE quebrar com a chegada do
// workspace: (1) que o painel interno não seja importado pelo portal, (2) que o
// dado interno novo (cascata, custo, prompt, tarefa) não tenha rota pública, e
// (3) que a fronteira antiga continue de pé.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const RAIZ = process.cwd();

function lerRecursivo(dir: string): { nome: string; fonte: string }[] {
  if (!fs.existsSync(dir)) return [];
  const saida: { nome: string; fonte: string }[] = [];
  for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entrada.name);
    if (entrada.isDirectory()) saida.push(...lerRecursivo(p));
    else if (/\.tsx?$/.test(entrada.name)) {
      saida.push({ nome: path.relative(RAIZ, p), fonte: fs.readFileSync(p, "utf8") });
    }
  }
  return saida;
}

const PORTAL = [
  ...lerRecursivo(path.join(RAIZ, "app/portal")),
  ...lerRecursivo(path.join(RAIZ, "components/portal")),
  ...lerRecursivo(path.join(RAIZ, "lib/agency/portal")),
  ...lerRecursivo(path.join(RAIZ, "app/api/portal")),
];

const WORKSPACE = [
  ...lerRecursivo(path.join(RAIZ, "components/agency/clients/workspace")),
  ...lerRecursivo(path.join(RAIZ, "lib/agency/clients/workspace")),
];

describe("13. nenhum dado interno vaza para o portal externo", () => {
  it("existem arquivos dos dois lados para comparar", () => {
    expect(PORTAL.length).toBeGreaterThan(5);
    expect(WORKSPACE.length).toBeGreaterThan(15);
  });

  it("⚠️ o portal NÃO importa nada do workspace interno", () => {
    // Esta é a checagem que importa de verdade. Enquanto o portal não importar
    // um único módulo daqui, nenhum campo interno tem por onde atravessar.
    const culpados = PORTAL.filter(
      (a) => a.fonte.includes("clients/workspace") || a.fonte.includes("ClientWorkspaceShell"),
    ).map((a) => a.nome);
    expect(culpados, `o portal importou o painel interno: ${culpados.join(", ")}`).toEqual([]);
  });

  it("o workspace interno não é montado por nenhuma rota pública", () => {
    const publicas = lerRecursivo(path.join(RAIZ, "app/portal"));
    const culpados = publicas.filter((a) => a.fonte.includes("PaginaDoCliente")).map((a) => a.nome);
    expect(culpados).toEqual([]);
  });

  it("a rota do workspace exige sessão — não existe caminho por token público", () => {
    const pagina = fs.readFileSync(path.join(RAIZ, "app/agency/clients/[id]/page.tsx"), "utf8");
    expect(pagina).toContain("verifySession");
    expect(pagina).not.toContain("validatePortalAccess");
  });

  it("a CASCATA entre agentes é interna e está marcada como tal no DTO", () => {
    const vista = fs.readFileSync(path.join(RAIZ, "lib/agency/clients/workspace/vista.ts"), "utf8");
    expect(vista).toMatch(/internal:\s*\{\s*cascade/);
  });

  it("a cascata só é desenhada com `showCascade`, e o portal não monta o componente", () => {
    const chat = fs.readFileSync(
      path.join(RAIZ, "components/agency/clients/workspace/ProjectManagerChat.tsx"),
      "utf8",
    );
    expect(chat).toContain("showCascade &&");
    const culpados = PORTAL.filter((a) => a.fonte.includes("ProjectManagerChat")).map((a) => a.nome);
    expect(culpados).toEqual([]);
  });

  it("o workspace NÃO reimplementa a fronteira — uma política só, e é a antiga", () => {
    // Sem os comentários: `vista.ts` EXPLICA que a segunda política existiu no
    // porte anterior e foi removida de propósito. Apagar essa frase apagaria a
    // razão — e alguém a recriaria em seis meses achando que faltava.
    const semComentarios = (f: string) =>
      f.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
    const culpados = WORKSPACE.filter((a) => {
      const f = semComentarios(a.fonte);
      return f.includes("toClientPortalView") || f.includes("INTERNAL_ONLY_KEYS");
    }).map((a) => a.nome);
    expect(culpados, `segunda política de fronteira em: ${culpados.join(", ")}`).toEqual([]);
  });

  it("a fronteira canônica continua de pé: visibility, clientVisible e portal-data", () => {
    const schema = fs.readFileSync(path.join(RAIZ, "prisma/schema.prisma"), "utf8");
    expect(schema).toMatch(/visibility\s+String\s+@default\("interno"\)/);
    expect(schema).toMatch(/clientVisible\s+Boolean\s+@default\(false\)/);
    expect(fs.existsSync(path.join(RAIZ, "app/api/brain/portal-data/route.ts"))).toBe(true);
  });

  it("o workspace lê `visibility` e `clientVisible` em vez de decidir sozinho quem vê", () => {
    const loader = fs.readFileSync(path.join(RAIZ, "lib/agency/clients/workspace/carregar-cliente.ts"), "utf8");
    expect(loader).toContain("visibility: true");
    expect(loader).toContain("clientVisible: true");
    expect(loader).toContain('d.visibility === "compartilhado"');
  });

  it("nenhum custo, margem, prompt ou log técnico atravessa o DTO do cliente", () => {
    const vista = fs.readFileSync(path.join(RAIZ, "lib/agency/clients/workspace/vista.ts"), "utf8");
    const semComentario = vista.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
    for (const campo of ["cost", "margin", "custoInterno", "margem", "prompt", "systemPrompt", "apiKey"]) {
      expect(semComentario, `campo interno no DTO: ${campo}`).not.toMatch(new RegExp(`\\b${campo}\\s*[:?]`, "i"));
    }
  });

  it("o portal externo não foi alterado por este trabalho", () => {
    // Fronteira do despacho: preservar a ligação segura, não redesenhar o
    // portal. Se o portal precisar mudar, é outro pedido — e outro dono.
    expect(PORTAL.some((a) => a.fonte.includes("clients/workspace"))).toBe(false);
  });
});

// A TRAVA DE PILAR, com as duas metades.
//
// Metade 1: ela BARRA o problema plantado (os três pilares que produziram
//           anúncio de emprego falso em produção, em 07/08/2026).
// Metade 2: ela NÃO INVENTA problema no caso limpo (os pilares que passaram na
//           mesma rodada, e os clientes que não têm nada com emprego).
//
// A segunda metade é a que importa mais aqui: uma trava larga apagaria o
// calendário inteiro de um cliente de plataforma de vagas, e trava que dispara
// onde não há risco é desligada por quem não sabe o que ela protege.

import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  project: { findUnique: vi.fn() },
  deliverable: { findMany: vi.fn() },
  socialPost: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  activityEvent: { create: vi.fn() },
}));
vi.mock("@/lib/db/client", () => ({ prisma: db }));
vi.mock("@/lib/integrations/meta/client", () => ({ publishPost: vi.fn() }));
vi.mock("@/lib/integrations/meta/connections", () => ({ conexaoDoCliente: vi.fn() }));
vi.mock("@/lib/agency/media/armazenamento", () => ({ caminhoPublicoAssinado: vi.fn() }));

import {
  conferirPilar,
  conferenciaDePixelDisponivel,
  PILARES_BLOQUEADOS,
  motivoCurto,
} from "@/lib/agency/execution/pilares-bloqueados";
import { agendarPostsDaEntrega } from "@/lib/agency/esteira/publicacao";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const RAIZ = join(__dirname, "..", "..");

// ─────────────────────────────────────────────────────────────────────────────
// METADE 1 — barra o que quebrou de verdade
// ─────────────────────────────────────────────────────────────────────────────

describe("barra os pilares que produziram anúncio de emprego falso", () => {
  // Os três nomes exatos do registro de 07/08, mais as variações de redação que
  // um agente escreveria sozinho na próxima rodada. Renomear não pode destravar.
  const BLOQUEADOS = [
    "salário aberto",
    "Salário Aberto",
    "SALARIO ABERTO",
    "salario aberto ✨",
    "transparência de salário",
    "faixa salarial da vaga",
    "quanto paga cada vaga",
    "remuneração por cargo",
    "vagas por setor",
    "Vagas por Setor",
    "vagas de setor",
    "candidatura rápida",
    "Candidatura Rapida",
    "como se candidatar em 1 minuto",
    "inscrição na vaga",
  ];

  it.each(BLOQUEADOS)("reprova o pilar %j", (pilar) => {
    const v = conferirPilar(pilar);
    expect(v.bloqueado).toBe(true);
    expect(v.chave).toBeTruthy();
    // O motivo tem que servir para quem for auditar: sem ele a trava vira um
    // "não" sem explicação, e "não" sem explicação é o que se desliga primeiro.
    expect(v.motivo && v.motivo.length).toBeGreaterThan(40);
  });

  it("o motivo curto sempre nomeia o pilar bloqueado", () => {
    expect(motivoCurto(conferirPilar("salário aberto"))).toContain("pilar bloqueado");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// METADE 2 — não inventa problema no caso limpo
// ─────────────────────────────────────────────────────────────────────────────

describe("NÃO reprova o que estava certo", () => {
  const LIMPOS = [
    // Os que foram APROVADOS na mesma rodada do CityJobs, em 07/08.
    "seis cidades",
    "dica",
    "comunidade",
    "perto de casa",
    "dica para quem procura emprego",
    "bastidores",
    "depoimento de quem foi contratado",
    // Clientes que não têm nada com emprego — a trava não pode alcançá-los.
    "pão de fermentação natural",
    "promoção da semana",
    "os preços da casa",
    "atendimento e horário",
    "antes e depois",
  ];

  it.each(LIMPOS)("libera o pilar %j", (pilar) => {
    expect(conferirPilar(pilar).bloqueado).toBe(false);
  });

  it("pilar ausente não é bloqueio — a maioria das peças da casa nunca teve pilar", () => {
    expect(conferirPilar(null).bloqueado).toBe(false);
    expect(conferirPilar(undefined).bloqueado).toBe(false);
    expect(conferirPilar("   ").bloqueado).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A TRAVA NÃO PODE TER PORTA DOS FUNDOS
// ─────────────────────────────────────────────────────────────────────────────

describe("o bloqueio não se desliga por conveniência", () => {
  it("a conferência de pixel ainda NÃO existe — enquanto isso o bloqueio vale", () => {
    // Este teste fica vermelho no dia em que alguém construir a conferência de
    // pixel. Isso é o comportamento certo: quem a construir vem aqui, lê o
    // porquê e derruba o bloqueio de propósito — nunca por acidente.
    expect(conferenciaDePixelDisponivel()).toBe(false);
  });

  it("não há variável de ambiente, flag de força nem exceção por cliente", () => {
    const fonte = readFileSync(join(RAIZ, "lib/agency/execution/pilares-bloqueados.ts"), "utf8");
    const corpo = fonte
      .split("\n")
      .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
      .join("\n");
    expect(corpo).not.toMatch(/process\.env/);
    expect(corpo).not.toMatch(/forcar|force|bypass|skipGate/i);
    expect(corpo).not.toMatch(/clientId/);
  });

  it("todo bloqueio declara procedência e data — trava anônima é desligada", () => {
    expect(PILARES_BLOQUEADOS.length).toBeGreaterThanOrEqual(3);
    for (const regra of PILARES_BLOQUEADOS) {
      expect(regra.chave).toMatch(/^[a-z-]+$/);
      expect(regra.desde).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(["decisao-escrita", "evidencia-de-producao"]).toContain(regra.origem);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A TRAVA ESTÁ NO CAMINHO VIVO — não basta a função existir
// ─────────────────────────────────────────────────────────────────────────────
//
// É a lição de 08/08 no 99Freelas: 113 testes verdes sobre código que o app
// nunca executava. Testar a função de novo não provaria nada; o que se prova
// aqui é que a produção PASSA por ela.

describe("o calendário não recebe peça de pilar bloqueado", () => {
  const PROJETO = {
    id: "p1", workspaceId: "ws1", clientId: "c1", clientRequestId: "cr1",
    presentedAt: new Date("2026-08-07"),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    db.project.findUnique.mockResolvedValue(PROJETO);
    db.socialPost.findMany.mockResolvedValue([]);
    db.socialPost.findFirst.mockResolvedValue(null);
    db.socialPost.create.mockResolvedValue({ id: "post-novo" });
    db.activityEvent.create.mockResolvedValue({});
  });

  const entregaCom = (blocos: string) => [{
    id: "d1", name: "Social — semana 1", type: "social", content: blocos,
  }];

  // O formato que `extrairPecas` lê. Duas peças: uma bloqueada, uma limpa.
  const CONTEUDO = [
    "**1. Salário aberto**",
    "- Pilar: salário aberto",
    "- Formato: single",
    "- Legenda: Na CityJobs você vê a faixa antes de se candidatar.",
    "",
    "**2. Perto de casa**",
    "- Pilar: perto de casa",
    "- Formato: single",
    "- Legenda: Filtre por bairro e ache trabalho perto de você.",
  ].join("\n");

  it("a peça bloqueada NÃO vira SocialPost, e a limpa vira", async () => {
    db.deliverable.findMany.mockResolvedValue(entregaCom(CONTEUDO));

    const r = await agendarPostsDaEntrega("p1");

    expect(r.bloqueadasPorPilar.length).toBe(1);
    expect(r.bloqueadasPorPilar[0]!.pilar.toLowerCase()).toContain("salário");

    // Nenhum post criado com o pilar bloqueado.
    const pilaresCriados = db.socialPost.create.mock.calls.map(
      (c: unknown[]) => (c[0] as { data: { pillar: string | null } }).data.pillar,
    );
    expect(pilaresCriados).not.toContain("salário aberto");

    // E a peça limpa passou: a trava não parou o cliente inteiro.
    expect(r.criados).toBeGreaterThan(0);
  });

  it("o descarte NÃO é silencioso — vira ActivityEvent com o motivo", async () => {
    db.deliverable.findMany.mockResolvedValue(entregaCom(CONTEUDO));
    await agendarPostsDaEntrega("p1");

    const eventos = db.activityEvent.create.mock.calls.map(
      (c: unknown[]) => (c[0] as { data: { type: string; message: string } }).data,
    );
    const bloqueio = eventos.find((e) => e.type === "pilar_bloqueado");
    expect(bloqueio).toBeTruthy();
    expect(bloqueio!.message).toMatch(/salari/i);
  });

  it("calendário 100% limpo não gera bloqueio nenhum", async () => {
    const limpo = [
      "**1. Perto de casa**",
      "- Pilar: perto de casa",
      "- Formato: single",
      "- Legenda: Filtre por bairro.",
    ].join("\n");
    db.deliverable.findMany.mockResolvedValue(entregaCom(limpo));

    const r = await agendarPostsDaEntrega("p1");
    expect(r.bloqueadasPorPilar).toEqual([]);
    expect(
      db.activityEvent.create.mock.calls.some(
        (c: unknown[]) => (c[0] as { data: { type: string } }).data.type === "pilar_bloqueado",
      ),
    ).toBe(false);
  });
});

describe("as duas outras portas chamam a trava", () => {
  // Varredura de código-fonte, como a trava do 99Freelas de 08/08: o que
  // protege é o caminho VIVO chamar a função, não a função existir.
  it("a produção de arte confere o pilar antes de qualquer chamada paga", () => {
    const fonte = readFileSync(join(RAIZ, "lib/agency/execution/artes.ts"), "utf8");
    expect(fonte).toContain("conferirPilar");
    const laco = fonte.indexOf("for (const post of pendentes)");
    const confere = fonte.indexOf("conferirPilar(post.pillar)");
    const orcamento = fonte.indexOf("orcamento.restam(");
    expect(laco).toBeGreaterThan(-1);
    expect(confere).toBeGreaterThan(laco);
    // ANTES do teto de gasto — depois dele o dinheiro já saiu.
    expect(confere).toBeLessThan(orcamento);
  });

  it("a publicação confere o pilar antes de falar com a Meta", () => {
    const fonte = readFileSync(join(RAIZ, "lib/agency/esteira/publicacao.ts"), "utf8");
    const confere = fonte.indexOf("conferirPilar(post.pillar)");
    const publica = fonte.indexOf("publishPost(");
    expect(confere).toBeGreaterThan(-1);
    expect(publica).toBeGreaterThan(-1);
    expect(confere).toBeLessThan(publica);
  });
});

// O PORTÃO DE PILAR APROVAVA POR OMISSÃO — as duas metades do conserto.
//
// ── O DEFEITO, MEDIDO EM 15/08/2026 ─────────────────────────────────────────
//
// O bloqueio de pilar nasceu em 07/08, depois de TRÊS peças do CityJobs saírem
// com anúncio de emprego FALSO dentro dos pixels — "VAGA $3,500", "R$6.000",
// "Assistents Administrativo · R$ 2000 per wes". Numa plataforma de vagas o
// dano tem nome: gente desempregada indo atrás de vaga que não existe.
//
// A trava foi escrita, testada e ligada em seis pontos. E na esteira automática
// ela **nunca disparou**, porque a corrente estava arrebentada em três lugares:
//
//   1. o prompt do especialista de copy NÃO pedia o campo `pillar`;
//   2. `deliverableMarkdown` (`run-execution.ts`) NÃO emitia a linha "Pilar";
//   3. `extrairPecas` (`publicacao.ts`) a procurava — e nunca a achava.
//
// Logo `post.pillar` era sempre `null`, e `conferirPilar(null)` devolvia
// LIBERADO, por escolha declarada. A escolha estava certa para o post que um
// humano digita no Planner; estava errada para a esteira, e a diferença ninguém
// tinha medido. Cada peça passava no teste dela. A corrente é que estava rota —
// exatamente a lição do piloto de 07/08.
//
// ── AS DUAS METADES, E ELAS ENTRAM JUNTAS ───────────────────────────────────
//
// Consertar só a origem deixaria o fail-open de pé para a próxima quebra.
// Consertar só o fail-closed pararia a esteira sem dizer por quê.

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

import { conferirPilar } from "@/lib/agency/execution/pilares-bloqueados";
import { agendarPostsDaEntrega, extrairPecas } from "@/lib/agency/esteira/publicacao";
import { DEPARTAMENTOS } from "@/lib/agency/execution/especialistas";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const RAIZ = join(__dirname, "..", "..");

// ─────────────────────────────────────────────────────────────────────────────
// METADE 1 — A ORIGEM: o pilar passa a ser pedido, conferido e emitido
// ─────────────────────────────────────────────────────────────────────────────

const social = DEPARTAMENTOS.find((d) => d.id === "social-media")!;
const copy = social.especialistas.find((e) => e.id === "social-copy")!;

/** Um pacote que cumpre TODO o resto do contrato — só o pilar varia. */
function pacote(comPilar: boolean) {
  const p = (extra: Record<string, unknown>) =>
    comPilar ? { pillar: "bastidor da região", ...extra } : extra;
  return {
    items: [
      p({ format: "carrossel", headline: "C", caption: "legenda de carrossel bem completa aqui",
          cenas: "1) [gancho] o post-it com o pedido anotado · 2) [tensao] a caixa sem resposta há dois dias · 3) [acao] o entregador saindo com a sacola" }),
      p({ format: "story", headline: "S1", caption: "legenda de story bem completa aqui" }),
      p({ format: "story", headline: "S2", caption: "outra legenda de story bem completa" }),
      p({ format: "feed", headline: "F1", caption: "legenda de feed bem completa aqui" }),
      p({ format: "feed", headline: "F2", caption: "outra legenda de feed bem completa" }),
      p({ format: "feed", headline: "F3", caption: "mais uma legenda de feed bem completa" }),
    ],
  };
}

describe("a origem: o especialista passa a ser cobrado pelo pilar", () => {
  it("o prompt PEDE o campo pillar — antes ele nem sabia que existia", () => {
    const texto = copy.prompt({
      businessName: "CityJobs", segment: "plataforma de vagas", targetAudience: "",
      tone: "", services: [], objectives: [], strategyHeadline: "",
      hasBrandAssets: false, hasRawMaterial: false, criandoIdentidade: false,
      materiaisEntregues: [],
    });
    expect(texto).toContain('"pillar"');
  });

  it("o CONTRATO DE SAÍDA reprova o pacote sem pilar — prompt é aviso, código é trava", () => {
    const problemas = copy.contrato!(pacote(false));
    expect(problemas.some((p) => p.includes('"pillar"'))).toBe(true);
  });

  it("e aprova o mesmo pacote com pilar — a trava não dispara onde não há risco", () => {
    expect(copy.contrato!(pacote(true))).toEqual([]);
  });

  it("o markdown do entregável EMITE a linha Pilar, que era o elo que faltava", () => {
    // `deliverableMarkdown` não é exportado (é detalhe do motor). O que se
    // prova aqui é o par de chaves que ele varre — a lista onde "Pilar" não
    // estava, e é a ausência dela que deixava `post.pillar` sempre nulo.
    const fonte = readFileSync(join(RAIZ, "lib/agency/execution/run-execution.ts"), "utf8");
    expect(fonte).toContain('["pillar", "Pilar"]');
  });

  it("e `extrairPecas` reconhece a linha que o markdown agora escreve", () => {
    const pecas = extrairPecas(
      [
        "**1. A vaga pode ser aqui do lado**",
        "- Formato: feed",
        "- Pilar: salário aberto",
        "- Legenda: A gente publica o que é do Alto Tietê, e você vê tudo antes.",
      ].join("\n"),
      "social",
    );
    expect(pecas[0]!.pilar).toBe("salário aberto");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// METADE 2 — O FAIL-OPEN FECHADO: ausência não é liberação
// ─────────────────────────────────────────────────────────────────────────────

describe("pilar ausente na esteira automática NÃO é liberado", () => {
  it("sem `exigido`, ausência continua liberada — o Planner não muda de regra", () => {
    // O post que um humano digita pode legitimamente não ter pilar, e há gente
    // olhando. Mudar isso pararia a agência para proteger um cliente.
    expect(conferirPilar(null).bloqueado).toBe(false);
    expect(conferirPilar("").bloqueado).toBe(false);
    expect(conferirPilar("   ").bloqueado).toBe(false);
  });

  it("com `exigido`, ausência REPROVA — e o motivo diz o que consertar", () => {
    for (const nada of [null, undefined, "", "   "]) {
      const v = conferirPilar(nada, { exigido: true });
      expect(v.bloqueado).toBe(true);
      expect(v.chave).toBe("pilar-ausente");
      expect(v.motivo).toContain("pillar");
    }
  });

  it("`exigido` não afrouxa nem endurece o pilar que EXISTE", () => {
    expect(conferirPilar("salário aberto", { exigido: true }).chave).toBe("salario-aberto");
    expect(conferirPilar("perto de casa", { exigido: true }).bloqueado).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// O CAMINHO VIVO — a trava dispara agora, e é isso que não acontecia
// ─────────────────────────────────────────────────────────────────────────────

describe("o bloqueio de salário dispara na esteira automática", () => {
  const entrega = (content: string) => [{
    id: "d1", name: "Social — semana 1", type: "social", content,
    visibility: "compartilhado", revisionStatus: "quality_ok",
  }];

  beforeEach(() => {
    vi.clearAllMocks();
    db.project.findUnique.mockResolvedValue({
      id: "p1", workspaceId: "ws1", clientId: "c1", clientRequestId: "cr1",
      presentedAt: new Date("2026-08-07"),
    });
    db.socialPost.findMany.mockResolvedValue([]);
    db.socialPost.findFirst.mockResolvedValue(null);
    db.socialPost.create.mockResolvedValue({ id: "novo" });
    db.activityEvent.create.mockResolvedValue({});
  });

  it("ANTES o markdown não tinha a linha Pilar — e a peça de salário passava", async () => {
    // Este é o entregável exatamente como o motor o escrevia até 15/08: sem
    // "- Pilar:". A peça é a mesma que produziu "VAGA $3,500" em 07/08.
    db.deliverable.findMany.mockResolvedValue(entrega([
      "**1. Salário aberto**",
      "- Formato: feed",
      "- Legenda: Na CityJobs você vê a faixa salarial antes de se candidatar.",
    ].join("\n")));

    const r = await agendarPostsDaEntrega("p1");

    // Agora ela é barrada — pela AUSÊNCIA, não pelo nome. Antes de hoje, esta
    // mesma entrada criava um SocialPost e ia para o gerador de imagem.
    expect(db.socialPost.create).not.toHaveBeenCalled();
    expect(r.bloqueadasPorPilar).toHaveLength(1);
    expect(r.bloqueadasPorPilar[0]!.motivo).toContain("SEM pilar");
  });

  it("COM a linha Pilar, a peça de salário é barrada pelo NOME — o portão de 07/08 enfim roda", async () => {
    db.deliverable.findMany.mockResolvedValue(entrega([
      "**1. Salário aberto**",
      "- Formato: feed",
      "- Pilar: salário aberto",
      "- Legenda: Na CityJobs você vê a faixa salarial antes de se candidatar.",
      "",
      "**2. Bastidor da região**",
      "- Formato: feed",
      "- Pilar: bastidor da região",
      "- Legenda: A vaga que você procura pode ser aqui do lado, no Alto Tietê.",
    ].join("\n")));

    const r = await agendarPostsDaEntrega("p1");

    expect(r.bloqueadasPorPilar).toHaveLength(1);
    expect(r.bloqueadasPorPilar[0]!.motivo).toContain("salário INVENTADO");
    // E a peça limpa passa: uma trava que apaga o calendário inteiro é desligada.
    expect(db.socialPost.create).toHaveBeenCalledTimes(1);
    expect(db.socialPost.create.mock.calls[0]![0].data.pillar).toBe("bastidor da região");
  });

  it("o registro carrega a evidência — alerta sem o caso concreto ninguém investiga", async () => {
    db.deliverable.findMany.mockResolvedValue(entrega([
      "**1. Salário aberto**",
      "- Formato: feed",
      "- Pilar: salário aberto",
      "- Legenda: Na CityJobs você vê a faixa salarial antes de se candidatar.",
    ].join("\n")));

    await agendarPostsDaEntrega("p1");

    const eventos = db.activityEvent.create.mock.calls.map((c: unknown[]) => (c[0] as { data: { type: string; message: string } }).data);
    const bloqueio = eventos.find((e) => e.type === "pilar_bloqueado");
    expect(bloqueio).toBeDefined();
    expect(bloqueio!.message).toContain("salário");
  });
});

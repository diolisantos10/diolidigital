import { describe, it, expect, beforeEach, vi } from "vitest";

const generate = vi.hoisted(() => vi.fn());
vi.mock("@/lib/ai/generate", () => ({ generate }));

import {
  auditDeliverable, revisionStatusDoVeredito, escolherArbitro,
  foiAprovadaPelaQualidade, ficouSemArbitro, AUDIT_TIMEOUT_MS,
} from "@/lib/agency/execution/quality-auditor";
import { TODOS_OS_ESPECIALISTAS } from "@/lib/agency/execution/especialistas";

const base = { deptLabel: "Social Media", title: "Pacote", content: "conteúdo da entrega", brandContext: "marca X", workspaceId: "ws1" };

beforeEach(() => vi.clearAllMocks());

// ── TRÊS ESTADOS ────────────────────────────────────────────────────────────
// O bug consertado em 04/08/2026: `pass` significava três coisas diferentes —
// "olhei e aprovei", "a IA caiu" e "a IA respondeu lixo". As duas últimas viravam
// `quality_ok` no banco e a peça ia ao cliente como se um árbitro tivesse dito
// sim. Cada teste abaixo existe para que uma dessas confusões não volte.
describe("quality-auditor — três estados: aprovado · reprovado · nao_auditado", () => {
  it("entrega boa → aprovado", async () => {
    generate.mockResolvedValue({ ok: true, data: { verdict: "pass", issues: [], note: "no tom, sem problemas" } });
    const v = await auditDeliverable(base);
    expect(v.verdict).toBe("aprovado");
    expect(v.note).toMatch(/tom/);
    expect(revisionStatusDoVeredito(v.verdict)).toBe("quality_ok");
  });

  it("entrega com problema → reprovado + issues (é o que bloqueia)", async () => {
    generate.mockResolvedValue({ ok: true, data: { verdict: "flag", issues: ["promete resultado garantido", "inventa preço"], note: "revisar" } });
    const v = await auditDeliverable(base);
    expect(v.verdict).toBe("reprovado");
    expect(v.issues.length).toBe(2);
    expect(revisionStatusDoVeredito(v.verdict)).toBe("quality_flag");
  });

  it("IA da auditoria indisponível → nao_auditado (NUNCA aprovado)", async () => {
    generate.mockResolvedValue({ ok: false });
    const v = await auditDeliverable(base);
    expect(v.verdict).toBe("nao_auditado");
    expect(v.motivo).toBe("ia_indisponivel");
    expect(foiAprovadaPelaQualidade(v.verdict)).toBe(false);
    expect(revisionStatusDoVeredito(v.verdict)).toBe("quality_nao_auditado");
    expect(v.note).toMatch(/NÃO AUDITADA/);
  });

  it("erro inesperado → nao_auditado, não aprovado", async () => {
    generate.mockRejectedValue(new Error("boom"));
    const v = await auditDeliverable(base);
    expect(v.verdict).toBe("nao_auditado");
    expect(v.motivo).toBe("erro");
    expect(foiAprovadaPelaQualidade(v.verdict)).toBe(false);
  });

  it("timeout do provedor → nao_auditado (a produção não fica pendurada)", async () => {
    vi.useFakeTimers();
    generate.mockImplementation(() => new Promise(() => { /* nunca resolve */ }));
    const p = auditDeliverable(base);
    await vi.advanceTimersByTimeAsync(AUDIT_TIMEOUT_MS + 10);
    const v = await p;
    vi.useRealTimers();
    expect(v.verdict).toBe("nao_auditado");
    expect(v.motivo).toBe("timeout");
    expect(ficouSemArbitro(v.verdict)).toBe(true);
  });

  it("resposta ilegível do juiz NÃO é aprovação — era o `? :` que virava pass", async () => {
    for (const lixo of [{}, { verdict: null }, { verdict: "talvez" }, { verdict: 7 }]) {
      generate.mockResolvedValue({ ok: true, data: lixo });
      const v = await auditDeliverable(base);
      expect(v.verdict).toBe("nao_auditado");
      expect(v.motivo).toBe("resposta_invalida");
    }
  });

  it("nenhum veredito além de 'aprovado' conta como aprovado", () => {
    expect(foiAprovadaPelaQualidade("aprovado")).toBe(true);
    expect(foiAprovadaPelaQualidade("reprovado")).toBe(false);
    expect(foiAprovadaPelaQualidade("nao_auditado")).toBe(false);
    // Os três estados têm três `revisionStatus` distintos — se dois colidirem,
    // um deles está sendo lido como o outro em alguma tela.
    const status = (["aprovado", "reprovado", "nao_auditado"] as const).map(revisionStatusDoVeredito);
    expect(new Set(status).size).toBe(3);
  });
});

// O critério do CEO (04/08/2026): "os nossos carrosséis têm a ver com os que
// eles fizeram lá?". Só pontua quando existe FEED contra o que medir — punir a
// peça por uma conexão que o cliente não fez seria inventar critério, e
// perguntar "conversa com o feed?" sobre uma conta sem nenhum post é pedir uma
// resposta que só pode ser inventada.
//
// O estado vem do BOOLEANO da SinteseDoFeed. Antes vinha de farejar a substring
// "FEED REAL DO CLIENTE" no contexto — e a conta conectada com ZERO posts
// produz essa substring sem a marca "feed não lido", então o juiz era
// perguntado sobre nada.
describe("o critério do feed real na auditoria", () => {
  const CTX_COM_FEED = "Negócio: X\nFEED REAL DO CLIENTE (Instagram, 24 posts lidos em 2026-08-04):\n- Tom das legendas: próximo";
  beforeEach(() => generate.mockResolvedValue({ ok: true, data: { verdict: "pass", issues: [], note: "ok" } }));

  it("feed lido COM posts → a Qualidade pergunta se a peça CONVERSA com ele", async () => {
    await auditDeliverable({ ...base, brandContext: CTX_COM_FEED, feed: { lida: true, posts: 24 } });
    const user = generate.mock.calls[0]![0].user as string;
    expect(user).toMatch(/\(6\).*CONVERSA com o FEED REAL/);
  });

  it("feed não lido → o critério NÃO pontua e a auditoria é avisada para não punir", async () => {
    await auditDeliverable({
      ...base,
      brandContext: "Negócio: X\nFEED REAL DO CLIENTE (Instagram): feed não lido: sem conexão. PROIBIDO inferir.",
      feed: { lida: false, posts: 0 },
    });
    const user = generate.mock.calls[0]![0].user as string;
    expect(user).not.toMatch(/\(6\)/);
    expect(user).toMatch(/NÃO penalize/);
  });

  it("conta conectada e SEM nenhum post → não existe feed contra o que medir: critério fora, aviso próprio", async () => {
    await auditDeliverable({
      ...base,
      // Este contexto contém "FEED REAL DO CLIENTE" e NÃO contém "feed não
      // lido" — era exatamente o caso que enganava o farejador de substring.
      brandContext: "Negócio: X\nFEED REAL DO CLIENTE (Instagram, lido em 2026-08-04): a conta está conectada e NÃO tem nenhum post publicado.",
      feed: { lida: true, posts: 0 },
    });
    const user = generate.mock.calls[0]![0].user as string;
    expect(user).not.toMatch(/\(6\)/);
    expect(user).toMatch(/NÃO tem nenhum post publicado/);
    expect(user).toMatch(/NÃO penalize/);
  });

  it("chamador que não leu feed nenhum (fluxos antigos) → prompt igual ao de sempre", async () => {
    await auditDeliverable(base);
    const user = generate.mock.calls[0]![0].user as string;
    expect(user).not.toMatch(/\(6\)/);
    expect(user).not.toMatch(/penalize/);
  });

  it("o critério NÃO depende do texto do contexto: contexto sem o rótulo, mas feed lido → critério entra", async () => {
    await auditDeliverable({ ...base, brandContext: "marca X", feed: { lida: true, posts: 12 } });
    const user = generate.mock.calls[0]![0].user as string;
    expect(user).toMatch(/\(6\)/);
  });
});

// ── O JUIZ NÃO PODE SER O AUTOR ─────────────────────────────────────────────
// O gate `quality_audit_impartial` DECLARA que a auditoria roda num modelo
// diferente do que gerou a peça. Até 05/08/2026 o código garantia o contrário:
// 11 dos 14 especialistas são "claude" e o auditor fixava
// `preferredProvider: "claude"`. Estes testes existem para que a declaração e o
// código não voltem a se contradizer.
describe("a auditoria é IMPARCIAL — o juiz nunca é o autor", () => {
  it("autor claude → o árbitro pedido NÃO é claude", async () => {
    generate.mockResolvedValue({ ok: true, provider: "openai", data: { verdict: "pass", issues: [], note: "ok" } });
    await auditDeliverable({ ...base, provedorDoAutor: "claude" });
    expect(generate.mock.calls[0]![0].preferredProvider).not.toBe("claude");
  });

  it("autor openai → o árbitro pedido NÃO é openai", async () => {
    generate.mockResolvedValue({ ok: true, provider: "claude", data: { verdict: "pass", issues: [], note: "ok" } });
    await auditDeliverable({ ...base, provedorDoAutor: "openai" });
    expect(generate.mock.calls[0]![0].preferredProvider).not.toBe("openai");
  });

  it("autor não informado é tratado como claude — a suposição conservadora desta casa", async () => {
    generate.mockResolvedValue({ ok: true, provider: "openai", data: { verdict: "pass", issues: [], note: "ok" } });
    await auditDeliverable(base);
    expect(generate.mock.calls[0]![0].preferredProvider).not.toBe("claude");
  });

  it("nenhum especialista da casa pode ser julgado por si mesmo", () => {
    for (const e of TODOS_OS_ESPECIALISTAS) {
      expect(escolherArbitro(e.provedor ?? "claude")).not.toBe(e.provedor ?? "claude");
    }
  });

  it("caiu de volta no MESMO modelo (chave única) → aprovação vira nao_auditado, não aprovação", async () => {
    // `preferredProvider` é preferência, não trava: sem a chave do árbitro,
    // `generate` volta para a fila e o autor se auto-aprova em silêncio.
    generate.mockResolvedValue({ ok: true, provider: "claude", data: { verdict: "pass", issues: [], note: "ok" } });
    const v = await auditDeliverable({ ...base, provedorDoAutor: "claude" });
    expect(v.verdict).toBe("nao_auditado");
    expect(v.motivo).toBe("juiz_nao_imparcial");
    expect(foiAprovadaPelaQualidade(v.verdict)).toBe(false);
    expect(revisionStatusDoVeredito(v.verdict)).toBe("quality_nao_auditado");
  });

  it("caiu de volta no MESMO modelo, mas REPROVOU → a reprovação continua valendo", async () => {
    // Assimetria deliberada: um problema apontado pelo próprio modelo é um
    // problema. Jogar a reprovação fora seria trocar um freio real por pureza.
    generate.mockResolvedValue({ ok: true, provider: "claude", data: { verdict: "flag", issues: ["inventa preço"], note: "revisar" } });
    const v = await auditDeliverable({ ...base, provedorDoAutor: "claude" });
    expect(v.verdict).toBe("reprovado");
    expect(v.issues).toContain("inventa preço");
  });
});

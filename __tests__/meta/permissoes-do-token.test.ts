// O que o token pode DE VERDADE, ativo por ativo.
//
// A trava central: **"não consegui medir" nunca pode virar "pode"**. É a mesma
// classe de erro que fazia `cidade: null` virar "Brasil inteiro" — três estados
// espremidos num booleano, e o estado do meio somindo.
//
// A segunda trava: este arquivo LÊ. Ele não publica, não escreve e não
// autoriza. Quem autoriza publicar em nome de cliente é o CEO, na
// `trava-de-publicacao.ts` — uma leitura de permissão não pode virar licença.

import { describe, it, expect, beforeEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

const graph = vi.hoisted(() => ({ graphGet: vi.fn() }));
vi.mock("@/lib/integrations/meta/graph", () => graph);

const cfg = vi.hoisted(() => ({ resolveMetaAppCredentials: vi.fn() }));
vi.mock("@/lib/integrations/meta/config", () => cfg);

const conn = vi.hoisted(() => ({ loadConnectionToken: vi.fn() }));
vi.mock("@/lib/integrations/meta/connections", () => conn);

import {
  permissoesDoToken, valeParaOAtivo, diagnosticar,
  PARA_PUBLICAR_NO_INSTAGRAM, PARA_MEDIR_O_INSTAGRAM,
} from "@/lib/integrations/meta/permissoes-do-token";

const IG_CLIENTE = "17841443818801353";
const IG_DA_CASA = "17800000000000000";

beforeEach(() => {
  vi.clearAllMocks();
  conn.loadConnectionToken.mockResolvedValue({
    token: "tok", externalId: IG_CLIENTE, platform: "instagram", clientId: "c1", metaJson: {},
  });
  cfg.resolveMetaAppCredentials.mockResolvedValue({ appId: "app1", appSecret: "sec", source: "env" });
});

describe("lê o que a Meta concedeu, sem tocar em ativo nenhum", () => {
  it("usa debug_token com token de APP — o token não se audita sozinho", async () => {
    graph.graphGet.mockResolvedValue({ data: { is_valid: true, scopes: ["instagram_basic"] } });
    await permissoesDoToken("ws1", "mc1");
    const [caminho, inspetor, params] = graph.graphGet.mock.calls[0]!;
    expect(caminho).toBe("debug_token");
    expect(inspetor).toBe("app1|sec");
    expect(params.input_token).toBe("tok");
  });

  it("é uma chamada de LEITURA — nenhuma escrita sai daqui", async () => {
    graph.graphGet.mockResolvedValue({ data: { is_valid: true, scopes: [] } });
    await permissoesDoToken("ws1", "mc1");
    expect(graph.graphGet).toHaveBeenCalledTimes(1);
  });
});

describe("não medir é o TERCEIRO estado — nunca 'pode', nunca 'não pode'", () => {
  it("sem credenciais do app, nada é medido e o motivo é dito", async () => {
    cfg.resolveMetaAppCredentials.mockResolvedValue(null);
    const p = await permissoesDoToken("ws1", "mc1");
    expect(p.medido).toBe(false);
    expect(p.porQueNaoMedi).toMatch(/META_APP_ID/);
    expect(graph.graphGet).not.toHaveBeenCalled();
  });

  it("a Meta fora do ar não vira permissão concedida", async () => {
    graph.graphGet.mockRejectedValue(new Error("ETIMEDOUT"));
    const p = await permissoesDoToken("ws1", "mc1");
    expect(p.medido).toBe(false);
    expect(valeParaOAtivo(p, "instagram_content_publish", IG_CLIENTE)).toBe("nao_medido");
  });

  it("e o diagnóstico de não medido NÃO é completo — fail-closed", async () => {
    graph.graphGet.mockRejectedValue(new Error("ETIMEDOUT"));
    const p = await permissoesDoToken("ws1", "mc1");
    const d = diagnosticar(p, PARA_PUBLICAR_NO_INSTAGRAM, IG_CLIENTE);
    expect(d.completo).toBe(false);
    expect(d.resumo).toMatch(/não medir não é o mesmo que não poder/i);
  });

  it("conexão que não abre também é não medido, não é negativa", async () => {
    conn.loadConnectionToken.mockResolvedValue(null);
    const p = await permissoesDoToken("ws1", "mc1");
    expect(p.medido).toBe(false);
    expect(p.porQueNaoMedi).toBeTruthy();
  });
});

describe("granular_scopes: a MESMA permissão pode valer para um perfil e não para outro", () => {
  beforeEach(() => {
    // O caso que a casa não sabia enxergar: publicar vale no perfil da própria
    // casa e NÃO vale no do cliente, dentro do mesmo token.
    graph.graphGet.mockResolvedValue({
      data: {
        is_valid: true,
        scopes: ["instagram_basic", "instagram_content_publish", "pages_show_list"],
        granular_scopes: [
          { scope: "instagram_content_publish", target_ids: [IG_DA_CASA] },
          { scope: "instagram_basic", target_ids: [IG_DA_CASA, IG_CLIENTE] },
        ],
      },
    });
  });

  it("vale para o ativo listado", async () => {
    const p = await permissoesDoToken("ws1", "mc1");
    expect(valeParaOAtivo(p, "instagram_content_publish", IG_DA_CASA)).toBe("vale");
  });

  it("NÃO vale para o ativo de fora — mesmo com o escopo largo presente", async () => {
    // Se este teste cair, a casa voltou a ler `scopes` e a concluir que pode
    // publicar em qualquer perfil. É o engano exato que este arquivo desfaz.
    const p = await permissoesDoToken("ws1", "mc1");
    expect(p.escopos).toContain("instagram_content_publish");
    expect(valeParaOAtivo(p, "instagram_content_publish", IG_CLIENTE)).toBe("nao_vale");
  });

  it("permissão sem restrição por ativo segue a lista larga", async () => {
    const p = await permissoesDoToken("ws1", "mc1");
    expect(valeParaOAtivo(p, "pages_show_list", IG_CLIENTE)).toBe("vale");
  });

  it("permissão que não está em lugar nenhum não vale", async () => {
    const p = await permissoesDoToken("ws1", "mc1");
    expect(valeParaOAtivo(p, "pages_read_engagement", IG_CLIENTE)).toBe("nao_vale");
  });
});

describe("o diagnóstico diz QUAIS permissões faltam — não 'algo falhou'", () => {
  it("nomeia o que falta, e diz o custo de tentar assim mesmo", async () => {
    graph.graphGet.mockResolvedValue({
      data: { is_valid: true, scopes: ["instagram_basic", "pages_show_list"] },
    });
    const p = await permissoesDoToken("ws1", "mc1");
    const d = diagnosticar(p, PARA_PUBLICAR_NO_INSTAGRAM, IG_CLIENTE);
    expect(d.completo).toBe(false);
    expect(d.faltando).toContain("instagram_content_publish");
    expect(d.faltando).toContain("pages_read_engagement");
    expect(d.resumo).toContain("instagram_content_publish");
    expect(d.resumo).toMatch(/conta como tentativa/);
  });

  it("A METADE OPOSTA: com tudo concedido, o diagnóstico fecha", async () => {
    graph.graphGet.mockResolvedValue({
      data: { is_valid: true, scopes: [...PARA_PUBLICAR_NO_INSTAGRAM] },
    });
    const p = await permissoesDoToken("ws1", "mc1");
    expect(diagnosticar(p, PARA_PUBLICAR_NO_INSTAGRAM, IG_CLIENTE).completo).toBe(true);
  });

  it("medir exige insights, e a falta dele aparece separada de publicar", async () => {
    graph.graphGet.mockResolvedValue({
      data: { is_valid: true, scopes: ["instagram_basic", "pages_read_engagement"] },
    });
    const p = await permissoesDoToken("ws1", "mc1");
    expect(diagnosticar(p, PARA_MEDIR_O_INSTAGRAM, IG_CLIENTE).faltando).toEqual(["instagram_manage_insights"]);
  });
});

// ── ESTE ARQUIVO LÊ. ELE NÃO AUTORIZA. ──────────────────────────────────────
//
// A tentação óbvia, no dia em que a Meta aprovar, é fazer a publicação
// consultar isto e seguir sozinha. Isso arrancaria a decisão do CEO do caminho.

describe("uma leitura de permissão nunca vira licença", () => {
  const BRUTO = fs.readFileSync(
    path.join(process.cwd(), "lib/integrations/meta/permissoes-do-token.ts"), "utf8",
  );
  const SRC = BRUTO.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  it("não publica, não escreve, não posta", () => {
    for (const proibido of ["graphPost", "publishPost", "prisma.", "criarCampanha"]) {
      expect(SRC.includes(proibido), `passou a escrever/publicar (${proibido})`).toBe(false);
    }
  });

  it("não mexe no interruptor do CEO", () => {
    expect(SRC.includes("PUBLICACAO_ORGANICA"), "passou a ler ou mexer na decisão do CEO").toBe(false);
  });
});

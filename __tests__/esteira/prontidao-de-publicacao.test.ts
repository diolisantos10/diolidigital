// PRONTIDÃO DE PUBLICAÇÃO — por que o post não sai.
//
// As travas que este teste guarda, e por que cada uma:
//
//   1. **Somente leitura.** O diagnóstico não pode publicar, agendar ou
//      corrigir. Um diagnóstico que escreve é um diagnóstico que ninguém pode
//      rodar contra produção — e é aqui que "corrigir" significaria postar no
//      perfil de um cliente de verdade.
//   2. **"Não medi" nunca vira "pronto".** É o guardrail 1 da casa aplicado a
//      um relatório que alguém vai ler para decidir.
//   3. **A fila INTEIRA é avaliada, não só o primeiro portão.** O ponto do
//      módulo é justamente não descobrir uma trava por dia.
//   4. **O dono do ativo é DERIVADO da conexão**, nunca do post. Perguntar com
//      o `clientId` do post daria a resposta certa por acaso e a errada no dia
//      em que os dois divergissem.

import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  prisma: {
    socialPost: { findMany: vi.fn() },
    mediaAsset: { findMany: vi.fn() },
  },
}));
vi.mock("@/lib/db/client", () => db);

const marca = vi.hoisted(() => ({ contratoDeMarca: vi.fn() }));
vi.mock("@/lib/agency/esteira/contrato-de-marca", () => marca);

const conn = vi.hoisted(() => ({
  conexaoDoCliente: vi.fn(),
  loadConnectionToken: vi.fn(),
}));
vi.mock("@/lib/integrations/meta/connections", () => conn);

const ativos = vi.hoisted(() => ({
  ativoAutorizado: vi.fn(),
  donoDe: (c: string | null | undefined) => {
    const cru = String(c ?? "").trim();
    return cru === "" ? null : cru;
  },
  TIPO_POR_PLATAFORMA: { facebook: "page", instagram: "instagram", whatsapp: "whatsapp", user: null },
}));
vi.mock("@/lib/integrations/meta/ativos-autorizados", () => ativos);

const perms = vi.hoisted(() => ({
  permissoesDoToken: vi.fn(),
  diagnosticar: vi.fn(),
  PARA_PUBLICAR_NO_INSTAGRAM: ["instagram_basic", "instagram_content_publish"],
}));
vi.mock("@/lib/integrations/meta/permissoes-do-token", () => perms);

import {
  conferirProntidao,
  portaoDaDecisao,
  montarVeredito,
  type ProntidaoDeUmPost,
} from "@/lib/agency/esteira/prontidao-de-publicacao";

const IG_DO_CLIENTE = "934451783088144";
const ONTEM = new Date(Date.now() - 86_400_000);

function postAgendado(over: Record<string, unknown> = {}) {
  return {
    id: "sp1",
    workspaceId: "ws1",
    clientId: "cli1",
    pillar: "bastidor da região",
    format: "feed",
    caption: "legenda",
    mediaUrl: "/api/media/m1",
    mediaUrlsJson: "[]",
    scheduledFor: ONTEM,
    status: "scheduled",
    lastError: null,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.PUBLICACAO_ORGANICA;
  process.env.PUBLIC_BASE_URL = "https://exemplo.test";
  // O segredo que ASSINA o link temporário da mídia. Sem ele a assinatura
  // lança — ver o teste "o link assinado que lançava" mais abaixo.
  process.env.AUTH_SECRET = "segredo-de-teste";

  db.prisma.socialPost.findMany.mockResolvedValue([postAgendado()]);
  db.prisma.mediaAsset.findMany.mockResolvedValue([{ id: "m1", mimeType: "image/jpeg" }]);
  marca.contratoDeMarca.mockResolvedValue({ naoConstituida: false, lacunas: [] });
  conn.conexaoDoCliente.mockResolvedValue({
    id: "mc1", platform: "instagram", externalId: IG_DO_CLIENTE,
    status: "connected", tokenExpiresAt: null, metaJson: {}, token: "tok",
  });
  conn.loadConnectionToken.mockResolvedValue({
    token: "tok", externalId: IG_DO_CLIENTE, platform: "instagram", clientId: "cli1", metaJson: {},
  });
  ativos.ativoAutorizado.mockResolvedValue(true);
});

describe("é SOMENTE LEITURA", () => {
  it("não expõe nenhuma escrita de banco ao módulo", async () => {
    // `prisma` mockado só tem os dois `findMany` que o diagnóstico usa. Se o
    // módulo tentar escrever, o teste explode em vez de passar em silêncio.
    await conferirProntidao({ workspaceId: "ws1" });
    expect(db.prisma.socialPost.findMany).toHaveBeenCalledTimes(1);
  });

  it("não fala com a Meta a menos que peçam", async () => {
    await conferirProntidao({ workspaceId: "ws1" });
    expect(perms.permissoesDoToken).not.toHaveBeenCalled();
  });

  it("com --meta, mede UMA vez só — nunca uma chamada por post", async () => {
    db.prisma.socialPost.findMany.mockResolvedValue([
      postAgendado({ id: "sp1" }), postAgendado({ id: "sp2" }), postAgendado({ id: "sp3" }),
    ]);
    perms.permissoesDoToken.mockResolvedValue({ medido: true, porQueNaoMedi: null, escopos: [], porAtivo: {}, valido: true });
    perms.diagnosticar.mockReturnValue({ completo: true, faltando: [], naoMedidas: [], resumo: "tudo concedido" });

    await conferirProntidao({ workspaceId: "ws1", medirNaMeta: true });
    expect(perms.permissoesDoToken).toHaveBeenCalledTimes(1);
  });
});

describe("a chave do CEO é fail-closed e diz o nome dela", () => {
  it("ausente = barrado", () => {
    const p = portaoDaDecisao();
    expect(p.estado).toBe("barrou");
    expect(p.quemResolve).toBe("ceo_decide");
    expect(p.comoDestravar).toContain("PUBLICACAO_ORGANICA=liberada");
  });

  it("qualquer valor que não seja exatamente 'liberada' = barrado", () => {
    process.env.PUBLICACAO_ORGANICA = "sim";
    expect(portaoDaDecisao().estado).toBe("barrou");
    process.env.PUBLICACAO_ORGANICA = "liberada";
    expect(portaoDaDecisao().estado).toBe("passou");
  });
});

describe("avalia a FILA INTEIRA, não só o primeiro portão", () => {
  it("com marca não constituída, ainda assim mede conexão, mídia e ativo", async () => {
    marca.contratoDeMarca.mockResolvedValue({ naoConstituida: true, lacunas: [] });
    const r = await conferirProntidao({ workspaceId: "ws1" });
    const post = r.posts[0]!;

    expect(post.primeiroQueBarra?.nome).toBe("Régua de marca");
    // E os portões DEPOIS dele foram avaliados assim mesmo — é o ponto do módulo.
    const conexao = post.portoes.find((p) => p.nome === "Instagram conectado")!;
    const midia = post.portoes.find((p) => p.nome === "Mídia com link público")!;
    expect(conexao.estado).toBe("passou");
    expect(midia.estado).toBe("passou");
  });

  it("nomeia o portão do PNG — o defeito que custou 08/08", async () => {
    db.prisma.mediaAsset.findMany.mockResolvedValue([{ id: "m1", mimeType: "image/png" }]);
    const r = await conferirProntidao({ workspaceId: "ws1" });
    const formato = r.posts[0]!.portoes.find((p) => p.nome === "Formato do arquivo")!;
    expect(formato.estado).toBe("barrou");
    expect(formato.motivo.toLowerCase()).toContain("png");
  });
});

describe("'não medi' nunca vira 'pronto'", () => {
  it("banco de mídia fora do ar vira nao_medido, e o post não fica pronto", async () => {
    process.env.PUBLICACAO_ORGANICA = "liberada";
    db.prisma.mediaAsset.findMany.mockRejectedValue(new Error("db fora"));
    const r = await conferirProntidao({ workspaceId: "ws1" });
    const post = r.posts[0]!;
    const formato = post.portoes.find((p) => p.nome === "Formato do arquivo")!;
    expect(formato.estado).toBe("nao_medido");
    expect(post.pronto).toBe(false);
    // E não barra: "não consegui perguntar" é diferente de "não pode".
    expect(post.primeiroQueBarra?.nome).not.toBe("Formato do arquivo");
  });

  it("banco de posts fora do ar não vira 'não há nada a publicar'", async () => {
    db.prisma.socialPost.findMany.mockRejectedValue(new Error("db fora"));
    const r = await conferirProntidao({ workspaceId: "ws1" });
    expect(r.veredito).toContain("NÃO MEDI");
  });
});

describe("o dono do ativo é DERIVADO da conexão, nunca do post", () => {
  it("consulta a lista com o clientId da linha de conexão", async () => {
    conn.loadConnectionToken.mockResolvedValue({
      token: "tok", externalId: IG_DO_CLIENTE, platform: "instagram",
      clientId: "DONO_DA_CONEXAO", metaJson: {},
    });
    await conferirProntidao({ workspaceId: "ws1" });
    const [, dono, tipo, id] = ativos.ativoAutorizado.mock.calls[0]!;
    expect(dono).toBe("DONO_DA_CONEXAO"); // e NÃO "cli1", que é o do post
    expect(tipo).toBe("instagram");
    expect(id).toBe(IG_DO_CLIENTE);
  });

  it("perfil fora da lista barra com a frase certa", async () => {
    ativos.ativoAutorizado.mockResolvedValue(false);
    const r = await conferirProntidao({ workspaceId: "ws1" });
    const portao = r.posts[0]!.portoes.find((p) => p.nome.startsWith("Perfil na lista"))!;
    expect(portao.estado).toBe("barrou");
    expect(portao.motivo).toContain(IG_DO_CLIENTE);
  });
});

describe("a conexão vencida diz 'reconecte', não 'conecte'", () => {
  it("distingue os dois estados", async () => {
    conn.conexaoDoCliente.mockResolvedValue({
      id: "mc1", platform: "instagram", externalId: IG_DO_CLIENTE,
      status: "expired", tokenExpiresAt: null, metaJson: {}, token: "tok",
    });
    const r = await conferirProntidao({ workspaceId: "ws1" });
    const p = r.posts[0]!.portoes.find((x) => x.nome === "Token vivo")!;
    expect(p.estado).toBe("barrou");
    expect(p.motivo).toContain("reconecte");
    expect(p.quemResolve).toBe("cliente");
  });
});

describe("o link assinado que lançava não derruba mais nada", () => {
  it("segredo ausente vira MOTIVO do post, com a variável certa nomeada", async () => {
    delete process.env.AUTH_SECRET;
    delete process.env.JWT_SECRET;

    const r = await conferirProntidao({ workspaceId: "ws1" });
    const p = r.posts[0]!.portoes.find((x) => x.nome === "Mídia com link público")!;

    expect(p.estado).toBe("barrou");
    expect(p.motivo).toContain("AUTH_SECRET");
    // E não a mensagem enganosa que existia: quem lesse "falta domínio público"
    // iria procurar PUBLIC_BASE_URL, que está definida.
    expect(p.motivo).not.toContain("domínio público configurado");
    expect(p.comoDestravar).toContain("AUTH_SECRET");
  });
});

describe("o veredito não confunde 'sem post' com 'trava da Meta'", () => {
  it("zero agendados é uma resposta, não uma falha", () => {
    const v = montarVeredito([], [portaoDaDecisao()]);
    expect(v).toContain("não é trava da Meta");
  });

  it("aponta a trava que segura MAIS posts", () => {
    const falso = (nome: string): ProntidaoDeUmPost => ({
      postId: nome, clientId: "c", formato: "feed", pilar: null, agendadoPara: null,
      status: "scheduled", ultimoErro: null, portoes: [], pronto: false,
      primeiroQueBarra: { ordem: 4, nome, estado: "barrou", motivo: "m", quemResolve: "casa", comoDestravar: "x" },
    });
    const v = montarVeredito([falso("A"), falso("B"), falso("B")], []);
    expect(v).toContain("**B**");
  });
});

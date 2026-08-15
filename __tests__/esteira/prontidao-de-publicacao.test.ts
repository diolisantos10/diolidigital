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
    socialPost: { findMany: vi.fn(), findUnique: vi.fn() },
    mediaAsset: { findMany: vi.fn() },
    // Lidos pelo portão 11 (aprovação do cliente), via `aprovacaoDaPeca`.
    approvalRequest: { findMany: vi.fn() },
  },
}));
vi.mock("@/lib/db/client", () => db);

const marca = vi.hoisted(() => ({ contratoDeMarca: vi.fn() }));
vi.mock("@/lib/agency/esteira/contrato-de-marca", () => marca);

const conn = vi.hoisted(() => ({
  conexaoDoCliente: vi.fn(),
  // 15/08/2026: o portão 9 passou a usar `carregarTokenDaConexao`, que diz POR
  // QUE o token não veio. `loadConnectionToken` continua exportada (25
  // chamadores) e fica no mock para o módulo não perder a forma.
  carregarTokenDaConexao: vi.fn(),
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
  portaoDoFreioDeEmergencia,
  montarVeredito,
  NOME_DO_PORTAO_DA_APROVACAO,
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
  conn.carregarTokenDaConexao.mockResolvedValue({
    ok: true,
    conexao: { token: "tok", externalId: IG_DO_CLIENTE, platform: "instagram", clientId: "cli1", metaJson: {} },
  });
  ativos.ativoAutorizado.mockResolvedValue(true);
  // O caso FELIZ do portão 11: a peça tem card aprovado PELO CLIENTE dono dela.
  // Sem isto, todo teste vizinho passaria a barrar no 11 e mediria outra coisa.
  db.prisma.socialPost.findUnique.mockResolvedValue({ id: "sp1", clientId: "cli1" });
  db.prisma.approvalRequest.findMany.mockResolvedValue([
    {
      id: "ap1", clientId: "cli1", reviewedBy: "client:Dioli Santos",
      reviewedAt: new Date("2026-08-14T12:00:00Z"),
      sourcePostIdsJson: JSON.stringify(["sp1"]),
    },
  ]);
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

describe("o freio de emergência da casa é fail-closed e diz o nome dele", () => {
  it("ausente = barrado", () => {
    const p = portaoDoFreioDeEmergencia();
    expect(p.estado).toBe("barrou");
    expect(p.quemResolve).toBe("freio_da_casa");
    expect(p.comoDestravar).toContain("PUBLICACAO_ORGANICA=liberada");
  });

  it("qualquer valor que não seja exatamente 'liberada' = barrado", () => {
    process.env.PUBLICACAO_ORGANICA = "sim";
    expect(portaoDoFreioDeEmergencia().estado).toBe("barrou");
    process.env.PUBLICACAO_ORGANICA = "liberada";
    expect(portaoDoFreioDeEmergencia().estado).toBe("passou");
  });

  // O que a mudança de 14/08/2026 precisa DIZER, e não só fazer: soltar o freio
  // não autoriza peça nenhuma. Quem lesse "passou" e concluísse "pode publicar"
  // repetiria exatamente o erro que o modelo novo veio desfazer.
  it("solto, o freio ainda manda ler o portão 11 — ele não autoriza peça", () => {
    process.env.PUBLICACAO_ORGANICA = "liberada";
    const p = portaoDoFreioDeEmergencia();
    expect(p.estado).toBe("passou");
    expect(p.motivo).toMatch(/cliente/i);
    expect(p.motivo).toContain("portão 11");
  });

  it("o portão 11 não é da casa: é por peça, nunca uma linha global", async () => {
    const r = await conferirProntidao({ workspaceId: "ws1" });
    expect(r.portoesDaCasa.map((p) => p.nome)).not.toContain(NOME_DO_PORTAO_DA_APROVACAO);
    expect(r.posts[0]!.portoes.map((p) => p.nome)).toContain(NOME_DO_PORTAO_DA_APROVACAO);
  });
});

// ─── O PORTÃO 11, QUE É A ORDEM DO CEO DE 14/08/2026 ───────────────────────
describe("portão 11 — a aprovação do CLIENTE, peça por peça", () => {
  function portao11(r: Awaited<ReturnType<typeof conferirProntidao>>) {
    return r.posts[0]!.portoes.find((p) => p.nome === NOME_DO_PORTAO_DA_APROVACAO)!;
  }

  it("aprovada pelo cliente dono: passa, e DIZ quem aprovou e quando", async () => {
    const p = portao11(await conferirProntidao({ workspaceId: "ws1" }));
    expect(p.estado).toBe("passou");
    expect(p.quemResolve).toBe("cliente_aprova");
    expect(p.motivo).toContain("Dioli Santos");
    expect(p.motivo).toContain("2026-08-14");
    expect(p.motivo).toContain("ap1");
  });

  it("sem aprovação nenhuma: barra, e nomeia QUEM precisa aprovar", async () => {
    db.prisma.approvalRequest.findMany.mockResolvedValue([]);
    const p = portao11(await conferirProntidao({ workspaceId: "ws1" }));
    expect(p.estado).toBe("barrou");
    expect(p.motivo).toContain("cli1");
    expect(p.comoDestravar).toContain("/api/social-posts/aprovacao");
  });

  it("carimbo da AGÊNCIA não é aprovação do cliente", async () => {
    db.prisma.approvalRequest.findMany.mockResolvedValue([
      {
        id: "ap9", clientId: "cli1", reviewedBy: "equipe:alguem@dioli.com",
        reviewedAt: new Date(), sourcePostIdsJson: JSON.stringify(["sp1"]),
      },
    ]);
    const p = portao11(await conferirProntidao({ workspaceId: "ws1" }));
    expect(p.estado).toBe("barrou");
    // A recusa carrega a evidência: QUEM carimbou (guardrail 6).
    expect(p.motivo).toContain("equipe:alguem@dioli.com");
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

// ── O PORTÃO 9 PAROU DE CONFUNDIR "SEM CONEXÃO" COM "COFRE QUEBRADO" ────────
//
// Até 15/08/2026 o portão dizia *"ela some ou o token não decifra"* e mandava o
// cliente reconectar nos dois casos. São causas OPOSTAS: a segunda é falha
// NOSSA, e reconectar a esconde — cliente por cliente, sem ninguém perceber que
// a causa era única. As duas metades:
describe("portão 9 — token ilegível é falha da CASA, não do cliente", () => {
  it("⛔ token que o cofre não abre: quem resolve é a CASA, e o conserto é medir o cofre", async () => {
    conn.carregarTokenDaConexao.mockResolvedValue({ ok: false, falha: "token_ilegivel" });

    const r = await conferirProntidao({ workspaceId: "ws1" });
    const p = r.posts[0]!.portoes.find((x) => x.nome === "Token carregável pelo publicador")!;

    expect(p.estado).toBe("barrou");
    expect(p.quemResolve).toBe("casa");
    expect(p.motivo).toContain("NENHUMA chave do cofre abre");
    // E NÃO manda reconectar: isso esconderia a causa.
    expect(p.comoDestravar ?? "").toContain("censo-do-cofre");
  });

  it("✅ conexão inexistente continua sendo do CLIENTE, com 'reconectar'", async () => {
    conn.carregarTokenDaConexao.mockResolvedValue({ ok: false, falha: "nao_existe" });

    const r = await conferirProntidao({ workspaceId: "ws1" });
    const p = r.posts[0]!.portoes.find((x) => x.nome === "Token carregável pelo publicador")!;

    expect(p.estado).toBe("barrou");
    expect(p.quemResolve).toBe("cliente");
    expect(p.comoDestravar ?? "").toContain("Reconectar");
    // A frase antiga colapsava os dois casos; ela não pode voltar.
    expect(p.motivo).not.toContain("ela some ou o token não decifra");
  });

  it("✅ token bom continua passando o portão 9", async () => {
    const r = await conferirProntidao({ workspaceId: "ws1" });
    const p = r.posts[0]!.portoes.find((x) => x.nome === "Token carregável pelo publicador")!;
    expect(p.estado).toBe("passou");
  });
});

describe("o dono do ativo é DERIVADO da conexão, nunca do post", () => {
  it("consulta a lista com o clientId da linha de conexão", async () => {
    conn.carregarTokenDaConexao.mockResolvedValue({
      ok: true,
      conexao: {
        token: "tok", externalId: IG_DO_CLIENTE, platform: "instagram",
        clientId: "DONO_DA_CONEXAO", metaJson: {},
      },
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
    const v = montarVeredito([], [portaoDoFreioDeEmergencia()]);
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

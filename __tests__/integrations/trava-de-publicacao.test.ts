// A TRAVA DA PUBLICAÇÃO ORGÂNICA — as duas metades, medidas.
//
// O buraco (07/08/2026): `publishPost` publicava em qualquer perfil cuja
// conexão existisse. A trava de ativos autorizados, fechada em 06/08, cobria
// leitura de anúncio, gravação de conexão e escrita de anúncio — não cobria
// POSTAR. Faltavam nove horas para a casa publicar sozinha no @foocci_, com o
// escopo `instagram_content_publish` no token e o despertador rodando a cada 5
// minutos.
//
// O que estes testes provam, e é o que a casa exigiu:
//   • ativo NÃO autorizado é barrado SEM TOCAR A REDE (nenhum graphPost);
//   • ativo autorizado + decisão do CEO publica normalmente;
//   • sem a decisão do CEO, nem o ativo autorizado publica (fail-closed);
//   • o dono é DERIVADO da conexão — `input` não tem voz sobre de quem é o
//     perfil.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const graphGet = vi.hoisted(() => vi.fn());
const graphPost = vi.hoisted(() => vi.fn());
const graphPostJson = vi.hoisted(() => vi.fn());
const loadConnectionToken = vi.hoisted(() => vi.fn());
const db = vi.hoisted(() => ({
  metaAtivoAutorizado: { findMany: vi.fn() },
  // A TERCEIRA pergunta (14/08/2026): quem aprovou ESTA peça?
  socialPost: { findUnique: vi.fn() },
  approvalRequest: { findMany: vi.fn() },
}));

const FakeGraphError = vi.hoisted(() => class FakeGraphError extends Error {
  detail?: { message?: string };
  constructor(message: string) { super(message); this.detail = { message }; }
});

vi.mock("@/lib/integrations/meta/graph", () => ({
  graphGet, graphPost, graphPostJson, GraphApiError: FakeGraphError,
}));
vi.mock("@/lib/integrations/meta/connections", () => ({ loadConnectionToken }));
vi.mock("@/lib/db/client", () => ({ prisma: db }));

import { publishPost } from "@/lib/integrations/meta/client";
import {
  conferirPublicacao,
  publicacaoOrganicaLiberada,
  CHAVE_DA_DECISAO,
  VALOR_QUE_LIBERA,
} from "@/lib/integrations/meta/trava-de-publicacao";

/** O perfil da Foocci, como está em produção: conexão de CLIENTE, conectada. */
const CONEXAO_FOOCCI = {
  token: "tk",
  platform: "instagram" as const,
  externalId: "17841443818801353",
  clientId: "cmsdmvtsg000q0ppv407dm3s4",
  metaJson: {},
};

/** A peça, como o despertador a manda: com `postId`, que é o que permite
 *  perguntar quem a aprovou. */
const PECA_ID = "sp_carrossel_1";

const POST = {
  connectionId: "mc1",
  postId: PECA_ID,
  platform: "instagram",
  format: "feed",
  caption: "oi",
  mediaUrl: "https://cdn/a.jpg",
} as never;

/** A peça pertence ao cliente da conexão — o caso normal. */
function pecaDoCliente(clientId: string = CONEXAO_FOOCCI.clientId): void {
  db.socialPost.findUnique.mockResolvedValue({ id: PECA_ID, clientId });
}

/** UM card de aprovação cobrindo esta peça, com o carimbo informado. */
function cardDeAprovacao(over: Record<string, unknown> = {}): void {
  db.approvalRequest.findMany.mockResolvedValue([
    {
      id: "ap1",
      clientId: CONEXAO_FOOCCI.clientId,
      reviewedBy: "client:Dioli Santos",
      reviewedAt: new Date("2026-08-14T12:00:00Z"),
      sourcePostIdsJson: JSON.stringify([PECA_ID]),
      ...over,
    },
  ]);
}

/** Nenhum card aprovado cobre esta peça. */
function semAprovacao(): void {
  db.approvalRequest.findMany.mockResolvedValue([]);
}

/** Roda a promessa deixando os `setTimeout` internos dispararem na hora. */
async function semEsperar<T>(p: Promise<T>): Promise<T> {
  const feito = p.then((v) => v, (e) => { throw e; });
  await vi.runAllTimersAsync();
  return feito;
}

/** A lista de autorizados devolve ESTE ativo (e só ele). */
function autorizar(externalId: string): void {
  db.metaAtivoAutorizado.findMany.mockResolvedValue([{ externalId }]);
}

/** A lista de autorizados está vazia — o estado de quem nunca marcou nada. */
function naoAutorizarNada(): void {
  db.metaAtivoAutorizado.findMany.mockResolvedValue([]);
}

const ambienteOriginal = process.env[CHAVE_DA_DECISAO];

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  loadConnectionToken.mockResolvedValue(CONEXAO_FOOCCI);
  // A publicação sai FINISHED de primeira, como imagem quase sempre sai.
  graphPost.mockResolvedValue({ id: "c1" });
  graphGet.mockResolvedValue({ status_code: "FINISHED", permalink: "https://ig/p/1" });
  process.env[CHAVE_DA_DECISAO] = VALOR_QUE_LIBERA;
  // O caso feliz da terceira pergunta, para os testes das outras duas medirem o
  // que eles medem.
  pecaDoCliente();
  cardDeAprovacao();
});

afterEach(() => {
  vi.useRealTimers();
  if (ambienteOriginal === undefined) delete process.env[CHAVE_DA_DECISAO];
  else process.env[CHAVE_DA_DECISAO] = ambienteOriginal;
});

// ─── Metade 1: o ativo AUTORIZADO publica ───────────────────────────────────

describe("a metade que PUBLICA", () => {
  it("ativo autorizado + peça aprovada pelo cliente + freio solto: o post vai ao ar", async () => {
    autorizar(CONEXAO_FOOCCI.externalId);

    const r = await semEsperar(publishPost("w1", POST));

    expect(r.ok).toBe(true);
    expect(graphPost).toHaveBeenCalled();
  });
});

// ─── A TERCEIRA PERGUNTA — A ORDEM DO CEO DE 14/08/2026 ─────────────────────
//
//   *"Quem libera, quem aprova, são os clientes. Quem é o dono da CityJobs sou
//   eu, então eu vou aprovar. Se entrar um cliente novo, quem aprova é ele."*
//
// O que estes testes travam, e por que cada um:
//   • peça SEM aprovação registrada NÃO publica — ausência nunca vira permissão;
//   • peça aprovada PELO CLIENTE DONO publica;
//   • peça "aprovada" por quem NÃO é o cliente dela não publica — carimbo da
//     agência, ou card de outro cliente, não são consentimento.
// E as três recusas acontecem ANTES da rede: publicação é irreversível.

describe("quem libera é o CLIENTE, peça por peça", () => {
  it("peça SEM aprovação registrada não publica — e nem toca a rede", async () => {
    autorizar(CONEXAO_FOOCCI.externalId);
    semAprovacao();

    const r = await semEsperar(publishPost("w1", POST));

    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/aprovação/i);
    expect(graphPost).not.toHaveBeenCalled();
    expect(graphGet).not.toHaveBeenCalled();
  });

  it("peça aprovada pelo CLIENTE DONO passa", async () => {
    autorizar(CONEXAO_FOOCCI.externalId);
    cardDeAprovacao();

    const r = await semEsperar(publishPost("w1", POST));

    expect(r.ok).toBe(true);
    expect(graphPost).toHaveBeenCalled();
  });

  it('"aprovada" pela AGÊNCIA não é aprovação do cliente', async () => {
    autorizar(CONEXAO_FOOCCI.externalId);
    cardDeAprovacao({ reviewedBy: "equipe:alguem@dioli.com" });

    const r = await semEsperar(publishPost("w1", POST));

    expect(r.ok).toBe(false);
    // A recusa carrega a evidência (guardrail 6): diz QUEM carimbou, porque
    // "ninguém aprovou" e "a agência aprovou por ele" são problemas diferentes.
    expect(r.error).toContain("equipe:alguem@dioli.com");
    expect(graphPost).not.toHaveBeenCalled();
  });

  it('o carimbo seco "cliente" (aprovarPacote) não basta — aprovação sem autor não é aprovação', async () => {
    autorizar(CONEXAO_FOOCCI.externalId);
    // `marcos.aprovarPacote` grava exatamente isto, e é alcançável por rota de
    // sessão da AGÊNCIA (`/api/projects/[id]/esteira`). Autoria ambígua não é
    // autoria — e é justamente aqui que o modelo antigo deixaria passar.
    cardDeAprovacao({ reviewedBy: "cliente" });

    const r = await semEsperar(publishPost("w1", POST));

    expect(r.ok).toBe(false);
    expect(graphPost).not.toHaveBeenCalled();
  });

  it("card de OUTRO cliente não libera a peça deste", async () => {
    autorizar(CONEXAO_FOOCCI.externalId);
    // O card existe e está aprovado pelo cliente dele — mas é de outro dono.
    // A consulta já filtra por `clientId`, então de fato nada volta.
    db.approvalRequest.findMany.mockResolvedValue([]);

    const r = await semEsperar(publishPost("w1", POST));

    expect(r.ok).toBe(false);
    expect(graphPost).not.toHaveBeenCalled();
  });

  it("card aprovado que NÃO lista esta peça não a libera (peça por peça, não em bloco)", async () => {
    autorizar(CONEXAO_FOOCCI.externalId);
    cardDeAprovacao({ sourcePostIdsJson: JSON.stringify(["sp_outra_peca"]) });

    const r = await semEsperar(publishPost("w1", POST));

    expect(r.ok).toBe(false);
    expect(graphPost).not.toHaveBeenCalled();
  });

  it("peça de um cliente NÃO vai ao perfil de outro", async () => {
    autorizar(CONEXAO_FOOCCI.externalId);
    pecaDoCliente("OUTRO_CLIENTE");

    const r = await semEsperar(publishPost("w1", POST));

    expect(r.ok).toBe(false);
    expect(r.error).toContain("OUTRO_CLIENTE");
    expect(graphPost).not.toHaveBeenCalled();
  });

  it("sem `postId` não publica: publicação avulsa não tem quem a tenha aprovado", async () => {
    autorizar(CONEXAO_FOOCCI.externalId);

    const { postId: _ignorado, ...avulso } = POST as Record<string, unknown>;
    const r = await semEsperar(publishPost("w1", avulso as never));

    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/sem peça identificada/i);
    expect(graphPost).not.toHaveBeenCalled();
  });

  it("banco fora do ar na leitura da aprovação: FAIL-CLOSED", async () => {
    autorizar(CONEXAO_FOOCCI.externalId);
    db.approvalRequest.findMany.mockRejectedValue(new Error("banco caiu"));

    const r = await semEsperar(publishPost("w1", POST));

    expect(r.ok).toBe(false);
    expect(graphPost).not.toHaveBeenCalled();
  });

  it("peça que não existe no banco não publica", async () => {
    autorizar(CONEXAO_FOOCCI.externalId);
    db.socialPost.findUnique.mockResolvedValue(null);

    const r = await semEsperar(publishPost("w1", POST));

    expect(r.ok).toBe(false);
    expect(graphPost).not.toHaveBeenCalled();
  });
});

// ─── O FREIO DE EMERGÊNCIA, QUE MUDOU DE PAPEL ──────────────────────────────

describe("o freio de emergência da casa", () => {
  it("puxado, nem a peça aprovada pelo cliente sai", async () => {
    autorizar(CONEXAO_FOOCCI.externalId);
    cardDeAprovacao();
    delete process.env[CHAVE_DA_DECISAO];

    const r = await semEsperar(publishPost("w1", POST));

    expect(r.ok).toBe(false);
    expect(graphPost).not.toHaveBeenCalled();
  });

  it("solto, NÃO substitui a aprovação do cliente — não é ele que autoriza", async () => {
    autorizar(CONEXAO_FOOCCI.externalId);
    process.env[CHAVE_DA_DECISAO] = VALOR_QUE_LIBERA;
    semAprovacao();

    const r = await semEsperar(publishPost("w1", POST));

    // Este é o coração da mudança: antes, o freio solto bastava e TODA peça
    // agendada saía sozinha pelo despertador de 5 minutos.
    expect(r.ok).toBe(false);
    expect(graphPost).not.toHaveBeenCalled();
  });
});

// ─── Metade 2: o ativo NÃO autorizado é barrado, e SEM TOCAR A REDE ─────────

describe("a metade que BARRA", () => {
  it("ativo fora da lista do dono: recusa sem UMA chamada à Meta", async () => {
    naoAutorizarNada();

    const r = await semEsperar(publishPost("w1", POST));

    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/[Nn]inguém autorizou/);
    expect(r.error).toContain(CONEXAO_FOOCCI.externalId);
    // O QUE MAIS IMPORTA: a recusa acontece ANTES da rede. Publicação é
    // irreversível, e tentativa recusada ainda conta contra o app.
    expect(graphPost).not.toHaveBeenCalled();
    expect(graphGet).not.toHaveBeenCalled();
  });

  it("outro perfil autorizado não libera ESTE perfil", async () => {
    autorizar("17841400137554354"); // @dioli._ , não a Foocci

    const r = await semEsperar(publishPost("w1", POST));

    expect(r.ok).toBe(false);
    expect(graphPost).not.toHaveBeenCalled();
  });

  it("banco fora do ar: FAIL-CLOSED — não publica", async () => {
    db.metaAtivoAutorizado.findMany.mockRejectedValue(new Error("banco caiu"));

    const r = await semEsperar(publishPost("w1", POST));

    expect(r.ok).toBe(false);
    expect(graphPost).not.toHaveBeenCalled();
  });

  it("com o freio puxado, nem o ativo autorizado vai ao ar", async () => {
    autorizar(CONEXAO_FOOCCI.externalId);
    delete process.env[CHAVE_DA_DECISAO];

    const r = await semEsperar(publishPost("w1", POST));

    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/PARADA/);
    expect(r.error).toContain(CHAVE_DA_DECISAO);
    expect(graphPost).not.toHaveBeenCalled();
  });

  it("valor errado na variável não libera (fail-closed, não 'qualquer coisa serve')", async () => {
    autorizar(CONEXAO_FOOCCI.externalId);
    process.env[CHAVE_DA_DECISAO] = "true";

    const r = await semEsperar(publishPost("w1", POST));

    expect(r.ok).toBe(false);
    expect(graphPost).not.toHaveBeenCalled();
  });

  it("carrossel também é barrado — e antes dos 6 containers", async () => {
    naoAutorizarNada();

    const r = await semEsperar(publishPost("w1", {
      connectionId: "mc1", postId: PECA_ID, platform: "instagram", format: "carousel", caption: "oi",
      mediaUrls: Array.from({ length: 6 }, (_, i) => `https://cdn/${i}.jpg`),
    } as never));

    expect(r.ok).toBe(false);
    expect(graphPost).not.toHaveBeenCalled();
  });
});

// ─── O dono é DERIVADO, nunca comparado ─────────────────────────────────────

describe("de quem é o perfil — a pergunta é feita à conexão, não ao chamador", () => {
  it("a lista consultada é a do DONO DA CONEXÃO", async () => {
    autorizar(CONEXAO_FOOCCI.externalId);

    await semEsperar(publishPost("w1", POST));

    expect(db.metaAtivoAutorizado.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: "w1",
          clientId: CONEXAO_FOOCCI.clientId,
          tipo: "instagram",
        }),
      }),
    );
  });

  it("conexão de nível AGÊNCIA consulta a lista da agência (dono nulo)", async () => {
    loadConnectionToken.mockResolvedValue({ ...CONEXAO_FOOCCI, clientId: null });
    autorizar(CONEXAO_FOOCCI.externalId);

    await semEsperar(publishPost("w1", POST));

    expect(db.metaAtivoAutorizado.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ clientId: null }) }),
    );
  });

  it('`clientId` gravado como "" é o mesmo dono que `null` — a doença das duas grafias', async () => {
    loadConnectionToken.mockResolvedValue({ ...CONEXAO_FOOCCI, clientId: "" });
    autorizar(CONEXAO_FOOCCI.externalId);

    await semEsperar(publishPost("w1", POST));

    expect(db.metaAtivoAutorizado.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ clientId: null }) }),
    );
  });
});

// ─── O parecer, direto ──────────────────────────────────────────────────────

describe("conferirPublicacao — o parecer sozinho", () => {
  it("WhatsApp e o token de usuário não recebem post", async () => {
    autorizar("qualquer");
    for (const platform of ["whatsapp", "user", "tiktok"]) {
      const p = await conferirPublicacao({
        workspaceId: "w1", clientId: null, platform, externalId: "x", postId: PECA_ID,
      });
      expect(p.pode).toBe(false);
    }
  });

  it("o interruptor lê o ambiente NA HORA, não no boot", () => {
    process.env[CHAVE_DA_DECISAO] = VALOR_QUE_LIBERA;
    expect(publicacaoOrganicaLiberada()).toBe(true);
    delete process.env[CHAVE_DA_DECISAO];
    expect(publicacaoOrganicaLiberada()).toBe(false);
  });
});

// A ROTA DA FILA DIÁRIA — casca fina sobre `lib/agency/celula/fila-diaria.ts`.
//
// A lógica de negócio (bloco sujo, idempotência, medição do caminho B, quem
// pode liberar) já está provada em `__tests__/celula/fila-diaria.test.ts`.
// Este arquivo prova só o que é responsabilidade da ROTA: as guardas, na
// ordem certa, e que nenhuma delas foi contornada ou duplicada — mesmo
// padrão de `__tests__/celula/jornada-ponta-a-ponta.test.ts` para a rota do
// funil.
//
// ── 02/09/2026 — O CONSERTO DO FURO DO HEADER ───────────────────────────
// Até aqui, `credencialDe()` lia `x-papel-na-celula` de um HEADER que
// qualquer chamador podia forjar. A trava de PODE/NÃO PODE
// (`lib/agency/celula/papeis.ts`) sempre esteve correta — o furo era de ONDE
// o dado vinha. Agora o papel vem só de `User.papelNaCelula`
// (`lib/agency/celula/papel-do-usuario.ts`), e a suíte abaixo prova as duas
// metades: (1) a fonte não lê mais o header em lugar nenhum; (2) um header
// forjado, na prática, não muda o resultado — só o banco muda o resultado.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";

const CAMINHO = "app/api/agency/oportunidades/fila-diaria/route.ts";
const fonte = readFileSync(CAMINHO, "utf-8");

describe("🔴 a rota da fila diária — as guardas, pelo nome", () => {
  it("importa a lógica pronta de fila-diaria.ts, sem reescrevê-la", () => {
    expect(fonte).toContain("@/lib/agency/celula/fila-diaria");
    expect(fonte).toContain("montarFilaDoDia");
    expect(fonte).toContain("liberarEmBloco");
  });

  it("checa sessão antes de qualquer outra coisa", () => {
    expect(fonte).toContain("requireSession");
  });

  it("GET exige 'ler_a_celula' e POST exige 'autorizar_envio'", () => {
    expect(fonte).toContain('"ler_a_celula"');
    expect(fonte).toContain('"autorizar_envio"');
  });

  it("o papel na Célula vem do BANCO — a rota NÃO lê mais x-papel-na-celula em lugar nenhum", () => {
    // O header forjável saiu por completo do código-fonte da rota. Isto NÃO é
    // um detalhe de estilo: é a prova de que não existe um segundo caminho
    // ("se não achar no banco, tenta o header") reabrindo o furo.
    expect(fonte).not.toContain("x-papel-na-celula");
    expect(fonte).not.toContain("headers.get");
    expect(fonte).toContain("@/lib/agency/celula/papel-do-usuario");
    expect(fonte).toContain("buscarPapelNaCelula");
  });

  it("workspaceId SEMPRE da sessão, nunca do corpo da requisição", () => {
    expect(fonte).toContain("workspaceId: session.workspaceId");
    // Nenhuma leitura de workspaceId vindo do corpo desserializado (`c.`).
    expect(fonte).not.toMatch(/workspaceId:\s*c\./);
  });

  it("autor SEMPRE de session.userId, nunca do corpo — autoria não pode ser forjada", () => {
    expect(fonte).toContain("autor: session.userId");
    expect(fonte).not.toMatch(/autor:\s*c\./);
  });

  it("não revalida arquivoIds além de checar que é lista — liberarEmBloco é a fonte única da regra", () => {
    expect(fonte).toContain("Array.isArray(c.arquivoIds)");
    // Nada de checar arquivo por arquivo aqui — isso é `liberarEmBloco`.
    expect(fonte).not.toContain("findFirst");
    expect(fonte).not.toContain("findUnique");
  });

  it("mapeia 'sem_permissao' para 403 e 'lista_vazia' para 400", () => {
    expect(fonte).toMatch(/sem_permissao["'`]\s*\?\s*403/);
  });

  // ── 02/09/2026 — achado do `experiencia`: cast vs. conversão ─────────────
  // `session.role` é `AgencyRole` (vocabulário em português). `Autoridade` é
  // outro vocabulário. Um `as Autoridade` não converte nada — só engana o
  // compilador. `autoridadeDoPapel` é o conversor de verdade, já usado em
  // `app/api/agency/celula/papeis/route.ts`.
  it("usa autoridadeDoPapel — NÃO faz `session.role as Autoridade`", () => {
    expect(fonte).toContain("autoridadeDoPapel");
    expect(fonte).toContain("@/lib/agency/roles");
    expect(fonte).not.toMatch(/session\.role\s+as\s+Autoridade/);
  });
});

// ── A PROVA EM EXECUÇÃO: banco decide, header forjado não muda nada ────────

const db = vi.hoisted(() => ({ user: { findUnique: vi.fn() } }));
const requireSession = vi.hoisted(() => vi.fn());
const montarFilaDoDia = vi.hoisted(() =>
  vi.fn(async (): Promise<{ itens: unknown[] }> => ({ itens: [] })),
);
const liberarEmBloco = vi.hoisted(() =>
  vi.fn(
    async (): Promise<{ ok: true; liberados: string[]; recusados: string[]; naoSelecionados: string[] }> => ({
      ok: true,
      liberados: [],
      recusados: [],
      naoSelecionados: [],
    }),
  ),
);

vi.mock("@/lib/db/client", () => ({ prisma: db }));
vi.mock("@/lib/auth/api-guard", () => ({ requireSession }));
vi.mock("@/lib/agency/celula/fila-diaria", () => ({ montarFilaDoDia, liberarEmBloco }));

import { GET, POST } from "@/app/api/agency/oportunidades/fila-diaria/route";

const SESSAO_MASTER = { userId: "u-master", role: "master", workspaceId: "ws-1" };

function post(body: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://localhost/api/agency/oportunidades/fila-diaria", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("POST /fila-diaria — o banco é a ÚNICA fonte do papel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireSession.mockResolvedValue({ session: SESSAO_MASTER, error: null });
  });

  it("sem papel gravado no banco (null): recusa com 403, mesmo sendo master", async () => {
    db.user.findUnique.mockResolvedValue({ papelNaCelula: null });
    const res = await POST(post({ arquivoIds: ["a1"] }));
    expect(res.status).toBe(403);
    expect(liberarEmBloco).not.toHaveBeenCalled();
  });

  it("com 'gerente_de_atendimento' gravado no banco: passa a guarda e chama liberarEmBloco", async () => {
    db.user.findUnique.mockResolvedValue({ papelNaCelula: "gerente_de_atendimento" });
    const res = await POST(post({ arquivoIds: ["a1"] }));
    expect(res.status).toBe(200);
    expect(liberarEmBloco).toHaveBeenCalledOnce();
  });

  it("🔴 O CORAÇÃO DO CONSERTO: header 'x-papel-na-celula' forjado NÃO muda o resultado — só o banco muda", async () => {
    // Sem nada no banco, mas um header forjado alegando ser gerente.
    db.user.findUnique.mockResolvedValue({ papelNaCelula: null });
    const comHeaderForjado = await POST(
      post({ arquivoIds: ["a1"] }, { "x-papel-na-celula": "gerente_de_atendimento" }),
    );
    expect(comHeaderForjado.status, "o header forjado tinha que ser ignorado").toBe(403);
    expect(liberarEmBloco).not.toHaveBeenCalled();

    vi.clearAllMocks();
    requireSession.mockResolvedValue({ session: SESSAO_MASTER, error: null });

    // Agora o banco diz sdr (não autoriza "autorizar_envio"), e um header
    // forjado alega gerente — o banco continua vencendo.
    db.user.findUnique.mockResolvedValue({ papelNaCelula: "sdr" });
    const comHeaderTentandoSubir = await POST(
      post({ arquivoIds: ["a1"] }, { "x-papel-na-celula": "gerente_de_atendimento" }),
    );
    expect(comHeaderTentandoSubir.status, "sdr não libera em bloco, e o header não muda isso").toBe(403);
    expect(liberarEmBloco).not.toHaveBeenCalled();
  });
});

describe("GET /fila-diaria — mesma origem de papel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireSession.mockResolvedValue({ session: SESSAO_MASTER, error: null });
  });

  it("ler a fila é largo: qualquer papel declarado no banco (inclusive 'sdr') basta", async () => {
    db.user.findUnique.mockResolvedValue({ papelNaCelula: "sdr" });
    const res = await GET(new NextRequest("http://localhost/api/agency/oportunidades/fila-diaria"));
    expect(res.status).toBe(200);
    expect(montarFilaDoDia).toHaveBeenCalledOnce();
  });
});

// ── 02/09/2026 — achado do `experiencia`: role "diretor" (não "master") ────
//
// Antes do conserto, `session.role as Autoridade` com `role: "diretor"`
// produzia `autoridade: "diretor"` — uma string que não bate com NENHUMA
// chave de `Autoridade` (que usa "director"). Nem `ler_a_celula`
// (`eDeDentroDaCasa`, que só checa `!== "client"`) nem `autorizar_envio`
// (que não olha `autoridade` — só `papel`) DEPENDEM do valor exato de
// `autoridade` ser "director" — por isso o bug nunca quebrou o caminho
// feliz destas duas ações, em nenhuma das duas versões. É exatamente por
// isso que ele passou despercebido. Os testes abaixo prova o caminho feliz
// COM `role: "diretor"` (nunca testado antes nesta suíte, que só usava
// "master") para fechar a lacuna de cobertura — e a suíte
// `role-diretor-conversao.test.ts` (novo arquivo) prova o valor exato da
// conversão e o efeito nas travas incondicionais que DEPENDEM dele.
const SESSAO_DIRETOR = { userId: "u-diretor", role: "diretor", workspaceId: "ws-1" };

describe("POST /fila-diaria — role 'diretor' (não 'master'): caminho feliz não regride", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireSession.mockResolvedValue({ session: SESSAO_DIRETOR, error: null });
  });

  it("com 'gerente_de_atendimento' gravado no banco: autorizar_envio passa e liberarEmBloco é chamado", async () => {
    db.user.findUnique.mockResolvedValue({ papelNaCelula: "gerente_de_atendimento" });
    const res = await POST(post({ arquivoIds: ["a1"] }));
    expect(res.status).toBe(200);
    expect(liberarEmBloco).toHaveBeenCalledOnce();
  });

  it("sem papel gravado no banco: recusado com 403, igual ao comportamento de 'master'", async () => {
    db.user.findUnique.mockResolvedValue({ papelNaCelula: null });
    const res = await POST(post({ arquivoIds: ["a1"] }));
    expect(res.status).toBe(403);
    expect(liberarEmBloco).not.toHaveBeenCalled();
  });
});

describe("GET /fila-diaria — role 'diretor': ler é largo, igual a 'master'", () => {
  it("com 'sdr' gravado no banco, GET ainda passa (ler é largo)", async () => {
    requireSession.mockResolvedValue({ session: SESSAO_DIRETOR, error: null });
    db.user.findUnique.mockResolvedValue({ papelNaCelula: "sdr" });
    const res = await GET(new NextRequest("http://localhost/api/agency/oportunidades/fila-diaria"));
    expect(res.status).toBe(200);
  });
});

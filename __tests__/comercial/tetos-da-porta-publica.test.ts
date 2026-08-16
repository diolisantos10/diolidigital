// AS TRÊS TRAVAS DA ÚNICA PORTA PÚBLICA DE GRAVAÇÃO (16/08/2026).
//
// `POST /api/brain/client-requests` é o submit do formulário `/briefing`. Ela é
// pública por desenho — e é a única rota SEM SESSÃO que GRAVA no banco. O
// raio-x de 16/08 achou três buracos nela, e este arquivo guarda os três, cada
// um com as duas metades: a trava barra o abuso E deixa o cliente honesto passar.
//
// Por que cada um existe:
//
//   1. TAMANHO — `await request.json()` não tem teto de fábrica em route
//      handler. O `bodySizeLimit: "20mb"` do `next.config.ts` só vale para
//      Server Actions, e a casa inteira mora num volume SQLite de tamanho fixo:
//      disco cheio não é "briefing perdido", é login quebrado e portal fora.
//
//   2. RITMO — o contador antigo (`rateLimited`) vivia num `Map` do processo.
//      Todo deploy zerava os baldes e cada réplica multiplicava o teto. As
//      quatro rotas públicas pagas migraram para o contador do BANCO em 06/08;
//      esta, a única pública de escrita, ficou para trás por dez dias.
//
//   3. ANEXOS — o limite de 10 era regra de TELA
//      (`FileUploadZone.tsx`). Regra de tela não é trava: um POST direto passa
//      por cima de qualquer `disabled` de botão. É a mesma lição do gate de
//      contato, aprendida duas vezes na mesma rota.
//
// A OUTRA METADE, e ela é a que importa mais: o CEO está em piloto e manda
// briefing HOJE. Uma trava calibrada errado para baixo bloqueia o próprio dono
// da casa. Por isso todo teste de recusa tem um irmão que prova que o briefing
// de tamanho real continua entrando.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";

const criados = vi.hoisted(() => [] as Array<Record<string, unknown>>);
const criar = vi.hoisted(() =>
  vi.fn(async (input: Record<string, unknown>) => {
    criados.push(input);
    return { id: `req-${criados.length}`, ...input };
  }),
);
const limiteExcedido = vi.hoisted(() => vi.fn(async () => null as Response | null));

vi.mock("@/lib/agency/persistence/client-request-service", () => ({
  createClientRequest: criar,
  listClientRequests: vi.fn(),
  updateClientRequest: vi.fn(),
  getClientRequest: vi.fn(),
  deleteClientRequest: vi.fn(),
}));
vi.mock("@/lib/dioli-brain/run-auto-scope", () => ({ runAutoScope: vi.fn(async () => undefined) }));
vi.mock("@/lib/security/limite-no-banco", () => ({ limiteExcedido }));
vi.mock("@/lib/auth/api-guard", () => ({ requireSession: vi.fn() }));
vi.mock("@/lib/email/send", () => ({ sendEmail: vi.fn(async () => ({ ok: true, skipped: false })) }));

import { POST } from "@/app/api/brain/client-requests/route";
import { NextRequest } from "next/server";

const CAMINHO = "app/api/brain/client-requests/route.ts";

/** O briefing como ele realmente chega: contato declarado, conversa e escopo. */
function briefing(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    businessName: "Restaurante Sushi Cazza",
    segment: "gastronomia",
    services: ["planejamento de conteúdo"],
    objectives: ["aumentar presença digital"],
    rawContext: "[Prospect] Ticket médio R$ 180. Paleta preto, vermelho e dourado.",
    source: "briefing",
    contato: { nome: "Ana", email: "ana@sushicazza.com.br", whatsapp: "11999990000" },
    briefingJson: { scope: { businessName: "Restaurante Sushi Cazza" }, transcript: [{ role: "user", text: "oi" }] },
    ...extra,
  };
}

/** Monta o POST. `contentLength` permite mentir no cabeçalho de propósito —
 *  é exatamente o que um abusador faria, e o que a segunda camada precisa pegar. */
function pedir(body: unknown, contentLength?: string): NextRequest {
  const texto = JSON.stringify(body);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (contentLength !== undefined) headers["content-length"] = contentLength;
  return new NextRequest("http://localhost/api/brain/client-requests", {
    method: "POST",
    headers,
    body: texto,
  });
}

beforeEach(() => {
  criados.length = 0;
  vi.clearAllMocks();
  limiteExcedido.mockResolvedValue(null);
});

// ── 1. TETO DE TAMANHO ───────────────────────────────────────────────────────

describe("trava 1 — teto de tamanho do corpo", () => {
  it("recusa com 413 e mensagem em português quando o corpo estoura o teto", async () => {
    // ~1,4 MB de texto: acima do teto de 1 MB do envio inteiro.
    const res = await POST(pedir(briefing({ rawContext: "a".repeat(1_400_000) })));

    expect(res.status).toBe(413);
    const corpo = await res.json();
    expect(corpo.error).toMatch(/grande demais/i);
    expect(corpo.error).toMatch(/tente de novo/i);
    // Nada foi gravado: a trava vem ANTES do banco, que é o ponto todo dela.
    expect(criar).not.toHaveBeenCalled();
  });

  it("o `content-length` MENTIROSO não passa — a segunda camada mede o texto de verdade", async () => {
    const res = await POST(pedir(briefing({ rawContext: "a".repeat(1_400_000) }), "42"));

    expect(res.status).toBe(413);
    expect(criar).not.toHaveBeenCalled();
  });

  it("o `content-length` honesto e enorme é recusado sem sequer ler o corpo", async () => {
    const res = await POST(pedir(briefing(), String(50 * 1024 * 1024)));

    expect(res.status).toBe(413);
    expect(criar).not.toHaveBeenCalled();
  });

  it("`briefingJson` gigante é RECUSADO (estrutura não se corta pela metade)", async () => {
    const gordo = { transcript: Array.from({ length: 4_000 }, () => ({ role: "user", text: "x".repeat(120) })) };
    const res = await POST(pedir(briefing({ briefingJson: gordo })));

    expect(res.status).toBe(413);
    expect(criar).not.toHaveBeenCalled();
  });

  it("`sdrHandoffJson` gigante é RECUSADO pelo mesmo motivo", async () => {
    const gordo = { notas: Array.from({ length: 4_000 }, () => "y".repeat(120)) };
    const res = await POST(pedir(briefing({ sdrHandoffJson: gordo })));

    expect(res.status).toBe(413);
    expect(criar).not.toHaveBeenCalled();
  });

  it("`rawContext` longo demais é CORTADO, não recusado — o lead não se perde", async () => {
    const res = await POST(pedir(briefing({ rawContext: "z".repeat(300_000) })));

    expect(res.status).toBe(201);
    const gravado = criados[0].rawContext as string;
    expect(gravado.length).toBeLessThan(300_000);
    expect(gravado).toContain("texto cortado");
    // O COMEÇO — onde o prospect diz o que quer — chega inteiro.
    expect(gravado.startsWith("z".repeat(1_000))).toBe(true);
  });

  it("A OUTRA METADE: o briefing de tamanho real do CEO passa sem tocar em nada", async () => {
    // Uma conversa de SDR longa de verdade: ~40 mil caracteres de transcript.
    const conversaReal = {
      scope: { businessName: "Restaurante Sushi Cazza" },
      transcript: Array.from({ length: 200 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", text: "x".repeat(200) })),
    };
    const res = await POST(pedir(briefing({ briefingJson: conversaReal, rawContext: "w".repeat(30_000) })));

    expect(res.status).toBe(201);
    expect(criar).toHaveBeenCalledOnce();
    expect(criados[0].rawContext).toBe("w".repeat(30_000)); // inteiro, sem corte
  });
});

// ── 2. TETO DE RITMO ─────────────────────────────────────────────────────────

describe("trava 2 — teto de ritmo NO BANCO", () => {
  it("barrada pelo contador: devolve a recusa e NADA é gravado", async () => {
    limiteExcedido.mockResolvedValue(
      new Response(JSON.stringify({ error: "Muitas requisições em pouco tempo." }), {
        status: 429,
        headers: { "Content-Type": "application/json", "Retry-After": "77" },
      }),
    );

    const res = await POST(pedir(briefing()));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("77");
    expect(criar).not.toHaveBeenCalled();
  });

  it("A OUTRA METADE: dentro do teto, o briefing entra normalmente", async () => {
    const res = await POST(pedir(briefing()));
    expect(res.status).toBe(201);
    expect(criar).toHaveBeenCalledOnce();
  });

  it("o contador consultado é o do BANCO — o da memória saiu do arquivo", () => {
    const fonte = readFileSync(CAMINHO, "utf8");
    expect(fonte).toContain("limiteExcedido");
    // Trava, não aviso: enquanto `rate-limit` estiver importado aqui, alguém
    // volta a usá-lo por engano e o teto some no próximo deploy.
    expect(fonte).not.toContain('from "@/lib/security/rate-limit"');
  });

  it("a folga é generosa o bastante para não bloquear o CEO em piloto", () => {
    const fonte = readFileSync(CAMINHO, "utf8");
    const chamada = /limiteExcedido\(\s*request,\s*"client-requests",\s*(\d+),\s*([\d\s*_]+)\)/.exec(fonte);
    expect(chamada).not.toBeNull();

    const limite = Number(chamada![1]);
    const janelaMs = Number(new Function(`return ${chamada![2]}`)());
    // Ninguém preenche dez briefings numa janela. Teto abaixo disso é risco de
    // barrar gente de verdade — o alvo desta trava é abuso, não cliente.
    expect(limite).toBeGreaterThanOrEqual(10);
    // E não pode virar enfeite: mais de 200 registros/hora por IP não é teto.
    expect((limite / janelaMs) * 3_600_000).toBeLessThanOrEqual(200);
  });
});

// ── 3. TETO DE ANEXOS ────────────────────────────────────────────────────────

describe("trava 3 — cap de anexos no SERVIDOR", () => {
  it("mais de 10 anexos: o excedente é cortado antes de gravar", async () => {
    const anexos = Array.from({ length: 500 }, (_, i) => ({
      id: `a${i}`, fileName: `arquivo-${i}.pdf`, fileType: "PDF", sizeBytes: 1_000,
    }));
    const res = await POST(pedir(briefing({ attachmentsJson: anexos })));

    expect(res.status).toBe(201);
    expect((criados[0].attachmentsJson as unknown[]).length).toBe(10);
  });

  it("A OUTRA METADE: os 10 que a tela permite entram todos, sem perder nenhum", async () => {
    const anexos = Array.from({ length: 10 }, (_, i) => ({
      id: `a${i}`, fileName: `arquivo-${i}.pdf`, fileType: "PDF", sizeBytes: 1_000,
    }));
    const res = await POST(pedir(briefing({ attachmentsJson: anexos })));

    expect(res.status).toBe(201);
    expect(criados[0].attachmentsJson).toEqual(anexos);
  });

  it("o cap do servidor está alinhado ao `MAX_FILES` da tela", () => {
    const tela = readFileSync("components/agency/briefing/FileUploadZone.tsx", "utf8");
    const daTela = /const MAX_FILES\s*=\s*(\d+)/.exec(tela);
    const doServidor = /const TETO_DE_ANEXOS\s*=\s*(\d+)/.exec(readFileSync(CAMINHO, "utf8"));

    expect(daTela).not.toBeNull();
    expect(doServidor).not.toBeNull();
    // Se a tela subir para 20 e o servidor ficar em 10, o cliente honesto anexa
    // 20 arquivos e o servidor joga 10 fora em silêncio. Este teste é a corda
    // entre os dois números.
    expect(Number(doServidor![1])).toBe(Number(daTela![1]));
  });
});

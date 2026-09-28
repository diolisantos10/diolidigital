// entrada-de-material-teto-do-corpo.test.ts — S6, 28/09/2026: o teto de
// tamanho do multipart em `POST /api/agency/clients/[id]/entrada` precisa
// vir ANTES de `request.formData()` ler o corpo inteiro.
//
// Achado: até este conserto, a rota só conferia `MAX_BYTES_POR_ARQUIVO` (por
// arquivo) e `MAX_ARQUIVOS_POR_ENVIO` DEPOIS de `await request.formData()` —
// e `formData()` bufferiza o corpo INTEIRO em memória antes de qualquer
// checagem rodar. Não há `middleware.ts` nesta casa e o `bodySizeLimit` do
// `next.config.ts` só vale para Server Actions — nada segurava isto antes do
// handler. A mesma régua de `app/api/brain/client-requests/route.ts`
// (`docs/agents/seguranca`/S de 16/08): o `content-length` declarado é
// conferido ANTES do parse.
//
// Este arquivo é dedicado só a ESTA trava (não duplica
// `entrada-de-material-rotas.test.ts`, que já prova o resto da fiação da
// rota) — as duas metades: recusa o corpo que se declara grande demais SEM
// tocar em banco nem em `guardarArquivo`, e deixa passar o envio pequeno e
// honesto de sempre.
//
// Mocks TIPADOS (regra do CLAUDE.md).

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const requireSession = vi.hoisted(() => vi.fn());
const clienteOuNulo = vi.hoisted(() => vi.fn());
const rateLimit = vi.hoisted(() => vi.fn());
const deveBloquearMutacaoCrossSite = vi.hoisted(() => vi.fn());
const guardarArquivo = vi.hoisted(() => vi.fn());
const interpretarFrase = vi.hoisted(() => vi.fn());
const encaixarNoCalendario = vi.hoisted(() => vi.fn());
const entradaExistenteParaMedia = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/api-guard", () => ({ requireSession }));
vi.mock("@/lib/agency/esteira/posse-do-cliente", () => ({ clienteOuNulo }));
vi.mock("@/lib/security/rate-limit", () => ({ rateLimit }));
vi.mock("@/lib/security/navegacao-cross-site", () => ({ deveBloquearMutacaoCrossSite }));
vi.mock("@/lib/agency/media/armazenamento", () => ({
  guardarArquivo,
  MAX_BYTES_POR_ARQUIVO: 120 * 1024 * 1024,
}));
vi.mock("@/lib/agency/media/video", () => ({
  duracaoDe: async (): Promise<number | null> => null,
}));
// A rota POST só importa estes dois — `InterpretacaoSchema` é coisa da rota
// de confirmar (`.../[entradaId]/confirmar/route.ts`), fora deste arquivo.
vi.mock("@/lib/agency/esteira/entrada-de-material", () => ({
  interpretarFrase,
  encaixarNoCalendario,
  entradaExistenteParaMedia,
}));

const db = vi.hoisted(() => ({
  entradaDeMaterial: { create: vi.fn(), update: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), findUnique: vi.fn() },
}));
vi.mock("@/lib/db/client", () => ({ prisma: db }));

import { POST } from "@/app/api/agency/clients/[id]/entrada/route";

function sessaoDe(opts: { role?: string; workspaceId?: string; clientId?: string } = {}) {
  return {
    userId: "u1", email: "quem@dioli.studio", name: "Quem",
    role: opts.role ?? "master", workspaceId: opts.workspaceId ?? "ws1", clientId: opts.clientId,
  };
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

function arquivoDeImagem(nome = "foto.jpg", mime = "image/jpeg", tamanho = 100): File {
  return new File([new Uint8Array(tamanho)], nome, { type: mime });
}

/** Monta o POST multipart. `contentLength` permite DECLARAR um tamanho maior
 *  que o corpo real de verdade — é exatamente o que um envio honesto de
 *  navegador manda (o `content-length` de um `fetch` com `FormData` é
 *  calculado pelo próprio runtime a partir do corpo) e também o que a trava
 *  BARATA (ver o comentário de `TETO_DO_CORPO_MULTIPART` na rota) precisa
 *  pegar sem nunca chamar `request.formData()`. */
function postMultipart(frase: string | null, arquivos: File[], contentLength?: string): NextRequest {
  const form = new FormData();
  if (frase !== null) form.set("frase", frase);
  for (const a of arquivos) form.append("arquivos", a);
  const headers: Record<string, string> = {};
  if (contentLength !== undefined) headers["content-length"] = contentLength;
  return new NextRequest("https://app.dioli.studio/api/agency/clients/cli1/entrada", {
    method: "POST",
    headers,
    body: form,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  requireSession.mockResolvedValue({ session: sessaoDe(), error: null });
  clienteOuNulo.mockResolvedValue({ id: "cli1" });
  rateLimit.mockReturnValue({ allowed: true, retryAfter: 0 });
  deveBloquearMutacaoCrossSite.mockReturnValue(false);
  guardarArquivo.mockResolvedValue({
    ok: true,
    arquivo: { id: "med_novo", fileName: "foto.jpg", mimeType: "image/jpeg", sizeBytes: 100, url: "/api/media/med_novo" },
  });
  interpretarFrase.mockResolvedValue({
    ok: false,
    motivo: "não importa para este teste — a trava de tamanho barra antes disto",
  });
  entradaExistenteParaMedia.mockResolvedValue(null);
  db.entradaDeMaterial.create.mockImplementation(
    async ({ data }: { data: Record<string, unknown> }): Promise<Record<string, unknown>> => ({
      id: "ent1", status: "recebida", motivo: null, socialPostIdsJson: "[]", ...data,
    }),
  );
  db.entradaDeMaterial.update.mockImplementation(
    async ({ data }: { data: Record<string, unknown> }): Promise<Record<string, unknown>> => ({
      id: "ent1", status: "recusada", motivo: null, socialPostIdsJson: "[]", ...data,
    }),
  );
});

describe("POST /entrada — teto do corpo ANTES do parse multipart", () => {
  it("METADE 1 — barra o caso plantado: content-length declarando corpo grande demais é recusado com 413 SEM ler o corpo", async () => {
    // ~1,4 GB declarado — acima de MAX_ARQUIVOS_POR_ENVIO(10) × MAX_BYTES_POR_ARQUIVO(120MB).
    // O ARQUIVO DE VERDADE anexado é minúsculo (100 bytes): a trava tem que
    // disparar só pelo CABEÇALHO, nunca pelo conteúdo real do envio.
    const res = await POST(
      postMultipart("frase qualquer", [arquivoDeImagem()], String(1_400_000_000)),
      ctx("cli1"),
    );

    expect(res.status).toBe(413);
    // Nada foi lido nem gravado: a trava vem ANTES do parse, que é o ponto
    // todo dela — um corpo de verdade gigante nunca chega a ser bufferizado.
    expect(guardarArquivo).not.toHaveBeenCalled();
    expect(interpretarFrase).not.toHaveBeenCalled();
    expect(db.entradaDeMaterial.create).not.toHaveBeenCalled();
  });

  it("METADE 2 — não inventa problema no caso limpo: envio pequeno e honesto (sem content-length ou com um valor baixo) continua passando", async () => {
    const semCabecalho = await POST(postMultipart("Lançamento, postar dia 15/10.", [arquivoDeImagem()]), ctx("cli1"));
    expect(semCabecalho.status).not.toBe(413);

    const comCabecalhoHonesto = await POST(
      postMultipart("Lançamento, postar dia 15/10.", [arquivoDeImagem()], "200"),
      ctx("cli1"),
    );
    expect(comCabecalhoHonesto.status).not.toBe(413);
    expect(guardarArquivo).toHaveBeenCalled();
  });
});

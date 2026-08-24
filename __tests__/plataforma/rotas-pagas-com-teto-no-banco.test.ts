// AS QUATRO ROTAS PÚBLICAS PAGAS estão realmente ligadas no teto do BANCO.
//
// O teste do mecanismo (`teto-de-ritmo-no-banco.test.ts`) prova que o contador
// atravessa deploy e réplica. Este aqui prova a outra metade da mesma frase: que
// as quatro rotas que gastam a chave de IA da agência passam por ELE, e não pelo
// contador em memória que zerava a cada publicação.
//
// A afirmação de dinheiro é a segunda: barrado NÃO chega a resolver a chave de
// IA. Se a ordem estiver invertida, a rota gasta antes de recusar — e um teto
// que só recusa depois de pagar não é teto.
//
// AS DUAS METADES: barrado = 429 e chave nunca resolvida; liberado = a rota
// segue seu caminho normal.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { readFileSync } from "node:fs";

const limiteExcedido = vi.hoisted(() => vi.fn());
const chaveDeRotaPublica = vi.hoisted(() => vi.fn());

vi.mock("@/lib/security/limite-no-banco", () => ({
  limiteExcedido,
  consumirVaga: vi.fn(),
  respostaDeRecusa: vi.fn(),
}));
// A rota passou a andar na ordem de provedores da casa (24/08/2026), então ela
// chama `primeiraChaveDeRotaPublica`. O mock DERIVA da mesma função de sempre:
// todo `chaveDeRotaPublica.mockResolvedValue(...)` deste arquivo continua
// mandando, e nenhuma expectativa abaixo precisou mudar — só o encanamento.
vi.mock("@/lib/ai/chave-publica", () => ({
  chaveDeRotaPublica,
  primeiraChaveDeRotaPublica: async () => {
    const chave = await chaveDeRotaPublica("claude");
    return chave ? { provider: "claude", chave } : null;
  },
}));
vi.mock("@/lib/db/client", () => ({ prisma: {} }));

import { POST as sdrChat } from "@/app/api/sdr/chat/route";
import { POST as sdrTranscribe } from "@/app/api/sdr/transcribe/route";
import { POST as sdrUpload } from "@/app/api/sdr/upload/route";
import { POST as briefingExtract } from "@/app/api/brain/briefing-extract/route";

const ROTAS: Array<{ nome: string; caminho: string; chamar: () => Promise<Response> }> = [
  {
    nome: "/api/sdr/chat",
    caminho: "app/api/sdr/chat/route.ts",
    chamar: () => sdrChat(corpoJson("http://localhost/api/sdr/chat", { messages: [] })),
  },
  {
    nome: "/api/sdr/transcribe",
    caminho: "app/api/sdr/transcribe/route.ts",
    chamar: () => sdrTranscribe(corpoJson("http://localhost/api/sdr/transcribe", {})),
  },
  {
    nome: "/api/sdr/upload",
    caminho: "app/api/sdr/upload/route.ts",
    chamar: () => sdrUpload(comArquivo("http://localhost/api/sdr/upload")),
  },
  {
    nome: "/api/brain/briefing-extract",
    caminho: "app/api/brain/briefing-extract/route.ts",
    chamar: () =>
      briefingExtract(corpoJson("http://localhost/api/brain/briefing-extract", { text: "oi" })),
  },
];

function corpoJson(url: string, corpo: unknown): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.9" },
    body: JSON.stringify(corpo),
  });
}

/** Um PNG (não um .txt): o `.txt` é lido direto, sem IA. Para provar que o teto
 *  vem ANTES do gasto, o arquivo precisa ser de um tipo que chama o motor pago. */
function comArquivo(url: string): NextRequest {
  const fd = new FormData();
  fd.append("file", new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: "image/png" }), "briefing.png");
  return new NextRequest(url, {
    method: "POST",
    headers: { "x-forwarded-for": "203.0.113.9" },
    body: fd,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  chaveDeRotaPublica.mockResolvedValue(null); // "not_configured": o motor rule-based assume
});

describe.each(ROTAS)("$nome", ({ caminho, chamar }) => {
  it("barrada pelo teto: 429 e a chave de IA NUNCA é resolvida (não gasta antes de recusar)", async () => {
    limiteExcedido.mockResolvedValue(
      new Response(JSON.stringify({ error: "Muitas requisições" }), {
        status: 429,
        headers: { "Content-Type": "application/json", "Retry-After": "42" },
      }),
    );

    const res = await chamar();
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("42");
    expect(chaveDeRotaPublica).not.toHaveBeenCalled();
  });

  it("A OUTRA METADE: dentro do teto, a rota segue e vai buscar a chave", async () => {
    limiteExcedido.mockResolvedValue(null);
    await chamar();
    expect(chaveDeRotaPublica).toHaveBeenCalled();
  });

  it("o teto consultado é o do BANCO — o contador em memória saiu do arquivo", () => {
    const fonte = readFileSync(caminho, "utf8");
    expect(fonte).toContain("limiteExcedido");
    // Trava, não aviso: enquanto `rateLimited` estiver importado aqui, alguém
    // volta a usá-lo por engano e o teto some no próximo deploy.
    expect(fonte).not.toContain('from "@/lib/security/rate-limit"');
  });
});

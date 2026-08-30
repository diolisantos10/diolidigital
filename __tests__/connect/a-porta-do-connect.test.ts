// A PORTA DO CONNECT — o que ela BARRA, na própria rota HTTP.
//
// As travas de entrada valem pelo que recusam, e recusa só é recusa se for
// medida no lugar onde ela acontece: a rota. Aqui a rota é a de verdade
// (`app/api/connect/despacho/route.ts`), com `NextRequest` montado à mão; só o
// banco é de mentira, porque nenhuma destas provas depende do que está gravado
// — e a metade que DEPENDE do banco tem arquivo próprio
// (`execucao-carimbada.test.ts`), com SQLite real.
//
// As duas metades da regra da casa estão distribuídas assim:
//   • aqui: o problema plantado é BARRADO (segredo ausente, segredo errado,
//     modo de produção, sintético falso, cliente sem carimbo, ficha que não
//     existe) — e o caso limpo NÃO é barrado por engano;
//   • lá: o caminho legítimo executa e devolve o identificador relido.

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { NextRequest } from "next/server";

// ── O banco de mentira, mínimo: só o que a rota toca antes de decidir. ──────
const memoria = vi.hoisted(() => ({
  execucoes: [] as Record<string, unknown>[],
  recusas: [] as Record<string, unknown>[],
}));
const db = vi.hoisted(() => ({
  execucaoV2: {
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const linha = { id: `exec-${memoria.execucoes.length + 1}`, ...data };
      memoria.execucoes.push(linha);
      return linha;
    }),
    findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
      memoria.execucoes.find((e) => e.id === where.id) ?? null),
    findMany: vi.fn(async () => []),
  },
  recusaV2: {
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const linha = { id: `recusa-${memoria.recusas.length + 1}`, ...data };
      memoria.recusas.push(linha);
      return linha;
    }),
  },
}));
vi.mock("@/lib/db/client", () => ({ prisma: db }));

import { POST } from "@/app/api/connect/despacho/route";
import { MARCA_DO_CLIENTE_FALSO } from "@/lib/agency/cliente-falso/trava-de-saida";
import { FUNCAO_DO_PILOTO } from "@/lib/agency/connect/contrato";

const SEGREDO = "segredo-de-homologacao-do-connect";
const CLIENTE = `Cantina da Prova ${MARCA_DO_CLIENTE_FALSO}`;

function pedir(corpo: unknown, cabecalhos: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://localhost/api/connect/despacho", {
    method: "POST",
    headers: { "content-type": "application/json", ...cabecalhos },
    body: JSON.stringify(corpo),
  });
}

/** Um corpo bem formado — cada teste estraga UM campo dele. */
function corpoLimpo(extra: Record<string, unknown> = {}) {
  return {
    modo: "homologacao",
    sintetico: true,
    funcao: FUNCAO_DO_PILOTO,
    cliente: CLIENTE,
    pergunta: "Por que o atendimento da Cantina está atrasado?",
    dossie: {
      "demanda do Gerente Geral com objetivo, prazo e critério de aceite": "Destravar o atendimento até hoje.",
      "capacidade atual do departamento (quem está livre e quem está ocupado)": "conversational-sdr livre.",
    },
    ...extra,
  };
}

beforeEach(() => {
  memoria.execucoes.length = 0;
  memoria.recusas.length = 0;
  vi.stubEnv("CONNECT_SECRET", SEGREDO);
  vi.stubEnv("PILOTO_SECRET", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("trava 1 — o segredo", () => {
  it("SEM segredo configurado a porta NÃO abre: 503, e não 401", async () => {
    vi.stubEnv("CONNECT_SECRET", "");
    vi.stubEnv("PILOTO_SECRET", "");
    const r = await POST(pedir(corpoLimpo(), { authorization: `Bearer ${SEGREDO}` }));
    expect(r.status).toBe(503);
    const corpo = await r.json();
    expect(corpo.motivo).toMatch(/nenhum segredo configurado/i);
    // A prova de que não abriu por omissão: nada foi executado.
    expect(memoria.execucoes).toHaveLength(0);
  });

  it("com segredo configurado e cabeçalho errado: 401", async () => {
    const r = await POST(pedir(corpoLimpo(), { authorization: "Bearer chute" }));
    expect(r.status).toBe(401);
    expect(memoria.execucoes).toHaveLength(0);
  });

  it("sem cabeçalho nenhum: 401", async () => {
    const r = await POST(pedir(corpoLimpo()));
    expect(r.status).toBe(401);
  });
});

describe("travas 2 e 3 — homologação com dado sintético, e nada além disso", () => {
  const autorizado = { authorization: `Bearer ${SEGREDO}` };

  it('modo "producao" é recusado com o motivo, e nunca executa', async () => {
    const r = await POST(pedir(corpoLimpo({ modo: "producao" }), autorizado));
    expect(r.status).toBe(400);
    const corpo = await r.json();
    expect(corpo.estado).toBe("recusado");
    expect(corpo.motivo).toMatch(/modo inválido/i);
    expect(corpo.motivo).toMatch(/homologacao/);
    expect(memoria.execucoes).toHaveLength(0);
  });

  it("modo ausente NÃO ganha padrão — a trava não é parâmetro", async () => {
    const semModo = corpoLimpo();
    delete (semModo as Record<string, unknown>).modo;
    const r = await POST(pedir(semModo, autorizado));
    expect(r.status).toBe(400);
    expect((await r.json()).motivo).toMatch(/modo inválido/i);
  });

  it("sintetico: false é recusado", async () => {
    const r = await POST(pedir(corpoLimpo({ sintetico: false }), autorizado));
    expect(r.status).toBe(400);
    expect((await r.json()).motivo).toMatch(/sintetico inválido/i);
    expect(memoria.execucoes).toHaveLength(0);
  });

  it('sintetico: "true" em TEXTO não passa por true', async () => {
    const r = await POST(pedir(corpoLimpo({ sintetico: "true" }), autorizado));
    expect(r.status).toBe(400);
    expect((await r.json()).motivo).toMatch(/sintetico inválido/i);
  });

  it("sintetico ausente é recusado — não existe padrão", async () => {
    const sem = corpoLimpo();
    delete (sem as Record<string, unknown>).sintetico;
    const r = await POST(pedir(sem, autorizado));
    expect(r.status).toBe(400);
    expect((await r.json()).motivo).toMatch(/sintetico inválido/i);
  });
});

describe("trava 4 — o carimbo do cliente fictício", () => {
  const autorizado = { authorization: `Bearer ${SEGREDO}` };

  it("cliente sem [TESTE] é recusado — nome de cliente real não atravessa", async () => {
    const r = await POST(pedir(corpoLimpo({ cliente: "Padaria do Zé" }), autorizado));
    expect(r.status).toBe(400);
    const corpo = await r.json();
    expect(corpo.motivo).toContain(MARCA_DO_CLIENTE_FALSO);
    expect(memoria.execucoes).toHaveLength(0);
  });

  it("cliente ausente é recusado", async () => {
    const sem = corpoLimpo();
    delete (sem as Record<string, unknown>).cliente;
    const r = await POST(pedir(sem, autorizado));
    expect(r.status).toBe(400);
    expect((await r.json()).motivo).toMatch(/cliente é obrigatório/i);
  });
});

describe("a ficha que não existe", () => {
  const autorizado = { authorization: `Bearer ${SEGREDO}` };

  it("função fora do catálogo é recusada COM NOME, e a recusa fica gravada", async () => {
    const r = await POST(pedir(corpoLimpo({ funcao: "gerente-que-nao-existe" }), autorizado));
    expect(r.status).toBe(422);
    const corpo = await r.json();
    expect(corpo.estado).toBe("recusado");
    expect(corpo.motivo).toContain("gerente-que-nao-existe");
    expect(corpo.motivo).toMatch(/não existe no catálogo canônico/i);
    // Recusa sem rastro é recusa invisível (regra 8 do motor).
    expect(memoria.recusas).toHaveLength(1);
    expect(memoria.execucoes).toHaveLength(0);
  });

  it("entrada obrigatória faltando é recusada nomeando o que falta", async () => {
    const r = await POST(pedir(corpoLimpo({ dossie: {} }), autorizado));
    expect(r.status).toBe(422);
    const corpo = await r.json();
    expect(corpo.estado).toBe("recusado");
    expect(corpo.motivo).toMatch(/entradas obrigatórias ausentes/i);
    // E a porta devolve a lista da ficha, para o chamador se corrigir sozinho.
    expect(corpo.entradas_exigidas_pela_ficha).toHaveLength(2);
  });
});

describe("a outra metade — o caso limpo NÃO é barrado por engano", () => {
  it("corpo bem formado atravessa as quatro travas e chega a executar", async () => {
    const r = await POST(pedir(corpoLimpo(), { authorization: `Bearer ${SEGREDO}` }));
    const corpo = await r.json();
    expect(corpo.estado, JSON.stringify(corpo)).toBe("executado");
    expect(r.status).toBe(200);
    expect(memoria.execucoes).toHaveLength(1);
    expect(corpo.execucaoId).toBe("exec-1");
  });
});

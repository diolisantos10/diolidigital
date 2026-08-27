// O REENVIO DO AVISO DE ORÇAMENTO — 16/08/2026
//
// `RESEND_FROM` não existe no Railway (medido). Sem ela, todo aviso de
// orçamento falha no dia do deploy, e até 16/08 a falha não tinha para onde
// voltar: virava `console.warn`, morria no rodízio do log, e quando o CEO
// setasse a variável ninguém seria reavisado — o silêncio de 51 dias
// (Sushi Cazza) recriado, agora invisível.
//
// `reenviarAvisosQueFalharam` é o caminho que faz essa falha deixar de ser
// terminal. Ela SÓ alcança quem está gravado como `falhou`/`skipped`
// (`lib/agency/esteira/orcamento-do-briefing.ts`) — e é essa mesma restrição
// que evita o defeito OPOSTO e pior: mandar o mesmo orçamento duas vezes para
// quem já foi avisado. Este arquivo prova as duas metades, com o e-mail real
// e o `fetch` da Resend inteiramente mockados — nenhum e-mail sai para
// ninguém aqui.

import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  portalAccess: { findFirst: vi.fn() },
  $queryRawUnsafe: vi.fn(),
  $executeRawUnsafe: vi.fn(),
}));
vi.mock("@/lib/db/client", () => ({ prisma: db }));

const email = vi.hoisted(() => ({ sendEmail: vi.fn() }));
vi.mock("@/lib/email/send", () => email);

import {
  reenviarAvisosQueFalharam,
  MAX_REENVIOS_POR_CHAMADA,
} from "@/lib/agency/esteira/orcamento-do-briefing";

// `{ casaInteira: true }` preserva o comportamento que este arquivo sempre
// testou (sem filtro de workspace) — a fronteira de posse tem teste dedicado
// em `avisos-de-orcamento-workspace.test.ts`, incluído em 16/08/2026 na
// devolução do `seguranca`.
const CASA_INTEIRA = { casaInteira: true as const };

function linhaPresa(over: Record<string, unknown> = {}) {
  return {
    id: "req1",
    businessName: "CityJobs",
    briefingJson: JSON.stringify({
      contato: { nome: "Dioli", email: "ceo@cityjobs.com.br", whatsapp: null },
      estimate: { totalMin: 1390, totalMax: 2590, items: [{ label: "Social media" }] },
    }),
    sdrHandoffJson: null,
    ...over,
  };
}

beforeEach(() => {
  db.portalAccess.findFirst.mockReset();
  db.portalAccess.findFirst.mockResolvedValue(null);
  db.$queryRawUnsafe.mockReset();
  db.$queryRawUnsafe.mockResolvedValue([]);
  db.$executeRawUnsafe.mockReset();
  db.$executeRawUnsafe.mockResolvedValue(1);
  email.sendEmail.mockReset();
  email.sendEmail.mockResolvedValue({ ok: true, id: "em_2" });
});

describe("o mecanismo que impede a duplicata: a busca nunca alcança quem já foi avisado", () => {
  it("a consulta filtra por 'falhou'/'skipped' — nunca por 'avisado' nem 'sem_canal'", async () => {
    await reenviarAvisosQueFalharam(CASA_INTEIRA);

    expect(db.$queryRawUnsafe).toHaveBeenCalledTimes(1);
    const sql = db.$queryRawUnsafe.mock.calls[0][0] as string;
    // A MESMA garantia da entrega original (sair de `new` antes do e-mail),
    // só que expressa em estado gravado: o WHERE abaixo É o mecanismo — quem
    // já tem `avisoOrcamentoStatus = 'avisado'` nunca é lido de volta aqui.
    expect(sql).toMatch(/avisoOrcamentoStatus IN \('falhou', 'skipped'\)/);
    expect(sql).not.toMatch(/'avisado'/);
    expect(sql).not.toMatch(/'sem_canal'/);
  });

  it("usa um teto por chamada — reenvio não vira rajada", async () => {
    await reenviarAvisosQueFalharam(CASA_INTEIRA);
    const params = db.$queryRawUnsafe.mock.calls[0].slice(1);
    expect(params).toContain(MAX_REENVIOS_POR_CHAMADA);
  });
});

describe("o reenvio FAZ SAIR o que ficou preso", () => {
  it("manda o e-mail de novo e grava 'avisado' — reenviados=1", async () => {
    db.$queryRawUnsafe.mockResolvedValue([linhaPresa()]);
    const r = await reenviarAvisosQueFalharam(CASA_INTEIRA);

    expect(r.reenviados).toBe(1);
    expect(r.aindaFalhando).toBe(0);
    expect(email.sendEmail).toHaveBeenCalledTimes(1);
    expect(email.sendEmail.mock.calls[0][0].to).toBe("ceo@cityjobs.com.br");

    // Duas escritas por envio bem-sucedido, nesta ordem: (1) a RESERVA
    // atômica (`avisoOrcamentoStatus = 'enviando'`, o CAS que impede a
    // corrida — ver `reservarParaReenvio`), (2) a marca de sucesso final,
    // que é o que tira o pedido da fila de reenvio na PRÓXIMA chamada (ver
    // o teste seguinte).
    expect(db.$executeRawUnsafe).toHaveBeenCalledTimes(2);
    const reserva = db.$executeRawUnsafe.mock.calls[0];
    expect(reserva[0]).toMatch(/avisoOrcamentoStatus = 'enviando'/);
    const gravacaoFinal = db.$executeRawUnsafe.mock.calls[1];
    expect(gravacaoFinal[1]).toBe("avisado");
  });

  it("o reenvio também NÃO estampa preço — a mesma regra do envio original", async () => {
    // ⚠️ ESTE TESTE EXIGIA A FAIXA ATÉ 27/08/2026. A ordem do CEO — *"eu não
    // acho que o valor tem que estar estampado no e-mail"* — vale para as DUAS
    // portas de saída, e é justamente por isso que ele foi invertido em vez de
    // apagado: o reenvio é o caminho que ninguém olha, e seria por ele que o
    // preço voltaria à caixa de entrada sem ninguém perceber.
    db.$queryRawUnsafe.mockResolvedValue([linhaPresa()]);
    await reenviarAvisosQueFalharam(CASA_INTEIRA);

    const html = email.sendEmail.mock.calls[0][0].html as string;
    const visivel = html.replace(/<[^>]*>/g, " ");
    expect(visivel).not.toMatch(/1\.390|2\.590/);
    expect(visivel).not.toMatch(/R\$/);
    // Sem preço e sem botão (este cenário não tem token cunhado), o e-mail
    // ainda tem de dizer ONDE o orçamento está — senão o cliente fica com um
    // aviso que não leva a lugar nenhum, que é o defeito oposto ao que a ordem
    // do CEO consertou.
    expect(html).toMatch(/conversa com a gente/i);
  });

  it("não existe um segundo caminho de envio: usa o mesmo `sendEmail` e o mesmo template da entrega original", async () => {
    db.$queryRawUnsafe.mockResolvedValue([linhaPresa()]);
    await reenviarAvisosQueFalharam(CASA_INTEIRA);

    // `orcamentoProntoEmail` é a mesma peça que `entregarOrcamentosPendentes`
    // usa — se o reenvio tivesse o seu próprio texto, um ajuste em um dos
    // dois divergiria do outro na primeira mudança.
    const html = email.sendEmail.mock.calls[0][0].html as string;
    expect(html).toMatch(/estimativa/i);
    expect(html).not.toMatch(/\b1 dia\b|\bum dia\b|\bem breve\b/i);
  });

  it("quem tenta de novo e falha de novo fica 'aindaFalhando', com o motivo regravado", async () => {
    email.sendEmail.mockResolvedValue({ ok: false, error: "resend_500: fora do ar" });
    db.$queryRawUnsafe.mockResolvedValue([linhaPresa()]);
    const r = await reenviarAvisosQueFalharam(CASA_INTEIRA);

    expect(r.reenviados).toBe(0);
    expect(r.aindaFalhando).toBe(1);
    // calls[0] é a reserva; calls[1] é a gravação final do resultado.
    const args = db.$executeRawUnsafe.mock.calls[1];
    expect(args[1]).toBe("falhou");
    expect(args[2]).toMatch(/fora do ar/);
  });
});

describe("e-mail que já saiu NÃO sai duas vezes, nem pelo reenvio", () => {
  it("depois de reenviar com sucesso, uma segunda chamada não encontra mais o pedido e não manda nada", async () => {
    // Primeira chamada: o pedido está preso, o reenvio funciona.
    db.$queryRawUnsafe.mockResolvedValueOnce([linhaPresa()]);
    const primeira = await reenviarAvisosQueFalharam(CASA_INTEIRA);
    expect(primeira.reenviados).toBe(1);

    // A gravação de 'avisado' (testada acima) é exatamente o que faria o
    // WHERE `avisoOrcamentoStatus IN ('falhou','skipped')` deixar de devolver
    // esta linha numa consulta real — aqui simulamos esse efeito devolvendo
    // lista vazia na segunda chamada, como o banco devolveria de verdade.
    db.$queryRawUnsafe.mockResolvedValueOnce([]);
    const segunda = await reenviarAvisosQueFalharam(CASA_INTEIRA);

    expect(segunda.reenviados).toBe(0);
    // Só o e-mail da primeira chamada existiu — a segunda não tentou mandar
    // nada porque não havia mais candidato.
    expect(email.sendEmail).toHaveBeenCalledTimes(1);
  });
});

describe("🔴 SÉRIO 1 (16/08/2026, devolução do `seguranca`): duas chamadas concorrentes não mandam dois e-mails", () => {
  it("⛔ a SEGUNDA chamada encontra a linha já reservada pela primeira e não manda nada — UM e-mail só", async () => {
    // Duas abas, dois operadores, ou um retry de rede: as DUAS chamadas fazem
    // o MESMO `SELECT` (mockado para devolver a mesma linha presa nas duas),
    // exatamente como duas réplicas concorrentes veriam o mesmo banco antes
    // de qualquer reserva acontecer.
    db.$queryRawUnsafe.mockResolvedValue([linhaPresa()]);

    // O `$executeRawUnsafe` mockado simula o CAS de verdade: a MESMA linha só
    // é reservada (afeta 1 linha) na PRIMEIRA vez; a segunda tentativa sobre
    // o mesmo id afeta 0 linhas, porque no banco real o `WHERE` da reserva já
    // não bate mais (`avisoOrcamentoStatus` deixou de ser 'falhou'/'skipped').
    const reservadas = new Set<string>();
    db.$executeRawUnsafe.mockImplementation((sql: string, ...params: unknown[]) => {
      if (sql.includes("SET avisoOrcamentoStatus = 'enviando',")) {
        const id = params[1] as string;
        if (reservadas.has(id)) return Promise.resolve(0);
        reservadas.add(id);
        return Promise.resolve(1);
      }
      // A gravação final do resultado nunca é o que decide a corrida — só a
      // reserva é.
      return Promise.resolve(1);
    });

    const [primeira, segunda] = await Promise.all([
      reenviarAvisosQueFalharam(CASA_INTEIRA),
      reenviarAvisosQueFalharam(CASA_INTEIRA),
    ]);

    // Não importa qual das duas "ganhou" — o total somado é UM, nunca dois.
    expect(primeira.reenviados + segunda.reenviados).toBe(1);
    expect(email.sendEmail).toHaveBeenCalledTimes(1);
  });

  it("✅ passada única continua enviando normalmente — o caso limpo não regride", async () => {
    db.$queryRawUnsafe.mockResolvedValue([linhaPresa()]);
    const r = await reenviarAvisosQueFalharam(CASA_INTEIRA);

    expect(r.reenviados).toBe(1);
    expect(email.sendEmail).toHaveBeenCalledTimes(1);
  });

  it("⛔ a condição de partida da reserva nunca inclui 'avisado' — quem já foi avisado não vira elegível pela reserva", async () => {
    db.$queryRawUnsafe.mockResolvedValue([linhaPresa()]);
    await reenviarAvisosQueFalharam(CASA_INTEIRA);

    const reserva = db.$executeRawUnsafe.mock.calls[0];
    expect(reserva[0]).not.toMatch(/'avisado'/);
  });
});

describe("nunca inventa valor para destravar um e-mail", () => {
  it("pedido sem estimativa utilizável no briefing não é reenviado", async () => {
    db.$queryRawUnsafe.mockResolvedValue([linhaPresa({ briefingJson: JSON.stringify({ scope: {} }) })]);
    const r = await reenviarAvisosQueFalharam(CASA_INTEIRA);

    expect(email.sendEmail).not.toHaveBeenCalled();
    expect(r.reenviados).toBe(0);
    expect(r.aindaFalhando).toBe(0);
    expect(r.falhas).toHaveLength(1);
  });
});

describe("resiliência da chamada de reenvio", () => {
  it("a consulta falhando vira `falhas`, nunca lança", async () => {
    db.$queryRawUnsafe.mockRejectedValueOnce(new Error("banco fora do ar"));
    const r = await reenviarAvisosQueFalharam(CASA_INTEIRA);

    expect(r.falhas).toHaveLength(1);
    expect(r.reenviados).toBe(0);
    expect(email.sendEmail).not.toHaveBeenCalled();
  });

  it("um candidato problemático não impede os outros de serem reenviados", async () => {
    db.$queryRawUnsafe.mockResolvedValue([
      linhaPresa({ id: "req1", briefingJson: "{isso não é json" }),
      linhaPresa({ id: "req2" }),
    ]);
    const r = await reenviarAvisosQueFalharam(CASA_INTEIRA);

    expect(r.reenviados).toBe(1);
    expect(email.sendEmail).toHaveBeenCalledTimes(1);
    expect(email.sendEmail.mock.calls[0][0].to).toBe("ceo@cityjobs.com.br");
  });
});

// O caso Diego — City Jobs, 16/08/2026, piloto ao vivo.
//
// ─── O QUE ACONTECEU ──────────────────────────────────────────────────────────
//
// 12:40 — o lead Diego, da City Jobs, escreveu no SDR:
//   "Olha o nosso Budget Estamos pensando algo em torno de r$ 500 por mês"
//
// 12:44 — quatro minutos depois, a casa respondeu:
//   "a estimativa fica entre R$ 1.800 e R$ 3.400 por mês"
//
// Nenhuma palavra sobre a diferença. O piso da estimativa saiu 3,6× acima do
// que Diego tinha acabado de declarar, e a resposta não deu sinal de ter
// ouvido o número dele. Isso não é "preço alto" — é a agência não escutando o
// que o cliente falou. Perde o lead e queima a marca.
//
// ─── ONDE A REGRA JÁ MORA, E POR QUE ESTE ARQUIVO NÃO A REESCREVE ────────────
//
// A regra (confrontar o piso da estimativa contra o teto declarado, e nomear a
// diferença em vez de calar) já existe em `lib/agency/comercial/verba-
// declarada.ts` (`confrontoDeVerba` + `textoDaVerbaEstourada`), já é chamada
// dentro do cálculo (`lib/agency/live-calculator.ts:337`) e já é impressa no
// texto do orçamento (`lib/agency/esteira/orcamento-do-briefing.ts:406-409`,
// `textoDoOrcamento`). Duas suítes já fixam esse comportamento no nível de
// função pura, com os MESMOS números deste caso:
//   • __tests__/comercial/verba-declarada-o-que-cabe.test.ts
//   • __tests__/comercial/verba-e-volume-do-briefing.test.ts
// Escrever uma terceira cópia dessas asserções seria repetir o erro que este
// mesmo dia já pagou uma vez — duas frentes construindo o mesmo julgamento
// comercial sem se enxergarem (ver o cabeçalho de `verba-declarada.ts`).
//
// ─── O QUE ESTE ARQUIVO FECHA, E QUE NENHUM DOS DOIS FECHAVA ──────────────────
//
// Nenhuma das duas suítes acima passa pelo caminho de ENTREGA de verdade —
// `entregarOrcamentosPendentes()`, o relógio que lê o pedido do banco, monta o
// texto e GRAVA a mensagem que o cliente lê na conversa (`portalMessage.
// create`, `orcamento-do-briefing.ts:509-519`). `__tests__/esteira/orcamento-
// do-briefing.test.ts` testa esse mesmo pipeline ponta a ponta, mas seu bloco
// "o texto que o cliente lê" nunca alimenta um `confrontoDeVerba` — testa
// itens, o que falta, o que não está incluído, nunca a verba. Ou seja: existe
// prova de que o CÁLCULO reconhece a verba (nível de função), e existe prova
// de que a ENTREGA funciona (nível de pipeline) — mas não existia prova de que
// a ENTREGA, rodando de ponta a ponta, carrega o reconhecimento da verba até a
// `body` que de fato vira mensagem na conversa do cliente. Esse é o elo que
// faltava medir, e é o que este arquivo mede.
//
// ─── O COMPORTAMENTO ESCOLHIDO (item 2 do despacho) ──────────────────────────
//
// `verba-declarada.ts` já implementa as DUAS metades — (a) nomeia a diferença
// E (b) diz o que cabe dentro do teto — na mesma frase (`textoDaVerbaEstourada`).
// Este teste adota o que já existe: não inventa um terceiro comportamento.

import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  clientRequestDb: { findMany: vi.fn(), update: vi.fn() },
  portalMessage: { create: vi.fn() },
  portalAccess: { findFirst: vi.fn() },
  $transaction: vi.fn(async (ops: unknown[]) => ops),
  $executeRawUnsafe: vi.fn().mockResolvedValue(1),
  $queryRawUnsafe: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/db/client", () => ({ prisma: db }));

const email = vi.hoisted(() => ({ sendEmail: vi.fn() }));
vi.mock("@/lib/email/send", () => email);

import { entregarOrcamentosPendentes } from "@/lib/agency/esteira/orcamento-do-briefing";

/**
 * O real formatado em pt-BR usa espaço não-quebrável, e a versão do ICU
 * embarcada decide QUAL (U+00A0 ou U+202F) — invisível a olho nu num diff.
 * Normaliza por categoria Unicode, não por caractere escolhido a dedo (ver o
 * mesmo cuidado em `verba-declarada-o-que-cabe.test.ts`).
 */
const semNbsp = (s: string) => s.replace(/\p{Zs}/gu, " ");

/** O pedido de Diego, do jeito que ele realmente chegou ao banco: a faixa
 *  declarada gravada junto da estimativa que a passa muito. */
function pedidoDoDiego(overEstimate: Record<string, unknown> = {}) {
  return {
    id: "req-diego",
    clientId: "cli-diego",
    businessName: "City Jobs",
    status: "new",
    createdAt: new Date("2026-08-16T12:40:00Z"),
    sdrHandoffJson: null,
    briefingJson: JSON.stringify({
      contato: { nome: "Diego", email: "diego@cityjobs.com.br", whatsapp: null },
      estimate: {
        totalMin: 1800,
        totalMax: 3400,
        items: [{ label: "Plano Essencial", detail: "3 posts + 5 stories/semana" }],
        // O confronto calculado exatamente como `computeEstimate` o produziria
        // para uma faixa declarada de "até R$ 500" contra um piso de R$ 1.800:
        // teto 500, diferença 1300, com os degraus de entrada da casa.
        confrontoDeVerba: {
          teto: 500,
          rotulo: "entre R$ 150 e R$ 500",
          diferenca: 1300,
          cabemNaVerba: [
            { nome: "Pulso", preco: 49, paraQuem: "quem está começando", implantacao: null, naoInclui: ["tráfego pago"] },
            { nome: "Ritmo", preco: 297, paraQuem: "negócio em ritmo constante", implantacao: 390, naoInclui: ["identidade visual"] },
          ],
        },
        ...overEstimate,
      },
    }),
  };
}

beforeEach(() => {
  db.clientRequestDb.findMany.mockReset();
  db.clientRequestDb.update.mockReset();
  db.portalMessage.create.mockReset();
  db.portalAccess.findFirst.mockReset();
  db.portalAccess.findFirst.mockResolvedValue({ token: "tok-diego" });
  db.$transaction.mockClear();
  db.$executeRawUnsafe.mockReset();
  db.$executeRawUnsafe.mockResolvedValue(1);
  db.$queryRawUnsafe.mockReset();
  db.$queryRawUnsafe.mockResolvedValue([]);
  email.sendEmail.mockReset();
  email.sendEmail.mockResolvedValue({ ok: true, id: "em_diego" });
});

describe("a verba que Diego declarou chega, com todas as letras, na mensagem que ele lê", () => {
  it("a mensagem gravada no portal nomeia a verba dele — nunca entrega a estimativa nua", async () => {
    db.clientRequestDb.findMany.mockResolvedValue([pedidoDoDiego()]);

    const r = await entregarOrcamentosPendentes();
    expect(r.entregues).toBe(1);
    expect(db.portalMessage.create).toHaveBeenCalledTimes(1);

    const corpo = semNbsp(db.portalMessage.create.mock.calls[0][0].data.body as string);

    // A estimativa que Diego leu de verdade: 3,6× a verba dele.
    expect(corpo).toMatch(/1\.800/);
    expect(corpo).toMatch(/3\.400/);

    // O CORAÇÃO DA PROVA: a verba declarada por Diego (R$ 500) é citada NA
    // MESMA mensagem, e a diferença é nomeada — não um "consulte um vendedor",
    // o número real. Se `confrontoDeVerba` alguma vez deixasse de chegar até
    // aqui (voltar a viajar só no cálculo, sem chegar à `body` gravada), esta
    // asserção quebra.
    expect(corpo).toMatch(/r\$ 150/i);
    expect(corpo).toMatch(/r\$ 500/i);
    expect(corpo).toMatch(/passa disso/i);

    // E ele nunca fica sem alternativa: os degraus que cabem no bolso dele
    // aparecem na mesma mensagem, não numa segunda conversa.
    expect(corpo).toMatch(/Pulso/);
    expect(corpo).toMatch(/Ritmo/);
  });

  it("sem confronto calculado, a mensagem entrega o número — mas não finge reconhecer o que não foi dito", async () => {
    // Contraprova do lado oposto: se o pedido não carrega `confrontoDeVerba`
    // (porque o cliente não declarou faixa, ou porque a conta coube), a
    // mensagem não inventa um reconhecimento que não existe. Ausência de
    // informação não é informação.
    db.clientRequestDb.findMany.mockResolvedValue([
      pedidoDoDiego({ confrontoDeVerba: undefined }),
    ]);

    await entregarOrcamentosPendentes();
    const corpo = db.portalMessage.create.mock.calls[0][0].data.body as string;

    expect(corpo).not.toMatch(/passa disso/i);
    expect(corpo).not.toMatch(/Pulso|Ritmo/);
  });

  it("o toque no ombro por e-mail aponta para a conversa em vez de duplicar a conta", async () => {
    // A regra de UMA fonte: o e-mail sinaliza que a verba foi tratada e manda
    // ler a conversa — nunca recalcula ou reformata o confronto por conta
    // própria (ver `avisarPorEmail`, `orcamento-do-briefing.ts:304-313`). Duas
    // fontes do mesmo número é como esta casa já divergiu uma vez no mesmo dia.
    db.clientRequestDb.findMany.mockResolvedValue([pedidoDoDiego()]);
    await entregarOrcamentosPendentes();

    expect(email.sendEmail).toHaveBeenCalledTimes(1);
    const html = email.sendEmail.mock.calls[0][0].html as string;
    expect(html).toMatch(/verba menor|verba/i);
    // O e-mail não recita o valor exato do confronto — isso é papel da
    // conversa, não do aviso.
    expect(html).not.toMatch(/1\.300|R\$\s?500\b/);
  });
});

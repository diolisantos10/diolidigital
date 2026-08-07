// OPERAÇÃO SOBRE O TRABALHO JÁ CONTRATADO — as duas metades da prova.
//
// A regressão que estes testes impedem tem id e hora: pedido
// `cmshiesdq00000pp2adk7zxe4` (Foocci, 06/08/2026 09:46). O CEO pediu para
// adiantar o calendário em um dia; a triagem parou em `precisa_decisao` com o
// motivo "não se encaixa em nenhum dos serviços que a máquina produz sozinha".
// Motivo certo, desfecho errado — e o pedido ficou horas esperando gente.
//
// As duas metades, em cada trava:
//   1. a operação LEGÍTIMA passa sem atrito e devolve as datas novas;
//   2. a operação PROIBIDA é barrada NOMEANDO o motivo — peça publicada,
//      peça sem aval, data no passado, quantidade não dita.

import { describe, it, expect, vi, beforeEach } from "vitest";

interface Post {
  id: string;
  clientId: string;
  status: string;
  scheduledFor: Date | null;
  caption: string;
}

let posts: Post[] = [];

const db = {
  socialPost: {
    findMany: vi.fn(({ where, orderBy }: { where: Record<string, unknown>; orderBy?: unknown }) => {
      let r = posts.filter((p) => p.clientId === where.clientId);
      if (where.scheduledFor && typeof where.scheduledFor === "object") r = r.filter((p) => p.scheduledFor !== null);
      void orderBy;
      r = [...r].sort((a, b) => (a.scheduledFor?.getTime() ?? 0) - (b.scheduledFor?.getTime() ?? 0));
      return Promise.resolve(r);
    }),
    update: vi.fn(({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const p = posts.find((x) => x.id === where.id)!;
      Object.assign(p, data);
      return Promise.resolve(p);
    }),
  },
};
vi.mock("@/lib/db/client", () => ({ prisma: db }));

const {
  lerOperacao, executarOperacaoDeCalendario, proximoHorarioViavel, contarAoCliente, OPERACOES,
} = await import("@/lib/agency/esteira/operacoes");

/** O texto exato do pedido do CEO, sem retoque. */
const PEDIDO_DO_CEO =
  "Eu quero que você adiante. É preciso dar calendário de posts para hoje. Então, ao invés do primeiro post, o primeiro carrossel, que está programado pra amanhã, é preciso que vocês adiantem um dia e possam o primeiro carrossel hoje.";

/** Os 6 carrosséis da Foocci, nas datas medidas em 06/08/2026. */
function seisCarrosseis(status = "scheduled"): Post[] {
  return [
    ["2026-08-07T10:00:00", "Carrossel 1 — o que é a Foocci"],
    ["2026-08-08T10:00:00", "Carrossel 2 — como funciona"],
    ["2026-08-09T10:00:00", "Carrossel 3 — cardápio digital"],
    ["2026-08-10T10:00:00", "Carrossel 4 — pedidos no WhatsApp"],
    ["2026-08-11T18:00:00", "Carrossel 5 — relatórios"],
    ["2026-08-13T18:00:00", "Carrossel 6 — comece hoje"],
  ].map(([d, c], i) => ({
    id: `sp-${i + 1}`, clientId: "cli-foocci", status,
    scheduledFor: new Date(d as string), caption: c as string,
  }));
}

beforeEach(() => {
  posts = seisCarrosseis();
  vi.clearAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
describe("a LEITURA reconhece a família OPERAÇÃO sem IA", () => {
  it("METADE 1 — o pedido do CEO vira `adiantar-calendario`, 1 dia", () => {
    const l = lerOperacao(PEDIDO_DO_CEO);
    expect(l.operacao).toBe("adiantar-calendario");
    expect(l.dias).toBe(1);
    expect(l.reconhecidaSemExecucao).toBeNull();
  });

  it("METADE 2 — pedido de PEÇA NOVA não vira operação de calendário", () => {
    // O erro caro na direção oposta: transformar "quero 3 carrosséis" em
    // remarcação faria a agência não produzir nada e dizer que resolveu.
    for (const texto of [
      "Preciso de 3 carrosséis novos para a semana que vem",
      "Quero um reel pronto do combo do almoço",
      "Podem fazer os posts do mês de setembro?",
      "Quero adiantar o pagamento da mensalidade",
      "Um post antes do lançamento, por favor",
    ]) {
      const l = lerOperacao(texto);
      expect(l.operacao, `"${texto}" não é operação de calendário`).toBeNull();
      expect(l.reconhecidaSemExecucao, `"${texto}"`).toBeNull();
    }
  });

  it('"adiante" não casa com adiar: a direção não é chutada', () => {
    // `adia\\w*` casaria com "adiante" e devolveria ambiguidade onde o texto era
    // claro. É o vizinho mais fácil de errar do vocabulário inteiro.
    expect(lerOperacao("adiantem o calendário em 1 dia").operacao).toBe("adiantar-calendario");
    expect(lerOperacao("podem adiar o calendário em 2 dias?").operacao).toBe("adiar-calendario");
  });

  it("pausar é RECONHECIDO e NÃO executado — com o motivo escrito", () => {
    const l = lerOperacao("pausem as publicações do calendário por enquanto");
    expect(l.operacao).toBeNull();
    expect(l.reconhecidaSemExecucao).toMatch(/pausad/i);
  });

  it("adiantar E adiar no mesmo texto PERGUNTA, nunca escolhe", () => {
    const l = lerOperacao("adiantem o calendário 1 dia, ou melhor, podem adiar 2 dias?");
    expect(l.operacao).toBeNull();
    expect(l.reconhecidaSemExecucao).toMatch(/direção/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("a EXECUÇÃO — as travas do calendário", () => {
  it("METADE 1 — adianta um dia mantendo o espaçamento entre as 6 peças", async () => {
    // "Agora" bem antes do bloco: o piso não entra em cena e a prova é só do
    // deslocamento. (Datas construídas em horário local, como no banco — a
    // expectativa é derivada das mesmas, e não de fuso escrito à mão.)
    const r = await executarOperacaoDeCalendario({
      clientId: "cli-foocci", operacao: "adiantar-calendario", dias: 1, hora: null,
      agora: new Date("2026-08-05T12:00:00"),
    });
    expect(r.ok).toBe(true);
    expect(r.movidas).toHaveLength(6);
    expect(r.empurradoPeloPiso).toBe(false);
    const umDia = 24 * 60 * 60_000;
    expect(r.movidas.map((m) => m.para.getTime())).toEqual(
      seisCarrosseis().map((p) => p.scheduledFor!.getTime() - umDia),
    );
    // O ESPAÇAMENTO é o mesmo de antes: 1, 1, 1, 1(+8h), 2 dias.
    const gaps = r.movidas.slice(1).map((m, i) => m.para.getTime() - r.movidas[i]!.para.getTime());
    const gapsOriginais = seisCarrosseis().slice(1).map((p, i) =>
      p.scheduledFor!.getTime() - seisCarrosseis()[i]!.scheduledFor!.getTime());
    expect(gaps).toEqual(gapsOriginais);
  });

  it("TRAVA · nunca agenda para o passado — empurra o BLOCO e DIZ que empurrou", async () => {
    // Rodando às 23h de 06/08, "adiantar um dia" mandaria a primeira peça para
    // 06/08 10h — que já passou. O piso é o próximo horário viável.
    const r = await executarOperacaoDeCalendario({
      clientId: "cli-foocci", operacao: "adiantar-calendario", dias: 1, hora: null,
      agora: new Date("2026-08-06T23:10:00"),
    });
    expect(r.ok).toBe(true);
    expect(r.empurradoPeloPiso).toBe(true);
    const piso = proximoHorarioViavel(new Date("2026-08-06T23:10:00"));
    expect(r.movidas[0]!.para.getTime()).toBe(piso.getTime());
    for (const m of r.movidas) {
      expect(m.para.getTime(), "nenhuma data no passado").toBeGreaterThan(new Date("2026-08-06T23:10:00").getTime());
    }
    // E o espaçamento continua o mesmo: o bloco andou junto.
    const gaps = r.movidas.slice(1).map((m, i) => m.para.getTime() - r.movidas[i]!.para.getTime());
    const gapsOriginais = seisCarrosseis().slice(1).map((p, i) =>
      p.scheduledFor!.getTime() - seisCarrosseis()[i]!.scheduledFor!.getTime());
    expect(gaps).toEqual(gapsOriginais);
    // E o cliente é informado de qual foi o horário — não em silêncio.
    expect(contarAoCliente(r)).toMatch(/já tinha passado/i);
  });

  it("METADE 2 · TRAVA · peça PUBLICADA não é tocada, e a recusa nomeia o estado", async () => {
    posts[0]!.status = "published";
    posts[1]!.status = "draft";
    const antesPublicada = posts[0]!.scheduledFor!.getTime();
    const antesRascunho = posts[1]!.scheduledFor!.getTime();

    const r = await executarOperacaoDeCalendario({
      clientId: "cli-foocci", operacao: "adiantar-calendario", dias: 1, hora: null,
      agora: new Date("2026-08-06T09:46:00"),
    });
    expect(r.ok).toBe(true);
    expect(r.movidas).toHaveLength(4);
    expect(posts[0]!.scheduledFor!.getTime(), "publicada intocada").toBe(antesPublicada);
    expect(posts[1]!.scheduledFor!.getTime(), "rascunho intocado").toBe(antesRascunho);

    const motivos = r.intocadas.map((i) => `${i.status}:${i.motivo}`).join(" | ");
    expect(motivos).toMatch(/published:.*no ar/i);
    expect(motivos).toMatch(/draft:.*aprova/i);
    expect(contarAoCliente(r)).toMatch(/NÃO mexi/);
  });

  it("TRAVA · calendário inteiro fora de `scheduled` = recusa nomeando os estados", async () => {
    for (const p of posts) p.status = "published";
    const r = await executarOperacaoDeCalendario({
      clientId: "cli-foocci", operacao: "adiantar-calendario", dias: 1, hora: null,
      agora: new Date("2026-08-06T09:46:00"),
    });
    expect(r.ok).toBe(false);
    expect(r.motivo).toMatch(/published/);
    expect(db.socialPost.update).not.toHaveBeenCalled();
  });

  it("TRAVA · quantidade não dita NÃO vira 1", async () => {
    const r = await executarOperacaoDeCalendario({
      clientId: "cli-foocci", operacao: "adiantar-calendario", dias: null, hora: null,
      agora: new Date("2026-08-06T09:46:00"),
    });
    expect(r.ok).toBe(false);
    expect(r.motivo).toMatch(/quantos dias/i);
    expect(db.socialPost.update).not.toHaveBeenCalled();
  });

  it("TRAVA · o calendário de OUTRO cliente é invisível", async () => {
    posts.push({
      id: "sp-outro", clientId: "cli-outro", status: "scheduled",
      scheduledFor: new Date("2026-08-07T10:00:00"), caption: "peça de outro cliente",
    });
    const r = await executarOperacaoDeCalendario({
      clientId: "cli-foocci", operacao: "adiantar-calendario", dias: 1, hora: null,
      agora: new Date("2026-08-06T09:46:00"),
    });
    expect(r.movidas.map((m) => m.postId)).not.toContain("sp-outro");
    expect(posts.find((p) => p.id === "sp-outro")!.scheduledFor!.toISOString())
      .toBe(new Date("2026-08-07T10:00:00").toISOString());
  });

  it("remarcar horário troca a HORA e mantém o dia", async () => {
    const r = await executarOperacaoDeCalendario({
      clientId: "cli-foocci", operacao: "remarcar-horario", dias: null, hora: 18,
      agora: new Date("2026-08-06T09:46:00"),
    });
    expect(r.ok).toBe(true);
    expect(r.movidas.map((m) => m.para.toISOString().slice(0, 16))).toEqual([
      "2026-08-07T18:00", "2026-08-08T18:00", "2026-08-09T18:00", "2026-08-10T18:00",
    ]);
    // As duas de 18h já estavam no horário pedido: data igual NÃO vira escrita.
    expect(r.movidas).toHaveLength(4);
  });

  it("a resposta ao cliente traz as DATAS, nunca um 'ok' genérico", async () => {
    const r = await executarOperacaoDeCalendario({
      clientId: "cli-foocci", operacao: "adiantar-calendario", dias: 1, hora: null,
      agora: new Date("2026-08-06T09:46:00"),
    });
    const texto = contarAoCliente(r);
    expect(texto).toMatch(/06\/08/);
    expect(texto).toMatch(/→/);
    expect(texto).toMatch(/Carrossel 1/);
    expect(texto.split("\n").length).toBeGreaterThan(6);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("o catálogo é FECHADO", () => {
  it("operação fora do catálogo não executa nada", async () => {
    const r = await executarOperacaoDeCalendario({
      clientId: "cli-foocci",
      operacao: "apagar-calendario" as never,
      dias: 1, hora: null,
    });
    expect(r.ok).toBe(false);
    expect(r.motivo).toMatch(/catálogo/i);
    expect(db.socialPost.update).not.toHaveBeenCalled();
  });

  it("toda operação do catálogo declara o que exige do texto do cliente", () => {
    for (const o of OPERACOES) {
      expect(["dias", "hora"], o.id).toContain(o.exige);
      expect(o.label.length, o.id).toBeGreaterThan(10);
    }
  });
});

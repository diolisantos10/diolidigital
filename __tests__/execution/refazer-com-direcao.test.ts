// REFAZER COM DIREÇÃO — a peça que já existe nasce de novo, e o que ela NÃO
// pode fazer no caminho.
//
// ── O DEFEITO, MEDIDO EM 15/08/2026 ─────────────────────────────────────────
//
// A direção de arte passou a chegar ao gerador e o portão de pixel do fundo
// passou a valer — mas o estoque do cliente foi produzido ANTES, e já tem
// `mediaUrl`. `produzirArtesPendentes` procura `mediaUrl: null` e mede "0 peça
// esperando arte": verdadeiro, e não é a pergunta.
//
// ── O QUE ESTE ARQUIVO PROVA ────────────────────────────────────────────────
//
//   1. A direção sai do `Deliverable.content` pelo MESMO leitor da esteira, e a
//      peça é reencontrada pela LEGENDA — nunca por ordem, nunca por sobra.
//   2. Peça SEM direção no entregável é BARRADA. Não se inventa direção de
//      arte: refazer sem ela mandaria a peça de volta ao fallback (a legenda
//      como cena), que é o defeito que se está consertando.
//   3. Peça que o CLIENTE já aprovou NÃO é refeita, e nem é medida como
//      elegível — a aprovação está presa ao post e não ao arquivo.
//   4. Leitura pura é leitura pura: zero escrita, zero imagem paga.
//   5. `scheduledFor`, `status` e `caption` não são tocados — por fonte E por
//      comportamento.
//   6. A seleção é idempotente PELO DADO (a data do fundo), que é o que impede
//      a segunda passada de pagar de novo pelo que já saiu.
//   7. `refazer: []` NÃO vira a rodada global.
//
// Todo teste daqui falha contra o código de antes de 15/08: o módulo não
// existia e `RecorteDaRodadaDeArte` não tinha `refazer`.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const db = vi.hoisted(() => ({
  socialPost: { findMany: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
  mediaAsset: { findFirst: vi.fn(), findUnique: vi.fn(), count: vi.fn() },
  approvalRequest: { findMany: vi.fn() },
  deliverable: { findUnique: vi.fn() },
  client: { findMany: vi.fn() },
  activityEvent: { create: vi.fn() },
}));
const produzirArtesPendentes = vi.hoisted(() => vi.fn());
const renderizadorDisponivel = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/client", () => ({ prisma: db }));
vi.mock("@/lib/agency/design/renderizar", () => ({ renderizadorDisponivel }));
// A rodada de arte tem testes próprios e é MOCKADA aqui de propósito: o assunto
// deste arquivo é quem entra na lista e quem é barrado — não como se compõe.
vi.mock("@/lib/agency/execution/artes", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/agency/execution/artes")>();
  return { ...real, produzirArtesPendentes };
});

import {
  refazerComDirecao, direcaoNoEntregavel,
  MARCO_DA_DIRECAO_NA_IMAGEM, LOTE_PADRAO, LOTE_MAXIMO,
} from "@/lib/agency/execution/refazer-com-direcao";

const RAIZ = join(__dirname, "..", "..");

// ─────────────────────────────────────────────────────────────────────────────
// A PEÇA REAL — CityJobs
// ─────────────────────────────────────────────────────────────────────────────

const LEGENDA = [
  "A vaga que você procura pode ser aqui do lado.",
  "A gente publica o que é do Alto Tietê: Mogi das Cruzes, Suzano, Itaquaquecetuba, Poá, Ferraz de Vasconcelos e Arujá.",
  "Vagas atualizadas no link da bio.",
  "#altotietê #mogidascruzes #suzano",
].join(" ");

const DIRECAO =
  "Plataforma da estação da CPTM em Mogi das Cruzes no fim da tarde, com passageiros descendo do trem, " +
  "luz baixa e a fachada da estação ao fundo. Fotografia real, sem letreiro legível.";

/** O markdown do entregável, na forma EXATA que `deliverableMarkdown`
 *  (`run-execution.ts`) grava — "**N. Título**" e linhas "- Campo: valor". */
const ENTREGAVEL = [
  "**1. A vaga pode ser aqui do lado**",
  "- Formato: feed",
  "- Pilar: Bastidor da região",
  `- Legenda: ${LEGENDA}`,
  `- Visual: ${DIRECAO}`,
  "",
  "**2. Outra peça, outra direção**",
  "- Formato: feed",
  "- Pilar: Bastidor da região",
  "- Legenda: Uma segunda legenda, longa o suficiente para virar post de verdade.",
  "- Visual: Feira de rua em Suzano de manhã, barracas coloridas e movimento.",
].join("\n");

const POST = {
  id: "post-1",
  workspaceId: "ws1",
  clientId: "cityjobs",
  clientRequestId: null,
  deliverableId: "d1",
  caption: LEGENDA,
  format: "feed",
  pillar: "Bastidor da região",
  scenesJson: "[]",
  artDirection: null as string | null,
  mediaUrl: "/api/media/velha",
  lastError: null as string | null,
  status: "draft",
  scheduledFor: new Date("2026-08-20"),
};

/** Um fundo VELHO — anterior ao marco. É o que torna a peça elegível. */
const FUNDO_VELHO = { createdAt: new Date("2026-08-10T12:00:00.000Z") };

function padrao() {
  vi.clearAllMocks();
  db.client.findMany.mockResolvedValue([{ id: "cityjobs", name: "CityJobs" }]);
  db.socialPost.findMany.mockResolvedValue([{ ...POST }]);
  db.socialPost.findUnique.mockResolvedValue({ id: POST.id, clientId: POST.clientId });
  db.socialPost.update.mockResolvedValue({});
  db.approvalRequest.findMany.mockResolvedValue([]); // ninguém aprovou nada
  db.mediaAsset.findFirst.mockResolvedValue(FUNDO_VELHO);
  db.mediaAsset.count.mockResolvedValue(0);
  db.deliverable.findUnique.mockResolvedValue({ content: ENTREGAVEL, type: "social" });
  db.activityEvent.create.mockResolvedValue({});
  renderizadorDisponivel.mockResolvedValue({ disponivel: true, caminho: "/chromium" });
  produzirArtesPendentes.mockResolvedValue({
    produzidas: 1, falhas: [], desistiram: [], semOrcamento: [],
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. A DIREÇÃO SAI DO ENTREGÁVEL — PELA LEGENDA, NUNCA PELA ORDEM
// ─────────────────────────────────────────────────────────────────────────────

describe("direcaoNoEntregavel", () => {
  it("acha a direção da peça certa casando a LEGENDA exata", () => {
    const r = direcaoNoEntregavel(LEGENDA, ENTREGAVEL, "social");
    expect(r).toEqual({ ok: true, direcao: DIRECAO });
  });

  it("legenda que não casa com nenhuma peça RECUSA — não pega a primeira", () => {
    const r = direcaoNoEntregavel("uma legenda que não está no entregável de jeito nenhum", ENTREGAVEL, "social");
    expect(r).toEqual({ ok: false, motivo: "legenda_nao_casa_no_entregavel" });
  });

  it("duas peças com a MESMA legenda não desempatam: recusa, nunca escolhe", () => {
    const ambiguo = [ENTREGAVEL, "", "**3. Repetida**", "- Formato: feed", `- Legenda: ${LEGENDA}`, "- Visual: outra coisa qualquer aqui"].join("\n");
    expect(direcaoNoEntregavel(LEGENDA, ambiguo, "social")).toEqual({
      ok: false, motivo: "legenda_nao_casa_no_entregavel",
    });
  });

  it("peça achada SEM linha Visual/Direção é `sem_direcao` — e não a legenda disfarçada", () => {
    const semVisual = ["**1. X**", "- Formato: feed", `- Legenda: ${LEGENDA}`].join("\n");
    expect(direcaoNoEntregavel(LEGENDA, semVisual, "social")).toEqual({
      ok: false, motivo: "sem_direcao_no_entregavel",
    });
  });

  it('"- Direção:" vale igual — é o mesmo campo com o rótulo das peças de design', () => {
    const comDirecao = ["**1. X**", "- Formato: feed", `- Legenda: ${LEGENDA}`, `- Direção: ${DIRECAO}`].join("\n");
    expect(direcaoNoEntregavel(LEGENDA, comDirecao, "social")).toEqual({ ok: true, direcao: DIRECAO });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. A LEITURA PURA — O NÚMERO E O CUSTO, SEM GRAVAR E SEM PAGAR
// ─────────────────────────────────────────────────────────────────────────────

describe("leitura pura (o padrão)", () => {
  beforeEach(padrao);

  it("mede a peça elegível, com custo, e NÃO grava nem paga", async () => {
    const r = await refazerComDirecao({ cliente: "CityJobs" });

    expect(r.situacao).toBe("so_medi");
    expect(r.elegiveis).toHaveLength(1);
    expect(r.elegiveis[0]!.direcao).toBe("lida_do_entregavel");
    expect(r.elegiveis[0]!.direcaoComeca).toContain("Plataforma da estação");
    expect(r.direcaoNoEntregavel).toEqual({ achou: 1, naoAchou: 0 });
    expect(r.custo.desteLoteUsd).toBeGreaterThan(0);
    expect(r.custo.fonte).toMatch(/NÃO é fatura/);

    // O que prova que foi leitura: nada escrito, nada produzido.
    expect(db.socialPost.update).not.toHaveBeenCalled();
    expect(produzirArtesPendentes).not.toHaveBeenCalled();
    expect(db.activityEvent.create).not.toHaveBeenCalled();
  });

  it("o relatório NUNCA carrega id de peça — ele é lido em log de CI", async () => {
    const r = await refazerComDirecao({ cliente: "CityJobs" });
    expect(JSON.stringify(r)).not.toContain("post-1");
  });

  it("banco fora do ar NÃO vira 'nada a refazer' silencioso", async () => {
    db.socialPost.findMany.mockRejectedValue(new Error("db caiu"));
    const r = await refazerComDirecao({ cliente: "CityJobs" });
    expect(r.elegiveis).toHaveLength(0);
    expect(r.veredito).toMatch(/NÃO quer dizer que não há peça/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. AS BARRADAS — CADA UMA COM MOTIVO, NENHUMA EM SILÊNCIO
// ─────────────────────────────────────────────────────────────────────────────

describe("o que NÃO é refeito", () => {
  beforeEach(padrao);

  it("peça APROVADA pelo cliente é barrada — a aprovação está presa ao post, não ao arquivo", async () => {
    db.approvalRequest.findMany.mockResolvedValue([{
      id: "card-1", clientId: "cityjobs",
      reviewedBy: "client:Dioli", reviewedAt: new Date("2026-08-14"),
      sourcePostIdsJson: JSON.stringify(["post-1"]),
    }]);

    const r = await refazerComDirecao({ cliente: "CityJobs", autor: "Dioli", motivo: "conserto", aplicar: true });

    expect(r.elegiveis).toHaveLength(0);
    expect(r.barradas[0]!.motivo).toBe("aprovada_pelo_cliente");
    expect(r.barradas[0]!.detalhe).toContain("Dioli");
    expect(produzirArtesPendentes).not.toHaveBeenCalled();
    expect(db.socialPost.update).not.toHaveBeenCalled();
  });

  it("carimbo da AGÊNCIA não é aprovação do cliente — a peça continua elegível", async () => {
    db.approvalRequest.findMany.mockResolvedValue([{
      id: "card-1", clientId: "cityjobs",
      reviewedBy: "equipe:alguem@dioli.com", reviewedAt: new Date("2026-08-14"),
      sourcePostIdsJson: JSON.stringify(["post-1"]),
    }]);
    const r = await refazerComDirecao({ cliente: "CityJobs" });
    expect(r.elegiveis).toHaveLength(1);
  });

  it("entregável SEM direção: barrada, e nenhuma imagem é paga por ela", async () => {
    db.deliverable.findUnique.mockResolvedValue({
      content: ["**1. X**", "- Formato: feed", `- Legenda: ${LEGENDA}`].join("\n"),
      type: "social",
    });
    const r = await refazerComDirecao({ cliente: "CityJobs" });
    expect(r.elegiveis).toHaveLength(0);
    expect(r.direcaoNoEntregavel).toEqual({ achou: 0, naoAchou: 1 });
    expect(r.barradas[0]!.motivo).toBe("sem_direcao_no_entregavel");
    expect(r.barradas[0]!.detalhe).toMatch(/fallback/);
  });

  it("peça sem entregável de origem é barrada — não se inventa direção", async () => {
    db.socialPost.findMany.mockResolvedValue([{ ...POST, deliverableId: null }]);
    const r = await refazerComDirecao({ cliente: "CityJobs" });
    expect(r.barradas[0]!.motivo).toBe("sem_entregavel_de_origem");
  });

  it("fundo mais NOVO que o marco = já refeita: não é paga de novo", async () => {
    db.mediaAsset.findFirst.mockResolvedValue({
      createdAt: new Date(MARCO_DA_DIRECAO_NA_IMAGEM.getTime() + 60_000),
    });
    const r = await refazerComDirecao({ cliente: "CityJobs" });
    expect(r.elegiveis).toHaveLength(0);
    expect(r.barradas[0]!.motivo).toBe("ja_refeita_com_direcao");
  });

  it("sem fundo guardado (a peça pode ser a FOTO REAL do cliente): barrada, fail-closed", async () => {
    db.mediaAsset.findFirst.mockResolvedValue(null);
    const r = await refazerComDirecao({ cliente: "CityJobs" });
    expect(r.barradas[0]!.motivo).toBe("sem_fundo_para_datar");
    expect(r.barradas[0]!.detalhe).toMatch(/FOTO REAL do cliente/);
  });

  it("pilar bloqueado continua bloqueado — a régua é a MESMA da produção", async () => {
    db.socialPost.findMany.mockResolvedValue([{ ...POST, pillar: "Salário aberto" }]);
    const r = await refazerComDirecao({ cliente: "CityJobs" });
    expect(r.elegiveis).toHaveLength(0);
    expect(r.barradas[0]!.motivo).toBe("nao_recebe_arte");
  });

  it("peça já PUBLICADA nem entra no universo — o que está no ar continua no ar", async () => {
    await refazerComDirecao({ cliente: "CityJobs" });
    const where = db.socialPost.findMany.mock.calls[0]![0].where;
    expect(where.status.in).toEqual(["draft", "scheduled", "approved"]);
    expect(where.mediaUrl).toEqual({ not: null });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. APLICAR — O BACKFILL E O LAÇO QUE JÁ EXISTIA
// ─────────────────────────────────────────────────────────────────────────────

describe("aplicar", () => {
  beforeEach(padrao);

  it("grava SÓ `artDirection` — data, status e legenda não são tocados", async () => {
    const r = await refazerComDirecao({ cliente: "CityJobs", autor: "Dioli", motivo: "conserto", aplicar: true });

    expect(db.socialPost.update).toHaveBeenCalledTimes(1);
    const escrita = db.socialPost.update.mock.calls[0]![0].data;
    expect(Object.keys(escrita)).toEqual(["artDirection"]);
    expect(escrita.artDirection).toBe(DIRECAO);
    expect(r.feito?.direcoesGravadas).toBe(1);
  });

  it("chama a rodada de arte que já existia, com a lista NOMEADA e o cliente junto", async () => {
    await refazerComDirecao({ cliente: "CityJobs", autor: "Dioli", motivo: "conserto", aplicar: true });
    expect(produzirArtesPendentes).toHaveBeenCalledWith({ clientId: "cityjobs", refazer: ["post-1"] });
  });

  it("sem autor ou sem motivo, não lê e não grava nada", async () => {
    const semAutor = await refazerComDirecao({ cliente: "CityJobs", motivo: "x", aplicar: true });
    expect(semAutor.situacao).toBe("sem_autor");
    const semMotivo = await refazerComDirecao({ cliente: "CityJobs", autor: "Dioli", aplicar: true });
    expect(semMotivo.situacao).toBe("sem_motivo");
    expect(db.socialPost.findMany).not.toHaveBeenCalled();
    expect(produzirArtesPendentes).not.toHaveBeenCalled();
  });

  it("sem navegador, o backfill nem acontece — não se grava por nada", async () => {
    renderizadorDisponivel.mockResolvedValue({ disponivel: false, caminho: null });
    const r = await refazerComDirecao({ cliente: "CityJobs", autor: "Dioli", motivo: "x", aplicar: true });
    expect(r.situacao).toBe("sem_renderizador");
    expect(db.socialPost.update).not.toHaveBeenCalled();
    expect(produzirArtesPendentes).not.toHaveBeenCalled();
  });

  it("nome ambíguo RECUSA em vez de escolher — refazer para o cliente errado gasta o dinheiro dele", async () => {
    db.client.findMany.mockResolvedValue([{ id: "a", name: "City Jobs SP" }, { id: "b", name: "CityJobs RJ" }]);
    const r = await refazerComDirecao({ cliente: "City", autor: "Dioli", motivo: "x", aplicar: true });
    expect(r.situacao).toBe("nome_ambiguo");
    expect(produzirArtesPendentes).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. O LOTE — TETO DE TEMPO, E O PLACAR DIZENDO QUANTAS FALTAM
// ─────────────────────────────────────────────────────────────────────────────

describe("o lote", () => {
  beforeEach(() => {
    padrao();
    // Dez peças, como o estoque real do CityJobs.
    const dez = Array.from({ length: 10 }, (_, i) => ({
      ...POST, id: `post-${i + 1}`,
      caption: i === 0 ? LEGENDA : `Legenda número ${i + 1}, longa o suficiente para virar post de verdade.`,
    }));
    db.socialPost.findMany.mockResolvedValue(dez);
    db.socialPost.findUnique.mockImplementation(({ where }: { where: { id: string } }) =>
      Promise.resolve({ id: where.id, clientId: "cityjobs" }));
    // Cada peça acha a própria direção: entregável com todas as legendas.
    db.deliverable.findUnique.mockResolvedValue({
      content: dez.map((p, i) => [
        `**${i + 1}. Peça ${i + 1}**`, "- Formato: feed", "- Pilar: Bastidor da região",
        `- Legenda: ${p.caption}`, `- Visual: ${DIRECAO}`,
      ].join("\n")).join("\n\n"),
      type: "social",
    });
  });

  it("dez elegíveis, lote padrão pequeno, e o placar diz quantas faltam", async () => {
    const r = await refazerComDirecao({ cliente: "CityJobs" });
    expect(r.elegiveis).toHaveLength(10);
    expect(r.lote.efetivo).toBe(LOTE_PADRAO);
    expect(r.faltamDepoisDesteLote).toBe(10 - LOTE_PADRAO);
    // O custo do lote é MENOR que o de todas — senão o número que o operador lê
    // antes de apertar não é o número que ele vai pagar.
    expect(r.custo.desteLoteUsd).toBeLessThan(r.custo.deTodasAsElegiveisUsd);
  });

  it("lote pedido acima do teto é APARADO — não existe passada de 10 numa requisição", async () => {
    const r = await refazerComDirecao({ cliente: "CityJobs", lote: 10 });
    expect(r.lote.efetivo).toBe(LOTE_MAXIMO);
  });

  it("aplicando, só as peças do lote entram na rodada", async () => {
    await refazerComDirecao({ cliente: "CityJobs", autor: "Dioli", motivo: "x", aplicar: true });
    const chamada = produzirArtesPendentes.mock.calls[0]![0];
    expect(chamada.refazer).toHaveLength(LOTE_PADRAO);
    expect(db.socialPost.update).toHaveBeenCalledTimes(LOTE_PADRAO);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. A FONTE — O QUE ESTE MÓDULO NÃO PODE CONTER
// ─────────────────────────────────────────────────────────────────────────────

describe("a fonte do refazimento", () => {
  const corpo = readFileSync(join(RAIZ, "lib/agency/execution/refazer-com-direcao.ts"), "utf8");
  const rota = readFileSync(join(RAIZ, "app/api/admin/refazer-com-direcao/route.ts"), "utf8");

  it("não lê o interruptor de publicação e não chama plataforma nenhuma", () => {
    for (const fonte of [corpo, rota]) {
      expect(fonte).not.toContain("PUBLICACAO_ORGANICA");
      expect(fonte).not.toMatch(/publishPost|integrations\/meta\/client|graph\.facebook/);
    }
  });

  it("nenhuma ESCRITA de `scheduledFor`, `status` ou `caption`", () => {
    // A régua é sobre ESCRITA, não sobre menção: `status` e `scheduledFor`
    // aparecem legitimamente no `where` e no `orderBy` da LEITURA, e proibir a
    // palavra faria o teste brigar com o filtro em vez de com o risco.
    //
    // O risco é um `data:` que carregue qualquer um dos três. A peça é a mesma;
    // muda o pixel — e mexer na data marcada por dentro de um conserto de arte
    // seria a agência remarcando o calendário do cliente sem ele pedir.
    // `[^}]*` já atravessa quebra de linha — nenhum flag extra é preciso.
    expect(corpo).not.toMatch(/data:\s*\{[^}]*\b(scheduledFor|status|caption)\b/);
    // E o único `data:` que existe escreve exatamente um campo.
    expect(corpo).toMatch(/data:\s*\{\s*artDirection:/);
  });

  it("não reimplementa aprovação: usa a leitura da casa", () => {
    expect(corpo).toContain('from "@/lib/agency/esteira/aprovacao-da-peca"');
    expect(corpo).not.toContain("STATUS_APROVADO =");
  });

  it("não reimplementa o leitor do entregável: usa `extrairPecas`", () => {
    expect(corpo).toContain('from "@/lib/agency/esteira/publicacao"');
    expect(corpo).toContain("extrairPecas(");
  });

  it("não compõe nada: nenhuma chamada de molde neste módulo", () => {
    expect(corpo).not.toMatch(/comporComMolde|montarPeca|guardarArquivo|generateDesign/);
  });

  it("a rota é POST, exige Bearer e devolve 503 sem segredo", () => {
    expect(rota).toContain("export async function POST");
    expect(rota).not.toMatch(/export async function GET/);
    expect(rota).toContain("segredoConfere");
    expect(rota).toContain("status: 503");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. A RODADA DE ARTE ACEITA A LISTA NOMEADA — E LISTA VAZIA NÃO É "TUDO"
// ─────────────────────────────────────────────────────────────────────────────

describe("`refazer` em `produzirArtesPendentes`", () => {
  const fonte = readFileSync(join(RAIZ, "lib/agency/execution/artes.ts"), "utf8");

  it("a seleção troca `mediaUrl: null` por `id: { in: ... }` — e só isso", () => {
    expect(fonte).toContain("refazendo ? { id: { in: recorte.refazer! } } : { mediaUrl: null }");
  });

  it("`refazer: []` é 'refaça nada', nunca a rodada global", () => {
    // O teste é `!== undefined`, e não `.length > 0`: com `.length > 0` uma lista
    // vazia cairia na seleção de sempre e gastaria imagem paga de quem ninguém
    // autorizou.
    expect(fonte).toContain("const refazendo = recorte.refazer !== undefined;");
  });

  it("o `mediaUrl` só é reescrito no fim do laço — a arte velha sobrevive à falha", () => {
    // Se esta ordem mudar, uma peça pode ficar SEM arte por causa de uma falha
    // de geração, que é destruir trabalho entregue para tentar melhorá-lo.
    const posicaoDoUpdate = fonte.indexOf("data: { mediaUrl: `/api/media/${guardado.arquivo.id}`");
    const posicaoDoPortao = fonte.indexOf("const portao = await conferirFundoDaPeca(");
    expect(posicaoDoPortao).toBeGreaterThan(0);
    expect(posicaoDoUpdate).toBeGreaterThan(posicaoDoPortao);
  });
});

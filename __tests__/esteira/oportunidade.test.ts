// ─── O RADAR DE OPORTUNIDADES: as duas metades que precisam estar certas ─────
//
// Este arquivo prova DUAS coisas, e as duas são a mesma promessa vista de lados
// opostos:
//
//   1. A DEDUP PEGA o duplicado. O mesmo projeto chega pelo e-mail de alerta e,
//      minutos depois, alguém cola o link no painel. Se as duas entradas virarem
//      duas linhas, a agência manda duas propostas para o mesmo cliente — que é
//      como um freelancer perde reputação no marketplace.
//   2. A DEDUP NÃO JUNTA o que é diferente. Uma dedup agressiva demais é PIOR
//      que dedup nenhuma: ela descarta em silêncio uma oportunidade real, e
//      ninguém nunca fica sabendo que ela existiu.
//
//   3. O ORÇAMENTO é extraído quando o anúncio declara, e fica NULO quando não
//      declara. Um orçamento inventado aqui vira proposta enviada com o preço
//      errado — e esta casa roda 100% IA, sem ninguém conferindo antes de sair.

import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  oportunidade: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
}));
vi.mock("@/lib/db/client", () => ({ prisma: db }));

import {
  impressaoDeTexto,
  normalizarParaImpressao,
  extrairDeTexto,
  extrairOrcamento,
  extrairPrazo,
  registrarOportunidade,
  detectarPlataforma,
  normalizarUrl,
  TEXTO_MAX_CHARS,
} from "@/lib/agency/comercial/oportunidade";

const ANUNCIO = `Preciso de gestor de tráfego para e-commerce de moda

Tenho uma loja de roupas femininas em Belo Horizonte e quero começar a anunciar
no Instagram e no Google. Orçamento de R$ 1.200 por mês.
Prazo: 15 dias para começar.`;

beforeEach(() => {
  vi.clearAllMocks();
  db.oportunidade.findUnique.mockResolvedValue(null);
  db.oportunidade.findFirst.mockResolvedValue(null);
  db.oportunidade.create.mockImplementation(async (a: { data: Record<string, unknown> }) => ({
    id: "opo_novo",
    ...a.data,
    createdAt: new Date("2026-08-05T12:00:00Z"),
  }));
});

// ─────────────────────────────────────────────────────────────────────────────
// METADE 1 · A dedup PEGA o duplicado
// ─────────────────────────────────────────────────────────────────────────────

describe("a dedup pega o duplicado", () => {
  it("o mesmo texto com espaçamento diferente tem a MESMA impressão digital", () => {
    // O caso real: o e-mail de alerta vem com quebra de linha em outro lugar, e
    // o que a pessoa cola do site vem com espaço duplo e tabulação.
    const a = "Preciso de gestor de tráfego para e-commerce de moda";
    const b = "  Preciso   de gestor\tde   tráfego\n\npara e-commerce de moda  ";
    expect(impressaoDeTexto(a)).toBe(impressaoDeTexto(b));
  });

  it("caixa, acento e pontuação também não criam oportunidade nova", () => {
    // Copiar-colar entre cliente de e-mail e navegador embaralha as três coisas.
    const a = "Logotipo para Pet Shop — urgente!";
    const b = "logotipo para pet shop - urgente";
    const c = "LOGOTIPO PARA PET SHOP, URGENTE.";
    expect(impressaoDeTexto(a)).toBe(impressaoDeTexto(b));
    expect(impressaoDeTexto(b)).toBe(impressaoDeTexto(c));
  });

  it("a impressão é estável entre chamadas — não depende de hora nem de sorte", () => {
    expect(impressaoDeTexto(ANUNCIO)).toBe(impressaoDeTexto(ANUNCIO));
    expect(impressaoDeTexto(ANUNCIO)).toHaveLength(64); // sha-256 em hex
  });

  it("a normalização derruba o que não é conteúdo e preserva o que é", () => {
    expect(normalizarParaImpressao("  Olá,   MUNDO! ")).toBe("ola mundo");
  });

  it("texto já registrado devolve a existente com jaExistia, sem criar de novo", async () => {
    // Esta é a prova de fim a fim: a MESMA vaga entrando pela segunda porta.
    db.oportunidade.findUnique.mockResolvedValue({ id: "opo_1", titulo: "já estava aqui" });

    const r = await registrarOportunidade({
      workspaceId: "ws1",
      porta: "colar",
      texto: `   ${ANUNCIO.toUpperCase()}   `,
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.jaExistia).toBe(true);
    expect(r.oportunidade.id).toBe("opo_1");
    expect(db.oportunidade.create, "não pode ter criado uma segunda linha").not.toHaveBeenCalled();
  });

  it("as duas PORTAS chegam na mesma impressão digital", async () => {
    // O e-mail e a colagem carregam o mesmo anúncio com formatação diferente.
    await registrarOportunidade({ workspaceId: "ws1", porta: "email", texto: ANUNCIO });
    const impressaoDoEmail = db.oportunidade.create.mock.calls[0]![0].data.impressaoDigital;

    vi.clearAllMocks();
    db.oportunidade.findUnique.mockResolvedValue(null);
    db.oportunidade.findFirst.mockResolvedValue(null);
    db.oportunidade.create.mockImplementation(async (a: { data: Record<string, unknown> }) => ({ id: "x", ...a.data }));

    await registrarOportunidade({
      workspaceId: "ws1",
      porta: "colar",
      texto: ANUNCIO.replace(/\n/g, "  ").replace(/ {2,}/g, "   "),
    });
    const impressaoDaColagem = db.oportunidade.create.mock.calls[0]![0].data.impressaoDigital;

    expect(impressaoDaColagem).toBe(impressaoDoEmail);
  });

  it("mesmo LINK com rastreio diferente é reconhecido como a mesma vaga", async () => {
    // O link do e-mail vem carimbado com utm_*; o do site, limpo. Sem isso, o
    // mesmo projeto entraria duas vezes só por causa do carimbo.
    const limpo = normalizarUrl("https://www.workana.com/job/gestor-trafego-123");
    const carimbado = normalizarUrl("https://www.workana.com/job/gestor-trafego-123/?utm_source=email&utm_campaign=alerta");
    expect(carimbado).toBe(limpo);

    // Texto novo (impressão diferente), mas link já conhecido → não duplica.
    db.oportunidade.findFirst.mockResolvedValue({ id: "opo_link", titulo: "veio pelo e-mail" });
    const r = await registrarOportunidade({
      workspaceId: "ws1",
      porta: "colar",
      texto: "Texto totalmente diferente colado do site da vaga",
      url: "https://www.workana.com/job/gestor-trafego-123?utm_source=email",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.jaExistia).toBe(true);
    expect(db.oportunidade.create).not.toHaveBeenCalled();
  });

  it("a CORRIDA entre as duas portas não vira linha duplicada", async () => {
    // A consulta não achou nada (as duas chegaram no mesmo instante), mas o
    // banco recusou a segunda pela constraint única. O certo é devolver a que o
    // outro criou — não estourar erro na cara de quem colou o link.
    db.oportunidade.create.mockRejectedValue(Object.assign(new Error("unique"), { code: "P2002" }));
    db.oportunidade.findUnique
      .mockResolvedValueOnce(null) // a checagem prévia: ainda não existia
      .mockResolvedValueOnce({ id: "opo_do_outro" }); // depois da corrida: existe

    const r = await registrarOportunidade({ workspaceId: "ws1", porta: "email", texto: ANUNCIO });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.jaExistia).toBe(true);
    expect(r.oportunidade.id).toBe("opo_do_outro");
  });

  it("a dedup é POR WORKSPACE — outro inquilino olhando a mesma vaga pública registra a dele", async () => {
    await registrarOportunidade({ workspaceId: "ws2", porta: "colar", texto: ANUNCIO });
    const where = db.oportunidade.findUnique.mock.calls[0]![0].where;
    expect(where.workspaceId_impressaoDigital.workspaceId).toBe("ws2");
    expect(db.oportunidade.create.mock.calls[0]![0].data.workspaceId).toBe("ws2");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// METADE 2 · A dedup NÃO junta o que é diferente
// ─────────────────────────────────────────────────────────────────────────────

describe("a dedup NÃO junta duas oportunidades diferentes", () => {
  it("dois anúncios distintos têm impressões distintas", () => {
    const a = "Preciso de gestor de tráfego para e-commerce de moda";
    const b = "Preciso de gestor de tráfego para e-commerce de calçados";
    expect(impressaoDeTexto(a)).not.toBe(impressaoDeTexto(b));
  });

  it("anúncios quase idênticos, diferentes só no orçamento, continuam separados", () => {
    // Caso real e traiçoeiro: o mesmo anunciante republica a vaga com outro
    // valor. É oportunidade NOVA — juntar as duas some com a segunda.
    const a = "Social media para restaurante. Orçamento de R$ 800 por mês.";
    const b = "Social media para restaurante. Orçamento de R$ 1.500 por mês.";
    expect(impressaoDeTexto(a)).not.toBe(impressaoDeTexto(b));
  });

  it("uma palavra a mais já é outra impressão", () => {
    expect(impressaoDeTexto("Preciso de site")).not.toBe(impressaoDeTexto("Preciso de site novo"));
  });

  it("texto diferente E sem link conhecido cria linha nova", async () => {
    const r = await registrarOportunidade({
      workspaceId: "ws1",
      porta: "colar",
      texto: "Landing page para clínica odontológica em Curitiba",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.jaExistia).toBe(false);
    expect(db.oportunidade.create).toHaveBeenCalledTimes(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// METADE 3 · O orçamento: extraído quando existe, NULO quando não existe
// ─────────────────────────────────────────────────────────────────────────────

describe("o orçamento é extraído quando o anúncio declara", () => {
  it("lê 'R$ 1.200' como mil e duzentos, não como um real e vinte", () => {
    // O ponto é separador de MILHAR em pt-BR. Ler ao contrário transforma um
    // projeto de R$ 1.200 num de R$ 1.
    expect(extrairOrcamento("Orçamento de R$ 1.200 por mês.")).toBe(1200);
  });

  it("lê valores com centavos, sem cifrão colado e com espaço", () => {
    expect(extrairOrcamento("valor: R$ 2.500,00")).toBe(2500);
    expect(extrairOrcamento("pago R$850 no projeto")).toBe(850);
    expect(extrairOrcamento("R$ 12.000,50 no total")).toBe(12001);
  });

  it("entende 'até 2 mil' e 'até R$ 2 mil'", () => {
    expect(extrairOrcamento("Posso pagar até 2 mil reais")).toBe(2000);
    expect(extrairOrcamento("orçamento até R$ 2 mil")).toBe(2000);
    expect(extrairOrcamento("no máximo R$ 3.000")).toBe(3000);
  });

  it("em FAIXA grava o PISO, nunca o teto", () => {
    // A coluna guarda um inteiro só. Escolher o teto contaria à agência uma
    // história melhor do que a que o anúncio contou — e é assim que nasce
    // proposta cara e lead morto.
    expect(extrairOrcamento("de R$ 1.000 a R$ 2.000")).toBe(1000);
    expect(extrairOrcamento("entre R$ 500 e R$ 1.500 por mês")).toBe(500);
    expect(extrairOrcamento("R$ 2 mil a R$ 5 mil")).toBe(2000);
  });

  it("aceita 'mil reais' sem cifrão", () => {
    expect(extrairOrcamento("tenho 3 mil reais para investir")).toBe(3000);
    expect(extrairOrcamento("1.500 reais")).toBe(1500);
  });

  it("aceita rótulo seguido de 'mil'", () => {
    expect(extrairOrcamento("Orçamento: 4 mil")).toBe(4000);
    expect(extrairOrcamento("budget de 2 mil")).toBe(2000);
  });
});

describe("o orçamento fica NULO quando o anúncio não declara", () => {
  it("anúncio sem valor nenhum volta null", () => {
    expect(extrairOrcamento("Preciso de um logotipo para minha padaria.")).toBeNull();
  });

  it("'a combinar' não é valor", () => {
    expect(extrairOrcamento("Orçamento a combinar")).toBeNull();
    expect(extrairOrcamento("valor: a negociar")).toBeNull();
  });

  it("número que não é dinheiro NÃO vira orçamento", () => {
    // O erro que faria a agência propor R$ 12 por um trabalho: confundir
    // quantidade com preço.
    expect(extrairOrcamento("Quero 12 posts por mês e 3 stories por semana")).toBeNull();
    expect(extrairOrcamento("Somos 5 sócios e temos 2 lojas")).toBeNull();
  });

  it("moeda estrangeira fica NULA — 500 dólares não são 500 reais", () => {
    // O Upwork anuncia em dólar. A cotação não está no anúncio, então converter
    // seria inventar. Nulo é a verdade.
    expect(extrairOrcamento("Budget: $500 USD")).toBeNull();
    expect(extrairOrcamento("Fixed price 1,200 USD")).toBeNull();
  });

  it("na ingestão, o campo chega ao banco como null — nunca como 0", () => {
    // "0" seria lido como "o cliente ofereceu zero". Nulo é "o cliente não
    // disse". A diferença é o que separa uma recusa de uma pergunta.
    const campos = extrairDeTexto("Preciso de um logotipo para minha padaria.");
    expect(campos.orcamentoInformado).toBeNull();
    expect(campos.orcamentoInformado).not.toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// O resto da extração: só o que está escrito
// ─────────────────────────────────────────────────────────────────────────────

describe("a extração não inventa o que não está escrito", () => {
  it("tira título, orçamento e prazo do anúncio completo", () => {
    const c = extrairDeTexto(ANUNCIO);
    expect(c.titulo).toBe("Preciso de gestor de tráfego para e-commerce de moda");
    expect(c.orcamentoInformado).toBe(1200);
    expect(c.prazoInformado).toBe("15 dias para começar");
    expect(c.descricao).toContain("loja de roupas femininas");
  });

  it("usa o rótulo 'Assunto:' do e-mail de alerta como título", () => {
    const c = extrairDeTexto(
      "De: alertas@workana.com\nAssunto: Novo projeto: Identidade visual para cafeteria\n\nDetalhes: quer logo e cardápio.",
    );
    expect(c.titulo).toBe("Novo projeto: Identidade visual para cafeteria");
  });

  it("prazo não declarado volta NULO — 'urgente' não é prazo", () => {
    // Converter "urgente" em data seria inventar precisão que o anúncio não tem
    // — e é com precisão falsa que a agência promete o que não entrega.
    expect(extrairPrazo("Projeto urgente, preciso o quanto antes")).toBeNull();
    expect(extrairDeTexto("Quero um site bonito").prazoInformado).toBeNull();
  });

  it("prazo declarado sai COMO ESCRITO, não como data calculada", () => {
    expect(extrairPrazo("entrega em 7 dias")).toBe("7 dias");
    expect(extrairPrazo("Prazo: 10 dias úteis")).toBe("10 dias úteis");
    expect(extrairPrazo("preciso até 20/08")).toBe("20/08");
  });

  it("categoria só quando rotulada", () => {
    expect(extrairDeTexto("Categoria: Design e Multimídia\nQuero um logo").categoria).toBe("Design e Multimídia");
    expect(extrairDeTexto("Quero um logo bonito de design").categoria).toBeNull();
  });
});

describe("a plataforma é deduzida, nunca chutada", () => {
  it("reconhece as seis casas pelo link e pelo corpo", () => {
    expect(detectarPlataforma("", "https://www.99freelas.com.br/project/123")).toBe("99freelas");
    expect(detectarPlataforma("Enviado pela Workana")).toBe("workana");
    expect(detectarPlataforma("", "https://www.upwork.com/jobs/x")).toBe("upwork");
    expect(detectarPlataforma("", "https://www.peopleperhour.com/freelance-job/x")).toBe("peopleperhour");
    expect(detectarPlataforma("", "https://www.freelancer.com.br/projects/x")).toBe("freelancer");
    expect(detectarPlataforma("", "https://www.guru.com/jobs/x")).toBe("guru");
  });

  it("sem pista nenhuma vira 'desconhecida' — não a plataforma mais provável", () => {
    expect(detectarPlataforma("Preciso de um social media")).toBe("desconhecida");
  });

  it("a palavra 'guru' solta no texto NÃO vira plataforma", () => {
    // "guru do tráfego" aparece em anúncio o tempo todo. Origem errada estraga
    // qualquer leitura de "de onde vêm nossos leads".
    expect(detectarPlataforma("Procuro um guru do tráfego pago")).toBe("desconhecida");
  });
});

describe("as travas da ingestão", () => {
  it("texto vazio não vira oportunidade", async () => {
    const r = await registrarOportunidade({ workspaceId: "ws1", porta: "colar", texto: "   " });
    expect(r.ok).toBe(false);
    expect(db.oportunidade.create).not.toHaveBeenCalled();
  });

  it("texto absurdamente grande é recusado antes de tocar o banco", async () => {
    // O SQLite mora no mesmo volume dos backups: corpo sem teto é como se enche
    // um volume de produção.
    const r = await registrarOportunidade({
      workspaceId: "ws1",
      porta: "email",
      texto: "x".repeat(TEXTO_MAX_CHARS + 1),
    });
    expect(r.ok).toBe(false);
    expect(db.oportunidade.create).not.toHaveBeenCalled();
  });

  it("URL com protocolo perigoso é descartada, não guardada", async () => {
    // Esse link vira um <a> clicável no painel da agência.
    expect(normalizarUrl("javascript:alert(1)")).toBeNull();
    expect(normalizarUrl("data:text/html,<script>x</script>")).toBeNull();
    await registrarOportunidade({
      workspaceId: "ws1",
      porta: "colar",
      texto: "Projeto qualquer",
      url: "javascript:alert(1)",
    });
    expect(db.oportunidade.create.mock.calls[0]![0].data.urlExterna).toBeNull();
  });

  it("o texto original é guardado inteiro — é a prova do que foi lido", async () => {
    await registrarOportunidade({ workspaceId: "ws1", porta: "colar", texto: ANUNCIO });
    expect(db.oportunidade.create.mock.calls[0]![0].data.textoBruto).toBe(ANUNCIO.trim());
  });

  it("nasce com status 'nova' e SEM nota — quem ingere não avalia", async () => {
    const r = await registrarOportunidade({ workspaceId: "ws1", porta: "colar", texto: ANUNCIO });
    if (!r.ok) return;
    expect(db.oportunidade.create.mock.calls[0]![0].data.status).toBe("nova");
    expect(db.oportunidade.create.mock.calls[0]![0].data.nota).toBeUndefined();
    expect(r.oportunidade.nota ?? null).toBeNull();
  });
});

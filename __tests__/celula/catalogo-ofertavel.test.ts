// DECISÃO 5 DO CEO — o catálogo é DERIVADO da capacidade real, não digitado.
//
// O teste mais importante deste arquivo não é nenhum dos que checam quem está
// dentro ou fora hoje. É o último: o que prova que a lista se MEXE sozinha
// quando a capacidade muda. Um catálogo que acerta a lista de hoje e não
// reage amanhã é uma lista escrita com passos extras.

import { describe, it, expect } from "vitest";
import {
  avaliarServico,
  servicosOfertaveis,
  montarItemDeProposta,
  SERVICOS_DA_CELULA,
} from "@/lib/agency/celula/catalogo-ofertavel";
import { CAPACIDADES, conferirOferta } from "@/lib/agency/capacidade-de-producao";

const AUTOMATICO = { modoAutomatico: true };
const SUPERVISIONADO = { modoAutomatico: false };

describe("o caso limpo — social media, que a casa produz de verdade", () => {
  it("peças de social media são ofertáveis, inclusive no automático", () => {
    const r = avaliarServico("social-media-pecas", AUTOMATICO);
    expect(r.ofertavel).toBe(true);
  });

  it("e o item de proposta NASCE, com as capacidades que o sustentam", () => {
    const m = montarItemDeProposta("social-media-pecas", AUTOMATICO);
    expect(m.ok).toBe(true);
    if (m.ok) {
      expect(m.item.sustentadoPor).toContain("arte-estatica-jpeg");
      expect(m.item.sustentadoPor).toContain("texto-de-marca");
    }
  });
});

describe("o que o CEO mandou suspender — e o motivo tem de ser o CERTO", () => {
  it("site NÃO é ofertável, e a recusa diz que falta MOTOR, não que faltou preencher campo", () => {
    const r = avaliarServico("site-institucional", AUTOMATICO);
    expect(r.ofertavel).toBe(false);
    if (!r.ofertavel) {
      expect(r.regra).toBe("sem_capacidade_de_producao");
      // A distinção que motivou acrescentar a capacidade ao mapa: o motivo
      // precisa falar de construir site, não de declaração ausente.
      expect(r.motivo).toMatch(/construir site/i);
      expect(r.motivo).not.toMatch(/não declara nenhuma capacidade/i);
    }
  });

  it("branding NÃO é ofertável", () => {
    const r = avaliarServico("branding-identidade", AUTOMATICO);
    expect(r.ofertavel).toBe(false);
    if (!r.ofertavel) expect(r.regra).toBe("sem_capacidade_de_producao");
  });

  it("vídeo com legenda animada NÃO é ofertável — falta a legenda, não a edição", () => {
    const r = avaliarServico("video-com-legenda-animada", AUTOMATICO);
    expect(r.ofertavel).toBe(false);
    if (!r.ofertavel) expect(r.motivo).toMatch(/legenda/i);
  });
});

describe("os DOIS freios são diferentes, e colapsá-los perderia informação", () => {
  it("edição de vídeo TEM motor: barrada no automático, liberada no supervisionado", () => {
    const auto = avaliarServico("video-edicao-de-bruto", AUTOMATICO);
    expect(auto.ofertavel).toBe(false);
    if (!auto.ofertavel) expect(auto.regra).toBe("exige_decisao_supervisionada");

    const sup = avaliarServico("video-edicao-de-bruto", SUPERVISIONADO);
    expect(sup.ofertavel).toBe(true);
  });

  it("branding continua barrado ATÉ no supervisionado — falta motor, e supervisão não fabrica motor", () => {
    const sup = avaliarServico("branding-identidade", SUPERVISIONADO);
    expect(sup.ofertavel).toBe(false);
    if (!sup.ofertavel) expect(sup.regra).toBe("sem_capacidade_de_producao");
  });
});

describe('"não pode NEM SER MONTADO em proposta"', () => {
  it("montarItemDeProposta RECUSA todo serviço não ofertável", () => {
    for (const id of ["site-institucional", "branding-identidade", "video-com-legenda-animada"]) {
      const m = montarItemDeProposta(id, AUTOMATICO);
      expect(m.ok, `${id} não pode ser montado`).toBe(false);
    }
  });

  it("serviço desconhecido é indisponível, nunca 'deve ser novo'", () => {
    const m = montarItemDeProposta("consultoria-de-tarot", AUTOMATICO);
    expect(m.ok).toBe(false);
    if (!m.ok) expect(m.regra).toBe("servico_desconhecido");
  });
});

describe("os suspensos NÃO foram omitidos do catálogo — omitir seria a lista escrita por subtração", () => {
  it("site, branding e vídeo estão declarados, e são recusados pela régua", () => {
    const ids = SERVICOS_DA_CELULA.map((s) => s.id);
    expect(ids).toContain("site-institucional");
    expect(ids).toContain("branding-identidade");
    expect(ids).toContain("video-com-legenda-animada");
  });
});

describe("🔴 A PROVA DE QUE É DERIVADO — o teste que separa mecanismo de lista", () => {
  it("se a capacidade de logotipo GANHAR ponto de produção, branding vira ofertável sozinho", () => {
    const antes = avaliarServico("branding-identidade", SUPERVISIONADO);
    expect(antes.ofertavel).toBe(false);

    const original = CAPACIDADES["logotipo-de-cliente"].ponto;
    try {
      // Ligamos o motor que não existe. Nenhuma linha de catalogo-ofertavel.ts
      // foi tocada — se a lista fosse escrita, isto não mudaria nada.
      CAPACIDADES["logotipo-de-cliente"].ponto = {
        arquivo: "lib/agency/design/logotipo.ts",
        simbolo: "gerarLogotipo",
      };
      const depois = avaliarServico("branding-identidade", SUPERVISIONADO);
      expect(depois.ofertavel, "branding tem de abrir sozinho quando o motor existe").toBe(true);
    } finally {
      CAPACIDADES["logotipo-de-cliente"].ponto = original;
    }

    // e volta a fechar sozinho
    expect(avaliarServico("branding-identidade", SUPERVISIONADO).ofertavel).toBe(false);
  });

  it("se o motor de arte QUEBRAR, social media fecha sozinho — o inverso também vale", () => {
    expect(avaliarServico("social-media-pecas", AUTOMATICO).ofertavel).toBe(true);

    const original = CAPACIDADES["arte-estatica-jpeg"].ponto;
    try {
      CAPACIDADES["arte-estatica-jpeg"].ponto = null;
      expect(avaliarServico("social-media-pecas", AUTOMATICO).ofertavel).toBe(false);
      // e o item deixa de poder ser montado
      expect(montarItemDeProposta("social-media-pecas", AUTOMATICO).ok).toBe(false);
    } finally {
      CAPACIDADES["arte-estatica-jpeg"].ponto = original;
    }
  });
});

describe("a lista derivada", () => {
  it("no automático sai só o que tem motor E não exige supervisão", () => {
    const ids = servicosOfertaveis(AUTOMATICO).map((s) => s.id);
    expect(ids).toContain("social-media-pecas");
    expect(ids).not.toContain("site-institucional");
    expect(ids).not.toContain("branding-identidade");
    expect(ids).not.toContain("video-edicao-de-bruto");
  });

  it("nenhum serviço ofertável depende de capacidade ausente — conferido contra a fonte", () => {
    for (const s of servicosOfertaveis(AUTOMATICO)) {
      expect(conferirOferta({ requer: s.requer, textos: s.textos }).vendavel, s.id).toBe(true);
    }
  });
});

describe("🔴 as duas guardas que SOBREVIVERAM à primeira mutação — furo dos testes, não do código", () => {
  // A mutação D5-M2 e D5-M3 continuaram verdes na primeira rodada porque
  // NENHUM serviço do catálogo exercita esses dois caminhos: todos declaram
  // capacidade, e nenhum promete no texto algo que não declarou. As guardas
  // existiam e estavam certas — o que faltava era teste que as tocasse.
  //
  // Elas moram em `conferirOferta`, que é a quem o catálogo delega. Testar ali
  // é testar a trava que protege o catálogo, não outra coisa: `avaliarServico`
  // não tem caminho próprio de decisão, ele repassa.

  it("oferta que NÃO declara capacidade nenhuma é recusada — fail closed", () => {
    const v = conferirOferta({ requer: [], textos: ["fazemos o que você precisar"] });
    expect(v.vendavel).toBe(false);
    expect(v.motivo).toMatch(/não declara nenhuma capacidade/i);
  });

  it("PROMETER site no texto exige a capacidade de site, mesmo declarando só o que a casa tem", () => {
    // O caso real: alguém monta um item de social media — que a casa produz —
    // e escreve na proposta "e ainda entregamos o site". Declarar pouco não
    // apaga o que está na tela do comprador.
    const v = conferirOferta({
      requer: ["arte-estatica-jpeg", "texto-de-marca"],
      textos: ["pacote de posts e ainda montamos o seu site institucional"],
    });
    expect(v.vendavel, "promessa de site por escrito tem de derrubar a oferta").toBe(false);
    expect(v.faltando).toContain("site-institucional");
  });

  it("metade gêmea: o MESMO item sem a promessa de site continua vendável", () => {
    const v = conferirOferta({
      requer: ["arte-estatica-jpeg", "texto-de-marca"],
      textos: ["pacote de posts para o feed"],
    });
    expect(v.vendavel).toBe(true);
  });
});

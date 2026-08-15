// O CHIP DE BENEFÍCIO E A FAIXA DE CHAMADA — as duas metades, juntas.
//
// ── O PROBLEMA, MEDIDO EM 15/08/2026 ────────────────────────────────────────
//
// **(a) Faltava o slot.** As peças que o CEO produziu à mão para o CityJobs são
// logo em quadro + selo de região + TRÊS CHIPS com ícone + FAIXA "SIGA O CITY
// JOBS". `PecaDoMolde` ia até `apoio`, e `comporComMolde` sequer passava
// `apoio`. A peça dele era **improduzível pela própria esteira** — que é a
// explicação de por que a esteira nunca chegaria no padrão que ele atingiu
// sozinho.
//
// **(b) E se tivesse, o portão barraria.** Medido contra legenda auditada real,
// `travaDeTextoNaArte` reprova 6 de 8 chips e 3 de 4 chamadas desse estilo. Não
// é defeito da trava: é estrutural. Ela exige TRECHO LITERAL DA LEGENDA, e chip
// não é trecho de legenda — chip afirma o que a MARCA é.
//
// ⚠️ **A ordem é obrigatória e este arquivo a trava:** slot sem trava faria o
// portão barrar exatamente a peça que se quer produzir, e é assim que alguém
// desliga o portão. Slot e trava entram juntos ou nenhum entra.

import { describe, it, expect } from "vitest";
import {
  travaDeRotuloDeBeneficio, travaDeChamadaNaArte, chamadaDaMarca,
  travaDeTextoNaArte, FORMA_DO_BENEFICIO, VERBOS_DE_CHAMADA,
} from "@/lib/agency/design/trava-de-texto";
import { moldeDoCliente, montarHtmlDaPeca, textosDaPeca } from "@/lib/agency/design/molde";
import { montarPeca } from "@/lib/agency/design/peca";

/** A ficha de marca do CityJobs como o dono dela a declararia — a fonte do
 *  lastro. Vem de `BrandBrain.purposeAndPromise` + tagline + `artLabelsJson`. */
const FICHA_CITYJOBS =
  "Plataforma de vagas do Alto Tietê: vaga real e validada, publicada só depois da nossa checagem. · " +
  "Vagas conferidas · Perto de casa · Alto Tietê";

/** A legenda auditada de uma peça real (scripts/cityjobs-pecas-de-feed.mts). */
const LEGENDA_AUDITADA =
  "A vaga que você procura pode ser aqui do lado. A gente publica o que é do Alto Tietê: " +
  "Mogi das Cruzes, Suzano, Itaquaquecetuba, Poá, Ferraz de Vasconcelos e Arujá.";

// ─────────────────────────────────────────────────────────────────────────────
// 1. O DIAGNÓSTICO, CONGELADO — por que a trava antiga não servia para chip
// ─────────────────────────────────────────────────────────────────────────────

describe("a trava de TEXTO reprova chip por natureza — não por defeito", () => {
  it.each(["Vagas conferidas", "Cadastro rápido", "Perto de casa"])(
    'reprova "%s" por falta de lastro na legenda — e está certa em reprovar',
    (chip) => {
      const v = travaDeTextoNaArte(chip, LEGENDA_AUDITADA);
      expect(v.ok).toBe(false);
      if (!v.ok) expect(v.motivo).toBe("sem_lastro_no_conteudo_auditado");
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. A TRAVA NOVA — forma própria E fonte de lastro própria
// ─────────────────────────────────────────────────────────────────────────────

describe("travaDeRotuloDeBeneficio: o chip passa a existir, com lastro na FICHA", () => {
  it.each(["Vagas conferidas", "Perto de casa", "Alto Tietê"])(
    'aprova "%s" — o cliente declarou isso na ficha dele',
    (chip) => {
      expect(travaDeRotuloDeBeneficio(chip, FICHA_CITYJOBS).ok).toBe(true);
    },
  );

  it("REPROVA o benefício que a agência inventou — ficha é a única fonte", () => {
    const v = travaDeRotuloDeBeneficio("Vagas exclusivas", FICHA_CITYJOBS);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.motivo).toBe("sem_lastro_na_ficha_de_marca");
  });

  it("FICHA VAZIA reprova tudo — sem ficha, chip é adjetivo da agência", () => {
    const v = travaDeRotuloDeBeneficio("Vagas conferidas", "");
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.motivo).toBe("sem_lastro_na_ficha_de_marca");
  });

  it("chip que virou frase não é chip", () => {
    const frase = "Todas as vagas que publicamos passam por checagem antes";
    expect(frase.length).toBeGreaterThan(FORMA_DO_BENEFICIO.maxCaracteres);
    const v = travaDeRotuloDeBeneficio(frase, `${FICHA_CITYJOBS} · ${frase}`);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.motivo).toBe("rotulo_fora_de_forma");
  });

  // ── O QUE **NÃO** FOI AFROUXADO ─────────────────────────────────────────
  //
  // É a metade que decide se esta mudança foi conserto ou porta dos fundos.
  // Declarar na ficha NÃO é licença: as classes proibidas correm ANTES do
  // lastro, e continuam todas valendo.
  it.each([
    ["Sem taxa", "classe_de_fato_proibida", "promessa comercial é classe de FATO: se ela mudar, corrigir é APAGAR o post publicado"],
    ["Melhor da região", "classe_de_fato_proibida", "superlativo não sustentável não tem versão verdadeira"],
    // "100% gratuito" cai na FORMA antes de chegar às classes — dígito e "%"
    // não são alfabeto de rótulo. Registrado com o motivo REAL, e não com o que
    // seria bonito: teste que afirma o motivo errado engana quem for consertar.
    ["100% gratuito", "rotulo_fora_de_forma", "dígito e símbolo não são alfabeto de rótulo"],
  ])('REPROVA "%s" mesmo declarado na ficha (%s) — %s', (chip, motivo) => {
    const fichaPermissiva = `${FICHA_CITYJOBS} · ${chip}`;
    const v = travaDeRotuloDeBeneficio(chip, fichaPermissiva);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.motivo).toBe(motivo);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. A FAIXA — texto MONTADO, não texto escrito
// ─────────────────────────────────────────────────────────────────────────────

describe("travaDeChamadaNaArte: a faixa do pé não é espaço livre", () => {
  it("aprova a faixa montada pela própria casa", () => {
    const faixa = chamadaDaMarca("CityJobs");
    expect(faixa).toBe("Siga o CityJobs");
    expect(travaDeChamadaNaArte(faixa, "CityJobs").ok).toBe(true);
  });

  it('aceita "SIGA O CITY JOBS" — o nome escrito com espaço é a mesma marca', () => {
    expect(travaDeChamadaNaArte("SIGA O CITY JOBS", "CityJobs").ok).toBe(true);
  });

  it("REPROVA promessa disfarçada de chamada — é o risco real do rodapé", () => {
    for (const golpe of ["GARANTA SUA VAGA HOJE", "ACHE EMPREGO EM 24H", "SIGA E CONSIGA UM EMPREGO"]) {
      expect(travaDeChamadaNaArte(golpe, "CityJobs").ok).toBe(false);
    }
  });

  it("REPROVA a faixa que manda seguir OUTRA marca", () => {
    const v = travaDeChamadaNaArte("Siga o Foocci", "CityJobs");
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.motivo).toBe("chamada_fora_de_forma");
  });

  it("sem nome de marca gravado, não há faixa — e a recusa diz por quê", () => {
    expect(chamadaDaMarca("")).toBe("");
    const v = travaDeChamadaNaArte("Siga o CityJobs", "");
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.detalhe).toContain("nome de marca");
  });

  it("todo verbo da lista da casa monta uma faixa aprovada", () => {
    for (const verbo of VERBOS_DE_CHAMADA) {
      expect(travaDeChamadaNaArte(`${verbo} o CityJobs`, "CityJobs").ok).toBe(true);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. O SLOT — o molde tem onde encaixar, e o que encaixa é conferido
// ─────────────────────────────────────────────────────────────────────────────

describe("o molde ganhou o slot que faltava", () => {
  const molde = moldeDoCliente({ primaryColor: "#0D2B4D", secondaryColor: "#16A34A", typography: "Arial" });
  const peca = {
    formato: "feed" as const,
    titulo: "A vaga que você procura pode ser aqui do lado",
    chips: ["Vagas conferidas", "Perto de casa", "Alto Tietê"],
    chamada: "Siga o CityJobs",
    assinatura: "CityJobs",
    selo: "Bastidor",
  };

  it("cada chip entra na lista de textos CONFERIDOS — nenhum vira pixel sem conferência", () => {
    const textos = textosDaPeca(peca);
    const chips = textos.filter((t) => t.papel === "chip").map((t) => t.texto);
    expect(chips).toEqual(["Vagas conferidas", "Perto de casa", "Alto Tietê"]);
    expect(textos.some((t) => t.papel === "chamada" && t.texto === "SIGA O CITYJOBS")).toBe(true);
  });

  it("o HTML desenha os três chips e a faixa, com a marca de conferido em CSS", () => {
    const html = montarHtmlDaPeca(peca, molde);
    expect((html.match(/class="chip"/g) ?? [])).toHaveLength(3);
    expect(html).toContain('class="faixa"');
    expect(html).toContain("SIGA O CITYJOBS");
    // O ícone é DESENHADO (bordas rotacionadas), não é glifo de fonte: fonte de
    // ícone é a armadilha do Arial Black do logo — não existe no contêiner e a
    // peça sai com um retângulo sem ninguém medir.
    expect(html).toContain("transform:rotate(45deg)");
  });

  it("peça SEM chip e SEM faixa continua sendo a peça de antes — nada muda sozinho", () => {
    const html = montarHtmlDaPeca({ ...peca, chips: [], chamada: null }, molde);
    expect(html).not.toContain('class="chip"');
    expect(html).not.toContain('class="faixa"');
  });

  it("com faixa, o conteúdo sobe — texto por baixo de faixa sólida é texto que ninguém lê", () => {
    const comFaixa = montarHtmlDaPeca(peca, molde);
    const semFaixa = montarHtmlDaPeca({ ...peca, chamada: null }, molde);
    const fundo = (h: string) => Number(/\.conteudo\s*\{[\s\S]*?bottom:(\d+)px/.exec(h)?.[1] ?? 0);
    expect(fundo(comFaixa)).toBeGreaterThan(fundo(semFaixa));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. A PEÇA DE VERDADE — rasterizada, com Chromium, e conferida no DOM
// ─────────────────────────────────────────────────────────────────────────────
//
// "O HTML tem a string" não é o mesmo que "a letra saiu do rasterizador". Aqui
// a peça é montada de verdade e o renderizador confere cada texto no DOM — que
// é a razão de existir do motor de molde.

describe("montarPeca produz a peça com chip e faixa, e a trava decide o que entra", () => {
  const molde = moldeDoCliente({ primaryColor: "#0D2B4D", secondaryColor: "#16A34A", typography: "Arial" });
  const base = {
    formato: "feed" as const,
    molde,
    titulo: "A vaga que você procura pode ser aqui do lado",
    assinatura: "CityJobs",
    fonteAuditada: LEGENDA_AUDITADA,
    fichaDaMarca: FICHA_CITYJOBS,
  };

  it("os três chips e a faixa viram pixel, conferidos um a um", async () => {
    const r = await montarPeca({
      ...base,
      chips: ["Vagas conferidas", "Perto de casa", "Alto Tietê"],
      chamada: chamadaDaMarca("CityJobs"),
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.textoRecusado).toEqual([]);
    for (const chip of ["Vagas conferidas", "Perto de casa", "Alto Tietê"]) {
      expect(r.textosPintados).toContain(chip);
    }
    expect(r.textosPintados).toContain("SIGA O CITYJOBS");
  });

  it("o chip sem lastro NÃO entra — e a peça sai assim mesmo, com o motivo dito", async () => {
    const r = await montarPeca({
      ...base,
      chips: ["Vagas conferidas", "Vagas exclusivas"],
      chamada: chamadaDaMarca("CityJobs"),
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.textosPintados).toContain("Vagas conferidas");
    expect(r.textosPintados).not.toContain("Vagas exclusivas");
    const recusado = r.textoRecusado.find((t) => t.papel === "chip");
    expect(recusado?.motivo).toBe("sem_lastro_na_ficha_de_marca");
    expect(recusado?.detalhe).toContain("Vagas exclusivas");
  });

  it("promessa na faixa não vira pixel — a peça sai sem faixa nenhuma", async () => {
    const r = await montarPeca({ ...base, chips: [], chamada: "GARANTA SUA VAGA HOJE" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.textosPintados).not.toContain("GARANTA SUA VAGA HOJE");
    expect(r.textoRecusado.some((t) => t.papel === "chamada")).toBe(true);
  });
});

// ─── TESTES DO MOTOR DO COLCHETE ─────────────────────────────────────────────
//
// Fonte: docs/celula-prospeccao/despachos/ONDA-2B-B-o-motor-do-colchete.md —
// os 14 itens do critério de teste, cada trava com as duas metades (barra o
// problema plantado E não inventa problema no caso limpo).
//
// Sem mock: a porta injetada (`bruto` opcional em `carregarBiblioteca`/
// `modeloParaEnvio`) e a chamada direta a `preencher` com um `ModeloDeMensagem`
// construído na mão já resolvem a necessidade de fixture, sem tocar em
// `docs/plataformas/99freelas/mensagens.json` nem em
// `__tests__/celula/biblioteca-de-mensagens.test.ts` (que continua verde, sem
// uma linha alterada).

import { describe, expect, it } from "vitest";
import { carregarBiblioteca, modeloParaEnvio, preencher } from "@/lib/agency/celula/mensagens/biblioteca";
import type { ModeloDeMensagem, RegraDeAusencia } from "@/lib/agency/celula/mensagens/tipos";

// ── Fixtures ──────────────────────────────────────────────────────────────

/** Um modelo BRUTO (como viria do JSON), para os testes que passam por `carregarBiblioteca`/`modeloParaEnvio`. */
function modeloValidoBruto(sobrescreve: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    codigo: "M99",
    nome: "Modelo de teste — motor do colchete",
    plataforma: "99freelas",
    etapaDoFunil: "abertura",
    finalidade: "testar o motor do colchete",
    textoBase: "Olá, [NOME]. Sobre [PROJETO]?",
    variaveisObrigatorias: ["NOME"],
    variaveisOpcionais: ["PROJETO"],
    palavrasProibidas: [],
    condicaoDeEntrada: "projeto elegível",
    condicaoDeSaida: "cliente respondeu",
    proximaAcao: "aguardar resposta",
    tempoDeEsperaHoras: null,
    maximoDeUsos: null,
    versao: "1.0.0",
    autor: "teste",
    aprovador: "teste-aprovador",
    estado: "aprovado",
    historico: [
      { versao: "1.0.0", em: "2026-08-30T00:00:00.000Z", autor: "teste", aprovador: "teste-aprovador", oQueMudou: "criação" },
    ],
    ...sobrescreve,
  };
}

/** Um `ModeloDeMensagem` já tipado, para os testes que chamam `preencher` direto. */
function modeloAprovado(sobrescreve: Partial<ModeloDeMensagem> = {}): ModeloDeMensagem {
  return {
    codigo: "M99",
    nome: "Modelo de teste — motor do colchete",
    plataforma: "99freelas",
    etapaDoFunil: "abertura",
    finalidade: "testar o motor do colchete",
    textoBase: "Olá, [NOME]. Sobre [PROJETO]?",
    variaveisObrigatorias: ["NOME"],
    variaveisOpcionais: ["PROJETO"],
    palavrasProibidas: [],
    condicaoDeEntrada: "projeto elegível",
    condicaoDeSaida: "cliente respondeu",
    proximaAcao: "aguardar resposta",
    tempoDeEsperaHoras: null,
    maximoDeUsos: null,
    versao: "1.0.0",
    autor: "teste",
    aprovador: "teste-aprovador",
    estado: "aprovado",
    historico: [],
    pendencia: null,
    regrasDeAusencia: [],
    ...sobrescreve,
  };
}

// ── 1. Preenche [NOME] com valor ─────────────────────────────────────────────

describe("colchete — preenchimento básico", () => {
  it("preenche [NOME] com valor — texto correto, sem colchete no resultado", () => {
    const modelo = modeloAprovado({ textoBase: "Olá, [NOME]!", variaveisObrigatorias: ["NOME"], variaveisOpcionais: [] });
    const r = preencher(modelo, { NOME: "Ana" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.texto).toBe("Olá, Ana!");
      expect(r.texto).not.toContain("[");
    }
  });

  // ── 2. Variável com acento e espaço ─────────────────────────────────────
  it("reconhece e preenche variável de colchete com acento e espaço", () => {
    const modelo = modeloAprovado({
      textoBase: "Precisamos entender [NECESSIDADE ESPECÍFICA] do projeto.",
      variaveisObrigatorias: ["NECESSIDADE ESPECÍFICA"],
      variaveisOpcionais: [],
    });
    const r = preencher(modelo, { "NECESSIDADE ESPECÍFICA": "o prazo de entrega" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.texto).toBe("Precisamos entender o prazo de entrega do projeto.");
  });

  // ── 3. Variável com vírgula ──────────────────────────────────────────────
  it("reconhece variável de colchete com vírgula no miolo", () => {
    const modelo = modeloAprovado({
      textoBase: "Me conta sobre [PRAZO, ESCOPO OU ORÇAMENTO].",
      variaveisObrigatorias: ["PRAZO, ESCOPO OU ORÇAMENTO"],
      variaveisOpcionais: [],
    });
    const r = preencher(modelo, { "PRAZO, ESCOPO OU ORÇAMENTO": "o prazo" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.texto).toBe("Me conta sobre o prazo.");
  });
});

// ── 4 e 5. A trava: colchete que sobra bloqueia; caso limpo passa ───────────

describe("colchete — a trava principal (duas metades)", () => {
  it("BLOQUEIA quando sobra [ALGO] não declarado no textoBase", () => {
    const modelo = modeloAprovado({
      textoBase: "Olá, [NOME]. Veja [ALGO].",
      variaveisObrigatorias: ["NOME"],
      variaveisOpcionais: [],
    });
    const r = preencher(modelo, { NOME: "Ana" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain("colchete");
  });

  it("metade gêmea: NÃO bloqueia o caso limpo — texto sem nenhum colchete passa", () => {
    const modelo = modeloAprovado({ textoBase: "Olá! Tudo bem?", variaveisObrigatorias: [], variaveisOpcionais: [] });
    const r = preencher(modelo, {});
    expect(r.ok).toBe(true);
  });
});

// ── 6. Valor hostil: "[OUTRA]" literal não é reprocessado (segunda ordem) ──

describe("colchete — entrada hostil", () => {
  it('valor hostil contendo "[OUTRA]" literal não é reprocessado — é BLOQUEADO pela trava, não aceito em silêncio', () => {
    const modelo = modeloAprovado({
      textoBase: "Olá, [NOME]. Projeto: [PROJETO].",
      variaveisObrigatorias: ["NOME"],
      variaveisOpcionais: ["PROJETO"],
    });
    // O valor injetado no lugar de NOME é o texto literal "[PROJETO]" — se
    // fosse reprocessado como molde, viraria "Site institucional" (substituição
    // de segunda ordem). O comportamento seguro é sobrar "[PROJETO]" como texto
    // literal no resultado e ser barrado pela trava de colchete remanescente.
    const r = preencher(modelo, { NOME: "[PROJETO]", PROJETO: "Site institucional" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain("colchete");
  });
});

// ── 7. {{chave}} continua funcionando lado a lado com [CHAVE] ──────────────

describe("colchete e chave dupla convivendo no mesmo texto", () => {
  it("{{chave}} continua funcionando lado a lado com [CHAVE] no mesmo texto", () => {
    const modelo = modeloAprovado({
      textoBase: "Olá {{nomeDoCliente}}, sobre [PROJETO]?",
      variaveisObrigatorias: ["nomeDoCliente", "PROJETO"],
      variaveisOpcionais: [],
    });
    const r = preencher(modelo, { nomeDoCliente: "Ana", PROJETO: "Site institucional" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.texto).toBe("Olá Ana, sobre Site institucional?");
  });
});

// ── 8 e 9. Regras de ausência — presente vs. ausente (duas metades) ────────

describe("regras de ausência — ausente aplica, presente não aplica", () => {
  const regra: RegraDeAusencia = { variavel: "NOME", de: "Olá, [NOME].", para: "Olá.", fonte: "teste" };

  it('NOME ausente + regra "Olá, [NOME]." → "Olá." produz o texto trocado, sem colchete sobrando', () => {
    const modelo = modeloAprovado({
      textoBase: "Olá, [NOME]. Tudo bem?",
      variaveisObrigatorias: [],
      variaveisOpcionais: ["NOME"],
      regrasDeAusencia: [regra],
    });
    const r = preencher(modelo, {});
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.texto).toBe("Olá. Tudo bem?");
      expect(r.texto).not.toContain("[");
    }
  });

  it("metade gêmea: NOME PRESENTE — a regra NÃO é aplicada e o nome entra normalmente", () => {
    const modelo = modeloAprovado({
      textoBase: "Olá, [NOME]. Tudo bem?",
      variaveisObrigatorias: [],
      variaveisOpcionais: ["NOME"],
      regrasDeAusencia: [regra],
    });
    const r = preencher(modelo, { NOME: "Ana" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.texto).toBe("Olá, Ana. Tudo bem?");
  });
});

// ── 10. Regra cujo "de" não existe no textoBase → BLOQUEIA ─────────────────

describe("regras de ausência — guardas de invalidez", () => {
  it('BLOQUEIA quando o recorte "de" da regra não existe no textoBase', () => {
    const regra: RegraDeAusencia = { variavel: "NOME", de: "Recorte que não existe no texto.", para: "Olá.", fonte: "teste" };
    const modelo = modeloAprovado({
      textoBase: "Olá, [NOME]. Tudo bem?",
      variaveisObrigatorias: [],
      variaveisOpcionais: ["NOME"],
      regrasDeAusencia: [regra],
    });
    const r = preencher(modelo, {});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain("não existe no textoBase");
  });

  // ── 11. Regra para variável obrigatória → BLOQUEIA (contradição) ─────────
  it("BLOQUEIA regra de ausência para variável que está em variaveisObrigatorias — contradição", () => {
    const regra: RegraDeAusencia = { variavel: "NOME", de: "Olá, [NOME].", para: "Olá.", fonte: "teste" };
    const modelo = modeloAprovado({
      textoBase: "Olá, [NOME]. Tudo bem?",
      variaveisObrigatorias: ["NOME"],
      variaveisOpcionais: [],
      regrasDeAusencia: [regra],
    });
    const r = preencher(modelo, { NOME: "Ana" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain("obrigat");
  });
});

// ── 12. palavrasProibidasGlobais bloqueia; caso limpo passa ────────────────

describe("palavrasProibidasGlobais da raiz", () => {
  it("bloqueia o envio de um modelo que não tinha a palavra na lista própria", () => {
    const bruto = {
      palavrasProibidasGlobais: ["concorrente-global"],
      modelos: [modeloValidoBruto({ textoBase: "Somos uma agência concorrente-global no mercado, [NOME]?" })],
    };
    const leitura = modeloParaEnvio("M99", bruto);
    expect(leitura.ok).toBe(true);
    if (leitura.ok) {
      const r = preencher(leitura.modelo, { NOME: "Ana" });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.motivo).toContain("proibida");
    }
  });

  it("metade gêmea: sem a palavra proibida global, o caso limpo passa", () => {
    const bruto = {
      palavrasProibidasGlobais: ["concorrente-global"],
      modelos: [modeloValidoBruto()],
    };
    const leitura = modeloParaEnvio("M99", bruto);
    expect(leitura.ok).toBe(true);
    if (leitura.ok) {
      const r = preencher(leitura.modelo, { NOME: "Ana", PROJETO: "Site institucional" });
      expect(r.ok).toBe(true);
    }
  });

  // ── 13. palavrasProibidasGlobais malformada aparece em invalidos ─────────
  it("malformada aparece em invalidos, e a biblioteca ainda carrega os modelos", () => {
    const bruto = { palavrasProibidasGlobais: "não é uma lista", modelos: [modeloValidoBruto()] };
    const biblioteca = carregarBiblioteca(bruto);
    expect(biblioteca.modelos.M99).toBeDefined();
    expect(
      biblioteca.invalidos.some((i) => i.indice === -1 && i.motivo.includes("palavrasProibidasGlobais")),
    ).toBe(true);
  });
});

// ── 14. As guardas antigas continuam (cinto contra afrouxamento) ───────────

describe("guardas antigas continuam intactas", () => {
  it('bloqueia quando estado não é "aprovado"', () => {
    const modelo = modeloAprovado({ estado: "rascunho" });
    const r = preencher(modelo, { NOME: "Ana", PROJETO: "Site institucional" });
    expect(r.ok).toBe(false);
  });

  it("bloqueia quando há pendência declarada", () => {
    const modelo = modeloAprovado({ pendencia: "texto oficial do CEO não recebido" });
    const r = preencher(modelo, { NOME: "Ana", PROJETO: "Site institucional" });
    expect(r.ok).toBe(false);
  });

  it("bloqueia quando variável obrigatória está ausente", () => {
    const modelo = modeloAprovado();
    const r = preencher(modelo, {});
    expect(r.ok).toBe(false);
  });
});

// ── 15–20. Ficha H — "" (string vazia) é ausente, não "presente" ────────────
//
// O furo do laudo do `qualidade`: variável opcional com "" atravessava o
// substituidor sem acionar nenhuma trava — "" era tratado como "presente" ali
// e "ausente" na regra de ausência, e do texto sumia o placeholder inteiro
// ("Olá, . Li seu projeto..."). A definição única (`ausente`, em
// `biblioteca.ts`) fecha essa discordância. As seis provas abaixo são as duas
// metades pedidas na ficha, para colchete e para chave dupla.

describe('Ficha H — "" em variável opcional não pode sumir do texto', () => {
  // 15. Opcional "" SEM regra de ausência ⇒ BLOQUEIA, e o motivo cita o
  // colchete remanescente — nunca o texto com buraco chega a "ok: true".
  it('BLOQUEIA quando variável opcional é "" e não há regra de ausência — motivo cita o colchete remanescente', () => {
    const modelo = modeloAprovado({
      textoBase: "Olá, [NOME]. Li seu projeto sobre [PROJETO].",
      variaveisObrigatorias: ["PROJETO"],
      variaveisOpcionais: ["NOME"],
      regrasDeAusencia: [],
    });
    const r = preencher(modelo, { NOME: "", PROJETO: "um site institucional" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.motivo).toContain("colchete");
      expect(r.motivo).toContain("[NOME]");
    }
  });

  // 16. Opcional só-espaços ⇒ BLOQUEIA pelo mesmo caminho — "".trim() === ""
  // é o mesmo caso de "".
  it('BLOQUEIA quando variável opcional é "   " (só espaços) — mesmo caminho da string vazia', () => {
    const modelo = modeloAprovado({
      textoBase: "Olá, [NOME]. Li seu projeto sobre [PROJETO].",
      variaveisObrigatorias: ["PROJETO"],
      variaveisOpcionais: ["NOME"],
      regrasDeAusencia: [],
    });
    const r = preencher(modelo, { NOME: "   ", PROJETO: "um site institucional" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain("colchete");
  });

  // 17. Metade gêmea: opcional "" COM regra de ausência ⇒ a regra é aplicada,
  // o texto fica correto e não sobra colchete. O conserto não inventa
  // problema onde a casa já tinha solução.
  it('metade gêmea: opcional "" COM regra de ausência — a regra aplica, texto correto, sem colchete sobrando', () => {
    const regra: RegraDeAusencia = { variavel: "NOME", de: "Olá, [NOME].", para: "Olá.", fonte: "teste" };
    const modelo = modeloAprovado({
      textoBase: "Olá, [NOME]. Li seu projeto sobre [PROJETO].",
      variaveisObrigatorias: ["PROJETO"],
      variaveisOpcionais: ["NOME"],
      regrasDeAusencia: [regra],
    });
    const r = preencher(modelo, { NOME: "", PROJETO: "um site institucional" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.texto).toBe("Olá. Li seu projeto sobre um site institucional.");
      expect(r.texto).not.toContain("[");
    }
  });

  // 18. Obrigatória com "" continua bloqueando pelo motivo de OBRIGATÓRIA,
  // nunca pelo de remanescente — o motivo é o que diz ao operador o que
  // fazer, e os dois casos pedem ações diferentes.
  it('obrigatória com "" bloqueia pelo motivo de "obrigatória", não pelo de colchete remanescente', () => {
    const modelo = modeloAprovado({
      textoBase: "Olá, [NOME]. Li seu projeto sobre [PROJETO].",
      variaveisObrigatorias: ["NOME"],
      variaveisOpcionais: ["PROJETO"],
      regrasDeAusencia: [],
    });
    const r = preencher(modelo, { NOME: "", PROJETO: "um site institucional" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.motivo).toContain("obrigat");
      expect(r.motivo).not.toContain("colchete");
    }
  });

  // 19. Caso limpo, com todos os valores preenchidos, continua passando —
  // o conserto não quebrou o caminho feliz.
  it("caso limpo: todos os valores preenchidos continua passando", () => {
    const modelo = modeloAprovado({
      textoBase: "Olá, [NOME]. Li seu projeto sobre [PROJETO].",
      variaveisObrigatorias: ["NOME"],
      variaveisOpcionais: ["PROJETO"],
      regrasDeAusencia: [],
    });
    const r = preencher(modelo, { NOME: "Ana", PROJETO: "um site institucional" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.texto).toBe("Olá, Ana. Li seu projeto sobre um site institucional.");
  });

  // 20. {{chave}} opcional com "" tem o MESMO comportamento do colchete —
  // os dois formatos não podem divergir. (O motivo muda de palavra —
  // "placeholder" para chave dupla, "colchete" para colchete — porque são
  // checagens de remanescente distintas no texto final, mas os dois formatos
  // bloqueiam o mesmo jeito diante do mesmo "".)
  it('{{chave}} opcional com "" bloqueia igual ao colchete — os dois formatos não divergem', () => {
    const modelo = modeloAprovado({
      textoBase: "Olá {{nome}}. Li seu projeto sobre {{projeto}}.",
      variaveisObrigatorias: ["projeto"],
      variaveisOpcionais: ["nome"],
      regrasDeAusencia: [],
    });
    const r = preencher(modelo, { nome: "", projeto: "um site institucional" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain("nome");
  });
});

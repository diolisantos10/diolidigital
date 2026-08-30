// ─── TESTES DA BIBLIOTECA DE MENSAGENS ──────────────────────────────────────
//
// Fonte: docs/celula-prospeccao/despachos/A-biblioteca.md — critério de
// aceite, itens 1 a 7. Sem mocks: a "porta injetada" (`bruto` opcional em
// `carregarBiblioteca`/`modeloParaEnvio`) já resolve a necessidade de fixture
// sem tocar no JSON de produção.

import { describe, expect, it } from "vitest";
import { carregarBiblioteca, lerModelo, modeloParaEnvio, preencher } from "@/lib/agency/celula/mensagens/biblioteca";
import type { ModeloDeMensagem } from "@/lib/agency/celula/mensagens/tipos";

// ── Fixture: um modelo bruto (como viria do JSON) completo e válido ─────────
function modeloValidoBruto(sobrescreve: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    codigo: "M99",
    nome: "Modelo de teste",
    plataforma: "99freelas",
    etapaDoFunil: "abertura",
    finalidade: "testar a biblioteca",
    textoBase: "Olá {{nomeDoCliente}}, tudo bem sobre {{projeto}}?",
    variaveisObrigatorias: ["nomeDoCliente"],
    variaveisOpcionais: ["projeto"],
    palavrasProibidas: ["concorrente"],
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

const MODELO_APROVADO_FIXTURE: ModeloDeMensagem = {
  codigo: "M99",
  nome: "Modelo de teste",
  plataforma: "99freelas",
  etapaDoFunil: "abertura",
  finalidade: "testar a biblioteca",
  textoBase: "Olá {{nomeDoCliente}}, tudo bem sobre {{projeto}}?",
  variaveisObrigatorias: ["nomeDoCliente"],
  variaveisOpcionais: ["projeto"],
  palavrasProibidas: ["concorrente"],
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
};

// ── 2. Campo obrigatório faltando NÃO entra na biblioteca ───────────────────

describe("lerModelo — campo obrigatório ausente", () => {
  const camposDeTexto = [
    "codigo",
    "nome",
    "plataforma",
    "etapaDoFunil",
    "finalidade",
    "condicaoDeEntrada",
    "condicaoDeSaida",
    "proximaAcao",
    "versao",
    "autor",
    "estado",
    "historico",
    "variaveisObrigatorias",
    "variaveisOpcionais",
    "palavrasProibidas",
  ];

  it.each(camposDeTexto)('bloqueia quando o campo "%s" está ausente', (campo) => {
    const bruto = modeloValidoBruto();
    delete bruto[campo];
    const leitura = lerModelo(bruto);
    expect(leitura.ok, `esperava bloqueio sem "${campo}"`).toBe(false);
  });

  it.each(["variaveisObrigatorias", "variaveisOpcionais", "palavrasProibidas"])(
    'bloqueia quando "%s" não é uma lista de texto',
    (campo) => {
      const leitura = lerModelo(modeloValidoBruto({ [campo]: "não é uma lista" }));
      expect(leitura.ok).toBe(false);
    },
  );

  it("bloqueia código fora do padrão M\\d{2}", () => {
    expect(lerModelo(modeloValidoBruto({ codigo: "MODELO-1" })).ok).toBe(false);
  });

  it("bloqueia estado fora da lista permitida", () => {
    expect(lerModelo(modeloValidoBruto({ estado: "arquivado" })).ok).toBe(false);
  });

  it("bloqueia entrada de histórico incompleta", () => {
    const bruto = modeloValidoBruto({
      historico: [{ versao: "1.0.0", em: "2026-08-30T00:00:00.000Z", autor: "teste", aprovador: null }],
    });
    expect(lerModelo(bruto).ok).toBe(false);
  });

  it("bloqueia textoBase vazio sem pendencia explicando o motivo", () => {
    const leitura = lerModelo(modeloValidoBruto({ textoBase: "" }));
    expect(leitura.ok).toBe(false);
  });

  it("aceita textoBase vazio QUANDO há pendencia — é exatamente o caso dos slots M01–M22", () => {
    const leitura = lerModelo(
      modeloValidoBruto({ textoBase: "", pendencia: "texto oficial do CEO não recebido", estado: "rascunho", aprovador: null }),
    );
    expect(leitura.ok).toBe(true);
  });

  it("duas entradas com o mesmo código tornam a biblioteca inválida para as duas", () => {
    const bruto = { modelos: [modeloValidoBruto({ codigo: "M07" }), modeloValidoBruto({ codigo: "M07", nome: "Outro nome" })] };
    const biblioteca = carregarBiblioteca(bruto);
    expect(biblioteca.modelos.M07).toBeUndefined();
    expect(biblioteca.invalidos.filter((i) => i.codigo === "M07")).toHaveLength(2);
  });

  it("recusa uma raiz sem o campo \"modelos\"", () => {
    const biblioteca = carregarBiblioteca({ isto: "não é a forma esperada" });
    expect(biblioteca.modelos).toEqual({});
    expect(biblioteca.invalidos.length).toBeGreaterThan(0);
  });
});

// ── 1. rascunho/pausado/aposentado NÃO saem ──────────────────────────────────

describe("modeloParaEnvio — só \"aprovado\" sai", () => {
  it.each(["rascunho", "pausado", "aposentado"] as const)('recusa modelo em estado "%s"', (estado) => {
    const bruto = { modelos: [modeloValidoBruto({ estado, aprovador: estado === "rascunho" ? null : "alguém" })] };
    const resultado = modeloParaEnvio("M99", bruto);
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.motivo).toContain(estado);
  });

  it("entrega modelo em estado \"aprovado\"", () => {
    const bruto = { modelos: [modeloValidoBruto()] };
    const resultado = modeloParaEnvio("M99", bruto);
    expect(resultado.ok).toBe(true);
  });

  it("recusa código que não existe na biblioteca, com motivo legível", () => {
    const resultado = modeloParaEnvio("M00", { modelos: [modeloValidoBruto()] });
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.motivo).toContain("não existe");
  });
});

// ── 3, 4, 5, 6. preencher() ──────────────────────────────────────────────────

describe("preencher — segundo cinto: confere estado e pendência por conta própria (Ficha J)", () => {
  it.each(["rascunho", "pausado", "aposentado"] as const)(
    'bloqueia quando chamado direto com modelo em estado "%s", mesmo com variáveis corretas',
    (estado) => {
      const modelo: ModeloDeMensagem = { ...MODELO_APROVADO_FIXTURE, estado };
      const r = preencher(modelo, { nomeDoCliente: "Ana", projeto: "Site institucional" });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.motivo).toContain(estado);
    },
  );

  it("bloqueia quando o modelo tem pendência declarada, mesmo estando aprovado", () => {
    const modelo: ModeloDeMensagem = { ...MODELO_APROVADO_FIXTURE, pendencia: "texto oficial do CEO não recebido" };
    const r = preencher(modelo, { nomeDoCliente: "Ana", projeto: "Site institucional" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain("pendência");
  });

  it("metade gêmea: modelo aprovado e sem pendência continua preenchendo normalmente", () => {
    const r = preencher(MODELO_APROVADO_FIXTURE, { nomeDoCliente: "Ana", projeto: "Site institucional" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.texto).toBe("Olá Ana, tudo bem sobre Site institucional?");
  });
});

describe("preencher", () => {
  it("bloqueia quando variável obrigatória está vazia (só espaço)", () => {
    const r = preencher(MODELO_APROVADO_FIXTURE, { nomeDoCliente: "   " });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain("nomeDoCliente");
  });

  it("bloqueia quando variável obrigatória está ausente", () => {
    const r = preencher(MODELO_APROVADO_FIXTURE, {});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain("nomeDoCliente");
  });

  it("bloqueia quando variável obrigatória é null", () => {
    const r = preencher(MODELO_APROVADO_FIXTURE, { nomeDoCliente: null });
    expect(r.ok).toBe(false);
  });

  it("bloqueia quando sobra placeholder não declarado no texto final", () => {
    const modelo: ModeloDeMensagem = {
      ...MODELO_APROVADO_FIXTURE,
      textoBase: "Olá {{nomeDoCliente}}, veja {{campoQueNinguemDeclarou}}.",
    };
    const r = preencher(modelo, { nomeDoCliente: "Ana", projeto: "Site" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain("placeholder");
  });

  it("bloqueia quando variável opcional fica sem valor e o placeholder sobra", () => {
    const r = preencher(MODELO_APROVADO_FIXTURE, { nomeDoCliente: "Ana" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain("placeholder");
  });

  it("bloqueia quando o texto final viola o Guardião de conformidade (contato)", () => {
    const modelo: ModeloDeMensagem = {
      ...MODELO_APROVADO_FIXTURE,
      textoBase: "Olá {{nomeDoCliente}}, me chama no whatsapp para falar de {{projeto}}!",
    };
    const r = preencher(modelo, { nomeDoCliente: "Ana", projeto: "Site" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain("Guardião");
  });

  it("bloqueia quando o texto final contém palavra proibida do próprio modelo", () => {
    const r = preencher(MODELO_APROVADO_FIXTURE, { nomeDoCliente: "Ana", projeto: "concorrente direto" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain("proibida");
  });

  it("uma variável com valor hostil (\"{{outra}}\" literal) não é reprocessada — não vira substituição de segunda ordem", () => {
    const modelo: ModeloDeMensagem = {
      ...MODELO_APROVADO_FIXTURE,
      textoBase: "Olá {{nomeDoCliente}}, projeto: {{projeto}}.",
    };
    const r = preencher(modelo, { nomeDoCliente: "{{projeto}}", projeto: "Site institucional" });
    // O valor injetado no lugar de nomeDoCliente é o texto literal "{{projeto}}" —
    // isso faz sobrar um placeholder no resultado final, e o bloqueio é o
    // comportamento seguro (nunca teria de "resolver" a injeção sozinho).
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain("placeholder");
  });

  it("caminho feliz: modelo aprovado + variáveis preenchidas + texto conforme", () => {
    const r = preencher(MODELO_APROVADO_FIXTURE, { nomeDoCliente: "Ana", projeto: "Site institucional" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.texto).toBe("Olá Ana, tudo bem sobre Site institucional?");
      expect(r.texto).not.toContain("{{");
    }
  });

  it("caminho feliz: variável opcional pode ficar de fora quando não está no texto", () => {
    const modelo: ModeloDeMensagem = { ...MODELO_APROVADO_FIXTURE, textoBase: "Olá {{nomeDoCliente}}!", variaveisOpcionais: [] };
    const r = preencher(modelo, { nomeDoCliente: "Ana" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.texto).toBe("Olá Ana!");
  });
});

// ── 7. Os 22 modelos reais do JSON são todos não-entregáveis hoje ───────────

describe("a biblioteca real de docs/plataformas/99freelas/mensagens.json", () => {
  const codigos = Array.from({ length: 22 }, (_, i) => `M${String(i + 1).padStart(2, "0")}`);

  it("carrega os 22 slots como estruturalmente válidos, nenhum inválido", () => {
    const biblioteca = carregarBiblioteca();
    for (const codigo of codigos) {
      expect(biblioteca.modelos[codigo], `${codigo} deveria ter entrado na biblioteca`).toBeDefined();
    }
    expect(biblioteca.invalidos).toEqual([]);
  });

  it("nenhum dos 22 modelos M01–M22 é entregável hoje — a casa não envia texto que ela mesma inventou", () => {
    for (const codigo of codigos) {
      const resultado = modeloParaEnvio(codigo);
      expect(resultado.ok, `${codigo} deveria estar bloqueado`).toBe(false);
    }
  });
});

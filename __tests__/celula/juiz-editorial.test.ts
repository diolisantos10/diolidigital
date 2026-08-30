// juiz-editorial.test.ts — ONDA 4A, FICHA A.
// Um teste por critério de aceite da ficha
// (docs/celula-prospeccao/despachos/ONDA-4A-A-o-juiz-editorial.md, §4).
//
// Nenhum teste aqui faz chamada de IA real — `porta` é sempre um `vi.fn` de
// mentira, controlado linha a linha por cada `it`.

import { describe, it, expect, vi } from "vitest";
import {
  julgarTexto,
  categoriaDeclarada,
  CATEGORIAS,
  MARCADOR_ABERTURA_DO_JUIZ,
  MARCADOR_FECHAMENTO_DO_JUIZ,
  type PortaDoJuiz,
  type VeredictoDoJuiz,
} from "@/lib/agency/celula/mensagens/juiz-editorial";
import { avaliarAberturaDeExcecao } from "@/lib/agency/celula/excecoes/fila";
import { CASOS_QUE_INTERROMPEM_A_AUTOMACAO } from "@/lib/agency/celula/excecoes/tipos";
import regrasEditoriaisBruto from "@/docs/plataformas/99freelas/regras-editoriais.json";

interface ArquivoDeRegrasEditoriais {
  categorias: { slug: string }[];
  regras: { slug: string; escopo: string; verificadaPor: Record<string, unknown> }[];
}
const DADO = regrasEditoriaisBruto as unknown as ArquivoDeRegrasEditoriais;

const TEXTO_QUALQUER = "Oi! Trabalhamos com social media para negócios locais.";

function portaQue(resposta: unknown): PortaDoJuiz {
  return vi.fn(async (): Promise<unknown> => resposta);
}

function portaQueLanca(mensagem: string): PortaDoJuiz {
  return vi.fn(async (): Promise<unknown> => {
    throw new Error(mensagem);
  });
}

// ── Critério 1: as 8 categorias existem, com definição e exemplos ───────────

describe("as 8 categorias julgadas", () => {
  it("CATEGORIAS (o código) e docs/.../regras-editoriais.json (o dado) são EXATAMENTE as mesmas 8 — nenhuma divergência", () => {
    const slugsDoJson = DADO.categorias.map((c) => c.slug).sort();
    const slugsDoCodigo = [...CATEGORIAS].sort();
    expect(slugsDoJson).toEqual(slugsDoCodigo);
    expect(slugsDoCodigo).toHaveLength(8);
  });

  it("toda categoria do JSON tem definiçãoOperacional, exemploQueReprova e exemploQuePassa não vazios", () => {
    for (const categoria of DADO.categorias) {
      const c = categoria as unknown as Record<string, unknown>;
      expect(typeof c.definicaoOperacional).toBe("string");
      expect((c.definicaoOperacional as string).length).toBeGreaterThan(10);
      expect(typeof c.exemploQueReprova).toBe("string");
      expect((c.exemploQueReprova as string).length).toBeGreaterThan(5);
      expect(typeof c.exemploQuePassa).toBe("string");
      expect((c.exemploQuePassa as string).length).toBeGreaterThan(5);
    }
  });

  it("categoriaDeclarada é fail-closed: qualquer coisa fora das 8 vira null, nunca um cast silencioso", () => {
    expect(categoriaDeclarada("exageros")).toBe("exageros");
    expect(categoriaDeclarada("EXAGEROS")).toBeNull();
    expect(categoriaDeclarada("categoria_inventada")).toBeNull();
    expect(categoriaDeclarada(null)).toBeNull();
    expect(categoriaDeclarada(undefined)).toBeNull();
    expect(categoriaDeclarada(42)).toBeNull();
    expect(categoriaDeclarada(["exageros"])).toBeNull();
  });
});

// ── Critério 2: as 14 regras gravadas, cada uma apontando para uma das 3 formas ──

describe("as 14 regras editoriais do CEO", () => {
  it("existem exatamente 14 regras, 9 de toda_mensagem e 5 de mensagem_inicial", () => {
    expect(DADO.regras).toHaveLength(14);
    expect(DADO.regras.filter((r) => r.escopo === "toda_mensagem")).toHaveLength(9);
    expect(DADO.regras.filter((r) => r.escopo === "mensagem_inicial")).toHaveLength(5);
  });

  it("toda regra declara verificadaPor com uma das 3 formas exatas, nunca uma quarta", () => {
    const formasValidas = new Set(["mecanismo", "juiz", "sem_mecanismo"]);
    for (const regra of DADO.regras) {
      const tipo = regra.verificadaPor.tipo;
      expect(formasValidas.has(tipo as string)).toBe(true);
    }
  });

  it("toda regra do tipo 'mecanismo' aponta para um arquivo que existe de verdade no disco", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const raiz = process.cwd();
    const comMecanismo = DADO.regras.filter((r) => r.verificadaPor.tipo === "mecanismo");
    expect(comMecanismo.length).toBeGreaterThan(0);
    for (const regra of comMecanismo) {
      const modulo = regra.verificadaPor.modulo as string;
      expect(typeof modulo).toBe("string");
      const caminhoCompleto = path.join(raiz, modulo);
      expect(fs.existsSync(caminhoCompleto), `mecanismo declarado para "${regra.slug}" não existe: ${modulo}`).toBe(true);
    }
  });

  it("toda regra do tipo 'sem_mecanismo' tem motivo e dono não vazios", () => {
    const semMecanismo = DADO.regras.filter((r) => r.verificadaPor.tipo === "sem_mecanismo");
    expect(semMecanismo.length).toBeGreaterThan(0);
    for (const regra of semMecanismo) {
      const motivo = regra.verificadaPor.motivo as string;
      const dono = regra.verificadaPor.dono as string;
      expect(typeof motivo).toBe("string");
      expect(motivo.length).toBeGreaterThan(10);
      expect(typeof dono).toBe("string");
      expect(dono.length).toBeGreaterThan(0);
    }
  });

  it("toda regra do tipo 'juiz' cita uma categoria dentre as 8 fechadas", () => {
    const viaJuiz = DADO.regras.filter((r) => r.verificadaPor.tipo === "juiz");
    for (const regra of viaJuiz) {
      const categoria = regra.verificadaPor.categoria as string;
      expect(categoriaDeclarada(categoria)).not.toBeNull();
    }
  });
});

// ── Critério 3: reprovação BLOQUEIA ─────────────────────────────────────────

describe("reprovação do juiz — bloqueante", () => {
  it("aprovado:false bem formado devolve ok:false, motivo 'reprovado', categorias e explicação", async () => {
    const porta = portaQue({ aprovado: false, categorias: ["exageros", "excesso_de_elogios"], explicacao: "o texto exagera e elogia demais." });
    const veredicto = await julgarTexto({ texto: TEXTO_QUALQUER, porta, casoDaIndisponibilidade: null });

    expect(veredicto.ok).toBe(false);
    if (veredicto.ok) throw new Error("deveria ter reprovado");
    expect(veredicto.motivo).toBe("reprovado");
    if (veredicto.motivo !== "reprovado") throw new Error("motivo errado");
    expect(veredicto.categorias).toEqual(["exageros", "excesso_de_elogios"]);
    expect(veredicto.explicacao).toMatch(/exagera/);
  });

  it("a mensagem NÃO É montada como enviável quando reprovado — não há caminho de bypass no veredito", async () => {
    const porta = portaQue({ aprovado: false, categorias: ["promessa_de_resultado"], explicacao: "garante resultado que a agência não controla." });
    const veredicto: VeredictoDoJuiz = await julgarTexto({ texto: "Garanto que você vai triplicar as vendas.", porta, casoDaIndisponibilidade: null });
    expect(veredicto.ok).toBe(false);
  });
});

// ── Critério 4: indisponibilidade NÃO passa em silêncio ─────────────────────

describe("indisponibilidade do juiz — não silenciosa", () => {
  it("porta ausente, SEM caso injetado ⇒ indisponivel_sem_caso (a mensagem também não sai, mas não abre exceção)", async () => {
    const veredicto = await julgarTexto({ texto: TEXTO_QUALQUER, porta: null, casoDaIndisponibilidade: null });
    expect(veredicto.ok).toBe(false);
    if (veredicto.ok) throw new Error("deveria ser indisponível");
    expect(veredicto.motivo).toBe("indisponivel_sem_caso");
  });

  it("porta ausente, COM caso injetado ⇒ indisponivel com pedidoDeExcecao pronto, e o pedido é ACEITO por avaliarAberturaDeExcecao", async () => {
    const veredicto = await julgarTexto({
      texto: TEXTO_QUALQUER,
      porta: undefined,
      casoDaIndisponibilidade: "ambiguidade_de_briefing",
    });
    expect(veredicto.ok).toBe(false);
    if (veredicto.ok) throw new Error("deveria ser indisponível");
    expect(veredicto.motivo).toBe("indisponivel");
    if (veredicto.motivo !== "indisponivel") throw new Error("motivo errado");

    expect(veredicto.pedidoDeExcecao.caso).toBe("ambiguidade_de_briefing");
    expect(veredicto.pedidoDeExcecao.responsavel).toBe("gerente_de_atendimento");
    expect(veredicto.pedidoDeExcecao.acaoRecomendada.length).toBeGreaterThanOrEqual(3);

    const abertura = avaliarAberturaDeExcecao(veredicto.pedidoDeExcecao, new Date("2026-08-30T12:00:00Z"));
    expect(abertura.ok).toBe(true);
  });

  it("caso injetado pertence aos 5 que interrompem a automação ⇒ prioridade forçada p0, e o pedido continua ACEITO pela fila", async () => {
    const casoP0 = [...CASOS_QUE_INTERROMPEM_A_AUTOMACAO][0]!;
    const veredicto = await julgarTexto({ texto: TEXTO_QUALQUER, porta: null, casoDaIndisponibilidade: casoP0 });
    expect(veredicto.ok).toBe(false);
    if (veredicto.ok || veredicto.motivo !== "indisponivel") throw new Error("deveria ser indisponivel");
    expect(veredicto.pedidoDeExcecao.prioridade).toBe("p0");

    const abertura = avaliarAberturaDeExcecao(veredicto.pedidoDeExcecao, new Date("2026-08-30T12:00:00Z"));
    expect(abertura.ok).toBe(true);
  });

  it("caso injetado NÃO pertence aos 5 que interrompem a automação ⇒ prioridade p1", async () => {
    const veredicto = await julgarTexto({ texto: TEXTO_QUALQUER, porta: null, casoDaIndisponibilidade: "falha_de_upload" });
    expect(veredicto.ok).toBe(false);
    if (veredicto.ok || veredicto.motivo !== "indisponivel") throw new Error("deveria ser indisponivel");
    expect(veredicto.pedidoDeExcecao.prioridade).toBe("p1");
  });

  it("caso injetado ILEGÍVEL (fora dos 14) ⇒ indisponivel_sem_caso, fail closed — nunca um cast silencioso", async () => {
    const veredicto = await julgarTexto({
      texto: TEXTO_QUALQUER,
      porta: null,
      // @ts-expect-error — propositalmente um valor fora do conjunto fechado, para provar a leitura fail-closed
      casoDaIndisponibilidade: "caso_que_nao_existe",
    });
    expect(veredicto.ok).toBe(false);
    if (veredicto.ok) throw new Error("deveria ser indisponível");
    expect(veredicto.motivo).toBe("indisponivel_sem_caso");
  });

  it("o provedor lança exceção ⇒ indisponivel (não propaga a exceção, não aprova)", async () => {
    const porta = portaQueLanca("timeout simulado");
    const veredicto = await julgarTexto({ texto: TEXTO_QUALQUER, porta, casoDaIndisponibilidade: "falha_de_download" });
    expect(veredicto.ok).toBe(false);
    if (veredicto.ok || veredicto.motivo !== "indisponivel") throw new Error("deveria ser indisponivel");
    expect(veredicto.causa).toMatch(/timeout simulado/);
  });
});

// ── Critério 5: resposta malformada NUNCA vira aprovação — um teste por forma de lixo ──

describe("leitura fail-closed da resposta — lixo nunca aprova", () => {
  const casoQualquer = "falha_de_upload" as const;

  it("campo 'aprovado' ausente ⇒ indisponivel", async () => {
    const veredicto = await julgarTexto({ texto: TEXTO_QUALQUER, porta: portaQue({ categorias: [] }), casoDaIndisponibilidade: casoQualquer });
    expect(veredicto.ok).toBe(false);
    if (veredicto.ok || veredicto.motivo !== "indisponivel") throw new Error("deveria ser indisponivel");
    expect(veredicto.causa).toMatch(/ausente ou não é booleano/);
  });

  it("'aprovado' com tipo errado (string em vez de booleano) ⇒ indisponivel", async () => {
    const veredicto = await julgarTexto({ texto: TEXTO_QUALQUER, porta: portaQue({ aprovado: "sim" }), casoDaIndisponibilidade: casoQualquer });
    expect(veredicto.ok).toBe(false);
  });

  it("categoria fora das 8 (inventada) ⇒ indisponivel", async () => {
    const porta = portaQue({ aprovado: false, categorias: ["categoria_que_nao_existe"], explicacao: "motivo qualquer" });
    const veredicto = await julgarTexto({ texto: TEXTO_QUALQUER, porta, casoDaIndisponibilidade: casoQualquer });
    expect(veredicto.ok).toBe(false);
    if (veredicto.ok || veredicto.motivo !== "indisponivel") throw new Error("deveria ser indisponivel");
    expect(veredicto.causa).toMatch(/não é uma das 8/);
  });

  it("'null' como resposta inteira ⇒ indisponivel", async () => {
    const veredicto = await julgarTexto({ texto: TEXTO_QUALQUER, porta: portaQue(null), casoDaIndisponibilidade: casoQualquer });
    expect(veredicto.ok).toBe(false);
  });

  it("string solta como resposta (ex.: JSON quebrado que virou texto cru) ⇒ indisponivel", async () => {
    const veredicto = await julgarTexto({
      texto: TEXTO_QUALQUER,
      porta: portaQue('{ "aprovado": true '), // JSON quebrado, como STRING — nunca lido como objeto
      casoDaIndisponibilidade: casoQualquer,
    });
    expect(veredicto.ok).toBe(false);
  });

  it("array como resposta inteira ⇒ indisponivel", async () => {
    const veredicto = await julgarTexto({ texto: TEXTO_QUALQUER, porta: portaQue(["aprovado"]), casoDaIndisponibilidade: casoQualquer });
    expect(veredicto.ok).toBe(false);
  });

  it("reprovado sem lista de categorias ⇒ indisponivel (reprovação sem categoria não é reprovação legível)", async () => {
    const veredicto = await julgarTexto({
      texto: TEXTO_QUALQUER,
      porta: portaQue({ aprovado: false, categorias: [], explicacao: "motivo qualquer" }),
      casoDaIndisponibilidade: casoQualquer,
    });
    expect(veredicto.ok).toBe(false);
    if (veredicto.ok || veredicto.motivo !== "indisponivel") throw new Error("deveria ser indisponivel");
  });

  it("reprovado sem explicação (ou explicação vazia) ⇒ indisponivel", async () => {
    const veredicto = await julgarTexto({
      texto: TEXTO_QUALQUER,
      porta: portaQue({ aprovado: false, categorias: ["exageros"], explicacao: "  " }),
      casoDaIndisponibilidade: casoQualquer,
    });
    expect(veredicto.ok).toBe(false);
    if (veredicto.ok || veredicto.motivo !== "indisponivel") throw new Error("deveria ser indisponivel");
  });

  it("'aprovado: true' contraditório com categorias reprovadas grudadas ⇒ indisponivel, nunca aprovado", async () => {
    const veredicto = await julgarTexto({
      texto: TEXTO_QUALQUER,
      porta: portaQue({ aprovado: true, categorias: ["exageros"] }),
      casoDaIndisponibilidade: casoQualquer,
    });
    expect(veredicto.ok).toBe(false);
  });

  it("aprovado bem formado, sem ruído extra, é o ÚNICO caminho de sucesso — a metade gêmea de todos os casos acima", async () => {
    const veredicto = await julgarTexto({ texto: TEXTO_QUALQUER, porta: portaQue({ aprovado: true }), casoDaIndisponibilidade: casoQualquer });
    expect(veredicto).toEqual({ ok: true });
  });
});

// ── Critério 7: porta ausente = indisponível, provado (reforço explícito) ───

describe("porta ausente = indisponível, nunca aprovação por omissão", () => {
  it("porta `undefined` nunca é chamada e o veredito nunca é ok:true", async () => {
    const veredicto = await julgarTexto({ texto: TEXTO_QUALQUER, porta: undefined, casoDaIndisponibilidade: null });
    expect(veredicto.ok).toBe(false);
  });
});

// ── Critério 8/9: piso determinístico é responsabilidade de quem chama; aqui
// só confirmamos que este arquivo nunca faz chamada de IA real — todo `porta`
// usado nos testes acima é um `vi.fn` local, nunca um import de provedor. ──

describe("nenhuma chamada de IA real", () => {
  it("os marcadores do envelope são os esperados (documentação executável do contrato)", () => {
    expect(MARCADOR_ABERTURA_DO_JUIZ).toBe("<<<TEXTO_A_JULGAR>>>");
    expect(MARCADOR_FECHAMENTO_DO_JUIZ).toBe("<<<FIM_TEXTO_A_JULGAR>>>");
  });

  it("a porta recebe o texto DELIMITADO, dentro do envelope — nunca o texto cru sozinho", async () => {
    const porta = portaQue({ aprovado: true });
    await julgarTexto({ texto: "conteúdo do cliente", porta, casoDaIndisponibilidade: null });
    expect(porta).toHaveBeenCalledWith({
      textoDelimitado: `${MARCADOR_ABERTURA_DO_JUIZ}\nconteúdo do cliente\n${MARCADOR_FECHAMENTO_DO_JUIZ}`,
      delimitador: MARCADOR_ABERTURA_DO_JUIZ,
    });
  });
});

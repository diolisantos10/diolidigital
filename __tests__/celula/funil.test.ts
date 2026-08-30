// O FUNIL DA OPORTUNIDADE DE MARKETPLACE — as duas metades de cada guarda:
// prova que barra o caso plantado E que não inventa problema no caso limpo.

import { describe, it, expect } from "vitest";
import {
  ESTADOS,
  ESTADO_INICIAL,
  ESTADOS_TERMINAIS,
  TRANSICOES_PERMITIDAS,
  estadoDeclarado,
  estadoAtualOuInicial,
  transicaoPermitida,
  origemDeclarada,
  avaliarTransicao,
  type Estado,
  type OrigemDaTransicao,
} from "@/lib/agency/celula/funil";

// Listada LITERALMENTE aqui, na ordem da ficha — não derivada de `ESTADOS`.
// Um teste que deriva da implementação não testa nada: se alguém apagar um
// estado do array, este teste ainda passaria se comparasse contra si mesmo.
const OS_22_ESTADOS_DA_FICHA = [
  "encontrada",
  "duplicada",
  "recusada_pela_qualificacao",
  "qualificada",
  "abordagem_preparada",
  "aguardando_autorizacao",
  "abordada",
  "respondeu",
  "briefing_em_coleta",
  "briefing_completo",
  "proposta_preparada",
  "proposta_enviada",
  "negociacao",
  "contratada",
  "em_producao",
  "entrega_enviada",
  "ajuste_solicitado",
  "aprovada",
  "ganha",
  "perdida",
  "retomar",
  "excecao_operacional",
];

describe("ESTADOS — o conjunto fechado", () => {
  it("contém exatamente os 22 slugs da ficha, na grafia exata e na ordem exata", () => {
    expect(ESTADOS).toEqual(OS_22_ESTADOS_DA_FICHA);
  });

  it("tem 22 elementos — o Diretor recontou em 30/08/2026 e confirmou: 'encontrada' já é o estado de entrada, não um 23º à parte", () => {
    expect(ESTADOS.length).toBe(22);
  });

  it("o estado inicial é 'encontrada'", () => {
    expect(ESTADO_INICIAL).toBe("encontrada");
  });
});

describe("estadoDeclarado — leitura defensiva de fonte não confiável", () => {
  it("aceita cada um dos 22 estados exatamente como escritos", () => {
    for (const estado of OS_22_ESTADOS_DA_FICHA) {
      expect(estadoDeclarado(estado)).toBe(estado);
    }
  });

  it("rejeita grafia errada, espaço nas pontas, maiúscula, null, número e objeto", () => {
    expect(estadoDeclarado("qualifcada")).toBeNull(); // typo
    expect(estadoDeclarado(" qualificada")).toBeNull(); // espaço à esquerda
    expect(estadoDeclarado("qualificada ")).toBeNull(); // espaço à direita
    expect(estadoDeclarado("QUALIFICADA")).toBeNull(); // maiúscula
    expect(estadoDeclarado("Qualificada")).toBeNull(); // capitalizada
    expect(estadoDeclarado(null)).toBeNull();
    expect(estadoDeclarado(undefined)).toBeNull();
    expect(estadoDeclarado(42)).toBeNull();
    expect(estadoDeclarado({ estado: "qualificada" })).toBeNull();
    expect(estadoDeclarado([])).toBeNull();
    expect(estadoDeclarado("")).toBeNull();
  });
});

describe("estadoAtualOuInicial — fail closed", () => {
  it("devolve 'encontrada' para undefined, null, lixo e string vazia", () => {
    expect(estadoAtualOuInicial(undefined)).toBe("encontrada");
    expect(estadoAtualOuInicial(null)).toBe("encontrada");
    expect(estadoAtualOuInicial("bagunca")).toBe("encontrada");
    expect(estadoAtualOuInicial("")).toBe("encontrada");
    expect(estadoAtualOuInicial(0)).toBe("encontrada");
  });

  it("devolve o estado real quando ele é válido — não prende tudo em 'encontrada'", () => {
    expect(estadoAtualOuInicial("negociacao")).toBe("negociacao");
    expect(estadoAtualOuInicial("ganha")).toBe("ganha");
  });
});

describe("transicaoPermitida / TRANSICOES_PERMITIDAS — a tabela de pares", () => {
  it("aceita uma transição real da tabela", () => {
    expect(transicaoPermitida("encontrada", "qualificada")).toBe(true);
  });

  it("rejeita um par que não está na tabela (pular etapas)", () => {
    expect(transicaoPermitida("encontrada", "ganha")).toBe(false);
    expect(transicaoPermitida("encontrada", "contratada")).toBe(false);
  });

  it("rejeita transição invertida (voltar sem passar por retomar/exceção)", () => {
    expect(transicaoPermitida("ganha", "aprovada")).toBe(false);
  });

  it("todo par de TRANSICOES_PERMITIDAS usa apenas estados do conjunto (guarda contra typo na própria tabela)", () => {
    const conjunto = new Set<string>(ESTADOS);
    for (const [de, para] of TRANSICOES_PERMITIDAS) {
      expect(conjunto.has(de)).toBe(true);
      expect(conjunto.has(para)).toBe(true);
    }
  });

  it("todo estado não-terminal tem ao menos uma saída", () => {
    const origens = new Set(TRANSICOES_PERMITIDAS.map(([de]) => de));
    for (const estado of ESTADOS) {
      if (ESTADOS_TERMINAIS.includes(estado)) continue;
      expect(origens.has(estado), `estado "${estado}" deveria ter ao menos uma transição de saída`).toBe(true);
    }
  });

  it("todo estado, exceto o inicial, tem ao menos uma entrada (beco sem saída é defeito de desenho)", () => {
    const destinos = new Set(TRANSICOES_PERMITIDAS.map(([, para]) => para));
    for (const estado of ESTADOS) {
      if (estado === ESTADO_INICIAL) continue;
      expect(destinos.has(estado), `estado "${estado}" nunca é alcançado por nenhuma transição`).toBe(true);
    }
  });

  it("estados terminais declarados não têm nenhuma transição de saída", () => {
    const origens = new Set(TRANSICOES_PERMITIDAS.map(([de]) => de));
    for (const estado of ESTADOS_TERMINAIS) {
      expect(origens.has(estado)).toBe(false);
    }
  });

  it("excecao_operacional é alcançável de todo estado não-terminal (é a fila de exceção)", () => {
    for (const estado of ESTADOS) {
      if (estado === "excecao_operacional") continue;
      if (ESTADOS_TERMINAIS.includes(estado)) continue;
      expect(
        transicaoPermitida(estado, "excecao_operacional"),
        `"${estado}" deveria poder entrar em excecao_operacional`,
      ).toBe(true);
    }
  });

  it("é possível sair de excecao_operacional para um estado de trabalho", () => {
    expect(transicaoPermitida("excecao_operacional", "em_producao")).toBe(true);
    expect(transicaoPermitida("excecao_operacional", "ganha")).toBe(false); // nunca atalho direto para terminal
    expect(transicaoPermitida("excecao_operacional", "perdida")).toBe(false);
  });
});

describe("as 4 arbitragens do funil (Diretor, 30/08/2026)", () => {
  it("1. ESTADOS_TERMINAIS tem exatamente 3, e nenhum deles tem saída", () => {
    expect(ESTADOS_TERMINAIS).toEqual(["duplicada", "recusada_pela_qualificacao", "ganha"]);
    const origens = new Set(TRANSICOES_PERMITIDAS.map(([de]) => de));
    for (const estado of ESTADOS_TERMINAIS) {
      expect(origens.has(estado), `terminal "${estado}" não deveria ter saída`).toBe(false);
    }
  });

  it("2a. perdida DEIXOU de ser terminal: perdida → retomar é legal, perdida → ganha continua ilegal", () => {
    expect(ESTADOS_TERMINAIS.includes("perdida")).toBe(false);
    expect(transicaoPermitida("perdida", "retomar")).toBe(true);
    expect(transicaoPermitida("perdida", "ganha")).toBe(false);
  });

  it("2b. perdida → excecao_operacional é legal (a fila de exceção alcança todo não-terminal, e perdida agora é não-terminal)", () => {
    expect(transicaoPermitida("perdida", "excecao_operacional")).toBe(true);
  });

  it("2c. a metade limpa: perdida → abordagem_preparada continua ILEGAL — a volta passa obrigatoriamente por retomar", () => {
    expect(transicaoPermitida("perdida", "abordagem_preparada")).toBe(false);
  });

  it("2d. perdida → retomar SEM justificativa continua rejeitada — ninguém ressuscita em silêncio", () => {
    const veredicto = avaliarTransicao({
      de: "perdida",
      para: "retomar",
      autor: "sdr-agent",
      origem: "agente",
      justificativa: "",
    });
    expect(veredicto.ok).toBe(false);
    if (!veredicto.ok) expect(veredicto.codigo).toBe("justificativa_ausente");
  });

  it("2e. perdida → retomar COM justificativa é aceita pelo juiz puro", () => {
    const veredicto = avaliarTransicao({
      de: "perdida",
      para: "retomar",
      autor: "sdr-agent",
      origem: "agente",
      justificativa: "cliente voltou a responder no 99Freelas",
    });
    expect(veredicto.ok).toBe(true);
  });

  it("3a. contratada → perdida e em_producao → perdida são LEGAIS (cancelamento é transição direta)", () => {
    expect(transicaoPermitida("contratada", "perdida")).toBe(true);
    expect(transicaoPermitida("em_producao", "perdida")).toBe(true);
  });

  it("3b. a metade negativa: contratada → ganha e em_producao → aprovada continuam ILEGAIS — não se pula entrega nem aprovação", () => {
    expect(transicaoPermitida("contratada", "ganha")).toBe(false);
    expect(transicaoPermitida("em_producao", "aprovada")).toBe(false);
  });

  it("4. aprovada é a ÚNICA origem que alcança ganha", () => {
    const entradasEmGanha = TRANSICOES_PERMITIDAS.filter(([, para]) => para === "ganha");
    expect(entradasEmGanha.length).toBe(1);
    expect(entradasEmGanha[0][0]).toBe("aprovada");
  });
});

describe("origemDeclarada", () => {
  it("aceita as 4 origens", () => {
    const origens: OrigemDaTransicao[] = ["agente", "gerente", "cliente", "sistema"];
    for (const origem of origens) {
      expect(origemDeclarada(origem)).toBe(origem);
    }
  });

  it("rejeita origem fora das 4, sem cair silenciosamente em 'sistema'", () => {
    expect(origemDeclarada("robo")).toBeNull();
    expect(origemDeclarada("Sistema")).toBeNull();
    expect(origemDeclarada(null)).toBeNull();
    expect(origemDeclarada(undefined)).toBeNull();
    expect(origemDeclarada(7)).toBeNull();
  });
});

describe("avaliarTransicao — o juiz puro", () => {
  const base = {
    de: "qualificada" as unknown,
    para: "abordagem_preparada" as unknown,
    autor: "sdr-agent",
    origem: "agente",
    justificativa: "briefing suficiente para abordagem",
  };

  it("aceita uma transição válida com todos os campos corretos", () => {
    const veredicto = avaliarTransicao(base);
    expect(veredicto.ok).toBe(true);
    if (veredicto.ok) {
      const de: Estado = veredicto.de;
      const para: Estado = veredicto.para;
      expect(de).toBe("qualificada");
      expect(para).toBe("abordagem_preparada");
    }
  });

  it("rejeita estado de origem desconhecido", () => {
    const veredicto = avaliarTransicao({ ...base, de: "qualifcada" });
    expect(veredicto.ok).toBe(false);
    if (!veredicto.ok) {
      expect(veredicto.codigo).toBe("estado_de_desconhecido");
      expect(veredicto.motivo).toMatch(/qualifcada/);
    }
  });

  it("rejeita estado de destino desconhecido", () => {
    const veredicto = avaliarTransicao({ ...base, para: "aprovadaa" });
    expect(veredicto.ok).toBe(false);
    if (!veredicto.ok) {
      expect(veredicto.codigo).toBe("estado_para_desconhecido");
      expect(veredicto.motivo).toMatch(/aprovadaa/);
    }
  });

  it("rejeita par não permitido, citando os dois estados pelo nome no motivo", () => {
    const veredicto = avaliarTransicao({ ...base, de: "encontrada", para: "ganha" });
    expect(veredicto.ok).toBe(false);
    if (!veredicto.ok) {
      expect(veredicto.codigo).toBe("par_nao_permitido");
      expect(veredicto.motivo).toMatch(/encontrada/);
      expect(veredicto.motivo).toMatch(/ganha/);
    }
  });

  it("rejeita transição sem justificativa (undefined)", () => {
    const veredicto = avaliarTransicao({ ...base, justificativa: undefined });
    expect(veredicto.ok).toBe(false);
    if (!veredicto.ok) expect(veredicto.codigo).toBe("justificativa_ausente");
  });

  it("rejeita justificativa só de espaços em branco", () => {
    const veredicto = avaliarTransicao({ ...base, justificativa: "     " });
    expect(veredicto.ok).toBe(false);
    if (!veredicto.ok) expect(veredicto.codigo).toBe("justificativa_ausente");
  });

  it("rejeita justificativa com menos de 3 caracteres úteis", () => {
    const veredicto = avaliarTransicao({ ...base, justificativa: "ok" });
    expect(veredicto.ok).toBe(false);
    if (!veredicto.ok) expect(veredicto.codigo).toBe("justificativa_ausente");
  });

  it("aceita justificativa real, mesmo com espaço nas pontas", () => {
    const veredicto = avaliarTransicao({ ...base, justificativa: "  respondeu no chat, segue para briefing  " });
    expect(veredicto.ok).toBe(true);
  });

  it("rejeita origem fora das 4, sem default silencioso para 'sistema'", () => {
    const veredicto = avaliarTransicao({ ...base, origem: "robo" });
    expect(veredicto.ok).toBe(false);
    if (!veredicto.ok) expect(veredicto.codigo).toBe("origem_desconhecida");
  });

  it("cada uma das 4 origens é aceita quando o resto do pedido é válido", () => {
    for (const origem of ["agente", "gerente", "cliente", "sistema"]) {
      const veredicto = avaliarTransicao({ ...base, origem });
      expect(veredicto.ok, `origem "${origem}" deveria ser aceita`).toBe(true);
    }
  });

  it("rejeita autor ausente / vazio / não-string", () => {
    for (const autor of [undefined, null, "", "   ", 123, {}]) {
      const veredicto = avaliarTransicao({ ...base, autor });
      expect(veredicto.ok, `autor ${JSON.stringify(autor)} deveria ser rejeitado`).toBe(false);
      if (!veredicto.ok) expect(veredicto.codigo).toBe("autor_ausente");
    }
  });
});

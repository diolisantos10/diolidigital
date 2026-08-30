// ─── OS 22 TEXTOS DO CEO — TRAVA CONTRA EDIÇÃO SILENCIOSA ───────────────────
//
// Fonte: docs/celula-prospeccao/despachos/ONDA-2B-A-os-22-textos.md.
//
// Este teste é a prova de que o texto LITERAL do CEO para os modelos
// M01–M22 não vai ser "melhorado" por ninguém depois. Por isso o texto
// esperado é fixado AQUI DENTRO, duplicado do JSON de propósito — é assim
// que a trava funciona: se alguém editar `mensagens.json` para "corrigir"
// gramática ou "adaptar o tom", este teste quebra.
//
// Não usa `toContain` em lugar nenhum da comparação de transcrição —
// `toBe` é igualdade exata, caractere a caractere.

import { describe, expect, it } from "vitest";
import { carregarBiblioteca, modeloParaEnvio } from "@/lib/agency/celula/mensagens/biblioteca";
import mensagensJson from "@/docs/plataformas/99freelas/mensagens.json";

// ── Os 22 textos, literais, exatamente como a ficha do CEO transcreveu ──────
const TEXTOS_ESPERADOS: Record<string, string> = {
  M01: "Olá, [NOME]. Li seu projeto sobre [ENTREGÁVEL] e entendi que você precisa [NECESSIDADE ESPECÍFICA]. Consigo atender essa demanda. Antes de definir o escopo e o prazo, preciso confirmar: [PERGUNTA ESPECÍFICA SOBRE O PROJETO]?",
  M02: "Perfeito. Para eu montar a proposta corretamente, preciso confirmar mais um ponto: [INFORMAÇÃO PENDENTE]?",
  M03: "Pelo que entendi, você precisa de [ENTREGÁVEIS], com [CARACTERÍSTICAS], para [OBJETIVO], dentro do prazo de [PRAZO]. [MATERIAIS] serão fornecidos por você. Está correto ou falta algum ponto importante?",
  M04: "Para concluir o escopo, pode anexar aqui na plataforma [LISTA OBJETIVA DE MATERIAIS]? Assim consigo verificar o que já está pronto e o que precisará ser desenvolvido.",
  M05: "Recebi [ARQUIVO OU CONJUNTO DE ARQUIVOS]. Vou analisar o material junto com o briefing e retorno por aqui com a próxima etapa.",
  M06: "Não consegui abrir o arquivo [NOME]. A plataforma indicou [MOTIVO SEGURO E COMPREENSÍVEL]. Você consegue anexá-lo novamente em [FORMATO ACEITO]?",
  M07: "Com base no que alinhamos, a proposta contempla [ESCOPO RESUMIDO], com entrega em [PRAZO] e investimento de [VALOR], conforme as condições registradas na plataforma. Se estiver de acordo, podemos avançar para a contratação por aqui.",
  M08: "Para entregar todo o escopo descrito, o investimento necessário é [VALOR]. Se precisar manter o orçamento de [ORÇAMENTO DO CLIENTE], consigo ajustar a proposta para [ESCOPO REDUZIDO]. Qual caminho atende melhor neste momento?",
  M09: "Para entregar o escopo completo com segurança, o prazo necessário é [PRAZO REALISTA]. Para atender até [DATA DO CLIENTE], consigo priorizar [ESCOPO POSSÍVEL]. Essa alternativa funciona para você?",
  M10: "Para manter o histórico e a segurança desta negociação, vamos continuar por aqui nesta etapa. Consigo coletar todas as informações, apresentar a proposta e acompanhar o projeto pela própria plataforma.",
  M11: "Obrigado. Nesta etapa, vou manter o briefing, a proposta e a contratação registrados por aqui para preservar o histórico do projeto.",
  M12: "Consigo fazer o briefing por aqui. Vou organizar as perguntas de forma objetiva para não tomar muito do seu tempo.",
  M13: "Consigo apresentar experiência, método e proposta, mas não realizamos produção completa não remunerada. Se for necessário validar uma etapa antes do projeto integral, posso estruturar uma entrega inicial remunerada e com escopo reduzido.",
  M14: "Olá, [NOME]. Passando para confirmar se conseguiu analisar a proposta. Se houver alguma dúvida sobre escopo, prazo ou entrega, posso esclarecer por aqui.",
  M15: "Projeto confirmado. Vou iniciar com [PRIMEIRA ETAPA]. O próximo retorno será [MARCO OU ENTREGA] até [DATA]. Todas as atualizações serão registradas por aqui.",
  M16: "Atualização do projeto: [ETAPA] foi concluída. Agora estamos trabalhando em [PRÓXIMA ETAPA]. A previsão para o próximo envio permanece [DATA].",
  M17: "Concluímos [ENTREGA]. O arquivo [NOME DO ARQUIVO] está anexado para sua avaliação. Por favor, confirme se está aprovado ou indique de forma objetiva os ajustes necessários.",
  M18: "Recebi o pedido de ajuste: [RESUMO OBJETIVO]. Vou aplicar as alterações dentro do escopo acordado e retornar até [PRAZO].",
  M19: "O ajuste solicitado acrescenta [NOVA DEMANDA], que não estava incluída no escopo original. Posso preparar uma ampliação da proposta com prazo e valor correspondentes, ou manter a entrega dentro do escopo contratado. Qual opção você prefere?",
  M20: "A entrega final de [ENTREGÁVEL] foi concluída e o arquivo [NOME] está anexado. Obrigado pela confirmação. Vou manter todo o histórico e os materiais associados a este projeto.",
  M21: "Obrigado pelas informações. Neste momento, não conseguiremos assumir o projeto dentro das condições necessárias de [PRAZO, ESCOPO OU ORÇAMENTO]. Prefiro não confirmar uma entrega que não conseguiríamos cumprir com segurança.",
  M22: "Obrigado pela conversa e pelas informações compartilhadas. Como o projeto foi encerrado, vou finalizar esta oportunidade por aqui. Desejo uma excelente execução.",
};

const CODIGOS = Object.keys(TEXTOS_ESPERADOS);

// ── Casa colchetes: `[NOME]`, `[PRAZO, ESCOPO OU ORÇAMENTO]`... ─────────────
const PADRAO_DE_COLCHETE = /\[([^[\]]+)\]/g;

function extrairVariaveisDoTexto(texto: string): string[] {
  const achados: string[] = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(PADRAO_DE_COLCHETE);
  while ((m = re.exec(texto)) !== null) {
    achados.push(m[1]);
  }
  return achados;
}

// O JSON bruto tem os campos extras (`regrasDoCeo`, `regrasDeAusencia`,
// `palavrasProibidasGlobais`) que NÃO fazem parte do contrato tipado
// `ModeloDeMensagem` — `lerModelo` os ignora de propósito. Para conferir
// esses campos de registro, lemos o JSON bruto diretamente, não a
// biblioteca carregada.
const raiz = mensagensJson as unknown as {
  palavrasProibidasGlobais?: string[];
  modelos: Array<{
    codigo: string;
    regrasDeAusencia?: Array<{ variavel: string; de: string; para: string; fonte: string }>;
  }>;
};

function modeloBrutoPorCodigo(codigo: string) {
  const encontrado = raiz.modelos.find((m) => m.codigo === codigo);
  if (!encontrado) throw new Error(`modelo ${codigo} não encontrado no JSON bruto`);
  return encontrado;
}

// ── 1. Os 22 existem e nenhum tem textoBase vazio ────────────────────────────

describe("os 22 modelos existem e têm textoBase preenchido", () => {
  const biblioteca = carregarBiblioteca();

  it("carrega os 22 sem nenhum inválido", () => {
    expect(biblioteca.invalidos).toEqual([]);
  });

  it.each(CODIGOS)("%s existe na biblioteca e textoBase não está vazio", (codigo) => {
    const modelo = biblioteca.modelos[codigo];
    expect(modelo, `${codigo} deveria existir`).toBeDefined();
    expect(modelo.textoBase.trim().length).toBeGreaterThan(0);
  });
});

// ── 2. Transcrição fixada: igualdade exata, nada de toContain ───────────────

describe("transcrição literal — igualdade exata com o texto do CEO", () => {
  const biblioteca = carregarBiblioteca();

  it.each(CODIGOS)("%s bate caractere a caractere com a ficha do CEO", (codigo) => {
    const modelo = biblioteca.modelos[codigo];
    expect(modelo.textoBase).toBe(TEXTOS_ESPERADOS[codigo]);
  });
});

// ── 3. Os 22 continuam INENVIÁVEIS (estado "rascunho") ──────────────────────

describe("os 22 continuam inenviáveis — transcrever não é aprovar", () => {
  it.each(CODIGOS)("modeloParaEnvio(%s) recusa citando \"rascunho\"", (codigo) => {
    const resultado = modeloParaEnvio(codigo);
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.motivo).toContain("rascunho");
  });
});

// ── 4. Nenhum tem aprovador ───────────────────────────────────────────────

describe("nenhum dos 22 tem aprovador", () => {
  const biblioteca = carregarBiblioteca();

  it.each(CODIGOS)("%s tem aprovador nulo", (codigo) => {
    expect(biblioteca.modelos[codigo].aprovador).toBeNull();
  });
});

// ── 5. Toda variável entre colchetes está declarada, e vice-versa ──────────

describe("colchetes do textoBase batem com variaveisObrigatorias + variaveisOpcionais", () => {
  const biblioteca = carregarBiblioteca();

  it.each(CODIGOS)("%s: todo colchete no texto está declarado, e toda variável declarada aparece no texto", (codigo) => {
    const modelo = biblioteca.modelos[codigo];
    const colchetesDoTexto = new Set(extrairVariaveisDoTexto(modelo.textoBase));
    const declaradas = new Set([...modelo.variaveisObrigatorias, ...modelo.variaveisOpcionais]);

    for (const colchete of colchetesDoTexto) {
      expect(declaradas.has(colchete), `"${colchete}" aparece em [${codigo}] mas não está declarada`).toBe(true);
    }
    for (const variavel of declaradas) {
      expect(colchetesDoTexto.has(variavel), `"${variavel}" está declarada em [${codigo}] mas não aparece como colchete no texto`).toBe(
        true,
      );
    }
  });
});

// ── 6. A lista de proibições literais está na raiz ──────────────────────────

describe("palavrasProibidasGlobais na raiz do JSON", () => {
  it("existe e tem as três strings literais do CEO", () => {
    expect(raiz.palavrasProibidasGlobais).toEqual(["copiei e colei", "somos os melhores", "garantimos resultado"]);
  });
});

// ── 7. regrasDeAusencia de M01 e M14 ────────────────────────────────────────

describe("regrasDeAusencia — M01 e M14", () => {
  it.each(["M01", "M14"])("%s tem regrasDeAusencia apontando para NOME, com \"de\" presente literalmente no textoBase", (codigo) => {
    const bruto = modeloBrutoPorCodigo(codigo);
    expect(bruto.regrasDeAusencia).toBeDefined();
    expect(bruto.regrasDeAusencia!.length).toBeGreaterThan(0);

    const regra = bruto.regrasDeAusencia!.find((r) => r.variavel === "NOME");
    expect(regra, `${codigo} deveria ter regrasDeAusencia para NOME`).toBeDefined();

    const textoEsperado = TEXTOS_ESPERADOS[codigo];
    expect(textoEsperado.includes(regra!.de), `o recorte "de" de ${codigo} deveria aparecer literalmente no textoBase`).toBe(true);
  });

  it.each(CODIGOS.filter((c) => c !== "M01" && c !== "M14"))("%s NÃO tem regrasDeAusencia (lista vazia)", (codigo) => {
    const bruto = modeloBrutoPorCodigo(codigo);
    expect(bruto.regrasDeAusencia ?? []).toEqual([]);
  });
});

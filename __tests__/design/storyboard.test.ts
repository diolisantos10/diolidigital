import { describe, it, expect } from "vitest";

// O CÉREBRO CRIATIVO POR MARCA e a trava de storyboard.
//
// As duas metades, sempre juntas — é o que separa uma trava de um teatro de
// trava: um storyboard BEM-FEITO passa sem atrito, e um com duas telas da mesma
// função (ou com imagem repetida) é barrado NOMEANDO qual tela e por quê.

import {
  conferirStoryboard, lerStoryboardDoCampo, lerTela, semelhancaDeCena, direcaoDaImagem,
  laudoDoStoryboard, FUNCOES, REGUA_CARROSSEL_DE_VENDA, REGUA_REVISTINHA_SEMANAL,
  type TelaDoStoryboard,
} from "@/lib/agency/design/storyboard";
import {
  montarCerebro, composicaoParaFuncao, direcaoDeAmplitude, cerebroVazio, COMPOSICOES,
} from "@/lib/agency/design/repertorio";
import { cerebroDaFoocci, cerebroDaDioli, cerebroDaMarca } from "@/lib/agency/design/repertorio-registrado";
import { montarHtmlDaPeca, moldeDoCliente } from "@/lib/agency/design/molde";

const MARCA = { primaryColor: "#F26522", secondaryColor: "#141414", typography: "Poppins" };

/** Um carrossel bem-feito: quatro papéis diferentes, quatro cenas diferentes. */
const BOM = [
  "1) [gancho] o post-it colado no monitor com o pedido anotado à mão",
  "2) [tensao] a caixa de mensagens do restaurante com dezoito conversas sem resposta",
  "3) [mecanismo] a tela do aplicativo respondendo sozinha enquanto a cozinha trabalha",
  "4) [acao] o entregador saindo pela porta com a sacola da marca na mão",
];

describe("a metade que PASSA — storyboard bem-feito não encontra atrito", () => {
  it("quatro papéis distintos, quatro cenas distintas: aprovado", () => {
    const r = conferirStoryboard(lerStoryboardDoCampo(BOM.join(' ')), REGUA_CARROSSEL_DE_VENDA);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("deveria ter passado");
    expect(r.telas.map((t) => t.funcao)).toEqual(["gancho", "tensao", "mecanismo", "acao"]);
    expect(laudoDoStoryboard(r)).toMatch(/cada uma com papel próprio/);
  });

  it("o papel declarado sobrevive à leitura, e a descrição não leva o colchete junto", () => {
    const t = lerTela("[gancho] o post-it colado no monitor", 1);
    expect(t.funcao).toBe("gancho");
    expect(t.descricao).toBe("o post-it colado no monitor");
  });

  it("acento no papel declarado não quebra a leitura: [tensão] é tensao", () => {
    expect(lerTela("[tensão] a fila na porta", 2).funcao).toBe("tensao");
  });
});

describe("a metade que REPROVA — e nomeia qual tela e por quê", () => {
  it("duas telas com a MESMA função não passam, e as duas são nomeadas", () => {
    const r = conferirStoryboard(
      lerStoryboardDoCampo([
        "1) [gancho] o post-it colado no monitor com o pedido anotado",
        "2) [gancho] a comanda de papel perdida embaixo do balcão",
        "3) [acao] o entregador saindo com a sacola da marca",
      ].join(' ')),
      REGUA_CARROSSEL_DE_VENDA,
    );
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("deveria ter reprovado");
    const rep = r.reprovacoes.find((x) => x.motivo === "funcao_repetida");
    expect(rep).toBeTruthy();
    expect(rep!.telas).toEqual([1, 2]);
    expect(rep!.detalhe).toMatch(/telas 1 e 2/);
    expect(rep!.detalhe).toMatch(/mesma tela publicada 2 vezes/);
  });

  it("IMAGEM REPETIDA não passa — e não há régua que libere", () => {
    const telas: TelaDoStoryboard[] = [
      { ordem: 1, funcao: "gancho", descricao: "o post-it no monitor", imagem: "sha:aaa" },
      { ordem: 2, funcao: "tensao", descricao: "a fila de conversas sem resposta", imagem: "sha:aaa" },
      { ordem: 3, funcao: "acao", descricao: "o entregador na porta com a sacola", imagem: "sha:zzz" },
    ];
    const r = conferirStoryboard(telas, REGUA_CARROSSEL_DE_VENDA);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("deveria ter reprovado");
    const rep = r.reprovacoes.find((x) => x.motivo === "imagem_repetida");
    expect(rep!.telas).toEqual([1, 2]);
    expect(rep!.detalhe).toMatch(/MESMA IMAGEM/);

    // Nem no formato que PERMITE repetir função — a régua da revistinha libera
    // "materia" e continua sem liberar imagem repetida.
    const revista: TelaDoStoryboard[] = [
      { ordem: 1, funcao: "capa", descricao: "a semana em uma cena de bancada de trabalho", imagem: "a" },
      { ordem: 2, funcao: "materia", descricao: "um data center novo iluminado à noite", imagem: "b" },
      { ordem: 3, funcao: "materia", descricao: "uma vitrine de loja com etiqueta digital", imagem: "b" },
      { ordem: 4, funcao: "fechamento", descricao: "a bancada vazia no fim do expediente", imagem: "d" },
    ];
    const r2 = conferirStoryboard(revista, REGUA_REVISTINHA_SEMANAL);
    expect(r2.ok).toBe(false);
    if (r2.ok) throw new Error("deveria ter reprovado");
    expect(r2.reprovacoes.map((x) => x.motivo)).toEqual(["imagem_repetida"]);
  });

  it("CENA repetida com outras palavras é pega antes de virar imagem paga", () => {
    // As duas descrevem a mesma coisa. Sem esta checagem, as duas pedem a mesma
    // foto — e o defeito só apareceria depois de pagas as duas gerações.
    expect(semelhancaDeCena(
      "a mesa do café da manhã com pão quentinho e café preto",
      "pão quentinho e café preto na mesa do café da manhã",
    )).toBeGreaterThanOrEqual(0.7);

    const r = conferirStoryboard(
      lerStoryboardDoCampo([
        "1) [gancho] a mesa do café da manhã com pão quentinho e café preto",
        "2) [tensao] pão quentinho e café preto na mesa do café da manhã",
        "3) [acao] o entregador saindo com a sacola da marca",
      ].join(' ')),
      REGUA_CARROSSEL_DE_VENDA,
    );
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("deveria ter reprovado");
    const rep = r.reprovacoes.find((x) => x.motivo === "cena_repetida");
    expect(rep!.telas).toEqual([1, 2]);
  });

  it("tela sem papel declarado REPROVA — não declarar não é permissão", () => {
    const r = conferirStoryboard(
      lerStoryboardDoCampo([
        "1) [gancho] o post-it no monitor",
        "2) uma foto bonita do prato",
        "3) [acao] o entregador na porta com a sacola",
      ].join(' ')),
      REGUA_CARROSSEL_DE_VENDA,
    );
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("deveria ter reprovado");
    const rep = r.reprovacoes.find((x) => x.motivo === "funcao_nao_declarada");
    expect(rep!.telas).toEqual([2]);
  });

  it("o papel não é ADIVINHADO a partir das palavras da cena", () => {
    // A cena fala de "gancho" e mesmo assim a função é null: inferir seria a
    // casa preenchendo por dedução exatamente onde a declaração é a prova de
    // que alguém pensou na história.
    expect(lerTela("um gancho de açougue pendurado na parede", 1).funcao).toBeNull();
  });

  it("MATERIAL FALTANTE barra a peça e NOMEIA o que precisa vir do cliente", () => {
    const r = conferirStoryboard(
      [
        { ordem: 1, funcao: "gancho", descricao: "o post-it no monitor" },
        {
          ordem: 2, funcao: "prova", descricao: "o painel com o número de pedidos do mês",
          materialFaltante: ["o número real de pedidos do mês", "a captura do painel do cliente"],
        },
        { ordem: 3, funcao: "acao", descricao: "o entregador na porta com a sacola" },
      ],
      REGUA_CARROSSEL_DE_VENDA,
    );
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("deveria ter reprovado");
    const rep = r.reprovacoes.find((x) => x.motivo === "material_faltante")!;
    expect(rep.telas).toEqual([2]);
    expect(rep.detalhe).toMatch(/o número real de pedidos do mês/);
    expect(rep.detalhe).toMatch(/NÃO foi preenchida com imagem genérica/);
  });

  it("abertura e fechamento fora da régua reprovam", () => {
    const r = conferirStoryboard(
      lerStoryboardDoCampo([
        "1) [mecanismo] a tela do aplicativo respondendo sozinha",
        "2) [tensao] a caixa de mensagens sem resposta há dois dias",
        "3) [resultado] a cozinha trabalhando sem parar para o celular",
      ].join(' ')),
      REGUA_CARROSSEL_DE_VENDA,
    );
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("deveria ter reprovado");
    expect(r.reprovacoes.map((x) => x.motivo).sort()).toEqual(["abertura_errada", "fechamento_errado"]);
  });

  it("papel de OUTRO formato não vale neste — capa não entra em carrossel de venda", () => {
    const r = conferirStoryboard(
      lerStoryboardDoCampo([
        "1) [capa] a edição da semana",
        "2) [tensao] a caixa de mensagens sem resposta",
        "3) [acao] o entregador na porta",
      ].join(' ')),
      REGUA_CARROSSEL_DE_VENDA,
    );
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("deveria ter reprovado");
    expect(r.reprovacoes.some((x) => x.motivo === "funcao_fora_da_regua")).toBe(true);
  });
});

describe("o formato NOVO entra como dado — a revistinha não é gambiarra", () => {
  it("a revistinha REPETE 'matéria' de propósito, e a régua diz por quê", () => {
    const edicao = [
      "1) [capa] a bancada de trabalho da semana, com três telas ligadas",
      "2) [materia] um data center novo iluminado à noite no interior",
      "3) [materia] uma vitrine de loja com etiqueta de preço digital",
      "4) [materia] um robô de armazém empilhando caixas numa esteira",
      "5) [fechamento] a bancada vazia com a luz baixa no fim do expediente",
    ];
    const r = conferirStoryboard(lerStoryboardDoCampo(edicao.join(' ')), REGUA_REVISTINHA_SEMANAL);
    expect(r.ok).toBe(true);

    // A permissão é DECLARADA, com motivo escrito — não é um `if` no motor.
    const permissao = REGUA_REVISTINHA_SEMANAL.funcoesQuePodemRepetir!.find((f) => f.funcao === "materia");
    expect(permissao!.porque).toMatch(/a edição É uma sequência de notícias/);
  });

  it("a MESMA régua de venda reprovaria a mesma edição — a diferença é o formato, não o motor", () => {
    const r = conferirStoryboard(
      lerStoryboardDoCampo([
        "1) [capa] a bancada de trabalho da semana",
        "2) [materia] um data center novo iluminado à noite",
        "3) [materia] uma vitrine com etiqueta de preço digital",
        "4) [fechamento] a bancada vazia no fim do expediente",
      ].join(' ')),
      REGUA_CARROSSEL_DE_VENDA,
    );
    expect(r.ok).toBe(false);
  });

  it("a régua da revistinha carrega a procedência do pedido do CEO", () => {
    expect(REGUA_REVISTINHA_SEMANAL.procedencia).toMatch(/CEO em 07\/08\/2026/);
    expect(REGUA_REVISTINHA_SEMANAL.procedencia).toMatch(/uma vez por semana/);
  });
});

describe("o repertório: peça + RAZÃO + resultado, com procedência obrigatória", () => {
  it("entrada SEM PROCEDÊNCIA é recusada — não aceita com aviso", () => {
    const m = montarCerebro({
      marca: "Padaria X",
      repertorio: [{ id: "sem-fonte", composicao: "dividido-curva", razao: ["fica bonito"] }],
    });
    expect(m.cerebro.repertorio).toHaveLength(0);
    expect(m.recusadas[0]!.motivo).toBe("sem_procedencia");
    expect(m.recusadas[0]!.detalhe).toMatch(/gosto da agência virando regra da marca do cliente/);
  });

  it("entrada SEM RAZÃO é recusada — banco de imagem ensina a copiar", () => {
    const m = montarCerebro({
      marca: "Padaria X",
      repertorio: [{ id: "só-a-foto", composicao: "dividido-curva", razao: [], procedencia: "o cliente enviou" }],
    });
    expect(m.cerebro.repertorio).toHaveLength(0);
    expect(m.recusadas[0]!.motivo).toBe("sem_razao");
    expect(m.recusadas[0]!.detalhe).toMatch(/banco de imagem/);
  });

  it("RESULTADO SEM ORIGEM é recusado — número sem origem não vira aprendizado", () => {
    const m = montarCerebro({
      marca: "Padaria X",
      repertorio: [{
        id: "a-que-performou", composicao: "foto-cheia", razao: ["contraste alto"],
        procedencia: "o cliente enviou",
        resultado: { metrica: "alcance", valor: "+40%", origem: "" },
      }],
    });
    expect(m.cerebro.repertorio).toHaveLength(0);
    expect(m.recusadas[0]!.motivo).toBe("resultado_sem_origem");
  });

  it("composição que o molde não sabe desenhar é recusada, não desenhada errado", () => {
    const m = montarCerebro({
      marca: "Padaria X",
      repertorio: [{ id: "x", composicao: "colagem-diagonal" as never, razao: ["r"], procedencia: "p" }],
    });
    expect(m.recusadas[0]!.motivo).toBe("composicao_desconhecida");
    expect(m.recusadas[0]!.detalhe).toContain(COMPOSICOES.join(", "));
  });

  it("formato SEM RÉGUA é recusado — formato sem conferência volta a ser 'só imagens'", () => {
    const m = montarCerebro({
      marca: "Padaria X",
      formatos: [{ id: "novidade", procedencia: "pedido interno" }],
    });
    expect(m.cerebro.formatos).toHaveLength(0);
    expect(m.recusadas[0]!.motivo).toBe("regua_desconhecida");
  });

  it("cérebro vazio DECLARA que está vazio — nunca um cérebro genérico", () => {
    const c = cerebroVazio("Padaria X");
    expect(c.repertorio).toHaveLength(0);
    expect(c.lacunas).toContain("amplitude da marca (os extremos permitidos)");
  });
});

describe("o cérebro DECIDE — a composição sai do papel da tela, não do gosto", () => {
  it("papéis diferentes recebem composições diferentes na Foocci", () => {
    const c = cerebroDaFoocci().cerebro;
    const gancho = composicaoParaFuncao(c, "gancho", "carrossel-de-venda");
    const mecanismo = composicaoParaFuncao(c, "mecanismo", "carrossel-de-venda");
    const acao = composicaoParaFuncao(c, "acao", "carrossel-de-venda");
    expect(gancho!.composicao).toBe("dividido-curva");
    expect(mecanismo!.composicao).toBe("dividido-reto");
    expect(acao!.composicao).toBe("foto-cheia");
    // E cada escolha carrega o PORQUÊ — é o que impede a próxima peça de imitar
    // o formato e perder o motivo.
    expect(gancho!.porque).toMatch(/CAMPO PRÓPRIO/);
  });

  it("papel sem entrada de repertório devolve null — a agência não escolhe pelo cliente", () => {
    const c = cerebroDaFoocci().cerebro;
    expect(composicaoParaFuncao(c, "materia", "carrossel-de-venda")).toBeNull();
    expect(composicaoParaFuncao(c, null)).toBeNull();
  });

  it("marca desconhecida NÃO herda o repertório da Foocci", () => {
    const c = cerebroDaMarca("Padaria do Zé");
    expect(c.repertorio).toHaveLength(0);
    expect(c.lacunas[0]).toMatch(/nenhum cérebro criativo registrado para "Padaria do Zé"/);
    expect(composicaoParaFuncao(c, "gancho")).toBeNull();
  });

  it("nenhum cérebro registrado tem entrada recusada — a casa não guarda o que ela mesma barra", () => {
    for (const m of [cerebroDaFoocci(), cerebroDaDioli()]) {
      expect(m.recusadas).toEqual([]);
      for (const p of m.cerebro.repertorio) {
        expect(p.procedencia.length).toBeGreaterThan(10);
        expect(p.razao.length).toBeGreaterThan(0);
        // Nenhuma tem dado de performance, e é assim que tem de ser hoje:
        // estimativa não entra.
        expect(p.resultado).toBeNull();
      }
    }
    // A Foocci declara o que a casa NÃO tem — o logo real, a assinatura, as peças.
    expect(cerebroDaFoocci().cerebro.lacunas.join(" ")).toMatch(/arquivo REAL do logo/);
  });

  it("a Foocci é achada pelo nome, e a Dioli traz a revistinha", () => {
    expect(cerebroDaMarca("Foocci Tecnologia").repertorio.length).toBeGreaterThan(0);
    const dioli = cerebroDaMarca("Dioli Digital");
    expect(dioli.formatos.map((f) => f.id)).toContain("revistinha-semanal-tech");
    expect(dioli.formatos[0]!.cadencia).toBe("uma vez por semana");
  });
});

describe("a AMPLITUDE: os extremos permitidos, declarados", () => {
  it("a Foocci é democrática por escrito, com a fala do CEO como procedência", () => {
    const c = cerebroDaFoocci().cerebro;
    const eixo = c.amplitude.find((a) => /formalidade/.test(a.eixo))!;
    expect(eixo.extremoA).toMatch(/boteco/);
    expect(eixo.extremoB).toMatch(/bistrô/);
    expect(eixo.procedencia).toMatch(/marca democrática/);
    expect(eixo.foraDaMarca).toContain("luxo como padrão do mês inteiro");
  });

  it("a direção de amplitude vira instrução de prompt — e some quando não existe", () => {
    const texto = direcaoDeAmplitude(cerebroDaFoocci().cerebro);
    expect(texto).toMatch(/os extremos são PERMITIDOS e propositais/);
    expect(texto).toMatch(/NUNCA:/);
    // Vazio é vazio: sem amplitude, o prompt não fala de amplitude.
    expect(direcaoDeAmplitude(cerebroVazio("X"))).toBe("");
  });
});

describe("a imagem como ARGUMENTO, não como fundo", () => {
  it("cada papel diz o que a imagem DELE precisa mostrar", () => {
    expect(direcaoDaImagem("tensao")).toMatch(/o custo visível/);
    expect(direcaoDaImagem("mecanismo")).toMatch(/engrenagem em operação/);
    // Papel desconhecido não inventa direção.
    expect(direcaoDaImagem("vibe")).toBe("");
    expect(direcaoDaImagem(null)).toBe("");
  });

  it("o papel de PROVA exige evidência real e diz o que fazer quando é desenho", () => {
    expect(FUNCOES.prova!.imagemPrecisa).toMatch(/selo de ilustração/);
  });
});

describe("as composições saem no HTML — o cérebro vira pixel", () => {
  const molde = moldeDoCliente(MARCA);
  const base = { formato: "carrossel" as const, titulo: "A conversa que responde sozinha", fundo: "data:image/png;base64,AA" };

  it("foto-cheia continua sendo o default: nenhuma peça muda de cara sem pedido", () => {
    const html = montarHtmlDaPeca({ ...base }, molde);
    expect(html).not.toContain('<div class="painel">');
    expect(html).toContain("linear-gradient(to top");
  });

  it("dividido-reto dá CAMPO PRÓPRIO ao texto e dispensa o degradê", () => {
    const html = montarHtmlDaPeca({ ...base, composicao: "dividido-reto" }, molde);
    expect(html).toContain('<div class="painel">');
    expect(html).toContain("background:none");
    // A foto para de ocupar a tela inteira.
    expect(html).toMatch(/\.foto \{[\s\S]*height:46%;/);
  });

  it("dividido-curva é o mesmo painel com recorte elíptico — a assinatura da referência", () => {
    const html = montarHtmlDaPeca({ ...base, composicao: "dividido-curva" }, molde);
    expect(html).toContain("border-radius:50% 50% 0 0");
  });

  it("no painel o texto NÃO ancora no pé — vazio no meio do campo é a crítica do CEO ao contrário", () => {
    const semBloco = montarHtmlDaPeca({ ...base, composicao: "dividido-reto" }, molde);
    expect(semBloco).toMatch(/justify-content:center/);
    // Com bloco de produto, o texto encosta no alto e o resto é o lugar do
    // PRODUTO — o espaço deixa de ser vazio e passa a ser reservado.
    const comBloco = montarHtmlDaPeca(
      { ...base, composicao: "dividido-reto", mockup: { html: "<div class='mk'></div>", textos: [] } },
      molde,
    );
    expect(comBloco).toMatch(/justify-content:flex-start/);
    // Na foto cheia nada muda: o texto senta no pé, como sempre sentou.
    expect(montarHtmlDaPeca({ ...base }, molde)).toMatch(/justify-content:flex-end/);
  });

  it("nenhuma composição usa text-transform nem fonte de rede", () => {
    for (const c of COMPOSICOES) {
      const html = montarHtmlDaPeca({ ...base, composicao: c }, molde);
      expect(html).not.toMatch(/text-transform/);
      expect(html).not.toMatch(/@import|https?:\/\//);
    }
  });
});

// A RÉGUA DE TEXTO — o que a casa reprova em CÓDIGO, sem consultar modelo.
//
// Origem: raio-X de 13/08/2026. O juiz de qualidade (`quality-auditor.ts`) é uma
// chamada de IA com a instrução `verdict="flag" só se houver problema real`, e
// em 07/08 ele carimbou `quality_ok` em 8 peças que um humano reprovou na hora
// seguinte (`docs/projetos/cityjobs-registro-07-08.md:139`).
//
// ── COMO ESTE ARQUIVO É ESCRITO ─────────────────────────────────────────────
//
// Toda trava tem DUAS metades, e a segunda é a que importa: o que ela barra E o
// que ela deixa passar. Um freio que reprova tudo passa em qualquer teste que
// só meça reprovação — e é desligado na primeira semana de uso.
//
// O corpus de falso positivo vem de verticais que o autor da régua NÃO usou
// para escrevê-la. É lei desta casa desde a 8ª auditoria adversarial
// (`trava-de-texto.ts:75`): medir a trava com o corpus de quem a escreveu deu
// "zero falso positivo" quando o número real era 22,7%.

import { describe, it, expect } from "vitest";
import {
  conferirReguaDoTexto,
  resumirAlegacoes,
  reguaSeAplicaA,
} from "@/lib/agency/execution/regua-do-texto";
import {
  CLASSES_DE_FATO,
  CLASSES_DE_ALEGACAO,
  CLASSES_PROIBIDAS_NA_ARTE,
} from "@/lib/agency/design/trava-de-texto";

/** Atalho legível: a régua reprovou, e por qual classe. */
function classes(texto: string): string[] {
  return conferirReguaDoTexto(texto).violacoes.map((v) => v.classe);
}

// ─── AS FRASES QUE CHEGARAM AO CLIENTE ──────────────────────────────────────
//
// Não são exemplos inventados: são as frases registradas em
// `docs/projetos/cityjobs-registro-07-08.md`, que passaram pelo contrato de
// saída, pelo piso de verdade E pelo juiz de IA, e foram parar no calendário de
// um cliente real. Se um dia a régua deixar de pegá-las, este arquivo grita.

describe("as frases medidas em produção que passaram por tudo", () => {
  it.each([
    ["Tem centenas de vagas esperando por você", "multidão inventada"],
    ["A plataforma aumenta suas chances drasticamente", "promessa vaga"],
    ["Conectamos você com as melhores empresas da região", "superlativo não sustentável"],
    ["Seu próximo trabalho está a um clique", "jargão de robô"],
  ])("reprova %j", (frase, classeEsperada) => {
    const v = conferirReguaDoTexto(frase);
    expect(v.aprovado).toBe(false);
    expect(v.violacoes.map((x) => x.classe)).toContain(classeEsperada);
  });
});

// ─── O QUE A RÉGUA BARRA, classe por classe ─────────────────────────────────

describe("jargão de robô", () => {
  it.each([
    "Uma solução inovadora para o seu negócio",
    "Viemos revolucionar o mercado de estética",
    "A marca que veio para revolucionar",
    "Nosso compromisso com a excelência",
    "Vamos alavancar seus resultados",
    "Pensando fora da caixa desde 2019",
    "Um novo patamar de atendimento",
  ])("reprova %j", (frase) => {
    expect(classes(frase)).toContain("jargão de robô");
  });

  // A metade que impede a régua de comer copy legítima: a palavra solta não
  // basta, o que é jargão é a colocação fixa.
  it.each([
    "Desenvolvemos um método inovador de assar o pão de fermentação natural",
    "A solução para o encanamento fica pronta no mesmo dia",
    "Este é o patamar de acabamento que o marceneiro entrega",
    "Trabalhamos com excelência técnica certificada pelo CREA",
  ])("deixa passar %j", (frase) => {
    expect(classes(frase)).not.toContain("jargão de robô");
  });
});

describe("promessa vaga", () => {
  it.each([
    "O método aumenta suas vendas significativamente",
    "Multiplique seus clientes exponencialmente",
    "Dobre seu faturamento rapidamente",
    "Transforme sua vida com a nossa consultoria",
  ])("reprova %j", (frase) => {
    expect(classes(frase)).toContain("promessa vaga");
  });

  // ESTA é a metade que decidiu o desenho do padrão. Só o verbo de ganho
  // comeria a frase legítima que aparece em quase toda entrega de planejamento
  // — e o especialista de estratégia escreve exatamente assim.
  it.each([
    "O objetivo do trimestre é aumentar as vendas do balcão",
    "A meta combinada com o cliente é dobrar o número de pedidos por delivery",
    "Queremos aumentar o alcance sem aumentar a verba",
    "O curso ensina a organizar a rotina de quem quer mais clientes",
  ])("deixa passar %j", (frase) => {
    expect(classes(frase)).not.toContain("promessa vaga");
  });
});

describe("prova social sem prova", () => {
  it.each([
    "Mais de 500 clientes satisfeitos",
    "Quem já comprou recomenda",
    "Aprovado por milhares de pessoas",
    "Veja o que nossos clientes dizem",
    "Milhares de famílias já confiam na gente",
  ])("reprova %j", (frase) => {
    expect(classes(frase)).toContain("prova social sem prova");
  });

  // A OMISSÃO DELIBERADA: uma pauta legítima PLANEJA colher depoimento real. A
  // régua não pode reprovar o planejamento correto junto com a invenção — a
  // diferença entre planejar colher e fingir ter é o modo do verbo, e está
  // declarada como resíduo no fim de `regua-do-texto.ts`.
  it.each([
    "Semana 3: prova social — pedir depoimento em vídeo ao cliente",
    "Gravar um depoimento real da dona da loja sobre o processo",
    "Pilar de conteúdo: depoimentos de clientes reais, com autorização",
  ])("deixa passar o PLANO de colher prova: %j", (frase) => {
    expect(classes(frase)).not.toContain("prova social sem prova");
  });
});

describe("multidão inventada", () => {
  it.each([
    "São centenas de vagas abertas hoje",
    "Milhares de clientes já passaram por aqui",
    "Mais de 3.000 pedidos entregues",
    "Dezenas de empresas contratando",
    "Já são 12.500 clientes atendidos",
    "5 mil seguidores em três meses",
  ])("reprova %j", (frase) => {
    expect(classes(frase)).toContain("multidão inventada");
  });

  // A contagem pequena é informação operacional legítima, e um padrão que
  // exigisse só o dígito comeria a peça correta o tempo todo.
  it.each([
    "Atendemos 2 pessoas por vez, com hora marcada",
    "Temos 3 vagas abertas nesta semana",
    "São 8 clientes na agenda de sexta",
  ])("deixa passar a contagem pequena: %j", (frase) => {
    expect(classes(frase)).not.toContain("multidão inventada");
  });

  // Sem a âncora em substantivo que um NEGÓCIO alega ter, o padrão comeria
  // afirmação sobre o mundo, que não é alegação comercial.
  it.each([
    "A oliveira leva centenas de anos para dar o melhor azeite",
    "O parque tem milhares de espécies catalogadas",
    "São dezenas de variações da mesma receita pelo país",
  ])("deixa passar %j", (frase) => {
    expect(classes(frase)).not.toContain("multidão inventada");
  });
});

// ─── O CORPUS DE FALSO POSITIVO ─────────────────────────────────────────────
//
// Legendas legítimas de verticais que NÃO foram usadas para escrever a régua.
// Nenhuma pode ser reprovada: cada uma delas reprovada é uma peça boa que não
// chega ao cliente, com a explicação enterrada num campo que ninguém abre.

describe("peça legítima não é reprovada", () => {
  it.each([
    // oficina mecânica
    "Revisão completa com peça original e garantia de 3 meses no serviço prestado",
    // ótica
    "As lentes antirreflexo chegaram e a montagem sai no mesmo dia",
    // floricultura
    "As rosas que chegaram hoje cedo do produtor vão para os arranjos da semana",
    // contabilidade
    "O prazo da declaração fecha em maio e a organização começa agora",
    // nutrição
    "Cada plano alimentar é montado a partir do seu exame, não de tabela pronta",
    // gráfica
    "Trabalhamos com papel reciclado; a oferta depende do fornecedor",
    // arquitetura
    "O mais importante num projeto pequeno é a constância da luz natural",
    // idiomas
    "Quem estuda trinta minutos por dia aprende mais que quem estuda três horas no sábado",
    // padaria
    "A massa descansa doze horas antes de ir ao forno, e é isso que dá o sabor",
    // salão
    "Atendemos com hora marcada de terça a sábado, e o café fica por nossa conta",
  ])("aprova %j", (frase) => {
    expect(conferirReguaDoTexto(frase).aprovado).toBe(true);
  });
});

// ─── FATO NÃO É ALEGAÇÃO ────────────────────────────────────────────────────
//
// O recorte que sustenta o arquivo inteiro. As classes de FATO ficam de fora
// desta régua porque existe cliente para quem elas são verdade — e quem confere
// isso contra o banco é o piso de verdade. Barrá-las aqui reprovaria a peça
// correta do cliente que informou o próprio preço e o próprio telefone.

describe("o que é do piso de verdade não é desta régua", () => {
  it.each([
    "O pão sai por R$ 9,90 a unidade",
    "Chame no (11) 98765-4321",
    "Entrega em 30 minutos no bairro",
    "50% de desconto na segunda unidade",
    "Frete grátis acima de cem reais",
  ])("deixa passar (é fato, conferido contra o cliente): %j", (frase) => {
    expect(conferirReguaDoTexto(frase).aprovado).toBe(true);
  });
});

// ─── UMA LISTA, DOIS USOS ───────────────────────────────────────────────────

describe("a lista é uma só", () => {
  it("a arte continua sendo a soma das duas metades", () => {
    expect(CLASSES_PROIBIDAS_NA_ARTE.length).toBe(
      CLASSES_DE_FATO.length + CLASSES_DE_ALEGACAO.length,
    );
  });

  it("nenhuma classe de fato vazou para a lista de alegação", () => {
    const nomes = new Set(CLASSES_DE_ALEGACAO.map((c) => c.classe));
    for (const proibida of ["preço", "percentual", "telefone ou documento", "prazo", "promessa comercial"]) {
      expect(nomes.has(proibida)).toBe(false);
    }
  });

  it("o que é proibido na legenda é proibido no pixel — nunca o contrário", () => {
    // A arte é o lugar mais restrito da casa. Se um dia alguém puser uma classe
    // de alegação fora de `CLASSES_PROIBIDAS_NA_ARTE`, a peça sairia com no
    // pixel o que a legenda não pode dizer.
    for (const c of CLASSES_DE_ALEGACAO) {
      expect(CLASSES_PROIBIDAS_NA_ARTE).toContain(c);
    }
  });
});

// ─── O PARECER CARREGA A EVIDÊNCIA ──────────────────────────────────────────

describe("a recusa diz qual trecho e qual regra", () => {
  const texto = "Somos a melhor agência da cidade e temos centenas de clientes satisfeitos.";

  it("aponta o fragmento exato que acionou a regra", () => {
    const v = conferirReguaDoTexto(texto);
    expect(v.aprovado).toBe(false);
    for (const violacao of v.violacoes) {
      expect(violacao.achado.length).toBeGreaterThan(0);
      // O trecho é a frase da peça — é o contexto que o autor reconhece.
      expect(violacao.trecho.length).toBeGreaterThan(violacao.achado.length - 1);
    }
  });

  it("o parecer diz o QUÊ, o ONDE e o PORQUÊ", () => {
    const linhas = resumirAlegacoes(conferirReguaDoTexto(texto).violacoes);
    expect(linhas.length).toBeGreaterThan(0);
    for (const linha of linhas) {
      expect(linha).toMatch(/:/);        // a classe
      expect(linha).toMatch(/\(em "/);   // onde
      expect(linha).toMatch(/—/);        // por quê
    }
  });

  it("a mesma regra pelo mesmo fragmento reprova UMA vez", () => {
    const repetido = Array(5).fill("Uma solução inovadora para o seu negócio.").join(" ");
    const v = conferirReguaDoTexto(repetido);
    expect(v.violacoes.filter((x) => x.classe === "jargão de robô").length).toBe(1);
  });
});

// ─── A FRONTEIRA POR TIPO DE ENTREGÁVEL ─────────────────────────────────────

describe("documento interno não passa pela régua", () => {
  it.each(["strategy", "analytics", "report", "financeiro", "brand-kit"])(
    "isenta %s — a agência ANALISA, não fala com o mercado",
    (tipo) => expect(reguaSeAplicaA(tipo)).toBe(false),
  );

  it.each(["social", "video", "campaign", "design"])(
    "confere %s — é peça que fala com o mercado",
    (tipo) => expect(reguaSeAplicaA(tipo)).toBe(true),
  );

  it("tipo ausente ou desconhecido NÃO é isento — ausência não é informação", () => {
    expect(reguaSeAplicaA(undefined)).toBe(true);
    expect(reguaSeAplicaA(null)).toBe(true);
    expect(reguaSeAplicaA("")).toBe(true);
    // Entregável novo nasce protegido; isentá-lo é ato explícito.
    expect(reguaSeAplicaA("formato-que-ainda-nao-existe")).toBe(true);
  });
});

// ─── OBFUSCAÇÃO ─────────────────────────────────────────────────────────────

describe("a régua não cai com truque de digitação", () => {
  // REGRESSÃO: a primeira versão partia a peça em frases pelo ponto, e "3.000"
  // virava "3" + "000" — o padrão de multidão não casava com nenhum dos dois.
  // O número redondo é exatamente a forma da alegação que a régua existe para
  // pegar, e ela falhava calada justo ali. A lição já estava escrita em
  // `piso-de-verdade.ts:247` e eu a repeti mesmo assim.
  it("o ponto do milhar não parte a frase ao meio", () => {
    expect(classes("Mais de 3.000 pedidos entregues")).toContain("multidão inventada");
    expect(classes("Já são 12.500 clientes atendidos")).toContain("multidão inventada");
  });

  it("caixa e acento não escapam", () => {
    expect(conferirReguaDoTexto("SOLUÇÃO INOVADORA").aprovado).toBe(false);
  });

  it("caractere invisível não escapa", () => {
    // Zero-width space no meio da palavra — o que Word e PDF colam.
    expect(conferirReguaDoTexto("solu​ção inovadora").aprovado).toBe(false);
  });

  it("homóglifo cirílico não escapa", () => {
    // "с" cirílico em "clientes satisfeitos": idêntico ao olho, invisível para
    // uma regex latina. `higienizar` dobra antes de julgar.
    expect(conferirReguaDoTexto("сlientes satisfeitos").aprovado).toBe(false);
  });
});

// ─── O RESÍDUO CONHECIDO ────────────────────────────────────────────────────
//
// Travado em teste para que a lacuna NÃO seja silenciosa. Estas frases chegaram
// ao cliente e continuam passando: são promessa contada como história e hype
// sem palavra proibida, e fechá-las exige julgamento de sentido (Onda 5 do P0).
//
// Se um dia alguém fechar uma delas, este teste falha — e é o sinal certo:
// vem aqui, apaga a linha e escreve no cabeçalho o que passou a ser pego.

describe("o resíduo conhecido — declarado, não esquecido", () => {
  it.each([
    "De procurando emprego a CONTRATADO",
    "VAGAS QUENTES HOJE",
    "Empresa em ALTA DEMANDA contratando",
  ])("ainda passa: %j", (frase) => {
    expect(conferirReguaDoTexto(frase).aprovado).toBe(true);
  });
});

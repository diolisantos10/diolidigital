import { describe, it, expect } from "vitest";

// O MOTOR DE MOLDE, parte pura: o que dá para provar sem subir navegador.
// A prova de que a letra SAI CERTA no pixel está em molde-render.test.ts —
// aqui está a prova de que ela sai certa no HTML, e de que cliente sem marca
// não recebe cor inventada.

import {
  moldeDoCliente, montarHtmlDaPeca, textosDaPeca, escaparHtml,
  FORMATOS, formatoDoPost, corValida, tintaSobre, familiaDeclarada, NEUTRO,
} from "@/lib/agency/design/molde";
import {
  travaDeTextoNaArte, tituloDaFonte, temLastroLiteral, CLASSES_PROIBIDAS_NA_ARTE,
  travaDeRotuloNaArte, higienizar, temCaractereInvisivel,
  FORMA_DO_SELO, FORMA_DA_ASSINATURA,
} from "@/lib/agency/design/trava-de-texto";

const MARCA = { primaryColor: "#2F1B12", secondaryColor: "#E7B96B", typography: "Playfair Display" };

describe("o molde por CLIENTE — a tela 6 tem a mesma cara da tela 1", () => {
  it("nasce do BrandBrain: cor, cor de apoio e família tipográfica", () => {
    const m = moldeDoCliente(MARCA);
    expect(m.origem).toBe("marca");
    expect(m.primaria).toBe("#2F1B12");
    expect(m.secundaria).toBe("#E7B96B");
    expect(m.familia).toMatch(/Playfair/);
    expect(m.lacunas).toEqual([]);
  });

  it("o MESMO molde serve feed, story e carrossel — sem redesenhar nada", () => {
    const m = moldeDoCliente(MARCA);
    const html = (formato: "feed" | "story" | "carrossel") =>
      montarHtmlDaPeca({ formato, titulo: "Pão quentinho", assinatura: "Padaria" }, m);
    for (const f of ["feed", "story", "carrossel"] as const) {
      expect(html(f)).toContain("#2F1B12");
      expect(html(f)).toMatch(/Playfair/);
      expect(html(f)).toContain(`width:${FORMATOS[f].largura}px`);
      expect(html(f)).toContain(`height:${FORMATOS[f].altura}px`);
    }
    // E as dimensões são as de publicação, não "mais ou menos".
    expect(FORMATOS.feed).toMatchObject({ largura: 1080, altura: 1350 });
    expect(FORMATOS.story).toMatchObject({ largura: 1080, altura: 1920 });
  });

  it("duas peças do mesmo cliente saem com a mesma identidade", () => {
    const m = moldeDoCliente(MARCA);
    const a = montarHtmlDaPeca({ formato: "carrossel", titulo: "Tela um", indice: { atual: 1, total: 6 } }, m);
    const b = montarHtmlDaPeca({ formato: "carrossel", titulo: "Tela seis", indice: { atual: 6, total: 6 } }, m);
    const identidade = (h: string) => h.slice(0, h.indexOf("<body"));
    // O cabeçalho (cores, fontes, medidas) é IDÊNTICO; só o conteúdo muda.
    expect(identidade(a)).toBe(identidade(b));
    expect(a).toContain("1/6");
    expect(b).toContain("6/6");
  });

  it("o formato do post vira formato de peça — story nunca sai quadrado", () => {
    expect(formatoDoPost("story")).toBe("story");
    expect(formatoDoPost("carousel")).toBe("carrossel");
    expect(formatoDoPost("carrossel")).toBe("carrossel");
    expect(formatoDoPost("feed")).toBe("feed");
    expect(formatoDoPost(null)).toBe("feed");
  });
});

describe("cliente SEM marca definida: vazio é vazio", () => {
  it("sem cor no BrandBrain, entra o molde NEUTRO — declarado, não inventado", () => {
    const m = moldeDoCliente(null);
    expect(m.origem).toBe("neutro");
    expect(m.primaria).toBe(NEUTRO.primaria);
    expect(m.lacunas).toContain("cor primária da marca");
    expect(m.lacunas).toContain("tipografia da marca");
  });

  it("cor inválida é tratada como AUSÊNCIA, não como cor", () => {
    const m = moldeDoCliente({ primaryColor: "azul do mar", secondaryColor: "" });
    expect(m.origem).toBe("neutro");
    expect(corValida("azul do mar")).toBeNull();
    expect(corValida("#ABC")).toBe("#ABC");
  });

  it("sem cor primária, a secundária NÃO é promovida a cor da marca", () => {
    const m = moldeDoCliente({ secondaryColor: "#FF0000" });
    expect(m.origem).toBe("neutro");
    expect(m.primaria).not.toBe("#FF0000");
  });

  it("sem tipografia declarada, a família é a neutra — não se adivinha por segmento", () => {
    expect(familiaDeclarada("").declarada).toBe(false);
    expect(familiaDeclarada("Oswald").chave).toBe("condensada");
  });

  it("a tinta é decidida por CONTRASTE, não por gosto", () => {
    expect(tintaSobre("#FFFFFF")).toBe("#111111");
    expect(tintaSobre("#111111")).toBe("#FFFFFF");
  });
});

describe("o texto no HTML é o texto pedido", () => {
  it("caractere especial não vira marcação — e o DOM continua com o texto certo", () => {
    const m = moldeDoCliente(MARCA);
    const titulo = 'Pão & "manteiga" <do dia>';
    const html = montarHtmlDaPeca({ formato: "feed", titulo }, m);
    expect(html).not.toContain("<do dia>");
    expect(html).toContain(escaparHtml(titulo));
    // A lista que o renderizador confere contra o DOM guarda o texto ORIGINAL.
    expect(textosDaPeca({ formato: "feed", titulo }).map((t) => t.texto)).toEqual([titulo]);
  });

  it("caixa alta do selo é aplicada em JS, nunca por CSS", () => {
    // `text-transform` pinta uma coisa e deixa outra no DOM — seria o ponto
    // cego exato que o conferidor de letra existe para fechar.
    const html = montarHtmlDaPeca({ formato: "feed", titulo: "Oi", selo: "produto" }, moldeDoCliente(MARCA));
    expect(html).not.toMatch(/text-transform/);
    expect(textosDaPeca({ formato: "feed", titulo: "Oi", selo: "produto" })[0]!.texto).toBe("PRODUTO");
  });

  it("o molde não busca nada na rede — fonte que não carrega troca a cara da peça em silêncio", () => {
    const html = montarHtmlDaPeca({ formato: "feed", titulo: "Oi" }, moldeDoCliente(MARCA));
    expect(html).not.toMatch(/@import|https?:\/\/fonts|<script/);
  });
});

describe("a trava do pixel: o que pode virar imagem", () => {
  const legenda = "Todo dia às seis o pão sai do forno e a casa inteira cheira a manhã. Vem tomar café #padaria";

  it("o título é PREFIXO literal da legenda — lastro por construção", () => {
    const t = tituloDaFonte(legenda);
    expect(t).toBe("Todo dia às seis o pão sai do forno e a casa inteira cheira a manhã");
    expect(temLastroLiteral(t, legenda)).toBe(true);
    expect(travaDeTextoNaArte(t, legenda).ok).toBe(true);
  });

  it("texto que NÃO está no conteúdo auditado não vira pixel", () => {
    const v = travaDeTextoNaArte("O melhor pão artesanal da região", legenda);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(["sem_lastro_no_conteudo_auditado", "classe_de_fato_proibida"]).toContain(v.motivo);
  });

  it("PREÇO não entra na arte nem com lastro — corrigir um PNG publicado é apagar o post", () => {
    const fonte = "Pão de queijo por R$ 12,90 na padaria";
    const v = travaDeTextoNaArte("Pão de queijo por R$ 12,90", fonte);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.motivo).toBe("classe_de_fato_proibida");
  });

  it("telefone, percentual, prazo e promessa comercial também ficam fora", () => {
    const casos = [
      ["Ligue 11 98888-7777", "Ligue 11 98888-7777 agora"],
      ["30% de desconto", "30% de desconto hoje"],
      ["Entrega em 30 min", "Entrega em 30 min na sua casa"],
      ["Frete grátis", "Frete grátis para a cidade"],
      ["O melhor da cidade", "O melhor da cidade sem dúvida"],
    ];
    for (const [texto, fonte] of casos) {
      const v = travaDeTextoNaArte(texto!, fonte!);
      expect(v.ok, `deveria barrar: ${texto}`).toBe(false);
    }
    expect(CLASSES_PROIBIDAS_NA_ARTE.length).toBeGreaterThan(5);
  });

  it("legenda sem frase utilizável → título vazio, e a peça sai só com a foto", () => {
    // Legenda só de hashtag não tem chamada: uma palavra solta não é título.
    expect(tituloDaFonte("#padaria #paoquentinho")).toBe("");
    expect(tituloDaFonte("   ")).toBe("");
    expect(travaDeTextoNaArte("", "qualquer coisa").ok).toBe(false);
  });

  it("o corte respeita fronteira de palavra e não inventa reticências", () => {
    const t = tituloDaFonte("Bastidor da madrugada na padaria do bairro com fermentação natural lenta", 40);
    expect(t.length).toBeLessThanOrEqual(40);
    expect(t).not.toMatch(/…|\.\.\./);
    expect(temLastroLiteral(t, "Bastidor da madrugada na padaria do bairro com fermentação natural lenta")).toBe(true);
  });

  // O DEFEITO MENOR da 7ª auditoria: o `\s+ → " "` acontecia ANTES do `search`,
  // o ramo `\n` era inalcançável e a legenda de três linhas virava um título
  // emendado de 68 caracteres. Comportamento documentado ≠ comportamento real.
  it("legenda MULTILINHA para na primeira linha — não emenda as três", () => {
    const t = tituloDaFonte("Pão quentinho na porta de casa\nSegunda linha que não é a chamada\nTerceira");
    expect(t).toBe("Pão quentinho na porta de casa");
  });
});

// ── A 7ª AUDITORIA ADVERSARIAL (05/08/2026) ─────────────────────────────────
//
// A regra que estes testes obedecem: O ADVERSÁRIO ESCOLHE A FORMA DA ENTRADA.
// A rodada anterior media a trava com a formatação canônica que o próprio autor
// tinha escolhido ("R$ 12,90", "30%", "Ligue 11 98888-7777") — prova circular:
// ela só mostrava que a regex casa com o exemplo de onde a regex saiu.
// Aqui a entrada vem torta de propósito: invisível no meio, largura total,
// por extenso, gíria e controle de direção.

describe("B1 — a trava não pode cair com UM caractere invisível", () => {
  const ZWSP = "​";      // zero-width space
  const SOFT = "­";      // soft hyphen — o que Word e PDF colam
  const NBSP = " ";
  const WJ = "⁠";        // word joiner

  // Estes DOIS renderizam no pixel como "R$ 19,90": a peça sairia com preço
  // dentro do PNG, exatamente a falha que o cabeçalho da trava existe para
  // impedir. O lastro sobrevivia porque `normalizar` virava o invisível em
  // espaço nos DOIS lados.
  const ATAQUES: Array<[string, string]> = [
    ["zero-width space no R$", `So hoje: R${ZWSP}$ 19${ZWSP},90 o kilo`],
    ["soft hyphen no R$", `So hoje: R${SOFT}$ 19${SOFT},90 o kilo`],
    ["zero-width no telefone", `Peca pelo 11${ZWSP} 98765${ZWSP} 4321`],
    ["zero-width no meio da promessa", `Cafe gr${ZWSP}atis na compra do pao`],
    ["zero-width na data", `Valido ate 12${ZWSP}/08`],
    ["NBSP no lugar do espaço", `Preco${NBSP}de${NBSP}R$${NBSP}5,00`],
    ["word joiner no percentual", `Desconto de 30${WJ}% agora`],
    ["largura total (NFKC)", "Ｒ＄ １９，９０ o kilo"],
    ["dígito matemático estilizado", "Custa R$ \u{1D7CF}\u{1D7D7},90 o kilo"],
  ];

  it.each(ATAQUES)("%s NÃO vira pixel", (_nome, texto) => {
    // Fonte = o próprio texto: o cenário MAIS favorável ao atacante, em que o
    // lastro literal é dado de graça. Mesmo assim tem de barrar por classe.
    const v = travaDeTextoNaArte(texto, texto);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.motivo).toBe("classe_de_fato_proibida");
  });

  it("`higienizar` é o que fecha o buraco — e ele é observável", () => {
    expect(higienizar(`R${ZWSP}$ 19${SOFT},90`)).toBe("R$ 19,90");
    expect(higienizar(`a${NBSP}b`)).toBe("a b");
    expect(higienizar("Ｒ＄ ９０")).toBe("R$ 90");
    expect(temCaractereInvisivel(`a${ZWSP}b`)).toBe(true);
    expect(temCaractereInvisivel("ab")).toBe(false);
    // Regex com flag `g` guarda `lastIndex`: o portão não pode alternar entre
    // passar e barrar quando chamado duas vezes com a mesma string.
    expect(temCaractereInvisivel(`a${SOFT}b`)).toBe(temCaractereInvisivel(`a${SOFT}b`));
  });

  it("o texto DEVOLVIDO pela trava é o higienizado — é ele que vira pixel", () => {
    const fonte = `Pao quentinho${ZWSP} todo dia na padaria`;
    const v = travaDeTextoNaArte(`Pao quentinho${ZWSP} todo dia`, fonte);
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.texto).toBe("Pao quentinho todo dia");
      expect(temCaractereInvisivel(v.texto)).toBe(false);
    }
  });
});

describe("S3 — controle de direção (bidi) não chega ao pixel", () => {
  // O ponto cego do conferidor de DOM: `montarPeca` com "Pao ‮oirartnoc‬" era
  // APROVADO — o DOM batia caractere a caractere com o pedido, e o pixel
  // mostrava a palavra invertida. Conferir igualdade não pega isso.
  it("o override de direção é removido na entrada, não conferido na saída", () => {
    const t = "Pao ‮oirartnoc‬ quentinho";
    const v = travaDeTextoNaArte(t, t);
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.texto).toBe("Pao oirartnoc quentinho");
      expect(temCaractereInvisivel(v.texto)).toBe(false);
    }
  });

  it("bidi isolado (U+2066–U+2069) também some", () => {
    expect(higienizar("a⁦b⁩c")).toBe("abc");
    expect(temCaractereInvisivel("a⁧b")).toBe(true);
  });
});

describe("S1 — as classes pegam a forma que a LÍNGUA usa, não só a canônica", () => {
  // Cada linha é uma forma que VIRAVA PIXEL antes de 05/08/2026.
  const ADVERSARIAIS: Array<[string, string]> = [
    ["prazo", "So hoje"],
    ["prazo", "Amanha na loja"],
    ["prazo", "Ate domingo"],
    ["prazo", "Ultimo dia"],
    ["prazo", "Nesta sexta tem pao doce"],
    ["prazo", "Por tempo limitado"],
    ["prazo", "Ultimas horas"],
    ["promessa comercial", "De graca no balcao"],
    ["promessa comercial", "Ganhe um brinde"],
    ["promessa comercial", "Leve tres pague dois"],
    ["promessa comercial", "2 por 1 na padaria"],
    ["promessa comercial", "Na compra do pao, o cafe"],
    ["superlativo não sustentável", "O mais gostoso da cidade"],
    ["superlativo não sustentável", "Sabor incomparavel"],
    ["superlativo não sustentável", "Top 1 da regiao"],
    ["percentual", "Cinquenta por cento a menos"],
    ["percentual", "Metade do preco"],
    ["telefone ou documento", "Onze nove oito sete seis cinco"],
    ["preço", "Vinte pila"],
    ["preço", "Vinte conto"],
    ["preço", "A partir de 10 reais"],
  ];

  it.each(ADVERSARIAIS)("[%s] %s não vira pixel nem com lastro", (classe, texto) => {
    const v = travaDeTextoNaArte(texto, texto);
    expect(v.ok, `passou: ${texto}`).toBe(false);
    if (!v.ok) {
      expect(v.motivo).toBe("classe_de_fato_proibida");
      expect(v.detalhe).toContain(classe);
    }
  });

  // A 8ª auditoria mediu `hoje` nu como FALSO POSITIVO em duas verticais
  // ("Hoje é dia de sorrir sem medo"). A troca está escrita no cabeçalho da
  // trava e no resíduo: o que vira PRAZO é o dia COM companhia de urgência.
  it("'hoje' com companhia de urgência é prazo; 'hoje' nu não é", () => {
    for (const t of ["So hoje", "Somente hoje", "So ate hoje", "Hoje so ate as 18 h", "Aproveite hoje"]) {
      expect(travaDeTextoNaArte(t, t).ok, `deveria barrar: ${t}`).toBe(false);
    }
    for (const t of ["Hoje é dia de sorrir sem medo", "A rosa que chegou hoje cedo do produtor"]) {
      expect(travaDeTextoNaArte(t, `${t} — e o resto`).ok, `deveria passar: ${t}`).toBe(true);
    }
    // `amanha` e `hj` continuam nus: os dois só existem prometendo data.
    for (const t of ["Amanha na loja", "Tem pao doce hj"]) {
      expect(travaDeTextoNaArte(t, t).ok, t).toBe(false);
    }
  });
});

describe("obfuscação: o que a trava fecha, e o que ela NÃO fecha", () => {
  const FECHADOS: Array<[string, string]> = [
    ["letra espaçada", "G R A T I S hoje na loja"],
    ["letra com ponto", "G.R.A.T.I.S no balcao"],
    ["keycap de emoji no telefone", "Ligue 1️⃣1️⃣9️⃣8️⃣7️⃣6️⃣5️⃣4️⃣3️⃣2️⃣1️⃣"],
    ["preço por extenso sem símbolo", "Sai por dezenove e noventa"],
    ["superlativo indireto", "Ninguem faz igual"],
    ["superlativo indireto (2ª pessoa)", "Voce nunca comeu um pao assim"],
    ["promessa velada", "O cafe fica por nossa conta"],
    ["desconto disfarçado", "Pergunte pela condicao especial"],
  ];

  it.each(FECHADOS)("%s não vira pixel", (_nome, texto) => {
    expect(travaDeTextoNaArte(texto, texto).ok, texto).toBe(false);
  });

  // ── ITEM 2 DA 8ª AUDITORIA: A REGRA DOS TESTES DE OBFUSCAÇÃO ──────────────
  // O caso antigo era `"Sо hoje: Р$ 19,90"` — barrado por `hoje` E por `19,90`,
  // com o homóglifo sem participar do veredito. O teste passava e o quadrante
  // ficava registrado como coberto; "Рromocao da semana" passava inteiro.
  //
  // A regra: TESTE DE TRAVA QUE AFIRMA FECHAR UMA OBFUSCAÇÃO TEM DE USAR CASO
  // EM QUE SÓ AQUELA OBFUSCAÇÃO DECIDE. Cada par abaixo prova as duas metades:
  // a versão latina barra (logo a classe existe), e a versão com UMA letra
  // trocada barra pelo MESMO motivo (logo o homóglifo não é rota de fuga).
  const HOMOGLIFO_ISOLADO: Array<[string, string, string]> = [
    ["cirílico Р (U+0420)", "Promocao da semana", "Рromocao da semana"],
    ["cirílico О (U+041E)", "Oferta especial", "Оferta especial"],
    ["cirílico С (U+0421)", "Cupom na loja", "Сupom na loja"],
    ["cirílico А (U+0410)", "Ate domingo", "Аte domingo"],
    ["grego α (U+03B1)", "Frete gratis", "Frete grαtis"],
    ["cirílico М (U+041C)", "Menor preco da regiao", "Мenor preco da regiao"],
  ];

  it.each(HOMOGLIFO_ISOLADO)("%s: só a letra trocada muda, e o veredito não muda", (_n, latino, trocado) => {
    // Nenhum dos dois tem preço, dígito ou "hoje": quem decide é a classe da
    // palavra, e nada mais.
    const a = travaDeTextoNaArte(latino, latino);
    const b = travaDeTextoNaArte(trocado, trocado);
    expect(a.ok, `o caso latino tem de barrar, senão o teste não prova nada: ${latino}`).toBe(false);
    expect(b.ok, `passou com homóglifo: ${trocado}`).toBe(false);
    if (!a.ok && !b.ok) expect(b.detalhe).toBe(a.detalhe);
  });

  it("o homóglifo morre na ENTRADA — o texto devolvido para o pixel já é latino", () => {
    // Se ele morresse só no julgamento, sobraria a peça que passa nas classes e
    // vira pixel com cirílico dentro: legível ao olho, ilegível para a próxima
    // conferência de texto.
    expect(higienizar("Рromocao")).toBe("Promocao");
    expect(higienizar("Сafe da manha")).toBe("Cafe da manha");
    const v = travaDeTextoNaArte("Раo quentinho todo dia", "Pao quentinho todo dia na padaria");
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.texto).toBe("Pao quentinho todo dia");
  });

  it("alfabeto FORA da tabela cai no rótulo pela forma — `\\p{L}` aceitava qualquer script", () => {
    // Copta Ⲟ (U+2C9E) não está na tabela de homóglifos, e não precisa estar:
    // rótulo desta casa é escrito em alfabeto latino.
    const v = travaDeRotuloNaArte("Ⲟferta", FORMA_DO_SELO);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.motivo).toBe("rotulo_fora_de_forma");
    // E o selo latino normal continua entrando.
    expect(travaDeRotuloNaArte("Bastidores", FORMA_DO_SELO).ok).toBe(true);
    expect(travaDeRotuloNaArte("Portfólio", FORMA_DO_SELO).ok).toBe(true);
  });

  // ── O RESÍDUO, DITO COM TODAS AS LETRAS ───────────────────────────────────
  // Este teste existe para a tese não ficar maior que o código. Se um dia
  // alguém fechar um destes, o teste fica VERMELHO e obriga a mexer aqui — a
  // lacuna deixa de ser silenciosa nos dois sentidos.
  const AINDA_PASSAM = [
    "Cafe gratiz na compra",          // grafia errada de propósito (leet/typo)
    "Pao por 5",                      // quantia nua, sem verbo e sem unidade
    "Enquanto o forno estiver aceso", // prazo perifrástico, sem marcador
    "Chame no zap da padaria",        // canal de contato sem número
    "Hoje tem pao doce",              // dia corrente SEM marcador de urgência
  ];

  it("o resíduo conhecido é 5 formas — regex não fecha semântica", () => {
    const passaram = AINDA_PASSAM.filter((t) => travaDeTextoNaArte(t, t).ok);
    expect(passaram).toEqual(AINDA_PASSAM);
    // As quatro primeiras exigem julgamento de sentido (LLM-judge): qualquer
    // regex larga o bastante para pegá-las come legenda legítima.
    //
    // A QUINTA É DIFERENTE, e por isso está escrita aqui: ela não é uma lacuna
    // herdada, é uma TROCA feita em 05/08/2026. `hoje` era barrado nu, e nu ele
    // custava 2 falsos positivos medidos em legenda legítima. O que ficou
    // barrado é o dia COM companhia de urgência — a forma que de fato afirma
    // prazo. Quem quiser desfazer a troca desfaz aqui, com o número na mão.
  });

  it("a sexta família — homóglifo fora da tabela — está aberta no TEXTO e fechada no RÓTULO", () => {
    // Copta/armênio/cherokee não estão em `HOMOGLIFOS`. No rótulo o alfabeto
    // latino barra; no texto livre passa, e a lacuna é declarada, não silenciosa.
    expect(travaDeRotuloNaArte("Ⲟferta", FORMA_DO_SELO).ok).toBe(false);
    expect(travaDeTextoNaArte("Ⲟferta especial", "Ⲟferta especial").ok).toBe(true);
  });
});

describe("S1 — a metade do FALSO POSITIVO, medida", () => {
  // A trava que barra tudo protege tanto quanto a que não barra nada: ela
  // apaga a camada de texto de toda peça, em silêncio. Estas são legendas
  // legítimas de padaria — o custo da trava é ZERO aqui, e o teste falha se
  // algum padrão novo começar a comê-las.
  const LEGITIMAS = [
    "Todo dia às seis o pão sai do forno e a casa inteira cheira a manhã",
    "Aberto das 7 às 19 h",            // horário de funcionamento, não prazo
    "Bastidor da madrugada na padaria do bairro",
    "Pão de fermentação natural feito à mão",
    "A massa descansando desde a madrugada",
    "O forno aceso e o cheiro na rua",
    "Café passado na hora, do jeito da vovó",
    "Nossa equipe começa antes do sol",
    "Receita de família, com farinha do moinho",
    "Pão & manteiga, o começo de tudo",
    "Quem passa aqui sente o cheiro de longe",
    "Bolo de fubá saindo agora do forno",
    "A padaria do seu bairro desde 1998",
    "Conto de fadas tem final feliz, pão bom também",  // "conto" sem quantidade
  ];

  it.each(LEGITIMAS)("legenda legítima continua virando pixel: %s", (texto) => {
    const v = travaDeTextoNaArte(texto, `${texto} — e o resto da legenda`);
    expect(v.ok, v.ok ? "" : `${v.motivo}: ${v.detalhe}`).toBe(true);
  });

  // ⚠️ ESTE CONJUNTO NÃO MEDE O DETECTOR. Ele foi escrito pelo mesmo autor das
  // regexes, no mesmo commit, na única vertical que ele tinha na cabeça. O zero
  // que ele produz mede o CORPUS. A 8ª auditoria mostrou o tamanho do engano:
  // 22,7% de falso positivo assim que a medição saiu da padaria. A medição que
  // vale está no bloco seguinte, em verticais que o autor não usou.
  it("na vertical do autor o falso positivo é zero — e isso, sozinho, não prova nada", () => {
    const barradas = LEGITIMAS.filter((t) => !travaDeTextoNaArte(t, t).ok);
    expect(barradas).toEqual([]);
    expect(LEGITIMAS.length).toBeGreaterThanOrEqual(14);
  });

  it("horário de funcionamento NÃO é prazo — o falso positivo nomeado pela auditoria", () => {
    // `/\b\d{1,2}\s*h\b/` derrubava "Aberto das 7 às 19 h" e a legenda legítima
    // perdia a camada de texto inteira, em silêncio. Duração com unidade
    // ESCRITA continua barrada, que é o que "prazo" quer dizer.
    expect(travaDeTextoNaArte("Aberto das 7 às 19 h", "Aberto das 7 às 19 h").ok).toBe(true);
    expect(travaDeTextoNaArte("Entrega em 2 horas", "Entrega em 2 horas").ok).toBe(false);
    expect(travaDeTextoNaArte("Fica pronto em 30 min", "Fica pronto em 30 min").ok).toBe(false);
  });
});

// ── A 8ª AUDITORIA ADVERSARIAL (05/08/2026): AS DUAS TAXAS, NO MESMO CORPUS ──
//
// A regra que este bloco existe para não deixar cair de novo: **o corpus de
// medição vem de vertical que o autor da regra não usou, e as duas taxas saem
// na mesma rodada.** As oito verticais abaixo não aparecem nem no corpus do
// autor (padaria) nem no da 8ª auditoria (odonto, academia, restaurante,
// imobiliária, salão, pet, advocacia, moda).
//
// Medido antes/depois do conserto de 05/08/2026:
//                        FP (texto)      FN (texto)     FN (selo)
//   corpus novo        14,3% →  0,0%   43,8% → 0,0%   90,0% → 0,0%
//   corpus de borda    62,9% →  2,9%   48,0% → 0,0%   87,5% → 0,0%
describe("S4 — as duas taxas, medidas em vertical que o autor da regra não usou", () => {
  // Legendas legítimas. Metade delas encosta DE PROPÓSITO num padrão da trava
  // (preço, ganha, hoje, melhor, único, sem, liquida, mais) — é na borda que o
  // falso positivo mora, não no meio.
  const LEGITIMAS_NOVAS = [
    "Revisão feita com peça original e checagem de filtro",
    "Explicamos o orçamento antes de encostar no carro",
    "Atendemos de segunda a sexta, das 8 às 18 h",
    "O preço da peça depende do modelo do carro",
    "Ganha vida útil o motor que troca o óleo na hora certa",
    "A maior parte das falhas aparece antes no barulho",
    "Sem pressa: cada carro sai quando está pronto",
    "Cada armação é escolhida junto com você",
    "O exame de vista leva o tempo que precisar",
    "Sem receita atualizada não montamos a lente",
    "A armação que combina com você é a melhor para você",
    "Cada rosto tem um formato único de armação",
    "O mais indicado para quem dirige à noite",
    "Cada buquê é montado na hora do pedido",
    "Arranjo de mesa para o almoço de domingo",
    "A rosa que chegou hoje cedo do produtor",
    "Hoje é dia de flor amarela na casa da gente",
    "A rosa que dura mais é a que bebe água limpa",
    "Ninguém tem obrigação de decorar prazo fiscal",
    "Nunca é tarde para organizar a contabilidade da empresa",
    "Cada empresa tem um regime mais adequado ao seu caso",
    "O melhor caminho depende do seu faturamento",
    "Ninguém consegue guardar toda a legislação na cabeça",
    "Prêmio de seguro entra como despesa dedutível",
    "A partir de agora o MEI declara pelo aplicativo",
    "A partir de segunda o escritório abre às 8 h",
    "Você nunca está sozinho na sala de conversação",
    "O mais importante é praticar toda semana",
    "Cada aluno tem um ritmo único",
    "Você nunca vai aprender ouvindo em silêncio",
    "Ganha fluência quem fala errado sem medo",
    "O curso mais curto não é o mais fraco",
    "Dieta líquida não é atalho",
    "Quem come melhor dorme melhor",
    "O prato perfeito não existe",
    "Sopa liquida a fome sem pesar no estômago",
    "Queima de gordura não acontece em uma semana",
    "O maior erro é cortar tudo de uma vez",
    "Ganha tempo quem manda o arquivo em PDF fechado",
    "Papel offset custa menos que couché",
    "Marcenaria sob medida aproveita canto que ninguém usa",
    "Luz natural é o material mais barato do projeto",
    "O antes e o depois do apartamento de 42 m²",
    "O projeto perfeito é o que cabe na vida de quem mora",
    "Cada obra tem um ritmo próprio e único",
  ];

  // O adversário que NÃO exige adversário: é a legenda comercial comum das
  // mesmas verticais, a que um modelo escreve sozinho.
  const COMERCIAIS_NOVAS = [
    "Descontão de outono na oficina", "Ofertão da semana na ótica",
    "Feirão do buquê", "Promocional do mês na gráfica",
    "Liquida tudo antes da reforma", "Preço baixo todo dia na floricultura",
    "Sem juros no cartão", "Zero taxa de entrega",
    "Entrega sem custo para o bairro", "Descontinho pra quem indicar um amigo",
    "Ofertaço em armação de grau", "Menor preço da praça em cartão de visita",
    "Preço justo, sempre", "Parcelamos sem entrada",
    "Liquidação de armação antiga", "Compre já a sua consultoria",
    "Garanta já a sua vaga na turma", "Descontaço na revisão",
    "Ofertinha da semana em papel couché", "Promoção relâmpago na ótica",
    "Liquidamos o estoque de moldura", "Queima de estoque de papel",
    "Zero tarifa na primeira mensalidade", "Melhor preço em cartão de visita",
    "Preço de fábrica em adesivo", "Adquira já o seu plano anual",
    "Reserve agora a sua avaliação",
    "Revisão a partir de R$ 199", "A troca de óleo custa cento e cinquenta",
    "Sai por trinta pila o cartão", "Cinquenta por cento na segunda armação",
    "Metade do preço na segunda lente", "Fale no 11 98888-7777",
    "Mande o CNPJ para o orçamento", "Só hoje na floricultura",
    "Últimas vagas na turma de conversação", "Válido até sexta",
    "Projeto pronto em 15 dias", "Nesta quarta tem aula aberta",
    "Ganhe um brinde na compra da armação", "Frete grátis para o buquê",
    "Leve três pague dois em adesivo", "Sorteio de um projeto de interiores",
    "O laudo fica por nossa conta", "A melhor gráfica da cidade",
    "Resultado garantido na dieta", "Ninguém faz igual na marcenaria",
    "Atendimento imbatível na oficina", "O mais vendido da loja",
    "O maior estoque da região", "Melhor atendimento do bairro",
    "O único no mercado com garantia vitalícia", "O mais procurado da loja",
    "Ninguém entrega igual", "Você nunca viu uma lente assim",
  ];

  it("FALSO POSITIVO ≤ 5% — legenda legítima de vertical nova continua virando pixel", () => {
    const barradas = LEGITIMAS_NOVAS.filter((t) => !travaDeTextoNaArte(t, `${t} — e o resto da legenda`).ok);
    // Antes de 05/08/2026 este número era 8 (e 22 no corpus de borda inteiro).
    expect(barradas, `barradas: ${JSON.stringify(barradas)}`).toEqual([]);
    expect(LEGITIMAS_NOVAS.length).toBeGreaterThanOrEqual(45);
  });

  it("FALSO NEGATIVO = 0 — a legenda comercial comum não vira pixel", () => {
    // Fonte = o próprio texto: lastro dado de graça, o cenário mais favorável.
    const passaram = COMERCIAIS_NOVAS.filter((t) => travaDeTextoNaArte(t, t).ok);
    expect(passaram, `passaram: ${JSON.stringify(passaram)}`).toEqual([]);
    expect(COMERCIAIS_NOVAS.length).toBeGreaterThanOrEqual(50);
  });

  // ITEM 1: a família mais comum do varejo brasileiro. Não exige adversário —
  // exige um modelo escrevendo legenda comercial comum. Aumentativo e
  // diminutivo são morfologia normal do português, não grafia errada.
  it("o SELO também: aumentativo e diminutivo não são carimbo legítimo", () => {
    const caem = ["Descontão", "Ofertão", "Preço Justo", "Sem Juros", "Compre Já",
      "Feirão", "Promocional", "Menor Preço", "Zero Taxa", "Adquira Já", "Frete Grátis"];
    for (const s of caem) expect(travaDeRotuloNaArte(s, FORMA_DO_SELO).ok, `passou: ${s}`).toBe(false);
    // E o pilar de verdade continua entrando — as duas metades, na mesma rodada.
    const passam = ["Produto", "Bastidores", "Prova social", "Educativo", "Institucional",
      "Antes e depois", "Serviço", "História", "Portfólio", "Rotina da oficina",
      "Preço da peça", "Único olhar", "Sem pressa", "Mais luz"];
    for (const s of passam) expect(travaDeRotuloNaArte(s, FORMA_DO_SELO).ok, `barrou: ${s}`).toBe(true);
  });

  // O erro de RÓTULO, não de veredito: a peça saía sem texto e o `lastError`
  // dizia "preço" sobre uma frase temporal. Errar o motivo treina o time a
  // ignorar o motivo.
  it("expressão temporal não é rotulada como PREÇO", () => {
    expect(travaDeTextoNaArte("A partir de agora atendemos aos sábados", "A partir de agora atendemos aos sábados — avisa todo mundo").ok).toBe(true);
    const v = travaDeTextoNaArte("A partir de R$ 199", "A partir de R$ 199");
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.detalhe).toContain("preço");
  });
});

describe("S2 — o selo tem trava de RÓTULO, não uma conferência tautológica", () => {
  // Antes: `travaDeTextoNaArte(selo, selo)` — fonte = alvo, logo o lastro era
  // sempre verdadeiro POR CONSTRUÇÃO. Um `if (true)` disfarçado. E o selo é
  // `post.pillar`: texto livre de LLM (`publicacao.ts:398`).
  it("pilar que virou parágrafo NÃO é rótulo e não vira pixel", () => {
    const v = travaDeRotuloNaArte("A".repeat(90), FORMA_DO_SELO);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.motivo).toBe("rotulo_fora_de_forma");
  });

  it("pilar em forma de frase também cai — rótulo é rótulo", () => {
    const v = travaDeRotuloNaArte("o pão que a gente faz todo dia com carinho", FORMA_DO_SELO);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.motivo).toBe("rotulo_fora_de_forma");
  });

  it("o pilar de verdade passa — a trava não come o caso normal", () => {
    for (const s of ["Produto", "Bastidores do forno", "Prova social"]) {
      expect(travaDeRotuloNaArte(s, FORMA_DO_SELO).ok, s).toBe(true);
    }
  });

  it("a metade de CLASSE continua valendo no rótulo", () => {
    const v = travaDeRotuloNaArte("Promoção", FORMA_DO_SELO);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.motivo).toBe("classe_de_fato_proibida");
  });

  it("a assinatura é nome de cadastro: mais folga, mesmas classes", () => {
    expect(travaDeRotuloNaArte("Padaria do João", FORMA_DA_ASSINATURA).ok).toBe(true);
    expect(travaDeRotuloNaArte("Padaria 2 Irmãos", FORMA_DA_ASSINATURA).ok).toBe(true);
    // Nome de cliente não passa a ser veículo de promessa.
    expect(travaDeRotuloNaArte("Padaria Frete Grátis", FORMA_DA_ASSINATURA).ok).toBe(false);
    // Nem de telefone.
    expect(travaDeRotuloNaArte("Padaria 11988887777", FORMA_DA_ASSINATURA).ok).toBe(false);
  });

  it("rótulo com invisível é higienizado antes de ser julgado", () => {
    const v = travaDeRotuloNaArte("Promo​ção", FORMA_DO_SELO);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.motivo).toBe("classe_de_fato_proibida");
  });
});

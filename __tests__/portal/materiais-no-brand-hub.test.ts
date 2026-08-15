// O BRAND BOOK TEM ONDE POUSAR, E ELE POUSA COMO BRAND BOOK.
//
// ── OS DOIS DEFEITOS QUE ESTE ARQUIVO TRAVA (15/08/2026) ───────────────────
//
//  1. **A aba errada.** O envio de material era renderizado só dentro de
//     `aba === "entregas"`. Entregas é o que a AGÊNCIA entregou; material de
//     marca é o caminho contrário. Quem abria o Brand Hub — o lugar que a
//     documentação nomeia — não tinha como enviar, consultar nem substituir
//     arquivo nenhum.
//
//  2. **O papel errado.** A caixa "Marca" dizia aceitar "seu logo, e o manual da
//     marca" e mandava os dois para o destino `logo`. O PDF do brand book era
//     gravado como LOGO: guardado onde ninguém o procura (quem procura manual
//     procura `manual_de_marca`) e oferecido onde ele não devia estar (`logo` é
//     `entraNaPeca: true` — o PDF entrava na fila de arquivos que uma arte pode
//     usar como imagem).
//
// O segundo é o que fazia a produção "não encontrar o brand book onde procura".

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

import { CAIXAS, NAO_SEI } from "@/components/portal/CaixasDeMaterial";
import { PAPEIS, papelEntraNaPeca, sugerirPapel } from "@/lib/integrations/google/escolha-de-material";
import {
  montarMateriaisDaMarca,
  PRAZO_DA_ANALISE_MS,
  O_QUE_O_BRAND_BOOK_NAO_FECHA,
  type LinhaDeMaterial,
} from "@/lib/agency/brand/materiais-da-marca";

const ler = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

// ─── 1. O PAPEL DO BRAND BOOK ───────────────────────────────────────────────

describe("brand book é manual_de_marca — nunca logo", () => {
  it("existe uma caixa própria para o Brand Book, e ela grava manual_de_marca", () => {
    const caixa = CAIXAS.find((c) => c.destino === "manual_de_marca");
    expect(caixa, "não há caixa de Brand Book — o cliente não tem onde soltá-lo").toBeTruthy();
    expect(caixa!.titulo).toMatch(/brand book|manual/i);
  });

  it("a caixa de logo NÃO promete receber o manual da marca", () => {
    // Era exatamente esta promessa que fazia o PDF ser arquivado como logo.
    const logo = CAIXAS.find((c) => c.destino === "logo")!;
    expect(logo.ajuda).not.toMatch(/manual|brand ?book/i);
  });

  it("o palpite pelo nome manda brand book para manual_de_marca", () => {
    for (const nome of ["brand-book-cityjobs.pdf", "Manual da Marca.pdf", "identidade-visual.pdf"]) {
      expect(sugerirPapel(nome, "application/pdf"), `"${nome}" foi parar no papel errado`)
        .toBe("manual_de_marca");
    }
  });

  it("manual de marca NÃO é arquivo que entra dentro de uma peça", () => {
    // A consequência prática do papel errado: como `logo`, o PDF entrava na
    // fila de arquivos que uma arte pode desenhar.
    expect(papelEntraNaPeca("manual_de_marca")).toBe(false);
    expect(papelEntraNaPeca("logo")).toBe(true);
  });
});

// ─── 2. AS CATEGORIAS QUE O CEO PEDIU ───────────────────────────────────────

describe("as nove categorias existem, e cada uma tem endereço próprio", () => {
  const ESPERADAS = [
    "manual_de_marca", "logo", "fonte",
    "foto_produto", "foto_local", "foto_equipe",
    "video", "referencia", "outro",
  ];

  it("nenhuma categoria foi despejada dentro de outra", () => {
    for (const papel of ESPERADAS) {
      expect(
        CAIXAS.some((c) => c.destino === papel),
        `a categoria "${papel}" não tem caixa — o cliente não consegue declará-la`,
      ).toBe(true);
    }
  });

  it("cada categoria tem rótulo próprio na hora de mostrar de volta", () => {
    // Sem isto, o .otf que ele soltou em "Fontes" voltaria escrito "Outro
    // material" — a categoria sumindo justamente quando ela vira prova.
    const rotulos = new Set(ESPERADAS.map((p) => PAPEIS[p as keyof typeof PAPEIS].rotulo));
    expect(rotulos.size).toBe(ESPERADAS.length);
  });

  it('a saída "não sei" continua existindo e continua sendo a última', () => {
    expect(CAIXAS[CAIXAS.length - 1]!.destino).toBe(NAO_SEI);
  });
});

// ─── 3. O ARQUIVO NÃO SOME AO RECARREGAR ────────────────────────────────────

function linha(p: Partial<LinhaDeMaterial> & { id: string }): LinhaDeMaterial {
  return {
    nome: "arquivo.pdf", mimeType: "application/pdf", tamanhoBytes: 1000,
    papel: "manual_de_marca", papelConfirmadoEm: new Date("2026-08-15"),
    mediaAssetId: "asset-" + p.id, erro: null, escolhidoEm: new Date("2026-08-15"),
    ...p,
  };
}

describe("o que foi enviado continua visível — e com endereço para abrir", () => {
  it("a lista sai do banco, com nome, categoria, data e estado", () => {
    const [m] = montarMateriaisDaMarca([linha({ id: "1", nome: "brand-book.pdf" })]);
    expect(m!.nome).toBe("brand-book.pdf");
    expect(m!.categoria).toBe(PAPEIS.manual_de_marca.rotulo);
    expect(m!.estado).toBe("recebido");
    expect(m!.url).toBe("/api/media/asset-1");
  });

  it("arquivo sem bytes no disco NÃO ganha link que abriria em 404", () => {
    const [m] = montarMateriaisDaMarca([linha({ id: "1", mediaAssetId: null, erro: "não consegui baixar" })]);
    expect(m!.url).toBeNull();
    expect(m!.estado).toBe("erro");
    expect(m!.detalhe).toContain("não consegui baixar");
  });

  it("arquivo sem papel declarado aparece pedindo classificação, em vez de sumir", () => {
    const [m] = montarMateriaisDaMarca([linha({ id: "1", papel: null, papelConfirmadoEm: null })]);
    expect(m!.estado).toBe("a_classificar");
    expect(m!.papel).toBeNull();
  });
});

// ─── 4. SUBSTITUIR PRESERVA O HISTÓRICO ─────────────────────────────────────

describe("substituir o brand book não apaga a versão anterior", () => {
  const tres = montarMateriaisDaMarca([
    linha({ id: "v1", nome: "book-2024.pdf", escolhidoEm: new Date("2026-08-01") }),
    linha({ id: "v2", nome: "book-2025.pdf", escolhidoEm: new Date("2026-08-10") }),
    linha({ id: "v3", nome: "book-2026.pdf", escolhidoEm: new Date("2026-08-15") }),
  ]);

  it("as três versões continuam na lista", () => {
    expect(tres).toHaveLength(3);
    expect(tres.map((m) => m.nome)).toContain("book-2024.pdf");
  });

  it("a versão é a ordem de chegada, e só a mais nova é a vigente", () => {
    const porNome = new Map(tres.map((m) => [m.nome, m]));
    expect(porNome.get("book-2024.pdf")!.versao).toBe(1);
    expect(porNome.get("book-2026.pdf")!.versao).toBe(3);
    expect(tres.filter((m) => m.vigente)).toHaveLength(1);
    expect(tres.find((m) => m.vigente)!.nome).toBe("book-2026.pdf");
  });

  it("a mais nova aparece primeiro — quem abre a tela vê o que vale", () => {
    expect(tres[0]!.nome).toBe("book-2026.pdf");
  });

  it("a versão de uma categoria não conta a da outra", () => {
    const misto = montarMateriaisDaMarca([
      linha({ id: "a", papel: "logo", escolhidoEm: new Date("2026-08-01") }),
      linha({ id: "b", papel: "manual_de_marca", escolhidoEm: new Date("2026-08-02") }),
    ]);
    expect(misto.every((m) => m.versao === 1)).toBe(true);
  });
});

// ─── 5. NENHUM ESTADO PRENDE O ARQUIVO PARA SEMPRE ──────────────────────────

describe('"analisando" tem prazo — não existe estado eterno', () => {
  const agora = new Date("2026-08-15T12:00:00Z");

  it("dentro do prazo, o estado é analisando", () => {
    const [m] = montarMateriaisDaMarca(
      [linha({ id: "1" })],
      [{ materialId: "1", status: "analisando", atualizadoEm: new Date(agora.getTime() - 60_000) }],
      agora,
    );
    expect(m!.estado).toBe("analisando");
  });

  it("passado o prazo, vira ERRO com recado — nunca 'analisando' para sempre", () => {
    const [m] = montarMateriaisDaMarca(
      [linha({ id: "1" })],
      [{ materialId: "1", status: "analisando", atualizadoEm: new Date(agora.getTime() - PRAZO_DA_ANALISE_MS - 1) }],
      agora,
    );
    expect(m!.estado).toBe("erro");
    // E o recado não culpa quem enviou, nem manda reenviar o que já chegou.
    expect(m!.detalhe).toMatch(/não precisa reenviar/i);
  });

  // ── ACHADO APERTANDO O BOTÃO (15/08/2026) ────────────────────────────────
  //
  // Subi um PDF de teste no portal com a chave de IA ausente. O que apareceu na
  // tela DO CLIENTE, ao lado do brand book dele:
  //
  //   "Nenhuma chave Claude conectada. Configure em Integrações."
  //
  // Dois defeitos numa frase. Manda o dono do negócio fazer o que ele não tem
  // como fazer (Integrações é tela da agência), e deixa ele concluir que o
  // ARQUIVO deu problema — quando o arquivo está guardado e inteiro.
  it("o cliente NUNCA lê o recado técnico da equipe", () => {
    const [m] = montarMateriaisDaMarca(
      [linha({ id: "1" })],
      [{
        materialId: "1", status: "erro", atualizadoEm: agora,
        erro: "Nenhuma chave Claude conectada. Configure em Integrações.",
      }],
      agora,
    );
    expect(m!.estado).toBe("erro");
    expect(m!.detalhe, "o recado da equipe vazou para a tela do cliente").not.toMatch(/Claude|Integrações|HTTP|timeout/i);
    // E a primeira coisa que ele lê é que o arquivo dele está a salvo.
    expect(m!.detalhe).toMatch(/guardado/i);
    expect(m!.detalhe).toMatch(/não precisa reenviar/i);
  });

  it("os cinco estados do ciclo aparecem como o CEO pediu", () => {
    const casos: Array<[string, string]> = [
      ["analisando", "analisando"],
      ["aguardando_revisao", "aguardando_revisao"],
      ["aplicado", "aplicado"],
      ["erro", "erro"],
    ];
    for (const [status, esperado] of casos) {
      const [m] = montarMateriaisDaMarca(
        [linha({ id: "1" })],
        [{ materialId: "1", status, atualizadoEm: agora }],
        agora,
      );
      expect(m!.estado, `status "${status}" não virou o estado esperado`).toBe(esperado);
    }
    // Sem análise nenhuma, "recebido" — e não um estado inventado.
    expect(montarMateriaisDaMarca([linha({ id: "1" })], [], agora)[0]!.estado).toBe("recebido");
  });
});

// ─── 5b. ARQUIVO ABERTO PELA METADE NÃO É DADO POR LIDO ────────────────────
//
// Ordem do CEO, 15/08/2026: *"o dispositivo de upload precisa ser capaz de ler
// qualquer coisa na íntegra."* A casa ainda não lê — e enquanto não ler, o
// degrau tem que estar NA TELA. "Aguardando revisão" sem dizer o que ficou de
// fora é um ✓ sobre um arquivo que ninguém abriu inteiro.

describe("o que não foi lido de dentro do arquivo aparece", () => {
  const agora = new Date("2026-08-15T12:00:00Z");

  it("a sugestão diz o que a casa NÃO conseguiu tirar de dentro do arquivo", () => {
    const [m] = montarMateriaisDaMarca(
      [linha({ id: "1" })],
      [{
        materialId: "1", status: "aguardando_revisao", atualizadoEm: agora,
        naoLido: ["as imagens embutidas como ARQUIVO — o logo em alta não sai daqui"],
      }],
      agora,
    );
    expect(m!.estado).toBe("aguardando_revisao");
    expect(m!.detalhe).toMatch(/ainda não conseguimos tirar de dentro/i);
    expect(m!.detalhe).toMatch(/logo em alta/i);
  });

  it("quando nada ficou de fora, a frase não inventa uma lacuna", () => {
    const [m] = montarMateriaisDaMarca(
      [linha({ id: "1" })],
      [{ materialId: "1", status: "aguardando_revisao", atualizadoEm: agora, naoLido: [] }],
      agora,
    );
    expect(m!.detalhe).not.toMatch(/ainda não conseguimos/i);
    expect(m!.detalhe).toMatch(/nada foi sobrescrito/i);
  });

  it("o leitor declara, por formato, o que entrou e o que ficou de fora", () => {
    const fonte = ler("lib/ai/leitura-de-marca.ts");
    // A declaração é montada NO RAMO de cada formato. Longe dele, ela vira
    // comentário desatualizado com cara de verdade.
    expect(fonte).toContain("DeclaracaoDeLeitura");
    expect(fonte).toContain("porInteiro");
    // O PDF é o caso que o CEO nomeou: o logo não sai de dentro dele hoje.
    expect(fonte).toMatch(/o logo em alta resolução não sai de dentro do PDF/i);
  });
});

// ─── 6. A TELA NÃO DEIXA O CLIENTE ACHAR QUE O PDF FECHA A FICHA ────────────

describe("a tela diz o que o brand book NÃO resolve", () => {
  it("a frase nomeia que o PDF alcança 3 dos 9, e por que os outros 6 não vêm dele", () => {
    expect(O_QUE_O_BRAND_BOOK_NAO_FECHA).toMatch(/6/);
    expect(O_QUE_O_BRAND_BOOK_NAO_FECHA).toMatch(/decisão sua/i);
  });

  it("e a seção do Brand Hub mostra essa frase ANTES do envio, não depois", () => {
    const src = ler("components/portal/cliente/MateriaisDaMarca.tsx");
    const aviso = src.indexOf("O_QUE_O_BRAND_BOOK_NAO_FECHA");
    const envio = src.indexOf("<EnvioDeMaterial");
    expect(aviso).toBeGreaterThan(-1);
    // Depois do envio já é tarde: ele manda o PDF, vê a ficha andar três
    // pontos e conclui que o sistema comeu o arquivo dele.
    expect(aviso, "o aviso caiu para depois do formulário").toBeLessThan(envio);
  });
});

// ─── 7. O ISOLAMENTO NÃO DEPENDE DE NINGUÉM LEMBRAR ────────────────────────

describe("material de um cliente não alcança outro", () => {
  const rota = ler("app/api/portal/materiais/route.ts");

  it("o dono é DERIVADO do token — não existe clientId de query nem de corpo", () => {
    expect(rota).toContain("resolvePortalClient");
    // A busca por um id vindo de fora é o caminho por onde o arquivo de um
    // cliente aparece no portal de outro.
    expect(rota.includes('searchParams.get("clientId")')).toBe(false);
    expect(rota.includes("body.clientId")).toBe(false);
  });

  it("o escopo vai dentro do `where`, nunca numa comparação depois", () => {
    // Comparar num `if` funciona até alguém acrescentar um `return` antes dele.
    expect(rota).toContain("where: { clientId: dono.clientId");
  });

  it("falha de leitura não vira 'você não mandou nada'", () => {
    // Um catch que devolve lista vazia faria o cliente reenviar tudo.
    expect(rota).toContain("indisponivel: true");
    expect(rota).toContain("503");
  });
});

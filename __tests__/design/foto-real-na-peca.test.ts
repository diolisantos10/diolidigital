// A FOTO REAL E O LOGO REAL DO CLIENTE ENTRAM NA PEÇA — as duas metades.
//
// ── O DEFEITO (07/08/2026) ─────────────────────────────────────────────────
//
// O cliente conectava o Google Drive, o material entrava na casa, e a peça saía
// IGUAL. Medido, não suposto: `fotosReaisDoCliente` não tinha um único chamador
// no app, `montarArteComFotoDoCliente` só era chamada por teste, e o molde não
// tinha campo nenhum para imagem de logo — a assinatura era o nome em texto.
// O CEO subiu os arquivos de três clientes acreditando que a peça mudaria.
//
// ── O QUE ESTE ARQUIVO PROVA ───────────────────────────────────────────────
//
//   ✅ COM material, o material ENTRA — e a prova é por BYTES e por DOM, nunca
//      por olhômetro.
//   ⛔ SEM material (ou sem RAZÃO para escolher), nada é inventado: a peça
//      declara o que falta e a imagem continua sendo gerada.
//
// A segunda metade é a que costuma faltar, e aqui ela é a mais importante: uma
// implementação que usasse "a primeira foto que sobrou" passaria na primeira
// metade e reintroduziria o defeito de 04/08/2026 — "sobra não é evidência de
// correspondência", a lição que montou carrossel com o logo dentro.

import { describe, it, expect } from "vitest";
import {
  escolherFotoReal, escolherFotoParaPostAvulso, lastroDeAssunto, palavrasDoNome,
  type FotoCandidata,
} from "@/lib/agency/design/escolha-de-foto";
import { FUNCOES, type MaterialReal } from "@/lib/agency/design/storyboard";
import { montarHtmlDaPeca, moldeDoCliente, moldeComLogo, LACUNA_DO_LOGO } from "@/lib/agency/design/molde";
import { PAPEIS_VALIDOS } from "@/lib/integrations/google/escolha-de-material";

function foto(papel: MaterialReal, nome: string, id = nome): FotoCandidata {
  return { mediaAssetId: id, papel, nome, mimeType: "image/jpeg" };
}

// ───────────────────────────────────────────────────────────────────────────
describe("⛔ METADE 1 — sem RAZÃO, a foto real não entra e nada é inventado", () => {
  it("papel que NÃO admite foto real (gancho) nunca usa o acervo do cliente", () => {
    // O gancho pede a DOR acontecendo. A foto bonita do produto é justamente o
    // que o `imagemPrecisa` dele proíbe.
    const r = escolherFotoReal({
      funcao: "gancho",
      cena: "sua padaria perde cliente na fila do fim de tarde",
      disponiveis: [foto("foto_produto", "foto-produto-pao-de-queijo.jpg")],
    });
    expect(r.usar).toBe(false);
    expect(r).toMatchObject({ motivo: "papel_nao_admite_foto_real" });
  });

  it("VÁRIOS candidatos e nenhum lastro no assunto → NÃO escolhe (a lição de 04/08)", () => {
    const r = escolherFotoReal({
      funcao: "prova",
      cena: "o tempo de resposta caiu de dois dias para duas horas",
      disponiveis: [
        foto("captura_de_tela", "captura-de-tela-IMG_2831.png"),
        foto("captura_de_tela", "captura-de-tela-IMG_2832.png"),
        foto("captura_de_tela", "captura-de-tela-DSC00412.png"),
      ],
    });
    expect(r.usar, "escolher por sobra é o defeito que isto fecha").toBe(false);
    expect(r).toMatchObject({ motivo: "empate_sem_razao", candidatos: 3 });
    if (!r.usar) {
      // A declaração é acionável: diz quantos havia e nomeia os arquivos.
      expect(r.explicacao).toContain("sobra não é evidência de correspondência");
      expect(r.explicacao).toContain("IMG_2831");
    }
  });

  it("EMPATE de lastro também não escolhe", () => {
    const r = escolherFotoReal({
      funcao: "resultado",
      cena: "a vitrine cheia de novidades",
      disponiveis: [
        foto("foto_local", "foto-local-vitrine-manha.jpg"),
        foto("foto_local", "foto-local-vitrine-tarde.jpg"),
      ],
    });
    // Só "vitrine" casa, e casa nos DOIS: empate real. Desempatar por ordem
    // seria sorteio com cara de decisão.
    expect(r.usar).toBe(false);
    expect(r).toMatchObject({ motivo: "empate_sem_razao" });
  });

  it("e o empate se DESFAZ quando a cena traz a palavra que separa", () => {
    // A metade que impede "empate_sem_razao" de virar "nunca escolhe": com um
    // detalhe a mais na cena, a regra discrimina — e escolhe a foto da TARDE
    // para uma cena de fim de tarde.
    const r = escolherFotoReal({
      funcao: "resultado",
      cena: "a vitrine cheia no fim da tarde",
      disponiveis: [
        foto("foto_local", "foto-local-vitrine-manha.jpg", "manha"),
        foto("foto_local", "foto-local-vitrine-tarde.jpg", "tarde"),
      ],
    });
    expect(r.usar).toBe(true);
    if (r.usar) expect(r.foto.mediaAssetId).toBe("tarde");
  });

  it("papel admite material e o cliente NÃO TEM → declara a falta, não inventa", () => {
    const r = escolherFotoReal({
      funcao: "prova",
      cena: "o painel mostra 340 pedidos no mês",
      disponiveis: [foto("foto_equipe", "foto-equipe-time.jpg")], // classe errada
    });
    expect(r.usar).toBe(false);
    expect(r).toMatchObject({ motivo: "sem_material_da_classe" });
    if (!r.usar) {
      expect(r.explicacao).toMatch(/não há nenhum arquivo desses na pasta/i);
      expect(r.explicacao).toMatch(/nada foi inventado/i);
    }
  });

  it("a mesma foto NÃO se repete em duas telas do mesmo carrossel", () => {
    const unica = foto("foto_local", "foto-local-balcao.jpg", "asset-1");
    const r = escolherFotoReal({
      funcao: "acao",
      cena: "passe no balcão e retire o seu",
      disponiveis: [unica],
      jaUsadas: new Set(["asset-1"]),
    });
    expect(r.usar).toBe(false);
    expect(r).toMatchObject({ motivo: "todas_ja_usadas" });
  });

  it("post AVULSO com fotos que nada dizem sobre o texto → gera, e DECLARA o que havia", () => {
    const r = escolherFotoParaPostAvulso({
      legenda: "novidade da semana chegou na loja",
      disponiveis: [foto("foto_produto", "foto-produto-IMG_9001.jpg")],
    });
    // Um candidato só NÃO basta no post avulso: falta a razão de papel, então a
    // razão de assunto tem de existir. Senão é o interruptor global disfarçado.
    expect(r.usar).toBe(false);
    expect(r).toMatchObject({ motivo: "empate_sem_razao", candidatos: 1 });
    if (!r.usar) expect(r.explicacao).toMatch(/imagem saiu gerada/i);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("✅ METADE 2 — com RAZÃO, o material do cliente entra de verdade", () => {
  it("candidato ÚNICO do papel certo entra: o papel é a razão", () => {
    const r = escolherFotoReal({
      funcao: "mecanismo",
      cena: "o painel organiza os pedidos por horário de entrega",
      disponiveis: [foto("captura_de_tela", "captura-de-tela-painel.png", "asset-9")],
    });
    expect(r.usar).toBe(true);
    if (r.usar) {
      expect(r.foto.mediaAssetId).toBe("asset-9");
      expect(r.razao).toMatch(/Mecanismo/);
    }
  });

  it("com vários candidatos, entra o que TEM lastro no assunto daquela cena", () => {
    const r = escolherFotoReal({
      funcao: "resultado",
      cena: "a vitrine de brigadeiro esgotou antes das quatro",
      disponiveis: [
        foto("foto_local", "foto-local-estoque.jpg", "a"),
        foto("foto_local", "foto-local-vitrine-brigadeiro.jpg", "b"),
        foto("foto_local", "foto-local-fachada.jpg", "c"),
      ],
    });
    expect(r.usar).toBe(true);
    if (r.usar) expect(r.foto.mediaAssetId).toBe("b");
  });

  it("a preferência declarada pelo papel é respeitada (prova prefere captura)", () => {
    const r = escolherFotoReal({
      funcao: "prova",
      cena: "o relatório do mês",
      disponiveis: [
        foto("foto_produto", "foto-produto-caixa.jpg", "prod"),
        foto("captura_de_tela", "captura-de-tela-relatorio.png", "cap"),
      ],
    });
    expect(r.usar).toBe(true);
    if (r.usar) expect(r.foto.mediaAssetId).toBe("cap");
  });

  it("post avulso COM lastro claro usa a foto real", () => {
    const r = escolherFotoParaPostAvulso({
      legenda: "o panetone artesanal já está em pré-venda",
      disponiveis: [
        foto("foto_produto", "foto-produto-panetone.jpg", "pan"),
        foto("foto_produto", "foto-produto-cafe.jpg", "caf"),
      ],
    });
    expect(r.usar).toBe(true);
    if (r.usar) expect(r.foto.mediaAssetId).toBe("pan");
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("🖋️ O LOGO REAL ASSINA A PEÇA — provado no DOM, não no olho", () => {
  const base = moldeDoCliente({ primaryColor: "#123456", secondaryColor: "#ABCDEF" });
  const peca = {
    formato: "feed" as const,
    titulo: "Pão quentinho todo dia",
    assinatura: "Padaria Aurora",
    fundo: null,
  };

  it("SEM logo: monograma, nenhuma imagem de logo, e a falta DECLARADA", () => {
    const molde = moldeComLogo(base, null);
    const html = montarHtmlDaPeca(peca, molde);

    // A CSS `.logo-real` está sempre na folha de estilo; o que não pode
    // existir é o ELEMENTO.
    expect(html).not.toContain('class="logo-real"');
    expect(html).not.toContain("<img");
    // O monograma continua sendo o substituto — e continua sendo declarado.
    expect(html).toContain('class="monograma"');
    expect(molde.logo).toBeNull();
    expect(molde.lacunas).toContain(LACUNA_DO_LOGO);
  });

  it("COM logo: a IMAGEM do cliente entra e o monograma SAI", () => {
    const dataUrl = "data:image/png;base64,QUJDMTIz";
    const molde = moldeComLogo(base, { dataUrl, nome: "logo-aurora.png", mimeType: "image/png" });
    const html = montarHtmlDaPeca(peca, molde);

    // A PROVA POR BYTES: são os bytes do arquivo dele que estão no documento.
    expect(html).toContain(dataUrl);
    expect(html).toContain('class="logo-real"');
    // Os dois nunca aparecem juntos: o monograma É o substituto do logo.
    expect(html).not.toContain('class="monograma"');
    // E, tendo logo, a falta NÃO é declarada — declarar falta que não existe
    // treina quem lê a ignorar as declarações.
    expect(molde.lacunas).not.toContain(LACUNA_DO_LOGO);
  });

  it("o NOME em texto continua na peça — é ele que o renderizador confere no DOM", () => {
    const molde = moldeComLogo(base, { dataUrl: "data:image/png;base64,QQ==", nome: "l.png", mimeType: "image/png" });
    const html = montarHtmlDaPeca(peca, molde);
    expect(html).toContain("Padaria Aurora");
    expect(html).toContain('data-papel="assinatura"');
  });

  it("MIME que o navegador não desenha NÃO vira logo — e a falta é declarada", () => {
    // PDF de manual de marca não é logo. Sem esta guarda, o `<img>` falharia em
    // silêncio e a peça sairia sem assinatura nenhuma.
    const molde = moldeComLogo(base, { dataUrl: "data:application/pdf;base64,QQ==", nome: "marca.pdf", mimeType: "application/pdf" });
    expect(molde.logo).toBeNull();
    expect(molde.lacunas).toContain(LACUNA_DO_LOGO);
    expect(montarHtmlDaPeca(peca, molde)).not.toContain('class="logo-real"');
  });

  it("nunca aceita URL de rede — o documento do render é autossuficiente", () => {
    const molde = moldeComLogo(base, { dataUrl: "https://cdn.exemplo.com/logo.png", nome: "l", mimeType: "image/png" });
    // Um src de rede num render offline falha em silêncio: a peça sai sem o
    // logo e ninguém sabe. Mesma armadilha da webfont.
    expect(molde.logo).toBeNull();
    expect(molde.lacunas).toContain(LACUNA_DO_LOGO);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("🔗 as duas listas de papéis não podem divergir em silêncio", () => {
  it("todo MaterialReal declarado nas FUNÇÕES existe como papel do Drive", () => {
    // `storyboard.ts` é puro e repete a união como literal (o módulo do Drive
    // arrasta Prisma). Repetição sem trava é a que diverge no primeiro papel
    // novo — e aí a foto daquela classe nunca mais entra em peça nenhuma.
    const usados = new Set<string>();
    for (const f of Object.values(FUNCOES)) for (const m of f.materiaisReais) usados.add(m);

    expect(usados.size).toBeGreaterThan(0);
    for (const m of usados) {
      expect(PAPEIS_VALIDOS as readonly string[], `"${m}" não é um papel do Drive`).toContain(m);
    }
  });

  it("toda função declara materiaisReais — inclusive as que declaram lista VAZIA", () => {
    for (const [id, f] of Object.entries(FUNCOES)) {
      expect(Array.isArray(f.materiaisReais), `função "${id}" não declarou materiaisReais`).toBe(true);
    }
    // Vazio é uma resposta, e tem de ser a resposta de gancho e tensão.
    expect(FUNCOES.gancho!.materiaisReais).toEqual([]);
    expect(FUNCOES.tensao!.materiaisReais).toEqual([]);
    // E prova/mecanismo TÊM de admitir material, senão a frente inteira é inerte.
    expect(FUNCOES.prova!.materiaisReais.length).toBeGreaterThan(0);
    expect(FUNCOES.mecanismo!.materiaisReais.length).toBeGreaterThan(0);
  });
});

describe("🔤 o lastro de assunto não confunde ruído com evidência", () => {
  it("nome de câmera não produz lastro nenhum", () => {
    expect(palavrasDoNome("foto-produto-IMG_2831.jpg")).toEqual([]);
    expect(lastroDeAssunto("foto-produto-IMG_2831.jpg", "o pão de queijo sai do forno")).toBe(0);
  });

  it("o prefixo de papel NÃO conta como assunto", () => {
    // Sem tirar o prefixo, TODO arquivo de produto casaria com qualquer cena
    // que dissesse "produto" — ruído com cara de evidência.
    expect(palavrasDoNome("foto-produto-panetone.jpg")).toEqual(["panetone"]);
    expect(lastroDeAssunto("foto-produto-brownie.jpg", "a linha de produtos da casa")).toBe(0);
  });

  it("palavra de conteúdo em comum conta", () => {
    expect(lastroDeAssunto("foto-local-vitrine-brigadeiro.jpg", "a vitrine de brigadeiro esgotou")).toBe(2);
  });
});

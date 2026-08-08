// cityjobs-pecas-de-feed.mts — AS 2 PEÇAS DE FEED DO CITYJOBS, REFEITAS.
//
// ── POR QUE ESTE ARQUIVO EXISTE (CEO, 08/08/2026) ───────────────────────────
//
// As duas peças de 08/08 (`4c4ea1a`) foram REPROVADAS pelo CEO. A causa está
// escrita na mensagem daquele commit, com todas as letras e como se fosse uma
// virtude: "O FUNDO É DESENHADO EM CÓDIGO (SVG), não gerado por IA (...) custa
// zero e é determinístico". Saiu prédio-retângulo, sol-círculo e tipografia de
// sistema. Clipart.
//
// E o commit anterior deixou as peças no repositório **como PNG e nada mais**:
// sem legenda, sem o script que as produziu, sem a fonte do texto. "Refazer com
// as mesmas legendas" foi, por isso, impossível de verificar — e é por isso que
// ESTE arquivo é versionado junto das peças. Peça sem receita é peça que
// ninguém consegue refazer.
//
// ── O QUE MUDOU, E O QUE NÃO ────────────────────────────────────────────────
//
// NÃO mudou: o conteúdo aprovado (bastidor da região · vaga validada), os
// títulos, os pilares bloqueados, a paleta fechada, o selo ALTO TIETÊ, a trava
// de lastro literal, os três portões.
//
// MUDOU: o fundo é FOTOGRAFIA REAL da própria região; a tipografia é fonte
// embarcada de verdade (`fontes-embutidas.ts`) e não a Liberation Sans do
// contêiner; a assinatura é o logo oficial rasterizado com a letra certa, e a
// palavra "CityJobs" NÃO aparece escrita em lugar nenhum.
//
// ── 🔴 A FOTO NÃO É DE IA, E ISSO É UMA LIMITAÇÃO DECLARADA ─────────────────
//
// O despacho mandou gastar imagem de IA. **Este ambiente não tem chave de
// nenhum provedor de imagem** — medido, não deduzido: `OPENAI_API_KEY` e
// `GEMINI_API_KEY` ausentes do processo, e `api.openai.com` responde 401. Sem
// chave não há imagem de IA, e desenhar o fundo em código de novo seria repetir
// exatamente o erro reprovado.
//
// O caminho escolhido: FOTOGRAFIA REAL DA REGIÃO, de procedência declarada e
// licença CC0 (Wikimedia Commons). Para o CityJobs isso não é um plano B
// disfarçado — é ancoragem: a estação de Mogi das Cruzes com o nome da cidade
// legível é o Alto Tietê de verdade, não um "escritório genérico de banco de
// imagem". O que a IA daria de melhor aqui é enquadramento sob medida.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

import {
  moldeDoCliente,
  moldeComLogo,
  montarHtmlDaPeca,
  textosDaPeca,
  FORMATOS,
  type PecaDoMolde,
} from "../lib/agency/design/molde";
import { renderizarHtml } from "../lib/agency/design/renderizar";
import { travaDeTextoNaArte, travaDeRotuloNaArte, FORMA_DO_SELO } from "../lib/agency/design/trava-de-texto";
import { travaDeFundoDeclarado, travaDeRiquezaDoFundo } from "../lib/agency/design/trava-de-fundo";
import { medirFundo } from "../lib/agency/design/medir-fundo";
import { cssDasFontesEmbutidas } from "../lib/agency/design/fontes-embutidas";

const RAIZ = process.cwd();
const SAIDA = join(RAIZ, "docs/entregas/cityjobs-08-08");

/**
 * A MARCA DO CITYJOBS, como o briefing a fechou.
 *
 * `typography: "Arial Black / Arial / Helvetica"` sai do próprio logo oficial
 * (`public/brand/cityjobs/*.svg`, `font-family="Arial Black, Arial, Helvetica,
 * sans-serif"`) e do manual em `public/brand/cityjobs/LEIA-ME.md`. Ela cai na
 * chave `neutra` do molde, e é por isso que o título sai em grotesca de peso
 * black — NUNCA em serifada. A serifada de display é da Dioli; ela não entra
 * aqui.
 */
const MARCA_CITYJOBS = {
  primaryColor: "#0D2B4D",
  secondaryColor: "#16A34A",
  typography: "Arial Black / Arial / Helvetica, sans-serif",
};

/**
 * As duas peças.
 *
 * A `legenda` é a FONTE do lastro: a trava exige que o título e o apoio sejam
 * trecho LITERAL dela. Ela não é enfeite do script — é o documento contra o
 * qual cada pixel de texto é conferido.
 *
 * ⚠️ As legendas foram REESCRITAS nesta rodada, e isso está declarado: as do
 * commit reprovado nunca chegaram ao repositório. Os TÍTULOS são idênticos aos
 * aprovados. Nenhuma delas cita salário, número de vagas, nome de empresa ou
 * promessa de contratação — os três pilares bloqueados continuam bloqueados e a
 * proibição de "emprego garantido" vale linha a linha.
 */
interface PedidoDaPeca {
  arquivo: string;
  pilar: string;
  titulo: string;
  apoio: string;
  legenda: string;
  foto: { arquivo: string; procedencia: string; licenca: string; porQueEstaFoto: string };
}

const PECAS: PedidoDaPeca[] = [
  {
    arquivo: "cityjobs-08-08-post-1-bastidor-da-regiao.png",
    pilar: "Bastidor da região",
    titulo: "A vaga que você procura pode ser aqui do lado",
    apoio: "Mogi das Cruzes, Suzano, Itaquaquecetuba, Poá, Ferraz de Vasconcelos e Arujá.",
    legenda: [
      "A vaga que você procura pode ser aqui do lado.",
      "",
      "A gente publica o que é do Alto Tietê: Mogi das Cruzes, Suzano, Itaquaquecetuba, Poá, Ferraz de Vasconcelos e Arujá.",
      "",
      "Trabalhar perto de casa é ganhar tempo de volta — o tempo que hoje vai embora na estação.",
      "",
      "Vagas atualizadas no link da bio.",
      "",
      "#altotietê #mogidascruzes #suzano #itaquaquecetuba #poá #ferrazdevasconcelos #arujá #vagasdeemprego",
    ].join("\n"),
    foto: {
      arquivo: "p1-recorte.jpg",
      procedencia: "Wikimedia Commons — File:Estação de Mogi das Cruzes.jpg (User:Tet)",
      licenca: "CC0 1.0 (domínio público, sem exigência de atribuição)",
      porQueEstaFoto:
        "É a região com o nome escrito nela: a placa CPTM 'Mogi das Cruzes' aparece na fachada. O texto fala de estar perto de casa, e a estação é o lugar onde o Alto Tietê perde tempo indo trabalhar longe. Não é foto genérica: é o assunto.",
    },
  },
  {
    arquivo: "cityjobs-08-08-post-2-vaga-validada.png",
    pilar: "Institucional — vaga validada",
    titulo: "Vaga publicada é vaga conferida",
    apoio: "A gente confere para você não precisar conferir.",
    legenda: [
      "Vaga publicada é vaga conferida.",
      "",
      "Antes de entrar no ar, a vaga passa pela nossa checagem. A gente confere para você não precisar conferir.",
      "",
      "Você não perde a manhã atrás de um anúncio que não existe mais — nem sai de casa à toa.",
      "",
      "Vagas do Alto Tietê no link da bio.",
      "",
      "#altotietê #mogidascruzes #suzano #vagasdeemprego #trabalho",
    ].join("\n"),
    foto: {
      arquivo: "p2-recorte.jpg",
      procedencia: "Wikimedia Commons — File:Praça Oswaldo Cruz (Mogi das Cruzes).jpg (User:Tetizeraz)",
      licenca: "CC0 1.0 (domínio público, sem exigência de atribuição)",
      porQueEstaFoto:
        "Rua de comércio do centro de Mogi, com ônibus e gente andando: é DAQUI que vem a vaga que a peça diz conferir. Cena e luz diferentes da peça 1, para as duas não saírem gêmeas.",
    },
  },
];

// ─── O LOGO OFICIAL, RASTERIZADO COM A LETRA CERTA ──────────────────────────
//
// 🔴 O logo do CityJobs não é um desenho: é `<text font-family="Arial Black">`
// dentro de um SVG. Arial Black é fonte licenciada da Microsoft e NÃO EXISTE
// neste contêiner — o wordmark oficial vinha saindo em Liberation Sans, na peça
// reprovada inclusive, e ninguém mediu porque "o logo é oficial".
//
// Aqui o SVG é redesenhado com a MESMA geometria e a MESMA cor, trocando só a
// pilha de fonte pela que viaja embutida (Archivo Black, substituta declarada
// de Arial Black), e rasterizado para PNG. Nada é recolorido, nada é
// distorcido: é o mesmo arquivo com a letra que o autor pediu.
//
// Variante `05_retangular_principal`: campo azul-marinho `#0D2B4D` com a marca
// em BRANCO. É a assinatura horizontal, e o campo dela é exatamente a cor do
// painel da peça — então o retângulo desaparece no painel e só o wordmark
// branco aparece. É o que o manual pede em uma frase ("fundo escuro pede a
// versão branca") obtido sem recolorir nada: o arquivo entra inteiro, do jeito
// que o autor o desenhou.
//
// O `.trim()` do sharp corta a moldura de cor uniforme que sobra em volta das
// letras. Isso NÃO é distorcer: a proporção do wordmark fica intacta, o que sai
// é padding. Sem ele, o SVG oficial (1920×1080 para uma linha de texto) chega
// ao rodapé com a marca ocupando um quinto da própria caixa.
async function logoOficialEmPng(corDoCampo: string): Promise<{ dataUrl: string; nome: string }> {
  const caminho = join(RAIZ, "public/brand/cityjobs/05_city_jobs_retangular_principal.svg");
  const svg = readFileSync(caminho, "utf8").replace(
    /font-family="[^"]*"/g,
    `font-family="Archivo Black, Archivo, Helvetica, Arial, sans-serif"`,
  );
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
${cssDasFontesEmbutidas()}
  html,body{margin:0;padding:0;width:1920px;height:1080px;background:${corDoCampo};}
  svg{width:1920px;height:1080px;display:block;}
</style></head><body>${svg}</body></html>`;

  const r = await renderizarHtml({ html, largura: 1920, altura: 1080, textosEsperados: [] });
  if (!r.ok) throw new Error(`o logo oficial não rasterizou: ${r.motivo} — ${r.erro}`);

  const { default: sharp } = await import("sharp");
  const cortado = await sharp(r.bytes).trim({ threshold: 12 }).png().toBuffer();
  return { dataUrl: `data:image/png;base64,${cortado.toString("base64")}`, nome: basename(caminho) };
}

// ── OS RECORTES, PARA QUEM PRECISAR REFAZÊ-LOS ──────────────────────────────
//
// `fotos/*.jpg` guarda o original baixado do Commons E o recorte usado. O
// recorte é enquadramento — decisão de design, tomada olhando a peça montada,
// não um passo automático. A geometria fica escrita para ser reproduzível:
//
//   p1-recorte.jpg  ← estacao-mogi-das-cruzes.jpg
//                     extract{left:330,top:60,width:1380,height:794} → 1080×621
//                     (sobe o enquadramento: mais fachada e placa CPTM, menos
//                      canteiro no primeiro plano)
//   p2-recorte.jpg  ← praca-oswaldo-cruz-mogi.jpg
//                     extract{left:680,top:300,width:1200,height:690} → 1080×621
//                     (menos céu vazio, mais rua, comércio e quem caminha)
//
// 1080×621 é exatamente a faixa da foto na composição `dividido-reto`
// (46% de 1350). Recortar no tamanho final evita que o `background-size:cover`
// escolha o enquadramento por conta própria.
function fotoComoDataUrl(arquivo: string): string {
  const bytes = readFileSync(join(RAIZ, "docs/entregas/cityjobs-08-08/fotos", arquivo));
  return `data:image/jpeg;base64,${bytes.toString("base64")}`;
}

async function main() {
  mkdirSync(SAIDA, { recursive: true });

  const moldeBase = moldeDoCliente(MARCA_CITYJOBS);
  const logo = await logoOficialEmPng(moldeBase.primaria);
  const molde = moldeComLogo(moldeBase, {
    dataUrl: logo.dataUrl,
    nome: logo.nome,
    mimeType: "image/png",
  });

  const SELO = "Alto Tietê";
  const rotulo = travaDeRotuloNaArte(SELO, FORMA_DO_SELO);
  if (!rotulo.ok) {
    throw new Error(`o selo foi barrado pela trava: ${JSON.stringify(rotulo)}`);
  }

  for (const p of PECAS) {
    // ── PORTÃO 1: lastro literal. O título e o apoio TÊM de ser trecho da
    //    legenda auditada. Sem isso, a frase vira pixel sem ninguém ter
    //    aprovado aquela frase.
    for (const [papel, texto] of [["titulo", p.titulo], ["apoio", p.apoio]] as const) {
      const v = travaDeTextoNaArte(texto, p.legenda);
      if (!v.ok) {
        throw new Error(`[${p.arquivo}] ${papel} REPROVADO pela trava: ${JSON.stringify(v)}`);
      }
    }

    // ── PORTÃO 0: O FUNDO. Roda ANTES de compor, porque depois de composto o
    //    clipart já custou o render e já parece uma peça. As duas perguntas:
    //    o fundo é vetor desenhado por nós, e o pixel tem riqueza de fotografia.
    //    Este é o portão que a peça reprovada não teria passado.
    const bytesDaFoto = readFileSync(join(RAIZ, "docs/entregas/cityjobs-08-08/fotos", p.foto.arquivo));
    const fundoDataUrl = fotoComoDataUrl(p.foto.arquivo);
    const declarado = travaDeFundoDeclarado(fundoDataUrl);
    if (!declarado.ok) throw new Error(`[${p.arquivo}] fundo REPROVADO: ${declarado.detalhe}`);
    const medida = await medirFundo(bytesDaFoto);
    if (!medida) throw new Error(`[${p.arquivo}] o fundo não pôde ser medido — e não medido não é aprovado.`);
    const riqueza = travaDeRiquezaDoFundo(medida);
    if (!riqueza.ok) throw new Error(`[${p.arquivo}] fundo REPROVADO: ${riqueza.detalhe}`);

    const peca: PecaDoMolde = {
      formato: "feed",
      composicao: "dividido-reto",
      selo: SELO,
      titulo: p.titulo,
      apoio: p.apoio,
      // 🔴 `assinatura` fica VAZIA de propósito, e não por esquecimento.
      // `montarHtmlDaPeca` pinta o logo E o nome do cliente em texto, lado a
      // lado no rodapé. Para o CityJobs isso viola a primeira regra do manual
      // dele: "nunca o logo junto da palavra CityJobs escrita na mesma peça".
      // A peça reprovada quebrou essa regra em tamanho gigante no topo; ela não
      // vai ser quebrada em corpo 24 no rodapé.
      assinatura: null,
      fundo: fundoDataUrl,
    };

    const html = montarHtmlDaPeca(peca, molde);
    const dim = FORMATOS.feed;

    // ── PORTÃO 2: a letra do DOM é a letra pedida, nada cortado, nada na
    //    zona morta da interface do Instagram.
    const r = await renderizarHtml({
      html,
      largura: dim.largura,
      altura: dim.altura,
      textosEsperados: textosDaPeca(peca).map((t) => t.texto),
      zonaMortaTopo: dim.margemTopo,
      zonaMortaBase: dim.margemBase,
    });
    if (!r.ok) throw new Error(`[${p.arquivo}] render REPROVADO: ${r.motivo} — ${r.erro}`);

    writeFileSync(join(SAIDA, p.arquivo), r.bytes);
    console.log(
      `✅ ${p.arquivo} — ${r.bytes.length} bytes · ${r.conferencia.conferidos} textos conferidos · título ${r.conferencia.tituloPx}px${r.conferencia.encolheu ? " (encolheu)" : ""}`,
    );
  }
}

main().catch((e) => {
  console.error("❌", e instanceof Error ? e.message : e);
  process.exit(1);
});

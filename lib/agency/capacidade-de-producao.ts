// SÓ SE VENDE O QUE A CASA PRODUZ — a régua, não a lista.
//
// ── O ACHADO (auditoria de 24/08/2026) ──────────────────────────────────────
// A vitrine e a tabela de planos vendiam cinco coisas que não existem em código:
// post no Google, escrita na ficha do Google, legenda animada em vídeo,
// logotipo de cliente e arquivo PDF. Nenhuma delas tinha porta de entrada em
// produção — e a rota `/api/self-serve/order` aceitava o pedido, gravava a linha
// e (com o Mercado Pago ligado) COBRAVA.
//
// ── POR QUE NÃO UMA LISTA DE ITENS PROIBIDOS ────────────────────────────────
// Uma lista escrita à mão ("não vender 1-reel, banner-digital, ...") envelhece
// no dia seguinte: o próximo item entra no catálogo e ninguém lembra de
// atualizar a lista. Aqui a régua é de CLASSE:
//
//   1. A casa declara CAPACIDADES — o que ela sabe produzir. Cada capacidade
//      aponta o PONTO DE PRODUÇÃO real (arquivo + símbolo). `ponto: null`
//      significa, por escrito, "isto a casa não produz hoje".
//   2. Todo item de oferta declara `requer` — quais capacidades ele consome.
//      O campo é OBRIGATÓRIO no tipo: item novo sem declaração nem compila.
//   3. O TEXTO da oferta também acusa. Cada capacidade ausente carrega os seus
//      marcadores (`/\bpdf\b/`, `/legendas? animad/`, ...). Se o texto promete
//      a coisa, a capacidade é exigida MESMO que o autor tenha declarado outra
//      no `requer` — declaração otimista não passa por cima do que está escrito
//      na vitrine.
//   4. FALHA FECHADA: `requer` vazio → NÃO vendável. Capacidade desconhecida →
//      NÃO vendável. Qualquer capacidade exigida sem ponto de produção → NÃO
//      vendável. Na dúvida, não vende.
//
// ── POR QUE O PONTO É DADO E NÃO `import` ───────────────────────────────────
// Esta régua roda no navegador (a vitrine é um componente client). Importar
// aqui o motor de produção arrastaria Prisma e Playwright para o bundle. Então
// o ponto de produção é DADO — e a verdade do dado é provada por teste:
// `__tests__/comercial/so-vende-o-que-produz.test.ts` abre cada arquivo, confere
// que o símbolo existe e que ele tem pelo menos um CHAMADOR fora de teste. O
// mesmo teste faz o caminho inverso nas capacidades ausentes: se alguém ligar o
// produtor e esquecer de promover a capacidade aqui, o teste quebra e manda
// promover. É catraca nos dois sentidos.
//
// ⚠️ Esta régua mede EXISTÊNCIA DE CAMINHO DE PRODUÇÃO no código. Ela não mede
// se o ambiente está configurado (ffmpeg no runtime, chave de imagem, domínio
// público) — esse outro eixo é o `/api/capacidades`. Um item vendável aqui
// ainda pode falhar lá; o contrário não: sem caminho, não se vende.

export type CapacidadeDeProducao =
  // ── O que a casa produz ──────────────────────────────────────────────────
  | "arte-estatica-jpeg"
  | "texto-de-marca"
  | "edicao-de-video-do-cliente"
  | "publicacao-instagram-facebook"
  | "campanha-de-trafego-meta"
  // ── O que a casa NÃO produz (declarado, com o motivo) ────────────────────
  | "publicacao-no-google"
  | "escrita-na-ficha-do-google"
  | "legenda-animada-em-video"
  | "logotipo-de-cliente"
  | "arquivo-pdf"
  | "relatorio-de-auditoria-de-perfil";

/** Onde a capacidade vira arquivo entregue. `arquivo` é caminho a partir da
 *  raiz do repositório; `simbolo` é a função exportada que produz. */
export interface PontoDeProducao {
  arquivo: string;
  simbolo: string;
}

export interface Capacidade {
  id: CapacidadeDeProducao;
  /** O que sai, em português de cliente. */
  produz: string;
  /** `null` = a casa NÃO produz isto hoje. Nenhuma oferta que dependa disso é
   *  vendável enquanto for `null`. */
  ponto: PontoDeProducao | null;
  /** Só para as ausentes: o símbolo que EXISTIRIA se alguém ligasse o caminho.
   *  O teste confere que ele continua sem chamador — ligou, tem que promover. */
  simboloOrfao?: PontoDeProducao;
  /** Só para as ausentes: as palavras que, no texto de uma oferta, prometem
   *  esta capacidade. É o que pega o item novo escrito por outra pessoa. */
  marcadores?: RegExp[];
  /** O que falta, por extenso. Vira a frase de recusa da rota de pedido. */
  falta?: string;
}

export const CAPACIDADES: Record<CapacidadeDeProducao, Capacidade> = {
  "arte-estatica-jpeg": {
    id: "arte-estatica-jpeg",
    // JPEG, e o id diz JPEG desde 25/08/2026. Chamava-se `arte-estatica-png` e
    // produzia JPEG havia semanas: `SAIDA_DA_PECA` em `design/renderizar.ts`
    // captura `type: "jpeg"`, e `MIME_DA_PECA_RENDERIZADA` deriva o MIME da
    // MESMA opção. O nome era o resíduo de antes da conversão (ver
    // `scripts/reconverter-pecas-para-jpeg.mts`) e mentia na vitrine, que é
    // onde o cliente lê o que vai receber.
    produz: "arte de feed, story ou carrossel em JPEG, com o molde da marca",
    ponto: { arquivo: "lib/agency/design/molde.ts", simbolo: "montarHtmlDaPeca" },
  },
  "texto-de-marca": {
    id: "texto-de-marca",
    produz: "legenda, título e copy no tom da marca",
    ponto: { arquivo: "lib/agency/design/molde.ts", simbolo: "textosDaPeca" },
  },
  "edicao-de-video-do-cliente": {
    id: "edicao-de-video-do-cliente",
    produz: "corte vertical e capa a partir do vídeo BRUTO que o cliente enviou",
    ponto: { arquivo: "lib/agency/media/video.ts", simbolo: "editarParaReel" },
  },
  "publicacao-instagram-facebook": {
    id: "publicacao-instagram-facebook",
    produz: "publicação da peça no Instagram e no Facebook do cliente",
    ponto: { arquivo: "lib/integrations/meta/client.ts", simbolo: "publishPost" },
  },
  "campanha-de-trafego-meta": {
    id: "campanha-de-trafego-meta",
    produz: "campanha, conjunto e anúncio criados pausados na conta do cliente",
    ponto: { arquivo: "lib/integrations/meta/ads.ts", simbolo: "criarCampanhaPausada" },
  },

  // ── AUSENTES ─────────────────────────────────────────────────────────────
  "publicacao-no-google": {
    id: "publicacao-no-google",
    produz: "post no perfil do Google (novidade, oferta, evento) na busca e no mapa",
    ponto: null,
    simboloOrfao: { arquivo: "lib/integrations/google/client.ts", simbolo: "publicarNoGoogle" },
    marcadores: [/\bno\s+google\b/i, /posts?\s+no\s+google/i, /perfil\s+do\s+google/i],
    falta:
      "publicar no Google. A função existe, mas nenhuma rota, job ou despertador " +
      "a chama — é código sem porta de entrada.",
  },
  "escrita-na-ficha-do-google": {
    id: "escrita-na-ficha-do-google",
    produz: "alteração de locais, horários e informações na ficha do Google",
    ponto: null,
    marcadores: [/ficha\s+do\s+google/i, /hor[áa]rios?\s+.*google/i],
    falta:
      "escrever na ficha do Google. Só existe leitura (`listarLocais`); não há " +
      "nenhuma escrita de informação de local no repositório.",
  },
  "legenda-animada-em-video": {
    id: "legenda-animada-em-video",
    produz: "legenda animada queimada no vídeo",
    ponto: null,
    marcadores: [/legendas?\s+animad/i, /legenda\s+queimada/i],
    falta:
      "gerar legenda animada. A edição de vídeo da casa corta o material do " +
      "cliente e tira uma capa — não escreve nem anima texto.",
  },
  "logotipo-de-cliente": {
    id: "logotipo-de-cliente",
    produz: "logotipo do cliente em arquivo, com variações",
    ponto: null,
    // "identidade visual" de propósito NÃO está aqui: é adjetivo de peça
    // ("com identidade visual consistente"), não promessa de entregar arquivo
    // de logo. Marcador largo demais vira ruído e ensina a ignorar a régua.
    marcadores: [/logotipo/i, /logomarca/i, /\blogo\b/i],
    falta:
      "criar logotipo de cliente. A casa só deriva um monograma das iniciais " +
      "(`monogramaDe`) — e a própria peça declara a falta em `LACUNA_DO_LOGO`.",
  },
  "arquivo-pdf": {
    id: "arquivo-pdf",
    produz: "arquivo PDF entregue ao cliente",
    ponto: null,
    marcadores: [/\bpdf\b/i],
    falta:
      "gerar PDF. Não existe nenhum gerador de PDF no repositório — a casa lê " +
      "PDF que chega, não escreve PDF que sai.",
  },
  "relatorio-de-auditoria-de-perfil": {
    id: "relatorio-de-auditoria-de-perfil",
    produz: "relatório de auditoria do perfil do cliente",
    ponto: null,
    marcadores: [/auditoria\s+de\s+perfil/i],
    falta:
      "produzir relatório de auditoria de perfil. A esteira produz PEÇA; não há " +
      "produtor de relatório de diagnóstico em lugar nenhum.",
  },
};

/** Toda capacidade que a casa NÃO produz hoje. Deriva do dado — ninguém mantém
 *  uma segunda lista. */
export const CAPACIDADES_AUSENTES: Capacidade[] =
  Object.values(CAPACIDADES).filter((c) => c.ponto === null);

export function capacidadeDisponivel(id: string): boolean {
  const c = (CAPACIDADES as Record<string, Capacidade | undefined>)[id];
  // Capacidade desconhecida é indisponível — falha fechada, não "deve ser nova".
  return Boolean(c && c.ponto !== null);
}

/** A forma mínima que uma oferta precisa ter para passar pela régua. Serve
 *  tanto para item de vitrine quanto para linha de plano. */
export interface OfertaConferivel {
  requer: readonly CapacidadeDeProducao[];
  textos: readonly string[];
}

/** As capacidades que o TEXTO da oferta promete, mesmo que ninguém as tenha
 *  declarado. Só as ausentes têm marcadores: a régua existe para pegar promessa
 *  de coisa que não se produz, não para catalogar o que já funciona. */
export function capacidadesExigidasPeloTexto(
  ...textos: readonly string[]
): CapacidadeDeProducao[] {
  const alvo = textos.filter(Boolean).join(" \n ");
  return CAPACIDADES_AUSENTES
    .filter((c) => (c.marcadores ?? []).some((re) => re.test(alvo)))
    .map((c) => c.id);
}

/** Tudo que a oferta consome: o que ela declarou MAIS o que ela promete por
 *  escrito. A união é de propósito — declarar pouco não apaga o que está na
 *  tela do comprador. */
export function capacidadesExigidas(oferta: OfertaConferivel): CapacidadeDeProducao[] {
  const doTexto = capacidadesExigidasPeloTexto(...oferta.textos);
  return [...new Set([...oferta.requer, ...doTexto])];
}

export interface Veredito {
  vendavel: boolean;
  /** As capacidades exigidas que a casa não tem. Vazio quando vendável. */
  faltando: CapacidadeDeProducao[];
  /** Frase honesta, pronta para a pessoa ler. */
  motivo: string;
}

export function conferirOferta(oferta: OfertaConferivel): Veredito {
  const exigidas = capacidadesExigidas(oferta);

  // FALHA FECHADA: oferta que não diz do que precisa não é vendável. Sem isto,
  // um item novo com `requer: []` passaria por não exigir nada.
  if (exigidas.length === 0) {
    return {
      vendavel: false,
      faltando: [],
      motivo:
        "esta oferta não declara nenhuma capacidade de produção — sem declaração " +
        "não há como saber quem produz, e o que não se sabe produzir não se vende",
    };
  }

  const faltando = exigidas.filter((id) => !capacidadeDisponivel(id));
  if (faltando.length === 0) {
    return { vendavel: true, faltando: [], motivo: "toda capacidade exigida tem caminho de produção" };
  }

  const explicacoes = faltando.map((id) => {
    const c = (CAPACIDADES as Record<string, Capacidade | undefined>)[id];
    return c?.falta ?? `capacidade "${id}" não existe nesta casa`;
  });
  return {
    vendavel: false,
    faltando,
    motivo: `a casa ainda não sabe ${explicacoes.join(" Também falta ")}`,
  };
}

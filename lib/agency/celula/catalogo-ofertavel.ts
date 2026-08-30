// ─── O QUE A CÉLULA PODE OFERECER NO 99FREELAS — derivado, nunca digitado ──
//
// Decisão 5 do CEO, 30/08/2026:
//
//   "Na V1 automática, ofereça SOMENTE serviços cuja produção esteja
//    comprovadamente operacional. Site, branding e vídeo ficam suspensos ou
//    exigem decisão supervisionada enquanto não houver capacidade real de
//    entrega."
//
// E a régua do Diretor Geral sobre ela, que é o que decide a forma deste
// arquivo:
//
//   "A decisão 5 exige MECANISMO, não lista escrita: o catálogo do que é
//    ofertável tem que ser DERIVADO da capacidade real, e serviço sem
//    capacidade não pode nem ser montado em proposta."
//
// ── POR QUE NÃO EXISTE AQUI UMA LISTA DE "SUSPENSOS" ──────────────────────
// Seria o jeito óbvio: um `const SUSPENSOS = ["site", "branding", "video"]`.
// E seria errado pelo mesmo motivo que derrubou as três frases falsas do
// `esteira.md`: lista escrita CONGELA um diagnóstico. No dia em que a casa
// ganhar motor de site, a lista continuará dizendo que site é suspenso, e
// ninguém vai lembrar de editá-la. No dia em que o motor de vídeo quebrar, a
// lista continuará dizendo que vídeo é suspenso por decisão — e a casa vai
// achar que está protegida por escolha quando está protegida por acaso.
//
// Aqui não há lista. Cada serviço declara DE QUE CAPACIDADES DEPENDE, e a
// resposta vem de `conferirOferta` — que lê `ponto: null` no mapa de
// capacidades real. Ligou o motor, o serviço abre sozinho. Quebrou o motor,
// ele fecha sozinho.
//
// ── UMA DIVERGÊNCIA QUE EU NÃO VOU ESCONDER ───────────────────────────────
// O CEO escreveu "vídeo fica suspenso". O mapa de capacidades diz outra coisa:
// `edicao-de-video-do-cliente` TEM ponto de produção
// (`lib/agency/media/video.ts` → `editarParaReel`), enquanto
// `legenda-animada-em-video` não tem.
//
// Como a ordem manda derivar da capacidade real, o resultado derivado é:
// editar vídeo BRUTO DO CLIENTE é ofertável; vídeo com legenda animada não é.
// Isso está registrado aqui, e não silenciosamente "corrigido" para bater com
// a frase do CEO — se ele quiser vídeo fechado por decisão de negócio e não
// por falta de motor, isso é `DECISAO_SUPERVISIONADA`, que é o outro caminho
// que a própria ordem dele abriu ("ficam suspensos OU exigem decisão
// supervisionada").

import {
  conferirOferta,
  type CapacidadeDeProducao,
  type Veredito,
} from "@/lib/agency/capacidade-de-producao";

/** Um serviço que a Célula poderia propor num projeto do 99Freelas. */
export interface ServicoDaCelula {
  id: string;
  /** Como aparece para quem lê a proposta. */
  nome: string;
  /** De que capacidades ele depende. É ISTO que decide se ele é ofertável. */
  requer: readonly CapacidadeDeProducao[];
  /** O texto que iria na proposta. Passa pela régua de promessa por escrito:
   *  declarar pouco não apaga o que está na tela do comprador. */
  textos: readonly string[];
  /**
   * `true` quando o CEO exigiu decisão humana MESMO se a capacidade existir.
   * É o segundo caminho que a decisão 5 abriu ("suspensos OU exigem decisão
   * supervisionada") — e é diferente de não ter motor: aqui a casa SABE
   * produzir, e mesmo assim não vende sozinha.
   */
  exigeDecisaoSupervisionada?: boolean;
}

/**
 * Os serviços candidatos. Note que branding, site e vídeo ESTÃO aqui — eles
 * não são omitidos. Omitir seria a lista escrita de novo, por subtração.
 * Eles entram declarando do que precisam, e a régua os recusa sozinha.
 */
export const SERVICOS_DA_CELULA: readonly ServicoDaCelula[] = [
  {
    id: "social-media-pecas",
    nome: "pacote de peças para redes sociais",
    requer: ["arte-estatica-jpeg", "texto-de-marca"],
    textos: ["artes de feed, story e carrossel em JPEG, com legenda no tom da marca"],
  },
  {
    id: "social-media-com-publicacao",
    nome: "peças + publicação no Instagram e Facebook",
    requer: ["arte-estatica-jpeg", "texto-de-marca", "publicacao-instagram-facebook"],
    textos: ["peças publicadas direto no Instagram e no Facebook do cliente"],
  },
  {
    id: "trafego-meta",
    nome: "campanha de tráfego pago na Meta",
    requer: ["arte-estatica-jpeg", "texto-de-marca", "campanha-de-trafego-meta"],
    textos: ["criativos e campanha de tráfego configurada na Meta"],
  },
  {
    id: "video-edicao-de-bruto",
    nome: "edição de vídeo a partir do material do cliente",
    requer: ["edicao-de-video-do-cliente"],
    textos: ["edição de vídeo a partir do material bruto enviado pelo cliente"],
    // A capacidade EXISTE. O freio aqui é de negócio, não de motor — é o
    // "exigem decisão supervisionada" da ordem do CEO.
    exigeDecisaoSupervisionada: true,
  },
  {
    id: "video-com-legenda-animada",
    nome: "vídeo com legenda animada",
    requer: ["edicao-de-video-do-cliente", "legenda-animada-em-video"],
    textos: ["vídeo editado com legenda animada"],
  },
  {
    id: "branding-identidade",
    nome: "identidade visual e logotipo",
    requer: ["logotipo-de-cliente"],
    textos: ["criação de logotipo e identidade visual da marca"],
  },
  {
    id: "site-institucional",
    nome: "site institucional ou landing page",
    requer: ["site-institucional"],
    textos: ["site institucional ou landing page entregue no ar"],
  },
];

export type ResultadoDoServico =
  | { ofertavel: true; servico: ServicoDaCelula }
  | { ofertavel: false; servico: ServicoDaCelula; motivo: string; regra: RegraDeOferta };

export type RegraDeOferta =
  | "servico_desconhecido"
  | "sem_capacidade_de_producao"
  | "exige_decisao_supervisionada";

/**
 * O portão. **É por aqui que se descobre se um serviço pode ser proposto** —
 * e a resposta vem de `conferirOferta`, nunca de uma constante daqui.
 *
 * `modoAutomatico` é o que separa os dois freios da decisão 5: sem capacidade,
 * bloqueia SEMPRE; com capacidade mas sob decisão supervisionada, bloqueia só
 * no automático. Colapsar os dois faria a casa perder a distinção entre
 * "não sabemos fazer" e "sabemos, mas alguém precisa olhar".
 */
export function avaliarServico(id: string, opcoes: { modoAutomatico: boolean }): ResultadoDoServico {
  const servico = SERVICOS_DA_CELULA.find((s) => s.id === id);
  if (!servico) {
    return {
      ofertavel: false,
      // Serviço desconhecido não tem `ServicoDaCelula` para devolver; o
      // chamador recebe o veredito e o id que pediu, no motivo.
      servico: { id, nome: id, requer: [], textos: [] },
      regra: "servico_desconhecido",
      motivo: `serviço "${id}" não existe no catálogo da Célula — desconhecido é indisponível, nunca "deve ser novo".`,
    };
  }

  const veredito: Veredito = conferirOferta({ requer: servico.requer, textos: servico.textos });
  if (!veredito.vendavel) {
    return {
      ofertavel: false,
      servico,
      regra: "sem_capacidade_de_producao",
      motivo: `"${servico.nome}" não é ofertável: ${veredito.motivo}.`,
    };
  }

  if (servico.exigeDecisaoSupervisionada && opcoes.modoAutomatico) {
    return {
      ofertavel: false,
      servico,
      regra: "exige_decisao_supervisionada",
      motivo:
        `"${servico.nome}" tem capacidade de produção, mas o CEO exigiu decisão ` +
        `supervisionada para ele — não sai no modo automático.`,
    };
  }

  return { ofertavel: true, servico };
}

/** O catálogo ofertável, DERIVADO. Nenhuma constante lista quem entra aqui. */
export function servicosOfertaveis(opcoes: { modoAutomatico: boolean }): ServicoDaCelula[] {
  return SERVICOS_DA_CELULA.filter((s) => avaliarServico(s.id, opcoes).ofertavel);
}

// ── A TRAVA QUE A ORDEM PEDIU COM ESSAS PALAVRAS ─────────────────────────────
// "serviço sem capacidade não pode NEM SER MONTADO em proposta".
//
// Por isso o item de proposta não é um objeto que alguém constrói e depois
// alguém valida: ele só NASCE por esta função. Não existe outro construtor
// exportado, e o tipo carrega uma marca que só esta função sabe pôr — então
// um item de proposta que exista é, por construção, um item conferido.

declare const CONFERIDO: unique symbol;

export interface ItemDeProposta {
  readonly [CONFERIDO]: true;
  servicoId: string;
  nome: string;
  /** As capacidades que sustentam este item, para a auditoria depois. */
  sustentadoPor: readonly CapacidadeDeProducao[];
}

export type MontagemDeItem =
  | { ok: true; item: ItemDeProposta }
  | { ok: false; motivo: string; regra: RegraDeOferta };

export function montarItemDeProposta(
  id: string,
  opcoes: { modoAutomatico: boolean },
): MontagemDeItem {
  const r = avaliarServico(id, opcoes);
  if (!r.ofertavel) return { ok: false, motivo: r.motivo, regra: r.regra };
  return {
    ok: true,
    item: {
      servicoId: r.servico.id,
      nome: r.servico.nome,
      sustentadoPor: r.servico.requer,
    } as ItemDeProposta,
  };
}

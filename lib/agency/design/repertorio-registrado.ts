// repertorio-registrado.ts — OS CÉREBROS QUE A CASA JÁ TEM, COM PROCEDÊNCIA.
//
// ── DE ONDE VEIO CADA LINHA DESTE ARQUIVO ───────────────────────────────────
//
// O repertório da FOOCCI abaixo foi **descrito pelo Diretor a partir das peças
// enviadas pelo CEO em 07/08/2026** — as peças que funcionam nas campanhas
// dele, comparadas contra as nossas. Não foi inventado pelo departamento de
// Design, e a procedência está escrita em CADA entrada, não só neste cabeçalho:
// entrada sem procedência é recusada por `montarCerebro`.
//
// ── O QUE ESTE ARQUIVO NÃO É ────────────────────────────────────────────────
//
// **Não é o arquivo das imagens.** As peças de referência não estão no
// repositório. O Drive por cliente — a porta definitiva para o material — está
// sendo construído em paralelo pelo especialista `google`, e este módulo NÃO
// encosta nele. O que mora aqui é a LEITURA das peças (composição + razão), que
// é o que ensina; a imagem em si ensina a copiar.
//
// Consequência honesta e declarada: `resultado` está VAZIO em todas as
// entradas. Nenhuma delas tem dado de performance nesta casa, e preencher com
// estimativa seria a promessa de número que esta casa proíbe.
//
// ── COMO UM CÉREBRO NOVO ENTRA ──────────────────────────────────────────────
//
// Acrescentando um registro aqui, com procedência. Nenhum motor precisa saber
// que ele existe: `cerebroDaMarca` acha pelo nome, e a produção consulta o
// cérebro, não a lista.

import { montarCerebro, type CerebroCriativo, type CerebroMontado } from "./repertorio";
import { REGUA_CARROSSEL_DE_VENDA, REGUA_REVISTINHA_SEMANAL } from "./storyboard";

const DE_ONDE_FOOCCI = "descrito pelo Diretor a partir das peças enviadas pelo CEO em 07/08/2026";

/**
 * O cérebro criativo da FOOCCI.
 *
 * As sete diferenças diagnosticadas entre as peças de referência do CEO e as
 * nossas viraram três coisas: composições (diferenças 2 e 3), amplitude
 * (diferenças 1 e 7) e lacunas declaradas (5 e 6 — o arquivo real do logo e a
 * luz da foto dependem de material que a casa não tem).
 */
export function cerebroDaFoocci(): CerebroMontado {
  const m = montarCerebro({
    marca: "Foocci",
    repertorio: [
      {
        id: "divisao-em-curva",
        descricao: "A tela dividida: um lado é campo sólido com o texto, o outro é foto, e a divisão é uma CURVA.",
        composicao: "dividido-curva",
        funcoes: ["gancho", "tensao"],
        razao: [
          "o texto ganha CAMPO PRÓPRIO em vez de ser jogado sobre a foto com degradê — que é o que as nossas peças faziam, e por isso a leitura dependia da sorte do que a IA desenhou naquele canto",
          "a curva é a assinatura mais reconhecível deste repertório: é o que faz a peça pertencer ao conjunto sem repetir nenhuma outra",
        ],
        procedencia: DE_ONDE_FOOCCI,
      },
      {
        id: "divisao-reta",
        descricao: "A mesma divisão de campo, em corte reto. A versão sóbria da curva.",
        composicao: "dividido-reto",
        funcoes: ["mecanismo", "resultado"],
        bloco: "celular",
        razao: [
          "quando a tela explica COMO funciona, o corte reto não disputa atenção com o que está sendo explicado",
          "alterna com a curva ao longo do carrossel e é o que dá RITMO ao conjunto — cinco telas com a mesma divisão viram cinco vezes a mesma tela",
          "é a tela que carrega a moldura de celular com o app real: nas peças de referência o celular mostra o produto, e o produto é o argumento",
        ],
        procedencia: DE_ONDE_FOOCCI,
      },
      {
        id: "painel-de-prova",
        descricao: "Campo sólido com quadro de números — a prova visual.",
        composicao: "dividido-reto",
        funcoes: ["prova"],
        bloco: "numeros",
        razao: [
          "número em destaque é o que transforma afirmação em prova, e é a estrutura de informação que faltava nas nossas peças (manchete + uma linha, com a metade de baixo vazia)",
          "e por isso mesmo é a entrada mais perigosa da lista: o bloco só é montado com número de ORIGEM DECLARADA, e captura de tela é captura real ou leva selo de ilustração na própria peça (`mockup.ts`). Esta entrada NÃO afrouxa aquela trava — ela depende dela",
        ],
        procedencia: DE_ONDE_FOOCCI,
      },
      {
        id: "conversa-como-mecanismo",
        descricao: "Balão de conversa: a mensagem respondida sozinha, na tela.",
        composicao: "dividido-curva",
        funcoes: ["mecanismo"],
        bloco: "conversa",
        razao: [
          "a imagem É o argumento: a mensagem sendo respondida *é* a automação, do mesmo jeito que a sacola entregue *é* o canal próprio",
          "o balão é a assinatura do feed da Foocci e aparece nas peças de referência, não nas nossas",
        ],
        procedencia: DE_ONDE_FOOCCI,
      },
      {
        id: "chamada-de-acao-cheia",
        descricao: "Fechamento em foto cheia, com a chamada e a assinatura fixa de rodapé.",
        composicao: "foto-cheia",
        funcoes: ["acao"],
        razao: [
          "a última tela é o ponto de contato, e a foto do lugar real (a porta, o balcão, o entregador) é o que dá endereço à ação",
          "a assinatura fixa de rodapé fecha a peça e amarra o conjunto — as peças de referência têm, as nossas não tinham",
        ],
        procedencia: DE_ONDE_FOOCCI,
      },
    ],
    amplitude: [
      {
        eixo: "formalidade / preço percebido",
        extremoA: "boteco — mesa simples, luz de fim de tarde, comida cotidiana",
        extremoB: "bistrô — louça, textura, luz baixa, prato composto",
        porque:
          "a marca é DEMOCRÁTICA: ela não pode parecer sempre um restaurante de luxo, mas em algum momento tem que pôr um restaurante de luxo também. Os dois extremos são propositais — transitar entre eles É a identidade, não um desvio dela.",
        foraDaMarca: [
          "cena estéril de banco de imagem, sem lugar reconhecível",
          "luxo como padrão do mês inteiro",
        ],
        procedencia:
          'dito pelo CEO em 07/08/2026, verbatim: "a gente é uma marca democrática, então a gente não pode parecer sempre que é um restaurante de luxo, mas em algum momento a gente tem que pôr um restaurante de luxo também"',
      },
      {
        eixo: "presença da marca na cena",
        extremoA: "a marca discreta: um detalhe no canto do avental",
        extremoB: "a marca em primeiro plano: a sacola, a bolsa do entregador, o app na tela",
        porque:
          "nas peças que funcionam, a marca VIVE DENTRO DA CENA — o avental tem o símbolo, a sacola tem o símbolo, o celular mostra o app real. Nas nossas, o nome da marca é uma palavra no canto. Os dois extremos são permitidos; a marca ausente da cena não é.",
        foraDaMarca: ["a marca só como palavra no canto da peça"],
        procedencia: DE_ONDE_FOOCCI,
      },
      {
        eixo: "luz da cena",
        extremoA: "luz quente de ambiente, assunto iluminado, sombra macia",
        extremoB: "luz baixa com o assunto recortado, contraste alto",
        porque:
          "nos dois extremos o ASSUNTO aparece. A nossa peça estava subexposta e o assunto quase não aparecia — e isso não é um estilo, é um defeito de exposição.",
        foraDaMarca: ["assunto subexposto, indistinguível do fundo"],
        procedencia: DE_ONDE_FOOCCI,
      },
    ],
    formatos: [
      {
        id: "carrossel-de-venda",
        label: "Carrossel de venda",
        cadencia: "1 a 2 por mês, dentro do pacote de conteúdo",
        regua: REGUA_CARROSSEL_DE_VENDA,
        composicoesPermitidas: ["dividido-curva", "dividido-reto", "foto-cheia"],
        procedencia: DE_ONDE_FOOCCI,
      },
    ],
  });

  // As diferenças que NÃO dá para fechar com o que a casa tem hoje. Ficam
  // declaradas no próprio cérebro para subirem junto com toda peça produzida a
  // partir dele — lacuna que ninguém lê não é lacuna declarada.
  m.cerebro.lacunas.push(
    "o arquivo REAL do logo da Foocci (o símbolo tem desenho próprio; hoje a peça escreve o nome numa fonte comum, e quem conhece a marca percebe na hora)",
    "o texto exato da assinatura fixa de rodapé, aprovado pelo cliente",
    "as peças de referência em si — vivem no Drive por cliente, que está sendo construído em paralelo",
    "dado de performance de qualquer entrada deste repertório (nenhuma tem `resultado`, e estimativa não entra)",
  );
  return m;
}

/**
 * O cérebro criativo da DIOLI DIGITAL — a casa como marca.
 *
 * Existe por causa da revistinha semanal de tech, pedida pelo CEO em
 * 07/08/2026. É a prova de que formato novo entra como DADO: nenhuma linha de
 * motor sabe que a revistinha existe.
 */
export function cerebroDaDioli(): CerebroMontado {
  const de = "pedido do CEO em 07/08/2026 (a revistinha semanal de tech)";
  return montarCerebro({
    marca: "Dioli Digital",
    repertorio: [
      {
        id: "capa-de-edicao",
        descricao: "Capa da edição: número da edição, semana e uma cena-síntese.",
        composicao: "dividido-reto",
        funcoes: ["capa"],
        razao: [
          "publicação periódica precisa de capa reconhecível — é o que faz a edição 12 parecer da mesma revista que a edição 1",
          "corte reto e NÃO curva: a curva é a assinatura do carrossel de venda, e usar a mesma nos dois faria a revista parecer anúncio",
        ],
        procedencia: de,
      },
      {
        id: "materia-em-painel",
        descricao: "Uma matéria por tela, com o quadro de informação ao lado da foto.",
        composicao: "dividido-reto",
        funcoes: ["materia"],
        bloco: "painel",
        razao: [
          "notícia é informação estruturada, não manchete: o que aconteceu e por que importa precisam caber na mesma tela sem virar parágrafo",
          "é a composição que ocupa a metade de baixo da peça — a terceira crítica do CEO às nossas peças",
        ],
        procedencia: de,
      },
      {
        id: "fechamento-de-edicao",
        descricao: "Fechamento: amarra a edição e diz quando sai a próxima.",
        composicao: "foto-cheia",
        funcoes: ["fechamento"],
        razao: [
          "a assinatura fixa de rodapé fecha a peça e amarra o conjunto",
          "a promessa da próxima edição é o que transforma um post em publicação periódica",
        ],
        procedencia: de,
      },
    ],
    amplitude: [
      {
        eixo: "temperatura editorial",
        extremoA: "notícia seca — o fato e o impacto, sem adjetivo",
        extremoB: "leitura opinativa — o que a Dioli acha que aquilo muda",
        porque:
          "uma revistinha só de fatos é agregador de link; só de opinião é blog. A edição transita entre os dois, e transitar é o formato.",
        foraDaMarca: [
          "previsão de mercado com número",
          "promessa de resultado a partir de notícia de terceiro",
        ],
        procedencia: de,
      },
    ],
    formatos: [
      {
        id: "revistinha-semanal-tech",
        label: "Revistinha semanal — mundo tech",
        cadencia: "uma vez por semana",
        regua: REGUA_REVISTINHA_SEMANAL,
        composicoesPermitidas: ["dividido-reto", "foto-cheia"],
        procedencia: de,
      },
    ],
  });
}

/**
 * O cérebro criativo do CITYJOBS.
 *
 * ── POR QUE ELE NASCEU DEPOIS, E ISSO É O ACHADO (CEO, 08/08/2026) ──────────
 *
 * O CityJobs produzia peça desde 05/08 e **não tinha cérebro registrado**.
 * `cerebroDaMarca("CityJobs")` devolvia o cérebro vazio, corretamente, e a peça
 * saía no molde base. Foi nesse vácuo que quase se instalou o erro que o CEO
 * pegou antes do Diretor: a régua de qualidade veio da peça de referência da
 * DIOLI (`Radar Dioli Tech` — serifa de display, creme, azul-marinho, mockup de
 * tablet sobre mármore, tom de curadoria de tecnologia), e ia ser aplicada
 * inteira a uma plataforma de vagas do Alto Tietê.
 *
 * **"Essa arte é da Dioli Digital, você está misturando os projetos."**
 *
 * O que se leva de uma referência é o NÍVEL — fotografia real, camadas,
 * respiro, hierarquia em três níveis, paleta contida. O que NÃO se leva é o
 * VISUAL: a tipografia, a paleta e o repertório de objetos de outra marca.
 * Este registro existe para que o CityJobs tenha os dele.
 *
 * ── A PROCEDÊNCIA, E ELA NÃO É "O DESIGNER ACHOU" ──────────────────────────
 *
 * Duas fontes, as duas do próprio cliente e as duas no repositório:
 * `docs/projetos/cityjobs-orcamento.md` (o briefing aprovado em 05/08) e
 * `public/brand/cityjobs/LEIA-ME.md` (o manual dos logos oficiais).
 */
export function cerebroDoCityJobs(): CerebroMontado {
  const de =
    "briefing aprovado em docs/projetos/cityjobs-orcamento.md (05/08/2026) + manual da marca em public/brand/cityjobs/LEIA-ME.md";
  return montarCerebro({
    marca: "CityJobs",
    repertorio: [
      {
        id: "bastidor-da-regiao",
        descricao:
          "Fotografia real de um lugar do Alto Tietê que a pessoa reconhece, com o texto num campo azul-marinho embaixo.",
        composicao: "dividido-reto",
        funcoes: ["bastidor", "comunidade"],
        razao: [
          "quem lê está procurando trabalho e é da região: lugar reconhecível é prova de que a vaga é daqui, e prova vale mais que adjetivo",
          "campo sólido próprio para o texto porque a peça é lida no celular, muitas vezes em movimento — legibilidade não pode depender do que a foto tem naquele canto",
          "corte RETO e não curva: a curva é assinatura de peça de venda, e o CityJobs não está vendendo, está informando quem procura emprego",
        ],
        procedencia: de,
      },
      {
        id: "institucional-vaga-validada",
        descricao:
          "A promessa da plataforma dita em uma frase curta, sobre foto de rua de comércio da região.",
        composicao: "dividido-reto",
        funcoes: ["institucional", "dica"],
        razao: [
          "a diferença do CityJobs é a CHECAGEM, e checagem é um conceito abstrato: a foto tem de ancorá-la no lugar de onde a vaga vem",
          "frase curta e sem número: o pilar de salário está bloqueado e promessa de contratação é risco jurídico, não escolha de copy",
        ],
        procedencia: de,
      },
    ],
    amplitude: [
      {
        eixo: "temperatura",
        extremoA: "prática e direta — o que fazer, onde, com que documento",
        extremoB: "quente e de gente — o alívio de trabalhar perto de casa",
        porque:
          "quem procura emprego alterna entre a tarefa (mandar currículo) e o motivo (ter tempo de volta). Só o prático vira mural de avisos; só o emocional vira frase de autoajuda sem vaga nenhuma atrás.",
        foraDaMarca: [
          "estética de escritório de tecnologia — coworking, tablet, mármore, café",
          "tipografia serifada de display (o manual da marca é sans: Arial Black / Arial / Helvetica)",
          "paleta creme ou qualquer cor fora de #0D2B4D · #FFFFFF · #16A34A · #FFD24D",
          "promessa de contratação, 'emprego garantido' ou linguagem sensacionalista",
          "salário, número de vagas ou nome de empresa dentro dos pixels",
        ],
        procedencia: de,
      },
      {
        eixo: "distância da pessoa",
        extremoA: "a cidade — estação, avenida, comércio de rua",
        extremoB: "a pessoa — quem trabalha, quem espera, quem caminha",
        porque:
          "a marca é regional antes de ser de emprego: o Alto Tietê tem de ser reconhecível na foto. Mas cidade sem gente vira cartão-postal de prefeitura, e a peça precisa falar com quem está procurando trabalho.",
        foraDaMarca: ["banco de imagem genérico sem relação com a região"],
        procedencia: de,
      },
    ],
    formatos: [
      {
        id: "post-simples-de-feed",
        label: "Post simples de feed 4:5",
        cadencia: "dois por dia, 60 por mês",
        regua: REGUA_CARROSSEL_DE_VENDA,
        // Só as divididas. `foto-cheia` é a composição que produziu as 36 telas
        // iguais da Foocci, e num feed de DOIS posts por dia ela viraria a
        // mesma peça 60 vezes por mês.
        composicoesPermitidas: ["dividido-reto"],
        procedencia: de,
      },
    ],
  });
}

/** Os cérebros registrados, achados por nome de marca. */
const REGISTRADOS: Array<{ chave: RegExp; montar: () => CerebroMontado }> = [
  { chave: /foocci/i, montar: cerebroDaFoocci },
  // ⚠️ O CityJobs vem ANTES da Dioli de propósito. `/dioli/i` é uma régua
  // larga, e a ordem desta lista é a única coisa que decide quando duas
  // baterem. Regra: o mais específico primeiro. Há teste que reprova a
  // inversão — foi um vazamento de marca que o CEO pegou em 08/08.
  { chave: /city\s*jobs/i, montar: cerebroDoCityJobs },
  { chave: /dioli/i, montar: cerebroDaDioli },
];

/**
 * O cérebro DESTA marca.
 *
 * Marca sem cérebro registrado recebe o cérebro VAZIO, com as lacunas
 * declaradas — nunca o cérebro de outra. Emprestar o repertório da Foocci a um
 * cliente qualquer seria a agência dando a identidade de um cliente a outro.
 */
export function cerebroDaMarca(nome: string | null | undefined): CerebroCriativo {
  const n = (nome ?? "").trim();
  if (n) {
    for (const r of REGISTRADOS) {
      if (r.chave.test(n)) return r.montar().cerebro;
    }
  }
  const vazio = montarCerebro({ marca: n }).cerebro;
  vazio.lacunas.unshift(
    `nenhum cérebro criativo registrado para "${n || "(cliente sem nome)"}" — as peças saem no molde base, sem repertório de marca`,
  );
  return vazio;
}

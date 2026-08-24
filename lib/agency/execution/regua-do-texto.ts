// regua-do-texto.ts — O QUE NÃO PODE SER DITO NUMA PEÇA, conferido em código.
//
// ── POR QUE ESTE ARQUIVO EXISTE (13/08/2026) ────────────────────────────────
//
// Pergunta do CEO, literal: *"a gente precisa saber se o Radar ou a Oficina de
// peças está funcionando, porque está saindo uns posts bem ruins."*
//
// O raio-X respondeu que não era nenhum dos dois. A casa tinha três coisas
// conferindo a peça, e nenhuma delas sabe dizer que um texto é ruim:
//
//   • `conferirContrato` (`especialistas.ts:643`) conta itens e formatos. Não lê
//     uma palavra.
//   • `conferirPisoDeVerdade` (`piso-de-verdade.ts:1221`) confere FATO contra a
//     verdade do cliente lida do banco — telefone, preço, documento, horário,
//     área de entrega, proibição registrada. Faz isso bem, e de propósito não
//     tem opinião sobre qualidade.
//   • `auditDeliverable` (`quality-auditor.ts:196`) é UMA chamada de IA, com
//     cinco perguntas em prosa e a instrução final `verdict="flag" só se houver
//     problema real` — sem lista, sem exemplo, sem régua.
//
// Ou seja: julgar se a peça presta era, inteiramente, opinião de um modelo
// inclinado a aprovar. E está medido o que isso produz.
//
// ── A MEDIÇÃO, em produção, com as frases ───────────────────────────────────
//
// `docs/projetos/cityjobs-registro-07-08.md:139` — 8 peças, a Qualidade
// carimbou `quality_ok` nas 8, e um humano reprovou todas na hora seguinte:
//
//     "Tem centenas de vagas esperando"        → quantidade que ninguém contou
//     "aumenta suas chances drasticamente"     → ganho prometido sem número
//     "as melhores empresas da região"         → superlativo sem lastro
//     "seu próximo trabalho está a um clique"  → jargão
//
// Nenhuma das quatro é fato inventado — por isso o piso não pegou, e ele está
// certo em não pegar. Todas as quatro são regex.
//
// A lei da casa decide o resto: **prompt é aviso; código é trava.** O que dá
// para escrever em código vira código, e a IA passa a julgar o que sobrou.
//
// ── ONDE ELA RODA, E A ORDEM É A REGRA ──────────────────────────────────────
//
// DENTRO de `auditDeliverable`, ANTES da chamada de IA. Três consequências, e
// as três são o ponto:
//
//   1. **Determinístico primeiro.** Reprovou aqui, nenhum modelo é consultado —
//      a recusa não custa uma chamada e não pode ser "convencida".
//   2. **A opinião da IA continua existindo**, e passa a julgar em cima do que
//      já passou pela lista.
//   3. **Um lugar só conserta quatro caminhos.** `auditDeliverable` é chamada
//      por `run-execution.ts`, `producao-de-pedido.ts`, `mes.ts` e
//      `pacote-travado.ts`. Régua posta em quem chama teria de ser lembrada
//      quatro vezes — foi assim que a escada foi consertada em `marcos.ts` e
//      esquecida em `mes.ts`, em 07/08.
//
// E o laço de correção que já existe passa a valer para ela: reprovada, o
// especialista refaz com o parecer na mão (`run-execution.ts:703`), e o que não
// se conserta vira `quality_flag`, que bloqueia a apresentação.
//
// ── UMA LISTA, DOIS USOS ────────────────────────────────────────────────────
//
// A lista NÃO é escrita aqui. Ela é `CLASSES_DE_ALEGACAO`, de
// `lib/agency/design/trava-de-texto.ts` — a mesma que guarda o pixel, e que já
// carrega a calibragem de falso positivo de duas auditorias adversariais (o
// artigo definido e a âncora geográfica que separam "o melhor caminho depende
// do seu faturamento" de "a melhor padaria da cidade"). Copiá-la para cá daria
// duas cópias divergindo em três meses.
//
// O que este arquivo faz é o RECORTE: da lista de lá, só as classes de
// ALEGAÇÃO. As classes de FATO (preço, telefone, prazo, percentual, promessa
// comercial) ficam de fora, e a razão é o inverso do descuido — um preço na
// legenda é legítimo quando o cliente informou aquele preço, e quem confere
// isso contra o banco é o piso de verdade. Barrá-las aqui reprovaria a peça
// correta, e freio que reprova o legítimo é desligado na primeira semana.

import {
  CLASSES_DE_ALEGACAO,
  acharClasse,
} from "@/lib/agency/design/trava-de-texto";

/** Uma afirmação que a peça faz e que nada pode sustentar. */
export interface AlegacaoSemLastro {
  /** A família da regra: "jargão de robô", "promessa vaga", … */
  classe: string;
  /** A frase da peça em que ela apareceu — o contexto que o autor reconhece. */
  trecho: string;
  /** O fragmento exato que acionou a regra, na forma em que a régua o viu. */
  achado: string;
}

export interface VereditoDaRegua {
  aprovado: boolean;
  violacoes: AlegacaoSemLastro[];
}

/**
 * Tipos de entregável que a régua NÃO confere — e a lista é curta de propósito.
 *
 * São os documentos em que a agência ANALISA em vez de FALAR com o mercado. A
 * diferença é discurso reportado: o especialista de concorrência tem por
 * trabalho escrever *"a Padaria X se posiciona como a mais tradicional do
 * bairro"*, e essa frase casa com o padrão de superlativo pelo mesmo motivo que
 * a peça ruim casa — a régua lê forma, não intenção. Reprovar a análise correta
 * de um concorrente ensinaria o time a desligar o freio.
 *
 * **Isto é uma fronteira declarada, não uma isenção esquecida.** O custo dela
 * está escrito no fim do arquivo, em "o que continua passando": se o jargão
 * entrar pelo posicionamento, ele desce para todas as peças e esta régua não o
 * pega na origem. Fechar isso exige medir o corpus de estratégia, e medir com
 * corpus que o autor da regra não escreveu é lei desta casa
 * (`trava-de-texto.ts:75`). É trabalho de outra passada, com número na mão.
 *
 * **Fail-closed:** tipo desconhecido ou ausente NÃO está isento. Entregável
 * novo nasce protegido; quem quiser isentá-lo escreve aqui e explica.
 */
export const TIPOS_DE_DOCUMENTO_INTERNO: readonly string[] = [
  "strategy",
  "analytics",
  "report",
  "financeiro",
  "brand-kit",
  // ── BASE DE MARCA (24/08/2026) ───────────────────────────────────────────
  // Entra pelo MESMO motivo que `strategy`, e não por conveniência: o núcleo
  // deste documento são os CONTRA-EXEMPLOS literais — "não dizemos assim", as
  // palavras proibidas, o que a marca nunca afirma mesmo sendo verdade. Citar
  // "o melhor da cidade" para PROIBI-LO casa com o detector de superlativo pelo
  // mesmo motivo que a peça ruim casa: a régua lê forma, não intenção.
  //
  // Reprovar o documento que existe para proibir o jargão ensinaria o time a
  // desligar o freio. É fronteira declarada, com o mesmo custo declarado do
  // `strategy`: se o jargão entrar pela base de marca, ele desce para todas as
  // peças e esta régua não o pega na origem. Quem o pega ali é o contrato de
  // saída (`branding.ts`), que recusa campo inventado, e o juiz da Qualidade.
  "brand-foundation",
];

/** A régua confere este tipo de entregável? */
export function reguaSeAplicaA(tipoDaEntrega?: string | null): boolean {
  const t = (tipoDaEntrega ?? "").trim().toLowerCase();
  if (!t) return true; // ausência não é isenção
  return !TIPOS_DE_DOCUMENTO_INTERNO.includes(t);
}

/** Teto de violações relatadas. O parecer serve para o agente CORRIGIR; uma
 *  lista de quarenta itens vira ruído e ele reescreve no escuro. */
const MAX_VIOLACOES = 8;

/**
 * Quebra a peça em unidades de leitura.
 *
 * Frase, não texto inteiro: o parecer precisa devolver ONDE, e "a peça tem
 * jargão" manda o autor procurar. Quebra também por linha e por marcador de
 * lista porque o corpo da entrega é markdown montado por `esteira/conteudo.ts`,
 * onde muita afirmação vive num bullet que nunca termina em ponto.
 *
 * ── O PONTO ENTRE DÍGITOS NÃO É FIM DE FRASE ────────────────────────────────
 *
 * `piso-de-verdade.ts:247` já tinha escrito a lição — *"o separador de frase é o
 * ponto, e 'R$ 5.000,00' tem ponto no meio; partir por frase quebraria o próprio
 * valor ao meio"* — e eu a repeti mesmo assim. O primeiro teste desta régua
 * pegou: "Mais de 3.000 pedidos entregues" virava "Mais de 3" + "000 pedidos
 * entregues", e o padrão de multidão inventada não casava com nenhum dos dois.
 *
 * O número redondo é justamente a forma da alegação que este arquivo existe
 * para pegar — sem esta guarda, a régua falhava exatamente onde precisava
 * funcionar, e falhava calada.
 */
function frases(texto: string): string[] {
  return texto
    .split(/(?:(?<![0-9])\.(?![0-9])|[!?;]|\n|·|•|\|)+/)
    .map((f) => f.replace(/[*_#>`-]+/g, " ").replace(/\s+/g, " ").trim())
    .filter((f) => f.length > 0);
}

/**
 * A peça afirma alguma coisa que nada pode sustentar?
 *
 * Determinística: sem IA, sem rede, sem banco. Mesmo texto, mesmo veredito, em
 * qualquer máquina e em qualquer dia — que é a diferença entre uma trava e uma
 * opinião.
 *
 * Recebe título e corpo juntos, e isso não é detalhe: o título vira o `name` do
 * `Deliverable` e é o PRIMEIRO campo que o cliente lê no portal. Foi por
 * conferir só o corpo que "Pacote Noiva R$ 1.000" passou inteiro pelo piso de
 * verdade até 05/08 (`run-execution.ts:626`).
 */
export function conferirReguaDoTexto(conteudo: string): VereditoDaRegua {
  const violacoes: AlegacaoSemLastro[] = [];
  const vistas = new Set<string>();

  for (const frase of frases(conteudo)) {
    const achado = acharClasse(frase, CLASSES_DE_ALEGACAO);
    if (!achado) continue;
    // A mesma regra acionada pelo mesmo fragmento reprova UMA vez. Repetir o
    // parecer não ajuda o autor a consertar — só encompridá-lo.
    const chave = `${achado.classe}|${achado.trecho}`;
    if (vistas.has(chave)) continue;
    vistas.add(chave);
    violacoes.push({
      classe: achado.classe,
      trecho: frase.slice(0, 160),
      achado: achado.trecho,
    });
    if (violacoes.length >= MAX_VIOLACOES) break;
  }

  return { aprovado: violacoes.length === 0, violacoes };
}

/**
 * O parecer em linguagem de gente, um item por violação.
 *
 * Cada linha diz O QUE está errado, ONDE está e POR QUE não pode. Sem as três,
 * o agente reescreve a peça inteira às cegas e costuma piorar o que estava bom.
 */
export function resumirAlegacoes(violacoes: AlegacaoSemLastro[]): string[] {
  return violacoes.map(
    (v) => `${v.classe}: "${v.achado}" (em "${v.trecho}") — ${POR_QUE[v.classe] ?? POR_QUE.padrao}`,
  );
}

/** Por que cada família não pode. É o texto que vai para o agente refazer e
 *  para o humano que abrir o registro — trava que não se explica é desligada
 *  por quem não sabe o que ela protege. */
const POR_QUE: Record<string, string> = {
  "superlativo não sustentável":
    "afirmação de superioridade que a agência não tem como provar. Troque pelo fato concreto que a sustenta, ou tire.",
  "jargão de robô":
    "frase que serve para qualquer cliente e não diz nada sobre este. Escreva o que só este negócio poderia dizer.",
  "promessa vaga":
    "ganho prometido ao leitor sem número que o sustente. Marketing não garante resultado — diga o que a peça FAZ, não o que ela promete render.",
  "prova social sem prova":
    "afirma cliente satisfeito sem depoimento real registrado. Se houver depoimento de verdade, cite-o; se não houver, não invente.",
  "multidão inventada":
    "quantidade que ninguém contou. Se o número existe e o cliente informou, escreva o número; se não existe, não estime.",
  padrao: "afirmação sem lastro. Tire ou substitua pelo fato que a sustenta.",
};

// ── O QUE CONTINUA PASSANDO — dito com todas as letras ──────────────────────
//
// Esta régua é determinística e trabalha sobre a FORMA. Fixado aqui e travado
// em teste (`__tests__/execution/regua-do-texto.test.ts`, "o resíduo conhecido")
// para que a lacuna não seja silenciosa:
//
//   1. A promessa contada como HISTÓRIA. "De procurando emprego a CONTRATADO"
//      promete o mesmo que "aumenta suas chances", sem verbo de ganho e sem
//      intensificador. Exige julgamento de sentido.
//   2. O hype sem palavra proibida. "VAGAS QUENTES HOJE", "Empresa em ALTA
//      DEMANDA contratando" — as duas chegaram ao calendário do CityJobs e as
//      duas passam aqui.
//   3. Jargão fora da colocação fixa. "Inovador" sozinho é adjetivo legítimo
//      ("um método inovador de assar"), e por isso só entra acompanhado.
//   4. Peça correta e sem graça. A régua reprova o que não se sustenta; ela não
//      sabe dizer que um texto certo é sem sal. Isso continua sendo o trabalho
//      do juiz de IA, que roda depois.
//   5. Documento interno (ver `TIPOS_DE_DOCUMENTO_INTERNO`).
//
// Fechar 1–2 exige LLM-judge por checagem, que é a Onda 5 do P0
// (`lib/dioli-brain/quality-gates.ts:66`). Regex larga o bastante para pegá-las
// come peça legítima, e trava que reprova tudo é desligada na primeira semana.

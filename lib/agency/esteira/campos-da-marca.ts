// campos-da-marca.ts — A CONSTITUIÇÃO DA MARCA, EM DADO PURO.
//
// Estas constantes nasceram em `ficha-de-marca.ts` e saíram de lá em 24/08/2026
// por um motivo mecânico, não estético: `ficha-de-marca.ts` importa o banco, e
// o especialista de branding (`execution/branding.ts`) precisa da MESMA lista
// dentro de um módulo que a esteira carrega cedo. Arrastar o cliente do banco
// para dentro do organograma quebrou a ordem de carga de suítes que dependem de
// mock hoisted.
//
// **Continua havendo uma verdade só**: `ficha-de-marca.ts` reexporta daqui.
// Copiar a lista para o branding seria a segunda verdade que esta casa já pagou
// várias vezes.
//
export type EstadoDoCampo = "definido" | "lacuna" | "herdado_default";

/** Os nove campos da constituição. A ordem é a de leitura por um humano: quem
 *  é → com quem fala → como fala → o que não pode → com o que se parece. */
export const CAMPOS_DA_MARCA = [
  "proposito_e_promessa",
  "publico_e_relacao",
  "voz",
  "lexico",
  "proibicoes",
  "referencias",
  "atributos_formais",
  "limites_de_promessa",
  "hierarquia_e_dono",
] as const;
export type CampoDaMarca = (typeof CAMPOS_DA_MARCA)[number];

/** O MODO MÍNIMO, para trabalho curto. Vem do Conselho, que apostou que quatro
 *  ou cinco dos nove ficarão em lacuna para sempre e que este seria a realidade.
 *  São os quatro sem os quais não existe julgamento nem escalada possível. */
export const MODO_MINIMO: CampoDaMarca[] = [
  "proposito_e_promessa",
  "lexico",
  "proibicoes",
  "hierarquia_e_dono",
];

/** O que o humano lê na tela. Sem jargão: a ficha é preenchida pelo dono do
 *  negócio, não por quem programa. */
export const ROTULO: Record<CampoDaMarca, string> = {
  proposito_e_promessa: "O que vocês fazem, e o que o cliente pode esperar",
  publico_e_relacao: "Com quem vocês falam, e de que jeito",
  voz: "Como vocês falam — e como não falam",
  lexico: "Como o nome se escreve, e as palavras que não se usa",
  proibicoes: "O que a marca nunca faz",
  referencias: "Exemplos do que ficou certo — e do que ficou errado",
  atributos_formais: "Cor e tipografia",
  limites_de_promessa: "O que não se afirma, mesmo sendo verdade",
  hierarquia_e_dono: "Quem decide, por onde, e em quanto tempo",
};

/** A pergunta que vai ao dono quando o campo está em lacuna. Fechada sempre que
 *  possível: escolher é mais fácil que escrever, e responde mais gente. */
export const PERGUNTA: Record<CampoDaMarca, string> = {
  proposito_e_promessa: "Em uma frase: o que o seu cliente ganha ao escolher vocês?",
  publico_e_relacao: "Vocês falam com o cliente como um igual, como especialista, ou como prestador de serviço?",
  voz: "Escreva duas frases: uma do jeito que vocês falariam, e uma do jeito que vocês NUNCA falariam.",
  lexico: "Como o nome se escreve, exatamente? E existe alguma palavra que vocês não usam?",
  // A redação NÃO é nova: é a da entrevista do painel (`IntakeEngine.tsx:339`),
  // que já perguntava isto em língua de cliente há meses — e cuja resposta ia
  // para `updateClient` → `PUT /api/clients/[id]`, uma rota que lê do corpo só
  // name/industry/email/phone/website e descarta o resto em silêncio. Uma
  // terceira redação para a mesma pergunta é como as duas verdades nascem.
  //
  // O "até três" é o gatilho falando: a constituição pede **três** proibições
  // vigentes, e pedir uma de cada vez faria o cliente responder três rodadas
  // para abrir a porta uma vez.
  proibicoes:
    "Tem algo que a gente nunca deve fazer, dizer ou mostrar no material de vocês? " +
    "Pode ser uma palavra, uma cor ou um concorrente que nunca deve ser citado. " +
    "Escreva até três, uma por linha.",
  referencias: "Manda um exemplo de post que você achou a sua cara — e um que você achou que não era.",
  atributos_formais: "Quais são as cores da marca? Se não souber o código, manda uma foto do logo.",
  limites_de_promessa: "Tem alguma coisa que vocês preferem não prometer, mesmo sendo verdade?",
  hierarquia_e_dono: "Quem aprova o material de vocês, e por onde a gente fala com essa pessoa?",
};


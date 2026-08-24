// pergunta-sem-encaixe.ts — o que a casa faz quando não entendeu a resposta.
//
// ─── A DOENÇA (medida em 24/08/2026, sobre o caso Farol 27) ──────────────────
//
// A cliente respondeu à pergunta "redes sociais, tráfego pago ou identidade
// visual?" com *"Quero lançar um clube de assinatura para os clientes fiéis."*
// A casa não tem esse produto, então nada casou. E a fila de perguntas fez a
// única coisa que sabia fazer: **perguntou de novo**. A MESMA frase, palavra
// por palavra, SEIS turnos seguidos. No caminho, engoliu o objetivo, o público,
// a verba de R$ 8.000 e o prazo — cada um foi lido como tentativa de responder
// a pergunta do serviço, não encaixou, e foi jogado fora em silêncio. O escopo
// terminou com `objectives: []` e nenhum público, nenhuma verba, nenhum prazo.
//
// Isto é PIOR que um escopo errado. Escopo errado produz um orçamento ruim que
// alguém pode corrigir. Isto produz um **cliente que desiste**: ninguém
// responde seis vezes a mesma pergunta. Ele fecha a aba e vai embora, e a casa
// nunca fica sabendo por quê — não há erro, não há log, não há reclamação.
//
// ─── DE ONDE VEIO A REPETIÇÃO (e por que ela não é um bug bobo) ──────────────
//
// Ela foi POSTA ali de propósito, em 16/08/2026, para consertar o defeito
// oposto: `detect_service` era marcada como respondida só por ter sido feita, e
// o pedido seguia sem serviço nenhum até o portão travar no último passo. O
// comentário daquele conserto termina com *"repetir a pergunta é barato; perder
// o lead no último passo, não"*.
//
// A frase estava certa pela metade. Repetir UMA vez é barato. Repetir seis é
// perder o lead no PRIMEIRO passo, que é mais caro e mais silencioso. O que
// faltava não era menos rigor — era o terceiro caminho, entre "aceitar
// qualquer coisa como resposta" e "insistir para sempre".
//
// ─── A REGRA, E A INSTRUÇÃO GÊMEA ────────────────────────────────────────────
//
// Nesta casa **toda proibição precisa da instrução gêmea**: proibir sem dizer o
// que fazer no lugar não é regra, é um buraco com aviso em cima.
//
//   PROIBIÇÃO — a mesma pergunta não é feita três vezes, e nunca com a mesma
//   frase duas vezes seguidas.
//
//   INSTRUÇÃO GÊMEA — o que a casa não entendeu **é registrado com as palavras
//   do cliente** e a conversa AVANÇA. A resposta dele nunca é descartada em
//   silêncio: vira lacuna (`comercial/lacuna-de-escopo.ts`), a lacuna segura a
//   confiança do orçamento lá embaixo (`live-calculator.ts`), e alguém pergunta
//   depois — fora do caminho crítico do cliente.
//
// O saldo é honesto: a casa prefere sair da conversa sabendo que não entendeu a
// sair dela tendo torrado a paciência de quem veio comprar.

import type { LacunaDeEscopo } from "./lacuna-de-escopo";

/**
 * Quantas vezes a MESMA pergunta pode ser feita numa conversa.
 *
 * Dois: a original e UMA reformulação. A terceira não existe — é a partir dela
 * que a pessoa entende que está falando com uma parede.
 */
export const LIMITE_DE_INSISTENCIA = 2;

/**
 * Acrescenta uma resposta sem encaixe à lista de lacunas do escopo.
 *
 * ⚠️ NÃO É `unirLacunas`, e a diferença custou uma medição. `unirLacunas`
 * guarda a PRIMEIRA ocorrência de cada id, o que é certo para lacuna de
 * vocabulário (a frase original do cliente é a prova, e a repetição dele não
 * acrescenta nada). Aqui é o contrário: cada resposta sem encaixe é uma FALA
 * DIFERENTE que a casa não entendeu, e guardar só a primeira faria a segunda
 * ser descartada em silêncio — exatamente o defeito que este módulo existe para
 * matar, sobrevivendo dentro do próprio conserto.
 *
 * As falas se acumulam na mesma lacuna, na ordem em que foram ditas.
 */
export function acrescentarRespostaSemEncaixe(
  lacunas: LacunaDeEscopo[] | undefined,
  perguntaId: string,
  respostaCrua: string,
  oQueAPerguntaColhe: string,
): LacunaDeEscopo[] {
  const lista = [...(lacunas ?? [])];
  const nova  = lacunaDeRespostaSemEncaixe(perguntaId, respostaCrua, oQueAPerguntaColhe);
  const i = lista.findIndex((l) => l.id === nova.id);
  if (i < 0) { lista.push(nova); return lista; }

  const jaTem = lista[i].oQueOClienteDisse;
  const fala  = respostaCrua.trim().slice(0, 400);
  // A mesma fala repetida não entra duas vezes: o cliente que reenvia a mesma
  // frase está insistindo, não dizendo algo novo.
  if (jaTem.includes(fala)) return lista;
  const juntas = `${jaTem} | ${fala}`;
  lista[i] = { ...nova, oQueOClienteDisse: juntas, precisaConfirmar: nova.precisaConfirmar.replace(`"${fala}"`, `"${juntas}"`) };
  return lista;
}

/**
 * A resposta que não encaixou, guardada como lacuna.
 *
 * O texto entra CRU, com as palavras do cliente. Reescrever aqui seria a casa
 * registrando a própria interpretação de algo que ela acabou de admitir não ter
 * entendido — e é justamente a interpretação que está sob suspeita.
 */
export function lacunaDeRespostaSemEncaixe(
  perguntaId: string,
  respostaCrua: string,
  oQueAPerguntaColhe: string,
): LacunaDeEscopo {
  const texto = respostaCrua.trim().slice(0, 400);
  return {
    // O id carrega a pergunta: duas respostas sem encaixe para a MESMA pergunta
    // são o mesmo buraco, e `unirLacunas` guarda a primeira. Buracos de
    // perguntas diferentes são diferentes e convivem.
    id: `sem_encaixe:${perguntaId}`,
    oQueOClienteDisse: texto,
    precisaConfirmar:
      `A casa perguntou sobre ${oQueAPerguntaColhe} e não entendeu a resposta. ` +
      `O cliente disse: "${texto}". Confirmar com ele antes de fechar o escopo — ` +
      `a conversa seguiu sem este dado, de propósito, para não travar o cliente na mesma pergunta.`,
    // Sem `servicoDaCasa`: esta lacuna não se fecha sozinha. Ela só sai quando
    // gente perguntar — que é exatamente o efeito desejado.
  };
}

/** O que cada pergunta que pode insistir existe para colher. Em português,
 *  porque quem lê a lacuna é gente. */
export const O_QUE_A_PERGUNTA_COLHE: Record<string, string> = {
  detect_service:    "qual serviço ele quer (redes sociais, tráfego pago ou identidade visual)",
  prospect_name_biz: "o nome dele e o nome do negócio",
};

/**
 * A SEGUNDA formulação — nunca a mesma frase duas vezes seguidas.
 *
 * Repetir palavra por palavra é o que faz a pessoa achar que não foi lida.
 * A reformulação faz duas coisas que a original não fazia: ADMITE que a casa
 * não entendeu (em vez de fingir que é a primeira vez que pergunta) e oferece
 * uma saída explícita — "não sei ainda" é resposta válida, e é o que destrava
 * quem veio com um pedido que a casa não tem na prateleira.
 *
 * `null` quando a pergunta não tem reformulação escrita: aí a casa NÃO repete —
 * registra e avança. Falta de reformulação nunca vira licença para insistir.
 */
export function reformular(perguntaId: string): string | null {
  switch (perguntaId) {
    case "detect_service":
      return (
        "Desculpa, acho que não peguei direito — a culpa é minha. " +
        "Deixa eu tentar de outro jeito: hoje a gente trabalha com **três frentes** — " +
        "cuidar das suas **redes sociais**, rodar **anúncios pagos**, e criar a **identidade visual** da marca. " +
        "Alguma dessas encosta no que você precisa? " +
        "Se o que você quer for outra coisa, me diz com as suas palavras que eu registro e levo para a equipe."
      );
    case "prospect_name_biz":
      return (
        "Acho que me perdi — me ajuda? " +
        "Só preciso de duas coisas: **como você se chama** e **o nome do seu negócio**. " +
        "Pode escrever assim: \"Ana, Farol 27\"."
      );
    default:
      return null;
  }
}

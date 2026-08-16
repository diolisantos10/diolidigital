// O ESTADO REAL DO BRIEFING — o que a tela de confirmação tem o direito de dizer.
//
// ─── POR QUE ESTE ARQUIVO EXISTE ─────────────────────────────────────────────
//
// Até 16/08/2026 a tela de confirmação do briefing público dizia, em texto fixo:
//
//     "Entramos em contato pelo canal informado em até 1 dia útil"
//
// O CEO, ao ver: *"não autorizei nada disso, não foi decisão minha, e um dia
// isso é coisa de um ano — inteligência artificial faz em minutos"*.
//
// São dois defeitos, e o segundo é o grave:
//
//   1. **O prazo não foi decidido por ninguém.** Ninguém escolheu 1 dia útil;
//      ele foi digitado.
//   2. **Nada no código garantia esse prazo.** Não havia relógio, não havia
//      alarme, não havia quem ligasse. Era uma promessa que a casa fazia em nome
//      próprio sem ter como cumpri-la — e o registro de 08/08 mostra o resultado:
//      três interessados esperaram 51, 29 e 28 dias.
//
// ─── A REGRA QUE FICA ────────────────────────────────────────────────────────
//
// • A confirmação **não promete prazo nenhum.** Ela diz o que está acontecendo
//   AGORA.
// • O estado é **real**, derivado do banco: existe registro? quantos canvases o
//   motor já produziu? o motor falhou?
// • **Se travar, diz que travou** — motivo em português e o que a casa vai
//   fazer. Silêncio e prazo falso são o mesmo defeito com roupas diferentes.
// • **Nunca mais se escreve prazo na cara do cliente sem que exista, no código,
//   algo que garanta esse prazo.** Há teste que reprova a volta da frase.
//
// ─── POR QUE FUNÇÃO PURA ─────────────────────────────────────────────────────
//
// A decisão de qual estado mostrar não pode morar dentro do componente de tela:
// tela não se testa contra relógio, e foi exatamente "estado que só existe na
// tela" que o despacho proibiu. Aqui entra fato (quantos artefatos, quando
// chegou, falhou?) e sai estado. O `agora` é PARÂMETRO, nunca `new Date()` lá
// dentro — senão o teste do caso "travado" dependeria de esperar de verdade.

/** Quantos canvases o `runAutoScope` produz por briefing. São os 6 de
 *  `SCOPE_DEPTS` em `lib/dioli-brain/run-auto-scope.ts`. Importado como número e
 *  não como lista porque aqui só importa a contagem. */
export const CANVASES_POR_ORCAMENTO = 6;

/**
 * Quanto tempo o motor pode levar antes de a demora virar notícia.
 *
 * `runAutoScope` encadeia 6 motores **síncronos, sem chamada externa** — ele
 * termina em segundos. Três minutos é folga larga de propósito: um limite justo
 * transformaria uma máquina ocupada em "travado" e mentiria para o cliente na
 * direção oposta. E, passados 3 minutos com zero canvas, alguma coisa ESTÁ
 * errada — dizer isso é honesto, calar não é.
 */
export const MINUTOS_ATE_A_DEMORA_VIRAR_NOTICIA = 3;

export type EstadoId =
  /** Chegou, e o motor ainda não começou a devolver nada. */
  | "recebido"
  /** O motor está devolvendo canvases — dá para contar quantos. */
  | "montando"
  /** Os 6 canvases existem. O orçamento está montado. */
  | "pronto"
  /** Subiu sem WhatsApp nem e-mail: não vira proposta, e não se perde. */
  | "sem_contato"
  /** Falhou, ou está parado tempo demais. A tela DIZ isso. */
  | "travado";

export interface Passo {
  rotulo: string;
  estado: "feito" | "agora" | "esperando" | "parado";
}

export interface EstadoDoBriefing {
  id: EstadoId;
  /** O título da tela. Frase curta, no presente, sem promessa. */
  titulo: string;
  /** A explicação. Em "travado", carrega o motivo e o próximo passo. */
  detalhe: string;
  /** A trilha visível. Cada passo diz se já aconteceu, está acontecendo ou não. */
  passos: Passo[];
  /** true quando a pessoa precisa fazer alguma coisa (ou nós precisamos dela). */
  chamaOWhatsApp: boolean;
}

export interface FatosDoBriefing {
  /** `status` do `ClientRequestDb`. */
  status: string;
  criadoEm: Date;
  agora: Date;
  /** Quantos `BrainArtifact` já existem para esta solicitação. */
  canvases: number;
  /** Falha registrada do motor. `null` = não falhou (que é diferente de
   *  "não sei": quem não conseguiu ler o banco não chama esta função, mostra
   *  o estado de erro da tela). */
  falha: { motivo: string } | null;
}

/**
 * Traduz fato em estado. Nenhuma inferência sobre o cliente, nenhum prazo.
 */
export function lerEstadoDoBriefing(f: FatosDoBriefing): EstadoDoBriefing {
  // ── 1. Sem canal de contato: o estado mais importante, e vem primeiro ──────
  // Não é falha nem demora — é uma decisão que a pessoa tomou, e a tela tem que
  // ser honesta sobre a consequência dela sem culpar ninguém.
  if (f.status === "lead_incompleto") {
    return {
      id: "sem_contato",
      titulo: "Seu briefing está guardado.",
      detalhe:
        "Nada do que você contou se perdeu. Como não ficamos com WhatsApp nem e-mail seu, " +
        "não temos para onde enviar o orçamento — quando quiser, é só nos chamar.",
      passos: [
        { rotulo: "Briefing recebido e guardado por inteiro", estado: "feito" },
        { rotulo: "Orçamento — precisa de um canal de contato para seguir", estado: "parado" },
      ],
      chamaOWhatsApp: true,
    };
  }

  // ── 2. O motor falhou, e isso é dito com todas as letras ──────────────────
  if (f.falha) {
    return {
      id: "travado",
      titulo: "Seu briefing chegou, mas o orçamento travou.",
      detalhe:
        `Não foi você: falhou do nosso lado (${f.falha.motivo}). Seu briefing está salvo e ` +
        "a nossa equipe já consegue ver o que aconteceu. Se quiser resolver agora, chama a gente.",
      passos: [
        { rotulo: "Briefing recebido", estado: "feito" },
        { rotulo: "Montagem do orçamento — travou", estado: "parado" },
      ],
      chamaOWhatsApp: true,
    };
  }

  // ── 3. Pronto ─────────────────────────────────────────────────────────────
  if (f.canvases >= CANVASES_POR_ORCAMENTO) {
    return {
      id: "pronto",
      titulo: "Seu orçamento está pronto.",
      detalhe:
        "Montamos o escopo a partir do que você contou. Ele vai pelo canal que você informou; " +
        "se preferir ver agora, é só nos chamar.",
      passos: [
        { rotulo: "Briefing recebido", estado: "feito" },
        { rotulo: "Orçamento montado", estado: "feito" },
        { rotulo: "Envio pelo canal que você informou", estado: "agora" },
      ],
      chamaOWhatsApp: false,
    };
  }

  // ── 4. Parado tempo demais SEM ter falhado: também é notícia ───────────────
  // Um motor que não devolveu nada em 3 minutos não está "quase lá". Chamar isso
  // de "montando" para sempre seria a mesma mentira do "1 dia útil", só que sem
  // número.
  const minutosParado = (f.agora.getTime() - f.criadoEm.getTime()) / 60_000;
  if (minutosParado > MINUTOS_ATE_A_DEMORA_VIRAR_NOTICIA && f.canvases === 0) {
    return {
      id: "travado",
      titulo: "Seu briefing chegou, mas o orçamento não saiu.",
      detalhe:
        "Deveria levar segundos e já passou disso, então alguma coisa está errada do nosso lado. " +
        "Seu briefing está salvo e a nossa equipe consegue ver. Se quiser resolver agora, chama a gente.",
      passos: [
        { rotulo: "Briefing recebido", estado: "feito" },
        { rotulo: "Montagem do orçamento — parada", estado: "parado" },
      ],
      chamaOWhatsApp: true,
    };
  }

  // ── 5. Montando, com o número real de canvases ────────────────────────────
  if (f.canvases > 0) {
    return {
      id: "montando",
      titulo: "Estamos montando seu orçamento.",
      detalhe:
        `Já saíram ${f.canvases} das ${CANVASES_POR_ORCAMENTO} partes do escopo. ` +
        "Esta página se atualiza sozinha — não precisa recarregar.",
      passos: [
        { rotulo: "Briefing recebido", estado: "feito" },
        { rotulo: `Montando o orçamento (${f.canvases} de ${CANVASES_POR_ORCAMENTO})`, estado: "agora" },
        { rotulo: "Envio pelo canal que você informou", estado: "esperando" },
      ],
      chamaOWhatsApp: false,
    };
  }

  // ── 6. Recebido ───────────────────────────────────────────────────────────
  return {
    id: "recebido",
    titulo: "Recebemos seu briefing.",
    detalhe:
      "Ele está salvo com tudo que você contou e o orçamento já entrou na fila de montagem. " +
      "Esta página se atualiza sozinha — não precisa recarregar.",
    passos: [
      { rotulo: "Briefing recebido", estado: "feito" },
      { rotulo: "Montando o orçamento", estado: "agora" },
      { rotulo: "Envio pelo canal que você informou", estado: "esperando" },
    ],
    chamaOWhatsApp: false,
  };
}

/** Estados em que ainda vale perguntar de novo ao servidor. */
export function aindaMuda(id: EstadoId): boolean {
  return id === "recebido" || id === "montando";
}

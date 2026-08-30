// resposta-que-responde.ts — RESPOSTA QUE NÃO RESPONDE NÃO PREENCHE CAMPO.
//
// ═══════════════════════════════════════════════════════════════════════════
// A DOENÇA (cliente oculto, 6ª rodada — a raiz que derrubou a produção)
// ═══════════════════════════════════════════════════════════════════════════
//
// `operacao_basica` pergunta TRÊS coisas de uma vez: o @ do Instagram, o
// horário e os dias de funcionamento, e a área de atendimento. E o `parse`
// dela era uma linha:
//
//     parse: (answer) => ({ operacao: answer.trim() })
//
// Qualquer texto preenchia o campo. Medido: o cliente respondeu com a frase do
// OBJETIVO dele — que não diz @, não diz horário e não diz bairro. O campo
// `operacao` ficou cheio, `when: (s) => ... && !s.scope.operacao` passou a
// devolver `false`, e a pergunta **passou por respondida sem ter sido**.
//
// Três passos adiante a conta chegou: `extrairVerdadeOperacional` leu aquele
// texto, não achou horário nenhum, e o PISO DE VERDADE barrou a peça por falta
// de horário de funcionamento. A produção parou por causa de uma pergunta que
// a casa acreditava ter feito e recebido.
//
// É a mesma família de `anexo-nao-e-resposta.ts` (o recado do anexo virando
// resposta) e de `respostaEhCanalDeContato` (o e-mail virando nome do
// negócio). Ali a casa aprendeu a recusar o texto que claramente NÃO é a
// resposta. Aqui ela precisa do passo seguinte: **exigir que o texto contenha
// o dado que a pergunta existe para colher.**
//
// ═══════════════════════════════════════════════════════════════════════════
// O LEITOR É O MESMO DO PISO — E ISSO É O CONSERTO INTEIRO
// ═══════════════════════════════════════════════════════════════════════════
//
// Quem decide se a resposta respondeu é `extrairVerdadeOperacional`, a MESMA
// função que o piso de verdade usa para conferir a peça pronta. Não é uma
// segunda régua "parecida": é a régua de baixo, subida até a porta.
//
// A consequência é a que importa: torna-se **impossível** o campo `operacao`
// ficar cheio com um texto do qual o piso não consegue tirar horário, área ou
// endereço. O defeito medido não tem mais por onde entrar — não porque alguém
// escreveu uma proibição, mas porque as duas pontas passaram a fazer a mesma
// pergunta ao mesmo leitor.
//
// Duas réguas com fórmulas diferentes não se conferem, se contradizem — é a
// frase que `legibilidade-do-titulo.ts` já tinha escrito nesta casa.
//
// ═══════════════════════════════════════════════════════════════════════════
// A INSTRUÇÃO GÊMEA (a casa não proíbe sem dizer o que fazer no lugar)
// ═══════════════════════════════════════════════════════════════════════════
//
// PROIBIÇÃO — texto que não carrega nenhum dos fatos pedidos não preenche
// `operacao`.
//
// INSTRUÇÃO GÊMEA — e a conversa NÃO trava por isso:
//   • "não tenho", "prefiro não dizer", "não sei" são RESPOSTAS. Fecham a
//     pergunta como qualquer outra — a declaração de ausência vale mais que o
//     silêncio, e é o que `budget_range` já ensinou nesta casa;
//   • a pergunta volta UMA vez, reformulada, dizendo o que ainda falta —
//     nunca a mesma frase duas vezes (`pergunta-sem-encaixe.ts`);
//   • na segunda, ela fecha de qualquer jeito e a fala do cliente vira LACUNA.
//     Perder o lead custa mais que peça retida — a ordem do Diretor Geral ao
//     autorizar `operacao_basica` foi "nada disso pode travar o briefing", e
//     ela continua valendo palavra por palavra.
//
// ⚠️ RESPOSTA PARCIAL PREENCHE. O cliente que dá só o horário respondeu — e o
// horário é justamente o fato cuja falta barrou a peça. Exigir os três seria
// trocar um defeito por um interrogatório, e interrogatório o prospect
// abandona. O que a reformulação faz é NOMEAR o que ficou de fora, para quem
// quiser completar.

import { extrairVerdadeOperacional } from "../execution/piso-de-verdade";

/** O que a resposta a `operacao_basica` de fato entregou. */
export interface LeituraDosBasicos {
  /** O @ / endereço de contato apareceu? */
  temEndereco: boolean;
  /** Horário, janela ou dia de funcionamento apareceu? */
  temHorario: boolean;
  /** Bairro, cidade, raio ou canal de atendimento apareceu? */
  temArea: boolean;
  /** O cliente DECLAROU que não tem / não quer dizer. Isso é resposta. */
  ehRecusa: boolean;
  /** A resposta fecha a pergunta? */
  responde: boolean;
  /** O que a pergunta colheu e o que ficou de fora, em português. */
  faltando: string[];
}

/**
 * A recusa EXPLÍCITA — e só ela.
 *
 * Escrita apertada de propósito. `isNo` (`question-engine.ts`) casa qualquer
 * "não" solto no meio de uma frase, e o cliente que responde *"não é um
 * restaurante, é uma clínica"* estaria recusando sem saber. Aqui a recusa
 * precisa vir com o objeto: não tenho, não temos, prefiro não dizer, não sei.
 */
const RE_RECUSA_EXPLICITA =
  /\b(?:n[ãa]o\s+(?:tenho|temos|sei|lembro|uso|usamos|quero\s+(?:dizer|informar|responder))|prefiro\s+n[ãa]o|deixa\s+(?:pra|para)\s+depois|pular|pula\s+essa|nenhum\s+desses|sem\s+isso\s+por\s+enquanto|n[ãa]o\s+se\s+aplica)\b/i;

/**
 * LÊ A RESPOSTA DE `operacao_basica` COM O LEITOR DO PISO DE VERDADE.
 *
 * `responde === false` significa exatamente uma coisa: o texto não carrega
 * nenhum dos três fatos e não é uma recusa declarada. Quem chama NÃO preenche
 * `operacao` — ver o cabeçalho deste arquivo.
 */
export function lerBasicosOperacionais(resposta: string): LeituraDosBasicos {
  const texto = (resposta ?? "").trim();
  const vazio: LeituraDosBasicos = {
    temEndereco: false, temHorario: false, temArea: false,
    ehRecusa: false, responde: false,
    faltando: ["o @ do Instagram", "o horário e os dias de funcionamento", "os bairros ou cidades que vocês atendem"],
  };
  if (!texto) return vazio;

  const ehRecusa = RE_RECUSA_EXPLICITA.test(texto);

  // O MESMO leitor do piso. Nenhuma expressão regular nova para horário, para
  // bairro ou para @ mora aqui — a segunda gramática é como as duas verdades
  // nascem, e esta casa já pagou por isso mais de uma vez.
  const v = extrairVerdadeOperacional(texto);

  const temEndereco = v.handles.length > 0;
  const temHorario  = v.horarios.length > 0 || (v.janelas?.length ?? 0) > 0 || v.dias.length > 0;
  const temArea     = v.areas.length > 0 || v.canais.length > 0 || v.raioEntregaKm != null;

  const faltando: string[] = [];
  if (!temEndereco) faltando.push("o @ do Instagram");
  if (!temHorario)  faltando.push("o horário e os dias de funcionamento");
  if (!temArea)     faltando.push("os bairros ou cidades que vocês atendem");

  return {
    temEndereco, temHorario, temArea, ehRecusa,
    responde: ehRecusa || temEndereco || temHorario || temArea,
    faltando,
  };
}

/**
 * A SEGUNDA formulação de `operacao_basica` — nunca a mesma frase duas vezes.
 *
 * Ela NOMEIA o que ficou de fora em vez de repetir as três perguntas: repetir
 * palavra por palavra é o que faz a pessoa concluir que não foi lida, e foi o
 * que a casa leu seis vezes no caso Farol 27.
 *
 * O horário vem PRIMEIRO na frase de propósito: é o fato cuja ausência barrou
 * a peça no piso de verdade. Se o cliente só responder uma coisa, que seja a
 * que custa produção.
 */
export function reformularBasicosOperacionais(leitura: LeituraDosBasicos): string {
  const faltam = [
    ...(leitura.temHorario  ? [] : ["**horário e dias** que vocês funcionam"]),
    ...(leitura.temArea     ? [] : ["**bairros ou cidades** que vocês atendem"]),
    ...(leitura.temEndereco ? [] : ["o **@ do Instagram**"]),
  ];
  const lista = faltam.length > 1
    ? `${faltam.slice(0, -1).join(", ")} e ${faltam[faltam.length - 1]}`
    : (faltam[0] ?? "esses dados");
  return (
    "Desculpa, acho que me expliquei mal — a culpa é minha. " +
    `Anotei o que você disse, mas ainda me falta ${lista}. ` +
    "É o que a equipe usa na hora de escrever os posts: sem o horário, por exemplo, " +
    "a peça não pode dizer quando vocês abrem.\n\n" +
    "Se não tiver alguma delas, é só dizer **\"não tenho\"** que a gente segue assim mesmo. 🙂"
  );
}

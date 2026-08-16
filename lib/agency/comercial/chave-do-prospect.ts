// QUEM JÁ BATEU NESTA PORTA ANTES — a chave normalizada do prospect.
//
// ── A PERGUNTA QUE GEROU ESTE ARQUIVO (CEO, 16/08/2026) ─────────────────────
//
//   "se entrar um cliente com o mesmo e-mail e fizer cinco briefings um atrás
//    do outro, o que acontece com o sistema?"
//
// A resposta medida naquele dia, antes deste arquivo existir: **não dava pane —
// dava bagunça cara.**
//
//   • `createClientRequest` era `create` puro, sem busca prévia por contato:
//     cinco briefings viravam cinco linhas anônimas na caixa de entrada, sem
//     nada dizendo que eram a mesma pessoa;
//   • e o estrago maior vinha na APROVAÇÃO —
//     `execution/create-project-from-request.ts` era idempotente **por
//     solicitação**, nunca por pessoa. Aprovar as cinco criava **cinco `Client`
//     homônimos**, cinco portais e cinco históricos separados do mesmo negócio.
//     A única saída era o merge manual (`/api/clients/[id]/fundir`), à mão,
//     depois do estrago.
//
// Não é hipótese: a **Camila Pereira** já estava duplicada em produção em
// 08/08/2026 exatamente por esse caminho, e a fusão dela continua pendente de
// decisão do CEO até hoje.
//
// ── POR QUE UM ARQUIVO SÓ, E NÃO UM `.toLowerCase()` EM CADA CHAMADOR ───────
//
// É a mesma lição de `contato-do-lead.ts`: **o que não tem leitor único não tem
// alarme, não tem filtro e não tem gate.** Se cada rota normalizar o e-mail do
// seu jeito, a aprovação vai deduplicar por um critério e a caixa de entrada por
// outro — e as duas vão discordar sobre quem é a mesma pessoa. Aqui mora a
// definição, e só aqui.
//
// ── A LEI QUE MANDA NESTE ARQUIVO: NENHUMA INFERÊNCIA ───────────────────────
//
// A chave sai **exclusivamente** do contato DECLARADO (`lerContato`), que já é o
// leitor único da casa. O que **nunca** vira chave:
//
//   • **o nome do negócio.** Dois "Camila Pereira" podem ser duas pessoas, e
//     fundir cadastro por homonímia entregaria o portal de um cliente para
//     outro — erro pior, e irreversível, comparado a ter duas fichas;
//   • **a arroba de Instagram e o telefone soltos no `rawContext`.** São PISTA
//     (`pistasDeContato`), para uma pessoa ler e decidir. Nunca identidade.
//
// Consequência declarada: **lead sem canal (`lead_incompleto`) não tem chave**,
// e por isso nunca é agrupado com ninguém. Ele segue linha própria. Adivinhar
// que dois leads anônimos são a mesma pessoa é exatamente a inferência que esta
// casa proíbe — e o gate de contato de 08/08 já garante que quem entra com canal
// tem chave desde o primeiro dia.

import {
  lerContato,
  normalizarWhatsapp,
  type ContatoDoLead,
} from "@/lib/agency/comercial/contato-do-lead";

/**
 * O e-mail reduzido à forma que serve de chave.
 *
 * `trim()` + `toLowerCase()`, e nada além disso. O domínio de um e-mail é
 * insensível a caixa por especificação, e **todo** provedor real trata a parte
 * local do mesmo jeito — `Joao@Email.com` e `joao@email.com` são a mesma caixa
 * na vida do cliente, e é a vida do cliente que esta chave precisa refletir.
 *
 * ⚠️ Isto é a chave, **não** o valor de exibição. `lerContato` continua
 * devolvendo o e-mail como a pessoa o escreveu, porque é assim que ele volta
 * bonito na tela e no cabeçalho de um envio. Normalizar para comparar e preservar
 * para mostrar são coisas diferentes — juntar as duas jogaria fora o que o
 * cliente digitou sem ganhar nada.
 */
export function normalizarEmailParaChave(valor: string | null | undefined): string | null {
  if (typeof valor !== "string") return null;
  const limpo = valor.trim().toLowerCase();
  return limpo || null;
}

/**
 * O telefone reduzido à forma que serve de chave: **só dígitos**.
 *
 * `(11) 99999-8888`, `11 99999 8888` e `11999998888` são o mesmo aparelho, e o
 * cliente escreve dos três jeitos conforme o dia. Reusa `normalizarWhatsapp`, que
 * já é a normalização oficial da casa — reimplementar aqui criaria duas verdades
 * sobre o mesmo número.
 */
export function normalizarTelefoneParaChave(valor: string | null | undefined): string | null {
  if (typeof valor !== "string") return null;
  const digitos = normalizarWhatsapp(valor);
  return digitos || null;
}

/**
 * TODAS as chaves de um contato, com o tipo no prefixo.
 *
 * O prefixo (`email:` / `whatsapp:`) não é enfeite: sem ele, um telefone
 * `11999998888` e um hipotético e-mail de mesmos caracteres colidiriam, e dois
 * espaços de identidade diferentes viveriam num namespace só.
 *
 * Devolve lista, e não um valor, porque uma pessoa pode ter deixado os dois
 * canais. É isso que permite casar o briefing em que ela deu só o WhatsApp com o
 * briefing em que ela deu só o e-mail **mais o WhatsApp** — o agrupamento casa
 * por INTERSEÇÃO de qualquer chave, não por igualdade de uma chave escolhida.
 */
export function chavesDoContato(contato: ContatoDoLead): string[] {
  const chaves: string[] = [];
  const email = normalizarEmailParaChave(contato.email);
  if (email) chaves.push(`email:${email}`);
  const zap = normalizarTelefoneParaChave(contato.whatsapp);
  if (zap) chaves.push(`whatsapp:${zap}`);
  return chaves;
}

/**
 * A chave CANÔNICA — a única que vai para a coluna `ClientRequestDb.chaveDoProspect`.
 *
 * **E-mail na frente do WhatsApp, e aqui a ordem é o oposto da de `lerContato`.**
 * Lá, WhatsApp vem primeiro porque a pergunta é "por onde eu FALO com o cliente
 * brasileiro" — e é pelo WhatsApp. Aqui a pergunta é outra: "qual identificador
 * dura mais?". O e-mail é o mesmo por anos; o número muda de chip, ganha o nono
 * dígito, vem com e sem o 55 na frente. Chave é sobre estabilidade, canal é sobre
 * alcance.
 *
 * `null` quando não há canal declarado — e nulo aqui significa **"esta linha não
 * se junta a ninguém"**, nunca "junta com as outras sem chave". Ver o cabeçalho.
 */
export function chaveCanonicaDoContato(contato: ContatoDoLead): string | null {
  return chavesDoContato(contato)[0] ?? null;
}

/** A chave canônica de uma solicitação, lida pelo leitor único da casa. */
export function chaveDaSolicitacao(entrada: {
  briefingJson?: unknown;
  sdrHandoffJson?: unknown;
} | null | undefined): string | null {
  return chaveCanonicaDoContato(lerContato(entrada));
}

// ── O AGRUPAMENTO DA CAIXA DE ENTRADA ───────────────────────────────────────

/** O que a caixa de entrada precisa saber sobre uma linha repetida. */
export type RepeticaoDoProspect = {
  /** Quantos briefings deste mesmo contato existem na fila. `1` = não é repetição. */
  vezes: number;
  /** A posição deste briefing na sequência do prospect (1 = o primeiro que chegou). */
  ordem: number;
  /** Os ids dos OUTROS briefings do mesmo contato — para a tela linkar, nunca some. */
  irmaos: string[];
  /** Quando o primeiro briefing deste contato chegou. */
  primeiroEm: Date;
};

type EntradaParaAgrupar = {
  id: string;
  createdAt: Date;
  briefingJson?: unknown;
  sdrHandoffJson?: unknown;
};

/**
 * Agrupa uma fila de briefings por prospect. **Função pura — não lê o banco, não
 * escreve nada, não funde nada.**
 *
 * ⚠️ **POR QUE MARCAR E NÃO FUNDIR AUTOMATICAMENTE** — é a decisão de projeto
 * mais importante deste arquivo, e ela responde à segunda metade da pergunta do
 * CEO.
 *
 * Cinco briefings do mesmo e-mail podem ser duas coisas OPOSTAS, e nenhum código
 * consegue distinguir as duas:
 *
 *   • a pessoa reenviou o mesmo pedido (clicou duas vezes, refez o formulário);
 *   • a pessoa está pedindo um **segundo projeto**, legítimo e diferente.
 *
 * Fundir os cinco num só trataria o segundo caso como erro e **apagaria um
 * pedido de serviço que o cliente fez de verdade** — a "prisão" que o Diretor
 * proibiu em 16/08. Deixar os cinco anônimos trata o primeiro caso como cinco
 * clientes. A saída é não escolher: **cada briefing continua sendo sua própria
 * linha, inteira, e ganha o carimbo "3ª vez que este contato escreve — veja as
 * outras 2".** Quem decide se é repetição ou pedido novo é gente, com o texto
 * dos dois briefings na frente.
 *
 * Isto é a lei da casa aplicada: ausência de informação não é informação. A
 * máquina não sabe a intenção, então ela mostra o fato e escala a decisão.
 *
 * O casamento é por INTERSEÇÃO de qualquer chave (ver `chavesDoContato`), então
 * o briefing só-com-WhatsApp casa com o briefing com-WhatsApp-e-e-mail.
 */
export function agruparPorProspect(
  entradas: EntradaParaAgrupar[],
): Map<string, RepeticaoDoProspect> {
  // Ordem de chegada: quem chegou primeiro define o grupo, e a `ordem` de cada
  // linha só faz sentido cronologicamente ("3ª vez" precisa saber quem foi a 1ª).
  const ordenadas = [...entradas].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  // União por chave: cada grupo é um balde de ids, e uma entrada entra em todos
  // os baldes cujas chaves ela compartilha — fundindo-os quando ela é a ponte
  // entre dois (o caso do briefing que trouxe e-mail E WhatsApp depois de dois
  // briefings que trouxeram um canal cada).
  /** chave normalizada → id do grupo em que ela caiu. */
  const grupoPorChave = new Map<string, string>();
  /** id do grupo → quem está nele. Grupo fundido é REMOVIDO daqui. */
  const membrosDoGrupo = new Map<string, EntradaParaAgrupar[]>();
  /** id do grupo → id do grupo que o absorveu. Cadeia resolvida por `raiz`. */
  const absorvidoPor = new Map<string, string>();
  let proximoGrupo = 0;

  const raiz = (g: string): string => {
    let atual = g;
    while (absorvidoPor.has(atual)) atual = absorvidoPor.get(atual)!;
    return atual;
  };

  for (const entrada of ordenadas) {
    const chaves = chavesDoContato(lerContato(entrada));
    // Sem chave = sem grupo. A linha existe, aparece na fila inteira, e
    // simplesmente não se junta a ninguém. Ver o cabeçalho do arquivo.
    if (chaves.length === 0) continue;

    const gruposTocados = [
      ...new Set(
        chaves
          .map((c) => grupoPorChave.get(c))
          .filter((g): g is string => typeof g === "string")
          .map(raiz),
      ),
    ];

    let grupo: string;
    if (gruposTocados.length === 0) {
      grupo = `g${proximoGrupo++}`;
      membrosDoGrupo.set(grupo, []);
    } else {
      // Esta entrada é a PONTE entre grupos que até agora pareciam pessoas
      // diferentes (ela trouxe e-mail e WhatsApp que já tinham aparecido
      // separados). O primeiro grupo vence e absorve os outros.
      grupo = gruposTocados[0]!;
      for (const outro of gruposTocados.slice(1)) {
        absorvidoPor.set(outro, grupo);
        membrosDoGrupo.get(grupo)!.push(...(membrosDoGrupo.get(outro) ?? []));
        membrosDoGrupo.delete(outro);
      }
    }

    membrosDoGrupo.get(grupo)!.push(entrada);
    for (const c of chaves) grupoPorChave.set(c, grupo);
  }

  const saida = new Map<string, RepeticaoDoProspect>();
  for (const membros of membrosDoGrupo.values()) {
    const emOrdem = [...membros].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const primeiroEm = emOrdem[0]!.createdAt;
    emOrdem.forEach((m, i) => {
      saida.set(m.id, {
        vezes: emOrdem.length,
        ordem: i + 1,
        irmaos: emOrdem.filter((o) => o.id !== m.id).map((o) => o.id),
        primeiroEm,
      });
    });
  }
  return saida;
}

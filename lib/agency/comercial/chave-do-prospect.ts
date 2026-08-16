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

/**
 * Um dos OUTROS briefings do mesmo contato, do jeito que dá para reconhecer.
 *
 * 🔴 **POR QUE ISTO NÃO É UM `string` DE ID (16/08/2026).** A primeira versão
 * carregava só o id, e a tela o imprimia cru:
 *
 * ```
 * outro briefing: 0083d663-4ee0-4e8f-b9b5-acd13858f0cf
 * ```
 *
 * Quatro linhas dessas, em monospace, eram o elemento mais pesado do bloco — e
 * **não respondiam a pergunta para a qual o bloco existe**: *isto é o mesmo
 * pedido reenviado, ou um segundo projeto?* Um cuid não distingue os dois casos,
 * e quem lê esta tela é o CEO, não o banco. Data, nome do negócio e o que foi
 * pedido distinguem — e são todos DADO GRAVADO, nunca inferência.
 */
export type IrmaoDoProspect = {
  id: string;
  /** Quando aquele briefing chegou. */
  em: Date;
  /**
   * Como o negócio se chamou NAQUELE briefing. É a pista mais barata de
   * "segundo projeto": a Camila mandou dois como *Beauty Clinic* e dois como
   * *Clínica Camila Pereira — unidade Pinheiros*.
   */
  negocio: string | null;
  /**
   * O que foi pedido, **nas palavras já gravadas**. Serviço declarado quando
   * existe; senão, a primeira frase do texto que a pessoa escreveu.
   *
   * `null` quando o briefing não gravou nem um nem outro — e nulo aqui vira
   * "sem descrição gravada" na tela, nunca uma descrição inventada.
   */
  pedido: string | null;
};

/** O que a caixa de entrada precisa saber sobre uma linha repetida. */
export type RepeticaoDoProspect = {
  /** Quantos briefings deste mesmo contato existem na fila. `1` = não é repetição. */
  vezes: number;
  /** A posição deste briefing na sequência do prospect (1 = o primeiro que chegou). */
  ordem: number;
  /** Os OUTROS briefings do mesmo contato — para a tela mostrar, nunca some. */
  irmaos: IrmaoDoProspect[];
  /** Quando o primeiro briefing deste contato chegou. */
  primeiroEm: Date;
  /**
   * De onde veio a chave usada para agrupar ESTA linha (16/08/2026 —
   * `docs/pendencias.md`, "coluna gravada e nunca lida").
   *
   * `"coluna"`: leu `ClientRequestDb.chaveDoProspect` já gravada.
   * `"recalculada"`: a coluna estava nula/vazia (linha legada, ou lead sem
   * canal que nem chega a entrar aqui) e a rede de `chavesDoContato` cobriu.
   *
   * Campo aditivo — existe só para medir quanto a rede ainda carrega. Sem ele
   * o backfill (`scripts/chave-do-prospect-backfill.mts`) vira ato de fé: é
   * este número que diz se ainda vale a pena rodá-lo.
   */
  procedencia: "coluna" | "recalculada";
};

type EntradaParaAgrupar = {
  id: string;
  createdAt: Date;
  briefingJson?: unknown;
  sdrHandoffJson?: unknown;
  /** Só para descrever o irmão na tela. Não entra em chave nenhuma. */
  businessName?: string | null;
  /** Idem. Ver a lei no cabeçalho: nome de negócio NUNCA vira identidade. */
  services?: string[] | null;
  rawContext?: string | null;
  /**
   * A chave já calculada e gravada em `ClientRequestDb.chaveDoProspect`
   * (ver `client-request-service.ts:136,143`). Quando presente e não vazia,
   * ELA VENCE o recálculo abaixo — é a leitura de produção que faltava
   * (16/08/2026, medição do Essencial `qualidade`: escrita sem leitor).
   *
   * Quando ausente, nula ou `""` (linha legada gravada antes da coluna
   * existir, ou lead sem canal), o recálculo em memória de `chavesDoContato`
   * continua sendo a REDE — é o que impede regressão silenciosa nas linhas
   * antigas, que hoje só se agrupam por causa dele. A rede encolhe sozinha
   * conforme o backfill (armado, não disparado) for rodado; até lá os dois
   * caminhos coexistem de propósito.
   */
  chaveDoProspect?: string | null;
};

/** Quanto do texto do cliente cabe numa linha de lista sem virar parágrafo. */
const TETO_DO_PEDIDO = 90;

/**
 * O que foi pedido, em uma linha — **leitura, nunca resumo gerado**.
 *
 * Precedência declarada: o serviço que a pessoa marcou vence o texto corrido,
 * porque é o campo que ela preencheu de propósito. Só quando não há serviço
 * nenhum é que se cita a primeira frase do que ela escreveu, entre as aspas da
 * tela — citação, não paráfrase, pela mesma regra de `oQueEleContou`.
 *
 * Nenhuma chamada de IA, nenhuma inferência: se os dois campos estão vazios, a
 * resposta é `null`, e a tela diz que não há descrição gravada.
 */
export function pedidoDoBriefing(entrada: {
  services?: string[] | null;
  rawContext?: string | null;
}): string | null {
  const servicos = (entrada.services ?? []).map((s) => (typeof s === "string" ? s.trim() : "")).filter(Boolean);
  if (servicos.length > 0) return servicos.join(" · ");

  const bruto = typeof entrada.rawContext === "string" ? entrada.rawContext.trim() : "";
  if (!bruto) return null;

  // A primeira frase, e não os primeiros N caracteres: cortar no meio de uma
  // palavra produz "quero anunciar no Insta…" com cara de erro de sistema.
  const primeiraFrase = bruto.split(/(?<=[.!?])\s+/)[0]!.trim();
  if (primeiraFrase.length <= TETO_DO_PEDIDO) return primeiraFrase;
  const corte = primeiraFrase.slice(0, TETO_DO_PEDIDO);
  const ultimoEspaco = corte.lastIndexOf(" ");
  return `${(ultimoEspaco > 40 ? corte.slice(0, ultimoEspaco) : corte).trimEnd()}…`;
}

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

  // id → de onde veio a chave usada para agrupar aquela linha. Aditivo (ver
  // `RepeticaoDoProspect.procedencia`) — só para medir a rede, nunca para
  // decidir o agrupamento em si.
  const procedenciaPorId = new Map<string, "coluna" | "recalculada">();

  const raiz = (g: string): string => {
    let atual = g;
    while (absorvidoPor.has(atual)) atual = absorvidoPor.get(atual)!;
    return atual;
  };

  for (const entrada of ordenadas) {
    // A COLUNA VENCE, QUANDO ELA EXISTE E NÃO É VAZIA (16/08/2026). Ela já
    // nasce na forma canônica de `chaveCanonicaDoContato` (ver
    // `client-request-service.ts:136`), então usá-la crua é seguro — mesmo
    // prefixo (`email:`/`whatsapp:`) que o recálculo produziria. `""` NÃO é
    // chave válida: é ausência disfarçada, e cai no recálculo como se a
    // coluna não existisse.
    //
    // O recálculo é a REDE, não o caminho normal: existe só para as linhas
    // legadas que nasceram com a coluna nula (a migration declara isso). Sem
    // ele essas linhas parariam de se agrupar — regressão silenciosa. Não
    // reescreve `chavesDoContato` nem `lerContato`: chama exatamente como
    // antes.
    const colValor = typeof entrada.chaveDoProspect === "string" ? entrada.chaveDoProspect.trim() : "";
    const chaves = colValor ? [colValor] : chavesDoContato(lerContato(entrada));
    // Sem chave = sem grupo. A linha existe, aparece na fila inteira, e
    // simplesmente não se junta a ninguém. Ver o cabeçalho do arquivo.
    if (chaves.length === 0) continue;
    procedenciaPorId.set(entrada.id, colValor ? "coluna" : "recalculada");

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
        irmaos: emOrdem
          .filter((o) => o.id !== m.id)
          .map((o) => ({
            id: o.id,
            em: o.createdAt,
            negocio: typeof o.businessName === "string" && o.businessName.trim() ? o.businessName.trim() : null,
            pedido: pedidoDoBriefing(o),
          })),
        primeiroEm,
        procedencia: procedenciaPorId.get(m.id)!,
      });
    });
  }
  return saida;
}

// ── A JANELA CONFESSADA (16/08/2026) ────────────────────────────────────────
//
// `agruparPorProspect` só enxerga a JANELA que `listClientRequests` trouxe
// (hoje, no máximo 200 linhas). Um contato que escreveu 6 vezes, mas cuja 6ª
// linha caiu fora dessas 200, aparecia aqui como `vezes: 5` — número
// completo com cara de errado, e a tela dizia "5ª vez" para quem já
// escreveu 6.
//
// A correção não mora aqui dentro: `agruparPorProspect` continua uma função
// pura sobre a janela que recebeu, e ISSO NÃO MUDA. O que muda é que, depois
// de `agruparPorProspect` rodar, a rota cruza o `vezes` da janela com o total
// de verdade que `contarIrmaosPorChave` traz do banco (sem teto) — e esta
// função é o cruzamento. Pura também: não lê banco, não decide política de
// visibilidade, só monta a confissão a partir dos dois números que já
// chegaram prontos.

/** O que a fila devolve sobre a janela: o total real, o que a janela mostra,
 *  e a diferença — CONFESSADA, nunca escondida atrás de um número que parece
 *  completo e não é. */
export type JanelaDaRepeticao = {
  /** Quantas vezes este contato escreveu, de verdade — direto do banco, sem
   *  o teto da janela de exibição. Nunca menor que `irmaosVisiveis`: a
   *  janela é o piso, não o total inventado. */
  totalNoBanco: number;
  /** Quantos dos irmãos estão dentro da janela atual e dá para mostrar —
   *  o mesmo número que `RepeticaoDoProspect.vezes` já contava. */
  irmaosVisiveis: number;
  /** A diferença: quantos irmãos existem e NÃO cabem nesta janela. Zero
   *  quando a janela contém todo mundo — aviso que dispara sempre é aviso
   *  que ninguém lê. */
  irmaosForaDaJanela: number;
  /** Texto pronto para a tela, preenchido só quando `irmaosForaDaJanela > 0`.
   *  É melhor mostrar "há mais, não couberam" do que um número errado com
   *  cara de certo. */
  aviso: string | null;
  /** `true` quando a consulta ao banco falhou (ou não pôde ser feita) e
   *  `totalNoBanco` é, na verdade, só o que a janela já sabia — NUNCA um
   *  zero disfarçado de certeza, e nunca "1ª vez" para quem escreveu mais. */
  contagemParcial: boolean;
};

/**
 * Confessa a janela: cruza o que a janela enxergou (`irmaosVisiveis`, vindo
 * de `RepeticaoDoProspect.vezes`) com o que o banco sabe de verdade
 * (`totalDoBanco`, vindo de `contarIrmaosPorChave`, sem teto).
 *
 * Pura — não lê o banco, não decide política de visibilidade. Quem consulta
 * é `contarIrmaosPorChave` (`client-request-service.ts`); esta função só
 * monta a confissão a partir do resultado que já chegou.
 *
 * `totalDoBanco: undefined` cobre DOIS casos que a rota distingue com
 * `contagemFalhou`, e os dois caem para o mesmo piso seguro — a janela:
 *   • a linha não tem coluna `chaveDoProspect` gravada (legada/recalculada)
 *     — não há o que perguntar ao banco além do que já se sabe;
 *   • a consulta ao banco falhou de verdade — `contagemFalhou: true`, e é
 *     isso que marca `contagemParcial`, para a tela saber que o número pode
 *     estar incompleto e não é uma certeza.
 */
export function janelaDaRepeticao(params: {
  /** `vezes` da janela — quantos irmãos a página atual enxerga. */
  irmaosVisiveis: number;
  /** O total que `contarIrmaosPorChave` devolveu para a chave desta linha. */
  totalDoBanco: number | undefined;
  /** A consulta ao banco falhou nesta requisição inteira? */
  contagemFalhou: boolean;
}): JanelaDaRepeticao {
  const { irmaosVisiveis, totalDoBanco, contagemFalhou } = params;

  if (totalDoBanco === undefined) {
    return {
      totalNoBanco: irmaosVisiveis,
      irmaosVisiveis,
      irmaosForaDaJanela: 0,
      aviso: null,
      // Só é "parcial" quando de fato tentamos e falhamos. Linha sem coluna
      // gravada (o caso comum, não uma falha) não é parcial — é apenas o
      // limite conhecido e declarado da frente de hoje.
      contagemParcial: contagemFalhou,
    };
  }

  // O total do banco nunca pode ser menor que o que a própria janela viu —
  // se vier menor (não deveria acontecer; defesa, não expectativa), a
  // janela vence, porque é o dado mais recente e mais certo que temos.
  const totalNoBanco = Math.max(totalDoBanco, irmaosVisiveis);
  const irmaosForaDaJanela = totalNoBanco - irmaosVisiveis;

  return {
    totalNoBanco,
    irmaosVisiveis,
    irmaosForaDaJanela,
    aviso:
      irmaosForaDaJanela > 0
        ? `${totalNoBanco}ª vez deste contato — ${irmaosForaDaJanela} ${irmaosForaDaJanela === 1 ? "não cabe" : "não cabem"} nesta janela`
        : null,
    contagemParcial: false,
  };
}

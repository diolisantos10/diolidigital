// O REGISTRO DA CONVERSA DO SDR — o primeiro agente da esteira deixava de
// existir assim que a aba fechava.
//
// Achado em 16/08/2026: `app/api/sdr/chat/route.ts` não tinha UMA chamada a
// `prisma.`. O SDR conversava com o prospect, errava, e ninguém — nem o CEO, nem
// o Diretor, nem o diário do piloto (`/api/piloto/diario`) — conseguia abrir a
// conversa e ler o que foi dito. O diário mostrava `mensagens: 0` ENQUANTO a
// conversa acontecia. Estávamos cegos exatamente na porta de entrada.
//
// Este arquivo grava cada turno em `PortalMessage`, a mesma tabela que o diário
// já lê. Nada de tabela nova: o que faltava não era estrutura, era escrita.
//
// ─── TRÊS DECISÕES QUE PARECEM DETALHE E NÃO SÃO ────────────────────────────
//
// 1. O FIO DA CONVERSA NUNCA VEM CRU DO CLIENTE. A rota é PÚBLICA e sem
//    autenticação: quem chama escolhe o que manda. Se o id de sessão fosse
//    gravado direto em `clientId`, qualquer pessoa mandaria o cuid de um cliente
//    real e injetaria texto no portal dele. Por isso o servidor SEMPRE carimba o
//    prefixo `sdr:` — e cuid não contém `:`, então o fio de uma sessão pública
//    jamais colide com o id de um cliente de verdade.
//
// 2. A CONVERSA NASCE LIDA (`readByTeam: true`). `pm-responde.ts` varre
//    `authorRole: "client", readByTeam: false` a cada passada do despertador e
//    RESPONDE. Sem esta linha, o registro do que o SDR já respondeu em tempo
//    real viraria fila para o PM responder de novo — o prospect receberia duas
//    respostas para a mesma frase, e o raio-x acusaria "cliente falou e ninguém
//    leu" para uma conversa que foi atendida na hora.
//
// 3. GRAVAR NUNCA PODE DERRUBAR A CONVERSA. Quem chama envolve em try/catch e
//    segue. Registro é para nós; a conversa é do cliente. Perder o registro é
//    ficar cego num turno; perder a conversa é perder o cliente.

import { prisma } from "@/lib/db/client";

/** Cuid não tem `:`. É o que garante que fio de sessão pública e id de cliente
 *  real vivem em espaços que nunca se encontram. */
const PREFIXO_DE_SESSAO = "sdr:";

/** Corpo longo não é registro melhor, é banco maior. O diário já corta em 600. */
const MAX_CORPO = 4_000;

/**
 * Segredo colado no chat não vira linha de banco.
 *
 * Não é paranoia de auditor: o prospect cola o que tem à mão para "facilitar" —
 * já chegou senha de painel e link com token dentro de briefing. O que entra
 * aqui é gravado numa tabela que o diário lê e que a equipe abre. Chave que
 * atravessa isso está vazada, e vazada de forma persistente.
 *
 * A lista é de FORMATOS conhecidos, propositalmente estreita: mascarar demais
 * apagaria a fala do cliente, que é justamente o que se quer auditar.
 */
export function semSegredo(texto: string): string {
  return texto
    // Chaves de provedor de IA e de nuvem, pelo prefixo que cada uma publica.
    .replace(/\bsk-ant-[A-Za-z0-9_-]{8,}/g, "[segredo removido]")
    .replace(/\bsk-[A-Za-z0-9_-]{20,}/g, "[segredo removido]")
    .replace(/\bAIza[A-Za-z0-9_-]{10,}/g, "[segredo removido]")
    .replace(/\bAKIA[0-9A-Z]{16}\b/g, "[segredo removido]")
    .replace(/\bgh[pousr]_[A-Za-z0-9]{20,}/g, "[segredo removido]")
    .replace(/\bgithub_pat_[A-Za-z0-9_]{20,}/g, "[segredo removido]")
    .replace(/\bxox[baprs]-[A-Za-z0-9-]{10,}/g, "[segredo removido]")
    // Token de acesso da Meta — o que mais aparece por aqui, porque o cliente
    // tenta "mandar o acesso" da conta de anúncios pelo chat.
    .replace(/\bEAA[A-Za-z0-9]{20,}/g, "[segredo removido]")
    // Cabeçalho colado inteiro, e o par "chave: valor" escrito à mão.
    .replace(/\bBearer\s+[A-Za-z0-9._-]{12,}/gi, "Bearer [segredo removido]")
    .replace(
      /\b(api[_-]?key|apikey|secret|token|senha|password|passwd)\b\s*[:=]\s*\S{6,}/gi,
      "$1: [segredo removido]",
    );
}

/** Corta o corpo e tira segredo — nesta ordem não, na inversa: mascarar
 *  primeiro, para que um corte no meio de uma chave não deixe metade dela. */
function corpoGravavel(texto: string): string {
  const limpo = semSegredo(texto).trim();
  return limpo.length > MAX_CORPO ? `${limpo.slice(0, MAX_CORPO)}…` : limpo;
}

/**
 * O fio estável que amarra os turnos de uma mesma conversa.
 *
 * O id vem do navegador (a sala de briefing já cria um por montagem), mas é
 * tratado como texto sujo: só sobrevive `[A-Za-z0-9_-]`, cortado em 64. Sem id
 * utilizável, a conversa ainda é gravada — num fio `sdr:sem-sessao`, que é pior
 * para ler e infinitamente melhor que não gravar.
 */
export function fioDaConversa(sessionId: unknown): string {
  const cru = typeof sessionId === "string" ? sessionId : "";
  const limpo = cru.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64);
  return PREFIXO_DE_SESSAO + (limpo || "sem-sessao");
}

/**
 * O `clientRequestId` só é aceito se a conversa daquele briefing for ESTA.
 *
 * Rota pública recebendo chave estrangeira é convite: bastaria adivinhar o id de
 * um briefing para escrever no fio de conversa de outra pessoa. A regra é a mais
 * simples que fecha isso — se a linha do tempo daquele pedido já tem mensagem de
 * OUTRO fio, não é esta conversa, e o vínculo é recusado. Fail-closed: na dúvida
 * grava sem vínculo, e o fio de sessão sozinho já basta para ler a conversa.
 */
async function vinculoPermitido(clientRequestId: string, fio: string): Promise<boolean> {
  const [pedido, deOutraSessao] = await Promise.all([
    prisma.clientRequestDb.findUnique({ where: { id: clientRequestId }, select: { id: true } }),
    prisma.portalMessage.findFirst({
      where: { clientRequestId, NOT: { clientId: fio } },
      select: { id: true },
    }),
  ]);
  return Boolean(pedido) && !deOutraSessao;
}

export type TurnoDoSdr = {
  /** Id de sessão vindo do navegador. Sujo por definição. */
  sessionId: unknown;
  /** O briefing, quando já existe. Conferido antes de virar vínculo. */
  clientRequestId?: unknown;
  /** O que o visitante escreveu. */
  doVisitante: string;
  /** O que o SDR respondeu. Ausente quando o turno foi barrado por um guarda. */
  doSdr?: string;
  /** Por que a resposta do SDR não vale (`price_leak`, `email_hallucination`,
   *  `truncado`, `malformado`…). Registrado SEM o texto barrado: o motivo é o
   *  que se audita; repetir a fala proibida seria gravar exatamente o que o
   *  guarda impediu de sair. */
  motivoDaRecusa?: string;
  /** A FORMA do pacote que falhou, em uma frase — nunca o conteúdo dele.
   *
   *  Por que existe: em 23/08/2026 o diário mostrou dois turnos seguidos
   *  barrados por `malformado` e não havia como perguntar POR QUÊ. O texto que
   *  falhou não é gravado (e não deve ser), então "malformado" sozinho é um
   *  nome, não um achado. Aqui entra só forma — houve `{`? sobrou texto fora do
   *  pacote? em que posição o parser desistiu? —, montada por
   *  `lib/agency/comercial/diagnostico-de-formato.ts`, que não deixa uma letra
   *  do modelo passar. */
  formaDaFalha?: string;
  /** Três estados, três significados — não confundir `false` com `undefined`:
   *  `true`  — o modelo extraiu escopo NESTE turno e ele sobreviveu às travas:
   *            o resgate FUNCIONOU.
   *  `false` — o modelo extraiu escopo NESTE turno e as travas descartaram
   *            tudo: houve perda REAL de um dado que existia.
   *  `undefined` — o modelo NÃO extraiu nada neste turno: não há o que
   *            resgatar, e "não havia nada a salvar" não é a mesma coisa que
   *            "perdeu o que havia" (mesma distinção que separa `sem_canal`
   *            de `falhou` no aviso de orçamento). Quem chama (`app/api/sdr/
   *            chat/route.ts`) só afirma `true`/`false` quando o `scope`
   *            bruto do modelo tinha algum campo — do contrário manda
   *            `undefined` de propósito. */
  escopoFoiSalvo?: boolean;
};

/** Prefixo de TODO turno barrado — usado pelo diário do piloto para achar,
 *  com `contains`, o universo de turnos barrados sem depender de outra
 *  cópia do texto. */
export const PREFIXO_TURNO_BARRADO = "[resposta barrada pelo guarda:";

/** As duas frases exportadas para o diário (`app/api/piloto/diario/route.ts`)
 *  contar por `contains` sem duplicar o texto — duplicar seria a mesma
 *  doença que este arquivo existe para curar: duas fontes da mesma verdade
 *  que um dia divergem e ninguém percebe. */
export const FRASE_ESCOPO_SALVO = " O escopo (o que o cliente já tinha dito) foi salvo mesmo assim.";
// CONSERTO DE 16/08 (`esteira`, rodada de "não havia nada a salvar"): esta
// frase só é gravada quando o modelo EXTRAIU algo neste turno e as travas de
// escopo descartaram tudo — nunca mais quando não havia nada a extrair (ver
// `haviaEscopo` em `app/api/sdr/chat/route.ts`). Por isso o texto não fala
// mais em "o que ele já tinha contado até aqui": não é a conversa inteira que
// se perde, é o dado deste turno específico que não pôde ser aproveitado.
export const FRASE_ESCOPO_PERDIDO =
  " O escopo (o que o cliente disse neste turno) NÃO pôde ser aproveitado — o dado se perdeu, e ele terá de repetir.";

/** Motivo cru → explicação curta, pt-BR, sem jargão de código — para quem lê
 *  o diário sem conhecer os nomes internos dos guardas. O motivo cru continua
 *  no corpo (quem audita por grep ainda acha "truncado"/"malformado"); isto
 *  só acrescenta a frase ao lado. */
const EXPLICACAO_DA_RECUSA: Record<string, string> = {
  truncado: "a resposta do modelo foi cortada no meio, o teto de tokens acabou antes de terminar",
  malformado: "a resposta do modelo terminou de ser escrita e ainda assim não veio em formato válido",
  // Os dois guardas mais antigos ficaram sem frase quando os dois de cima
  // nasceram — e motivo sem explicação no diário é o mesmo problema que esta
  // tabela existe para resolver: quem lê o diário do piloto não é quem escreveu
  // o nome do guarda. Aqui o modelo ERROU (pediu e-mail, cotou preço); o pacote
  // chegou inteiro, e é por isso que nestes dois o escopo sempre sobrevive.
  email_hallucination: "o modelo pediu ou validou e-mail, o que ele não pode fazer nesta conversa",
  price_leak: "o modelo citou preço ou desconto na fala, o que só pode acontecer depois do login",
};

/**
 * Grava o turno inteiro: a fala do visitante e a resposta do SDR.
 *
 * Não lança: quem chama está no meio de uma resposta ao cliente e não pode
 * quebrar por causa do diário. Devolve quantas linhas entraram — 0 quando nada
 * entrou, o que é informação e não silêncio.
 */
export async function registrarTurnoDoSdr(turno: TurnoDoSdr): Promise<number> {
  const fio = fioDaConversa(turno.sessionId);

  const idDoPedido =
    typeof turno.clientRequestId === "string" && turno.clientRequestId.trim()
      ? turno.clientRequestId.trim()
      : null;
  const vinculo = idDoPedido && (await vinculoPermitido(idDoPedido, fio)) ? idDoPedido : null;

  const linhas: { authorRole: string; authorName: string; body: string }[] = [];

  const doVisitante = corpoGravavel(turno.doVisitante ?? "");
  if (doVisitante) linhas.push({ authorRole: "client", authorName: "Visitante", body: doVisitante });

  const doSdr = corpoGravavel(turno.doSdr ?? "");
  if (doSdr) {
    linhas.push({ authorRole: "team", authorName: "SDR", body: doSdr });
  } else if (turno.motivoDaRecusa) {
    const explicacao = EXPLICACAO_DA_RECUSA[turno.motivoDaRecusa];
    // `escopoFoiSalvo` chega de `app/api/sdr/chat/route.ts` como `true`/`false`
    // só quando o modelo extraiu ALGO neste turno — `undefined` quando não
    // extraiu nada, porque "não havia dado a salvar" e "o dado se perdeu" são
    // fatos diferentes e não podem gravar a mesma frase. Antes deste conserto
    // (16/08/2026) o `false` e o `undefined` caíam no mesmo `? :` e viravam a
    // MESMA string vazia: a informação de que o resgate do escopo FALHOU
    // chegava até aqui e era jogada fora. Com 55 turnos barrados no banco, 37
    // não tinham a frase de "salvo" — e misturavam três fatos que o diário não
    // distinguia: escopo perdido de verdade, registro gravado ANTES desta
    // frase existir, e turno em que o guarda nem tinha escopo à mão. "Perdido"
    // e "não sei" viravam a mesma coisa aos olhos do CEO, que é exatamente a
    // doença que ele mandou matar: ausência de informação não pode parecer
    // zero — e, na rodada seguinte (mesmo dia), o próprio `false` também
    // podia mentir para cima quando não havia nada a extrair.
    //
    // Por isso os três estados são tratados em separado, e só dois afirmam
    // algo: `true` (frase de salvo), `false` (frase nova, de perda — este
    // conserto) e `undefined` (nenhuma frase — continua significando "não
    // sei", e só significa isso porque os outros dois agora falam por si).
    const salvouEscopo =
      turno.escopoFoiSalvo === true
        ? FRASE_ESCOPO_SALVO
        : turno.escopoFoiSalvo === false
          ? FRASE_ESCOPO_PERDIDO
          : "";
    // A forma entra ANTES do fecho e DEPOIS da explicação: o diário conta por
    // `contains` no prefixo e no motivo, e os dois continuam onde estavam.
    const forma = turno.formaDaFalha ? ` — na forma: ${turno.formaDaFalha}` : "";
    linhas.push({
      authorRole: "team",
      authorName: "SDR",
      body:
        `${PREFIXO_TURNO_BARRADO} ${turno.motivoDaRecusa}` +
        `${explicacao ? ` — ${explicacao}` : ""}` +
        `${forma}` +
        ` — quem respondeu ao visitante foi o motor de regras.${salvouEscopo}]`,
    });
  }

  let gravadas = 0;
  for (const linha of linhas) {
    await prisma.portalMessage.create({
      data: {
        clientId: fio,
        ...(vinculo ? { clientRequestId: vinculo } : {}),
        authorRole: linha.authorRole,
        authorName: linha.authorName,
        body: linha.body,
        // Ver a decisão 2 no cabeçalho: nasce lida dos dois lados para não virar
        // fila do PM nem alarme falso do raio-x.
        readByTeam: true,
        readByClient: true,
      },
    });
    gravadas += 1;
  }

  return gravadas;
}

/**
 * AS FALAS QUE O SDR JÁ DISSE NESTE FIO — a memória que o servidor tem da
 * própria boca.
 *
 * ─── POR QUE O SERVIDOR PRECISA DELA (24/08/2026) ───────────────────────────
 *
 * O freio da pergunta repetida (`comercial/pergunta-repetida.ts`) conta quantas
 * vezes a MESMA pergunta já foi feita. A rota é sem estado: o histórico chega
 * no CORPO da requisição, escrito pelo cliente — e um contador que só olha o
 * que o cliente mandou é um contador que o cliente zera mandando menos.
 *
 * Aqui está a metade que o cliente não escreve: as falas que ESTA casa gravou,
 * no fio dela, quando as disse. Quem chama toma o MAIOR dos dois números — um
 * histórico encurtado não abaixa a contagem, e um banco indisponível não a
 * apaga.
 *
 * Não lança: falha de leitura devolve lista vazia e o chamador cai no histórico
 * do corpo, que é o comportamento de antes deste conserto. Fail-open aqui é
 * certo e é a exceção — o custo do erro é uma pergunta repetida a mais, não uma
 * conversa muda.
 */
export async function falasDoSdrNoFio(sessionId: unknown, teto = 40): Promise<string[]> {
  const fio = fioDaConversa(sessionId);
  try {
    const linhas = await prisma.portalMessage.findMany({
      where: { clientId: fio, authorRole: "team", authorName: "SDR" },
      orderBy: { createdAt: "asc" },
      take: teto,
      select: { body: true },
    });
    return linhas
      .map((l) => l.body ?? "")
      // Turno barrado não é fala: ele nunca chegou ao cliente, e contá-lo como
      // pergunta feita puniria o SDR por um erro que o guarda já pagou.
      .filter((b) => b && !b.startsWith(PREFIXO_TURNO_BARRADO));
  } catch (e) {
    console.error(`[sdr/registro] não consegui reler o fio: ${e instanceof Error ? e.message : String(e)}`);
    return [];
  }
}

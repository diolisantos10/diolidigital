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
  /** true quando a fala foi barrada mas o ESCOPO (o que o cliente já tinha
   *  dito) sobreviveu e foi devolvido ao cliente mesmo assim — caso de
   *  16/08/2026: barrar a fala TENDO SALVO o briefing é um fato diferente de
   *  perder tudo, e o diário precisa mostrar essa diferença, não só o motivo
   *  da recusa. */
  escopoFoiSalvo?: boolean;
};

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
    const salvouEscopo = turno.escopoFoiSalvo
      ? " O escopo (o que o cliente já tinha dito) foi salvo mesmo assim."
      : "";
    linhas.push({
      authorRole: "team",
      authorName: "SDR",
      body:
        `[resposta barrada pelo guarda: ${turno.motivoDaRecusa}` +
        `${explicacao ? ` — ${explicacao}` : ""}` +
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

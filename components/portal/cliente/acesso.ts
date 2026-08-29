// ─── QUANDO O PORTAL FECHA A PORTA ───────────────────────────────────────────
//
// Este módulo responde a UMA pergunta, e responde em português: *o acesso desta
// pessoa morreu, ou foi só um erro passageiro?* A diferença não é técnica — é a
// diferença entre "tente de novo" e "peça um link novo a quem te enviou".
//
// ── OS DOIS DEFEITOS QUE ELE FECHA (medidos ao vivo em 29/08/2026) ───────────
//
//  1. `/portal/invalid` **não existia**. Quem abria `/portal/access` sem token
//     era redirecionado (307) para uma rota inexistente e recebia o 404 padrão
//     do Next — *"404 · This page could not be found."*, em inglês, sem marca,
//     sem uma palavra e sem caminho de volta. O cliente que clicou num link
//     velho de e-mail conclui que a agência sumiu.
//
//  2. O token que vence NO MEIO DA SESSÃO mostrava **"Access denied"** cru. A
//     tela descartava o `res.status` (`throw new Error(j.error ?? "HTTP …")`);
//     como a API preenche `error: "Access denied"`, o tradutor
//     `components/agency/ui/mensagemDeErro.ts` caía no ramo "mensagem já
//     escrita para humano" e devolvia o inglês da API na cara de quem paga,
//     no celular, no instante em que ela clicava em **Aprovar**.
//
// ── A REGRA DE LEITURA ───────────────────────────────────────────────────────
//
// O `reason` do servidor MANDA quando existe (`expired` · `revoked` ·
// `not_found`) — ele é o único que sabe qual das três coisas aconteceu. Sem
// `reason`, o status e uma **lista fechada** de frases de negativa decidem. É
// lista fechada de propósito: a mesma rota devolve 403 para "origem não
// confiável" (proteção de CSRF), que **não** é acesso vencido — tratar todo 403
// como "seu link morreu" mandaria o cliente pedir um link novo que não
// resolveria nada.
//
// Nenhuma frase daqui inventa o motivo: quando o servidor não diz qual foi, o
// texto é "não está mais valendo", nunca "expirou". Ausência de informação não
// é informação.

/** O que aconteceu com o acesso. `rede` não é bloqueio — é falta de servidor. */
export type MotivoDoBloqueio =
  | "sem-link"    // o endereço chegou sem a parte que identifica a pessoa
  | "expirado"    // o link tinha prazo e o prazo venceu
  | "revogado"    // a equipe desativou este link
  | "invalido"    // o token não existe (link truncado, copiado pela metade)
  | "encerrado"   // o acesso caiu e o servidor não disse qual dos três foi
  | "rede";       // não foi possível falar com o servidor

/** De onde a pessoa está olhando. Muda a frase inteira, não só o título. */
export type ContextoDoBloqueio = "entrada" | "sessao";

/** As frases de negativa de acesso que as rotas do portal realmente devolvem.
 *  Lista FECHADA — ver o cabeçalho. Conferidas em 29/08/2026 contra:
 *    app/api/portal/approvals/route.ts:106   → "Access denied" (+ reason)
 *    app/api/portal/pedidos/orcamento/route.ts:48 → "Acesso negado"
 *    app/api/portal/esteira/route.ts:70      → "Acesso negado"
 *  O 403 de origem não confiável ("Origem não confiável para esta ação.")
 *  está FORA da lista de propósito. */
const FRASES_DE_NEGATIVA = [
  "access denied",
  "acesso negado",
  "acesso expirado",
  "token é obrigatório",
];

interface CorpoDeErro {
  error?: unknown;
  reason?: unknown;
}

/**
 * O acesso morreu? Devolve o motivo, ou `null` quando a falha é um erro comum
 * (400 de validação, 409 de conflito, 500 do servidor) que a tela trata na
 * mesma página, sem expulsar ninguém.
 */
export function motivoDaNegativa(status: number, corpo: CorpoDeErro | null | undefined): MotivoDoBloqueio | null {
  const reason = typeof corpo?.reason === "string" ? corpo.reason : "";
  if (reason === "expired") return "expirado";
  if (reason === "revoked") return "revogado";
  if (reason === "not_found") return "invalido";

  // 401 é sempre perda de acesso — não existe outro motivo para ele aqui.
  if (status === 401) return "encerrado";

  const frase = (typeof corpo?.error === "string" ? corpo.error : "").trim().toLowerCase();
  const negou = FRASES_DE_NEGATIVA.some((f) => frase === f);

  // 403 só é perda de acesso quando a frase é uma das da lista fechada.
  if (status === 403 && negou) return "encerrado";
  // O 400 de "token é obrigatório" é o cookie que sumiu do navegador no meio
  // da sessão. Para quem está usando, é a mesma perda de acesso.
  if (status === 400 && negou) return "encerrado";

  return null;
}

export interface FalhaDoPortal {
  /** Preenchido quando a tela inteira precisa virar a tela de acesso perdido. */
  bloqueio: MotivoDoBloqueio | null;
  /** A frase inline, em português, para a falha que NÃO é perda de acesso. */
  mensagem: string;
}

/**
 * Lê a resposta reprovada UMA vez e devolve as duas coisas que a tela precisa.
 *
 * O `status` entra na mensagem (`HTTP 500`) para o tradutor de erro poder
 * reconhecê-lo — era exatamente esse número que a tela jogava fora.
 */
export async function falhaDoPortal(res: Response, acao: string): Promise<FalhaDoPortal> {
  const corpo = (await res.json().catch(() => ({}))) as CorpoDeErro;
  const bloqueio = motivoDaNegativa(res.status, corpo);
  if (bloqueio) {
    return { bloqueio, mensagem: textoInlineDoBloqueio(bloqueio) };
  }
  const daApi = typeof corpo.error === "string" ? corpo.error.trim() : "";
  // Frase da API só vale se for para gente: em português e sem cara de log.
  const humana = daApi && !/^[A-Z][a-z]+ (denied|error|failed)$/i.test(daApi) && !/^Invalid /i.test(daApi);
  return {
    bloqueio: null,
    mensagem: humana ? daApi : `Não conseguimos ${acao} — HTTP ${res.status}`,
  };
}

/** A versão curta, para quando a frase ainda aparece embaixo de um botão. */
export function textoInlineDoBloqueio(motivo: MotivoDoBloqueio): string {
  return motivo === "expirado"
    ? "Seu acesso expirou enquanto você estava aqui. Peça um link novo a quem te enviou o portal."
    : motivo === "revogado"
      ? "Este acesso foi encerrado pela equipe. Fale com a Dioli para receber um link novo."
      : "Seu acesso ao portal não está mais valendo. Peça um link novo a quem te enviou o portal.";
}

export interface TextoDoBloqueio {
  titulo: string;
  /** O que houve — e, sempre, que não é culpa de quem está lendo. */
  corpo: string;
  /** O que fazer AGORA. Tela de erro sem próximo passo é meio defeito. */
  passos: string[];
  /** O rótulo do botão de conversa. */
  acao: string;
}

/** O canal público da casa — o MESMO número de `app/contato/page.tsx:39`.
 *  Sem ele, "peça um link novo" é uma tarefa jogada no colo do cliente sem
 *  ferramenta nenhuma (diagnóstico de 29/08/2026, §5.3). */
export const WHATSAPP_DA_CASA = "5511989400692";
export const LINK_DO_WHATSAPP =
  `https://wa.me/${WHATSAPP_DA_CASA}?text=` +
  encodeURIComponent("Olá! Preciso de um link novo para entrar no portal da Dioli.");

const PEDIR_NOVO = "Peça um link novo a quem te enviou o portal — ele é gerado na hora.";
const ABRIR_DE_NOVO = "Quando o link novo chegar, abra por ele e você volta exatamente para onde estava.";

/**
 * A frase de cada situação, nos dois contextos.
 *
 * Quem estava DENTRO não pode ler "confira o link que você recebeu": ela não
 * chegou por link nenhum agora, ela estava usando o portal. É por isso que o
 * contexto muda o texto inteiro, e não só o título.
 */
export function textoDoBloqueio(motivo: MotivoDoBloqueio, contexto: ContextoDoBloqueio): TextoDoBloqueio {
  const conversa = "Falar com a Dioli no WhatsApp";

  if (motivo === "rede") {
    return {
      titulo: "Não conseguimos falar com o servidor",
      corpo:
        "A conexão caiu no meio do caminho. Seu acesso continua valendo — é só a comunicação que falhou agora.",
      passos: [
        "Confira sua internet e toque em “Tentar de novo”.",
        "Se insistir por alguns minutos, avise a equipe — pode ser coisa nossa.",
      ],
      acao: conversa,
    };
  }

  if (contexto === "sessao") {
    if (motivo === "expirado") {
      return {
        titulo: "Seu acesso expirou enquanto você estava aqui",
        corpo:
          "O link do portal tem prazo, por segurança — e o seu venceu agora há pouco. Isso é normal e não é culpa sua. Sua última resposta não foi registrada; nada do que você já tinha decidido se perdeu.",
        passos: [PEDIR_NOVO, ABRIR_DE_NOVO],
        acao: conversa,
      };
    }
    if (motivo === "revogado") {
      return {
        titulo: "Seu acesso foi encerrado enquanto você estava aqui",
        corpo:
          "A equipe desativou este link — normalmente porque um link novo foi emitido no lugar dele. Seu conteúdo continua guardado e sua última resposta não foi registrada.",
        passos: [
          "Procure no seu e-mail o link mais recente do portal e abra por ele.",
          "Se não encontrar, fale com a Dioli que a gente reenvia.",
        ],
        acao: conversa,
      };
    }
    return {
      titulo: "Seu acesso ao portal não está mais valendo",
      corpo:
        "O portal deixou de reconhecer o seu acesso agora há pouco. Isso é normal e não é culpa sua: seu conteúdo continua guardado, e sua última resposta não foi registrada.",
      passos: [PEDIR_NOVO, ABRIR_DE_NOVO],
      acao: conversa,
    };
  }

  if (motivo === "sem-link") {
    return {
      titulo: "Este endereço não abre o seu portal",
      corpo:
        "Faltou no endereço a parte que identifica você. Quase sempre é um link cortado pelo aplicativo de e-mail ou copiado pela metade — não é nada com a sua conta, e seu conteúdo continua guardado.",
      passos: [
        "Volte ao e-mail ou à mensagem em que recebeu o portal e abra clicando no link, sem copiar e colar.",
        PEDIR_NOVO,
      ],
      acao: conversa,
    };
  }

  if (motivo === "expirado") {
    return {
      titulo: "Este link de acesso expirou",
      corpo:
        "Os links do portal têm prazo, por segurança. Isso é normal e não é culpa sua — seu conteúdo continua guardado, esperando você entrar de novo.",
      passos: [PEDIR_NOVO, ABRIR_DE_NOVO],
      acao: conversa,
    };
  }

  if (motivo === "revogado") {
    return {
      titulo: "Este acesso foi encerrado",
      corpo:
        "A equipe desativou este link — normalmente porque um link novo foi emitido no lugar dele. Seu conteúdo continua guardado.",
      passos: [
        "Procure no seu e-mail o link mais recente do portal e abra por ele.",
        "Se não encontrar, fale com a Dioli que a gente reenvia.",
      ],
      acao: conversa,
    };
  }

  return {
    titulo: "Este link não é válido",
    corpo:
      "O endereço não corresponde a nenhum acesso ativo. Quase sempre é um link antigo ou copiado pela metade — não é nada com a sua conta, e seu conteúdo continua guardado.",
    passos: [
      "Confira se abriu o link mais recente que você recebeu, clicando nele em vez de copiar e colar.",
      PEDIR_NOVO,
    ],
    acao: conversa,
  };
}

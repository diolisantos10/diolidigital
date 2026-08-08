// ─── O LEITOR DA CAIXA ───────────────────────────────────────────────────────
//
// A ÚNICA peça desta frente que fala com o mundo de fora. Tudo o mais
// (`varredura.ts`, `mime.ts`, `cofre.ts`) roda contra esta interface, e é por
// isso que a frente inteira pôde ser provada sem credencial e sem rede: o teste
// entrega uma caixa de mentira que implementa `LeitorDeCaixa` e o resto do
// caminho é o MESMO caminho que roda em produção.
//
// ── O QUE ESTE ARQUIVO PODE FAZER, E O QUE ELE NÃO PODE ─────────────────────
//   PODE: conectar por TLS, autenticar, PROCURAR por remetente e data, LER.
//   NÃO PODE: apagar, mover, arquivar, responder, enviar. Não existe função
//   aqui que faça nenhuma dessas coisas, e o teste
//   `__tests__/comercial/caixa-de-entrada.test.ts` reprova o arquivo que ganhar
//   uma. O alerta original é a PROVA de que a oportunidade existiu — mexer nele
//   é destruir a prova.
//   A única escrita possível é acrescentar a marca `\Seen`, e ela só acontece se
//   o CEO tiver ligado isso na tela. O padrão é NÃO TOCAR EM NADA.
//
// ── POR QUE UMA BIBLIOTECA DE TERCEIRO PARA O PROTOCOLO ─────────────────────
// IMAP é um protocolo com estado, com literais de tamanho declarado e respostas
// não solicitadas no meio do fluxo. A porta 993 **não sai desta máquina** — foi
// medido nesta sessão, o socket TLS para `imap.gmail.com:993` fica pendurado até
// o timeout. Ou seja: um cliente escrito à mão aqui só poderia ser testado
// contra o meu próprio mock, que é o defeito da "peça verde e junta rompida"
// que esta casa já pagou duas vezes. `imapflow` é o cliente de referência (mesmo
// autor do nodemailer) e é ele que carrega a parte impossível de exercitar aqui.
//
// ⚠️ `logger: false` NÃO É ESTILO. O logger padrão do imapflow imprime o diálogo
// IMAP, e o comando `LOGIN` carrega a senha de aplicativo em texto puro. Um log
// ligado aqui derrama no console do Railway a credencial que abre a caixa
// inteira da agência. Há teste que reprova este arquivo sem `logger: false`.

import { ImapFlow } from "imapflow";
import {
  MENSAGEM_MAX_BYTES,
  decodificarPalavras,
  enderecoDe,
  textoDaMensagem,
} from "@/lib/agency/comercial/caixa-de-entrada/mime";
import { PASTA, type CredencialDaCaixa } from "@/lib/agency/comercial/caixa-de-entrada/cofre";

export interface MensagemDaCaixa {
  /** O UID na pasta. Rastro operacional — NUNCA a identidade da mensagem. */
  uid: number;
  /** O `Message-ID`, como veio. Nulo quando a mensagem não tem um (raro, e a
   *  varredura sabe lidar). */
  mensagemId: string | null;
  /** O remetente, só o endereço, minúsculo. */
  remetente: string;
  assunto: string | null;
  data: Date | null;
  /** O corpo já em texto legível. Vazio quando não havia parte de texto. */
  texto: string;
}

export interface BuscaNaCaixa {
  remetentes: string[];
  desde: Date;
  limite: number;
}

/**
 * O contrato. Quem depende disto não sabe se do outro lado há Gmail ou um
 * objeto de teste — e é essa ignorância que torna a frente provável sem
 * credencial.
 */
export interface LeitorDeCaixa {
  /** "conectou / não conectou e por quê", em uma frase, para a tela. */
  testar(): Promise<{ ok: boolean; mensagem: string }>;
  /**
   * QUANTOS alertas daqueles remetentes já existem na caixa — a caixa inteira,
   * sem janela de data.
   *
   * É a primeira medida real de volume desta plataforma que a casa vai ter, e
   * ela decide se o canal vale: 3 alertas em dois anos e 300 por mês pedem
   * decisões opostas. Só CONTA (IMAP `SEARCH`), não baixa nada.
   */
  contar(remetentes: string[]): Promise<{ total: number; porRemetente: Record<string, number> }>;
  buscar(p: BuscaNaCaixa): Promise<MensagemDaCaixa[]>;
  /** Acrescenta `\Seen`. Best-effort: falhar aqui não invalida a ingestão que
   *  já aconteceu, e por isso não lança. */
  marcarComoLido(uids: number[]): Promise<void>;
  fechar(): Promise<void>;
}

/** Quanto se espera pela conexão antes de desistir. Sem teto, uma rede que
 *  engole pacotes (foi o que aconteceu ao medir a porta 993 daqui) deixa a
 *  rodada do relógio pendurada para sempre e as OUTRAS pernas do despertador
 *  param junto. */
const TIMEOUT_MS = 20_000;

/**
 * O leitor de verdade.
 *
 * Cria a conexão sob demanda e a fecha ao fim. Conexão persistente com IDLE
 * daria alertas em segundos em vez de minutos, e foi recusada: mantém um socket
 * autenticado vivo dentro do processo do app, sobrevive a hot reload, e
 * multiplica por réplica. O despertador bate a cada 5 minutos — para uma porta
 * de entrada de oportunidade isso é rápido o bastante.
 */
export class LeitorImap implements LeitorDeCaixa {
  private cliente: ImapFlow | null = null;

  constructor(private readonly credencial: CredencialDaCaixa) {}

  private async conectar(): Promise<ImapFlow> {
    if (this.cliente) return this.cliente;
    const c = new ImapFlow({
      host: this.credencial.host,
      port: this.credencial.porta,
      secure: true,
      auth: { user: this.credencial.usuario, pass: this.credencial.senha },
      // ⚠️ Ver o cabeçalho: o log do protocolo carrega a senha.
      logger: false,
      // IDLE mantém o socket ocupado esperando novidade. Aqui a conexão é curta
      // e a espera é do relógio, não do socket.
      disableAutoIdle: true,
      connectionTimeout: TIMEOUT_MS,
      greetingTimeout: TIMEOUT_MS,
      socketTimeout: 2 * TIMEOUT_MS,
    });
    await c.connect();
    this.cliente = c;
    return c;
  }

  async testar(): Promise<{ ok: boolean; mensagem: string }> {
    try {
      const c = await this.conectar();
      const trava = await c.getMailboxLock(PASTA);
      try {
        const caixa = c.mailbox;
        const total = caixa && typeof caixa !== "boolean" ? caixa.exists : null;
        return {
          ok: true,
          mensagem:
            `Conectou em ${this.credencial.host} como ${this.credencial.usuario}` +
            (total === null ? "." : ` e abriu a ${PASTA} (${total} mensagens na pasta).`),
        };
      } finally {
        trava.release();
      }
    } catch (e) {
      // ⚠️ A mensagem do erro vai para a TELA. Ela nunca contém a senha (o
      // imapflow não a ecoa em `Error.message`), mas o texto é cortado e
      // higienizado assim mesmo: se um dia ecoar, o corte não é a proteção — a
      // proteção é `logger:false` + este filtro.
      return { ok: false, mensagem: semSegredo(mensagemDoErro(e), this.credencial.senha) };
    } finally {
      await this.fechar();
    }
  }

  async contar(remetentes: string[]): Promise<{ total: number; porRemetente: Record<string, number> }> {
    const c = await this.conectar();
    const trava = await c.getMailboxLock(PASTA);
    try {
      const uids = new Set<number>();
      const porRemetente: Record<string, number> = {};
      for (const remetente of remetentes) {
        // Sem `since`: a pergunta é sobre a caixa INTEIRA. É uma contagem de
        // UIDs, não um download — o Gmail responde com a lista de números.
        const r = await c.search({ from: remetente }, { uid: true });
        const achados = r === false ? [] : r;
        porRemetente[remetente] = achados.length;
        for (const uid of achados) uids.add(uid);
      }
      // O total é a UNIÃO, não a soma: dois filtros que casam com a mesma
      // mensagem (o domínio e o endereço completo) contariam o alerta duas
      // vezes, e o número que decide se o canal vale sairia inflado.
      return { total: uids.size, porRemetente };
    } finally {
      trava.release();
    }
  }

  async buscar(p: BuscaNaCaixa): Promise<MensagemDaCaixa[]> {
    const c = await this.conectar();
    const trava = await c.getMailboxLock(PASTA);
    const achadas: MensagemDaCaixa[] = [];
    try {
      // Uma busca POR REMETENTE, e a união depois. `FROM` no IMAP é comparação
      // por SUBSTRING no cabeçalho, então "@99freelas.com.br" casa com qualquer
      // caixa daquele domínio — que é exatamente o que se quer enquanto ninguém
      // conferiu o endereço exato num alerta real.
      const uids = new Set<number>();
      for (const remetente of p.remetentes) {
        const r = await c.search({ from: remetente, since: p.desde }, { uid: true });
        if (r === false) continue; // pasta vazia / servidor não achou nada
        for (const uid of r) uids.add(uid);
      }
      if (uids.size === 0) return [];

      // Os mais RECENTES primeiro: se a caixa tiver mais alertas do que o teto
      // da rodada, o que interessa é o projeto de agora, não o da semana
      // passada. O que sobrar entra na rodada seguinte — a janela é de dias.
      const lista = [...uids].sort((a, b) => b - a).slice(0, p.limite);

      for await (const msg of c.fetch(
        lista,
        { uid: true, envelope: true, source: { maxLength: MENSAGEM_MAX_BYTES } },
        { uid: true },
      )) {
        achadas.push(daMensagemDoServidor(msg));
      }
      return achadas;
    } finally {
      trava.release();
    }
  }

  async marcarComoLido(uids: number[]): Promise<void> {
    if (!uids.length) return;
    try {
      const c = await this.conectar();
      const trava = await c.getMailboxLock(PASTA);
      try {
        await c.messageFlagsAdd(uids, ["\\Seen"], { uid: true });
      } finally {
        trava.release();
      }
    } catch {
      // Não lança de propósito: a oportunidade JÁ foi gravada e a idempotência
      // não depende da marca (ela mora no `Message-ID`, em `EmailDoRadar`).
      // Derrubar a rodada aqui desfaria trabalho bom por causa de um enfeite.
    }
  }

  async fechar(): Promise<void> {
    const c = this.cliente;
    this.cliente = null;
    if (!c) return;
    try {
      await c.logout();
    } catch {
      try {
        c.close();
      } catch {
        /* o socket já se foi */
      }
    }
  }
}

/** Traduz o que o servidor devolveu para o formato da casa. Exportada para o
 *  teste poder exercitar a tradução sem subir conexão nenhuma. */
export function daMensagemDoServidor(msg: {
  uid: number;
  envelope?: {
    messageId?: string;
    subject?: string;
    date?: Date;
    from?: { address?: string; name?: string }[];
    sender?: { address?: string; name?: string }[];
  };
  source?: Buffer;
}): MensagemDaCaixa {
  const env = msg.envelope ?? {};
  const doEnvelope = (env.from ?? env.sender ?? [])[0]?.address ?? "";
  const cru = msg.source ?? Buffer.alloc(0);
  const { texto } = textoDaMensagem(cru);

  return {
    uid: msg.uid,
    mensagemId: (env.messageId ?? "").trim() || null,
    // O endereço do envelope é o que o servidor já parseou; `enderecoDe` só o
    // normaliza. Nunca se deduz remetente do CORPO da mensagem — o corpo é
    // escrito por um desconhecido e é trivial forjar "De: 99freelas" lá dentro.
    remetente: enderecoDe(doEnvelope) || doEnvelope.toLowerCase(),
    assunto: env.subject ? decodificarPalavras(env.subject).slice(0, 300) : null,
    data: env.date instanceof Date ? env.date : null,
    texto,
  };
}

function mensagemDoErro(e: unknown): string {
  if (e && typeof e === "object") {
    const err = e as { responseText?: string; authenticationFailed?: boolean; message?: string; code?: string };
    if (err.authenticationFailed) {
      return (
        "O Gmail recusou a autenticação. As três causas, nesta ordem de probabilidade: " +
        "(1) a verificação em duas etapas não está ativa na conta — sem ela o Google nem cria senha de aplicativo; " +
        "(2) a senha de aplicativo foi revogada ou pertence a outra conta; " +
        "(3) o endereço da caixa está errado. " +
        (err.responseText ? `Resposta do servidor: ${err.responseText}` : "")
      );
    }
    if (err.code === "ENOTFOUND" || err.code === "EAI_AGAIN") {
      return `Não achei o servidor ${"imap.gmail.com"} (DNS). A rede desta instância não resolve o nome.`;
    }
    if (err.code === "ETIMEDOUT" || err.code === "ECONNREFUSED" || err.code === "ECONNRESET") {
      return "A conexão com a porta 993 não completou (tempo esgotado ou recusada). A saída de rede desta instância provavelmente bloqueia IMAP.";
    }
    if (err.message) return err.message;
  }
  return String(e ?? "erro desconhecido");
}

/** Última linha de defesa: se por qualquer motivo a senha aparecer num texto
 *  que vai para tela ou para banco, ela some antes. */
function semSegredo(texto: string, senha: string): string {
  const limpo = senha ? texto.split(senha).join("«senha»") : texto;
  return limpo.slice(0, 400);
}

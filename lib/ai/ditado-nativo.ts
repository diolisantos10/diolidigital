// ditado-nativo.ts — o microfone que NÃO custa nada: `SpeechRecognition` do
// próprio navegador. SÓ NAVEGADOR (nada aqui roda no servidor).
//
// POR QUE ISTO EXISTE (06/08/2026) — pergunta do CEO: "não tem como usar algum
// microfone sem usar OpenAI?". Tem, e é melhor:
//   • grátis, sem chave, sem custo por minuto — o ditado não depende de saldo;
//   • o ÁUDIO NÃO PASSA PELO NOSSO SERVIDOR: menos custo e menos fala de
//     cliente trafegando por onde não precisa;
//   • é instantâneo (texto durante a fala), enquanto o envio só devolve no fim.
//
// E O COMENTÁRIO DE ONTEM EM `transcricao.ts`, QUE DIZIA O CONTRÁRIO?
//   Ele dizia que Web Speech "em várias versões simplesmente não existe fora do
//   Safari" e por isso o servidor era o caminho. Continua verdade — e é
//   exatamente por isso que aqui ele é o CAMINHO 1, não o único:
//     1. reconhecimento nativo, quando o navegador tem;
//     2. gravar e enviar (`transcricao.ts`), quando não tem.
//   A falha de ontem não foi escolher o servidor: foi ter SÓ o servidor. Com a
//   conta do provedor sem crédito, o microfone morreu para todo mundo —
//   inclusive para o dono, no iPhone dele, onde o nativo funciona.
//
// SUPORTE É DETECTADO, NUNCA PRESUMIDO. E mais: suporte pode CAIR no meio do
// caminho (o Chrome faz o reconhecimento num serviço remoto; sem rede, ele
// morre com `network`). Por isso existe o REBAIXAMENTO: quando o nativo falha
// por motivo técnico, este módulo passa a responder `false` e a tela cai
// sozinha para o caminho 2 — sem o usuário precisar entender nada disso.
//
// PII: o texto reconhecido é fala do cliente. Nunca é logado, nem em erro.

import type { MotivoDeFalhaDeTranscricao } from "@/lib/ai/transcricao";

// ─── Tipos ───────────────────────────────────────────────────────────────────
// O `lib.dom` não declara `SpeechRecognition` em toda versão de TS, e este
// arquivo não pode depender disso. Declaramos o mínimo que usamos.

interface EventoDeResultado {
  resultIndex: number;
  results: {
    length: number;
    [i: number]: { isFinal: boolean; length: number; [j: number]: { transcript: string } };
  };
}
interface EventoDeErro {
  error: string;
}
interface ReconhecedorNativo {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: EventoDeResultado) => void) | null;
  onerror: ((e: EventoDeErro) => void) | null;
  onend: (() => void) | null;
}
type ConstrutorDeReconhecedor = new () => ReconhecedorNativo;

// ─── Detecção ────────────────────────────────────────────────────────────────

function construtor(): ConstrutorDeReconhecedor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: ConstrutorDeReconhecedor;
    webkitSpeechRecognition?: ConstrutorDeReconhecedor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

let rebaixado = false;
const ouvintes = new Set<() => void>();

/**
 * Assinatura para `useSyncExternalStore`.
 *
 * O componente lê o suporte de FORA do React, com instantâneo de servidor
 * `false` — foi assim que o erro de hidratação foi fechado, e continua assim.
 * A diferença agora é que a leitura pode MUDAR (rebaixamento), então a
 * assinatura é de verdade em vez de um no-op.
 */
export function assinarDitadoNativo(aoMudar: () => void): () => void {
  ouvintes.add(aoMudar);
  return () => {
    ouvintes.delete(aoMudar);
  };
}

/** true só quando dá para reconhecer DE VERDADE, aqui e agora. */
export function suportaDitadoNativo(): boolean {
  if (rebaixado) return false;
  if (construtor() === null) return false;
  // Sem contexto seguro o navegador nem pede permissão de microfone. Em
  // desenvolvimento, `localhost` conta como seguro — então isto não atrapalha.
  if (typeof window !== "undefined" && window.isSecureContext === false) return false;
  return true;
}

/**
 * Desliga o caminho nativo para o resto da sessão. Quem chama é a própria
 * sessão de ditado, quando o navegador falha por motivo TÉCNICO — nunca quando
 * o usuário negou o microfone (negar é escolha legítima, e trocar de caminho
 * não muda a resposta do sistema operacional).
 */
export function rebaixarDitadoNativo(): void {
  if (rebaixado) return;
  rebaixado = true;
  for (const f of ouvintes) f();
}

/** Só para teste: devolve o módulo ao estado de fábrica. */
export function _restaurarDitadoNativo(): void {
  rebaixado = false;
  for (const f of ouvintes) f();
}

// ─── Leitura do erro do navegador ────────────────────────────────────────────

/**
 * `SpeechRecognitionErrorEvent.error` → motivo da casa + rebaixar ou não.
 *
 * Mesma disciplina de `classificarFalhaDoProvedor`: cada causa vira UMA frase,
 * porque cada uma tem um conserto diferente. "Permissão negada" e "o serviço de
 * reconhecimento caiu" são coisas opostas — juntar as duas numa palavra só é o
 * defeito que a casa já consertou uma vez.
 */
export function classificarFalhaNativa(erro: string): {
  motivo: MotivoDeFalhaDeTranscricao;
  /** true = o nativo não serve mais nesta sessão; a tela cai para o envio. */
  rebaixa: boolean;
  /** true = não é falha nenhuma (o usuário mandou parar). */
  silencioso: boolean;
} {
  switch (erro) {
    case "aborted":
      return { motivo: "sem_texto", rebaixa: false, silencioso: true };
    case "no-speech":
      return { motivo: "sem_texto", rebaixa: false, silencioso: false };
    case "not-allowed":
      // O usuário (ou o SO) negou. Trocar de caminho não muda essa resposta.
      return { motivo: "sem_permissao", rebaixa: false, silencioso: false };
    case "service-not-allowed":
      // O ditado do sistema está desligado (iOS: Ajustes › Teclado › Ditado).
      // Aqui trocar de caminho RESOLVE — o caminho 2 não usa o serviço do SO.
      return { motivo: "sem_permissao", rebaixa: true, silencioso: false };
    case "audio-capture":
      return { motivo: "sem_permissao", rebaixa: false, silencioso: false };
    case "network":
      // O reconhecimento do Chrome roda num serviço remoto do próprio Google.
      return { motivo: "rede", rebaixa: true, silencioso: false };
    case "language-not-supported":
    case "bad-grammar":
      return { motivo: "provedor_indisponivel", rebaixa: true, silencioso: false };
    default:
      return { motivo: "provedor_indisponivel", rebaixa: true, silencioso: false };
  }
}

// ─── Sessão ──────────────────────────────────────────────────────────────────

export interface SessaoDeDitadoNativo {
  /** Encerra e entrega o que faltava. */
  parar(): void;
  /** Encerra jogando fora — usado quando a tela desmonta. */
  cancelar(): void;
}

/**
 * Abre uma sessão de reconhecimento. NUNCA lança: falha vira `onFalha`.
 *
 * Detalhe que decide se funciona no iPhone: o Safari **corta sozinho no
 * silêncio**, e o Chrome também encerra sem aviso. Por isso o `onend` REABRE a
 * sessão enquanto o usuário não mandou parar. Sem esse religamento, o dono fala,
 * pensa dois segundos e o microfone já morreu — que é justamente o motivo
 * histórico de a casa ter desistido do nativo da primeira vez.
 */
export function iniciarDitadoNativo(opts: {
  idioma?: string;
  /** Texto ainda sendo reconhecido — serve de eco na tela, não vai para o campo. */
  onParcial?: (texto: string) => void;
  /** Trecho FECHADO. Vai para o campo, aditivo, e o usuário revisa antes de enviar. */
  onFinal: (texto: string) => void;
  /** A sessão terminou (por parada, por falha ou por fim de reconhecimento). */
  onFim: () => void;
  onFalha: (motivo: MotivoDeFalhaDeTranscricao) => void;
}): SessaoDeDitadoNativo | null {
  const Ctor = construtor();
  if (!Ctor || !suportaDitadoNativo()) return null;

  let rec: ReconhecedorNativo;
  try {
    rec = new Ctor();
  } catch {
    rebaixarDitadoNativo();
    return null;
  }

  rec.lang = opts.idioma ?? "pt-BR";
  rec.continuous = true;
  rec.interimResults = true;
  rec.maxAlternatives = 1;

  let encerrado = false;
  let pedidoDeParada = false;
  let religamentos = 0;
  let houveResultado = false;
  const MAX_RELIGAMENTOS = 40; // teto para nunca virar microfone infinito
  /**
   * ─── 06/08/2026 · O NATIVO QUE EXISTE E NÃO FUNCIONA ──────────────────────
   * Rebaixar por ERRO cobre o caso barulhento. Falta o silencioso, e ele é
   * justamente o do aparelho do CEO: no iPhone TODO navegador é WebKit, e um
   * WebKit embarcado (Chrome/Edge/Firefox do iOS) pode expor o construtor de
   * `webkitSpeechRecognition` sem ter o serviço de reconhecimento por trás.
   * Aí `start()` passa, `onend` chega na hora, e nenhum `onerror` dispara.
   *
   * Com o religamento de cima, isso não seria "não funciona": seria um LOOP —
   * 40 partidas em sequência, botão vermelho aceso, microfone do sistema
   * piscando e nem uma palavra no campo. Duas voltas sem NENHUM resultado já
   * são resposta suficiente: o nativo não serve aqui. Rebaixa, e a tela cai
   * sozinha para gravar-e-enviar no toque seguinte.
   *
   * O teto é 2, não 1, porque começar em silêncio de verdade acontece (a pessoa
   * abre o microfone e pensa antes de falar) e não pode custar o caminho grátis.
   */
  const RELIGAMENTOS_SEM_RESULTADO = 2;

  const encerrar = () => {
    if (encerrado) return;
    encerrado = true;
    rec.onresult = null;
    rec.onerror = null;
    rec.onend = null;
    opts.onFim();
  };

  rec.onresult = (e) => {
    let parcial = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      const t = r?.[0]?.transcript ?? "";
      if (!t) continue;
      houveResultado = true;
      if (r.isFinal) opts.onFinal(t.trim());
      else parcial += t;
    }
    if (parcial && opts.onParcial) opts.onParcial(parcial.trim());
  };

  rec.onerror = (e) => {
    const { motivo, rebaixa, silencioso } = classificarFalhaNativa(e?.error ?? "");
    if (rebaixa) rebaixarDitadoNativo();
    if (!silencioso) opts.onFalha(motivo);
    pedidoDeParada = true; // não religa em cima de um erro
  };

  rec.onend = () => {
    // Nativo que abre e fecha sem nunca reconhecer nada: rebaixa em vez de
    // religar para sempre. É o WebKit embarcado do iPhone (Chrome/Edge/Firefox
    // do iOS) — ver `RELIGAMENTOS_SEM_RESULTADO`.
    if (!houveResultado && religamentos >= RELIGAMENTOS_SEM_RESULTADO) {
      rebaixarDitadoNativo();
      encerrar();
      return;
    }
    // Corte por silêncio: religa enquanto o usuário não pediu parada.
    if (!pedidoDeParada && !encerrado && religamentos < MAX_RELIGAMENTOS) {
      religamentos++;
      try {
        rec.start();
        return;
      } catch {
        /* alguns navegadores recusam o religamento — aí a sessão acaba */
      }
    }
    encerrar();
  };

  try {
    rec.start();
  } catch {
    // `start()` fora de gesto do usuário, ou duas sessões ao mesmo tempo.
    rebaixarDitadoNativo();
    opts.onFalha("provedor_indisponivel");
    return null;
  }

  return {
    parar() {
      pedidoDeParada = true;
      try {
        rec.stop();
      } catch {
        encerrar();
      }
    },
    cancelar() {
      pedidoDeParada = true;
      try {
        rec.abort();
      } catch {
        /* já parado */
      }
      encerrar();
    },
  };
}

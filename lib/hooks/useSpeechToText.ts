// ─── useSpeechToText ─────────────────────────────────────────────────────────
// O microfone do BRIEFING PÚBLICO (`PublicBriefingRoom`) e do chat do portal
// (`PortalChat`).
// A interface antiga continua inteira (`isListening` · `isTranscribing` ·
// `isSupported` · `error` · `startListening` · `stopListening`); o que entrou é
// aditivo (`modo` · `segundos`), então nenhuma tela precisou mudar para
// continuar funcionando.
//
// ─── 06/08/2026 · O CHROME DO iPHONE É O CASO MAJORITÁRIO, NÃO A SOBRA ───────
// Recado do CEO: "todo mundo usa o Chrome". No iPhone isso tem uma consequência
// que muda a prioridade inteira deste arquivo: **no iOS todo navegador é
// WebKit** (a App Store obriga), e o `SpeechRecognition` é exposto só pelo
// Safari. Ou seja: no Chrome do iPhone o caminho 1 (nativo) NÃO EXISTE, e quem
// atende o dono e a maioria dos prospects é o caminho 2 — gravar e enviar.
//
// Os dois caminhos continuam, nesta ordem:
//   1. NATIVO (`lib/ai/ditado-nativo.ts`) — texto durante a fala, sem chave,
//      sem custo, e o áudio nem chega ao nosso servidor. Safari, Chrome de
//      desktop, Android.
//   2. ENVIO (`/api/sdr/transcribe`) — grava e manda transcrever, provedor
//      substituível. Chrome/Edge/Firefox do iPhone caem AQUI, sempre.
//
// ─── O QUE ESTAVA QUEBRADO NO CAMINHO 2, E ONDE ──────────────────────────────
// Este hook era uma SEGUNDA implementação de gravar-e-enviar, escrita à mão ao
// lado da que já existia em `components/portal/Ditado.tsx`. Ele divergiu, e a
// divergência caía toda no iPhone. O que estava errado, separando o que foi
// MEDIDO do que era dívida latente — porque afirmar o que não se provou é o
// mesmo defeito que estamos consertando:
//
//   MEDIDO (emulação das regras do WebKit no Chromium, 06/08/2026):
//   • o rótulo do botão dizia "Ouvindo" no caminho de ENVIO, onde não se ouve
//     nada ao vivo: o texto só chega depois de parar. No Chrome do iPhone o
//     prospect ficava esperando, na tela de conversão da agência, um texto que
//     por desenho não vinha antes dele parar;
//   • blob curto voltava `return` calado. Toque acidental e falha real ficavam
//     exatamente iguais na tela: nada;
//   • no chat do PORTAL, `error` nem era lido — falha de microfone na tela de
//     quem paga não deixava rastro nenhum.
//
//   DÍVIDA LATENTE (lida no código, não reproduzida):
//   • forçava `{ mimeType: "audio/webm" }` sempre que a engine dissesse que
//     aceita webm, ignorando `mimeDeGravacaoSuportado()`. Com a flag de WebM do
//     WebKit desligada isso não quebrava (caía no padrão do aparelho, que é
//     MP4 — e foi o que a emulação mostrou); com ela ligada, gravava WebM num
//     escritor cujo caminho de casa é MP4;
//   • `new MediaRecorder(...)` e `.start()` sem `try`, dentro de um
//     `void gravarEEnviar()`: qualquer exceção viraria promessa rejeitada e
//     SUMIRIA — toque no microfone sem gravação e sem frase de erro;
//   • sem corte de duração e sem teto de bytes numa rota PÚBLICA e paga.
//
// O conserto não foi remendar: foi passar a usar a camada
// (`mimeDeGravacaoSuportado` · `enviarAudioParaTranscricao` ·
// `MIN_BYTES_DE_AUDIO` · `MAX_SEGUNDOS_DE_GRAVACAO`), que é onde as regras já
// moravam. Cópia divergente foi a causa; parar de ter cópia é o conserto.
//
// A MENSAGEM DIZ A CAUSA. Formato recusado não vira "verifique a permissão" —
// isso já foi consertado uma vez neste produto (DESIGN.md, I-22) e não regride.
//
// PII: o texto reconhecido é fala de quem preenche o briefing. Nunca é logado.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useRef, useCallback, useEffect } from "react";
import {
  suportaDitadoNativo,
  assinarDitadoNativo,
  iniciarDitadoNativo,
  type SessaoDeDitadoNativo,
} from "@/lib/ai/ditado-nativo";
import {
  falhaDeTranscricao,
  suportaDitado,
  mimeDeGravacaoSuportado,
  enviarAudioParaTranscricao,
  MIN_BYTES_DE_AUDIO,
  MAX_SEGUNDOS_DE_GRAVACAO,
} from "@/lib/ai/transcricao";

interface UseSpeechToTextOptions {
  onTranscript: (text: string) => void;
  lang?: string;
}

export interface UseSpeechToTextReturn {
  isListening: boolean;
  isTranscribing: boolean;
  isSupported: boolean;
  error: string | null;
  /**
   * Qual caminho está ATIVO agora — e a tela precisa disso para não mentir.
   * No nativo o texto aparece enquanto se fala ("Ouvindo"); no envio ele só
   * chega depois de parar ("Gravando · toque para transcrever"). Chamar os dois
   * de "Ouvindo" faz o usuário do iPhone esperar um texto ao vivo que não vem.
   */
  modo: "nativo" | "envio" | null;
  /** Segundos do trecho em andamento. Existe porque há corte automático. */
  segundos: number;
  /**
   * Quando `isSupported` é falso, POR QUÊ — já em português, vindo da camada.
   *
   * São duas causas com donos opostos: o navegador não grava (é do usuário) ou
   * a agência não tem provedor configurado (é nosso). A tela dizia "indisponível
   * neste navegador" para as duas, mandando o prospect desconfiar do aparelho
   * dele por causa de uma pendência nossa — o mesmo defeito do I-22.
   */
  mensagemIndisponivel: string | null;
  startListening: () => void;
  stopListening: () => void;
}

export function useSpeechToText({
  onTranscript,
  lang = "pt-BR",
}: UseSpeechToTextOptions): UseSpeechToTextReturn {
  const [isListening,    setIsListening]    = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [error,          setError]          = useState<string | null>(null);
  const [modo,           setModo]           = useState<"nativo" | "envio" | null>(null);
  const [segundos,       setSegundos]       = useState(0);

  // Os dois caminhos, detectados separadamente.
  const [temNativo,   setTemNativo]   = useState(false);
  const [podeGravar,  setPodeGravar]  = useState(false);
  /** null = ainda não perguntamos ao servidor. */
  const [temProvedor, setTemProvedor] = useState<boolean | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef        = useRef<Blob[]>([]);
  const sessaoRef        = useRef<SessaoDeDitadoNativo | null>(null);
  const onTranscriptRef  = useRef(onTranscript);
  useEffect(() => { onTranscriptRef.current = onTranscript; }, [onTranscript]);

  // Detecção só no cliente (o servidor renderiza sem microfone), e o nativo
  // pode ser REBAIXADO em runtime — por isso a assinatura.
  useEffect(() => {
    const ler = () => setTemNativo(suportaDitadoNativo());
    ler();
    // `suportaDitado()` da camada, não uma condição escrita aqui. A que estava
    // aqui olhava só `getUserMedia` e ESQUECIA o `MediaRecorder` — então um
    // navegador que capta áudio mas não sabe gravar (iOS anterior ao 14.3, por
    // exemplo) recebia o botão, gravava… e só falhava no FIM. Oferecer um
    // caminho para descobrir no fim que ele não existe é a coisa exata que a
    // detecção deveria impedir.
    setPodeGravar(suportaDitado());
    return assinarDitadoNativo(ler);
  }, []);

  // Só quem NÃO tem nativo pergunta ao servidor se o caminho 2 existe. Quem tem
  // nativo não toca no servidor nem para perguntar.
  useEffect(() => {
    if (temNativo || !podeGravar || temProvedor !== null) return;
    let vivo = true;
    void fetch("/api/sdr/transcribe")
      .then((r) => r.json() as Promise<{ disponivel?: boolean }>)
      .then((d) => { if (vivo) setTemProvedor(!!d?.disponivel); })
      // Sem resposta, assumimos que existe: o teste real é gravar. Esconder o
      // microfone por causa de um GET que falhou seria tirar o que funciona.
      .catch(() => { if (vivo) setTemProvedor(true); });
    return () => { vivo = false; };
  }, [temNativo, podeGravar, temProvedor]);

  const isSupported = temNativo || (podeGravar && temProvedor !== false);
  const mensagemIndisponivel = isSupported
    ? null
    : falhaDeTranscricao(podeGravar ? "sem_chave" : "sem_suporte").mensagem;

  useEffect(() => () => {
    sessaoRef.current?.cancelar();
    sessaoRef.current = null;
    const mr = mediaRecorderRef.current;
    if (mr && mr.state === "recording") {
      mr.onstop = null;
      try { mr.stop(); } catch { /* já parado */ }
      mr.stream.getTracks().forEach((t) => t.stop());
    }
  }, []);

  const stopListening = useCallback(() => {
    if (sessaoRef.current) { sessaoRef.current.parar(); return; }
    const mr = mediaRecorderRef.current;
    if (mr && mr.state === "recording") {
      try { mr.stop(); } catch { /* já parado */ } // → onstop → upload
    }
  }, []);

  // Relógio do trecho em andamento.
  useEffect(() => {
    if (!isListening) return;
    const id = setInterval(() => setSegundos((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [isListening]);

  // Corte automático. O microfone aberto no bolso é custo numa rota PÚBLICA e
  // upload que não termina no 4G. Cortar PARA a gravação — não descarta nada.
  useEffect(() => {
    if (isListening && segundos >= MAX_SEGUNDOS_DE_GRAVACAO) stopListening();
  }, [isListening, segundos, stopListening]);

  // ─── Caminho 2: gravar e enviar ────────────────────────────────────────────
  const gravarEEnviar = useCallback(async () => {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      // Negar o microfone é escolha legítima — e é o ÚNICO caso que merece a
      // frase de permissão.
      setError(falhaDeTranscricao("sem_permissao").mensagem);
      return;
    }

    const encerrarStream = () => stream.getTracks().forEach((t) => t.stop());

    // A preferência de contêiner acompanha a engine (WebKit → MP4/AAC), e
    // `null` significa "deixe o navegador escolher" — que no iPhone é
    // exatamente o que queremos.
    const mime = mimeDeGravacaoSuportado();
    let mr: MediaRecorder;
    try {
      mr = new MediaRecorder(stream, mime ? { mimeType: mime } : {});
    } catch {
      // O construtor lança `NotSupportedError` para contêiner recusado e
      // `InvalidStateError` quando o stream não serve. Antes isso viraria
      // silêncio (promessa rejeitada dentro de um `void`); agora vira frase — e
      // a frase fala do APARELHO, nunca de permissão.
      encerrarStream();
      setError(falhaDeTranscricao("gravacao_falhou").mensagem);
      return;
    }

    mediaRecorderRef.current = mr;
    chunksRef.current = [];

    mr.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    mr.onstop = async () => {
      setIsListening(false);
      setModo(null);
      encerrarStream(); // apaga a luz do microfone

      // O tipo real vem do gravador, não do nosso palpite: no iPhone ele volta
      // `audio/mp4` mesmo quando pedimos outra coisa.
      const tipo = mr.mimeType || mime || "audio/webm";
      const blob = new Blob(chunksRef.current, { type: tipo });
      chunksRef.current = [];
      mediaRecorderRef.current = null;

      if (blob.size < MIN_BYTES_DE_AUDIO) {
        // Antes: `return` calado. Toque acidental e falha real ficavam iguais.
        setError(falhaDeTranscricao("audio_curto").mensagem);
        return;
      }

      setIsTranscribing(true);
      // Um só caminho de envio para as quatro superfícies: ele já trava bytes,
      // já traduz o motivo e nunca lança.
      const r = await enviarAudioParaTranscricao(blob, { endpoint: "/api/sdr/transcribe" });
      setIsTranscribing(false);

      if (r.ok) { onTranscriptRef.current(r.texto); return; }
      if (r.motivo === "sem_chave") {
        // A casa não tem provedor nenhum: o caminho 2 não existe. Some o
        // microfone em vez de oferecer de novo o que já falhou.
        setTemProvedor(false);
      }
      // A frase vem pronta da camada — ela distingue chave recusada, conta sem
      // saldo, ritmo, áudio recusado e provedor fora do ar. Reescrever aqui
      // seria voltar a ter uma palavra só para cinco consertos.
      setError(r.mensagem);
    };

    try {
      mr.start();
    } catch {
      encerrarStream();
      mediaRecorderRef.current = null;
      setError(falhaDeTranscricao("gravacao_falhou").mensagem);
      return;
    }

    setSegundos(0);
    setModo("envio");
    setIsListening(true);
  }, []);

  const startListening = useCallback(() => {
    if (sessaoRef.current || mediaRecorderRef.current?.state === "recording") return;
    setError(null);

    // ─── Caminho 1: nativo ───────────────────────────────────────────────────
    if (suportaDitadoNativo()) {
      const sessao = iniciarDitadoNativo({
        idioma: lang,
        onFinal: (t) => onTranscriptRef.current(t),
        onFim: () => { sessaoRef.current = null; setIsListening(false); setModo(null); },
        onFalha: (motivo) => setError(falhaDeTranscricao(motivo).mensagem),
      });
      if (sessao) {
        sessaoRef.current = sessao;
        setSegundos(0);
        setModo("nativo");
        setIsListening(true);
        return;
      }
      // O nativo se rebaixou na largada — cai para o envio nesta mesma ação.
      setTemNativo(false);
    }

    if (!podeGravar) {
      setError(falhaDeTranscricao("sem_suporte").mensagem);
      return;
    }
    void gravarEEnviar();
  }, [lang, podeGravar, gravarEEnviar]);

  return {
    isListening,
    isTranscribing,
    isSupported,
    error,
    modo,
    segundos,
    mensagemIndisponivel,
    startListening,
    stopListening,
  };
}

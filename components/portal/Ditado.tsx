"use client";

// DITADO POR VOZ — falar em vez de digitar. Um componente, dois lugares.
//
// Pedido do CEO em 05/08/2026, duas vezes: primeiro na devolutiva da aprovação
// ("eu não gosto de digitar"), depois na solicitação de serviço ("não tem o
// microfone de novo"). A segunda vez é a razão deste arquivo existir: o ditado
// nasceu dentro de `AprovacoesDoCliente` e não tinha como ser reusado — e a
// consequência foi um formulário novo nascer sem microfone.
//
// ─── 06/08/2026 · DOIS CAMINHOS, NESTA ORDEM ────────────────────────────────
// Pergunta do CEO: "não tem como usar algum microfone sem usar OpenAI?".
//   1. NATIVO — `SpeechRecognition` do navegador (`lib/ai/ditado-nativo.ts`).
//      Grátis, sem chave, o texto aparece ENQUANTO se fala, e o áudio nem sai
//      do aparelho. É o caminho do iPhone do dono e do Chrome.
//   2. ENVIO — gravar e mandar para transcrever (`lib/ai/transcricao.ts`), com
//      provedor substituível. Só para quem não tem o caminho 1.
// Nenhum dos dois? O botão de gravar NÃO aparece — e, quando o navegador até
// gravaria mas a casa não tem provedor nenhum configurado, a tela DIZ isso em
// uma linha. Fingir um microfone que não existe é pior que não ter microfone.
//
// TRÊS TRAVAS que o pedido carrega e que nenhum uso pode afrouxar:
//   1. Falar PREENCHE o campo. Enviar continua sendo um clique separado — nada
//      sai da mão do cliente sozinho.
//   2. O texto é EDITÁVEL: a transcrição cai no mesmo campo e ele corrige antes
//      de mandar. Transcrição erra; mandar erro em nome da agência é criar
//      mal-entendido.
//   3. Falha de ditado NUNCA bloqueia: o campo de texto continua inteiro.

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  suportaDitado,
  mimeDeGravacaoSuportado,
  enviarAudioParaTranscricao,
  falhaDeTranscricao,
  MIN_BYTES_DE_AUDIO,
  MAX_SEGUNDOS_DE_GRAVACAO,
} from "@/lib/ai/transcricao";
import {
  suportaDitadoNativo,
  assinarDitadoNativo,
  iniciarDitadoNativo,
  type SessaoDeDitadoNativo,
} from "@/lib/ai/ditado-nativo";

type EstadoDoDitado = "ocioso" | "ouvindo" | "gravando" | "transcrevendo";
/** Qual dos dois caminhos esta tela tem AGORA. */
type Caminho = "nativo" | "envio" | "verificando" | "sem_provedor" | "sem_suporte";

const NADA = () => () => {};

function useDitado({ token, onTexto }: { token: string; onTexto: (texto: string) => void }) {
  const [estado, setEstado] = useState<EstadoDoDitado>("ocioso");
  const [segundos, setSegundos] = useState(0);
  const [falha, setFalha] = useState<string | null>(null);
  const [parcial, setParcial] = useState("");

  const gravadorRef = useRef<MediaRecorder | null>(null);
  const pedacosRef = useRef<Blob[]>([]);
  const sessaoRef = useRef<SessaoDeDitadoNativo | null>(null);
  // O callback vive num ref porque `gravador.onstop` é registrado uma vez e
  // dispara minutos depois — sem isto, ele chamaria a versão antiga da função.
  // A sincronia vai num efeito, não no corpo do render: escrever em ref durante
  // o render é o tipo de coisa que funciona até o dia em que o React resolve
  // renderizar duas vezes.
  const onTextoRef = useRef(onTexto);
  useEffect(() => { onTextoRef.current = onTexto; }, [onTexto]);

  // Suporte só é sabido no navegador — e o servidor precisa renderizar a mesma
  // coisa que o primeiro render do cliente, ou dá erro de hidratação. Por isso
  // a leitura vem de fora do React (`useSyncExternalStore`) com instantâneo de
  // servidor `false`. O nativo tem assinatura DE VERDADE porque ele pode ser
  // REBAIXADO em runtime (o reconhecimento do Chrome depende de um serviço
  // remoto); o de gravação não muda, então segue com assinatura vazia.
  const temNativo = useSyncExternalStore(assinarDitadoNativo, suportaDitadoNativo, () => false);
  const podeGravar = useSyncExternalStore(NADA, suportaDitado, () => false);

  // O caminho 2 depende de a AGÊNCIA ter provedor configurado — pergunta que só
  // o servidor responde. Perguntamos uma vez, e só quando o nativo não existe:
  // quem tem nativo nunca toca no servidor (nem para perguntar).
  const [envioDisponivel, setEnvioDisponivel] = useState<boolean | null>(null);
  useEffect(() => {
    if (temNativo || !podeGravar || envioDisponivel !== null) return;
    let vivo = true;
    const url = token ? `/api/portal/transcricao?token=${encodeURIComponent(token)}` : "/api/portal/transcricao";
    void fetch(url)
      .then((r) => r.json() as Promise<{ disponivel?: boolean }>)
      .then((d) => { if (vivo) setEnvioDisponivel(!!d?.disponivel); })
      // Sem resposta, assumimos que existe: o teste real é gravar. Errar para o
      // lado de esconder o botão tiraria o microfone de quem o tem.
      .catch(() => { if (vivo) setEnvioDisponivel(true); });
    return () => { vivo = false; };
  }, [temNativo, podeGravar, envioDisponivel, token]);

  const caminho: Caminho = temNativo
    ? "nativo"
    : !podeGravar
      ? "sem_suporte"
      : envioDisponivel === null
        ? "verificando"
        : envioDisponivel
          ? "envio"
          : "sem_provedor";

  const parar = useCallback(() => {
    if (sessaoRef.current) { sessaoRef.current.parar(); return; }
    const g = gravadorRef.current;
    if (g && g.state === "recording") g.stop(); // dispara onstop → transcrição
  }, []);

  useEffect(() => {
    if (estado !== "gravando" && estado !== "ouvindo") return;
    const id = setInterval(() => setSegundos((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [estado]);

  // Corte automático: o celular no bolso com o microfone aberto vira custo e
  // upload que não termina no 4G. Cortar PARA a gravação — não envia nada.
  useEffect(() => {
    if ((estado === "gravando" || estado === "ouvindo") && segundos >= MAX_SEGUNDOS_DE_GRAVACAO) parar();
  }, [estado, segundos, parar]);

  // Sair da tela com o microfone aberto deixaria a luz do mic acesa no aparelho.
  useEffect(() => () => {
    sessaoRef.current?.cancelar();
    sessaoRef.current = null;
    const g = gravadorRef.current;
    if (g && g.state === "recording") {
      g.onstop = null;
      try { g.stop(); } catch { /* já parado */ }
      g.stream.getTracks().forEach((t) => t.stop());
    }
  }, []);

  // ─── Caminho 1: reconhecimento nativo ──────────────────────────────────────
  const ouvir = useCallback(() => {
    if (sessaoRef.current) return;
    setFalha(null);
    setParcial("");

    const sessao = iniciarDitadoNativo({
      idioma: "pt-BR",
      onParcial: setParcial,
      onFinal: (t) => { setParcial(""); onTextoRef.current(t); },
      onFim: () => {
        sessaoRef.current = null;
        setParcial("");
        setEstado("ocioso");
      },
      onFalha: (motivo) => setFalha(falhaDeTranscricao(motivo).mensagem),
    });

    if (!sessao) {
      // O nativo caiu na largada — o módulo já se rebaixou, então o próximo
      // toque usa o caminho 2. A tela só precisa dizer "tente de novo".
      setEstado("ocioso");
      return;
    }
    sessaoRef.current = sessao;
    setSegundos(0);
    setEstado("ouvindo");
  }, []);

  // ─── Caminho 2: gravar e enviar ────────────────────────────────────────────
  const gravar = useCallback(async () => {
    if (gravadorRef.current?.state === "recording") return;
    setFalha(null);

    if (!suportaDitado()) {
      setFalha(falhaDeTranscricao("sem_suporte").mensagem);
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      // Negar o microfone é escolha legítima — vira frase, nunca erro cru.
      setFalha(falhaDeTranscricao("sem_permissao").mensagem);
      return;
    }

    const mime = mimeDeGravacaoSuportado();
    let gravador: MediaRecorder;
    try {
      gravador = new MediaRecorder(stream, mime ? { mimeType: mime } : {});
    } catch {
      stream.getTracks().forEach((t) => t.stop());
      setFalha(falhaDeTranscricao("sem_suporte").mensagem);
      return;
    }

    gravadorRef.current = gravador;
    pedacosRef.current = [];

    gravador.ondataavailable = (e) => {
      if (e.data.size > 0) pedacosRef.current.push(e.data);
    };

    gravador.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop()); // apaga a luz do microfone
      const blob = new Blob(pedacosRef.current, { type: gravador.mimeType || "audio/webm" });
      pedacosRef.current = [];
      gravadorRef.current = null;

      if (blob.size < MIN_BYTES_DE_AUDIO) {
        setEstado("ocioso");
        setFalha(falhaDeTranscricao("audio_curto").mensagem);
        return;
      }

      setEstado("transcrevendo");
      const r = await enviarAudioParaTranscricao(blob, {
        endpoint: "/api/portal/transcricao",
        // Token vazio = modo cookie (A4): a credencial viaja no cookie httpOnly.
        campos: { token },
      });
      setEstado("ocioso");
      if (r.ok) onTextoRef.current(r.texto);
      else {
        setFalha(r.mensagem);
        // Provedor fora do ar não é culpa do áudio: se a casa perdeu o caminho
        // 2, a tela deixa de oferecer o botão na próxima vez.
        if (r.motivo === "sem_chave") setEnvioDisponivel(false);
      }
    };

    try {
      gravador.start();
    } catch {
      stream.getTracks().forEach((t) => t.stop());
      setFalha(falhaDeTranscricao("sem_suporte").mensagem);
      return;
    }
    setSegundos(0);
    setEstado("gravando");
  }, [token]);

  const acionar = useCallback(() => {
    if (estado === "ouvindo" || estado === "gravando") { parar(); return; }
    if (estado === "transcrevendo") return;
    if (suportaDitadoNativo()) ouvir();
    else void gravar();
  }, [estado, parar, ouvir, gravar]);

  return { caminho, estado, segundos, falha, parcial, acionar };
}

function relogio(s: number): string {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function IconeDeMicrofone() {
  return (
    <svg width="17" height="17" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="5.5" y="1.5" width="5" height="8" rx="2.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M3 8a5 5 0 0010 0" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M8 13v1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function BotaoDeDitado({
  token,
  desabilitado,
  onTexto,
  rotulo = "Falar em vez de digitar",
}: {
  token: string;
  desabilitado: boolean;
  onTexto: (texto: string) => void;
  /** O que o botão diz. Muda entre "responder" e "pedir" — o verbo certo no
   *  contexto certo é o que faz o cliente entender que pode falar. */
  rotulo?: string;
}) {
  const { caminho, estado, segundos, falha, parcial, acionar } = useDitado({ token, onTexto });

  // Degradação declarada: sem suporte a gravação nem a reconhecimento, o botão
  // simplesmente não existe — e o textarea acima continua sendo o caminho
  // inteiro. Enquanto a resposta do servidor não chega, também não piscamos um
  // botão que pode não existir.
  if (caminho === "sem_suporte" || caminho === "verificando") return null;

  // O navegador gravaria, mas a casa não tem provedor de transcrição. Isto é uma
  // FRASE, não um botão morto: o cliente merece saber por que não há microfone.
  if (caminho === "sem_provedor") {
    return (
      <p className="mt-2 text-[12px] text-[var(--text-muted)]">
        O ditado por voz não está disponível neste navegador. Escreva no campo acima — nada se perde.
      </p>
    );
  }

  const ouvindo = estado === "ouvindo";
  const gravando = estado === "gravando";
  const transcrevendo = estado === "transcrevendo";
  const ativo = ouvindo || gravando;

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={acionar}
        disabled={desabilitado || transcrevendo}
        aria-live="polite"
        aria-pressed={ativo}
        style={{ touchAction: "manipulation" }}
        className={`w-full sm:w-auto h-12 sm:h-11 px-4 rounded-[10px] text-[13.5px] font-semibold inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-50 ${
          ativo
            ? "bg-[var(--danger)] text-white"
            : "bg-white border border-[var(--border-strong)] text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]"
        }`}
      >
        {ouvindo ? (
          <>
            <span aria-hidden className="w-2.5 h-2.5 rounded-full bg-white animate-pulse" />
            Ouvindo · toque para parar · {relogio(segundos)}
          </>
        ) : gravando ? (
          <>
            <span aria-hidden className="w-2.5 h-2.5 rounded-full bg-white animate-pulse" />
            Parar e transcrever · {relogio(segundos)}
          </>
        ) : transcrevendo ? (
          <>
            <span aria-hidden className="flex gap-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-muted)] animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-muted)] animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-muted)] animate-bounce" style={{ animationDelay: "300ms" }} />
            </span>
            Transcrevendo o áudio…
          </>
        ) : (
          <>
            <IconeDeMicrofone />
            {rotulo}
          </>
        )}
      </button>

      {ativo && (
        <p className="text-[12px] text-[var(--text-secondary)] mt-1.5">
          Fale à vontade — o texto cai no campo acima e <b>você revisa antes de enviar</b>.
        </p>
      )}

      {/* Eco do que está sendo reconhecido: prova viva de que o microfone está
          ouvindo. Só existe no caminho nativo, e some quando o trecho fecha. */}
      {ouvindo && parcial && (
        <p aria-hidden className="text-[12.5px] text-[var(--text-muted)] italic mt-1 line-clamp-2">
          {parcial}…
        </p>
      )}

      {falha && (
        <p role="alert" className="text-[12.5px] font-semibold text-[var(--danger)] mt-1.5">{falha}</p>
      )}
    </div>
  );
}

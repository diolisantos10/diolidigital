"use client";

// DITADO POR VOZ — falar em vez de digitar. Um componente, dois lugares.
//
// Pedido do CEO em 05/08/2026, duas vezes: primeiro na devolutiva da aprovação
// ("eu não gosto de digitar"), depois na solicitação de serviço ("não tem o
// microfone de novo"). A segunda vez é a razão deste arquivo existir: o ditado
// nasceu dentro de `AprovacoesDoCliente` e não tinha como ser reusado — e a
// consequência foi um formulário novo nascer sem microfone.
//
// TRÊS TRAVAS que o pedido carrega e que nenhum uso pode afrouxar:
//   1. Falar PREENCHE o campo. Enviar continua sendo um clique separado — nada
//      sai da mão do cliente sozinho.
//   2. O texto é EDITÁVEL: a transcrição cai no mesmo campo e ele corrige antes
//      de mandar. Transcrição erra; mandar erro em nome da agência é criar
//      mal-entendido.
//   3. Falha de ditado NUNCA bloqueia: o campo de texto continua inteiro. Sem
//      suporte, o botão não existe — botão que não faz nada é pior que ausente.

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  suportaDitado,
  mimeDeGravacaoSuportado,
  enviarAudioParaTranscricao,
  falhaDeTranscricao,
  MIN_BYTES_DE_AUDIO,
  MAX_SEGUNDOS_DE_GRAVACAO,
} from "@/lib/ai/transcricao";

type EstadoDoDitado = "ocioso" | "gravando" | "transcrevendo";

function useDitado({ token, onTexto }: { token: string; onTexto: (texto: string) => void }) {
  const [estado, setEstado] = useState<EstadoDoDitado>("ocioso");
  const [segundos, setSegundos] = useState(0);
  const [falha, setFalha] = useState<string | null>(null);

  const gravadorRef = useRef<MediaRecorder | null>(null);
  const pedacosRef = useRef<Blob[]>([]);
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
  // servidor `false`, em vez de um estado que muda logo depois de montar: o
  // valor nunca muda em runtime, então não há o que assinar.
  const suportado = useSyncExternalStore(
    () => () => {},
    () => suportaDitado(),
    () => false,
  );

  const parar = useCallback(() => {
    const g = gravadorRef.current;
    if (g && g.state === "recording") g.stop(); // dispara onstop → transcrição
  }, []);

  useEffect(() => {
    if (estado !== "gravando") return;
    const id = setInterval(() => setSegundos((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [estado]);

  // Corte automático: o celular no bolso com o microfone aberto vira custo e
  // upload que não termina no 4G. Cortar PARA a gravação — não envia nada.
  useEffect(() => {
    if (estado === "gravando" && segundos >= MAX_SEGUNDOS_DE_GRAVACAO) parar();
  }, [estado, segundos, parar]);

  // Sair da tela com o microfone aberto deixaria a luz do mic acesa no aparelho.
  useEffect(() => () => {
    const g = gravadorRef.current;
    if (g && g.state === "recording") {
      g.onstop = null;
      try { g.stop(); } catch { /* já parado */ }
      g.stream.getTracks().forEach((t) => t.stop());
    }
  }, []);

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
      else setFalha(r.mensagem);
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

  return { suportado, estado, segundos, falha, gravar, parar };
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
  const { suportado, estado, segundos, falha, gravar, parar } = useDitado({ token, onTexto });

  // Degradação declarada: sem suporte a gravação, o botão simplesmente não
  // existe — e o textarea acima continua sendo o caminho inteiro.
  if (!suportado) return null;

  const gravando = estado === "gravando";
  const transcrevendo = estado === "transcrevendo";

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => { if (gravando) parar(); else if (!transcrevendo) void gravar(); }}
        disabled={desabilitado || transcrevendo}
        aria-live="polite"
        style={{ touchAction: "manipulation" }}
        className={`w-full sm:w-auto h-12 sm:h-11 px-4 rounded-[10px] text-[13.5px] font-semibold inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-50 ${
          gravando
            ? "bg-[var(--danger)] text-white"
            : "bg-white border border-[var(--border-strong)] text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]"
        }`}
      >
        {gravando ? (
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

      {gravando && (
        <p className="text-[12px] text-[var(--text-secondary)] mt-1.5">
          Fale à vontade — o texto cai no campo acima e <b>você revisa antes de enviar</b>.
        </p>
      )}

      {falha && (
        <p role="alert" className="text-[12.5px] font-semibold text-[var(--danger)] mt-1.5">{falha}</p>
      )}
    </div>
  );
}

"use client";

// EnvioDeMaterial — a aba de Materiais deixa de mentir.
//
// Até 02/08/2026 o sistema mandava ao cliente, por escrito, "é só enviar na aba
// Materiais aqui do portal" — e a aba tinha só um botão "Conectar Drive"
// desabilitado com um "em breve". Promessa quebrada em nome da agência, na
// primeira mensagem depois do pagamento, para quem já disse que não sabe mexer
// em tecnologia.
//
// Aqui não há conta para criar, link para gerar, nem serviço de terceiro: o
// cliente escolhe do celular e pronto. É o caminho que a dona do salão consegue
// percorrer sozinha, que era o teste.

import { useState, useRef } from "react";

interface ArquivoEnviado {
  id: string;
  fileName: string;
  sizeBytes: number;
  url: string;
}

function tamanhoLegivel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function EnvioDeMaterial({
  token,
  aoEnviar,
}: {
  token: string;
  /** Avisa a tela de fora que chegou material novo — para o portal poder
   *  atualizar a lista de pendências sem o cliente recarregar a página. */
  aoEnviar?: (arquivo: ArquivoEnviado) => void;
}) {
  const [enviando, setEnviando] = useState(false);
  const [enviados, setEnviados] = useState<ArquivoEnviado[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [arrastando, setArrastando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function enviar(lista: FileList | File[]) {
    const arquivos = Array.from(lista);
    if (arquivos.length === 0) return;
    setErro(null);
    setEnviando(true);

    // Um de cada vez, de propósito: vídeo de celular é grande, e mandar cinco
    // em paralelo de uma rede de celular derruba os cinco.
    for (const arquivo of arquivos) {
      const form = new FormData();
      form.append("file", arquivo);
      // A4: sem token (URL limpa), o cookie httpOnly vai junto do fetch.
      if (token) form.append("token", token);
      try {
        const res = await fetch("/api/media", { method: "POST", body: form });
        const dados = await res.json();
        if (!res.ok) {
          // A mensagem vem do servidor já em linguagem de gente.
          setErro(dados.error ?? "Não consegui enviar esse arquivo.");
          continue;
        }
        setEnviados((atual) => [...atual, dados.arquivo]);
        aoEnviar?.(dados.arquivo);
      } catch {
        setErro("A conexão caiu no meio do envio. Tente de novo — o que já subiu não se perde.");
      }
    }
    setEnviando(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="bg-white rounded-[14px] border border-[var(--border)] p-5 shadow-[0_1px_3px_rgba(7,10,31,0.04)]">
      <h3 className="text-[14px] font-semibold text-[var(--text-primary)]">Enviar fotos e vídeos</h3>
      <p className="mt-0.5 text-[12px] leading-snug text-[var(--text-secondary)]">
        Escolha do seu celular ou computador. Aceita foto, vídeo, PDF e documento — até 120 MB cada.
      </p>

      <div
        onDragOver={(e) => { e.preventDefault(); setArrastando(true); }}
        onDragLeave={() => setArrastando(false)}
        onDrop={(e) => { e.preventDefault(); setArrastando(false); void enviar(e.dataTransfer.files); }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") inputRef.current?.click(); }}
        className={`mt-3 cursor-pointer rounded-[12px] border-2 border-dashed px-4 py-7 text-center transition-colors ${
          arrastando ? "border-[#12B5AC] bg-[#12B5AC]/5" : "border-[var(--border)] hover:border-[#12B5AC]"
        }`}
      >
        <p className="text-[14px] font-semibold text-[var(--text-primary)]">
          {enviando ? "Enviando…" : "Toque para escolher os arquivos"}
        </p>
        <p className="mt-0.5 text-[12px] text-[var(--text-secondary)]">ou arraste e solte aqui</p>
      </div>

      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        accept="image/*,video/*,application/pdf,.docx,.pptx,.txt,.csv"
        onChange={(e) => { if (e.target.files) void enviar(e.target.files); }}
      />

      {erro && (
        <p className="mt-3 rounded-[8px] bg-[#FEF2F2] px-3 py-2 text-[12px] text-[#B91C1C]">{erro}</p>
      )}

      {enviados.length > 0 && (
        <div className="mt-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[var(--text-muted)]">
            Recebemos {enviados.length} {enviados.length === 1 ? "arquivo" : "arquivos"}
          </p>
          <ul className="mt-2 space-y-1.5">
            {enviados.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 rounded-[8px] bg-[#F7F7F6] px-3 py-2">
                <span className="min-w-0 flex-1 truncate text-[12.5px] text-[var(--text-primary)]">{a.fileName}</span>
                <span className="shrink-0 text-[11px] text-[var(--text-muted)]">{tamanhoLegivel(a.sizeBytes)}</span>
                <span className="shrink-0 text-[13px] text-[var(--teal-text)]" aria-label="enviado">✓</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[12px] text-[var(--text-secondary)]">
            A equipe já foi avisada. Pode fechar esta página — não perde nada.
          </p>
        </div>
      )}
    </div>
  );
}

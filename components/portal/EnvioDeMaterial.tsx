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
//
// ── 08/08/2026: A TELA PASSA A PERGUNTAR O QUE É CADA ARQUIVO ───────────────
//
// O defeito que isto fecha: o arquivo subia, o sistema dizia "recebido", a
// equipe era avisada — e a peça continuava saindo com o nome do cliente escrito
// em fonte comum, com o logo real já gravado no disco. Faltava o meio da ponte:
// ninguém nunca perguntava O QUE era o arquivo, e sem papel declarado
// `materiaisDeMarca()` não deixa nada entrar numa peça.
//
// **O papel é pedido AQUI, na hora do envio** — não numa segunda tela "depois".
// Buraco deixado para depois é buraco que fica: o cliente já foi embora.
//
// A casa PALPITA pelo nome do arquivo (`sugerirPapel`) só para o campo já vir
// marcado, e o palpite nunca autoriza sozinho — quem confirma é quem enviou.
// Quando o nome não diz nada ("IMG_2831.jpg") o campo vem VAZIO de propósito:
// ver o cliente escolher é melhor que ver "Foto de produto" preenchido por acaso
// e o botão clicado sem ler.

import { useState, useRef } from "react";
import { PAPEIS, PAPEIS_VALIDOS, sugerirPapel, type Papel } from "@/lib/integrations/google/escolha-de-material";

interface ArquivoEnviado {
  id: string;
  fileName: string;
  sizeBytes: number;
  url: string;
  /** O papel com que ele entrou — quando entrou como material de marca. */
  papel?: Papel;
}

/** Um arquivo escolhido, esperando o cliente dizer o que é. */
interface NaFila {
  arquivo: File;
  papel: Papel | "";
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
  const [fila, setFila] = useState<NaFila[]>([]);
  const [enviados, setEnviados] = useState<ArquivoEnviado[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [arrastando, setArrastando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  /** Escolher arquivo NÃO envia: põe na fila para o cliente dizer o que é. */
  function escolher(lista: FileList | File[]) {
    const novos = Array.from(lista).map((arquivo) => ({
      arquivo,
      papel: (sugerirPapel(arquivo.name, arquivo.type) ?? "") as Papel | "",
    }));
    if (novos.length === 0) return;
    setErro(null);
    setFila((atual) => [...atual, ...novos]);
    if (inputRef.current) inputRef.current.value = "";
  }

  const faltaDizer = fila.filter((f) => !f.papel).length;

  async function enviar() {
    if (fila.length === 0) return;
    // TRAVA, não aviso: sem papel declarado o envio não sai. O `disabled` do
    // botão é aparência — teclado e leitor de tela passam por cima dele.
    if (faltaDizer > 0) {
      setErro(
        faltaDizer === 1
          ? "Falta dizer o que é 1 arquivo. Sem isso a equipe não pode usá-lo na sua peça."
          : `Falta dizer o que são ${faltaDizer} arquivos. Sem isso a equipe não pode usá-los nas suas peças.`,
      );
      return;
    }

    setErro(null);
    setEnviando(true);

    // Um de cada vez, de propósito: vídeo de celular é grande, e mandar cinco
    // em paralelo de uma rede de celular derruba os cinco.
    const restantes: NaFila[] = [];
    for (const item of fila) {
      const form = new FormData();
      form.append("file", item.arquivo);
      // O PAPEL VAI JUNTO DOS BYTES. É isto que faz o arquivo chegar na peça.
      form.append("papel", item.papel);
      // A4: sem token (URL limpa), o cookie httpOnly vai junto do fetch.
      if (token) form.append("token", token);
      try {
        const res = await fetch("/api/media", { method: "POST", body: form });
        const dados = await res.json();
        if (!res.ok) {
          // A mensagem vem do servidor já em linguagem de gente.
          setErro(dados.error ?? "Não consegui enviar esse arquivo.");
          restantes.push(item);
          continue;
        }
        // O servidor diz se o arquivo virou material de marca de verdade. A tela
        // NÃO promete por conta própria: se o registro falhou, quem enviou
        // precisa saber que a equipe recebeu o arquivo mas não pode usá-lo.
        const reg = dados.materialDeMarca;
        if (reg && reg.registrado === false) {
          setErro(reg.motivo ?? "Recebemos o arquivo, mas ele ainda não pode ser usado na sua peça.");
        }
        setEnviados((atual) => [...atual, { ...dados.arquivo, papel: reg?.papel }]);
        aoEnviar?.(dados.arquivo);
      } catch {
        setErro("A conexão caiu no meio do envio. Tente de novo — o que já subiu não se perde.");
        restantes.push(item);
      }
    }
    // O que falhou continua na fila, com o papel já escolhido: quem tentar de
    // novo não redigita nada.
    setFila(restantes);
    setEnviando(false);
  }

  return (
    <div className="bg-white rounded-[14px] border border-[var(--border)] p-5 shadow-[0_1px_3px_rgba(7,10,31,0.04)]">
      <h3 className="text-[14px] font-semibold text-[var(--text-primary)]">Enviar fotos e vídeos</h3>
      <p className="mt-1 text-[12px] leading-snug text-[var(--text-secondary)]">
        Escolha do seu celular ou computador e diga o que é cada arquivo — é assim que ele entra nas suas peças.
        Aceita foto, vídeo, PDF e documento, até 120 MB cada.
      </p>

      <div
        onDragOver={(e) => { e.preventDefault(); setArrastando(true); }}
        onDragLeave={() => setArrastando(false)}
        onDrop={(e) => { e.preventDefault(); setArrastando(false); escolher(e.dataTransfer.files); }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") inputRef.current?.click(); }}
        className={`mt-3 cursor-pointer rounded-[12px] border-2 border-dashed px-4 py-7 text-center transition-colors ${
          arrastando ? "border-[#12B5AC] bg-[#12B5AC]/5" : "border-[var(--border)] hover:border-[#12B5AC]"
        }`}
      >
        <p className="text-[14px] font-semibold text-[var(--text-primary)]">
          Toque para escolher os arquivos
        </p>
        <p className="mt-1 text-[12px] text-[var(--text-secondary)]">ou arraste e solte aqui</p>
      </div>

      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        accept="image/*,video/*,application/pdf,.docx,.pptx,.txt,.csv"
        onChange={(e) => { if (e.target.files) escolher(e.target.files); }}
      />

      {/* ── A FILA: onde o cliente diz o que é cada coisa ─────────────────── */}
      {fila.length > 0 && (
        <div className="mt-4">
          <p className="text-[12px] font-semibold uppercase tracking-[0.05em] text-[var(--text-muted)]">
            O que é cada arquivo?
          </p>
          <ul className="mt-2 space-y-2">
            {fila.map((item, i) => (
              <li
                key={`${item.arquivo.name}-${i}`}
                className="rounded-[10px] border border-[var(--border)] bg-[#F7F7F6] px-3 py-2.5"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-[var(--text-primary)]">
                    {item.arquivo.name}
                  </span>
                  <span className="shrink-0 text-[12px] text-[var(--text-muted)]">
                    {tamanhoLegivel(item.arquivo.size)}
                  </span>
                  <button
                    type="button"
                    onClick={() => setFila((a) => a.filter((_, j) => j !== i))}
                    aria-label={`Tirar ${item.arquivo.name} da lista`}
                    className="shrink-0 rounded-[6px] px-2 py-1 text-[12px] text-[var(--text-muted)] hover:bg-white hover:text-[var(--text-primary)]"
                  >
                    Tirar
                  </button>
                </div>
                <select
                  value={item.papel}
                  aria-label={`O que é ${item.arquivo.name}?`}
                  onChange={(e) =>
                    setFila((a) => a.map((f, j) => (j === i ? { ...f, papel: e.target.value as Papel | "" } : f)))
                  }
                  className={`mt-2 h-11 w-full rounded-[8px] border bg-white px-3 text-[13px] text-[var(--text-primary)] ${
                    item.papel ? "border-[var(--border)]" : "border-[#F0A202]"
                  }`}
                >
                  <option value="">Escolha o que é este arquivo…</option>
                  {PAPEIS_VALIDOS.map((p) => (
                    <option key={p} value={p}>{PAPEIS[p].rotulo}</option>
                  ))}
                </select>
                {item.papel && (
                  <p className="mt-1.5 text-[12px] leading-snug text-[var(--text-secondary)]">
                    {PAPEIS[item.papel].ajuda}
                  </p>
                )}
              </li>
            ))}
          </ul>

          {faltaDizer > 0 && (
            <p className="mt-3 rounded-[8px] bg-[#FFFBEB] px-3 py-2 text-[12px] leading-snug text-[#92400E]">
              Falta dizer o que {faltaDizer === 1 ? "é 1 arquivo" : `são ${faltaDizer} arquivos`}. A equipe só
              consegue usar na sua peça o que estiver identificado.
            </p>
          )}

          <button
            type="button"
            onClick={() => void enviar()}
            disabled={enviando}
            className="mt-3 h-11 w-full rounded-[8px] bg-[#12B5AC] px-4 text-[14px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {enviando
              ? "Enviando…"
              : `Enviar ${fila.length} ${fila.length === 1 ? "arquivo" : "arquivos"}`}
          </button>
        </div>
      )}

      {erro && (
        <p className="mt-3 rounded-[8px] bg-[#FEF2F2] px-3 py-2 text-[12px] leading-snug text-[#B91C1C]">{erro}</p>
      )}

      {enviados.length > 0 && (
        <div className="mt-4">
          <p className="text-[12px] font-semibold uppercase tracking-[0.05em] text-[var(--text-muted)]">
            Recebemos {enviados.length} {enviados.length === 1 ? "arquivo" : "arquivos"}
          </p>
          <ul className="mt-2 space-y-1.5">
            {enviados.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 rounded-[8px] bg-[#F7F7F6] px-3 py-2">
                <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--text-primary)]">
                  {a.fileName}
                  {a.papel && (
                    <span className="text-[var(--text-muted)]"> · {PAPEIS[a.papel].rotulo}</span>
                  )}
                </span>
                <span className="shrink-0 text-[12px] text-[var(--text-muted)]">{tamanhoLegivel(a.sizeBytes)}</span>
                <span className="shrink-0 text-[13px] text-[var(--teal-text)]" aria-label="enviado">✓</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[12px] leading-snug text-[var(--text-secondary)]">
            A equipe já foi avisada e pode usar este material nas suas peças. Pode fechar esta página — não perde nada.
          </p>
        </div>
      )}
    </div>
  );
}

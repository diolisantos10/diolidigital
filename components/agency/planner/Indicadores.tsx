"use client";

// Os sinais pequenos do Planner: rede, estado, miniatura e visibilidade.
// Um arquivo só porque os quatro aparecem em TODAS as vistas (chip do dia,
// painel do dia, lista, editor) e precisam dizer a mesma coisa nas quatro.

import { NETWORK_MAP, metaDoStatus } from "./tipos";

export function NetworkDot({ id, sm }: { id: string; sm?: boolean }) {
  const n = NETWORK_MAP[id];
  const size = sm ? 8 : 14;
  if (!n) return null;
  return sm ? (
    <span
      className="rounded-full shrink-0"
      style={{ width: size, height: size, background: n.color }}
      title={n.label}
      aria-label={n.label}
      role="img"
    />
  ) : (
    <span
      className="rounded-full shrink-0 flex items-center justify-center text-white font-bold"
      style={{ width: size, height: size, background: n.color, fontSize: 7 }}
      title={n.label}
      aria-label={n.label}
      role="img"
    >
      {n.short.slice(0, 2)}
    </span>
  );
}

/** A etiqueta de estado. Glifo + texto — cor nunca é o único sinal (§2.4). */
export function StatusPill({ status, sm }: { status: string; sm?: boolean }) {
  const st = metaDoStatus(status);
  return (
    <span
      className={`shrink-0 inline-flex items-center gap-1 rounded-full font-semibold ${
        sm ? "h-[18px] px-1.5 text-[10px]" : "h-[22px] px-2.5 text-[11px]"
      }`}
      style={{ background: st.bg, color: st.fg }}
      title={st.ajuda}
    >
      <span aria-hidden="true">{st.glifo}</span>
      {st.label}
    </span>
  );
}

/** A miniatura da peça. Sem arte, um quadro honesto — não um buraco. */
export function Miniatura({
  src, tamanho = 40, formato, telas = 0,
}: {
  src: string | null;
  tamanho?: number;
  formato?: string;
  telas?: number;
}) {
  return (
    <div
      className="relative shrink-0 overflow-hidden rounded-[6px] border border-[var(--border)] bg-[var(--accent)]"
      style={{ width: tamanho, height: tamanho }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" loading="lazy" className="h-full w-full object-cover" />
      ) : (
        <span
          className="flex h-full w-full items-center justify-center text-[var(--text-subtle)]"
          style={{ fontSize: Math.max(10, Math.round(tamanho / 3)) }}
          aria-hidden="true"
        >
          {formato === "carousel" ? "❏" : formato === "reel" || formato === "video" ? "▶" : "▢"}
        </span>
      )}
      {telas > 1 && (
        <span className="absolute bottom-0 right-0 rounded-tl-[5px] bg-[var(--navy)] px-1 text-[10px] font-semibold text-white">
          {telas}
        </span>
      )}
    </div>
  );
}

/** O aviso de que o cliente NÃO vê esta peça. É o defeito silencioso virando
 *  sinal na tela: sem ele, a agência programa o mês e o cliente não recebe. */
export function SinalDeVisibilidade({ visibility, comTexto }: { visibility: string; comTexto?: boolean }) {
  const oculto = visibility !== "compartilhado";
  if (!oculto) {
    return comTexto ? (
      <span className="inline-flex items-center gap-1 text-[11px] text-[var(--text-muted)]">
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--success)]" aria-hidden="true" />
        O cliente vê
      </span>
    ) : null;
  }
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-[var(--warning)]"
      title="Só a equipe vê esta peça — ela não aparece no portal do cliente."
    >
      <span className="h-1.5 w-1.5 rounded-full bg-[var(--warning)]" aria-hidden="true" />
      {comTexto ? "Só a equipe vê" : <span className="sr-only">Só a equipe vê</span>}
    </span>
  );
}

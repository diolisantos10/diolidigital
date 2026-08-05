"use client";

// O chip de uma peça dentro de um dia do calendário.
//
// Três coisas que ele passou a mostrar e antes não mostrava:
//   1. MINIATURA — o portal do cliente já mostrava imagem e a agência, não. Um
//      calendário editorial sem arte é uma planilha: quem monta o mês precisa
//      ver o mês, não ler 20 legendas truncadas.
//   2. O ESTADO por glifo, além da cor de fundo (DESIGN.md §2.4).
//   3. O SINAL DE OCULTO — peça que o cliente não vê é a falha mais cara desta
//      tela, e ela era invisível justamente aqui.
//
// Arrastar: `draggable` é MELHORIA de mouse. O caminho acessível (teclado,
// leitor de tela, celular) continua sendo abrir a peça e trocar a data — por
// isso o chip é um <button> de verdade, não um <div> arrastável.

import { metaDoStatus } from "./tipos";
import { Miniatura, NetworkDot } from "./Indicadores";

export function PostChip({
  post, onClick, selecionado, modoSelecao, onDragStart, onDragEnd,
}: {
  post: {
    id: string; caption: string; networks: string[]; status: string;
    mediaUrl: string | null; telas: string[]; format: string; visibility: string;
  };
  onClick: () => void;
  selecionado?: boolean;
  modoSelecao?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: () => void;
}) {
  const st = metaDoStatus(post.status);
  const oculto = post.visibility !== "compartilhado";
  return (
    <button
      type="button"
      onClick={onClick}
      draggable={!modoSelecao}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      aria-pressed={modoSelecao ? !!selecionado : undefined}
      // O contorno tracejado é o sinal de "o cliente não vê" dentro da célula do
      // calendário: um ícone a mais aqui come justamente a largura da legenda, e
      // legenda ilegível é o que fazia esta tela parecer pobre. O texto do
      // estado vive no `title`, no painel do dia e na lista.
      title={`${st.label}${oculto ? " · só a equipe vê" : ""} — ${post.caption || "Sem legenda"}`}
      className="w-full flex items-center gap-1.5 px-1 py-1 rounded-[6px] text-left transition-all hover:brightness-[0.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--ring)]"
      style={{
        background: st.bg,
        border: oculto
          ? "1px dashed color-mix(in srgb, var(--warning) 60%, transparent)"
          : "1px solid transparent",
        boxShadow: selecionado ? "0 0 0 2px var(--navy)" : undefined,
        cursor: modoSelecao ? "pointer" : "grab",
      }}
    >
      {oculto && <span className="sr-only">Só a equipe vê. </span>}
      {modoSelecao && (
        <span
          className="shrink-0 w-3.5 h-3.5 rounded-[4px] flex items-center justify-center text-[9px] text-white"
          style={{
            background: selecionado ? "var(--navy)" : "var(--card)",
            border: "1px solid var(--border-strong)",
          }}
          aria-hidden="true"
        >
          {selecionado ? "✓" : ""}
        </span>
      )}
      <Miniatura src={post.mediaUrl} tamanho={20} formato={post.format} telas={post.telas.length} />
      <span className="min-w-0 flex-1 truncate text-[11px] font-medium leading-tight" style={{ color: st.fg }}>
        <span aria-hidden="true" className="mr-0.5">{st.glifo}</span>
        {post.caption || "Sem legenda"}
      </span>
      <span className="hidden xl:flex items-center gap-0.5 shrink-0">
        {post.networks.slice(0, 2).map((n) => <NetworkDot key={n} id={n} sm />)}
      </span>
    </button>
  );
}

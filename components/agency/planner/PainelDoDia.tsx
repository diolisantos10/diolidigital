"use client";

// PainelDoDia — tudo o que está marcado para um dia, sem teto.
//
// Por que existe: a célula do calendário mostrava 3 peças e escrevia
// "+2 mais" numa <div> inerte. Do quarto post em diante o conteúdo do dia
// simplesmente não tinha caminho pelo calendário — trabalho feito, invisível e
// inalcançável. Agora "+N mais" (e o número do dia) abrem esta lista completa.

import { LinhaDePeca, type PecaDaLinha } from "./LinhaDePeca";
import { CascaDeModal } from "./CascaDeModal";
import { WEEKDAYS, MONTHS } from "./tipos";

export function PainelDoDia({
  dia, posts, nomeDoCliente, onAbrir, onNovo, onClose, modoSelecao, selecionados, onSelecionar,
}: {
  /** Chave local YYYY-MM-DD. */
  dia: string;
  posts: PecaDaLinha[];
  nomeDoCliente: (id: string | null) => string;
  onAbrir: (id: string) => void;
  onNovo: () => void;
  onClose: () => void;
  modoSelecao?: boolean;
  selecionados?: Set<string>;
  onSelecionar?: (id: string) => void;
}) {
  const [y, m, d] = dia.split("-").map(Number);
  const data = new Date(y!, (m ?? 1) - 1, d ?? 1);
  const titulo = `${WEEKDAYS[data.getDay()]}, ${data.getDate()} de ${MONTHS[data.getMonth()]}`;

  return (
    <CascaDeModal
      titulo={titulo}
      descricao={posts.length === 1 ? "1 peça neste dia" : `${posts.length} peças neste dia`}
      onClose={onClose}
      largura="520px"
      rodape={
        <button
          type="button"
          onClick={onNovo}
          className="h-9 w-full rounded-[8px] text-[12.5px] font-semibold text-white transition-opacity hover:opacity-90"
          style={{ background: "var(--primary)" }}
        >
          + Novo post neste dia
        </button>
      }
    >
      {posts.length === 0 ? (
        <div className="px-5 py-10 text-center">
          <p className="text-[13px] font-semibold text-[var(--text-primary)]">Nada programado neste dia</p>
          <p className="mt-1 text-[12px] text-[var(--text-muted)]">
            Use o botão abaixo para criar a primeira peça desta data.
          </p>
        </div>
      ) : (
        <div className="divide-y" style={{ borderColor: "var(--border)" }}>
          {posts.map((p) => (
            <LinhaDePeca
              key={p.id}
              post={p}
              subtitulo={nomeDoCliente(p.clientId)}
              modoSelecao={modoSelecao}
              selecionado={selecionados?.has(p.id)}
              onClick={() => (modoSelecao && onSelecionar ? onSelecionar(p.id) : onAbrir(p.id))}
            />
          ))}
        </div>
      )}
    </CascaDeModal>
  );
}

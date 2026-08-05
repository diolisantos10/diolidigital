"use client";

// A casca dos diálogos do Planner — uma só, com o que os modais "na mão" desta
// tela não tinham: ESC fecha, o foco entra e fica preso dentro, `role="dialog"`
// e `aria-modal` para o leitor de tela, e o fundo não rola atrás.
//
// (O ideal do DESIGN.md §4.1 é o `Dialog` do shadcn; enquanto ele não está
// instalado no repositório, esta casca é o mesmo contrato num lugar só — e não
// 3 modais cada um com o seu jeito de fechar.)

import { useEffect, useRef } from "react";

const FOCAVEIS =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

export function CascaDeModal({
  titulo, descricao, onClose, children, rodape, largura = "560px",
}: {
  titulo: string;
  descricao?: string;
  onClose: () => void;
  children: React.ReactNode;
  rodape?: React.ReactNode;
  largura?: string;
}) {
  const caixa = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const anterior = document.activeElement as HTMLElement | null;
    const alvo = caixa.current;
    // O primeiro campo recebe o foco — quem abre o diálogo pelo teclado já
    // começa dentro dele, não no fim da página atrás.
    alvo?.querySelector<HTMLElement>(FOCAVEIS)?.focus();

    function aoTeclar(e: KeyboardEvent) {
      if (e.key === "Escape") { e.stopPropagation(); onClose(); return; }
      if (e.key !== "Tab" || !alvo) return;
      const itens = [...alvo.querySelectorAll<HTMLElement>(FOCAVEIS)].filter((el) => el.offsetParent !== null);
      if (itens.length === 0) return;
      const primeiro = itens[0]!;
      const ultimo = itens[itens.length - 1]!;
      if (e.shiftKey && document.activeElement === primeiro) { e.preventDefault(); ultimo.focus(); }
      else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primeiro.focus(); }
    }
    document.addEventListener("keydown", aoTeclar);
    const overflowAntes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", aoTeclar);
      document.body.style.overflow = overflowAntes;
      anterior?.focus?.();
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        ref={caixa}
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        className="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-[16px] bg-white shadow-[var(--shadow-xl)] sm:rounded-[16px]"
        style={{ maxWidth: largura }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex shrink-0 items-start justify-between gap-3 px-5 py-4"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <div className="min-w-0">
            <h2 className="text-[16px] font-semibold text-[var(--text-primary)]">{titulo}</h2>
            {descricao && <p className="mt-0.5 text-[12px] text-[var(--text-muted)]">{descricao}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-[var(--accent)]"
          >
            ✕
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>

        {rodape && (
          <div
            className="shrink-0 bg-white px-5 py-3.5"
            style={{ borderTop: "1px solid var(--border)" }}
          >
            {rodape}
          </div>
        )}
      </div>
    </div>
  );
}

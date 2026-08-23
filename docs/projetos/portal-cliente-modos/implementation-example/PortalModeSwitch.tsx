"use client";

import { useEffect, useState } from "react";

export type PortalViewMode = "basic" | "advanced";

const STORAGE_KEY = "dioli.portal.view-mode.v1";

function isMode(value: string | null): value is PortalViewMode {
  return value === "basic" || value === "advanced";
}

export function PortalModeSwitch({
  initialMode = "basic",
  onChange,
}: {
  initialMode?: PortalViewMode;
  onChange?: (mode: PortalViewMode) => void;
}) {
  const [mode, setMode] = useState<PortalViewMode>(initialMode);

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (isMode(saved)) setMode(saved);
  }, []);

  function choose(next: PortalViewMode) {
    setMode(next);
    window.localStorage.setItem(STORAGE_KEY, next);
    onChange?.(next);
  }

  return (
    <section aria-labelledby="portal-view-mode-title">
      <div>
        <strong id="portal-view-mode-title">Como voce quer ver seu portal?</strong>
        <span>Voce pode mudar quando quiser.</span>
      </div>
      <div role="group" aria-label="Modo de visualizacao do portal">
        <button type="button" aria-pressed={mode === "basic"} onClick={() => choose("basic")}>
          Basico
        </button>
        <button type="button" aria-pressed={mode === "advanced"} onClick={() => choose("advanced")}>
          Avancado
        </button>
      </div>
    </section>
  );
}

// Referencia, nao implementacao final:
// 1. No produto, prefira a preferencia persistida por usuario no servidor.
// 2. Nao duplique fetches nem componentes de dominio.
// 3. Use os tokens e componentes do portal real.

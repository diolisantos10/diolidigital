"use client";

// Generates a SECURE, expiring portal link (PortalAccess token) on demand and
// opens + copies it. Replaces the legacy insecure /portal/[clientId] links that
// exposed an unauthenticated, guessable client portal.
//
// Pass clientRequestId when you have the request, or clientId otherwise (the
// API resolves the latest request for that client). Provide `children` to wrap
// custom content (e.g. a status badge) instead of the default label.

import { useState } from "react";

interface SecurePortalLinkButtonProps {
  clientId?: string;
  clientRequestId?: string;
  label?: string;
  className?: string;
  children?: React.ReactNode;
  /** Open the link in a new tab on success (default true). */
  openOnGenerate?: boolean;
}

export function SecurePortalLinkButton({
  clientId,
  clientRequestId,
  label = "Portal seguro ↗",
  className,
  children,
  openOnGenerate = true,
}: SecurePortalLinkButtonProps) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");

  async function generate() {
    if (state === "loading") return;
    setState("loading");
    try {
      const res = await fetch("/api/brain/portal-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(clientRequestId ? { clientRequestId } : { clientId }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = (await res.json()) as { url?: string };
      if (!j.url) throw new Error("no url");
      const full = `${window.location.origin}${j.url}`;
      if (openOnGenerate) window.open(full, "_blank", "noopener");
      try { await navigator.clipboard.writeText(full); } catch { /* clipboard optional */ }
      setState("done");
      setTimeout(() => setState("idle"), 2500);
    } catch {
      setState("error");
      setTimeout(() => setState("idle"), 2500);
    }
  }

  const text =
    state === "loading" ? "Gerando…"
    : state === "done"  ? "Link copiado ✓"
    : state === "error" ? "Erro — tente de novo"
    : label;

  return (
    <button onClick={generate} disabled={state === "loading"} className={className} title="Gera um link seguro e único do portal e copia para a área de transferência">
      {children ?? text}
    </button>
  );
}

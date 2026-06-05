"use client";

import { useState, useEffect } from "react";

export interface AiProviderStatus {
  openaiConfigured: boolean | undefined; // undefined = not yet resolved
  loading: boolean;
}

// Reads non-secret AI provider status from the server (GET /api/ai/run).
// Never receives or exposes the API key — only a boolean.
export function useAiProviderStatus(): AiProviderStatus {
  const [openaiConfigured, setOpenaiConfigured] = useState<boolean | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/ai/run")
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data: { openaiConfigured?: boolean }) => {
        if (!cancelled) setOpenaiConfigured(!!data.openaiConfigured);
      })
      .catch(() => {
        if (!cancelled) setOpenaiConfigured(undefined);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  return { openaiConfigured, loading };
}

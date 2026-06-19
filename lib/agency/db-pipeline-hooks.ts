"use client";

// Operational UI Bridge — client-side hooks that connect each department page
// to the real DB pipeline (ClientRequestDb + brain artifacts) via the same API
// endpoints the rest of the app uses. These run ALONGSIDE the existing Zustand
// store flows; they do not replace them.

import { useCallback, useEffect, useState } from "react";

// ── DB record shapes (mirror the API responses) ───────────────────────────────

export interface DbRequest {
  id: string;
  businessName: string;
  segment: string | null;
  services: string;      // JSON array
  objectives: string;    // JSON array
  rawContext: string;
  status: string;
  briefingJson: string | null;
  sdrHandoffJson: string | null;
  createdAt: string;
}

export interface DbArtifact {
  id: string;
  clientRequestId: string;
  department: string;
  canvasId: string;
  canvasJson: string;   // JSON-encoded canvas object
  qualityGateJson: string | null;
  version: number;
  status: string;
  approvedAt: string;
  approvedBy: string | null;
}

// ── JSON parse utility ─────────────────────────────────────────────────────────

export function parseJson<T>(json: string | null | undefined, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

// ── useDbRequests — fetch client requests filtered by status ──────────────────

export function useDbRequests(status: string) {
  const [requests, setRequests] = useState<DbRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/brain/client-requests?status=${encodeURIComponent(status)}&limit=50`,
      );
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ao carregar solicitações.`);
      }
      const data = await res.json();
      const list: DbRequest[] = Array.isArray(data)
        ? data
        : Array.isArray(data?.requests)
          ? data.requests
          : Array.isArray(data?.data)
            ? data.data
            : [];
      setRequests(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar solicitações.");
      setRequests([]);
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { requests, loading, error, reload };
}

// ── useDbArtifacts — fetch all artifacts for one request, keyed by department ──

export function useDbArtifacts(clientRequestId: string | null) {
  const [byDept, setByDept] = useState<Record<string, DbArtifact>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!clientRequestId) {
      setByDept({});
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/brain/artifacts?clientRequestId=${encodeURIComponent(clientRequestId)}`,
      );
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ao carregar artifacts.`);
      }
      const data = await res.json();
      const list: DbArtifact[] = Array.isArray(data)
        ? data
        : Array.isArray(data?.artifacts)
          ? data.artifacts
          : Array.isArray(data?.data)
            ? data.data
            : [];
      const map: Record<string, DbArtifact> = {};
      // Keep the highest-version artifact per department.
      for (const art of list) {
        const existing = map[art.department];
        if (!existing || (art.version ?? 0) >= (existing.version ?? 0)) {
          map[art.department] = art;
        }
      }
      setByDept(map);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar artifacts.");
      setByDept({});
    } finally {
      setLoading(false);
    }
  }, [clientRequestId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const getCanvas = useCallback(
    <T,>(dept: string): T | null => {
      const art = byDept[dept];
      if (!art) return null;
      return parseJson<T | null>(art.canvasJson, null);
    },
    [byDept],
  );

  return { byDept, loading, error, reload, getCanvas };
}

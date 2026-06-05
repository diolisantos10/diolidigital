"use client";

import { useState, useEffect, useCallback } from "react";
import { useAgencyStore } from "@/store/agency-store";
import type { AIRunLog } from "@/store/agency-store";
import { dbAIRunLogToStore, type DbAIRunLog } from "@/lib/db/adapters";

export type DataSource = "db" | "local";

export interface UseDbAIRunLogsResult {
  logs: AIRunLog[];
  source: DataSource;
  loading: boolean;
  save: (log: AIRunLog) => Promise<void>;
  refetch: () => void;
}

export function useDbAIRunLogs(options?: { departmentId?: string; limit?: number }): UseDbAIRunLogsResult {
  const { aiRunLogs: storeLogs, addAIRunLog } = useAgencyStore();

  const [dbLogs, setDbLogs]   = useState<AIRunLog[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [source, setSource]   = useState<DataSource>("local");

  const params = new URLSearchParams();
  if (options?.departmentId) params.set("departmentId", options.departmentId);
  if (options?.limit)        params.set("limit", String(options.limit));
  const url = `/api/ai-run-logs${params.toString() ? `?${params}` : ""}`;

  const fetchFromDb = useCallback(() => {
    setLoading(true);
    fetch(url)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data: DbAIRunLog[]) => {
        setDbLogs(data.map(dbAIRunLogToStore));
        setSource("db");
      })
      .catch(() => {
        setSource("local");
        setDbLogs(null);
      })
      .finally(() => setLoading(false));
  }, [url]);

  useEffect(() => { fetchFromDb(); }, [fetchFromDb]);

  // Merge: prefer DB when available, fall back to local store (filtered).
  const logs: AIRunLog[] = dbLogs !== null
    ? dbLogs
    : storeLogs.filter((l) => {
        if (options?.departmentId && l.departmentId !== options.departmentId) return false;
        return true;
      }).slice(0, options?.limit ?? 100);

  // save: writes to local store (always) and to DB (if connected).
  const save = useCallback(async (log: AIRunLog) => {
    // Local store is the source of truth — it already contains the log from
    // runDepartmentIntelligence. We only need to persist it to DB when connected.
    if (source === "db") {
      try {
        const res = await fetch("/api/ai-run-logs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(log),
        });
        if (res.ok) {
          const raw: DbAIRunLog = await res.json();
          const saved = dbAIRunLogToStore(raw);
          setDbLogs((prev) => (prev ? [saved, ...prev] : [saved]));
        }
      } catch { /* local store already has the log */ }
    }
  }, [source]);

  return { logs, source, loading, save, refetch: fetchFromDb };
}

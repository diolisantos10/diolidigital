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

  // ⚠️ `save()` FOI REMOVIDO em 06/08/2026, junto com o `POST /api/ai-run-logs`.
  //
  // Ele era o ÚNICO escritor do `AIRunLog` no código — e nenhum arquivo o
  // chamava. Por isso a tabela estava vazia em produção desde sempre.
  //
  // Agora `AIRunLog` é o LIVRO-CAIXA da IA da casa (tokens e custo estimado por
  // chamada), e quem escreve nele é o servidor, dentro de `lib/ai/generate.ts`,
  // no exato instante da chamada. Deixar uma rota POST aberta ao navegador
  // permitiria a qualquer sessão inventar linhas no relatório de gasto — o log
  // deixaria de ser prova de qualquer coisa. Esta é uma leitura, e só.

  return { logs, source, loading, refetch: fetchFromDb };
}

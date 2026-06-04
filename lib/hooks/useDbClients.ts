"use client";

import { useState, useEffect, useCallback } from "react";
import { useAgencyStore } from "@/store/agency-store";
import type { Client } from "@/lib/agency/mock-data";
import { dbClientToMock, type DbClient } from "@/lib/db/adapters";

export type DataSource = "db" | "local";

export interface UseDbClientsResult {
  clients: Client[];
  loading: boolean;
  source: DataSource;
  dbCount: number;
  refetch: () => void;
}

export function useDbClients(): UseDbClientsResult {
  const storeClients = useAgencyStore((s) => s.clients);
  const [dbClients, setDbClients] = useState<Client[] | null>(null);
  const [loading, setLoading]     = useState(true);
  const [source, setSource]       = useState<DataSource>("local");

  const fetchFromDb = useCallback(() => {
    setLoading(true);
    fetch("/api/clients")
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data: DbClient[]) => {
        setDbClients(data.map(dbClientToMock));
        setSource("db");
      })
      .catch(() => setSource("local"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchFromDb(); }, [fetchFromDb]);

  return {
    clients: dbClients ?? storeClients,
    loading,
    source,
    dbCount: dbClients?.length ?? 0,
    refetch: fetchFromDb,
  };
}

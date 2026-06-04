"use client";

import { useState, useEffect, useCallback } from "react";
import { useAgencyStore } from "@/store/agency-store";
import type { BrandBrain } from "@/lib/agency/mock-data";
import { dbBrandBrainToMock, type DbBrandBrain } from "@/lib/db/adapters";

export type DataSource = "db" | "local";

export interface UseDbBrandHubResult {
  brandBrain: BrandBrain | undefined;
  source: DataSource;
  loading: boolean;
  update: (clientId: string, brain: BrandBrain) => Promise<void>;
  refetch: () => void;
}

export function useDbBrandHub(clientId: string): UseDbBrandHubResult {
  const { clients, updateClient } = useAgencyStore();
  const storeBrain = clients.find((c) => c.id === clientId)?.brandBrain;

  const [dbBrain, setDbBrain] = useState<BrandBrain | null>(null);
  const [loading, setLoading] = useState(true);
  const [source, setSource]   = useState<DataSource>("local");

  const fetchFromDb = useCallback(() => {
    if (!clientId) return;
    setLoading(true);
    fetch(`/api/clients/${clientId}/brand-brain`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data: DbBrandBrain | null) => {
        if (data) {
          setDbBrain(dbBrandBrainToMock(data, storeBrain));
          setSource("db");
        } else {
          // Brand brain not yet created in DB — local data is canonical
          setSource("local");
        }
      })
      .catch(() => setSource("local"))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  useEffect(() => { fetchFromDb(); }, [fetchFromDb]);

  // Merged brain: DB provides its partial overlay over store brain
  const brandBrain = dbBrain ?? storeBrain;

  const update = useCallback(async (cid: string, brain: BrandBrain) => {
    // Always update local store immediately
    updateClient(cid, { brandBrain: brain });
    // Persist to DB if available
    if (source === "db") {
      try {
        const res = await fetch(`/api/clients/${cid}/brand-brain`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(brain),
        });
        if (res.ok) {
          const raw: DbBrandBrain = await res.json();
          setDbBrain(dbBrandBrainToMock(raw, brain));
        }
      } catch { /* keep local update */ }
    }
  }, [source, updateClient]);

  return { brandBrain, source, loading, update, refetch: fetchFromDb };
}

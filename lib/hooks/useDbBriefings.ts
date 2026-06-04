"use client";

import { useState, useEffect, useCallback } from "react";
import { useAgencyStore } from "@/store/agency-store";
import type { Briefing, BriefingStatus } from "@/lib/agency/mock-data";
import { dbBriefingToMock, type DbBriefing } from "@/lib/db/adapters";

export type DataSource = "db" | "local";

function isDbId(id: string): boolean { return id.length > 12; }

export interface UseDbBriefingsResult {
  briefings: Briefing[];
  source: DataSource;
  loading: boolean;
  createBriefing: (data: Omit<Briefing, "id" | "createdAt">) => Promise<Briefing | null>;
  updateStatus: (id: string, status: BriefingStatus) => void;
  refetch: () => void;
}

export function useDbBriefings(options?: { projectId?: string; clientId?: string }): UseDbBriefingsResult {
  const {
    briefings: storeBriefings,
    createBriefing: storeCreate,
    updateBriefingStatus: storeUpdateStatus,
  } = useAgencyStore();

  const [dbBriefings, setDbBriefings] = useState<Briefing[] | null>(null);
  const [loading, setLoading]         = useState(true);
  const [source, setSource]           = useState<DataSource>("local");

  const params = new URLSearchParams();
  if (options?.projectId) params.set("projectId", options.projectId);
  if (options?.clientId)  params.set("clientId",  options.clientId);
  const url = `/api/briefings${params.toString() ? `?${params}` : ""}`;

  const fetchFromDb = useCallback(() => {
    setLoading(true);
    fetch(url)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data: DbBriefing[]) => {
        setDbBriefings(data.map(dbBriefingToMock));
        setSource("db");
      })
      .catch(() => setSource("local"))
      .finally(() => setLoading(false));
  }, [url]);

  useEffect(() => { fetchFromDb(); }, [fetchFromDb]);

  // Merge: DB-first, then store briefings not already in DB
  const dbIdSet = new Set((dbBriefings ?? []).map((b) => b.id));
  const storeFiltered = storeBriefings.filter((b) => {
    if (dbIdSet.has(b.id)) return false;
    if (options?.projectId && b.projectId !== options.projectId) return false;
    if (options?.clientId  && b.clientId  !== options.clientId)  return false;
    return true;
  });
  const briefings = [...(dbBriefings ?? []), ...storeFiltered];

  const createBriefing = useCallback(async (data: Omit<Briefing, "id" | "createdAt">): Promise<Briefing | null> => {
    if (source !== "db") {
      const id = storeCreate(data);
      return storeBriefings.find((b) => b.id === id) ?? null;
    }
    try {
      const res = await fetch("/api/briefings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        // Fallback to store on failure
        storeCreate(data);
        return null;
      }
      const raw: DbBriefing = await res.json();
      const created = dbBriefingToMock(raw);
      setDbBriefings((prev) => (prev ? [created, ...prev] : [created]));
      return created;
    } catch {
      storeCreate(data);
      return null;
    }
  }, [source, storeCreate, storeBriefings]);

  const updateStatus = useCallback((id: string, status: BriefingStatus) => {
    if (isDbId(id) && source === "db") {
      setDbBriefings((prev) =>
        prev ? prev.map((b) => (b.id === id ? { ...b, status } : b)) : prev
      );
      fetch(`/api/briefings/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      }).catch(() => fetchFromDb());
    } else {
      storeUpdateStatus(id, status);
    }
  }, [source, storeUpdateStatus, fetchFromDb]);

  return { briefings, source, loading, createBriefing, updateStatus, refetch: fetchFromDb };
}

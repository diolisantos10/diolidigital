"use client";

import { useState, useEffect, useCallback } from "react";
import { useAgencyStore } from "@/store/agency-store";
import type { Deliverable, DeliverableStatus } from "@/lib/agency/mock-data";
import { dbDeliverableToMock, type DbDeliverable } from "@/lib/db/adapters";

export type DataSource = "db" | "local";

function isDbId(id: string): boolean { return id.length > 12; }

export interface UseDbDeliverablesResult {
  deliverables: Deliverable[];
  source: DataSource;
  loading: boolean;
  updateStatus: (id: string, status: DeliverableStatus) => void;
  setFeedback: (id: string, feedback: string) => void;
  resolveRevision: (id: string) => void;
  createDeliverable: (d: { projectId: string; name: string; type: string; status?: string; ownerAgentId?: string; content?: string }) => Promise<Deliverable | null>;
  refetch: () => void;
}

export function useDbDeliverables(projectId?: string): UseDbDeliverablesResult {
  const {
    deliverables: storeDeliverables,
    updateDeliverableStatus: storeUpdateStatus,
    setDeliverableFeedback: storeSetFeedback,
    resolveDeliverableRevision: storeResolveRevision,
    addDeliverable: storeAdd,
  } = useAgencyStore();

  const [dbDeliverables, setDbDeliverables] = useState<Deliverable[] | null>(null);
  const [loading, setLoading]               = useState(true);
  const [source, setSource]                 = useState<DataSource>("local");

  const url = projectId ? `/api/deliverables?projectId=${projectId}` : "/api/deliverables";

  const fetchFromDb = useCallback(() => {
    setLoading(true);
    fetch(url)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data: DbDeliverable[]) => {
        setDbDeliverables(data.map(dbDeliverableToMock));
        setSource("db");
      })
      .catch(() => setSource("local"))
      .finally(() => setLoading(false));
  }, [url]);

  useEffect(() => { fetchFromDb(); }, [fetchFromDb]);

  // Merge: DB-first, then store items not in DB
  const dbIdSet = new Set((dbDeliverables ?? []).map((d) => d.id));
  const merged: Deliverable[] = [
    ...(dbDeliverables ?? []),
    ...storeDeliverables.filter((d) => !dbIdSet.has(d.id) && (!projectId || d.projectId === projectId)),
  ];

  const updateStatus = useCallback((id: string, status: DeliverableStatus) => {
    if (isDbId(id) && source === "db") {
      setDbDeliverables((prev) =>
        prev ? prev.map((d) => d.id === id ? { ...d, status } : d) : prev
      );
      fetch(`/api/deliverables/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      }).catch(() => fetchFromDb());
    } else {
      storeUpdateStatus(id, status);
    }
  }, [source, storeUpdateStatus, fetchFromDb]);

  const setFeedback = useCallback((id: string, feedback: string) => {
    if (isDbId(id) && source === "db") {
      setDbDeliverables((prev) =>
        prev ? prev.map((d) => d.id === id ? { ...d, clientFeedback: feedback, revisionStatus: "revision_requested" as const } : d) : prev
      );
      fetch(`/api/deliverables/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientFeedback: feedback, revisionStatus: "revision_requested" }),
      }).catch(() => fetchFromDb());
    } else {
      storeSetFeedback(id, feedback);
    }
  }, [source, storeSetFeedback, fetchFromDb]);

  const resolveRevision = useCallback((id: string) => {
    if (isDbId(id) && source === "db") {
      setDbDeliverables((prev) =>
        prev ? prev.map((d) => d.id === id ? { ...d, revisionStatus: "resolved" as const } : d) : prev
      );
      fetch(`/api/deliverables/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revisionStatus: "resolved" }),
      }).catch(() => fetchFromDb());
    } else {
      storeResolveRevision(id);
    }
  }, [source, storeResolveRevision, fetchFromDb]);

  const createDeliverable = useCallback(async (d: {
    projectId: string; name: string; type: string;
    status?: string; ownerAgentId?: string; content?: string;
  }): Promise<Deliverable | null> => {
    if (source !== "db") {
      const id = storeAdd({ ...d, status: (d.status as DeliverableStatus) ?? "draft", version: 1 });
      return storeDeliverables.find((del) => del.id === id) ?? null;
    }
    try {
      const res = await fetch("/api/deliverables", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(d),
      });
      if (!res.ok) return null;
      const raw: DbDeliverable = await res.json();
      const newDel = dbDeliverableToMock(raw);
      setDbDeliverables((prev) => (prev ? [newDel, ...prev] : [newDel]));
      return newDel;
    } catch {
      return null;
    }
  }, [source, storeAdd, storeDeliverables]);

  return { deliverables: merged, source, loading, updateStatus, setFeedback, resolveRevision, createDeliverable, refetch: fetchFromDb };
}

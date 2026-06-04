"use client";

import { useState, useEffect, useCallback } from "react";
import { useAgencyStore } from "@/store/agency-store";
import type { MaterialRequest, MaterialRequestStatus } from "@/lib/agency/workspace";
import { dbMaterialRequestToMock, type DbMaterialRequest } from "@/lib/db/adapters";

export type DataSource = "db" | "local";

type DbMaterialRequestWithClientId = DbMaterialRequest & { clientId: string };

function isDbId(id: string): boolean { return id.length > 12; }

export interface UseDbMaterialRequestsResult {
  materialRequests: MaterialRequest[];
  source: DataSource;
  loading: boolean;
  updateStatus: (id: string, status: MaterialRequestStatus) => void;
  create: (req: Omit<MaterialRequest, "id" | "requestedAt">) => Promise<MaterialRequest | null>;
  refetch: () => void;
}

export function useDbMaterialRequests(options?: { projectId?: string; clientId?: string }): UseDbMaterialRequestsResult {
  const {
    materialRequests: storeRequests,
    updateMaterialRequestStatus: storeUpdateStatus,
    addMaterialRequest: storeAdd,
  } = useAgencyStore();

  const [dbRequests, setDbRequests] = useState<MaterialRequest[] | null>(null);
  const [loading, setLoading]       = useState(true);
  const [source, setSource]         = useState<DataSource>("local");

  const params = new URLSearchParams();
  if (options?.projectId) params.set("projectId", options.projectId);
  if (options?.clientId)  params.set("clientId",  options.clientId);
  const url = `/api/material-requests${params.toString() ? `?${params}` : ""}`;

  const fetchFromDb = useCallback(() => {
    setLoading(true);
    fetch(url)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data: DbMaterialRequestWithClientId[]) => {
        setDbRequests(data.map((d) => dbMaterialRequestToMock(d, d.clientId)));
        setSource("db");
      })
      .catch(() => setSource("local"))
      .finally(() => setLoading(false));
  }, [url]);

  useEffect(() => { fetchFromDb(); }, [fetchFromDb]);

  const dbIdSet = new Set((dbRequests ?? []).map((r) => r.id));
  const storeFiltered = storeRequests.filter((r) => {
    if (dbIdSet.has(r.id)) return false;
    if (options?.projectId && r.projectId !== options.projectId) return false;
    if (options?.clientId  && r.clientId  !== options.clientId)  return false;
    return true;
  });
  const merged = [...(dbRequests ?? []), ...storeFiltered];

  const updateStatus = useCallback((id: string, status: MaterialRequestStatus) => {
    if (isDbId(id) && source === "db") {
      setDbRequests((prev) =>
        prev ? prev.map((r) => r.id === id ? { ...r, status } : r) : prev
      );
      fetch(`/api/material-requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      }).catch(() => fetchFromDb());
    } else {
      storeUpdateStatus(id, status);
    }
  }, [source, storeUpdateStatus, fetchFromDb]);

  const create = useCallback(async (req: Omit<MaterialRequest, "id" | "requestedAt">): Promise<MaterialRequest | null> => {
    if (source !== "db" || !req.projectId) {
      const id = storeAdd(req);
      return storeRequests.find((r) => r.id === id) ?? null;
    }
    try {
      const res = await fetch("/api/material-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: req.projectId, title: req.title, description: req.description, status: req.status }),
      });
      if (!res.ok) return null;
      const raw: DbMaterialRequestWithClientId = await res.json();
      const newReq = dbMaterialRequestToMock(raw, raw.clientId);
      setDbRequests((prev) => (prev ? [newReq, ...prev] : [newReq]));
      return newReq;
    } catch {
      return null;
    }
  }, [source, storeAdd, storeRequests]);

  return { materialRequests: merged, source, loading, updateStatus, create, refetch: fetchFromDb };
}

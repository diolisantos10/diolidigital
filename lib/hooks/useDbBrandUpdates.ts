"use client";

import { useState, useEffect, useCallback } from "react";
import { useAgencyStore, type BrandUpdate } from "@/store/agency-store";
import { dbBrandUpdateToMock, type DbBrandUpdate } from "@/lib/db/adapters";

export type DataSource = "db" | "local";

const isMetaField = (u: BrandUpdate) =>
  u.source === "upload" || u.field === "general" || u.field === "brand_book";

export interface UseDbBrandUpdatesResult {
  brandUpdates: BrandUpdate[];
  source: DataSource;
  loading: boolean;
  add: (update: Omit<BrandUpdate, "id" | "submittedAt">) => Promise<void>;
  apply: (id: string) => void;
  dismiss: (id: string) => void;
  applyAllPending: (clientId: string) => void;
  refetch: () => void;
}

export function useDbBrandUpdates(options?: { clientId?: string }): UseDbBrandUpdatesResult {
  const {
    brandUpdates: storeUpdates,
    clients,
    addBrandUpdate: storeAdd,
    applyBrandUpdate: storeApply,
    dismissBrandUpdate: storeDismiss,
    applyAllPendingBrandUpdates: storeApplyAll,
    updateClient,
    addActivity,
  } = useAgencyStore();

  const [dbUpdates, setDbUpdates] = useState<BrandUpdate[] | null>(null);
  const [loading, setLoading]     = useState(true);
  const [source, setSource]       = useState<DataSource>("local");

  const params = new URLSearchParams();
  if (options?.clientId) params.set("clientId", options.clientId);
  const url = `/api/brand-updates${params.toString() ? `?${params}` : ""}`;

  const fetchFromDb = useCallback(() => {
    setLoading(true);
    fetch(url)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data: DbBrandUpdate[]) => {
        setDbUpdates(data.map(dbBrandUpdateToMock));
        setSource("db");
      })
      .catch(() => setSource("local"))
      .finally(() => setLoading(false));
  }, [url]);

  useEffect(() => { fetchFromDb(); }, [fetchFromDb]);

  // When DB is connected, DB is the source of truth; otherwise filtered store.
  const brandUpdates: BrandUpdate[] = dbUpdates !== null
    ? dbUpdates
    : storeUpdates.filter((u) => !options?.clientId || u.clientId === options.clientId);

  // Merge a brand-update suggestion into the client's local BrandBrain.
  const mergeIntoBrain = useCallback((upd: BrandUpdate) => {
    if (isMetaField(upd)) return;
    const client = clients.find((c) => c.id === upd.clientId);
    if (!client) return;
    updateClient(upd.clientId, {
      brandBrain: { ...(client.brandBrain ?? {}), [upd.field]: upd.suggestedValue } as typeof client.brandBrain,
    });
  }, [clients, updateClient]);

  const add = useCallback(async (update: Omit<BrandUpdate, "id" | "submittedAt">) => {
    if (source !== "db") {
      storeAdd(update);
      return;
    }
    try {
      const res = await fetch("/api/brand-updates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(update),
      });
      if (!res.ok) { storeAdd(update); return; }
      const raw: DbBrandUpdate = await res.json();
      const created = dbBrandUpdateToMock(raw);
      setDbUpdates((prev) => (prev ? [created, ...prev] : [created]));
      addActivity({
        type: "brand_update_submitted",
        message: update.source === "client"
          ? "Cliente enviou sugestão de atualização de marca"
          : "Atualização de marca enviada",
        clientId: update.clientId,
      });
    } catch {
      storeAdd(update);
    }
  }, [source, storeAdd, addActivity]);

  const apply = useCallback((id: string) => {
    const dbUpd = (dbUpdates ?? []).find((u) => u.id === id);
    if (dbUpd && source === "db") {
      mergeIntoBrain(dbUpd);
      setDbUpdates((prev) =>
        prev ? prev.map((u) => (u.id === id ? { ...u, status: "applied" } : u)) : prev
      );
      fetch(`/api/brand-updates/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "applied" }),
      }).catch(() => fetchFromDb());
      addActivity({
        type: "brand_update_applied",
        message: "Atualização de marca aplicada ao Brand Hub",
        clientId: dbUpd.clientId,
      });
    } else {
      storeApply(id);
    }
  }, [dbUpdates, source, mergeIntoBrain, storeApply, addActivity, fetchFromDb]);

  const dismiss = useCallback((id: string) => {
    const dbUpd = (dbUpdates ?? []).find((u) => u.id === id);
    if (dbUpd && source === "db") {
      setDbUpdates((prev) => (prev ? prev.filter((u) => u.id !== id) : prev));
      fetch(`/api/brand-updates/${id}`, { method: "DELETE" }).catch(() => fetchFromDb());
    } else {
      storeDismiss(id);
    }
  }, [dbUpdates, source, storeDismiss, fetchFromDb]);

  const applyAllPending = useCallback((clientId: string) => {
    if (source === "db" && dbUpdates) {
      const pending = dbUpdates.filter(
        (u) => u.clientId === clientId && u.status === "pending"
      );
      for (const upd of pending) apply(upd.id);
    } else {
      storeApplyAll(clientId);
    }
  }, [source, dbUpdates, apply, storeApplyAll]);

  return { brandUpdates, source, loading, add, apply, dismiss, applyAllPending, refetch: fetchFromDb };
}
